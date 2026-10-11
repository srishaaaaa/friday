import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dur, ease } from '../design/motion'

type Kind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: Kind; text: string; ttl: number }
interface Ctx { push(text: string, kind?: Kind): void }

const ToastCtx = createContext<Ctx>({ push: () => undefined })
export const useToast = () => useContext(ToastCtx)

const ICON = { success: CheckCircle2, error: AlertTriangle, info: Info }
const TONE = { success: 'text-ok', error: 'text-danger', info: 'text-accent' }

function ToastItem({ t, onDone }: { t: Toast; onDone(): void }) {
  useEffect(() => { const h = setTimeout(onDone, t.ttl); return () => clearTimeout(h) }, [t.ttl, onDone])
  const Icon = ICON[t.kind]
  return (
    <motion.div layout initial={{ opacity: 0, x: 40, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, transition: { duration: dur.ui, ease: ease.inOut } }} transition={{ duration: dur.panel, ease: ease.out }}
      className="glass-float pointer-events-auto relative flex w-80 items-start gap-3 overflow-hidden rounded-md px-4 py-3 text-sm">
      <Icon size={17} className={`mt-0.5 shrink-0 ${TONE[t.kind]}`} />
      <p className="flex-1 leading-snug">{t.text}</p>
      <button className="icon-btn -m-1 !p-1" aria-label="Dismiss notification" onClick={onDone}><X size={14} /></button>
      <motion.span aria-hidden className={`absolute bottom-0 left-0 h-[2px] ${t.kind === 'error' ? 'bg-danger' : 'bg-accent'}`}
        initial={{ width: '100%' }} animate={{ width: 0 }} transition={{ duration: t.ttl / 1000, ease: 'linear' }} />
    </motion.div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const push = useCallback((text: string, kind: Kind = 'info') => {
    setToasts((ts) => {
      if (ts.some((t) => t.text === text)) return ts // never stack identical notifications
      return [...ts.slice(-3), { id: ++seq.current, kind, text, ttl: kind === 'error' ? 6500 : 3200 }]
    })
  }, [])
  const ctx = useMemo(() => ({ push }), [push])
  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-toast flex flex-col items-end gap-2" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => <ToastItem key={t.id} t={t} onDone={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))} />)}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}
