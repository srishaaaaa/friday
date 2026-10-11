import { memo, useId } from 'react'
import { ORB_LABEL as LABEL, type OrbState } from './AIOrb'
import { webPath } from './SpiderWeb'

const T = 'rgb(var(--tint-rgb))'
const A2 = 'rgb(var(--accent2-rgb))'
const A3 = 'rgb(var(--accent3-rgb))'

/** Eyes change shape with state: round (awake), arcs (happy), flat lines (asleep). */
function Eyes({ state, id }: { state: OrbState; id: string }) {
  if (state === 'success') {
    return (
      <g className="bot-eyes" stroke={`url(#eye-${id})`} strokeWidth="4.2" strokeLinecap="round" fill="none" filter={`url(#glow-${id})`}>
        <path d="M80 82 q7 -9 14 0" /><path d="M106 82 q7 -9 14 0" />
      </g>
    )
  }
  if (state === 'offline') {
    return (
      <g className="bot-eyes" stroke="rgb(var(--muted-rgb))" strokeWidth="3.4" strokeLinecap="round">
        <path d="M80 81 h14" /><path d="M106 81 h14" />
      </g>
    )
  }
  return (
    <g className="bot-eyes" filter={`url(#glow-${id})`}>
      <g className="bot-blink">
        <ellipse cx="87" cy="80" rx="7.2" ry="7.6" fill={`url(#eye-${id})`} />
        <ellipse cx="113" cy="80" rx="7.2" ry="7.6" fill={`url(#eye-${id})`} />
        <circle cx="89.5" cy="77.5" r="2" fill="#fff" fillOpacity="0.9" />
        <circle cx="115.5" cy="77.5" r="2" fill="#fff" fillOpacity="0.9" />
      </g>
    </g>
  )
}

/**
 * FRIDAY's mascot for the main (welcome) page — a small faceted robot, built from SVG + CSS only (no canvas/WebGL, no JS loop).
 * Its pose and eyes are driven solely by the real application `state`.
 * `detail={false}` renders the compact head-only avatar used in headers and message rows.
 */
export const AIRobot = memo(function AIRobot({ state, size = 160, detail = true, className = '' }: {
  state: OrbState; size?: number; detail?: boolean; className?: string
}) {
  const id = useId().replace(/:/g, '')
  const defs = (
    <defs>
      <radialGradient id={`eye-${id}`} cx="40%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" style={{ stopColor: T }} />
        <stop offset="100%" style={{ stopColor: A2 }} />
      </radialGradient>
      <linearGradient id={`shell-${id}`} x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0%" style={{ stopColor: T }} stopOpacity="0.55" />
        <stop offset="55%" style={{ stopColor: A3 }} stopOpacity="0.28" />
        <stop offset="100%" style={{ stopColor: A2 }} stopOpacity="0.18" />
      </linearGradient>
      <linearGradient id={`visor-${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0b0618" />
        <stop offset="100%" stopColor="#1a0f33" />
      </linearGradient>
      <linearGradient id={`beam-${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style={{ stopColor: T }} stopOpacity="0.85" />
        <stop offset="40%" style={{ stopColor: A2 }} stopOpacity="0.35" />
        <stop offset="100%" style={{ stopColor: A2 }} stopOpacity="0" />
      </linearGradient>
      <radialGradient id={`floor-${id}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" style={{ stopColor: T }} stopOpacity="0.7" />
        <stop offset="100%" style={{ stopColor: A2 }} stopOpacity="0" />
      </radialGradient>
      <filter id={`glow-${id}`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.2" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  )

  const head = (
    <g className="bot-head">
      {/* antenna */}
      <line x1="100" y1="50" x2="100" y2="40" stroke={T} strokeOpacity="0.7" strokeWidth="1.6" />
      <circle className="bot-antenna" cx="100" cy="37" r="3.6" style={{ fill: T }} filter={`url(#glow-${id})`} />
      {/* ear pods */}
      <ellipse cx="60" cy="80" rx="5" ry="10" fill={`url(#shell-${id})`} stroke={T} strokeOpacity="0.5" strokeWidth="0.8" />
      <ellipse cx="140" cy="80" rx="5" ry="10" fill={`url(#shell-${id})`} stroke={T} strokeOpacity="0.5" strokeWidth="0.8" />
      {/* faceted shell */}
      <path d="M64 78 Q64 50 100 50 Q136 50 136 78 Q136 108 100 108 Q64 108 64 78Z" fill={`url(#shell-${id})`} stroke={T} strokeOpacity="0.75" strokeWidth="1.1" />
      <g stroke={T} strokeOpacity="0.22" strokeWidth="0.6" fill="none">
        <path d="M100 50 L82 63 L66 70 M100 50 L118 63 L134 70 M82 63 L118 63 M66 92 L82 103 L100 108 L118 103 L134 92" />
      </g>
      {/* visor */}
      <rect x="72" y="64" width="56" height="32" rx="15" fill={`url(#visor-${id})`} stroke={T} strokeOpacity="0.45" strokeWidth="0.9" />
      <path d="M78 69 Q100 63 122 69" stroke="#fff" strokeOpacity="0.12" strokeWidth="1.4" fill="none" />
      <Eyes state={state} id={id} />
    </g>
  )

  if (!detail) {
    return (
      <div className={`bot bot-mini ${className}`} data-state={state} style={{ width: size, height: size }} role="img" aria-label={`FRIDAY: ${LABEL[state]}`}>
        <div className="bot-aura" />
        <svg viewBox="54 30 92 84" width={size} height={size} aria-hidden>{defs}{head}</svg>
      </div>
    )
  }

  return (
    <div className={`bot ${className}`} data-state={state} style={{ width: size, height: size * 1.45 }} role="img" aria-label={`FRIDAY: ${LABEL[state]}`}>
      <div className="bot-aura" />
      <span className="pulse-ring" />
      {/* viewBox cropped to the figure (+ beam) so `size` is the robot's real width */}
      <svg viewBox="40 28 120 174" width={size} height={size * 1.45} aria-hidden>
        {defs}
        {/* light beam + floor glow */}
        <path className="bot-beam" d="M88 150 L112 150 L150 214 L50 214 Z" fill={`url(#beam-${id})`} />
        <ellipse className="bot-floor" cx="100" cy="212" rx="46" ry="6" fill={`url(#floor-${id})`} />
        {/* sparks */}
        <g className="bot-sparks">
          {[[70, 170, 1.6], [128, 160, 1.3], [84, 196, 1.1], [118, 188, 1.7], [100, 176, 1.2], [56, 150, 1], [144, 140, 1.1]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} style={{ fill: i % 2 ? A2 : T, animationDelay: `${-i * 0.6}s` }} />
          ))}
        </g>
        <g className="bot-float">
          {/* arms */}
          <path className="bot-arm-l" d="M70 118 Q52 122 50 140 Q60 134 72 132 Z" fill={`url(#shell-${id})`} stroke={T} strokeOpacity="0.6" strokeWidth="0.9" />
          <path className="bot-arm-r" d="M130 118 Q148 122 150 140 Q140 134 128 132 Z" fill={`url(#shell-${id})`} stroke={T} strokeOpacity="0.6" strokeWidth="0.9" />
          {/* faceted body (egg → point) */}
          <path d="M72 116 Q72 106 100 106 Q128 106 128 116 Q128 140 100 158 Q72 140 72 116Z" fill={`url(#shell-${id})`} stroke={T} strokeOpacity="0.7" strokeWidth="1" />
          <g stroke={T} strokeOpacity="0.25" strokeWidth="0.6" fill="none">
            <path d="M72 116 L100 124 L128 116 M100 106 L100 158 M78 132 L100 124 L122 132 L100 146 L78 132" />
          </g>
          <circle className="bot-core" cx="100" cy="124" r="4" style={{ fill: T }} filter={`url(#glow-${id})`} />
          {head}
        </g>
      </svg>
    </div>
  )
})

/**
 * Spider-hero variant of the mascot (Spider theme): red web-patterned mask, big white mask eyes, a small spider
 * emblem and blue arms. It hangs from a web thread and swings instead of floating on a beam.
 * Same state classes as the default robot, so thinking/writing/done/error/offline animate the same way.
 */
export const SpiderBot = memo(function SpiderBot({ state, size = 160, className = '' }: { state: OrbState; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const head = 'M64 78 Q64 50 100 50 Q136 50 136 78 Q136 108 100 108 Q64 108 64 78Z'
  const body = 'M72 116 Q72 106 100 106 Q128 106 128 116 Q128 140 100 158 Q72 140 72 116Z'
  const web = webPath({ cx: 100, cy: 84, radius: 48, threads: 12, rings: 4, sag: 0.2, jitter: 0 })
  const bodyWeb = webPath({ cx: 100, cy: 124, radius: 40, threads: 10, rings: 3, sag: 0.2, jitter: 0 })
  const happy = state === 'success'
  const asleep = state === 'offline'
  // Mask eyes: wide teardrops angled toward the nose, thick black rims.
  const leftEye = 'M76 72 Q90 66 96 80 Q94 90 82 88 Q72 84 76 72Z'
  const rightEye = 'M124 72 Q110 66 104 80 Q106 90 118 88 Q128 84 124 72Z'
  return (
    <div className={`bot bot-spider ${className}`} data-state={state} style={{ width: size, height: size * 1.45 }} role="img" aria-label={`FRIDAY: ${LABEL[state]}`}>
      <div className="bot-aura" />
      <span className="pulse-ring" />
      <svg viewBox="40 0 120 202" width={size} height={size * 1.45} aria-hidden>
        <defs>
          <linearGradient id={`suit-${id}`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#ff4b55" />
            <stop offset="55%" style={{ stopColor: 'rgb(var(--accent-rgb))' }} />
            <stop offset="100%" stopColor="#8e0f1b" />
          </linearGradient>
          <linearGradient id={`blue-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4d7cf0" />
            <stop offset="100%" style={{ stopColor: 'rgb(var(--accent2-rgb))' }} />
          </linearGradient>
          <clipPath id={`head-${id}`}><path d={head} /></clipPath>
          <clipPath id={`body-${id}`}><path d={body} /></clipPath>
        </defs>
        <g className="bot-hang">
          {/* the thread it hangs from */}
          <line x1="100" y1="-40" x2="100" y2="52" stroke="rgba(255,255,255,0.75)" strokeWidth="1.1" />
          {/* arms (blue) */}
          <path className="bot-arm-l" d="M72 116 Q52 120 48 140 Q60 134 74 131 Z" fill={`url(#blue-${id})`} stroke="#0b0b14" strokeWidth="1" />
          <path className="bot-arm-r" d="M128 116 Q148 120 152 140 Q140 134 126 131 Z" fill={`url(#blue-${id})`} stroke="#0b0b14" strokeWidth="1" />
          {/* body: red chest with web lines, blue sides, spider emblem */}
          <path d={body} fill={`url(#suit-${id})`} stroke="#0b0b14" strokeWidth="1.2" />
          <g clipPath={`url(#body-${id})`}>
            <path d="M60 128 Q74 132 82 160 L60 160Z M140 128 Q126 132 118 160 L140 160Z" fill={`url(#blue-${id})`} />
            <path d={bodyWeb} fill="none" stroke="#0b0b14" strokeOpacity="0.55" strokeWidth="0.7" />
          </g>
          <g className="bot-core" transform="translate(100 122)" fill="#0b0b14">
            <ellipse rx="3.2" ry="4.6" /><circle cy="-5.6" r="2.3" />
            <path d="M-2 -2 L-9 -7 M-2.5 0 L-10 0 M-2.5 2 L-9 6 M-1.5 3.5 L-6 9 M2 -2 L9 -7 M2.5 0 L10 0 M2.5 2 L9 6 M1.5 3.5 L6 9" stroke="#0b0b14" strokeWidth="1.1" strokeLinecap="round" />
          </g>
          {/* head: red mask with web pattern and white mask eyes */}
          <g className="bot-head">
            <path d={head} fill={`url(#suit-${id})`} stroke="#0b0b14" strokeWidth="1.4" />
            <g clipPath={`url(#head-${id})`}>
              <path d={web} fill="none" stroke="#0b0b14" strokeOpacity="0.6" strokeWidth="0.75" />
              <ellipse cx="88" cy="60" rx="16" ry="6" fill="#fff" fillOpacity="0.18" transform="rotate(-18 88 60)" />
            </g>
            <g className="bot-eyes">
              {happy || asleep ? (
                // Happy: upturned arcs. Asleep: closed lines. (Separate shapes so the blink animation can't override them.)
                <g fill="none" strokeLinecap="round">
                  {(happy ? ['M77 84 Q86 70 96 82', 'M123 84 Q114 70 104 82'] : ['M77 82 Q86 85 96 82', 'M123 82 Q114 85 104 82']).map((d) => (
                    <g key={d}><path d={d} stroke="#0b0b14" strokeWidth="7" /><path d={d} stroke={asleep ? '#9aa0ad' : '#fff'} strokeWidth="3.6" /></g>
                  ))}
                </g>
              ) : (
                <g className="bot-blink">
                  <path d={leftEye} fill="#fff" stroke="#0b0b14" strokeWidth="3" strokeLinejoin="round" />
                  <path d={rightEye} fill="#fff" stroke="#0b0b14" strokeWidth="3" strokeLinejoin="round" />
                </g>
              )}
            </g>
          </g>
        </g>
      </svg>
    </div>
  )
})
