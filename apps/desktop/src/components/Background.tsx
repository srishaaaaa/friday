import { memo, useEffect, useRef } from 'react'
import type { Accent } from '../hooks/usePrefs'
import { ThemeDecor } from './ThemeDecor'

// Deterministic, tiny particle set — positioned once, animated by CSS only.
const MOTES = Array.from({ length: 16 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 97.13 + n * 13.7) + 1) / 2)
  return { left: `${(r(1) * 100).toFixed(1)}%`, top: `${(40 + r(2) * 60).toFixed(1)}%`, dur: `${(18 + r(3) * 22).toFixed(1)}s`, delay: `${(-r(4) * 30).toFixed(1)}s` }
})

/**
 * Cinematic backdrop: CSS gradients, drifting blooms, faint grid, sparse motes, and a pointer-following light.
 * The only JS is a rAF-throttled pointer listener, attached only while `interactive` is true.
 */
export const Background = memo(function Background({ ambient, interactive, theme }: { ambient: boolean; interactive: boolean; theme?: Accent }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !interactive || !ambient) return
    let frame = 0, x = 0, y = 0
    const root = document.documentElement.style
    const apply = () => {
      frame = 0; el.style.setProperty('--mx', `${x}px`); el.style.setProperty('--my', `${y}px`)
      // normalised -1..1 for mascot eye-tracking and decor parallax
      root.setProperty('--look-x', ((x / innerWidth) * 2 - 1).toFixed(3)); root.setProperty('--look-y', ((y / innerHeight) * 2 - 1).toFixed(3))
    }
    const onMove = (e: PointerEvent) => { x = e.clientX; y = e.clientY; if (!frame) frame = requestAnimationFrame(apply) }
    const onLeave = () => { el.dataset.pointer = 'off' }
    const onEnter = () => { el.dataset.pointer = 'on' }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    document.addEventListener('pointerenter', onEnter)
    el.dataset.pointer = 'on'
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('pointerenter', onEnter)
      el.dataset.pointer = 'off'
      root.setProperty('--look-x', '0'); root.setProperty('--look-y', '0')
    }
  }, [interactive, ambient])

  return (
    <>
    {theme && <ThemeDecor theme={theme} />}
    <div ref={ref} className="ambient" aria-hidden>
      {ambient && <>
        <div className="bloom bloom-a" />
        <div className="bloom bloom-b" />
        <div className="bloom bloom-c" />
        <div className="grid" />
        <svg className="orbits" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice">
          <ellipse cx="500" cy="380" rx="520" ry="150" fill="none" stroke="rgb(var(--accent-rgb) / 0.10)" strokeWidth="0.8" transform="rotate(-8 500 380)" />
          <ellipse cx="500" cy="380" rx="430" ry="230" fill="none" stroke="rgb(var(--accent3-rgb) / 0.07)" strokeWidth="0.8" strokeDasharray="2 8" transform="rotate(12 500 380)" />
        </svg>
        {MOTES.map((m, i) => <span key={i} className="mote" style={{ left: m.left, top: m.top, animationDuration: m.dur, animationDelay: m.delay }} />)}
        {theme && ['violet', 'cyan', 'blue', 'emerald'].includes(theme) && <div className="aurora"><span /><span /></div>}
        <div className="cursor-light" />
      </>}
    </div>
    </>
  )
})
