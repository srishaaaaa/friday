import { useEffect, useRef, useState } from 'react'
import type { Accent } from '../hooks/usePrefs'
import { webPath } from './SpiderWeb'

/**
 * A short, themed full-screen flourish when the user switches theme (never on startup, skipped with reduced
 * motion). Pure CSS animation; unmounts itself after ~1s and never blocks input.
 */
export function ThemeTransition({ theme, enabled }: { theme: Accent; enabled: boolean }) {
  const prev = useRef(theme)
  const [run, setRun] = useState<{ theme: Accent; n: number } | null>(null)
  useEffect(() => {
    if (prev.current === theme) return
    prev.current = theme
    if (!enabled) return
    setRun((r) => ({ theme, n: (r?.n ?? 0) + 1 }))
    const t = setTimeout(() => setRun(null), 1100)
    return () => clearTimeout(t)
  }, [theme, enabled])
  if (!run) return null
  const t = run.theme
  return (
    <div key={run.n} className={`theme-fx fx-${t}`} aria-hidden>
      {t === 'spider' && (
        <svg viewBox="-200 -200 400 400" className="fx-web">
          <path d={webPath({ cx: 0, cy: 0, radius: 200, threads: 14, rings: 7, sag: 0.18 })} fill="none" stroke="#fff" strokeWidth="1.4" />
        </svg>
      )}
      {t === 'iron' && <><div className="fx-flash" /><div className="fx-ring" /><div className="fx-ring fx-ring-2" /></>}
      {t === 'loki' && <><div className="fx-smoke fx-smoke-a" /><div className="fx-smoke fx-smoke-b" /><div className="fx-smoke fx-smoke-c" /></>}
      {t === 'scarlet' && (
        <svg viewBox="0 0 200 200" className="fx-sigil">
          <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" />
          <polygon points="100,22 168,139 32,139" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <polygon points="100,178 32,61 168,61" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      {t === 'upside' && <><div className="fx-flicker" /><div className="fx-rift" /></>}
      {['violet', 'cyan', 'blue', 'emerald'].includes(t) && <div className="fx-wash" />}
    </div>
  )
}
