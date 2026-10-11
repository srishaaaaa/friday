import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Activity, Archive, Brain, Cloud, Cpu, MessageSquarePlus, Moon, PanelLeft, Settings, ShieldAlert, Smile, Sparkles, Sun, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OrbState } from './components/AIOrb'
import { Background } from './components/Background'
import { ChatView } from './components/ChatView'
import { CommandPalette, type Command } from './components/CommandPalette'
import { Composer } from './components/Composer'
import { DocumentPanel } from './components/DocumentPanel'
import { MemoryPanel } from './components/MemoryPanel'
import type { MessageActions } from './components/MessageItem'
import { Onboarding } from './components/Onboarding'
import { SettingsPanel, type SettingsTab } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { SystemPanel } from './components/SystemPanel'
import { ThemeTransition } from './components/ThemeTransition'
import { TitleBar } from './components/TitleBar'
import { ConfirmDialog } from './components/ui/Dialog'
import type { Health } from './components/ui/primitives'
import { WelcomeState } from './components/WelcomeState'
import { dur, ease } from './design/motion'
import { useChat } from './hooks/useChat'
import { usePrefs } from './hooks/usePrefs'
import { useToast } from './hooks/useToasts'
import { api } from './services/api'
import type { Attachment, ChatMessage } from './types/api'
import { readiness } from './utils/models'

function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    // resize already fires at most once per frame; no rAF here (rAF is paused while minimized).
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

/** The single contextual panel slot on the right. */
type Panel = { kind: 'system' } | { kind: 'memory' } | { kind: 'doc'; att: Attachment } | null

export default function App() {
  const chat = useChat()
  const { prefs, update: updatePrefs, animate } = usePrefs()
  const toast = useToast()
  const width = useWindowWidth()
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [memoryRefresh, setMemoryRefresh] = useState(0)
  const [replayIntro, setReplayIntro] = useState(false)
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null)
  const [dropped, setDropped] = useState<{ files: File[]; n: number } | null>(null)
  const [editing, setEditing] = useState<{ text: string; n: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [success, setSuccess] = useState(false)

  const s = chat.settings
  const theme = s?.theme ?? 'dark'
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  const narrow = width < 900
  const collapsed = narrow || prefs.sidebarCollapsed
  const panelOverlay = width < 1240
  const togglePanel = useCallback((kind: 'system' | 'memory') => setPanel((p) => (p?.kind === kind ? null : { kind })), [])

  // ----- AI core state: derived only from real application state -----
  const wasStreaming = useRef(false)
  useEffect(() => {
    if (wasStreaming.current && !chat.streaming && !chat.error) {
      setSuccess(true)
      const t = setTimeout(() => setSuccess(false), 1200)
      wasStreaming.current = chat.streaming
      return () => clearTimeout(t)
    }
    wasStreaming.current = chat.streaming
  }, [chat.streaming, chat.error])
  const ready = readiness(s, chat.providers)
  const backendDown = chat.error?.code === 'backend_unavailable'
  const last = chat.messages[chat.messages.length - 1]
  const orb: OrbState = chat.streaming ? (last?.content ? 'generating' : 'thinking')
    : backendDown || (ready.checked && !ready.ready) ? 'offline'
      : chat.error ? 'error' : success ? 'success' : 'idle'

  // Expose FRIDAY's live state to CSS so theme backgrounds can react to thinking/writing/offline.
  useEffect(() => { document.documentElement.dataset.ai = orb }, [orb])

  const status: { h: Health; text: string } = backendDown ? { h: 'error', text: 'Backend offline' }
    : !s ? { h: 'checking', text: 'Connecting…' }
      : !ready.checked ? { h: 'checking', text: 'Checking providers…' }
        : ready.ready ? { h: 'ok', text: `Online · ${s.default_mode[0].toUpperCase()}${s.default_mode.slice(1)} mode` }
          : { h: 'warn', text: 'No AI provider ready' }

  const openSettings = useCallback((tab: SettingsTab = 'appearance') => setSettingsTab(tab), [])
  const toggleSidebar = useCallback(() => { if (!narrow) updatePrefs({ sidebarCollapsed: !prefs.sidebarCollapsed }) }, [narrow, prefs.sidebarCollapsed, updatePrefs])
  const focusSearch = useCallback(() => {
    if (collapsed) updatePrefs({ sidebarCollapsed: false })
    setTimeout(() => document.getElementById('conv-search')?.focus(), collapsed ? 320 : 0)
  }, [collapsed, updatePrefs])

  const exportConversation = useCallback(async (id: string) => {
    try {
      const title = chat.conversations.find((c) => c.id === id)?.title ?? 'conversation'
      const text = await api.exportConversation(id, 'md')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
      a.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'conversation'}.md`
      a.click(); URL.revokeObjectURL(a.href)
      toast.push('Conversation exported as Markdown.', 'success')
    } catch (e) { toast.push((e as Error).message || 'Export failed.', 'error') }
  }, [chat.conversations, toast])

  const remember = useCallback(async (text: string) => {
    const t = text.trim()
    if (!t) return
    try {
      await api.addMemory(t, 'message')
      setMemoryRefresh((n) => n + 1)
      toast.push(s?.memory_enabled === false ? 'Saved to memory (long-term memory is currently off).' : 'Saved to memory.', 'success')
    } catch (e) { toast.push((e as Error).message, 'error') }
  }, [s?.memory_enabled, toast])

  // Stable message actions: rows are memoized, so callbacks read the latest chat state through a ref.
  const latest = useRef({ chat, remember })
  latest.current = { chat, remember }
  const actions = useMemo<MessageActions>(() => ({
    onRegenerate: () => void latest.current.chat.regenerate(),
    onEdit: (m: ChatMessage) => setEditing((e) => ({ text: m.content, n: (e?.n ?? 0) + 1 })),
    onFeedback: (id, v) => void latest.current.chat.feedback(id, v),
    onRemember: (text) => void latest.current.remember(text),
    onOpenAttachment: (att) => setPanel({ kind: 'doc', att }),
    onApproveTool: (id, ok) => void latest.current.chat.approveTool(id, ok),
  }), [])

  // ----- global shortcuts -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
      else if (k === 'n' && !e.shiftKey) { e.preventDefault(); chat.newChat() }
      else if (k === ',') { e.preventDefault(); openSettings() }
      else if (k === 'b') { e.preventDefault(); toggleSidebar() }
      else if (k === 'i') { e.preventDefault(); togglePanel('system') }
      else if (k === 'm') { e.preventDefault(); togglePanel('memory') }
      else if (k === 'f') { e.preventDefault(); focusSearch() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chat.newChat, openSettings, toggleSidebar, focusSearch, togglePanel])

  const commands = useMemo<Command[]>(() => {
    if (!s) return []
    const modeCmd = (m: 'local' | 'smart' | 'cloud', icon: JSX.Element): Command => ({
      id: `mode-${m}`, label: `Switch to ${m[0].toUpperCase()}${m.slice(1)} mode${s.default_mode === m ? ' (current)' : ''}`, icon, group: 'Routing',
      run: () => void chat.updateSettings({ default_mode: m }),
    })
    return [
      { id: 'new', label: 'New conversation', icon: <MessageSquarePlus size={15} />, shortcut: 'Ctrl+N', group: 'Actions', run: chat.newChat },
      { id: 'search', label: 'Search conversations', icon: <PanelLeft size={15} />, shortcut: 'Ctrl+F', group: 'Actions', run: focusSearch },
      { id: 'memory', label: 'Open memory', icon: <Brain size={15} />, shortcut: 'Ctrl+M', group: 'Actions', run: () => setPanel({ kind: 'memory' }) },
      { id: 'system', label: 'Show system status', icon: <Activity size={15} />, shortcut: 'Ctrl+I', group: 'Actions', run: () => setPanel({ kind: 'system' }) },
      { id: 'archived', label: chat.showArchived ? 'Show conversations' : 'Show archived conversations', icon: <Archive size={15} />, group: 'Actions', run: () => chat.setShowArchived((v) => !v) },
      { id: 'sidebar', label: collapsed ? 'Expand sidebar' : 'Collapse sidebar', icon: <PanelLeft size={15} />, shortcut: 'Ctrl+B', group: 'Actions', run: toggleSidebar },
      modeCmd('local', <Cpu size={15} />), modeCmd('smart', <Sparkles size={15} />), modeCmd('cloud', <Cloud size={15} />),
      { id: 'theme', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />, group: 'Appearance', run: () => void chat.updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' }) },
      { id: 'motion', label: prefs.motion === 'full' ? 'Reduce animations' : 'Enable full animations', icon: <Wand2 size={15} />, group: 'Appearance', run: () => updatePrefs({ motion: prefs.motion === 'full' ? 'reduced' : 'full' }) },
      { id: 'settings', label: 'Open settings', icon: <Settings size={15} />, shortcut: 'Ctrl+,', group: 'Settings', run: () => openSettings() },
      { id: 'personality', label: 'Personality & response style', icon: <Smile size={15} />, group: 'Settings', run: () => openSettings('personality') },
      { id: 'providers', label: 'Manage AI providers & models', icon: <Cpu size={15} />, group: 'Settings', run: () => openSettings('providers') },
      { id: 'intro', label: 'Replay welcome sequence', icon: <Sparkles size={15} />, group: 'Settings', run: () => setReplayIntro(true) },
    ]
  }, [s, chat.newChat, chat.updateSettings, chat.showArchived, chat.setShowArchived, focusSearch, collapsed, toggleSidebar, theme, prefs.motion, updatePrefs, openSettings])

  const title = chat.conversations.find((c) => c.id === chat.activeId)?.title ?? (chat.messages.length ? 'New conversation' : 'Welcome')
  const showOnboarding = (!prefs.onboarded || replayIntro) && !!s

  return (
    <MotionConfig reducedMotion={animate ? 'never' : 'always'} transition={{ duration: dur.ui, ease: ease.out }}>
      <Background ambient={prefs.ambient} interactive={animate} theme={prefs.accent} />
      <ThemeTransition theme={prefs.accent} enabled={animate} />
      <div className="relative flex h-full flex-col">
        <TitleBar status={status.h} statusText={status.text} onPalette={() => setPaletteOpen(true)} />
        <main className="flex min-h-0 flex-1 gap-3 px-3 pb-3 max-sm:gap-2 max-sm:px-2 max-sm:pb-2">
          <motion.div className="flex" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: dur.scene * 0.7, ease: ease.out }}>
            <Sidebar conversations={chat.conversations} activeId={chat.activeId} search={chat.search} onSearch={chat.setSearch} loading={chat.loadingList}
              onOpen={(id) => void chat.open(id)} onNew={chat.newChat} orb={orb}
              onRename={(id, t) => void chat.rename(id, t).then((ok) => ok && toast.push('Conversation renamed.', 'success'))}
              onDelete={(id) => void chat.remove(id).then((ok) => ok && toast.push('Conversation deleted.', 'success'))}
              onArchive={(id, a) => void chat.archive(id, a).then((ok) => ok && toast.push(a ? 'Conversation archived.' : 'Conversation restored.', 'success'))}
              showArchived={chat.showArchived} onToggleArchived={() => chat.setShowArchived((v) => !v)}
              onExport={(id) => void exportConversation(id)}
              onSettings={() => openSettings()} onSystem={() => togglePanel('system')} systemOpen={panel?.kind === 'system'}
              onMemory={() => togglePanel('memory')} memoryOpen={panel?.kind === 'memory'}
              collapsed={collapsed} onToggle={narrow ? () => undefined : toggleSidebar} />
          </motion.div>

          <motion.div className="relative flex min-h-0 min-w-0 flex-1 gap-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.scene * 0.8, ease: ease.out, delay: 0.08 }}>
            <div className="surface relative flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-line" style={{ background: 'rgb(var(--bg1-rgb) / 0.38)' }}
              onDragOver={(e) => { if (s && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const files = [...e.dataTransfer.files]; if (files.length) setDropped((d) => ({ files, n: (d?.n ?? 0) + 1 })) }}>
              <ChatView title={title} conversationId={chat.activeId} messages={chat.messages} streaming={chat.streaming}
                error={chat.error} route={chat.lastRoute} viewKey={chat.view.key} animateFrom={chat.view.animateFrom}
                orb={orb} showCore={prefs.showCore} actions={actions}
                onSettings={() => openSettings('providers')} onDismiss={() => chat.setError(null)}
                onExport={chat.activeId ? () => void exportConversation(chat.activeId!) : undefined}
                onSystem={() => togglePanel('system')} systemOpen={panel?.kind === 'system'}
                empty={s
                  ? <WelcomeState providers={chat.providers} settings={s} orb={orb} showCore={prefs.showCore} theme={prefs.accent} onSettings={() => openSettings('providers')}
                      onSuggest={(text) => setPrefill((p) => ({ text, n: (p?.n ?? 0) + 1 }))} />
                  : <div className="grid h-full place-items-center"><div className="space-y-3 text-center"><div className="shimmer mx-auto h-24 w-24 rounded-full" /><p className="text-sm text-mute">{backendDown ? chat.error?.message : 'Connecting to the FRIDAY backend…'}</p></div></div>} />
              {s && (
                <div className="shrink-0 px-4 pb-4 max-sm:px-2 max-sm:pb-2">
                  <Composer streaming={chat.streaming} settings={s} models={chat.models} providers={chat.providers} restored={chat.restored} prefill={prefill}
                    dropped={dropped} editing={editing}
                    onSend={(t, atts) => void chat.send(t, atts)}
                    onEdit={(t) => { setEditing(null); void chat.edit(t) }} onCancelEdit={() => setEditing(null)}
                    onStop={chat.stop} onRefreshModels={chat.refreshProviders}
                    onSettings={(p) => void chat.updateSettings(p).then((ok) => {
                      const switched = p.ollama_model ?? p.hosted_model
                      if (ok && switched) toast.push(`Now using ${switched} — your conversation continues.`, 'success')
                    })}
                    onOpenAttachment={(att) => setPanel({ kind: 'doc', att })} onNotify={(m) => toast.push(m, 'error')} />
                </div>
              )}
              <AnimatePresence>
                {dragOver && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="pointer-events-none absolute inset-2 z-panel grid place-items-center rounded-xl border-2 border-dashed border-accent/50 bg-accent/[0.06] text-sm font-semibold text-accent">
                    Drop files to attach them to your message
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence mode="wait">
              {panel?.kind === 'system' && s && (
                <SystemPanel key="system" providers={chat.providers} models={chat.models} settings={s} overlay={panelOverlay}
                  onRefresh={chat.refreshProviders} onClose={() => setPanel(null)} />
              )}
              {panel?.kind === 'memory' && s && (
                <MemoryPanel key="memory" enabled={s.memory_enabled} refreshKey={memoryRefresh} overlay={panelOverlay}
                  onToggleEnabled={(v) => void chat.updateSettings({ memory_enabled: v })} onClose={() => setPanel(null)} />
              )}
              {panel?.kind === 'doc' && (
                <DocumentPanel key={`doc-${panel.att.id}`} attachment={panel.att} overlay={panelOverlay} onClose={() => setPanel(null)} />
              )}
            </AnimatePresence>
          </motion.div>
        </main>
      </div>

      {s && (
        <SettingsPanel open={settingsTab !== null} initialTab={settingsTab ?? 'appearance'} settings={s} providers={chat.providers} models={chat.models}
          prefs={prefs} onPrefs={updatePrefs} onClose={() => setSettingsTab(null)}
          onChange={(p) => void chat.updateSettings(p)} onRefresh={() => void chat.refreshProviders()}
          onDeleteAll={() => void chat.removeAll().then((ok) => ok && toast.push('All conversations deleted.', 'success'))}
          onReplayIntro={() => { setSettingsTab(null); setReplayIntro(true) }} onOpenMemory={() => setPanel({ kind: 'memory' })} />
      )}
      <ConfirmDialog open={!!chat.pendingConfirm} danger={false} title="Send private content off this device?"
        body={<>
          <span className="mb-2 flex items-start gap-2 text-ink"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-warn" />{chat.pendingConfirm?.message}</span>
          This conversation includes attached files, which FRIDAY treats as private. Cancel to keep your draft and switch to an on-device model or Local mode instead.
        </>}
        confirmLabel="Send anyway" onCancel={chat.cancelPending} onConfirm={() => void chat.confirmPending()} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} conversations={chat.conversations}
        onOpenConversation={(id) => void chat.open(id)} />
      <AnimatePresence>
        {showOnboarding && (
          <Onboarding key="onboarding" settings={s} providers={chat.providers} models={chat.models} prefs={prefs} onPrefs={updatePrefs}
            onChange={(p) => void chat.updateSettings(p)} onRefresh={() => void chat.refreshProviders()}
            onDone={() => { updatePrefs({ onboarded: true }); setReplayIntro(false) }} />
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
