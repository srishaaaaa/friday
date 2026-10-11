import { motion } from 'framer-motion'
import { Bug, ClipboardList, FileText, Lightbulb, Map, Sparkles, type LucideIcon } from 'lucide-react'
import { fadeUp, staggerParent } from '../design/motion'
import type { AppSettings, ProviderStatus } from '../types/api'
import { isOllamaCloud, readiness } from '../utils/models'
import type { OrbState } from './AIOrb'
import type { Accent } from '../hooks/usePrefs'
import { Mascot } from './Mascots'
import { StatusDot } from './ui/primitives'

const SUGGESTIONS: { icon: LucideIcon; title: string; hint: string; prompt: string }[] = [
  { icon: Sparkles, title: 'Explain a difficult concept', hint: 'Clear, layered explanations', prompt: 'Explain this concept simply, then go one level deeper: ' },
  { icon: Bug, title: 'Help me debug code', hint: 'Paste code and the error', prompt: 'Help me debug this. Here is the code and the error I get:\n\n```\n\n```' },
  { icon: FileText, title: 'Analyze a document', hint: 'Paste the text to analyze', prompt: 'Analyze the following text. Summarize the key points, then list open questions:\n\n' },
  { icon: Map, title: 'Plan a project', hint: 'Milestones and risks', prompt: 'Help me plan this project with milestones, risks and a first-week checklist: ' },
  { icon: ClipboardList, title: 'Summarize my notes', hint: 'Paste notes, get the gist', prompt: 'Summarize these notes into key points and action items:\n\n' },
  { icon: Lightbulb, title: 'Brainstorm an idea', hint: 'Divergent, then focused', prompt: 'Brainstorm 10 ideas for the following, then pick the 3 strongest and say why: ' },
]

/** Themed welcome copy (shown only when a model is ready; setup guidance always uses plain wording). */
const COPY: Partial<Record<Accent, [string, string]>> = {
  spider: ['Ready to spin up something new?', 'Ideas, code and research — all caught in one web.'],
  iron: ['Systems online. What are we building?', 'Suit up: ideas, code, research, and everything in between.'],
  loki: ['What mischief shall we make today?', 'Every good plan needs a clever twist — ideas, code, research.'],
  scarlet: ['What reality shall we shape today?', 'Ideas, code and research — a little chaos, a lot of focus.'],
  upside: ['What lurks in your mind today?', 'Ideas, code and research — from this side and the other.'],
}

export function WelcomeState({ providers, settings, orb, showCore, theme = 'violet', onSuggest, onSettings }: {
  providers: ProviderStatus[]; settings: AppSettings; orb: OrbState; showCore: boolean; theme?: Accent; onSuggest(prompt: string): void; onSettings(): void
}) {
  const r = readiness(settings, providers)
  const localLabel = r.ollama ? (r.ollama.available ? (settings.ollama_model ? settings.ollama_model : 'No model selected') : 'Not running') : 'Checking…'
  return (
    <motion.div variants={staggerParent(0.07)} initial="hidden" animate="show" className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center py-8 text-center">
      {showCore && <motion.div variants={fadeUp}><Mascot theme={theme} state={orb} size={124} /></motion.div>}
      <motion.h1 variants={fadeUp} className="welcome-title mt-6 bg-gradient-to-b from-ink to-ink/70 bg-clip-text text-[clamp(1.6rem,3.2vw,2.35rem)] font-extrabold tracking-tight text-transparent">
        {r.checked && !r.ready ? 'Connect a model to begin' : COPY[theme]?.[0] ?? 'What shall we explore today?'}
      </motion.h1>
      <motion.p variants={fadeUp} className="mt-2 text-[0.95rem] text-mute">
        {r.checked && !r.ready
          ? settings.default_mode === 'local' ? 'Local mode needs Ollama running with a model selected.' : settings.default_mode === 'cloud' ? 'Cloud mode needs an API key and hosted models enabled.' : 'Smart mode needs a local model or a hosted API key.'
          : COPY[theme]?.[1] ?? 'Ideas, code, research, and everything in between.'}
      </motion.p>

      <motion.div variants={fadeUp} className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="glass-clear flex items-center gap-2 rounded-full px-3 py-1.5">
          <StatusDot status={!r.checked ? 'checking' : r.local ? 'ok' : r.ollama?.available ? 'warn' : 'error'} />
          <span className="text-mute">Ollama</span><span className="text-ink">{localLabel}{isOllamaCloud(settings.ollama_model) && r.ollama?.available ? ' (cloud)' : ''}</span>
        </span>
        <span className="glass-clear flex items-center gap-2 rounded-full px-3 py-1.5">
          <StatusDot status={!r.checked ? 'checking' : r.cloud ? 'ok' : settings.cloud_enabled ? 'warn' : 'off'} />
          <span className="text-mute">Anthropic</span><span className="text-ink">{!settings.cloud_enabled ? 'Disabled' : r.hosted?.available ? settings.hosted_model : 'No API key'}</span>
        </span>
        {r.checked && !r.ready && <button className="btn-primary !rounded-full !px-3.5 !py-1.5 text-xs" onClick={onSettings}>Set up providers</button>}
      </motion.div>

      <motion.div variants={staggerParent(0.05, 0.1)} className="mt-9 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {SUGGESTIONS.map((s) => (
          <motion.button key={s.title} variants={fadeUp} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
            className="glass-edge group flex items-start gap-3 rounded-md p-3.5 text-left" onClick={() => onSuggest(s.prompt)}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-accent/10 text-accent transition-colors group-hover:bg-accent/20"><s.icon size={16} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{s.title}</span>
              <span className="mt-0.5 block text-xs text-faint">{s.hint}</span>
            </span>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  )
}
