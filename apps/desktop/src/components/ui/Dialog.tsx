import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { dialog, scrim } from '../../design/motion'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Traps Tab inside `ref` while mounted and restores focus to the opener on close. */
export function useFocusTrap(ref: React.RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const opener = document.activeElement as HTMLElement | null
    const root = ref.current
    const first = root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !root) return
      const els = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!els.length) return
      const a = els[0], z = els[els.length - 1]
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [active, ref])
}

export function AnimatedDialog({ open, onClose, label, children, width = 'max-w-lg', className = '', bare }: {
  open: boolean; onClose(): void; label: string; children: ReactNode; width?: string; className?: string; bare?: boolean
}) {
  // Portal: glass ancestors use backdrop-filter, which would otherwise become the containing block for `fixed`.
  return createPortal(
    <AnimatePresence>
      {open && <DialogBody onClose={onClose} label={label} width={width} className={className} bare={bare}>{children}</DialogBody>}
    </AnimatePresence>,
    document.body,
  )
}

function DialogBody({ onClose, label, children, width, className, bare }: {
  onClose(): void; label: string; children: ReactNode; width: string; className: string; bare?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, true)
  return (
    <motion.div className="fixed inset-0 z-modal grid place-items-center p-4 sm:p-8" initial="hidden" animate="show" exit="exit"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <motion.div variants={scrim} className="absolute inset-0 bg-[rgb(3_5_12/0.55)] backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <motion.div ref={ref} variants={dialog} role="dialog" aria-modal="true" aria-label={label}
        className={`${bare ? '' : 'glass-modal rounded-xl'} relative flex max-h-[calc(100vh-4rem)] w-full flex-col ${width} ${className}`}>
        {children}
      </motion.div>
    </motion.div>
  )
}

export function DialogHeader({ title, subtitle, onClose, icon }: { title: string; subtitle?: string; onClose(): void; icon?: ReactNode }) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-5">
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-mute">{subtitle}</p>}
        </div>
      </div>
      <button className="icon-btn -mr-2" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={18} /></button>
    </header>
  )
}

export function ConfirmDialog({ open, title, body, confirmLabel, confirmAria, onConfirm, onCancel, danger = true }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; confirmAria?: string; onConfirm(): void; onCancel(): void; danger?: boolean
}) {
  return (
    <AnimatedDialog open={open} onClose={onCancel} label={title} width="max-w-md">
      <div className="p-6">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-mute">{body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" data-autofocus onClick={onCancel}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} aria-label={confirmAria ?? confirmLabel} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </AnimatedDialog>
  )
}
