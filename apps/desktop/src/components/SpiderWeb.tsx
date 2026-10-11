import { memo } from 'react'

/**
 * Procedural spider web: radial threads from an anchor point plus "rings" whose segments sag toward the
 * anchor (quadratic curves), which is what makes it read as silk rather than a grid.
 * `from`/`to` are angles in degrees, so a corner web spans 90° and a full web spans 360°.
 */
export function webPath({ cx, cy, radius, threads, rings, from = 0, to = 360, sag = 0.18, jitter = 0.06 }: {
  cx: number; cy: number; radius: number; threads: number; rings: number; from?: number; to?: number; sag?: number; jitter?: number
}): string {
  const full = to - from >= 360
  const n = full ? threads : threads - 1
  const angles = Array.from({ length: threads }, (_, i) => ((from + ((to - from) * i) / n) * Math.PI) / 180)
  const wob = (i: number, j: number) => 1 + Math.sin(i * 12.9898 + j * 78.233) * jitter // deterministic irregularity
  let d = ''
  for (const a of angles) d += `M${cx},${cy}L${(cx + Math.cos(a) * radius).toFixed(1)},${(cy + Math.sin(a) * radius).toFixed(1)}`
  for (let j = 1; j <= rings; j++) {
    const r = (radius * j) / (rings + 0.4)
    const pts = angles.map((a, i) => [cx + Math.cos(a) * r * wob(i, j), cy + Math.sin(a) * r * wob(i, j)])
    if (full) pts.push(pts[0])
    d += `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
      const qx = mx + (cx - mx) * sag, qy = my + (cy - my) * sag // pull the midpoint toward the hub
      d += `Q${qx.toFixed(1)},${qy.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
    }
  }
  return d
}

/** Tiny web glyph for the theme swatch. */
export function WebGlyph({ size = 28, color = 'rgba(0,0,0,0.55)' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className="pointer-events-none absolute inset-0">
      <path d={webPath({ cx: 20, cy: 20, radius: 22, threads: 8, rings: 3, sag: 0.22, jitter: 0 })} fill="none" stroke={color} strokeWidth="1" />
    </svg>
  )
}

const CORNERS = [
  { key: 'tl', style: { left: -10, top: -10 }, cx: 0, cy: 0, from: 0, to: 90, size: 340 },
  { key: 'tr', style: { right: -10, top: -10 }, cx: 400, cy: 0, from: 90, to: 180, size: 280 },
  { key: 'br', style: { right: -10, bottom: -10 }, cx: 400, cy: 400, from: 180, to: 270, size: 360 },
  { key: 'bl', style: { left: -10, bottom: -10 }, cx: 0, cy: 400, from: 270, to: 360, size: 220 },
] as const

/** Corner webs + a dangling thread with a little spider. Decorative only; sways via CSS. */
export const SpiderWebs = memo(function SpiderWebs() {
  return (
    <div className="spider-webs" aria-hidden>
      {CORNERS.map((c, i) => (
        <svg key={c.key} className={`web web-${c.key}`} viewBox="0 0 400 400" style={{ ...c.style, width: c.size, height: c.size, animationDelay: `${-i * 1.7}s` }}>
          <path d={webPath({ cx: c.cx, cy: c.cy, radius: 400, threads: 7, rings: 7, from: c.from, to: c.to, sag: 0.16 })}
            fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          {/* glints that run along the silk while FRIDAY is working */}
          <path className="web-glint" d={webPath({ cx: c.cx, cy: c.cy, radius: 400, threads: 7, rings: 7, from: c.from, to: c.to, sag: 0.16 })}
            fill="none" strokeWidth="1.8" strokeLinecap="round" style={{ animationDelay: `${-i * 0.9}s` }} />
        </svg>
      ))}
      <svg className="web-drop" viewBox="0 0 40 260" style={{ right: '22%', top: 0, width: 40, height: 260 }}>
        <line x1="20" y1="0" x2="20" y2="214" stroke="currentColor" strokeWidth="1" />
        <g transform="translate(20 226)">
          <ellipse rx="6.5" ry="8.5" fill="rgb(var(--accent-rgb))" />
          <circle cy="-10" r="4.5" fill="rgb(var(--accent-rgb))" />
          <path d="M-5 -4 L-15 -12 M-6 0 L-17 -2 M-6 4 L-16 9 M-4 7 L-12 17 M5 -4 L15 -12 M6 0 L17 -2 M6 4 L16 9 M4 7 L12 17"
            stroke="rgb(var(--accent-rgb))" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="-1.6" cy="-11" r="1.1" fill="#fff" /><circle cx="1.6" cy="-11" r="1.1" fill="#fff" />
        </g>
      </svg>
    </div>
  )
})
