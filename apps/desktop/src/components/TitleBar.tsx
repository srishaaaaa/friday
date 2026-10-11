import { Command, Minus, Pin, PinOff, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { StatusDot, type Health } from './ui/primitives'

/** Frameless window chrome: drag region, connection indicator, palette hint and window controls. */
export function TitleBar({ status, statusText, onPalette }: { status: Health; statusText: string; onPalette(): void }) {
  const w = window.friday?.window
  const [max, setMax] = useState(false)
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    if (!w) return
    void w.isMaximized().then(setMax)
    void w.isPinned?.().then(setPinned).catch(() => undefined)
    return w.onMaximizeChange(setMax)
  }, [w])
  const btn = 'no-drag grid h-9 w-11 place-items-center text-mute transition-colors duration-150 hover:bg-ink/10 hover:text-ink'
  return (
    // z-[95]: above dialogs/onboarding (z-modal 80) so the window can always be moved, minimized or closed.
    <div className="drag relative z-[95] flex h-9 shrink-0 items-center justify-between pl-4 text-xs text-mute">
      <div className="flex items-center gap-2.5">
        <StatusDot status={status} label={statusText} />
        <span className="font-medium">{statusText}</span>
      </div>
      <button className="no-drag absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-line px-3 py-1 text-faint transition-colors hover:border-line-strong hover:text-ink md:flex"
        onClick={onPalette} aria-label="Open command palette">
        <Command size={12} />Search or run a command<span className="kbd !text-[0.62rem]">Ctrl K</span>
      </button>
      {w && (
        <div className="flex">
          <button className={`${btn} ${pinned ? '!text-accent' : ''}`} aria-label={pinned ? 'Stop keeping on top' : 'Keep on top'} aria-pressed={pinned} title={pinned ? 'Pinned on top' : 'Keep on top'}
            onClick={() => void w.togglePin().then((v) => setPinned(Boolean(v)))}>{pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
          <button className={btn} aria-label="Minimize" onClick={() => void w.minimize()}><Minus size={15} /></button>
          <button className={btn} aria-label={max ? 'Restore' : 'Maximize'} onClick={() => void w.maximize()}><Square size={12} /></button>
          <button className={`${btn} hover:!bg-danger/85 hover:!text-white`} aria-label="Close" onClick={() => void w.close()}><X size={16} /></button>
        </div>
      )}
    </div>
  )
}
