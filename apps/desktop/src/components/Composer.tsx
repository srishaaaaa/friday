import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowUp, Check, ChevronDown, Cloud, Cpu, Paperclip, Pencil, RefreshCw, Sparkles, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { dur, ease } from '../design/motion'
import { api, uploadAttachment } from '../services/api'
import type { AppSettings, Attachment, Mode, ModelInfo, ModelsResponse, ProviderStatus } from '../types/api'
import { isRemote, modelMeta } from '../utils/models'
import { FloatingMenu, type MenuItem, type MenuSection } from './ui/Menu'
import { ACCEPT, AttachmentChip, MAX_FILES, validateFile, type PendingFile } from './AttachmentChip'
import { Segmented, StatusDot, Tooltip } from './ui/primitives'

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'local', label: 'Local', hint: 'Only Ollama. Never falls back to a hosted model.' },
  { id: 'smart', label: 'Smart', hint: 'Picks per request with visible rules. Never sends data out just because local failed.' },
  { id: 'cloud', label: 'Cloud', hint: 'Sent to the hosted provider you configured.' },
]

export function ModeSelector({ mode, onChange, size = 'sm' }: { mode: Mode; onChange(m: Mode): void; size?: 'sm' | 'md' }) {
  return <Segmented id="mode" label="Routing mode" value={mode} size={size} onChange={onChange} options={MODES.map((m) => ({ id: m.id, label: m.label, hint: m.hint }))} />
}

const CAP_LABEL: Record<string, string> = { vision: 'vision', tools: 'tools', thinking: 'thinking', audio: 'audio', insert: 'code-insert', embedding: 'embedding only' }

/** Capability badges as reported by the provider (only the interesting ones). */
export function CapBadges({ caps }: { caps?: string[] | null }) {
  const shown = (caps ?? []).filter((c) => c in CAP_LABEL)
  if (!shown.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((c) => (
        <span key={c} className={`rounded-full border px-1.5 text-[0.6rem] leading-4 ${c === 'embedding' ? 'border-warn/40 text-warn' : 'border-line text-faint'}`}>{CAP_LABEL[c]}</span>
      ))}
    </span>
  )
}

function modelRow(m: ModelInfo, selected: boolean) {
  return (
    <span className="block min-w-0">
      <span className={`block truncate font-mono text-[0.78rem] ${selected ? 'text-accent' : 'text-ink'}`}>{m.id}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.68rem] text-faint">
        <span>{modelMeta(m)}</span>
        <CapBadges caps={m.capabilities} />
      </span>
    </span>
  )
}

/**
 * Model picker bound to the real settings and to the models the providers actually report — nothing is hardcoded.
 * In Smart mode it exposes both slots (local + hosted), because the backend chooses between them per request.
 * Opening it re-discovers models; switching only changes which model answers next (history is kept).
 */
export function ModelSelect({ settings, models, providers = [], onChange, onRefresh }: {
  settings: AppSettings; models: ModelsResponse; providers?: ProviderStatus[]; onChange(p: Partial<AppSettings>): void; onRefresh?(): void
}) {
  const mode = settings.default_mode
  const ollamaList = models.ollama?.models ?? []
  const ollamaError = models.ollama?.error
  const hostedList = models[settings.hosted_provider]?.models ?? []
  const ollamaUp = providers.find((p) => p.id === 'ollama')?.available
  const hostedUp = providers.find((p) => p.id === settings.hosted_provider)?.available
  const missingLocal = !!settings.ollama_model && ollamaUp !== false && !ollamaList.some((m) => m.id === settings.ollama_model)

  const pick = (m: ModelInfo): MenuItem => {
    const selected = m.id === settings.ollama_model
    return {
      id: `o-${m.id}`, label: modelRow(m, selected), selected, disabled: m.can_chat === false,
      hint: isRemote(m) ? <Cloud size={12} aria-label="runs on Ollama cloud" /> : <Cpu size={12} aria-label="runs on this device" />,
      icon: selected ? <Check size={14} className="text-accent" /> : <span className="inline-block w-3.5" />,
      onSelect: () => onChange({ ollama_model: m.id }),
    }
  }
  const ollamaItems: MenuItem[] = [
    ...(missingLocal ? [{ id: 'o-missing', disabled: true, onSelect: () => undefined, icon: <AlertTriangle size={14} className="text-warn" />,
      label: <span className="block text-xs"><span className="font-mono text-warn">{settings.ollama_model}</span><span className="block text-faint">Selected but not installed — run <code className="font-mono">ollama pull {settings.ollama_model}</code> or pick another</span></span> }] : []),
    ...ollamaList.map(pick),
  ]
  const ollamaSection: MenuSection = {
    title: `Ollama · ${ollamaUp === false ? 'not running' : `${ollamaList.length} installed`}`,
    items: ollamaItems.length ? ollamaItems
      : [{ id: 'o-none', disabled: true, onSelect: () => undefined,
        label: <span className="text-mute">{ollamaError ? ollamaError.message : <>No models installed — run <code className="font-mono">ollama pull &lt;model&gt;</code></>}</span> }],
  }
  const hostedIds = hostedList.some((m) => m.id === settings.hosted_model) || !settings.hosted_model ? hostedList : [{ id: settings.hosted_model, name: settings.hosted_model, provider: '' }, ...hostedList]
  const hostedSection: MenuSection = {
    title: `Anthropic${hostedUp ? '' : ' — no API key'}`,
    items: hostedIds.length
      ? hostedIds.map((m): MenuItem => ({ id: `h-${m.id}`, label: <span className="block truncate font-mono text-[0.78rem]">{m.id}</span>, selected: m.id === settings.hosted_model,
        hint: <Cloud size={12} aria-label="hosted" />, disabled: !settings.cloud_enabled,
        icon: m.id === settings.hosted_model ? <Check size={14} className="text-accent" /> : <span className="inline-block w-3.5" />, onSelect: () => onChange({ hosted_model: m.id }) }))
      : [{ id: 'h-none', label: <span className="text-mute">Add an API key in Settings</span>, disabled: true, onSelect: () => undefined }],
  }
  const footer: MenuSection = { items: onRefresh ? [{ id: 'refresh', icon: <RefreshCw size={13} />, label: <span className="text-xs text-mute">Refresh model list</span>, onSelect: onRefresh }] : [] }
  const sections = [...(mode === 'local' ? [ollamaSection] : mode === 'cloud' ? [hostedSection] : [ollamaSection, hostedSection]), ...(footer.items.length ? [footer] : [])]
  const current = mode === 'local' ? settings.ollama_model : mode === 'cloud' ? settings.hosted_model : null
  const up = mode === 'local' ? ollamaUp && !missingLocal : mode === 'cloud' ? hostedUp : ollamaUp || hostedUp
  const text = mode === 'smart'
    ? `${settings.ollama_model || 'no local model'} · ${settings.cloud_enabled ? settings.hosted_model : 'cloud off'}`
    : current || (mode === 'local' ? 'Select a model' : 'No model')

  return (
    <FloatingMenu label="Choose a model" role="listbox" sections={sections} className="w-[22rem] max-w-[calc(100vw-2rem)]"
      trigger={({ open, toggle, ref }) => (
        <button ref={ref} aria-label="Model" aria-haspopup="listbox" aria-expanded={open}
          onClick={() => { if (!open) onRefresh?.(); toggle() }}
          title={mode === 'local' && missingLocal ? `${current} is not installed in Ollama` : current ?? undefined}
          className="btn-ghost min-w-0 max-w-[16rem] !gap-1.5 !px-2.5 !py-1 text-xs">
          <StatusDot status={providers.length === 0 ? 'checking' : up ? 'ok' : 'error'} />
          {mode === 'smart' && <Sparkles size={12} className="shrink-0 text-accent3" />}
          <span className="truncate font-mono text-ink/90">{text}</span>
          <ChevronDown size={13} className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      )} />
  )
}

export function Composer({ streaming, settings, models, providers, restored, prefill, dropped, editing, onSend, onEdit, onCancelEdit, onStop, onSettings, onOpenAttachment, onNotify, onRefreshModels }: {
  streaming: boolean; settings: AppSettings; models: ModelsResponse; providers?: ProviderStatus[]
  restored: { text: string; attachments?: Attachment[]; n: number } | null; prefill?: { text: string; n: number } | null
  /** files dropped anywhere on the conversation surface */
  dropped?: { files: File[]; n: number } | null
  /** when set, the composer edits the last user message instead of sending a new one */
  editing?: { text: string; n: number } | null
  onSend(t: string, attachments: Attachment[]): void; onEdit?(t: string): void; onCancelEdit?(): void
  onStop(): void; onSettings(p: Partial<AppSettings>): void
  onOpenAttachment?(a: Attachment): void; onNotify?(msg: string): void; onRefreshModels?(): void
}) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [focused, setFocused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const sentAt = useRef(0)
  const focusEnd = () => requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } })
  useEffect(() => {
    if (!restored) return
    setText(restored.text)
    if (restored.attachments?.length) setFiles(restored.attachments.map((a) => ({ key: a.id, name: a.name, size: a.size, progress: 100, status: 'ready', att: a })))
  }, [restored])
  useEffect(() => { if (prefill) { setText(prefill.text); focusEnd() } }, [prefill])
  useEffect(() => { if (editing) { setText(editing.text); focusEnd() } }, [editing])
  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 220)}px` }
  }, [text])

  const addFiles = useCallback((list: File[]) => {
    if (editing) { onNotify?.('Attachments can not be added while editing a message.'); return }
    const room = MAX_FILES - files.length
    if (room <= 0) { onNotify?.(`Up to ${MAX_FILES} files per message.`); return }
    for (const f of list.slice(0, room)) {
      const problem = validateFile(f)
      if (problem) { onNotify?.(problem); continue }
      const key = `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`
      const ctrl = new AbortController()
      setFiles((fs) => [...fs, { key, name: f.name, size: f.size, progress: 0, status: 'uploading', ctrl }])
      void uploadAttachment(f, (pct) => setFiles((fs) => fs.map((x) => (x.key === key ? { ...x, progress: pct } : x))), ctrl.signal)
        .then((att) => setFiles((fs) => fs.map((x) => (x.key === key ? { ...x, status: 'ready', progress: 100, att } : x))))
        .catch((e: Error & { code?: string }) => {
          if (e.code === 'aborted') return
          setFiles((fs) => fs.map((x) => (x.key === key ? { ...x, status: 'error', error: e.message } : x)))
        })
    }
    if (list.length > room) onNotify?.(`Only ${room} more file${room === 1 ? '' : 's'} can be attached.`)
  }, [editing, files.length, onNotify])

  useEffect(() => { if (dropped?.files.length) addFiles(dropped.files) }, [dropped]) // eslint-disable-line react-hooks/exhaustive-deps

  const removeFile = (f: PendingFile) => {
    f.ctrl?.abort()
    setFiles((fs) => fs.filter((x) => x.key !== f.key))
    if (f.att && !f.att.sent) void api.deleteAttachment(f.att.id).catch(() => undefined)
  }

  const uploading = files.some((f) => f.status === 'uploading')
  const ready = files.filter((f) => f.status === 'ready' && f.att).map((f) => f.att!)
  const canSend = !streaming && !uploading && (editing ? !!text.trim() : !!text.trim() || ready.length > 0)
  const submit = () => {
    const now = Date.now()
    if (!canSend || now - sentAt.current < 400) return // guard against double-submit
    sentAt.current = now
    if (editing) { onEdit?.(text); setText(''); return }
    onSend(text, ready); setText(''); setFiles([])
  }
  const lum = focused || streaming || dragging
  return (
    <motion.div layout="position"
      className={`${lum ? 'glass-lum' : 'glass-frost'} relative mx-auto w-full max-w-3xl rounded-lg p-2.5 transition-[border-color,box-shadow] duration-300`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); addFiles([...e.dataTransfer.files]) }}>
      <AnimatePresence initial={false}>
        {editing && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex items-center justify-between gap-2 overflow-hidden px-2.5 pb-1.5 text-xs">
            <span className="flex items-center gap-1.5 text-accent"><Pencil size={12} />Editing your last message — the reply after it will be replaced</span>
            <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => { setText(''); onCancelEdit?.() }}>Cancel <span className="kbd">Esc</span></button>
          </motion.div>
        )}
      </AnimatePresence>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1.5 pb-1.5 pt-0.5" aria-label="Attachments">
          <AnimatePresence initial={false}>
            {files.map((f) => (
              <AttachmentChip key={f.key} name={f.name} size={f.size} att={f.att} progress={f.progress} status={f.status} error={f.error}
                onRemove={() => removeFile(f)} onOpen={f.att && onOpenAttachment ? () => onOpenAttachment(f.att!) : undefined} />
            ))}
          </AnimatePresence>
        </div>
      )}
      <textarea ref={ref} rows={1} value={text} aria-label="Message FRIDAY" placeholder={editing ? 'Edit your message…' : 'Ask FRIDAY anything…'}
        className="block max-h-[220px] w-full resize-none bg-transparent px-2.5 py-2 text-[0.97rem] leading-relaxed text-ink outline-none placeholder:text-faint"
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); addFiles(fs) } }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
          if (e.key === 'Escape') {
            if (streaming) { e.preventDefault(); onStop() } else if (editing) { e.preventDefault(); setText(''); onCancelEdit?.() }
          }
        }} />
      <input ref={picker} type="file" multiple accept={ACCEPT} className="hidden" aria-hidden tabIndex={-1}
        onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Tooltip label="Attach files" side="top">
            <button className="icon-btn !p-1.5" aria-label="Attach files" disabled={!!editing || files.length >= MAX_FILES} onClick={() => picker.current?.click()}>
              <Paperclip size={17} />
            </button>
          </Tooltip>
          <ModeSelector mode={settings.default_mode} onChange={(m) => onSettings({ default_mode: m })} />
          <ModelSelect settings={settings} models={models} providers={providers} onChange={onSettings} onRefresh={onRefreshModels} />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-1 text-[0.7rem] text-faint xl:flex">
            {streaming ? <><span className="kbd">Esc</span> to stop</> : <><span className="kbd">Enter</span> send · <span className="kbd">Shift+Enter</span> new line</>}
          </span>
          <AnimatePresence mode="popLayout" initial={false}>
            {streaming ? (
              <motion.button key="stop" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ duration: dur.micro, ease: ease.out }}
                className="btn-quiet !rounded-full !px-3 !py-1.5" aria-label="Stop generating" onClick={onStop}>
                <Square size={12} className="fill-current" />Stop
              </motion.button>
            ) : (
              <motion.button key="send" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ duration: dur.micro, ease: ease.out }}
                className="btn-primary !h-9 !w-9 !rounded-full !p-0" aria-label={editing ? 'Save and resend' : 'Send message'} title={uploading ? 'Waiting for uploads…' : undefined}
                disabled={!canSend} onClick={submit}>
                {editing ? <Check size={17} strokeWidth={2.4} /> : <ArrowUp size={17} strokeWidth={2.4} />}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence>
        {dragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg border-2 border-dashed border-accent/60 bg-accent/10 text-sm font-semibold text-accent">
            Drop files to attach
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
