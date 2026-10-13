export type Mode = 'local' | 'cloud' | 'smart'

export interface ConversationSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
  archived?: boolean
}

export interface Attachment {
  id: string
  name: string
  mime: string
  size: number
  kind: 'text' | 'image'
  pages: number | null
  chars: number
  truncated: boolean
  ocr?: boolean
  created_at: string
  sent: boolean
  preview?: string
  data_url?: string
}

export interface Memory {
  id: string
  content: string
  enabled: boolean
  source: 'manual' | 'message'
  created_at: string
  updated_at: string
}

export interface Source { n: number; title: string; url: string; snippet?: string }

/** One tool call within a reply, as shown in the activity list. */
export interface ToolEvent {
  id: string
  name: string
  label: string
  detail: string
  state: 'awaiting' | 'running' | 'done' | 'failed' | 'declined'
  summary?: string
  args?: Record<string, unknown>
  private?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'ok' | 'cancelled' | 'error'
  provider?: string | null
  model?: string | null
  route_reason?: string | null
  streaming?: boolean
  created_at?: string
  feedback?: 'up' | 'down' | null
  attachments?: Attachment[]
  /** live-only: pipeline notes from the backend (files read, memories used, context trimmed) */
  activity?: string[]
  statusText?: string | null
  tools?: ToolEvent[]
  sources?: Source[]
  /** stored with each reply: time to the first visible word and to the end, in ms */
  usage?: { first_token_ms?: number | null; total_ms?: number | null } | null
}

export interface AppSettings {
  default_mode: Mode
  cloud_enabled: boolean
  hosted_provider: 'anthropic'
  hosted_model: string
  ollama_model: string
  system_prompt: string
  max_tokens: number
  theme: 'dark' | 'light'
  memory_enabled: boolean
  conversation_memory: boolean
  personality: 'friendly' | 'professional' | 'witty' | 'calm' | 'technical' | 'concise' | 'custom'
  warmth: 'low' | 'medium' | 'high'
  humor: 'off' | 'subtle' | 'playful'
  detail: 'brief' | 'balanced' | 'detailed' | 'very_detailed'
  tech_depth: 'beginner' | 'intermediate' | 'advanced' | 'adaptive'
  formatting: 'minimal' | 'standard' | 'rich'
  suggestions: 'off' | 'occasional' | 'frequent'
  nickname: string
  custom_instructions: string
  temperature: number | null
  top_p: number | null
  context_window: number | null
  request_timeout: number
  auto_retry: boolean
  streaming: boolean
  reasoning: boolean
  keep_alive_minutes: number
  tools_enabled: boolean
  web_search: boolean
  search_provider: 'duckduckgo' | 'ollama'
  allow_commands: boolean
}

export interface ProviderStatus {
  id: string
  name: string
  local: boolean
  configured: boolean
  available: boolean
  detail: string
}

/** A model exactly as the provider reports it (Ollama: /api/tags). Metadata fields are null when unreported. */
export interface ModelInfo {
  id: string
  name: string
  provider: string
  supports_vision?: boolean | null
  context_length?: number | null
  size?: number | null
  family?: string | null
  parameter_size?: string | null
  quantization?: string | null
  capabilities?: string[] | null
  remote?: boolean
  remote_model?: string | null
  modified_at?: string | null
  can_chat?: boolean
}

export interface VerifyResult {
  provider: string; model: string; ok: boolean; latency_ms: number | null; first_token_ms: number | null
  sample: string; error: { code: string; message: string } | null
}
export type ModelsResponse = Record<string, { models: ModelInfo[]; error: { code: string; message: string } | null }>

export interface RouteMeta {
  conversation_id: string
  provider: string
  model: string
  mode: Mode
  category: string
  reason: string
  leaves_device: boolean
  intent?: string
  context_dropped?: number
  activity?: string[]
}

export interface ErrorInfo { code: string; message: string; retryable: boolean }

export interface SystemInfo { cpu: string; cores: number; totalMem: number; freeMem: number; gpus: string[]; os: string }

declare global {
  interface Window {
    friday?: {
      getBackendConfig(): Promise<{ config: { baseUrl: string; token: string } | null; error: string | null }>
      appInfo(): Promise<{ version: string; electron: string; platform: string; arch: string }>
      openExternal(url: string): Promise<boolean>
      systemInfo?(): Promise<SystemInfo>
      loginItem?(enable?: boolean): Promise<{ openAtLogin: boolean; supported: boolean }>
      window: {
        isPinned?(): Promise<boolean>
        minimize(): Promise<boolean>
        maximize(): Promise<boolean>
        close(): Promise<boolean>
        togglePin(): Promise<boolean>
        isMaximized(): Promise<boolean>
        onMaximizeChange(cb: (v: boolean) => void): () => void
      }
    }
  }
}
