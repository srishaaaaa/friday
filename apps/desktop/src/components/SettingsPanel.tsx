import { AnimatePresence, motion } from 'framer-motion'
import { Bot, Brain, Cloud, Cpu, KeyRound, Monitor, Palette, RefreshCw, Route, Shield, SlidersHorizontal, Smile, Trash2, Wrench } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { dur, ease } from '../design/motion'
import type { GlassPref, MotionPref, Prefs } from '../hooks/usePrefs'
import { useToast } from '../hooks/useToasts'
import { ApiError, api } from '../services/api'
import type { AppSettings, ModelsResponse, ProviderStatus } from '../types/api'
import { isOllamaCloud } from '../utils/models'
import { ModeSelector } from './Composer'
import { ModelVerifier } from './ModelVerifier'
import { ThemePicker } from './ThemePicker'
import { AnimatedDialog, ConfirmDialog, DialogHeader } from './ui/Dialog'
import { Segmented, StatusDot, Switch } from './ui/primitives'

export type SettingsTab = 'appearance' | 'personality' | 'providers' | 'routing' | 'generation' | 'tools' | 'memory' | 'assistant' | 'privacy' | 'desktop'
const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'personality', label: 'Personality', icon: <Smile size={16} /> },
  { id: 'providers', label: 'AI providers', icon: <Cpu size={16} /> },
  { id: 'routing', label: 'Routing', icon: <Route size={16} /> },
  { id: 'generation', label: 'Generation', icon: <SlidersHorizontal size={16} /> },
  { id: 'tools', label: 'Tools & web', icon: <Wrench size={16} /> },
  { id: 'memory', label: 'Memory', icon: <Brain size={16} /> },
  { id: 'assistant', label: 'Instructions', icon: <Bot size={16} /> },
  { id: 'privacy', label: 'Privacy & data', icon: <Shield size={16} /> },
  { id: 'desktop', label: 'Desktop', icon: <Monitor size={16} /> },
]
function Field({ title, desc, children, stack }: { title: string; desc?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={`flex gap-4 border-b border-line py-4 last:border-0 ${stack ? 'flex-col' : 'items-center justify-between'}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-mute">{desc}</p>}
      </div>
      <div className={stack ? '' : 'shrink-0'}>{children}</div>
    </div>
  )
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange(v: T): void; label: string }) {
  return (
    <select className="field !w-auto min-w-[9.5rem]" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, l]) => <option key={v} value={v} className="bg-bg2">{l}</option>)}
    </select>
  )
}

/** A number setting where "unset" means the model/provider default. */
function NumberOrDefault({ label, value, min, max, step, onChange, defaultLabel = 'Model default' }: {
  label: string; value: number | null; min: number; max: number; step: number; onChange(v: number | null): void; defaultLabel?: string
}) {
  const [local, setLocal] = useState(value ?? min)
  useEffect(() => { if (value !== null) setLocal(value) }, [value])
  const custom = value !== null
  return (
    <div className="flex items-center gap-2.5">
      <label className="flex items-center gap-1.5 text-xs text-mute">
        <input type="checkbox" className="h-3.5 w-3.5 accent-[rgb(var(--accent-rgb))]" checked={!custom} aria-label={`${label}: ${defaultLabel}`}
          onChange={(e) => onChange(e.target.checked ? null : local)} />{defaultLabel}
      </label>
      {custom && (
        <>
          {max - min <= 2 && <input type="range" min={min} max={max} step={step} value={local} aria-label={label} className="w-28 accent-[rgb(var(--accent-rgb))]"
            onChange={(e) => setLocal(Number(e.target.value))} onPointerUp={() => onChange(local)} onKeyUp={() => onChange(local)} />}
          <input type="number" min={min} max={max} step={step} value={local} aria-label={`${label} value`} className="field !w-24 !py-1 text-right font-mono text-xs"
            onChange={(e) => setLocal(Number(e.target.value))}
            onBlur={() => { const n = Math.min(max, Math.max(min, local)); setLocal(n); onChange(n) }} />
        </>
      )}
    </div>
  )
}

export function SettingsPanel({ open, settings, providers, models, prefs, initialTab = 'appearance', onPrefs, onClose, onChange, onRefresh, onDeleteAll, onReplayIntro, onOpenMemory }: {
  open: boolean; settings: AppSettings; providers: ProviderStatus[]; models: ModelsResponse; prefs: Prefs; initialTab?: SettingsTab
  onPrefs(p: Partial<Prefs>): void; onClose(): void; onChange(p: Partial<AppSettings>): void; onRefresh(): void; onDeleteAll(): void; onReplayIntro(): void; onOpenMemory?(): void
}) {
  const toast = useToast()
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [key, setKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [prompt, setPrompt] = useState(settings.system_prompt)
  const [maxTokens, setMaxTokens] = useState(String(settings.max_tokens))
  const [pinned, setPinned] = useState<boolean | null>(null)
  const [login, setLogin] = useState<{ openAtLogin: boolean; supported: boolean } | null>(null)
  const [searchKey, setSearchKey] = useState(false)
  const [searchKeyDraft, setSearchKeyDraft] = useState('')
  useEffect(() => { if (open) void api.searchKeyStatus().then((r) => setSearchKey(r.configured)).catch(() => undefined) }, [open])
  const saveSearchKey = async () => {
    try { const r = await api.setSearchKey(searchKeyDraft.trim()); setSearchKeyDraft(''); setSearchKey(true)
      toast.push(r.persistent ? 'Ollama API key saved to Windows Credential Manager.' : 'Ollama API key held in memory for this session only.', 'success')
    } catch (e) { toast.push(e instanceof ApiError ? e.message : 'Could not save the key.', 'error') }
  }
  useEffect(() => { if (open) setTab(initialTab) }, [open, initialTab])
  useEffect(() => { setPrompt(settings.system_prompt); setMaxTokens(String(settings.max_tokens)) }, [settings.system_prompt, settings.max_tokens])
  useEffect(() => {
    if (!open) return
    void window.friday?.window.isPinned?.().then(setPinned).catch(() => undefined)
    void window.friday?.loginItem?.().then(setLogin).catch(() => undefined)
  }, [open])

  const ollama = providers.find((p) => p.id === 'ollama')
  const hosted = providers.find((p) => p.id === settings.hosted_provider)
  const ollamaModels = models.ollama?.models ?? []
  const hostedModels = models[settings.hosted_provider]?.models ?? []

  const saveKey = async () => {
    setSavingKey(true)
    try {
      const r = await api.setKey(key.trim())
      setKey(''); onRefresh()
      toast.push(r.persistent ? 'API key saved to Windows Credential Manager.' : 'API key held in memory for this session only.', 'success')
    } catch (e) { toast.push(e instanceof ApiError ? e.message : 'Could not save the key.', 'error') }
    setSavingKey(false)
  }
  const removeKey = async () => {
    try { await api.deleteKey(); onRefresh(); toast.push('API key removed.', 'success') } catch (e) { toast.push((e as Error).message, 'error') }
  }

  const body: Record<SettingsTab, ReactNode> = {
    appearance: (
      <>
        <Field title="Theme" desc="Dark is the default cinematic look.">
          <Segmented id="theme" label="Theme" size="sm" value={settings.theme} onChange={(t) => onChange({ theme: t })} options={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }]} />
        </Field>
        <Field title="Accent &amp; theme" stack desc="Colors change highlights and the AI core. Character themes also change the welcome-page mascot and add background effects.">
          <ThemePicker value={prefs.accent} onChange={(a) => onPrefs({ accent: a })} />
        </Field>
        <Field title="Animation" desc="Reduced keeps state changes but removes ambient motion. Your system's reduced-motion setting is always respected.">
          <Segmented<MotionPref> id="motion" label="Animation" size="sm" value={prefs.motion} onChange={(m) => onPrefs({ motion: m })}
            options={[{ id: 'full', label: 'Full' }, { id: 'reduced', label: 'Reduced' }, { id: 'off', label: 'Off' }]} />
        </Field>
        <Field title="Transparency" desc="Solid turns off background blur — lighter on the GPU and battery.">
          <Segmented<GlassPref> id="glass" label="Transparency" size="sm" value={prefs.glass} onChange={(g) => onPrefs({ glass: g })}
            options={[{ id: 'full', label: 'Glass' }, { id: 'reduced', label: 'Subtle' }, { id: 'solid', label: 'Solid' }]} />
        </Field>
        <Field title="Density">
          <Segmented id="density" label="Density" size="sm" value={prefs.density} onChange={(d) => onPrefs({ density: d })}
            options={[{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }]} />
        </Field>
        <Field title="Show AI core" desc="The animated orb on the welcome screen and chat header."><Switch label="Show AI core" checked={prefs.showCore} onChange={(v) => onPrefs({ showCore: v })} /></Field>
        <Field title="Ambient background" desc="Light blooms, grid and particles behind the app."><Switch label="Ambient background" checked={prefs.ambient} onChange={(v) => onPrefs({ ambient: v })} /></Field>
        <Field title="Welcome sequence" desc="Replay the first-launch introduction and setup."><button className="btn-quiet" onClick={onReplayIntro}>Replay intro</button></Field>
      </>
    ),
    providers: (
      <>
        <div className="glass-clear mt-4 rounded-md p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><StatusDot status={!ollama ? 'checking' : ollama.available ? 'ok' : 'error'} />Ollama</h3>
            <button className="btn-ghost !py-1 text-xs" onClick={onRefresh}><RefreshCw size={13} />Check again</button>
          </div>
          <p className="mt-1 text-xs text-mute">{ollama?.detail ?? 'Checking…'}</p>
          {ollamaModels.length > 0 ? (
            <label className="mt-3 block text-xs text-mute">Model
              <select className="field mt-1" aria-label="Local model" value={settings.ollama_model} onChange={(e) => onChange({ ollama_model: e.target.value })}>
                <option value="">Select a model…</option>
                {settings.ollama_model && !ollamaModels.some((m) => m.id === settings.ollama_model) && (
                  <option value={settings.ollama_model} className="bg-bg2">{settings.ollama_model} — not installed</option>)}
                {ollamaModels.map((m) => <option key={m.id} value={m.id} disabled={m.can_chat === false} className="bg-bg2">{m.id}{isOllamaCloud(m.id) ? ' — Ollama cloud' : ' — on device'}{m.can_chat === false ? ' (not a chat model)' : ''}</option>)}
              </select>
            </label>
          ) : (

            <p className="mt-2 text-xs text-mute">Install Ollama from ollama.com, then run <code className="font-mono">ollama pull &lt;model&gt;</code>. FRIDAY never downloads models on its own.</p>
          )}
          <ModelVerifier provider="ollama" models={ollamaModels} selected={settings.ollama_model} onUse={(id) => onChange({ ollama_model: id })} />
          {isOllamaCloud(settings.ollama_model) && (
            <p className="mt-3 flex gap-2 rounded-sm bg-accent2/10 px-3 py-2 text-xs leading-relaxed text-ink/90"><Cloud size={14} className="mt-0.5 shrink-0 text-accent2" />
              <span><b>{settings.ollama_model}</b> runs on Ollama's servers, not on this PC. Messages sent to it leave your device.</span></p>
          )}
        </div>

        <div className="glass-clear mt-3 rounded-md p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><StatusDot status={!hosted ? 'checking' : hosted.available ? 'ok' : 'warn'} />Anthropic (hosted)</h3>
          <p className="mt-1 text-xs text-mute">{hosted?.detail ?? 'Checking…'}. Requests are made by the local backend; the key never reaches the UI.</p>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void saveKey() }}>
            <input className="field" type="password" autoComplete="off" placeholder={hosted?.configured ? 'Replace saved key' : 'Paste API key'} aria-label="API key" value={key} onChange={(e) => setKey(e.target.value)} />
            <button className="btn-primary" type="submit" disabled={key.trim().length < 8 || savingKey}><KeyRound size={15} />{savingKey ? 'Saving…' : 'Save'}</button>
          </form>
          {hosted?.configured && <button className="btn-ghost mt-1 !px-0 text-xs !text-danger" onClick={() => void removeKey()}>Remove saved key</button>}
          <label className="mt-3 block text-xs text-mute">Model
            {hostedModels.length > 0 ? (
              <select className="field mt-1" aria-label="Hosted model" value={settings.hosted_model} onChange={(e) => onChange({ hosted_model: e.target.value })}>
                {(hostedModels.some((m) => m.id === settings.hosted_model) ? hostedModels : [{ id: settings.hosted_model, name: settings.hosted_model, provider: '' }, ...hostedModels])
                  .map((m) => <option key={m.id} value={m.id} className="bg-bg2">{m.name}</option>)}
              </select>
            ) : (
              <input className="field mt-1" aria-label="Hosted model id" defaultValue={settings.hosted_model} onBlur={(e) => e.target.value !== settings.hosted_model && onChange({ hosted_model: e.target.value })} />
            )}
          </label>
        </div>
      </>
    ),
    routing: (
      <>
        <Field title="Default mode" stack desc={<>
          <b>Local</b> uses only Ollama. <b>Cloud</b> uses only the hosted provider. <b>Smart</b> applies visible rules: private content stays local, coding and very long prompts go to the hosted model when available, general chat goes local. A failed request is never silently retried on another provider.
        </>}>
          <ModeSelector mode={settings.default_mode} size="md" onChange={(m) => onChange({ default_mode: m })} />
        </Field>
        <Field title="Allow hosted models" desc="When off, Smart mode stays local and Cloud mode is blocked — a local-only preference.">
          <Switch label="Allow hosted models" checked={settings.cloud_enabled} onChange={(v) => onChange({ cloud_enabled: v })} />
        </Field>
        <Field title="Cloud transmission confirmation" desc="Private content is never sent to a hosted model without explicit confirmation — the backend enforces this on every request.">
          <span className="text-xs font-semibold text-ok">Always on</span>
        </Field>
        {isOllamaCloud(settings.ollama_model) && (
          <p className="mt-2 rounded-sm bg-warn/10 px-3 py-2.5 text-xs leading-relaxed text-warn">
            Your "local" model <b>{settings.ollama_model}</b> is an Ollama cloud model. Smart mode treats Ollama as local, so pick an on-device model (e.g. gemma4:e2b) if conversations must stay on this PC.
          </p>
        )}
      </>
    ),
    personality: (
      <>
        <p className="mt-4 text-xs leading-relaxed text-mute">These choices are written into FRIDAY's instructions for every reply — they change how it answers, not just how the app looks.</p>
        <Field title="Personality"><Choice value={settings.personality} onChange={(v) => onChange({ personality: v })} label="Personality"
          options={[['friendly', 'Friendly'], ['professional', 'Professional'], ['witty', 'Witty'], ['calm', 'Calm'], ['technical', 'Technical'], ['concise', 'Concise'], ['custom', 'Custom (instructions only)']]} /></Field>
        <Field title="Warmth"><Choice value={settings.warmth} onChange={(v) => onChange({ warmth: v })} label="Warmth" options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} /></Field>
        <Field title="Humor"><Choice value={settings.humor} onChange={(v) => onChange({ humor: v })} label="Humor" options={[['off', 'Off'], ['subtle', 'Subtle'], ['playful', 'Playful']]} /></Field>
        <Field title="Response detail" desc="Default length when the request doesn't say."><Choice value={settings.detail} onChange={(v) => onChange({ detail: v })} label="Response detail"
          options={[['brief', 'Brief'], ['balanced', 'Balanced'], ['detailed', 'Detailed'], ['very_detailed', 'Very detailed']]} /></Field>
        <Field title="Technical depth"><Choice value={settings.tech_depth} onChange={(v) => onChange({ tech_depth: v })} label="Technical depth"
          options={[['adaptive', 'Adaptive'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']]} /></Field>
        <Field title="Formatting"><Choice value={settings.formatting} onChange={(v) => onChange({ formatting: v })} label="Formatting" options={[['minimal', 'Minimal'], ['standard', 'Standard'], ['rich', 'Rich']]} /></Field>
        <Field title="Proactive suggestions"><Choice value={settings.suggestions} onChange={(v) => onChange({ suggestions: v })} label="Proactive suggestions" options={[['off', 'Off'], ['occasional', 'Occasional'], ['frequent', 'Frequent']]} /></Field>
        <Field title="What should FRIDAY call you?" desc="Optional.">
          <input className="field !w-44" maxLength={60} aria-label="Preferred name" placeholder="Your name" defaultValue={settings.nickname}
            onBlur={(e) => e.target.value.trim() !== settings.nickname && onChange({ nickname: e.target.value.trim() })} />
        </Field>
        <Field title="Custom instructions" stack desc="Your own preferences, e.g. “Use British spelling” or “Always show code in Python”.">
          <textarea className="field min-h-[6rem] leading-relaxed" aria-label="Custom instructions" maxLength={2000} defaultValue={settings.custom_instructions}
            onBlur={(e) => { if (e.target.value !== settings.custom_instructions) { onChange({ custom_instructions: e.target.value }); toast.push('Custom instructions saved.', 'success') } }} />
        </Field>
      </>
    ),
    generation: (
      <>
        <Field title="Temperature" desc={<>Randomness. Lower = focused, higher = creative. {settings.default_mode !== 'local' && 'Anthropic caps this at 1.0.'}</>}>
          <NumberOrDefault label="Temperature" value={settings.temperature} min={0} max={2} step={0.1} onChange={(v) => onChange({ temperature: v })} />
        </Field>
        <Field title="Top-p" desc="Nucleus sampling. Anthropic uses either temperature or top-p — temperature wins if both are set.">
          <NumberOrDefault label="Top-p" value={settings.top_p} min={0.05} max={1} step={0.05} onChange={(v) => onChange({ top_p: v })} />
        </Field>
        <Field title="Maximum response length" desc="Upper limit on tokens per reply (64–32000).">
          <input className="field !w-28 text-right font-mono" type="number" min={64} max={32000} aria-label="Maximum tokens" value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            onBlur={() => { const n = Math.min(32000, Math.max(64, Number(maxTokens) || settings.max_tokens)); setMaxTokens(String(n)); if (n !== settings.max_tokens) onChange({ max_tokens: n }) }} />
        </Field>
        <Field title="Context window (Ollama)" desc="Tokens Ollama keeps in view. Automatic uses 8K and only grows for very long chats (each change makes Ollama reload the model). Larger values use more RAM. Hosted models ignore this.">
          <NumberOrDefault label="Context window" value={settings.context_window} min={2048} max={262144} step={2048} defaultLabel="Automatic" onChange={(v) => onChange({ context_window: v })} />
        </Field>
        <Field title="Request timeout" desc="Seconds to wait for the model before giving up.">
          <input className="field !w-24 text-right font-mono" type="number" min={10} max={900} aria-label="Request timeout" defaultValue={settings.request_timeout}
            onBlur={(e) => { const n = Math.min(900, Math.max(10, Number(e.target.value) || 120)); e.target.value = String(n); if (n !== settings.request_timeout) onChange({ request_timeout: n }) }} />
        </Field>
        <Field title="Retry once on temporary errors" desc="Retries the same provider once if it fails before any text arrives. FRIDAY never switches to a different provider on its own.">
          <Switch label="Retry once on temporary errors" checked={settings.auto_retry} onChange={(v) => onChange({ auto_retry: v })} />
        </Field>
        <Field title="Reasoning (thinking)" desc="Let models that support it think silently before answering. Better on hard problems, but much slower — on this PC it adds roughly 20–30 s per local reply. Off: answers start right away.">
          <Switch label="Reasoning" checked={settings.reasoning} onChange={(v) => onChange({ reasoning: v })} />
        </Field>
        <Field title="Keep local model loaded" desc="Minutes the local model stays in memory after a reply. Reloading takes ~30–60 s on this PC; longer uses RAM for longer.">
          <input className="field !w-24 text-right font-mono" type="number" min={1} max={1440} aria-label="Keep model loaded minutes" defaultValue={settings.keep_alive_minutes}
            onBlur={(e) => { const n = Math.min(1440, Math.max(1, Number(e.target.value) || 30)); e.target.value = String(n); if (n !== settings.keep_alive_minutes) onChange({ keep_alive_minutes: n }) }} />
        </Field>
        <Field title="Stream responses" desc="Show text as it is generated. When off, the reply appears once complete.">
          <Switch label="Stream responses" checked={settings.streaming} onChange={(v) => onChange({ streaming: v })} />
        </Field>
      </>
    ),
    tools: (
      <>
        <Field title="Let FRIDAY use tools" desc="Calculator, date & time, web search, reading pages, saving files, opening links. Needs a model that supports tool calling (gemma4 does).">
          <Switch label="Let FRIDAY use tools" checked={settings.tools_enabled} onChange={(v) => onChange({ tools_enabled: v })} />
        </Field>
        <Field title="Web search & page reading" desc="Search queries and page requests go to the internet. With private content (attached files) in the conversation, FRIDAY asks before each search.">
          <Switch label="Web search" checked={settings.web_search} disabled={!settings.tools_enabled} onChange={(v) => onChange({ web_search: v })} />
        </Field>
        <Field title="Search provider" desc={settings.search_provider === 'ollama' ? 'Ollama web search uses your own Ollama API key (create one at ollama.com/settings/keys).' : 'DuckDuckGo needs no account or key.'}>
          <Choice value={settings.search_provider} label="Search provider" onChange={(v) => onChange({ search_provider: v })}
            options={[['duckduckgo', 'DuckDuckGo'], ['ollama', 'Ollama web search']]} />
        </Field>
        {settings.search_provider === 'ollama' && (
          <div className="glass-clear mt-1 rounded-md p-3">
            <p className="flex items-center gap-2 text-xs text-mute"><StatusDot status={searchKey ? 'ok' : 'warn'} />
              {searchKey ? 'Ollama API key saved in Windows Credential Manager.' : 'No Ollama API key — DuckDuckGo is used until you add one.'}</p>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void saveSearchKey() }}>
              <input className="field" type="password" autoComplete="off" placeholder={searchKey ? 'Replace key' : 'Paste your Ollama API key'} aria-label="Ollama API key"
                value={searchKeyDraft} onChange={(e) => setSearchKeyDraft(e.target.value)} />
              <button className="btn-quiet" type="submit" disabled={searchKeyDraft.trim().length < 8}><KeyRound size={15} />Save</button>
            </form>
            {searchKey && <button className="btn-ghost mt-1 !px-0 text-xs !text-danger" onClick={() => void api.deleteSearchKey().then(() => { setSearchKey(false); toast.push('Ollama API key removed.', 'success') })}>Remove key</button>}
          </div>
        )}
        <Field title="Allow running commands" desc={<>Lets FRIDAY run PowerShell commands on this PC. <b className="text-warn">Every command is shown to you and runs only if you click Allow.</b> Leave off unless you need it.</>}>
          <Switch label="Allow running commands" checked={settings.allow_commands} disabled={!settings.tools_enabled} onChange={(v) => onChange({ allow_commands: v })} />
        </Field>
        <Field title="What always needs your approval" stack desc="Saving files (to Documents\FRIDAY), opening links in your browser, and running commands. Declining is always respected."><span /></Field>
      </>
    ),
    memory: (
      <>
        <Field title="Conversation memory" desc="Send earlier messages of the current conversation so FRIDAY can follow up. When off, each message is answered on its own.">
          <Switch label="Conversation memory" checked={settings.conversation_memory} onChange={(v) => onChange({ conversation_memory: v })} />
        </Field>
        <Field title="Long-term memory" desc="Facts you explicitly saved. Enabled memories are included with every request — including hosted ones.">
          <Switch label="Long-term memory" checked={settings.memory_enabled} onChange={(v) => onChange({ memory_enabled: v })} />
        </Field>
        <Field title="Manage memories" desc="Review, edit, disable or delete what FRIDAY remembers.">
          <button className="btn-quiet" onClick={() => { onClose(); onOpenMemory?.() }}><Brain size={15} />Open memory</button>
        </Field>
      </>
    ),
    assistant: (
      <>
        <Field title="System instructions" stack desc="FRIDAY's base behavior, sent with every conversation. Personality, task guidance and memories are added after it.">
          <textarea className="field min-h-[8rem] leading-relaxed" aria-label="System instructions" value={prompt} maxLength={4000}
            onChange={(e) => setPrompt(e.target.value)} onBlur={() => { if (prompt !== settings.system_prompt) { onChange({ system_prompt: prompt }); toast.push('Instructions saved.', 'success') } }} />
          <p className="mt-1 text-right text-[0.7rem] text-faint">{prompt.length} / 4000</p>
        </Field>
      </>
    ),
    privacy: (
      <>
        <Field title="Where your data lives" stack desc={<>
          Conversations are stored in a local SQLite database on this PC (<code className="font-mono">%APPDATA%\FRIDAY</code>). API keys are kept in Windows Credential Manager, never in the database or logs. FRIDAY has no telemetry.
        </>}><span /></Field>
        <Field title="Hosted processing" stack desc="Cloud mode — and Smart mode when it picks a hosted model — sends the conversation to the hosted provider. Ollama cloud models (names ending in :cloud) are processed on Ollama's servers. Every reply shows where it ran."><span /></Field>
        <Field title="Permissions" desc="Camera, microphone, location and notifications are denied to the app window."><span className="text-xs font-semibold text-ok">All denied</span></Field>
        <Field title="Delete all conversations" desc="Permanently removes every conversation and message from this PC.">
          <button className="btn-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Delete all</button>
        </Field>
      </>
    ),
    desktop: (
      <>
        <Field title="Always on top" desc="Keep FRIDAY above other windows. Also available from the pin button in the title bar.">
          <Switch label="Always on top" checked={!!pinned} disabled={pinned === null}
            onChange={() => void window.friday?.window.togglePin().then((v) => setPinned(Boolean(v)))} />
        </Field>
        <Field title="Launch at startup" desc={login && !login.supported ? 'Available in the installed version of FRIDAY.' : 'Start FRIDAY when you sign in to Windows.'}>
          <Switch label="Launch at startup" checked={!!login?.openAtLogin} disabled={!login?.supported}
            onChange={(v) => void window.friday?.loginItem?.(v).then(setLogin)} />
        </Field>
        <Field title="Keyboard shortcuts" stack>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {[['Command palette', 'Ctrl+K'], ['New conversation', 'Ctrl+N'], ['Search conversations', 'Ctrl+F'], ['Toggle sidebar', 'Ctrl+B'], ['System status', 'Ctrl+I'], ['Settings', 'Ctrl+,'], ['Stop generating', 'Esc'], ['New line', 'Shift+Enter']].map(([a, k]) => (
              <div key={a} className="flex items-center justify-between gap-2"><span className="text-mute">{a}</span><span className="kbd">{k}</span></div>
            ))}
          </div>
        </Field>
      </>
    ),
  }

  return (
    <>
      <AnimatedDialog open={open} onClose={onClose} label="Settings" width="max-w-3xl" className="h-[min(640px,calc(100vh-4rem))]">
        <DialogHeader title="Settings" subtitle="Personalize FRIDAY and manage AI providers" onClose={onClose} />
        <div className="flex min-h-0 flex-1 border-t border-line">
          <nav aria-label="Settings sections" className="w-48 shrink-0 space-y-0.5 border-r border-line p-2.5 max-sm:hidden">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                className={`relative flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm transition-colors ${tab === t.id ? 'text-ink' : 'text-mute hover:text-ink'}`}>
                {tab === t.id && <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-sm bg-ink/[0.07]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <span className={`relative ${tab === t.id ? 'text-accent' : ''}`}>{t.icon}</span><span className="relative">{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <select className="field mt-4 sm:hidden" aria-label="Settings section" value={tab} onChange={(e) => setTab(e.target.value as SettingsTab)}>
              {TABS.map((t) => <option key={t.id} value={t.id} className="bg-bg2">{t.label}</option>)}
            </select>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: dur.ui, ease: ease.out }}>
                {body[tab]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </AnimatedDialog>
      <ConfirmDialog open={confirmDelete} title="Delete every conversation?" body="This permanently removes all conversations and messages from this PC. It cannot be undone."
        confirmLabel="Yes, delete all" onCancel={() => setConfirmDelete(false)} onConfirm={() => { onDeleteAll(); setConfirmDelete(false) }} />
    </>
  )
}
