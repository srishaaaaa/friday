import { memo, useId, type CSSProperties, type ReactNode } from 'react'
import type { Accent } from '../hooks/usePrefs'
import { ORB_LABEL, type OrbState } from './AIOrb'
import { AIRobot, SpiderBot } from './AIRobot'

/**
 * Character-inspired welcome mascots (original artwork). All share the robot's geometry (viewBox 40 0 120 202,
 * head centred near 100,80) and its state classes — bot-float / bot-head / bot-eyes / bot-blink / bot-arm-* /
 * bot-core / bot-sparks — so every mascot reacts to the same real application state.
 */
const INK = '#0b0b10'

function Frame({ theme, state, size, children }: { theme: string; state: OrbState; size: number; children: ReactNode }) {
  return (
    <div className={`bot bot-${theme}`} data-state={state} style={{ width: size, height: size * 1.45 }} role="img" aria-label={`FRIDAY: ${ORB_LABEL[state]}`}>
      <div className="bot-aura" />
      <span className="pulse-ring" />
      <svg viewBox="40 0 120 202" width={size} height={size * 1.45} aria-hidden>{children}</svg>
    </div>
  )
}

function Sparks({ colors }: { colors: string[] }) {
  return (
    <g className="bot-sparks">
      {[[70, 170, 1.6], [128, 162, 1.3], [84, 192, 1.1], [118, 186, 1.7], [100, 176, 1.2], [58, 146, 1], [142, 138, 1.1]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={colors[i % colors.length]} style={{ animationDelay: `${-i * 0.6}s` }} />
      ))}
    </g>
  )
}

const HEAD = 'M64 78 Q64 50 100 50 Q136 50 136 78 Q136 108 100 108 Q64 108 64 78Z'
const BODY = 'M72 116 Q72 106 100 106 Q128 106 128 116 Q128 140 100 158 Q72 140 72 116Z'

// ------------------------------------------------------------------ Arc Armor
export const IronBot = memo(function IronBot({ state, size = 124 }: { state: OrbState; size?: number }) {
  const id = useId().replace(/:/g, '')
  const eye = state === 'offline' ? '#5d6470' : state === 'error' ? '#ff8a8a' : '#e9fdff'
  return (
    <Frame theme="iron" state={state} size={size}>
      <defs>
        <linearGradient id={`red-${id}`} x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stopColor="#ff4a4a" /><stop offset="60%" stopColor="#c4161f" /><stop offset="100%" stopColor="#7a0b12" /></linearGradient>
        <linearGradient id={`gold-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffe08a" /><stop offset="100%" stopColor="#c98f1c" /></linearGradient>
        <linearGradient id={`thrust-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" /><stop offset="35%" stopColor="#8be6ff" stopOpacity="0.6" /><stop offset="100%" stopColor="#3aa9ff" stopOpacity="0" /></linearGradient>
        <radialGradient id={`arc-${id}`}><stop offset="0%" stopColor="#ffffff" /><stop offset="45%" stopColor="#bff6ff" /><stop offset="100%" stopColor="#3fc6ff" stopOpacity="0.2" /></radialGradient>
      </defs>
      <path className="bot-beam" d="M92 152 L108 152 L124 200 L76 200 Z" fill={`url(#thrust-${id})`} />
      <Sparks colors={['#bff6ff', '#ffe08a']} />
      <g className="bot-float">
        <path className="bot-arm-l" d="M72 116 Q52 120 48 140 Q60 134 74 131 Z" fill={`url(#gold-${id})`} stroke={INK} strokeWidth="1" />
        <path className="bot-arm-r" d="M128 116 Q148 120 152 140 Q140 134 126 131 Z" fill={`url(#gold-${id})`} stroke={INK} strokeWidth="1" />
        <circle cx="49" cy="140" r="3.2" fill={`url(#arc-${id})`} /><circle cx="151" cy="140" r="3.2" fill={`url(#arc-${id})`} />
        <path d={BODY} fill={`url(#red-${id})`} stroke={INK} strokeWidth="1.2" />
        <path d="M84 134 Q100 140 116 134 Q112 148 100 156 Q88 148 84 134Z" fill={`url(#gold-${id})`} opacity="0.95" />
        <g className="bot-core">
          <circle cx="100" cy="121" r="8" fill="#0d1a24" stroke={INK} strokeWidth="1" />
          <circle cx="100" cy="121" r="6.2" fill="none" stroke="#9eefff" strokeWidth="1.6" strokeDasharray="2.2 1.4" />
          <circle cx="100" cy="121" r="3.4" fill={`url(#arc-${id})`} />
        </g>
        <g className="bot-head">
          <path d={HEAD} fill={`url(#red-${id})`} stroke={INK} strokeWidth="1.4" />
          <path d="M76 64 L124 64 Q127 92 112 106 L88 106 Q73 92 76 64Z" fill={`url(#gold-${id})`} stroke={INK} strokeWidth="1" />
          <path d="M88 98 L112 98" stroke={INK} strokeWidth="1.2" strokeOpacity="0.6" />
          <g className="bot-eyes"><g className="bot-blink">
            <path d="M80 76 L96 79 L95 84 L81 82Z" fill={eye} stroke={INK} strokeWidth="0.8" />
            <path d="M120 76 L104 79 L105 84 L119 82Z" fill={eye} stroke={INK} strokeWidth="0.8" />
          </g></g>
          <ellipse cx="86" cy="58" rx="12" ry="4" fill="#fff" fillOpacity="0.22" transform="rotate(-15 86 58)" />
        </g>
      </g>
    </Frame>
  )
})

// ------------------------------------------------------------------ Trickster
export const LokiBot = memo(function LokiBot({ state, size = 124 }: { state: OrbState; size?: number }) {
  const id = useId().replace(/:/g, '')
  const eye = state === 'offline' ? '#56605a' : state === 'error' ? '#ff9b8a' : '#b8ffcf'
  return (
    <Frame theme="loki" state={state} size={size}>
      <defs>
        <linearGradient id={`grn-${id}`} x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stopColor="#47d685" /><stop offset="60%" stopColor="#1d8a4e" /><stop offset="100%" stopColor="#0d4a2a" /></linearGradient>
        <linearGradient id={`gold-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fff0a8" /><stop offset="100%" stopColor="#c9961f" /></linearGradient>
      </defs>
      <ellipse className="bot-floor rune-ring" cx="100" cy="196" rx="40" ry="6" fill="none" stroke="#e7c35a" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="3 4" />
      <Sparks colors={['#6dffa8', '#f4d36b']} />
      <g className="bot-float">
        <path d="M76 112 Q62 150 70 172 Q100 160 130 172 Q138 150 124 112 Z" fill="#0b3a22" opacity="0.9" />{/* cape */}
        <path className="bot-arm-l" d="M72 116 Q52 120 48 140 Q60 134 74 131 Z" fill={`url(#gold-${id})`} stroke={INK} strokeWidth="1" />
        <path className="bot-arm-r" d="M128 116 Q148 120 152 140 Q140 134 126 131 Z" fill={`url(#gold-${id})`} stroke={INK} strokeWidth="1" />
        <path d={BODY} fill={`url(#grn-${id})`} stroke={INK} strokeWidth="1.2" />
        <path d="M84 108 L100 128 L116 108" fill="none" stroke={`url(#gold-${id})`} strokeWidth="3" strokeLinejoin="round" />
        <circle className="bot-core" cx="100" cy="132" r="2.6" fill="#7dffb3" />
        <g className="bot-head">
          {/* horns */}
          <path d="M74 66 Q58 44 66 14 Q70 40 86 58Z" fill={`url(#gold-${id})`} stroke={INK} strokeWidth="1" />
          <path d="M126 66 Q142 44 134 14 Q130 40 114 58Z" fill={`url(#gold-${id})`} stroke={INK} strokeWidth="1" />
          <path d={HEAD} fill={`url(#grn-${id})`} stroke={INK} strokeWidth="1.4" />
          <path d="M66 70 Q100 46 134 70 L130 62 Q100 40 70 62Z" fill={`url(#gold-${id})`} stroke={INK} strokeWidth="0.8" />
          <rect x="74" y="68" width="52" height="28" rx="13" fill="#0b2015" stroke={INK} strokeWidth="0.8" />
          <g className="bot-eyes"><g className="bot-blink">
            <path d="M80 82 Q87 74 95 81 Q87 86 80 82Z" fill={eye} />
            <path d="M120 82 Q113 74 105 81 Q113 86 120 82Z" fill={eye} />
          </g></g>
          <path d="M92 92 Q100 96 108 91" fill="none" stroke="#7dffb3" strokeOpacity="0.7" strokeWidth="1.1" strokeLinecap="round" />{/* smirk */}
        </g>
      </g>
    </Frame>
  )
})

// ------------------------------------------------------------------ Scarlet Hex
export const ScarletBot = memo(function ScarletBot({ state, size = 124 }: { state: OrbState; size?: number }) {
  const id = useId().replace(/:/g, '')
  const eye = state === 'offline' ? '#6a5a60' : '#ff8fb0'
  const wisp = (cx: number, cy: number, flip: number) => (
    <g className="hex-wisp" style={{ transformOrigin: `${cx}px ${cy}px` } as CSSProperties}>
      <path d={`M${cx} ${cy} q${8 * flip} -10 ${2 * flip} -16 q${-9 * flip} -4 ${-12 * flip} 6 q${-2 * flip} 10 ${8 * flip} 12 q${12 * flip} 1 ${12 * flip} -12`}
        fill="none" stroke="#ff4f7d" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
      <circle cx={cx} cy={cy} r="3.4" fill="#ff7fa1" />
    </g>
  )
  return (
    <Frame theme="scarlet" state={state} size={size}>
      <defs>
        <linearGradient id={`crim-${id}`} x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stopColor="#d6264f" /><stop offset="60%" stopColor="#8e0f30" /><stop offset="100%" stopColor="#4c0619" /></linearGradient>
        <linearGradient id={`tiara-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff7aa0" /><stop offset="100%" stopColor="#c0123f" /></linearGradient>
      </defs>
      <ellipse className="bot-floor" cx="100" cy="196" rx="44" ry="6" fill="#ff2d62" opacity="0.35" />
      <Sparks colors={['#ff4f7d', '#ffb3c6']} />
      <g className="bot-float">
        <path className="bot-arm-l" d="M72 116 Q52 116 46 132 Q58 130 74 131 Z" fill={`url(#crim-${id})`} stroke={INK} strokeWidth="1" />
        <path className="bot-arm-r" d="M128 116 Q148 116 154 132 Q142 130 126 131 Z" fill={`url(#crim-${id})`} stroke={INK} strokeWidth="1" />
        {wisp(46, 132, -1)}{wisp(154, 132, 1)}
        <path d={BODY} fill={`url(#crim-${id})`} stroke={INK} strokeWidth="1.2" />
        <path d="M86 112 Q100 122 114 112" fill="none" stroke="#ff7aa0" strokeWidth="1.4" />
        <circle className="bot-core" cx="100" cy="128" r="3" fill="#ff7fa1" />
        <g className="bot-head">
          <path d={HEAD} fill={`url(#crim-${id})`} stroke={INK} strokeWidth="1.4" />
          <path d="M76 62 L84 46 L92 57 L100 34 L108 57 L116 46 L124 62 Q100 54 76 62Z" fill={`url(#tiara-${id})`} stroke={INK} strokeWidth="1" />
          <rect x="74" y="68" width="52" height="28" rx="13" fill="#1a0610" stroke={INK} strokeWidth="0.8" />
          <g className="bot-eyes"><g className="bot-blink">
            <circle cx="87" cy="82" r="5.6" fill={eye} /><circle cx="113" cy="82" r="5.6" fill={eye} />
            <circle cx="88.5" cy="80.5" r="1.6" fill="#fff" /><circle cx="114.5" cy="80.5" r="1.6" fill="#fff" />
          </g></g>
        </g>
      </g>
    </Frame>
  )
})

// ------------------------------------------------------------------ Upside Down
/**
 * Petal-headed creature in a bold cartoon style: five open red petals studded with teeth around a round toothy
 * maw, on a grey, muscular body with long clawed arms and backward-bending legs. Petals flex while thinking,
 * the maw chomps while writing, and the head closes into a bud when offline.
 */
export const UpsideBot = memo(function UpsideBot({ state, size = 124 }: { state: OrbState; size?: number }) {
  const id = useId().replace(/:/g, '')
  const LINE = '#1c1c20'
  const skin = `url(#skin-${id})`
  const petal = 'M100 40 C 86 37, 82 22, 88 11 Q 94 4, 100 -5 Q 106 4, 112 11 C 118 22, 114 37, 100 40Z'
  // Teeth on one (upward) petal; rotated with it. Each is a small white triangle.
  const petalTeeth = [[92, 23], [108, 23], [94, 14], [106, 14], [100, 5], [96, 31], [104, 31]]
  const mawTeeth = Array.from({ length: 10 }, (_, i) => (i * 36))
  return (
    <Frame theme="upside" state={state} size={size}>
      <defs>
        <linearGradient id={`skin-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a4a8ab" /><stop offset="55%" stopColor="#7d8184" /><stop offset="100%" stopColor="#55595c" />
        </linearGradient>
        <linearGradient id={`petal-${id}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#8e2a2c" /><stop offset="45%" stopColor="#bf4a4a" /><stop offset="100%" stopColor="#d05b58" />
        </linearGradient>
        <radialGradient id={`maw-${id}`}><stop offset="0%" stopColor="#2a0608" /><stop offset="70%" stopColor="#5a1015" /><stop offset="100%" stopColor="#7d1a1e" /></radialGradient>
      </defs>
      <ellipse className="bot-floor" cx="100" cy="199" rx="34" ry="3.5" fill="#b3151b" opacity="0.45" />
      <g className="upside-body">
        {/* legs — thigh, forward knee, back-swept shin, clawed foot */}
        {[1, -1].map((s) => (
          <g key={s} transform={s === -1 ? 'translate(200 0) scale(-1 1)' : undefined}>
            <path d="M90 140 C 82 150, 78 160, 82 168 C 84 176, 90 182, 88 190 L 84 196 L 96 197 L 94 189 C 96 178, 92 170, 96 160 C 99 152, 99 146, 98 140Z"
              fill={skin} stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M84 196 L 79 200 M88 196.5 L 85 201 M92 197 L 92 201.5 M96 197 L 99 200" stroke={LINE} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M85 160 Q 88 166, 85 172" fill="none" stroke={LINE} strokeOpacity="0.5" strokeWidth="0.9" />
          </g>
        ))}
        {/* arms — long, bent at the elbow, hanging past the hips, three curved claws */}
        {[1, -1].map((s) => (
          <g key={s} className={s === 1 ? 'bot-arm-l' : 'bot-arm-r'}>
            <g transform={s === -1 ? 'translate(200 0) scale(-1 1)' : undefined}>
              <path d="M82 83 C 66 86, 58 98, 59 112 C 60 122, 55 132, 56 145 L 64 146 C 66 135, 71 124, 72 114 C 73 104, 78 98, 84 95Z"
                fill={skin} stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M58 144 Q 52 152, 50 160 M60.5 145 Q 57 154, 57 162 M63 145 Q 64 153, 67 159"
                fill="none" stroke={LINE} strokeWidth="1.7" strokeLinecap="round" />
              <path d="M66 104 Q 64 110, 66 116" fill="none" stroke={LINE} strokeOpacity="0.45" strokeWidth="0.9" />
            </g>
          </g>
        ))}
        {/* torso — broad chest, ribbed abs, narrow waist */}
        <path d="M78 84 C 86 78, 114 78, 122 84 C 124 98, 118 112, 114 124 C 112 132, 116 138, 112 142 L 88 142 C 84 138, 88 132, 86 124 C 82 112, 76 98, 78 84Z"
          fill={skin} stroke={LINE} strokeWidth="1.7" strokeLinejoin="round" />
        <g fill="none" stroke={LINE} strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round">
          <path d="M100 84 L100 138" />
          <path d="M84 92 Q 92 100, 100 96 Q 108 100, 116 92" />
          <path d="M91 108 Q 95 110, 99 108 M101 108 Q 105 110, 109 108 M92 116 Q 95 118, 99 116 M101 116 Q 105 118, 108 116 M93 124 Q 96 126, 99 124 M101 124 Q 104 126, 107 124" />
          <path d="M86 102 Q 84 110, 87 118 M114 102 Q 116 110, 113 118" />
        </g>
        <path d="M92 132 L100 142 L108 132" fill="none" stroke={LINE} strokeOpacity="0.4" strokeWidth="1" />
        {/* neck */}
        <path d="M91 60 C 90 70, 86 78, 84 84 L116 84 C 114 78, 110 70, 109 60Z" fill={skin} stroke={LINE} strokeWidth="1.6" />
        {/* head: five open petals with teeth + central maw */}
        <g className="bot-head upside-head">
          {[0, 72, 144, 216, 288].map((r) => (
            <g key={r} className="petal" style={{ '--r': `${r}deg` } as CSSProperties}>
              <path d={petal} fill={`url(#petal-${id})`} stroke={LINE} strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M100 38 L100 6" stroke="#7c2222" strokeOpacity="0.55" strokeWidth="0.9" />
              {petalTeeth.map(([x, y], i) => (
                <path key={i} d={`M${x - 1.4} ${y + 1.2} L${x} ${y - 1.8} L${x + 1.4} ${y + 1.2}Z`} fill="#f7f1e6" stroke={LINE} strokeWidth="0.35" />
              ))}
            </g>
          ))}
          <g className="maw">
            <circle cx="100" cy="40" r="11.5" fill={`url(#maw-${id})`} stroke={LINE} strokeWidth="2" />
            {mawTeeth.map((a) => (
              <path key={a} d="M98.2 29.6 L100 35 L101.8 29.6Z" fill="#f7f1e6" stroke={LINE} strokeWidth="0.3" transform={`rotate(${a} 100 40)`} />
            ))}
          </g>
        </g>
      </g>
    </Frame>
  )
})

/** The welcome-page mascot for the current theme. */
export function Mascot({ theme, state, size = 124 }: { theme: Accent; state: OrbState; size?: number }) {
  switch (theme) {
    case 'spider': return <SpiderBot state={state} size={size} />
    case 'iron': return <IronBot state={state} size={size} />
    case 'loki': return <LokiBot state={state} size={size} />
    case 'scarlet': return <ScarletBot state={state} size={size} />
    case 'upside': return <UpsideBot state={state} size={size} />
    default: return <AIRobot state={state} size={size} />
  }
}
