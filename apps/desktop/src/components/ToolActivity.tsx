import { AnimatePresence, motion } from 'framer-motion'
import { Ban, Calculator, CalendarClock, Check, ExternalLink, FileDown, Globe, Loader2, Search, ShieldAlert, Terminal, X, type LucideIcon } from 'lucide-react'
import { dur, ease } from '../design/motion'
import type { Source, ToolEvent } from '../types/api'

const ICON: Record<string, LucideIcon> = {
  calculator: Calculator, get_current_datetime: CalendarClock, web_search: Search, fetch_url: Globe,
  save_file: FileDown, open_url: ExternalLink, run_command: Terminal,
}

/** What the approval card says will happen, per tool. */
function describe(t: ToolEvent): { title: string; body: string; mono?: boolean } {
  const a = t.args ?? {}
  switch (t.name) {
    case 'save_file': return { title: 'Save a file', body: `Documents\\FRIDAY\\${String(a.filename ?? 'file')} (${String(a.content ?? '').length.toLocaleString()} characters)` }
    case 'open_url': return { title: 'Open a link in your browser', body: String(a.url ?? ''), mono: true }
    case 'run_command': return { title: 'Run a PowerShell command on this PC', body: String(a.command ?? ''), mono: true }
    case 'web_search': return { title: 'Search the web', body: `“${String(a.query ?? '')}” — this conversation contains private content, and the search query leaves your device.` }
    case 'fetch_url': return { title: 'Read a web page', body: `${String(a.url ?? '')} — this conversation contains private content.`, mono: true }
    default: return { title: t.label, body: t.detail }
  }
}

function StateIcon({ state }: { state: ToolEvent['state'] }) {
  if (state === 'running' || state === 'awaiting') return <Loader2 size={12} className={state === 'running' ? 'animate-spin text-accent' : 'text-warn'} />
  if (state === 'done') return <Check size={12} className="text-ok" />
  if (state === 'declined') return <Ban size={12} className="text-faint" />
  return <X size={12} className="text-danger" />
}

export function ToolActivity({ tools, onApprove, live }: { tools: ToolEvent[]; onApprove?(id: string, ok: boolean): void; live?: boolean }) {
  if (!tools.length) return null
  return (
    <ul className="mb-2.5 space-y-1.5" aria-label="Tool activity">
      <AnimatePresence initial={false}>
        {tools.map((t) => {
          const Icon = ICON[t.name] ?? Terminal
          const awaiting = t.state === 'awaiting' && live
          const d = describe(t)
          return (
            <motion.li key={t.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.ui, ease: ease.out }}>
              {awaiting ? (
                <div role="alertdialog" aria-label={`Approve: ${d.title}`} className="glass-float rounded-md border-warn/40 p-3 text-sm" style={{ borderColor: 'rgb(var(--warn-rgb) / 0.45)' }}>
                  <p className="flex items-center gap-2 font-semibold text-ink"><ShieldAlert size={15} className="text-warn" />FRIDAY wants to: {d.title}</p>
                  <p className={`mt-1.5 break-all rounded-sm bg-ink/[0.05] px-2.5 py-1.5 text-xs text-ink/90 ${d.mono ? 'font-mono' : ''}`}>{d.body}</p>
                  <div className="mt-2.5 flex justify-end gap-2">
                    <button className="btn-ghost !py-1.5 text-xs" onClick={() => onApprove?.(t.id, false)}>Deny</button>
                    <button className="btn-primary !py-1.5 text-xs" autoFocus onClick={() => onApprove?.(t.id, true)}>Allow</button>
                  </div>
                </div>
              ) : (
                <div className="glass-clear flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs">
                  <Icon size={13} className="shrink-0 text-accent" />
                  <span className="shrink-0 font-medium text-ink/90">{t.state === 'running' ? `${t.label}…` : t.label}</span>
                  {t.detail && <span className="min-w-0 truncate text-faint" title={t.detail}>{t.detail}</span>}
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 text-faint">
                    {t.summary && t.state !== 'running' && <span className="hidden max-w-[16rem] truncate sm:inline" title={t.summary}>{t.summary}</span>}
                    <StateIcon state={t.state === 'awaiting' ? 'declined' : t.state} />
                  </span>
                </div>
              )}
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function Sources({ sources, onOpen }: { sources: Source[]; onOpen(url: string): void }) {
  if (!sources.length) return null
  return (
    <div className="mt-3" aria-label="Sources">
      <p className="label-xs mb-1.5">Sources</p>
      <ol className="flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <li key={s.url}>
            <button onClick={() => onOpen(s.url)} title={`${s.title}\n${s.url}`}
              className="glass-edge flex max-w-[16rem] items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent/15 text-[0.62rem] font-bold text-accent">{s.n}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{s.title || host(s.url)}</span>
                <span className="block truncate text-faint">{host(s.url)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Stored replies carry {ok, approval} instead of a live state. */
export function toolState(t: ToolEvent & { ok?: boolean; approval?: string }): ToolEvent {
  if (t.state) return t
  return { ...t, state: t.approval === 'declined' ? 'declined' : t.ok ? 'done' : 'failed' }
}
