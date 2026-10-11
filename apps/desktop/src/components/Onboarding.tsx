import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Cloud, Cpu, KeyRound, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { dur, ease, fadeUp, staggerParent } from '../design/motion'
import type { Prefs } from '../hooks/usePrefs'
import { ApiError, api } from '../services/api'
import type { AppSettings, ModelsResponse, ProviderStatus } from '../types/api'
import { isOllamaCloud, readiness } from '../utils/models'
import { AIOrb } from './AIOrb'
import { ModeSelector } from './Composer'
import { ThemePicker } from './ThemePicker'
import { Segmented, StatusDot } from './ui/primitives'

type Step = 'intro' | 'providers' | 'appearance' | 'ready'
export function Onboarding({ settings, providers, models, prefs, onPrefs, onChange, onRefresh, onDone }: {
  settings: AppSettings | null; providers: ProviderStatus[]; models: ModelsResponse; prefs: Prefs
  onPrefs(p: Partial<Prefs>): void; onChange(p: Partial<AppSettings>): void; onRefresh(): void; onDone(): void
}) {
  const [step, setStep] = useState<Step>('intro')
  const [notice, setNotice] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const r = readiness(settings, providers)
  const ollamaModels = models.ollama?.models ?? []

  const initialize = () => {
    if (r.ready) { setStep('ready'); return }
    setNotice(r.checked ? 'No AI provider is ready yet. Connect one below — or skip and do it later in Settings.' : 'Still checking your providers…')
    setStep('providers')
  }
  const saveKey = async () => {
    try { await api.setKey(key.trim()); setKey(''); onRefresh(); setKeyMsg({ ok: true, text: 'Key saved.' }) }
    catch (e) { setKeyMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save the key.' }) }
  }
  const steps: Step[] = ['providers', 'appearance', 'ready']

  return (
    <motion.div className="fixed inset-0 z-modal flex items-center justify-center overflow-y-auto p-6" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: dur.scene, ease: ease.inOut } }}
      role="dialog" aria-modal="true" aria-label="Welcome to FRIDAY">
      <div className="absolute inset-0 bg-[rgb(var(--bg0-rgb)/0.82)] backdrop-blur-md" aria-hidden />
      <AnimatePresence mode="wait">
        {step === 'intro' && (
          <motion.div key="intro" variants={staggerParent(0.16, 0.15)} initial="hidden" animate="show" exit={{ opacity: 0, scale: 0.98, transition: { duration: dur.ui } }}
            className="relative flex max-w-xl flex-col items-center text-center">
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1, transition: { duration: 0.9, ease: ease.out } } }}>
              <AIOrb state="success" size={190} />
            </motion.div>
            <motion.h1 variants={fadeUp} className="mt-6 pl-[0.42em] text-5xl font-extrabold tracking-[0.42em] text-ink" style={{ textShadow: '0 0 40px rgb(var(--accent-rgb) / 0.45)' }}>
              FRIDAY
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-5 text-xl font-semibold tracking-tight">Your AI. Your workspace. Your rules.</motion.p>
            <motion.p variants={fadeUp} className="mt-2 max-w-md text-sm leading-relaxed text-mute">
              Run models privately on this PC with Ollama, or connect a hosted provider. You choose — and every reply shows where it ran.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap justify-center gap-3">
              <button className="btn-primary !px-5 !py-2.5" onClick={initialize} data-autofocus>Initialize FRIDAY<ArrowRight size={16} /></button>
              <button className="btn-quiet !px-5 !py-2.5" onClick={() => { setNotice(null); setStep('providers') }}>Configure AI</button>
            </motion.div>
          </motion.div>
        )}

        {step !== 'intro' && (
          <motion.div key="wizard" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: dur.panel, ease: ease.out }}
            className="glass-modal relative w-full max-w-2xl rounded-xl p-7">
            <div className="mb-6 flex items-center gap-3">
              <AIOrb state={step === 'ready' ? (r.ready ? 'success' : 'offline') : 'idle'} size={44} detail={false} />
              <div className="flex-1">
                <p className="label-xs">Step {steps.indexOf(step) + 1} of {steps.length}</p>
                <h2 className="text-lg font-bold">{step === 'providers' ? 'Connect your AI' : step === 'appearance' ? 'Make it yours' : r.ready ? 'FRIDAY is ready' : 'Almost there'}</h2>
              </div>
              <div className="flex gap-1.5" aria-hidden>
                {steps.map((s) => <span key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s === step ? 'w-6 bg-accent' : steps.indexOf(s) < steps.indexOf(step) ? 'w-1.5 bg-accent/60' : 'w-1.5 bg-ink/20'}`} />)}
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: dur.ui, ease: ease.out }}>
                {step === 'providers' && (
                  <div className="space-y-3">
                    {notice && <p className="rounded-sm bg-warn/10 px-3 py-2 text-xs text-warn" role="status">{notice}</p>}
                    <div className="glass-clear rounded-md p-4">
                      <div className="flex items-center gap-2">
                        <Cpu size={16} className="text-accent" /><h3 className="text-sm font-semibold">Local — Ollama</h3>
                        <span className="ml-auto flex items-center gap-2 text-xs text-mute"><StatusDot status={!r.ollama ? 'checking' : r.ollama.available ? 'ok' : 'error'} />{r.ollama?.detail ?? 'Checking…'}</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-mute">Processed on this PC. Private and free; speed depends on your hardware. Names ending in <code className="font-mono">:cloud</code> run on Ollama's servers instead.</p>
                      {ollamaModels.length > 0 ? (
                        <select className="field mt-3" aria-label="Local model" value={settings?.ollama_model ?? ''} onChange={(e) => onChange({ ollama_model: e.target.value })}>
                          <option value="">Select a model…</option>
                          {ollamaModels.map((m) => <option key={m.id} value={m.id} className="bg-bg2">{m.name}{isOllamaCloud(m.id) ? ' — Ollama cloud' : ' — on device'}</option>)}
                        </select>
                      ) : (
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-mute">
                          <span>Install Ollama from ollama.com, then run <code className="font-mono">ollama pull gemma4:e2b</code>.</span>
                          <button className="btn-ghost !py-1 text-xs" onClick={onRefresh}><RefreshCw size={13} />Check again</button>
                        </div>
                      )}
                    </div>
                    <div className="glass-clear rounded-md p-4">
                      <div className="flex items-center gap-2">
                        <Cloud size={16} className="text-accent2" /><h3 className="text-sm font-semibold">Hosted — Anthropic</h3>
                        <span className="ml-auto flex items-center gap-2 text-xs text-mute"><StatusDot status={!r.hosted ? 'checking' : r.hosted.available ? 'ok' : 'warn'} />{r.hosted?.available ? 'Connected' : 'No API key'}</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-mute">Processed by the hosted provider. The key is stored in Windows Credential Manager and never shown in the app.</p>
                      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void saveKey() }}>
                        <input className="field" type="password" autoComplete="off" placeholder="Paste API key (optional)" aria-label="API key" value={key} onChange={(e) => setKey(e.target.value)} />
                        <button className="btn-quiet" type="submit" disabled={key.trim().length < 8}><KeyRound size={15} />Save</button>
                      </form>
                      {keyMsg && <p className={`mt-2 text-xs ${keyMsg.ok ? 'text-ok' : 'text-danger'}`} role="status">{keyMsg.text}</p>}
                    </div>
                    {settings && (
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <span className="text-xs text-mute">Routing mode</span>
                        <ModeSelector mode={settings.default_mode} onChange={(m) => onChange({ default_mode: m })} />
                      </div>
                    )}
                  </div>
                )}

                {step === 'appearance' && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between"><span className="text-sm font-semibold">Theme</span>
                      <Segmented id="ob-theme" label="Theme" size="sm" value={settings?.theme ?? 'dark'} onChange={(t) => onChange({ theme: t })} options={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }]} /></div>
                    <div className="space-y-2"><span className="text-sm font-semibold">Accent &amp; theme</span>
                      <ThemePicker value={prefs.accent} onChange={(a) => onPrefs({ accent: a })} /></div>
                    <div className="flex items-center justify-between"><span className="text-sm font-semibold">Animation</span>
                      <Segmented id="ob-motion" label="Animation" size="sm" value={prefs.motion} onChange={(m) => onPrefs({ motion: m })} options={[{ id: 'full', label: 'Full' }, { id: 'reduced', label: 'Reduced' }, { id: 'off', label: 'Off' }]} /></div>
                    <div className="flex items-center justify-between"><span className="text-sm font-semibold">Transparency</span>
                      <Segmented id="ob-glass" label="Transparency" size="sm" value={prefs.glass} onChange={(g) => onPrefs({ glass: g })} options={[{ id: 'full', label: 'Glass' }, { id: 'reduced', label: 'Subtle' }, { id: 'solid', label: 'Solid' }]} /></div>
                  </div>
                )}

                {step === 'ready' && (
                  <div className="text-sm leading-relaxed">
                    {r.ready ? (
                      <p className="flex items-start gap-2 text-ink"><Check size={18} className="mt-0.5 shrink-0 text-ok" />
                        <span>Connected via {r.local ? <b>Ollama ({settings?.ollama_model})</b> : null}{r.local && r.cloud ? ' and ' : ''}{r.cloud ? <b>Anthropic ({settings?.hosted_model})</b> : null}. Mode: <b className="capitalize">{settings?.default_mode}</b>.</span></p>
                    ) : (
                      <p className="text-mute">No provider is usable for <b className="capitalize text-ink">{settings?.default_mode}</b> mode yet. You can still explore FRIDAY and connect one any time from <b className="text-ink">Settings → AI providers</b>.</p>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-7 flex items-center justify-between">
              <button className="btn-ghost" onClick={() => setStep(step === 'providers' ? 'intro' : step === 'appearance' ? 'providers' : 'appearance')}><ArrowLeft size={15} />Back</button>
              <div className="flex gap-2">
                {step === 'providers' && <button className="btn-ghost" onClick={() => setStep('appearance')}>Skip for now</button>}
                {step === 'ready'
                  ? <button className="btn-primary !px-5" onClick={onDone}>{r.ready ? 'Start chatting' : 'Enter FRIDAY'}<ArrowRight size={16} /></button>
                  : <button className="btn-primary" onClick={() => setStep(step === 'providers' ? 'appearance' : 'ready')}>Continue<ArrowRight size={16} /></button>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {step === 'ready' && r.ready && <span className="sr-only" role="status">FRIDAY is ready</span>}
    </motion.div>
  )
}
