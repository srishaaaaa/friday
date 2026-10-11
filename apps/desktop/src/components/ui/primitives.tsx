import { AnimatePresence, motion } from 'framer-motion'
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { dur, ease } from '../../design/motion'

type Side = 'top' | 'bottom' | 'right' | 'left'
const SIDE_FROM: Record<Side, { x?: number; y?: number }> = { top: { y: 4 }, bottom: { y: -4 }, right: { x: -4 }, left: { x: 4 } }
const GAP = 8

/**
 * Delayed, directional tooltip. Purely visual — the trigger carries its own aria-label.
 * Rendered in a portal with fixed coordinates so clipped/overflow-hidden containers can't cut it off.
 */
export function Tooltip({ label, side = 'top', children, disabled, shortcut }: {
  label: string; side?: Side; children: ReactNode; disabled?: boolean; shortcut?: string
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const show = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      setPos(side === 'top' ? { x: r.left + r.width / 2, y: r.top - GAP } : side === 'bottom' ? { x: r.left + r.width / 2, y: r.bottom + GAP }
        : side === 'right' ? { x: r.right + GAP, y: r.top + r.height / 2 } : { x: r.left - GAP, y: r.top + r.height / 2 })
    }, 420)
  }
  const hide = () => { clearTimeout(timer.current); setPos(null) }
  useEffect(() => () => clearTimeout(timer.current), [])
  const shift = side === 'top' ? 'translate(-50%, -100%)' : side === 'bottom' ? 'translate(-50%, 0)' : side === 'right' ? 'translate(0, -50%)' : 'translate(-100%, -50%)'
  return (
    <span ref={anchor} className="relative inline-flex" onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide} onPointerDown={hide}>
      {children}
      {createPortal(
        <AnimatePresence>
          {pos && !disabled && (
            <span className="pointer-events-none fixed z-tooltip" style={{ left: pos.x, top: pos.y, transform: shift }}>
              <motion.span role="presentation" aria-hidden
                initial={{ opacity: 0, ...SIDE_FROM[side] }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: dur.micro, ease: ease.out }}
                className="glass-float flex items-center gap-2 whitespace-nowrap rounded-sm px-2.5 py-1.5 text-xs font-medium text-ink">
                {label}{shortcut && <span className="kbd">{shortcut}</span>}
              </motion.span>
            </span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  )
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; tip?: Side | false; shortcut?: string; active?: boolean
}>(function IconButton({ label, tip = 'bottom', shortcut, active, className = '', children, ...rest }, ref) {
  const btn = (
    <button ref={ref} aria-label={label} aria-pressed={active} className={`icon-btn ${active ? '!text-accent bg-accent/10' : ''} ${className}`} {...rest}>{children}</button>
  )
  return tip ? <Tooltip label={label} side={tip} shortcut={shortcut}>{btn}</Tooltip> : btn
})

export function GlassPanel({ variant = 'frost', className = '', ...rest }: HTMLAttributes<HTMLDivElement> & {
  variant?: 'frost' | 'deep' | 'lum' | 'edge' | 'float' | 'modal' | 'clear'
}) {
  return <div className={`glass-${variant} ${className}`} {...rest} />
}

export type Health = 'ok' | 'warn' | 'error' | 'off' | 'checking'
const DOT: Record<Health, string> = { ok: 'bg-ok', warn: 'bg-warn', error: 'bg-danger', off: 'bg-faint', checking: 'bg-faint' }
const DOT_LABEL: Record<Health, string> = { ok: 'Available', warn: 'Needs attention', error: 'Unavailable', off: 'Off', checking: 'Checking' }

/** Status dot with an accessible text equivalent. Only pulses for a real "ok" signal. */
export function StatusDot({ status, label }: { status: Health; label?: string }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0" role="img" aria-label={label ?? DOT_LABEL[status]}>
      {status === 'ok' && <span className={`absolute inset-0 rounded-full ${DOT[status]} opacity-50 motion-safe:animate-ping`} style={{ animationDuration: '2.6s' }} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT[status]} ${status === 'checking' ? 'animate-pulse' : ''}`} />
    </span>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-40 ${checked ? 'border-accent/50 bg-accent/30' : 'border-line bg-ink/[0.06]'}`}>
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 36 }}
        className={`absolute top-0.5 h-[18px] w-[18px] rounded-full shadow ${checked ? 'right-0.5 bg-accent' : 'left-0.5 bg-mute'}`} />
    </button>
  )
}

/** Segmented control with a gliding selection indicator. */
export function Segmented<T extends string>({ value, options, onChange, label, id, size = 'md' }: {
  value: T; options: { id: T; label: ReactNode; hint?: string }[]; onChange(v: T): void; label: string; id: string; size?: 'sm' | 'md'
}) {
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.id === value)
    onChange(options[(i + dir + options.length) % options.length].id)
  }
  return (
    <div role="radiogroup" aria-label={label} className="glass-clear relative flex rounded-sm p-0.5"
      onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); move(1) } if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) } }}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button key={o.id} role="radio" aria-checked={on} title={o.hint} tabIndex={on ? 0 : -1} onClick={() => onChange(o.id)}
            className={`relative z-0 rounded-[8px] font-semibold transition-colors duration-150 ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} ${on ? 'text-[var(--on-accent)]' : 'text-mute hover:text-ink'}`}>
            {on && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded-[8px]" transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              style={{ background: 'linear-gradient(135deg, rgb(var(--accent-rgb)), rgb(var(--accent2-rgb)))', boxShadow: '0 4px 16px -6px rgb(var(--accent-rgb) / 0.7)' }} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
