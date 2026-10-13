import { memo, useId } from 'react'

/**
 * FRIDAY logo mark (vector redraw of the brand logo): a glossy two-part "F", a glass face with happy eyes, and a
 * tilted orbit ring with a bead. Colors come from the active theme (accent → accent2 → accent3), so the logo
 * matches every theme; `brand` forces the original blue → violet logo colors.
 */
export const FridayLogo = memo(function FridayLogo({ size = 32, brand = false, glow = true, className = '' }: {
  size?: number; brand?: boolean; glow?: boolean; className?: string
}) {
  const id = useId().replace(/:/g, '')
  const c1 = brand ? '#38c8ff' : 'rgb(var(--accent-rgb))'
  const c2 = brand ? '#4f7dff' : 'rgb(var(--accent2-rgb))'
  const c3 = brand ? '#a56bff' : 'rgb(var(--accent3-rgb))'
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`friday-logo shrink-0 ${className}`} role="img" aria-label="FRIDAY">
      <defs>
        <linearGradient id={`fl-a-${id}`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" style={{ stopColor: c1 }} /><stop offset="55%" style={{ stopColor: c2 }} /><stop offset="100%" style={{ stopColor: c3 }} />
        </linearGradient>
        <linearGradient id={`fl-b-${id}`} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" style={{ stopColor: c1 }} /><stop offset="70%" style={{ stopColor: c2 }} /><stop offset="100%" style={{ stopColor: c3 }} />
        </linearGradient>
        <radialGradient id={`fl-face-${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" style={{ stopColor: c1 }} stopOpacity="0.55" /><stop offset="70%" stopColor="#0a1030" stopOpacity="0.92" /><stop offset="100%" style={{ stopColor: c2 }} stopOpacity="0.9" />
        </radialGradient>
        <linearGradient id={`fl-shine-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" /><stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {glow && (
          <filter id={`fl-glow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>
      <g filter={glow ? `url(#fl-glow-${id})` : undefined}>
        {/* orbit, back half (behind the face) */}
        <path d="M18 60 C 14 54, 40 46, 64 44 C 82 42.5, 92 45, 90 49" fill="none" style={{ stroke: c1 }} strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
        {/* upper F: stem rising into the top bar, ending in a swept point */}
        <path d="M22 50 C 21 26, 33 11, 56 11 L 90 11 C 88 22, 80 30, 66 30 L 50 30 C 41 30, 37 35, 37 44 L 37 50 Z" fill={`url(#fl-a-${id})`} />
        <path d="M24 40 C 25 24, 35 14, 55 13.5 L 86 13.5 C 85 17, 82 20, 77 22 L 52 22 C 38 22, 31 28, 27 40 Z" fill={`url(#fl-shine-${id})`} opacity="0.55" />
        {/* lower F: stem + middle bar */}
        <path d="M22 56 L 37 54 L 37 62 L 52 62 C 60 62, 66 61, 70 58 C 68 67, 60 72, 50 72 L 37 72 L 37 92 C 28 89, 22 80, 22 70 Z" fill={`url(#fl-b-${id})`} opacity="0.95" />
        {/* glass face */}
        <circle cx="52" cy="47" r="14" fill={`url(#fl-face-${id})`} style={{ stroke: c1 }} strokeWidth="1.6" />
        <ellipse cx="47" cy="40" rx="6" ry="3" fill="#fff" fillOpacity="0.3" transform="rotate(-25 47 40)" />
        <g className="friday-logo-eyes" fill="none" stroke="#e8f6ff" strokeWidth="2.1" strokeLinecap="round">
          <path d="M44.5 49 Q 47 45.5 49.5 49" /><path d="M54.5 49 Q 57 45.5 59.5 49" />
        </g>
        {/* orbit, front half + bead */}
        <path d="M90 49 C 88 54, 62 60, 38 62 C 24 63, 17 62, 18 60" fill="none" style={{ stroke: c1 }} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="86" cy="45.5" r="2.6" fill="#e8f6ff" style={{ stroke: c1 }} strokeWidth="1" />
      </g>
    </svg>
  )
})

/** Mark + "FRIDAY" wordmark (+ optional tagline), as in the brand logo. */
export function FridayLockup({ size = 120, tagline = true, brand = false }: { size?: number; tagline?: boolean; brand?: boolean }) {
  const grad = brand ? 'linear-gradient(90deg, #38c8ff, #4f7dff 50%, #a56bff)'
    : 'linear-gradient(90deg, rgb(var(--accent-rgb)), rgb(var(--accent2-rgb)) 50%, rgb(var(--accent3-rgb)))'
  return (
    <div className="flex flex-col items-center">
      <FridayLogo size={size} brand={brand} />
      <span className="mt-3 bg-clip-text pl-[0.32em] font-extrabold tracking-[0.32em] text-transparent" style={{ backgroundImage: grad, fontSize: size * 0.34, filter: 'drop-shadow(0 0 14px rgb(var(--accent-rgb) / 0.35))' }}>FRIDAY</span>
      {tagline && <span className="mt-2 text-sm tracking-[0.12em] text-mute">Your AI. Your workspace. Your rules.</span>}
    </div>
  )
}
