import { AlertTriangle, CheckCircle2, Cloud, Cpu, Loader2, Play } from 'lucide-react'
import { useState } from 'react'
import { api } from '../services/api'
import type { ModelInfo, VerifyResult } from '../types/api'
import { isRemote, modelMeta } from '../utils/models'
import { CapBadges } from './Composer'

type Row = { state: 'idle' | 'running' } | { state: 'done'; r: VerifyResult }
const secs = (ms: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

/**
 * Every installed model, as discovered, with a real generation test. "Test all" runs one model at a time so
 * local models don't compete for RAM. Nothing is downloaded or installed here.
 */
export function ModelVerifier({ provider, models, selected, onUse }: {
  provider: string; models: ModelInfo[]; selected?: string; onUse?(id: string): void
}) {
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [all, setAll] = useState(false)

  const test = async (id: string) => {
    setRows((r) => ({ ...r, [id]: { state: 'running' } }))
    let res: VerifyResult
    try { res = await api.verifyModel(provider, id) }
    catch (e) { res = { provider, model: id, ok: false, latency_ms: null, first_token_ms: null, sample: '', error: { code: 'request_failed', message: (e as Error).message } } }
    setRows((r) => ({ ...r, [id]: { state: 'done', r: res } }))
    return res
  }
  const testAll = async () => {
    setAll(true)
    for (const m of models) if (m.can_chat !== false) await test(m.id)
    setAll(false)
  }
  if (!models.length) return null
  const passed = Object.values(rows).filter((x) => x.state === 'done' && x.r.ok).length
  const done = Object.values(rows).filter((x) => x.state === 'done').length

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="label-xs">Installed models ({models.length}){done > 0 && <span className="ml-2 normal-case tracking-normal text-faint">{passed}/{done} passed</span>}</p>
        <button className="btn-ghost !px-2 !py-1 text-xs" disabled={all} onClick={() => void testAll()}>
          {all ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}{all ? 'Testing…' : 'Test all'}
        </button>
      </div>
      <ul className="space-y-1.5" aria-label="Installed models">
        {models.map((m) => {
          const row = rows[m.id] ?? { state: 'idle' }
          const active = m.id === selected
          return (
            <li key={m.id} className={`rounded-sm border px-3 py-2 text-xs ${active ? 'border-accent/40 bg-accent/[0.06]' : 'border-line'}`}>
              <div className="flex items-center gap-2">
                {isRemote(m) ? <Cloud size={13} className="shrink-0 text-accent2" /> : <Cpu size={13} className="shrink-0 text-ok" />}
                <span className="min-w-0 flex-1 truncate font-mono text-[0.8rem] text-ink" title={m.id}>{m.id}</span>
                {active ? <span className="text-[0.65rem] font-semibold text-accent">IN USE</span>
                  : onUse && m.can_chat !== false && <button className="btn-ghost !px-2 !py-0.5 text-[0.7rem]" onClick={() => onUse(m.id)}>Use</button>}
                <button className="btn-quiet !px-2 !py-0.5 text-[0.7rem]" aria-label={`Test ${m.id}`} disabled={row.state === 'running' || m.can_chat === false}
                  onClick={() => void test(m.id)}>
                  {row.state === 'running' ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5 text-faint">
                <span>{modelMeta(m)}</span><CapBadges caps={m.capabilities} />
              </div>
              {row.state === 'done' && (
                <p className={`mt-1.5 flex items-start gap-1.5 pl-5 ${row.r.ok ? 'text-ok' : 'text-danger'}`} role="status">
                  {row.r.ok ? <CheckCircle2 size={13} className="mt-px shrink-0" /> : <AlertTriangle size={13} className="mt-px shrink-0" />}
                  {row.r.ok
                    ? <span>Replied “{row.r.sample.slice(0, 60)}” · first token {secs(row.r.first_token_ms)} · total {secs(row.r.latency_ms)}</span>
                    : <span>{row.r.error?.message}</span>}
                </p>
              )}
              {m.can_chat === false && <p className="mt-1 pl-5 text-warn">Not a chat model — can’t be selected.</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
