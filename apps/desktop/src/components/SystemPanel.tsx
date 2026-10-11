import { motion } from 'framer-motion'
import { Cloud, Cpu, HardDrive, MonitorSmartphone, RefreshCw, Server, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { slideRight } from '../design/motion'
import { api } from '../services/api'
import type { AppSettings, ModelsResponse, ProviderStatus, SystemInfo } from '../types/api'
import { fmtBytes, isOllamaCloud } from '../utils/models'
import { StatusDot } from './ui/primitives'

function Section({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="glass-clear rounded-md p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="text-accent">{icon}</span>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}
function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-1 text-xs"><span className="shrink-0 text-faint">{k}</span><span className="min-w-0 truncate text-right text-ink/90">{v}</span></div>
}

/** Contextual system/diagnostics panel. Every value shown is measured or reported — nothing is simulated. */
export function SystemPanel({ providers, models, settings, onRefresh, onClose, overlay }: {
  providers: ProviderStatus[]; models: ModelsResponse; settings: AppSettings; onRefresh(): void; onClose(): void; overlay?: boolean
}) {
  const [health, setHealth] = useState<{ ok: boolean; text: string; ms?: number } | null>(null)
  const [sys, setSys] = useState<SystemInfo | null>(null)
  const [app, setApp] = useState<{ version: string; electron: string; platform: string; arch: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const check = useCallback(async () => {
    setBusy(true)
    try { const h = await api.health(); setHealth({ ok: h.status === 'ok', text: `v${h.version}`, ms: h.latencyMs }) }
    catch (e) { setHealth({ ok: false, text: (e as Error).message }) }
    onRefresh()
    try { if (window.friday?.systemInfo) setSys(await window.friday.systemInfo()) } catch { /* optional */ }
    setBusy(false)
  }, [onRefresh])

  useEffect(() => {
    void check()
    void window.friday?.appInfo().then(setApp).catch(() => undefined)
  }, [check])

  const ollamaModels = models.ollama?.models ?? []
  const ram = sys ? sys.totalMem : 0
  const usedPct = sys ? Math.round((1 - sys.freeMem / sys.totalMem) * 100) : 0
  const gpuNote = sys && sys.gpus.length && sys.gpus.every((g) => /intel|uhd|iris|vega|radeon\(tm\) graphics/i.test(g))
    ? 'Integrated graphics only — keep local models small (≈2–4B), or use cloud models for speed.' : null

  return (
    <motion.aside variants={slideRight} initial="hidden" animate="show" exit="exit" aria-label="System status"
      className={`glass-deep flex w-[21rem] shrink-0 flex-col overflow-hidden rounded-xl ${overlay ? 'absolute bottom-3 right-3 top-3 z-panel' : ''}`}>
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">System</h2>
          <p className="text-xs text-faint">Live status of FRIDAY's services</p>
        </div>
        <div className="flex items-center gap-1">
          <button className="icon-btn" aria-label="Refresh status" onClick={() => void check()} disabled={busy}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /></button>
          <button className="icon-btn" aria-label="Close system panel" onClick={onClose}><X size={16} /></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <Section icon={<Server size={15} />} title="Backend">
          <div className="flex items-center gap-2 text-xs">
            <StatusDot status={!health ? 'checking' : health.ok ? 'ok' : 'error'} />
            <span className="text-ink">{!health ? 'Checking…' : health.ok ? 'Healthy' : 'Unreachable'}</span>
            {health?.ms !== undefined && <span className="ml-auto font-mono text-faint">{health.ms} ms</span>}
          </div>
          {health && <p className="mt-1 text-xs text-faint">{health.text}</p>}
        </Section>

        <Section icon={<MonitorSmartphone size={15} />} title="AI providers">
          <div className="space-y-2.5">
            {providers.length === 0 && <div className="shimmer h-10 rounded-sm" />}
            {providers.map((p) => (
              <div key={p.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <StatusDot status={p.available ? 'ok' : p.configured ? 'error' : 'warn'} />
                  <span className="font-semibold text-ink">{p.name}</span>
                  <span className="ml-auto text-faint">{p.local ? 'local service' : 'hosted'}</span>
                </div>
                <p className="mt-0.5 pl-4 text-faint">{p.detail}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section icon={<Cpu size={15} />} title={`Installed models (${ollamaModels.length})`}>
          {ollamaModels.length === 0 ? <p className="text-xs text-faint">{models.ollama?.error?.message ?? 'No Ollama models found.'}</p> : (
            <ul className="space-y-1">
              {ollamaModels.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-xs">
                  {isOllamaCloud(m.id) ? <Cloud size={12} className="text-accent2" /> : <Cpu size={12} className="text-ok" />}
                  <span className={`truncate ${m.id === settings.ollama_model ? 'font-semibold text-accent' : 'text-ink/90'}`}>{m.name}</span>
                  <span className="ml-auto shrink-0 text-faint">{isOllamaCloud(m.id) ? 'Ollama cloud' : 'on device'}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={<HardDrive size={15} />} title="This PC">
          {!window.friday?.systemInfo ? <p className="text-xs text-faint">Hardware details are available in the desktop app.</p> : !sys ? <div className="shimmer h-16 rounded-sm" /> : (
            <>
              <Row k="CPU" v={sys.cpu} />
              <Row k="Threads" v={sys.cores} />
              <Row k="GPU" v={sys.gpus.join(', ') || 'Unknown'} />
              <Row k="Memory" v={`${fmtBytes(ram - sys.freeMem)} / ${fmtBytes(ram)} used`} />
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
                <motion.div className={`h-full rounded-full ${usedPct > 85 ? 'bg-warn' : 'bg-accent'}`} initial={{ width: 0 }} animate={{ width: `${usedPct}%` }} transition={{ duration: 0.6 }} />
              </div>
              <Row k="OS" v={sys.os} />
              {gpuNote && <p className="mt-2 rounded-sm bg-warn/10 px-2.5 py-2 text-xs leading-relaxed text-warn">{gpuNote}</p>}
            </>
          )}
        </Section>

        {app && <p className="px-1 text-center text-[0.7rem] text-faint">FRIDAY {app.version} · Electron {app.electron} · {app.platform}/{app.arch}</p>}
      </div>
    </motion.aside>
  )
}
