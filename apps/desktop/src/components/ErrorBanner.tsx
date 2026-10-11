import { AlertTriangle, RotateCcw, Settings, X } from 'lucide-react'
import type { ErrorInfo } from '../types/api'

const SETTINGS_CODES = new Set(['not_configured', 'auth_error', 'no_local_model', 'no_provider', 'cloud_disabled', 'model_not_found', 'provider_unavailable', 'reasoning_budget'])

export function ErrorBanner({ error, onRetry, onSettings, onDismiss }: {
  error: ErrorInfo; onRetry?: () => void; onSettings: () => void; onDismiss: () => void
}) {
  return (
    <div role="alert" className="glass-float mx-auto flex w-full max-w-3xl items-start gap-3 rounded-md px-4 py-3 text-sm"
      style={{ borderColor: 'rgb(var(--danger-rgb) / 0.4)', boxShadow: 'inset 3px 0 0 rgb(var(--danger-rgb) / 0.8), var(--shadow)' }}>
      <AlertTriangle size={17} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{error.message}</p>
        <p className="mt-0.5 font-mono text-[0.7rem] text-faint">{error.code}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {error.retryable && onRetry && <button className="btn-quiet !py-1.5" onClick={onRetry}><RotateCcw size={14} />Retry</button>}
        {SETTINGS_CODES.has(error.code) && <button className="btn-quiet !py-1.5" onClick={onSettings}><Settings size={14} />Open settings</button>}
        <button className="icon-btn !p-1.5" aria-label="Dismiss error" onClick={onDismiss}><X size={16} /></button>
      </div>
    </div>
  )
}
