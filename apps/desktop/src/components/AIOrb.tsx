import { memo, useId } from 'react'

export type OrbState = 'idle' | 'thinking' | 'generating' | 'success' | 'error' | 'offline'

export const ORB_LABEL: Record<OrbState, string> = {
  idle: 'Ready', thinking: 'Thinking', generating: 'Writing a response', success: 'Done',
  error: 'Something went wrong', offline: 'No AI provider available',
}

/**
 * FRIDAY's AI core: layered SVG + CSS (no canvas/WebGL, no JS animation loop).
 * The visual state is driven only by real application state passed in `state`.
 */
export const AIOrb = memo(function AIOrb({ state, size = 160, detail = true, className = '' }: {
  state: OrbState; size?: number; detail?: boolean; className?: string
}) {
  const id = useId().replace(/:/g, '')
  const tint = 'rgb(var(--tint-rgb))'
  return (
    <div className={`orb ${className}`} data-state={state} style={{ width: size, height: size }} role="img" aria-label={`FRIDAY: ${ORB_LABEL[state]}`}>
      <div className="orb-glow" />
      <span className="pulse-ring" />
      <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden>
        <defs>
          <radialGradient id={`core-${id}`} cx="42%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="22%" style={{ stopColor: tint }} stopOpacity="0.95" />
            <stop offset="62%" style={{ stopColor: 'rgb(var(--accent2-rgb))' }} stopOpacity="0.75" />
            <stop offset="100%" style={{ stopColor: 'rgb(var(--accent3-rgb))' }} stopOpacity="0.15" />
          </radialGradient>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: tint }} stopOpacity="0.9" />
            <stop offset="55%" style={{ stopColor: 'rgb(var(--accent2-rgb))' }} stopOpacity="0.25" />
            <stop offset="100%" style={{ stopColor: 'rgb(var(--accent3-rgb))' }} stopOpacity="0.8" />
          </linearGradient>
          <radialGradient id={`haze-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="55%" style={{ stopColor: tint }} stopOpacity="0" />
            <stop offset="100%" style={{ stopColor: tint }} stopOpacity="0.18" />
          </radialGradient>
        </defs>

        {detail && <circle cx="100" cy="100" r="94" fill="none" stroke={`url(#ring-${id})`} strokeOpacity="0.28" strokeWidth="0.6" strokeDasharray="1.5 7" className="spin-rev" />}
        <circle cx="100" cy="100" r="62" fill="none" stroke={tint} strokeOpacity="0.6" strokeWidth="1" className="converge" />

        <g className="spin">
          <ellipse cx="100" cy="100" rx="84" ry="28" fill="none" stroke={`url(#ring-${id})`} strokeWidth="1.1" strokeOpacity="0.75" transform="rotate(-22 100 100)" />
          {detail && <>
            <circle cx="178" cy="69" r="2.4" style={{ fill: tint }} />
            <circle cx="24" cy="132" r="1.6" style={{ fill: 'rgb(var(--accent3-rgb))' }} />
          </>}
        </g>
        <g className="spin-rev">
          <ellipse cx="100" cy="100" rx="76" ry="44" fill="none" stroke={`url(#ring-${id})`} strokeWidth="0.9" strokeOpacity="0.5" transform="rotate(38 100 100)" />
          {detail && <circle cx="150" cy="150" r="1.8" style={{ fill: 'rgb(var(--accent2-rgb))' }} />}
        </g>
        {detail && (
          <g className="spin" style={{ animationDuration: 'calc(var(--spin) * 1.6)' }}>
            <ellipse cx="100" cy="100" rx="60" ry="60" fill="none" stroke={tint} strokeOpacity="0.16" strokeWidth="0.8" strokeDasharray="22 10 4 10" />
          </g>
        )}

        <g className="core">
          <circle cx="100" cy="100" r="46" fill={`url(#haze-${id})`} />
          <circle cx="100" cy="100" r="33" fill={`url(#core-${id})`} />
          <circle cx="100" cy="100" r="33" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.6" />
          <ellipse cx="90" cy="88" rx="11" ry="7" fill="#fff" fillOpacity="0.35" transform="rotate(-30 90 88)" />
        </g>
      </svg>
    </div>
  )
})
