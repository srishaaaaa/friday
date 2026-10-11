import type { AppSettings } from '../src/types/api'

/** Complete settings object matching the backend defaults; tests override what they need. */
export const BASE_SETTINGS: AppSettings = {
  default_mode: 'local', cloud_enabled: true, hosted_provider: 'anthropic', hosted_model: 'm', ollama_model: 'llama3',
  system_prompt: '', max_tokens: 1024, theme: 'dark', memory_enabled: true, conversation_memory: true,
  personality: 'friendly', warmth: 'medium', humor: 'subtle', detail: 'balanced', tech_depth: 'adaptive', formatting: 'standard',
  suggestions: 'occasional', nickname: '', custom_instructions: '', temperature: null, top_p: null, context_window: null,
  request_timeout: 120, auto_retry: false, streaming: true, tools_enabled: true, web_search: true, search_provider: 'duckduckgo',
  allow_commands: false,
}
