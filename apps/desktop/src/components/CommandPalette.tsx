import { motion } from 'framer-motion'
import { CornerDownLeft, MessageSquare, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ConversationSummary } from '../types/api'
import { AnimatedDialog } from './ui/Dialog'

export interface Command { id: string; label: string; icon: ReactNode; shortcut?: string; group: string; run(): void }

/** Ctrl+K palette — every entry triggers a real application action. */
export function CommandPalette({ open, onClose, commands, conversations, onOpenConversation }: {
  open: boolean; onClose(): void; commands: Command[]; conversations: ConversationSummary[]; onOpenConversation(id: string): void
}) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) { setQ(''); setActive(0) } }, [open])

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const cmds = commands.filter((c) => !needle || c.label.toLowerCase().includes(needle))
    const convs: Command[] = conversations
      .filter((c) => !needle || c.title.toLowerCase().includes(needle)).slice(0, needle ? 12 : 6)
      .map((c) => ({ id: `conv-${c.id}`, label: c.title, icon: <MessageSquare size={15} />, group: 'Conversations', run: () => onOpenConversation(c.id) }))
    return [...cmds, ...convs]
  }, [q, commands, conversations, onOpenConversation])
  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, items.length - 1))) }, [items.length])
  useEffect(() => { list.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView?.({ block: "nearest" }) }, [active])

  const run = (c?: Command) => { if (!c) return; onClose(); setTimeout(c.run, 0) }
  let lastGroup = ''

  return (
    <AnimatedDialog open={open} onClose={onClose} label="Command palette" width="max-w-xl" className="mt-[10vh] self-start">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={17} className="shrink-0 text-accent" />
        <input data-autofocus className="h-14 flex-1 bg-transparent text-[0.97rem] text-ink outline-none placeholder:text-faint" placeholder="Type a command or search conversations…"
          aria-label="Command" aria-controls="cmd-list" aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
          value={q} onChange={(e) => { setQ(e.target.value); setActive(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); run(items[active]) }
          }} />
        <span className="kbd">Esc</span>
      </div>
      <div ref={list} id="cmd-list" role="listbox" aria-label="Commands" className="max-h-[50vh] overflow-y-auto p-2">
        {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-faint">No matching commands or conversations.</p>}
        {items.map((c, i) => {
          const header = c.group !== lastGroup ? (lastGroup = c.group) : null
          return (
            <div key={c.id}>
              {header && <p className="label-xs px-3 pb-1 pt-2.5">{header}</p>}
              <div id={`cmd-${c.id}`} role="option" aria-selected={i === active} data-idx={i} onPointerMove={() => setActive(i)} onClick={() => run(c)}
                className="relative flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2.5 text-sm">
                {i === active && <motion.span layoutId="cmd-hl" className="absolute inset-0 rounded-sm bg-accent/10 ring-1 ring-accent/25" transition={{ type: 'spring', stiffness: 700, damping: 45 }} />}
                <span className={`relative ${i === active ? 'text-accent' : 'text-mute'}`}>{c.icon}</span>
                <span className="relative min-w-0 flex-1 truncate text-ink">{c.label}</span>
                {c.shortcut && <span className="kbd relative">{c.shortcut}</span>}
                {i === active && <CornerDownLeft size={14} className="relative text-faint" />}
              </div>
            </div>
          )
        })}
      </div>
    </AnimatedDialog>
  )
}
