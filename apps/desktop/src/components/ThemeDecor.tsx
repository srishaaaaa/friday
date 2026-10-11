import { memo, type CSSProperties } from 'react'
import type { Accent } from '../hooks/usePrefs'
import { SpiderWebs } from './SpiderWeb'

/** Deterministic pseudo-random in [0, 1) so decorations look scattered but never shift between renders. */
const rnd = (i: number, n: number) => (Math.sin(i * 91.17 + n * 47.3) + 1) / 2

// ------------------------------------------------------------------ Arc Armor: HUD overlay
function Ring({ r, dash, ticks = 0, rev }: { r: number; dash: string; ticks?: number; rev?: boolean }) {
  return (
    <g className={rev ? 'hud-spin-rev' : 'hud-spin'}>
      <circle cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray={dash} />
      {Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * Math.PI * 2
        return <line key={i} x1={100 + Math.cos(a) * (r - 4)} y1={100 + Math.sin(a) * (r - 4)} x2={100 + Math.cos(a) * r} y2={100 + Math.sin(a) * r} stroke="currentColor" strokeWidth="1" />
      })}
    </g>
  )
}
const IronHud = memo(function IronHud() {
  const reticle = (style: CSSProperties, size: number) => (
    <svg className="hud-reticle" viewBox="0 0 200 200" style={{ ...style, width: size, height: size }}>
      <Ring r={92} dash="2 6" ticks={36} />
      <Ring r={74} dash="40 12 8 12" rev />
      <Ring r={56} dash="1 3" />
      <path d="M100 30 L100 44 M100 156 L100 170 M30 100 L44 100 M156 100 L170 100" stroke="currentColor" strokeWidth="1.4" />
      {/* live status — exactly one is visible, chosen by CSS from FRIDAY's real state (data-ai) */}
      <g className="hud-txt" fontFamily="JetBrains Mono Variable, Consolas, monospace" fontSize="9" textAnchor="middle" fill="currentColor">
        <text x="100" y="98" className="hud-standby">STANDBY</text>
        <text x="100" y="98" className="hud-analyzing">ANALYZING</text>
        <text x="100" y="98" className="hud-generating">GENERATING</text>
        <text x="100" y="98" className="hud-offline">NO POWER</text>
        <text x="100" y="112" fontSize="6" opacity="0.7">F.R.I.D.A.Y.</text>
      </g>
    </svg>
  )
  const bracket = 'M0 22 L0 0 L22 0'
  return (
    <div className="theme-decor decor-iron" aria-hidden>
      {reticle({ right: -60, top: 40 }, 260)}
      {reticle({ left: -80, bottom: -60 }, 320)}
      {[{ left: 14, top: 44 }, { right: 14, top: 44, transform: 'scaleX(-1)' }, { left: 14, bottom: 14, transform: 'scaleY(-1)' }, { right: 14, bottom: 14, transform: 'scale(-1)' }].map((s, i) => (
        <svg key={i} className="hud-bracket" viewBox="0 0 24 24" style={{ position: 'absolute', width: 34, height: 34, ...s }}>
          <path d={bracket} fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      ))}
      <div className="hud-scan" />
    </div>
  )
})

// ------------------------------------------------------------------ Trickster: drifting runes + gold filigree
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'
const LokiRunes = memo(function LokiRunes() {
  return (
    <div className="theme-decor decor-loki" aria-hidden>
      <div className="loki-mist loki-mist-a" /><div className="loki-mist loki-mist-b" />
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} className="rune" style={{
          left: `${(rnd(i, 1) * 96).toFixed(1)}%`, top: `${(30 + rnd(i, 2) * 70).toFixed(1)}%`, fontSize: `${12 + rnd(i, 3) * 14}px`,
          animationDuration: `${16 + rnd(i, 4) * 18}s`, animationDelay: `${(-rnd(i, 5) * 30).toFixed(1)}s`,
          color: i % 3 ? 'rgb(var(--accent2-rgb) / 0.55)' : 'rgb(var(--accent-rgb) / 0.6)',
        }}>{RUNES[i % RUNES.length]}</span>
      ))}
      {[{ left: 0, top: 36 }, { right: 0, top: 36, transform: 'scaleX(-1)' }].map((s, i) => (
        <svg key={i} viewBox="0 0 160 160" style={{ position: 'absolute', width: 170, height: 170, ...s }} className="loki-filigree">
          <path d="M0 6 Q60 6 80 40 Q96 70 70 80 Q50 86 52 66 Q55 52 68 58 M0 30 Q40 34 52 66 M6 0 Q8 60 40 80 Q64 96 74 120 Q80 140 60 150"
            fill="none" stroke="rgb(var(--accent2-rgb) / 0.5)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      ))}
    </div>
  )
})

// ------------------------------------------------------------------ Scarlet Hex: chaos-magic wisps + sigils
const WISPS = [
  'M-40 620 C 160 520, 260 700, 420 560 S 700 420, 900 520 S 1200 640, 1340 500',
  'M-60 120 C 120 220, 300 40, 480 150 S 760 260, 980 120 S 1240 60, 1360 180',
  'M1340 760 C 1140 640, 980 800, 800 690 S 520 560, 300 700 S 60 800, -60 700',
]
function Sigil({ style, size }: { style: CSSProperties; size: number }) {
  const star = Array.from({ length: 6 }, (_, i) => { const a = (i * 2 * Math.PI) / 6 - Math.PI / 2; return `${100 + Math.cos(a) * 62},${100 + Math.sin(a) * 62}` })
  return (
    <svg className="hex-sigil" viewBox="0 0 200 200" style={{ position: 'absolute', width: size, height: size, ...style }}>
      <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 5" />
      <polygon points={star.join(' ')} fill="none" stroke="currentColor" strokeWidth="1" />
      <polygon points={[0, 2, 4].map((i) => star[i]).join(' ')} fill="none" stroke="currentColor" strokeWidth="1" />
      <polygon points={[1, 3, 5].map((i) => star[i]).join(' ')} fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}
const ScarletWisps = memo(function ScarletWisps() {
  return (
    <div className="theme-decor decor-scarlet" aria-hidden>
      <svg className="wisps" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="wisp-g" x1="0" x2="1"><stop offset="0%" stopColor="rgb(var(--accent-rgb))" stopOpacity="0" /><stop offset="50%" stopColor="rgb(var(--accent2-rgb))" stopOpacity="0.55" /><stop offset="100%" stopColor="rgb(var(--accent-rgb))" stopOpacity="0" /></linearGradient>
        </defs>
        {WISPS.map((d, i) => <path key={i} className="wisp" d={d} style={{ animationDelay: `${-i * 3.3}s` }} />)}
      </svg>
      <Sigil style={{ right: -50, top: 60 }} size={240} />
      <Sigil style={{ left: -70, bottom: -40 }} size={300} />
    </div>
  )
})

// ------------------------------------------------------------------ Upside Down: spores, vines, lightning
const UpsideDown = memo(function UpsideDown() {
  const vine = (flip: boolean) => (
    <svg viewBox="0 0 300 300" className="upside-vine" style={{ position: 'absolute', bottom: -6, [flip ? 'right' : 'left']: -6, width: 300, height: 300, transform: flip ? 'scaleX(-1)' : undefined }}>
      <path d="M0 300 C 40 230, 30 190, 80 160 S 140 120, 150 70 M80 160 C 110 170, 150 150, 190 170 S 240 210, 280 190 M40 230 C 70 240, 90 270, 130 280 M150 70 C 160 50, 150 30, 170 10 M190 170 C 200 140, 230 130, 250 110"
        fill="none" stroke="#1a0b0f" strokeWidth="7" strokeLinecap="round" />
      <path d="M0 300 C 40 230, 30 190, 80 160 S 140 120, 150 70 M80 160 C 110 170, 150 150, 190 170 S 240 210, 280 190"
        fill="none" stroke="rgb(var(--accent-rgb) / 0.35)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
  return (
    <div className="theme-decor decor-upside" aria-hidden>
      <div className="upside-flash" />
      {vine(false)}{vine(true)}
      {Array.from({ length: 34 }, (_, i) => (
        <span key={i} className="spore" style={{
          left: `${(rnd(i, 1) * 100).toFixed(1)}%`, top: `${(rnd(i, 2) * 100).toFixed(1)}%`,
          width: 2 + rnd(i, 3) * 3, height: 2 + rnd(i, 3) * 3,
          animationDuration: `${14 + rnd(i, 4) * 16}s, ${3 + rnd(i, 6) * 3}s`, animationDelay: `${(-rnd(i, 5) * 30).toFixed(1)}s, 0s`,
        }} />
      ))}
    </div>
  )
})

/** Background effects for character themes (rendered above the backdrop, below dialogs, never clickable). */
export function ThemeDecor({ theme }: { theme: Accent }) {
  switch (theme) {
    case 'spider': return <SpiderWebs />
    case 'iron': return <IronHud />
    case 'loki': return <LokiRunes />
    case 'scarlet': return <ScarletWisps />
    case 'upside': return <UpsideDown />
    default: return null
  }
}
