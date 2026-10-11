import type { Accent } from '../hooks/usePrefs'
import { WebGlyph } from './SpiderWeb'

/** Plain accent colors, and character-inspired themes that also change the welcome mascot and background. */
export const COLORS: { id: Accent; label: string; rgb: string }[] = [
  { id: 'violet', label: 'Violet', rgb: '178 132 255' }, { id: 'cyan', label: 'Cyan', rgb: '98 232 255' },
  { id: 'blue', label: 'Blue', rgb: '100 139 255' }, { id: 'emerald', label: 'Emerald', rgb: '85 214 164' },
]
export const CHARACTER_THEMES: { id: Accent; label: string; hint: string; a: string; b: string; glyph?: JSX.Element }[] = [
  { id: 'spider', label: 'Spider', hint: 'Red & blue, web-slinging bot, corner webs', a: '230 38 50', b: '46 92 214', glyph: <WebGlyph size={22} /> },
  { id: 'iron', label: 'Arc Armor', hint: 'Red & gold armor, arc reactor, HUD overlay', a: '200 28 38', b: '240 188 64',
    glyph: <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden><circle cx="10" cy="10" r="6" fill="none" stroke="#bff3ff" strokeWidth="2" /><circle cx="10" cy="10" r="2.5" fill="#e8fbff" /></svg> },
  { id: 'loki', label: 'Trickster', hint: 'Green & gold, horned helm, drifting runes', a: '40 168 96', b: '222 184 70',
    glyph: <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden><path d="M5 15 Q4 6 9 3 Q7 9 9 12 M15 15 Q16 6 11 3 Q13 9 11 12" fill="none" stroke="#f4d36b" strokeWidth="1.8" strokeLinecap="round" /></svg> },
  { id: 'scarlet', label: 'Scarlet Hex', hint: 'Scarlet chaos magic, tiara, glowing sigils', a: '214 24 70', b: '255 96 130',
    glyph: <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden><path d="M3 13 L6 7 L10 11 L14 7 L17 13 Z" fill="#ffd0dc" /></svg> },
  { id: 'upside', label: 'Upside Down', hint: 'Dark red & storm blue, petal-mouthed creature, spores', a: '190 36 36', b: '70 92 128',
    glyph: <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden>{[0, 72, 144, 216, 288].map((r) => <ellipse key={r} cx="10" cy="5.5" rx="2.2" ry="4" fill="#ffb3a8" transform={`rotate(${r} 10 10)`} />)}</svg> },
]

export function ThemePicker({ value, onChange }: { value: Accent; onChange(a: Accent): void }) {
  return (
    <div className="space-y-2.5">
      <div role="radiogroup" aria-label="Accent color" className="flex justify-end gap-2">
        {COLORS.map((a) => (
          <button key={a.id} role="radio" aria-checked={value === a.id} aria-label={a.label} title={a.label} onClick={() => onChange(a.id)}
            className={`relative h-7 w-7 rounded-full transition-transform duration-150 hover:scale-110 ${value === a.id ? 'ring-2 ring-ink/80 ring-offset-2 ring-offset-transparent' : ''}`}
            style={{ background: `radial-gradient(circle at 35% 30%, #fff8, rgb(${a.rgb}) 45%, rgb(${a.rgb} / 0.6))`, boxShadow: `0 0 14px rgb(${a.rgb} / 0.6)` }} />
        ))}
      </div>
      <div role="radiogroup" aria-label="Character themes" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {CHARACTER_THEMES.map((t) => (
          <button key={t.id} role="radio" aria-checked={value === t.id} title={t.hint} onClick={() => onChange(t.id)}
            className={`glass-edge relative flex items-center gap-2 overflow-hidden rounded-sm px-2.5 py-1.5 text-left text-xs font-semibold ${value === t.id ? '!border-ink/60 text-ink' : 'text-mute'}`}>
            <span className="relative grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full"
              style={{ background: `linear-gradient(135deg, rgb(${t.a}) 0 50%, rgb(${t.b}) 50% 100%)`, boxShadow: `0 0 10px rgb(${t.a} / 0.6)` }}>
              {t.glyph}
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
