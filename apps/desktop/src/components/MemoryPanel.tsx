import { AnimatePresence, motion } from 'framer-motion'
import { Brain, Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { dur, ease, slideRight } from '../design/motion'
import { useToast } from '../hooks/useToasts'
import { api } from '../services/api'
import type { Memory } from '../types/api'
import { ConfirmDialog } from './ui/Dialog'
import { Switch } from './ui/primitives'

function MemoryRow({ m, onSave, onToggle, onDelete }: {
  m: Memory; onSave(text: string): void; onToggle(v: boolean): void; onDelete(): void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(m.content)
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: dur.ui, ease: ease.out }}
      className={`group rounded-sm border border-line p-2.5 text-sm ${m.enabled ? 'bg-ink/[0.03]' : 'opacity-55'}`}>
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onSave(text.trim()); setEditing(false) } }}>
          <textarea autoFocus className="field min-h-[4.5rem] text-sm" maxLength={1000} aria-label="Memory text" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); setText(m.content) } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit() }} />
          <div className="mt-1.5 flex justify-end gap-1">
            <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setEditing(false); setText(m.content) }}><X size={13} />Cancel</button>
            <button type="submit" className="btn-quiet !px-2 !py-1 text-xs" disabled={!text.trim()}><Check size={13} />Save</button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-relaxed text-ink/90">{m.content}</p>
          <div className="flex shrink-0 items-center gap-0.5">
            <button className="icon-btn !p-1 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" aria-label="Edit memory" onClick={() => setEditing(true)}><Pencil size={13} /></button>
            <button className="icon-btn !p-1 opacity-0 transition-opacity hover:!text-danger focus:opacity-100 group-hover:opacity-100" aria-label="Delete memory" onClick={onDelete}><Trash2 size={13} /></button>
            <Switch label={m.enabled ? 'Disable memory' : 'Enable memory'} checked={m.enabled} onChange={onToggle} />
          </div>
        </div>
      )}
    </motion.li>
  )
}

/** Long-term memory manager. Every item here is something the user chose to save. */
export function MemoryPanel({ enabled, onToggleEnabled, onClose, overlay, refreshKey = 0 }: {
  enabled: boolean; onToggleEnabled(v: boolean): void; onClose(): void; overlay?: boolean; refreshKey?: number
}) {
  const toast = useToast()
  const [items, setItems] = useState<Memory[] | null>(null)
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const load = useCallback(async (query = q) => {
    try { setItems(await api.memories(query || undefined)) } catch (e) { toast.push((e as Error).message, 'error'); setItems([]) }
  }, [q, toast])
  useEffect(() => { const t = setTimeout(() => void load(q), 180); return () => clearTimeout(t) }, [q, load, refreshKey])

  const add = async () => {
    const t = draft.trim()
    if (!t) return
    try { await api.addMemory(t); setDraft(''); void load(); toast.push('Saved to memory.', 'success') } catch (e) { toast.push((e as Error).message, 'error') }
  }
  const patch = async (id: string, p: { content?: string; enabled?: boolean }) => {
    setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? null)
    try { await api.updateMemory(id, p) } catch (e) { toast.push((e as Error).message, 'error'); void load() }
  }
  const remove = async (m: Memory) => {
    setItems((xs) => xs?.filter((x) => x.id !== m.id) ?? null)
    try { await api.deleteMemory(m.id); toast.push('Memory deleted.', 'success') } catch (e) { toast.push((e as Error).message, 'error'); void load() }
  }
  const active = items?.filter((m) => m.enabled).length ?? 0

  return (
    <motion.aside variants={slideRight} initial="hidden" animate="show" exit="exit" aria-label="Memory"
      className={`glass-deep flex w-[22rem] max-w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-hidden rounded-xl ${overlay ? 'absolute bottom-3 right-3 top-3 z-panel' : ''}`}>
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold"><Brain size={16} className="text-accent" />Memory</h2>
          <button className="icon-btn" aria-label="Close memory panel" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 rounded-sm bg-ink/[0.04] px-3 py-2">
          <div className="min-w-0 text-xs">
            <p className="font-semibold text-ink">Use saved memories</p>
            <p className="text-faint">{enabled ? `${active} active · sent with every request` : 'Off — nothing is sent'}</p>
          </div>
          <Switch label="Use saved memories" checked={enabled} onChange={onToggleEnabled} />
        </div>
      </header>

      <div className="space-y-2 border-b border-line p-3">
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void add() }}>
          <input className="field !py-1.5 text-sm" placeholder="Something FRIDAY should remember…" aria-label="New memory" maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn-primary !px-2.5 !py-1.5" type="submit" aria-label="Add memory" disabled={!draft.trim()}><Plus size={16} /></button>
        </form>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field !py-1.5 !pl-8 text-sm" placeholder="Search memories" aria-label="Search memories" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {items === null ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="shimmer h-12 rounded-sm" />)}</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-faint">
            <Brain size={26} className="mx-auto mb-2 opacity-50" />
            {q ? 'No memories match your search.' : <>Nothing saved yet. Add a note above, or use <b className="text-mute">More → Save to memory</b> on any reply.</>}
          </div>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {items.map((m) => (
                <MemoryRow key={m.id} m={m} onSave={(t) => void patch(m.id, { content: t })} onToggle={(v) => void patch(m.id, { enabled: v })} onDelete={() => void remove(m)} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {items && items.length > 0 && !q && (
        <footer className="border-t border-line p-2.5">
          <button className="btn-ghost w-full !text-danger" onClick={() => setConfirmClear(true)}><Trash2 size={14} />Clear all memories</button>
        </footer>
      )}
      <ConfirmDialog open={confirmClear} title="Clear all memories?" body="Every saved memory will be permanently deleted from this PC."
        confirmLabel="Clear all" onCancel={() => setConfirmClear(false)}
        onConfirm={() => { setConfirmClear(false); void api.clearMemories().then(() => { void load(); toast.push('All memories cleared.', 'success') }).catch((e: Error) => toast.push(e.message, 'error')) }} />
    </motion.aside>
  )
}
