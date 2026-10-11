import type { AppSettings, ModelInfo, ProviderStatus } from '../types/api'

/** Ollama "cloud" models (e.g. gemma4:cloud, gpt-oss:120b-cloud) are proxied by Ollama to its servers. */
export const isOllamaCloud = (model?: string | null): boolean => !!model && /[:-]cloud$/i.test(model)

export interface Where { label: string; remote: boolean }

/** Where a reply was (or will be) processed — derived from the provider + model, never guessed. */
export function whereFor(provider?: string | null, model?: string | null): Where | null {
  if (!provider) return null
  if (provider === 'ollama') return isOllamaCloud(model) ? { label: 'Ollama cloud', remote: true } : { label: 'On this device', remote: false }
  return { label: provider === 'anthropic' ? 'Hosted · Anthropic' : 'Hosted', remote: true }
}

export const providerName = (id: string) => (id === 'ollama' ? 'Ollama' : id === 'anthropic' ? 'Anthropic' : id)

/** Is at least one route usable for the current mode? Mirrors the backend's routing preconditions. */
export function readiness(settings: AppSettings | null, providers: ProviderStatus[]) {
  const ollama = providers.find((p) => p.id === 'ollama')
  const hosted = providers.find((p) => p.id === settings?.hosted_provider)
  const local = !!ollama?.available && !!settings?.ollama_model
  const cloud = !!hosted?.available && !!settings?.cloud_enabled
  const mode = settings?.default_mode ?? 'smart'
  const ready = mode === 'local' ? local : mode === 'cloud' ? cloud : local || cloud
  return { ollama, hosted, local, cloud, ready, checked: providers.length > 0 }
}

export const fmtBytes = (n: number) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : `${Math.round(n / (1 << 20))} MB`)

/** Runs off-device? Prefer what Ollama reports (remote_host); fall back to the name convention. */
export const isRemote = (m: Pick<ModelInfo, 'id' | 'remote'>) => m.remote ?? isOllamaCloud(m.id)

/** "4.6B · Q4_K_M · 4.3 GB · 128K ctx · on device" — built only from reported metadata. */
export function modelMeta(m: ModelInfo): string {
  const ctx = m.context_length ? `${m.context_length >= 1024 ? Math.round(m.context_length / 1024) + 'K' : m.context_length} ctx` : null
  const where = isRemote(m) ? (m.remote_model ? `Ollama cloud → ${m.remote_model}` : 'Ollama cloud') : 'on device'
  const size = !isRemote(m) && m.size ? fmtBytes(m.size) : null
  return [m.parameter_size, m.quantization, size, ctx, where].filter(Boolean).join(' · ')
}
