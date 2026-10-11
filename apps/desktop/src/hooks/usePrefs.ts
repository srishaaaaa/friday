import { useCallback, useEffect, useState } from 'react'

/**
 * Per-device UI preferences. Model/routing/theme settings live in the backend (useChat);
 * purely visual choices live here, in localStorage, and are applied as data-attributes on <html>.
 */
export type Accent = 'cyan' | 'blue' | 'violet' | 'emerald' | 'spider' | 'iron' | 'loki' | 'scarlet' | 'upside'
export type MotionPref = 'full' | 'reduced' | 'off'
export type GlassPref = 'full' | 'reduced' | 'solid'
export interface Prefs {
  accent: Accent
  motion: MotionPref
  glass: GlassPref
  density: 'comfortable' | 'compact'
  showCore: boolean
  ambient: boolean
  sidebarCollapsed: boolean
  onboarded: boolean
}

export const DEFAULT_PREFS: Prefs = {
  accent: 'violet', motion: 'full', glass: 'full', density: 'comfortable',
  showCore: true, ambient: true, sidebarCollapsed: false, onboarded: false,
}
const KEY = 'friday.prefs.v1'

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<Prefs> & { palette?: number }) : {}
    // Palette v2 made violet the house color; move earlier default-cyan installs over once.
    if (saved.palette !== 2 && saved.accent === 'cyan') saved.accent = 'violet'
    return { ...DEFAULT_PREFS, ...saved }
  } catch { return DEFAULT_PREFS }
}

function useOsReducedMotion(): boolean {
  const q = '(prefers-reduced-motion: reduce)'
  const [v, setV] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const m = matchMedia(q)
    const on = () => setV(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return v
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load)
  const osReduced = useOsReducedMotion()
  /** The OS setting always wins: 'full' degrades to 'reduced' when the system asks for less motion. */
  const motion: MotionPref = osReduced && prefs.motion === 'full' ? 'reduced' : prefs.motion
  const animate = motion === 'full'

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch }
      try { localStorage.setItem(KEY, JSON.stringify({ ...next, palette: 2 })) } catch { /* storage unavailable: keep in memory */ }
      return next
    })
  }, [])

  useEffect(() => {
    const d = document.documentElement.dataset
    d.accent = prefs.accent
    d.motion = animate ? 'full' : 'reduced'
    d.glass = prefs.glass
    d.density = prefs.density
  }, [prefs.accent, prefs.glass, prefs.density, animate])

  return { prefs, update, motion, animate }
}
