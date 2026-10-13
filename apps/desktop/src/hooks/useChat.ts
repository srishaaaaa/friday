import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, streamChat, type StreamBody, type ToolWire } from '../services/api'
import type {
  AppSettings, Attachment, ChatMessage, ConversationSummary, ErrorInfo, Mode, ModelsResponse, ProviderStatus, RouteMeta, ToolEvent,
} from '../types/api'

const rid = () => crypto.randomUUID().replaceAll('-', '')
const WARM_KEYS = new Set(['ollama_model', 'default_mode', 'system_prompt', 'personality', 'warmth', 'humor', 'detail', 'tech_depth',
  'formatting', 'suggestions', 'nickname', 'custom_instructions', 'memory_enabled', 'tools_enabled', 'web_search', 'allow_commands',
  'reasoning', 'keep_alive_minutes', 'context_window', 'temperature', 'top_p'])

function upsertTool(list: ToolEvent[] | undefined, t: ToolWire, state: ToolEvent['state']): ToolEvent[] {
  const next: ToolEvent = { id: t.id, name: t.name, label: t.label, detail: t.detail, state, summary: t.summary, args: t.args, private: t.private }
  const cur = list ?? []
  return cur.some((x) => x.id === t.id) ? cur.map((x) => (x.id === t.id ? { ...x, ...next, args: next.args ?? x.args } : x)) : [...cur, next]
}
const toErr = (e: unknown): ErrorInfo =>
  e instanceof ApiError
    ? { code: e.code, message: e.message, retryable: e.retryable }
    : { code: 'unknown', message: 'Something went wrong.', retryable: true }

/** A request the backend refused until the user approves sending private content off-device. */
export interface PendingConfirm {
  message: string
  body: Omit<StreamBody, 'request_id'>
  optimistic: ChatMessage[]
  restore: ChatMessage[]
  draft?: { text: string; attachments: Attachment[] }
}

export function useChat() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [models, setModels] = useState<ModelsResponse>({})
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<ErrorInfo | null>(null)
  const [lastRoute, setLastRoute] = useState<RouteMeta | null>(null)
  const [restored, setRestored] = useState<{ text: string; attachments: Attachment[]; n: number } | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  // viewKey changes only when the user switches conversation (drives transitions); animateFrom marks
  // which message indices arrived live (animate in) vs. were loaded from history (render instantly).
  const [view, setView] = useState({ key: 0, animateFrom: 0 })
  const [loadingList, setLoadingList] = useState(true)
  const requestId = useRef<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const activeRef = useRef<string | null>(null)
  activeRef.current = activeId
  const settingsRef = useRef<AppSettings | null>(null)
  settingsRef.current = settings

  const refreshList = useCallback(async (q = search) => {
    try { setConversations(await api.conversations(q || undefined, showArchived)) } catch (e) { setError(toErr(e)) } finally { setLoadingList(false) }
  }, [search, showArchived])

  const refreshProviders = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api.providers(), api.models()])
      setProviders(p); setModels(m)
    } catch (e) { setError(toErr(e)) }
  }, [])

  useEffect(() => {
    void (async () => {
      try { setSettings(await api.settings()); void api.warmup().catch(() => undefined) } catch (e) { setError(toErr(e)) }
      void refreshProviders()
    })()
  }, [refreshProviders])

  useEffect(() => { const t = setTimeout(() => void refreshList(search), 200); return () => clearTimeout(t) }, [search, refreshList])

  // Models pulled or removed in Ollama while FRIDAY is open show up when the window regains focus.
  useEffect(() => {
    const onFocus = () => void refreshProviders()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshProviders])

  const open = useCallback(async (id: string) => {
    if (streaming) return
    try {
      const c = await api.conversation(id)
      setActiveId(id); setMessages(c.messages); setError(null); setLastRoute(null)
      setView((v) => ({ key: v.key + 1, animateFrom: c.messages.length }))
    } catch (e) { setError(toErr(e)) }
  }, [streaming])

  const newChat = useCallback(() => {
    if (streaming) return
    setActiveId(null); setMessages([]); setError(null); setLastRoute(null)
    setView((v) => ({ key: v.key + 1, animateFrom: 0 }))
  }, [streaming])

  const run = useCallback(async (body: Omit<StreamBody, 'request_id'>, optimistic: ChatMessage[], restore: ChatMessage[],
    draft?: { text: string; attachments: Attachment[] }) => {
    const id = rid()
    const tmp = `tmp-${id}`
    const live = settingsRef.current?.streaming !== false
    requestId.current = id
    abort.current = new AbortController()
    setError(null); setStreaming(true)
    setMessages([...optimistic, { id: tmp, role: 'assistant', content: '', streaming: true }])
    const patchTmp = (f: (m: ChatMessage) => ChatMessage) => setMessages((ms) => ms.map((x) => (x.id === tmp ? f(x) : x)))
    let convId = body.conversation_id ?? null
    let needsConfirm = false
    try {
      await streamChat({ ...body, request_id: id }, {
        onMeta: (m) => {
          convId = m.conversation_id; setLastRoute(m); if (!activeRef.current) setActiveId(m.conversation_id)
          patchTmp((x) => ({ ...x, provider: m.provider, model: m.model, route_reason: m.reason, activity: m.activity ?? [] }))
        },
        // With streaming turned off the text is revealed once complete (it is reloaded from the server below).
        onDelta: (t) => { if (live) patchTmp((x) => ({ ...x, content: x.content + t, statusText: null })) },
        onStatus: (t) => patchTmp((x) => ({ ...x, statusText: t })),
        onToolRequest: (t) => patchTmp((x) => ({ ...x, tools: upsertTool(x.tools, t, 'awaiting') })),
        onToolStart: (t) => patchTmp((x) => ({ ...x, tools: upsertTool(x.tools, t, 'running') })),
        onToolResult: (t) => patchTmp((x) => ({ ...x,
          tools: upsertTool(x.tools, t, t.approval === 'declined' ? 'declined' : t.ok ? 'done' : 'failed'),
          sources: [...(x.sources ?? []), ...t.sources] })),
        onError: (e) => setError(e),
        onDone: () => undefined,
      }, abort.current.signal)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'confirmation_required') {
        needsConfirm = true
        setPendingConfirm({ message: e.message, body, optimistic, restore, draft })
      } else setError(toErr(e))
    } finally {
      setStreaming(false); requestId.current = null
      if (convId) {
        try { const c = await api.conversation(convId); if (activeRef.current === convId || !activeRef.current) { setActiveId(convId); setMessages(c.messages) } } catch { /* keep optimistic view */ }
      } else if (needsConfirm) {
        setMessages(optimistic) // keep the user's message visible while they decide
      } else {
        // Rejected before anything was saved: undo the optimistic UI and give the draft back.
        setMessages(restore)
        if (draft) setRestored((r) => ({ ...draft, n: (r?.n ?? 0) + 1 }))
      }
      void refreshList()
    }
  }, [refreshList])

  const send = useCallback(async (text: string, attachments: Attachment[] = []) => {
    const t = text.trim()
    if ((!t && !attachments.length) || streaming) return
    const userMsg: ChatMessage = { id: `u-${rid()}`, role: 'user', content: t, attachments }
    await run({ conversation_id: activeId, message: t, attachment_ids: attachments.map((a) => a.id) },
      [...messages, userMsg], messages, { text: t, attachments })
  }, [activeId, messages, run, streaming])

  /** Replace the last user message and answer it again (everything after it is discarded). */
  const edit = useCallback(async (text: string) => {
    const t = text.trim()
    if (!t || !activeId || streaming) return
    const idx = messages.map((m) => m.role).lastIndexOf('user')
    if (idx < 0) return
    const edited = { ...messages[idx], content: t }
    await run({ conversation_id: activeId, message: t, edit: true }, [...messages.slice(0, idx), edited], messages)
  }, [activeId, messages, run, streaming])

  const confirmPending = useCallback(async () => {
    const p = pendingConfirm
    if (!p) return
    setPendingConfirm(null)
    await run({ ...p.body, confirm_cloud: true }, p.optimistic, p.restore, p.draft)
  }, [pendingConfirm, run])

  const cancelPending = useCallback(() => {
    const p = pendingConfirm
    if (!p) return
    setPendingConfirm(null)
    setMessages(p.restore)
    if (p.draft) setRestored((r) => ({ ...p.draft!, n: (r?.n ?? 0) + 1 }))
  }, [pendingConfirm])

  const regenerate = useCallback(async () => {
    if (!activeId || streaming) return
    const base = messages[messages.length - 1]?.role === 'assistant' ? messages.slice(0, -1) : messages
    await run({ conversation_id: activeId, regenerate: true }, base, messages)
  }, [activeId, messages, run, streaming])

  const stop = useCallback(() => {
    const id = requestId.current
    if (id) void api.cancel(id).catch(() => abort.current?.abort())
  }, [])

  /** Answer a pending tool approval for the running request. */
  const approveTool = useCallback(async (callId: string, approve: boolean) => {
    const id = requestId.current
    if (!id) return
    setMessages((ms) => ms.map((m) => (m.tools?.some((t) => t.id === callId)
      ? { ...m, tools: m.tools.map((t) => (t.id === callId ? { ...t, state: approve ? 'running' : 'declined' } : t)) } : m)))
    try { await api.approveTool(id, callId, approve) } catch (e) { setError(toErr(e)) }
  }, [])

  const feedback = useCallback(async (messageId: string, value: 'up' | 'down' | null) => {
    setMessages((ms) => ms.map((m) => (m.id === messageId ? { ...m, feedback: value } : m)))
    try { await api.feedback(messageId, value); return true } catch (e) { setError(toErr(e)); return false }
  }, [])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    try {
      setSettings(await api.patchSettings(patch)); void refreshProviders()
      // Anything that changes the model or its standing prompt: pre-load again so the next reply starts fast.
      if (Object.keys(patch).some((k) => WARM_KEYS.has(k))) void api.warmup().catch(() => undefined)
      return true
    } catch (e) { setError(toErr(e)); return false }
  }, [refreshProviders])

  const setMode = useCallback((m: Mode) => updateSettings({ default_mode: m }), [updateSettings])

  const rename = useCallback(async (id: string, title: string) => { try { await api.rename(id, title); void refreshList(); return true } catch (e) { setError(toErr(e)); return false } }, [refreshList])
  const archive = useCallback(async (id: string, archived: boolean) => {
    try { await api.archive(id, archived); void refreshList(); return true } catch (e) { setError(toErr(e)); return false }
  }, [refreshList])
  const remove = useCallback(async (id: string) => {
    try { await api.remove(id); if (id === activeId) { setActiveId(null); setMessages([]); setView((v) => ({ key: v.key + 1, animateFrom: 0 })) }; void refreshList(); return true } catch (e) { setError(toErr(e)); return false }
  }, [activeId, refreshList])
  const removeAll = useCallback(async () => {
    try { await api.removeAll(); setActiveId(null); setMessages([]); setView((v) => ({ key: v.key + 1, animateFrom: 0 })); void refreshList(); return true } catch (e) { setError(toErr(e)); return false }
  }, [refreshList])

  return { conversations, search, setSearch, showArchived, setShowArchived, activeId, messages, settings, providers, models,
    streaming, error, view, loadingList, setError, lastRoute, restored, pendingConfirm, confirmPending, cancelPending,
    open, newChat, send, edit, regenerate, stop, feedback, approveTool, updateSettings, setMode, rename, archive, remove, removeAll,
    refreshProviders }
}
