import { AnimatePresence, motion } from 'framer-motion'
import { Activity, Archive, ArchiveRestore, Brain, Check, Download, MessageSquarePlus, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Search, Settings, Trash2, X } from 'lucide-react'
import { forwardRef, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { dur, ease } from '../design/motion'
import type { ConversationSummary } from '../types/api'
import { groupByDate } from '../utils/dates'
import { AIOrb, type OrbState } from './AIOrb'
import { ConfirmDialog } from './ui/Dialog'
import { MenuList, useDismiss } from './ui/Menu'
import { Tooltip } from './ui/primitives'

interface Props {
  conversations: ConversationSummary[]
  activeId: string | null
  search: string
  onSearch(v: string): void
  onOpen(id: string): void
  onNew(): void
  onRename(id: string, title: string): void
  onDelete(id: string): void
  onSettings(): void
  collapsed: boolean
  onToggle(): void
  onSystem?(): void
  onExport?(id: string): void
  systemOpen?: boolean
  loading?: boolean
  onMemory?(): void
  memoryOpen?: boolean
  showArchived?: boolean
  onToggleArchived?(): void
  onArchive?(id: string, archived: boolean): void
  orb?: OrbState
}

function Row({ c, active, onOpen, onRename, onAskDelete, onExport, onArchive }: {
  c: ConversationSummary; active: boolean; onOpen(): void; onRename(t: string): void; onAskDelete(): void; onExport?(): void; onArchive?(): void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(c.title)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const pane = useRef<HTMLDivElement>(null)
  useDismiss(!!menu, [pane], () => setMenu(null))
  const startEdit = () => { setTitle(c.title); setEditing(true) }

  if (editing) {
    return (
      <form className="flex items-center gap-1 py-0.5 pl-1" onSubmit={(e) => { e.preventDefault(); if (title.trim()) onRename(title.trim()); setEditing(false) }}>
        <input autoFocus className="field !py-1.5" value={title} aria-label="Conversation title" maxLength={200} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false) } }} />
        <button className="icon-btn !p-1.5" aria-label="Save title" type="submit"><Check size={15} /></button>
        <button className="icon-btn !p-1.5" aria-label="Cancel rename" type="button" onClick={() => setEditing(false)}><X size={15} /></button>
      </form>
    )
  }
  return (
    <div className="group relative flex items-center rounded-sm"
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}>
      {active && <motion.span layoutId="conv-active" className="absolute inset-0 rounded-sm bg-ink/[0.07]" transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_10px_rgb(var(--accent-rgb)/0.8)]" />
      </motion.span>}
      <button className={`relative min-w-0 flex-1 truncate rounded-sm px-3 py-[var(--row-y)] text-left text-sm transition-colors duration-150 ${active ? 'text-ink' : 'text-mute hover:bg-ink/[0.04] hover:text-ink'}`}
        aria-current={active ? 'true' : undefined} onClick={onOpen} title={c.title}>{c.title}</button>
      <div className="relative flex pr-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
        <button className="icon-btn !p-1.5" aria-label={`Rename ${c.title}`} onClick={startEdit}><Pencil size={13} /></button>
        <button className="icon-btn !p-1.5 hover:!text-danger" aria-label={`Delete ${c.title}`} onClick={onAskDelete}><Trash2 size={13} /></button>
        <button className="icon-btn !p-1.5" aria-label={`More actions for ${c.title}`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 176, y: r.bottom + 4 }) }}><MoreHorizontal size={14} /></button>
      </div>
      {createPortal(<AnimatePresence>
        {menu && (
          <motion.div ref={pane} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: dur.micro, ease: ease.out }}
            className="fixed z-menu w-44 origin-top-left" style={{ left: Math.min(Math.max(8, menu.x), innerWidth - 184), top: Math.min(menu.y, innerHeight - 200) }}>
            <MenuList label={`Actions for ${c.title}`} onClose={() => setMenu(null)} sections={[{ items: [
              { id: 'open', label: 'Open', onSelect: onOpen },
              { id: 'rename', label: 'Rename', icon: <Pencil size={14} />, onSelect: startEdit },
              ...(onExport ? [{ id: 'export', label: 'Export as Markdown', icon: <Download size={14} />, onSelect: onExport }] : []),
              ...(onArchive ? [{ id: 'archive', label: c.archived ? 'Unarchive' : 'Archive', icon: c.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />, onSelect: onArchive }] : []),
              { id: 'delete', label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: onAskDelete },
            ] }]} />
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </div>
  )
}

const RailButton = forwardRef<HTMLButtonElement, { label: string; shortcut?: string; onClick(): void; children: React.ReactNode; active?: boolean }>(
  function RailButton({ label, shortcut, onClick, children, active }, ref) {
    return (
      <Tooltip label={label} side="right" shortcut={shortcut}>
        <button ref={ref} className={`icon-btn !p-2.5 ${active ? '!text-accent bg-accent/10' : ''}`} aria-label={label} onClick={onClick}>{children}</button>
      </Tooltip>
    )
  })

export function Sidebar(p: Props) {
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const groups = groupByDate(p.conversations)
  const c = p.collapsed

  return (
    <motion.nav aria-label="Sidebar" initial={false} animate={{ width: c ? 68 : 280 }} transition={{ duration: dur.sidebar, ease: ease.out }}
      className="glass-frost flex shrink-0 flex-col overflow-hidden rounded-xl">
      {/* brand */}
      <div className={`flex items-center px-3 pb-2 pt-3 ${c ? 'flex-col gap-2' : 'justify-between'}`}>
        <div className="flex min-w-0 items-center gap-2.5 pl-0.5">
          <AIOrb state={p.orb ?? 'idle'} size={32} detail={false} />
          <AnimatePresence initial={false}>
            {!c && <motion.span key="wm" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: dur.ui }}
              className="text-[1.05rem] font-extrabold tracking-[0.22em]">FRIDAY</motion.span>}
          </AnimatePresence>
        </div>
        <Tooltip label={c ? 'Expand sidebar' : 'Collapse sidebar'} side={c ? 'right' : 'bottom'} shortcut="Ctrl+B">
          <button className="icon-btn" aria-label={c ? 'Expand sidebar' : 'Collapse sidebar'} onClick={p.onToggle}>
            {c ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </Tooltip>
      </div>

      {c ? (
        <div className="flex flex-1 flex-col items-center gap-1.5 pt-2">
          <RailButton label="New conversation" shortcut="Ctrl+N" onClick={p.onNew}><MessageSquarePlus size={18} /></RailButton>
          <RailButton label="Search conversations" shortcut="Ctrl+F" onClick={() => { p.onToggle(); setTimeout(() => searchRef.current?.focus(), dur.sidebar * 1000) }}><Search size={18} /></RailButton>
          <div className="flex-1" />
          {p.onMemory && <RailButton label="Memory" shortcut="Ctrl+M" onClick={p.onMemory} active={p.memoryOpen}><Brain size={18} /></RailButton>}
          {p.onSystem && <RailButton label="System status" shortcut="Ctrl+I" onClick={p.onSystem} active={p.systemOpen}><Activity size={18} /></RailButton>}
          <RailButton label="Settings" shortcut="Ctrl+," onClick={p.onSettings}><Settings size={18} /></RailButton>
          <div className="h-2" />
        </div>
      ) : (
        <motion.div key="full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: dur.ui, delay: 0.08 }} className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          <button className="btn-primary mt-1 w-full justify-between" onClick={p.onNew}>
            <span className="flex items-center gap-2"><MessageSquarePlus size={16} />New conversation</span>
            <span className="text-[0.68rem] font-semibold opacity-60">Ctrl+N</span>
          </button>
          <div className="group relative mt-3">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint transition-colors group-focus-within:text-accent" />
            <input ref={searchRef} id="conv-search" className="field !pl-9 !pr-8" placeholder="Search conversations" aria-label="Search conversations" value={p.search}
              onChange={(e) => p.onSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && p.search) { e.stopPropagation(); p.onSearch('') } }} />
            {p.search && <button className="icon-btn absolute right-1 top-1/2 -translate-y-1/2 !p-1" aria-label="Clear search" onClick={() => p.onSearch('')}><X size={13} /></button>}
          </div>

          {p.showArchived && <p className="label-xs mt-3 flex items-center gap-1.5 px-1 !text-accent"><Archive size={12} />Archived conversations</p>}
          <div className="-mx-1 mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
            {p.loading && groups.length === 0 && (
              <div className="space-y-2 px-1 pt-1" aria-label="Loading conversations">
                {[70, 85, 55].map((w) => <div key={w} className="shimmer h-7 rounded-sm" style={{ width: `${w}%` }} />)}
              </div>
            )}
            {!p.loading && groups.length === 0 && (
              <p className="px-2 pt-2 text-sm leading-relaxed text-faint">{p.search ? 'No conversations match your search.' : p.showArchived ? 'No archived conversations.' : 'Your conversations will appear here.'}</p>
            )}
            {groups.map(([label, items], gi) => (
              <motion.section key={label} aria-label={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.panel, ease: ease.out, delay: gi * 0.05 }}>
                <h2 className="label-xs px-3 pb-1.5">{label}</h2>
                <div className="space-y-0.5">
                  {items.map((conv) => (
                    <Row key={conv.id} c={conv} active={conv.id === p.activeId} onOpen={() => p.onOpen(conv.id)}
                      onRename={(t) => p.onRename(conv.id, t)} onAskDelete={() => setPendingDelete(conv)}
                      onExport={p.onExport ? () => p.onExport!(conv.id) : undefined}
                      onArchive={p.onArchive ? () => p.onArchive!(conv.id, !conv.archived) : undefined} />
                  ))}
                </div>
              </motion.section>
            ))}
          </div>

          <div className="mt-2 space-y-0.5 border-t border-line pt-2">
            {p.onToggleArchived && (
              <button className={`btn-ghost w-full justify-between ${p.showArchived ? '!text-accent' : ''}`} onClick={p.onToggleArchived} aria-pressed={p.showArchived}>
                <span className="flex items-center gap-2.5"><Archive size={16} />{p.showArchived ? 'Back to conversations' : 'Archived'}</span>
              </button>
            )}
            {p.onMemory && (
              <button className={`btn-ghost w-full justify-between ${p.memoryOpen ? '!text-accent' : ''}`} onClick={p.onMemory} aria-pressed={p.memoryOpen}>
                <span className="flex items-center gap-2.5"><Brain size={16} />Memory</span><span className="text-[0.68rem] opacity-60">Ctrl+M</span>
              </button>
            )}
            {p.onSystem && (
              <button className={`btn-ghost w-full justify-between ${p.systemOpen ? '!text-accent' : ''}`} onClick={p.onSystem} aria-pressed={p.systemOpen}>
                <span className="flex items-center gap-2.5"><Activity size={16} />System</span><span className="text-[0.68rem] opacity-60">Ctrl+I</span>
              </button>
            )}
            <button className="btn-ghost w-full justify-between" onClick={p.onSettings}>
              <span className="flex items-center gap-2.5"><Settings size={16} />Settings</span><span className="text-[0.68rem] opacity-60">Ctrl+,</span>
            </button>
          </div>
        </motion.div>
      )}

      <ConfirmDialog open={!!pendingDelete} title="Delete conversation?"
        body={<>“{pendingDelete?.title}” and all of its messages will be permanently removed from this PC.</>}
        confirmLabel="Delete" confirmAria={pendingDelete ? `Confirm delete ${pendingDelete.title}` : undefined}
        onCancel={() => setPendingDelete(null)} onConfirm={() => { if (pendingDelete) p.onDelete(pendingDelete.id); setPendingDelete(null) }} />
    </motion.nav>
  )
}
