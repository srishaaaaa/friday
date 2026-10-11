import { AnimatePresence, motion } from 'framer-motion'
import { Activity, ArrowDown, Cloud, Cpu, Download } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { dur, ease } from '../design/motion'
import type { ChatMessage, ErrorInfo, RouteMeta } from '../types/api'
import { whereFor } from '../utils/models'
import { AIOrb, type OrbState } from './AIOrb'
import { ErrorBanner } from './ErrorBanner'
import { MessageItem, type MessageActions } from './MessageItem'
import { IconButton } from './ui/primitives'

function MessageList({ messages, streaming, animateFrom, actions }: {
  messages: ChatMessage[]; streaming: boolean; animateFrom: number; actions: MessageActions
}) {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user')
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--gap-msg)]" role="log" aria-live="polite" aria-relevant="additions" aria-label="Messages">
      {messages.map((m, i) => (
        // Index keys keep rows mounted when optimistic ids are swapped for saved ids after streaming.
        <MessageItem key={i} m={m} isLast={i === messages.length - 1} isLastUser={i === lastUser} busy={streaming} animateIn={i >= animateFrom} {...actions} />
      ))}
    </div>
  )
}

export function ChatView({ title, conversationId, messages, streaming, error, route, empty, viewKey = 0, animateFrom = 0, orb = 'idle', showCore = true,
  actions, onSettings, onDismiss, onExport, onSystem, systemOpen, headerExtra }: {
  title: string; conversationId: string | null; messages: ChatMessage[]; streaming: boolean; error: ErrorInfo | null
  route: RouteMeta | null; empty: ReactNode; viewKey?: number; animateFrom?: number; orb?: OrbState; showCore?: boolean
  actions: MessageActions; onSettings(): void; onDismiss(): void; onExport?(): void; onSystem?(): void; systemOpen?: boolean
  headerExtra?: ReactNode
}) {
  const onRegenerate = actions.onRegenerate
  const scroller = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)
  const pinnedRef = useRef(true)
  const last = messages[messages.length - 1]
  const isEmpty = messages.length === 0

  // Follow the stream only while the reader is at the bottom; never yank them away from older messages.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [messages.length, last?.content, error])
  useEffect(() => { pinnedRef.current = true; setPinned(true) }, [viewKey])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    pinnedRef.current = atBottom
    setPinned(atBottom)
  }, [])
  const jump = () => {
    const el = scroller.current
    if (!el) return
    pinnedRef.current = true; setPinned(true)
    el.scrollTo({ top: el.scrollHeight, behavior: document.documentElement.dataset.motion === 'full' ? 'smooth' : 'auto' })
  }
  const where = route ? whereFor(route.provider, route.model) : null

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Conversation">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <AnimatePresence initial={false}>
            {showCore && !isEmpty && (
              <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: dur.panel, ease: ease.out }}>
                <AIOrb state={orb} size={34} detail={false} />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.h1 key={title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: dur.ui }}
                className="truncate text-[0.95rem] font-bold tracking-tight">{title}</motion.h1>
            </AnimatePresence>
            {where && route && (
              <p className="flex items-center gap-1.5 truncate text-xs text-faint" title={route.reason}>
                {where.remote ? <Cloud size={11} /> : <Cpu size={11} />}{where.label} · {route.model} <span className="hidden truncate md:inline">· {route.reason}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerExtra}
          {conversationId && onExport && <IconButton label="Export as Markdown" onClick={onExport}><Download size={17} /></IconButton>}
          {onSystem && <IconButton label="System status" shortcut="Ctrl+I" active={systemOpen} onClick={onSystem}><Activity size={17} /></IconButton>}
        </div>
      </header>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-2">
        <AnimatePresence mode="wait" initial={false}>
          {isEmpty ? (
            <motion.div key="empty" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8, transition: { duration: dur.ui } }}>{empty}</motion.div>
          ) : (
            <motion.div key={`list-${viewKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.ui }}>
              <MessageList messages={messages} streaming={streaming} animateFrom={animateFrom} actions={actions} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {!pinned && !isEmpty && (
          <motion.button initial={{ opacity: 0, y: 8, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }} transition={{ duration: dur.ui }}
            className="glass-float btn absolute bottom-4 left-1/2 z-panel !rounded-full !px-3.5 !py-1.5 text-xs text-ink" aria-label="Scroll to latest" onClick={jump}>
            <ArrowDown size={14} />{streaming ? 'New output below' : 'Jump to latest'}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: dur.ui, ease: ease.out }} className="px-5 pb-2">
            <ErrorBanner error={error} onRetry={messages.length ? onRegenerate : undefined} onSettings={onSettings} onDismiss={onDismiss} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
