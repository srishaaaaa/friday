import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { pop } from '../../design/motion'

export interface MenuItem {
  id: string
  label: ReactNode
  icon?: ReactNode
  hint?: ReactNode
  danger?: boolean
  disabled?: boolean
  selected?: boolean
  onSelect(): void
}
export interface MenuSection { title?: string; items: MenuItem[] }

/** Close on outside pointer-down / Escape. */
export function useDismiss(open: boolean, refs: React.RefObject<HTMLElement>[], onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!refs.some((r) => r.current?.contains(e.target as Node))) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true) }
  }, [open, onClose, refs])
}

/**
 * Keyboard-navigable floating list (role=menu or listbox). Arrow keys move, Enter/Space select,
 * Home/End jump, typing focuses nothing (kept simple). The selection indicator glides between items.
 */
export function MenuList({ sections, role = 'menu', label, onClose, className = '' }: {
  sections: MenuSection[]; role?: 'menu' | 'listbox'; label: string; onClose(): void; className?: string
}) {
  const flat = sections.flatMap((s) => s.items).filter((i) => !i.disabled)
  const initial = Math.max(0, flat.findIndex((i) => i.selected))
  const [active, setActive] = useState(initial)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => { ref.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView?.({ block: "nearest" }) }, [active])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % flat.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + flat.length) % flat.length) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(flat.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const it = flat[active]; if (it) { it.onSelect(); onClose() } }
    else if (e.key === 'Tab') onClose()
  }
  const itemRole = role === 'menu' ? 'menuitem' : 'option'
  return (
    <div ref={ref} role={role} aria-label={label} tabIndex={-1} onKeyDown={onKey}
      aria-activedescendant={flat[active] ? `mi-${flat[active].id}` : undefined}
      className={`glass-float max-h-[min(420px,60vh)] overflow-y-auto rounded-md p-1.5 outline-none ${className}`}>
      {sections.map((s, si) => (
        <div key={si} role="group" aria-label={s.title} className={si ? 'mt-1.5 border-t border-line pt-1.5' : ''}>
          {s.title && <p className="label-xs px-2.5 pb-1 pt-1.5">{s.title}</p>}
          {s.items.map((it) => {
            const idx = flat.indexOf(it)
            const on = idx === active
            return (
              <div key={it.id} id={`mi-${it.id}`} role={itemRole} data-idx={idx} aria-disabled={it.disabled || undefined}
                aria-selected={role === 'listbox' ? !!it.selected : undefined}
                onPointerMove={() => idx >= 0 && setActive(idx)}
                onClick={() => { if (!it.disabled) { it.onSelect(); onClose() } }}
                className={`relative flex cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm ${it.disabled ? 'cursor-not-allowed opacity-40' : ''} ${it.danger ? 'text-danger' : 'text-ink'}`}>
                {on && <motion.span layoutId={`menu-hl-${label}`} className="absolute inset-0 -z-0 rounded-sm bg-ink/[0.07]" transition={{ type: 'spring', stiffness: 700, damping: 45 }} />}
                {it.icon && <span className="relative shrink-0 text-mute">{it.icon}</span>}
                <span className="relative min-w-0 flex-1">{it.label}</span>
                {it.hint && <span className="relative shrink-0 text-xs text-faint">{it.hint}</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Anchored dropdown: trigger + animated floating MenuList. */
export function FloatingMenu({ trigger, sections, label, role = 'menu', align = 'left', placement = 'top', className = '' }: {
  trigger: (p: { open: boolean; toggle(): void; ref: React.RefObject<HTMLButtonElement> }) => ReactNode
  sections: MenuSection[]; label: string; role?: 'menu' | 'listbox'; align?: 'left' | 'right'; placement?: 'top' | 'bottom'; className?: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const pane = useRef<HTMLDivElement>(null)
  const close = () => { setOpen(false); btn.current?.focus() }
  useDismiss(open, [btn, pane], () => setOpen(false))
  return (
    <div className="relative min-w-0">
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: btn })}
      <AnimatePresence>
        {open && (
          <motion.div ref={pane} variants={pop} initial="hidden" animate="show" exit="exit"
            className={`absolute z-menu ${placement === 'top' ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'} ${align === 'left' ? 'left-0' : 'right-0'} ${className}`}>
            <MenuList sections={sections} role={role} label={label} onClose={close} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
