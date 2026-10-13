import type {
  AppSettings, Attachment, ChatMessage, ConversationSummary, ErrorInfo, Memory, ModelsResponse, ProviderStatus, RouteMeta, Source, VerifyResult,
} from '../types/api'
import { SSEParser } from './sse'

interface Cfg { baseUrl: string; token: string }
let cfgPromise: Promise<Cfg> | null = null

export class ApiError extends Error {
  constructor(public code: string, message: string, public retryable = false, public status = 0) {
    super(message)
  }
}

export function resetConfigForTests(): void { cfgPromise = null }

async function config(): Promise<Cfg> {
  cfgPromise ??= (async () => {
    if (window.friday) {
      const { config: c, error } = await window.friday.getBackendConfig()
      if (!c) throw new ApiError('backend_unavailable', error ?? 'The FRIDAY backend is not running.')
      return c
    }
    const baseUrl = import.meta.env.VITE_BACKEND_URL as string | undefined // browser-only dev fallback
    const token = import.meta.env.VITE_BACKEND_TOKEN as string | undefined
    if (!baseUrl || !token) throw new ApiError('backend_unavailable', 'Backend connection is not configured.')
    return { baseUrl, token }
  })()
  try { return await cfgPromise } catch (e) { cfgPromise = null; throw e }
}

async function toError(r: Response): Promise<ApiError> {
  try {
    const j = await r.json()
    const e = j.error ?? {}
    return new ApiError(e.code ?? 'http_error', e.message ?? `HTTP ${r.status}`, Boolean(e.retryable), r.status)
  } catch {
    return new ApiError('http_error', `Request failed (HTTP ${r.status}).`, false, r.status)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, token } = await config()
  let r: Response
  try {
    r = await fetch(baseUrl + path, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-friday-token': token, ...(init.headers ?? {}) },
    })
  } catch {
    throw new ApiError('backend_unavailable', 'Cannot reach the FRIDAY backend.', true)
  }
  if (!r.ok) throw await toError(r)
  return (await r.json()) as T
}

const json = (body: unknown) => ({ body: JSON.stringify(body) })

/** Read a File as base64 (no data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new ApiError('read_failed', `Could not read ${file.name}.`))
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
    r.readAsDataURL(file)
  })
}

/** Upload with progress (fetch has no upload progress events, so XHR is used here). */
export async function uploadAttachment(file: File, onProgress?: (pct: number) => void, signal?: AbortSignal): Promise<Attachment> {
  const { baseUrl, token } = await config()
  const data_b64 = await fileToBase64(file)
  const body = JSON.stringify({ name: file.name, mime: file.type, data_b64 })
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${baseUrl}/api/attachments`)
    xhr.setRequestHeader('content-type', 'application/json')
    xhr.setRequestHeader('x-friday-token', token)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)) }
    xhr.onerror = () => reject(new ApiError('backend_unavailable', 'Cannot reach the FRIDAY backend.', true))
    xhr.onabort = () => reject(new ApiError('aborted', 'Upload cancelled.'))
    xhr.onload = () => {
      let j: { error?: { code?: string; message?: string } } & Partial<Attachment> = {}
      try { j = JSON.parse(xhr.responseText) } catch { /* handled below */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(j as Attachment)
      else reject(new ApiError(j.error?.code ?? 'http_error', j.error?.message ?? `Upload failed (HTTP ${xhr.status}).`, false, xhr.status))
    }
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(body)
  })
}

export const api = {
  conversations: (q?: string, archived = false) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (archived) p.set('archived', 'true')
    const qs = p.toString()
    return request<ConversationSummary[]>(`/api/conversations${qs ? `?${qs}` : ''}`)
  },
  archive: (id: string, archived: boolean) => request(`/api/conversations/${id}`, { method: 'PATCH', ...json({ archived }) }),
  feedback: (messageId: string, value: 'up' | 'down' | null) =>
    request(`/api/messages/${messageId}/feedback`, { method: 'PUT', ...json({ value }) }),
  attachment: (id: string, data = false) => request<Attachment>(`/api/attachments/${id}${data ? '?data=true' : ''}`),
  deleteAttachment: (id: string) => request(`/api/attachments/${id}`, { method: 'DELETE' }),
  memories: (q?: string) => request<Memory[]>(`/api/memories${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  addMemory: (content: string, source: 'manual' | 'message' = 'manual') =>
    request<Memory>('/api/memories', { method: 'POST', ...json({ content, source }) }),
  updateMemory: (id: string, patch: { content?: string; enabled?: boolean }) =>
    request<Memory>(`/api/memories/${id}`, { method: 'PATCH', ...json(patch) }),
  deleteMemory: (id: string) => request(`/api/memories/${id}`, { method: 'DELETE' }),
  clearMemories: () => request<{ deleted: number }>('/api/memories', { method: 'DELETE' }),
  conversation: (id: string) =>
    request<ConversationSummary & { messages: ChatMessage[] }>(`/api/conversations/${id}`),
  rename: (id: string, title: string) => request(`/api/conversations/${id}`, { method: 'PATCH', ...json({ title }) }),
  remove: (id: string) => request(`/api/conversations/${id}`, { method: 'DELETE' }),
  removeAll: () => request<{ deleted: number }>('/api/conversations', { method: 'DELETE' }),
  settings: () => request<AppSettings>('/api/settings'),
  patchSettings: (p: Partial<AppSettings>) => request<AppSettings>('/api/settings', { method: 'PATCH', ...json(p) }),
  providers: () => request<ProviderStatus[]>('/api/providers/status'),
  models: () => request<ModelsResponse>('/api/models'),
  setKey: (api_key: string) =>
    request<{ configured: boolean; persistent: boolean }>('/api/providers/anthropic/key', { method: 'PUT', ...json({ api_key }) }),
  deleteKey: () => request('/api/providers/anthropic/key', { method: 'DELETE' }),
  async health(): Promise<{ status: string; version: string; latencyMs: number }> {
    const { baseUrl } = await config()
    const t0 = performance.now()
    let r: Response
    try { r = await fetch(`${baseUrl}/health`) } catch { throw new ApiError('backend_unavailable', 'Cannot reach the FRIDAY backend.', true) }
    if (!r.ok) throw await toError(r)
    return { ...(await r.json()), latencyMs: Math.round(performance.now() - t0) }
  },
  /** Real generation check for one model (never installs anything). */
  /** Pre-load the local model + prompt cache in the background (no-op for cloud models). */
  warmup: () => request<{ started: boolean }>('/api/chat/warmup', { method: 'POST' }),
  verifyModel: (provider: string, model: string) =>
    request<VerifyResult>('/api/models/verify', { method: 'POST', ...json({ provider, model }) }),
  approveTool: (request_id: string, call_id: string, approve: boolean) =>
    request('/api/chat/approve', { method: 'POST', ...json({ request_id, call_id, approve }) }),
  searchKeyStatus: () => request<{ configured: boolean }>('/api/providers/ollama-search/key'),
  setSearchKey: (api_key: string) =>
    request<{ configured: boolean; persistent: boolean }>('/api/providers/ollama-search/key', { method: 'PUT', ...json({ api_key }) }),
  deleteSearchKey: () => request('/api/providers/ollama-search/key', { method: 'DELETE' }),
  cancel: (request_id: string) => request('/api/chat/cancel', { method: 'POST', ...json({ request_id }) }),
  async exportConversation(id: string, format: 'md' | 'txt'): Promise<string> {
    const { baseUrl, token } = await config()
    const r = await fetch(`${baseUrl}/api/conversations/${id}/export?format=${format}`, { headers: { 'x-friday-token': token } })
    if (!r.ok) throw await toError(r)
    return r.text()
  },
}

export interface StreamBody {
  request_id: string
  conversation_id?: string | null
  message?: string
  mode?: string
  regenerate?: boolean
  edit?: boolean
  confirm_cloud?: boolean
  attachment_ids?: string[]
}

export interface StreamHandlers {
  onMeta(m: RouteMeta): void
  onDelta(t: string): void
  onError(e: ErrorInfo): void
  onDone(d: { status: string; message_id: string | null; conversation_id: string }): void
  onStatus?(text: string): void
  onToolRequest?(t: ToolWire): void
  onToolStart?(t: ToolWire): void
  onToolResult?(t: ToolWire & { sources: Source[] }): void
}

export interface ToolWire {
  id: string; name: string; label: string; detail: string
  ok?: boolean; summary?: string; approval?: string
  args?: Record<string, unknown>; private?: boolean
}

export async function streamChat(body: StreamBody, h: StreamHandlers, signal?: AbortSignal): Promise<void> {
  const { baseUrl, token } = await config()
  let r: Response
  try {
    r = await fetch(`${baseUrl}/api/chat/stream`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-friday-token': token },
      body: JSON.stringify(body),
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    throw new ApiError('backend_unavailable', 'Cannot reach the FRIDAY backend.', true)
  }
  if (!r.ok) throw await toError(r)
  if (!r.body) throw new ApiError('bad_response', 'The backend returned no stream.')
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  const parser = new SSEParser()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (const ev of parser.feed(dec.decode(value, { stream: true }))) {
        if (ev.event === 'meta') h.onMeta(ev.data as RouteMeta)
        else if (ev.event === 'delta') h.onDelta((ev.data as { text: string }).text)
        else if (ev.event === 'error') h.onError(ev.data as ErrorInfo)
        else if (ev.event === 'done') h.onDone(ev.data as Parameters<StreamHandlers['onDone']>[0])
        else if (ev.event === 'status') h.onStatus?.((ev.data as { text: string }).text)
        else if (ev.event === 'tool_request') h.onToolRequest?.(ev.data as ToolWire)
        else if (ev.event === 'tool_start') h.onToolStart?.(ev.data as ToolWire)
        else if (ev.event === 'tool_result') h.onToolResult?.(ev.data as ToolWire & { sources: Source[] })
      }
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') throw new ApiError('stream_interrupted', 'The response stream was interrupted.', true)
  }
}
