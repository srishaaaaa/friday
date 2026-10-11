import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { slideRight } from '../design/motion'
import { api } from '../services/api'
import type { Attachment } from '../types/api'
import { fmtBytes } from '../utils/models'
import { FileIcon } from './AttachmentChip'

/** Details for one attachment: metadata, extraction status and the extracted text (or the image). */
export function DocumentPanel({ attachment, onClose, overlay }: { attachment: Attachment; onClose(): void; overlay?: boolean }) {
  const [full, setFull] = useState<Attachment | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setFull(null); setError(null)
    void api.attachment(attachment.id, attachment.kind === 'image').then(setFull).catch((e: Error) => setError(e.message))
  }, [attachment.id, attachment.kind])
  const a = full ?? attachment
  const rows: [string, string][] = [
    ['Type', a.kind === 'image' ? `Image (${a.mime})` : a.mime],
    ['Size', fmtBytes(a.size)],
    ...(a.pages ? [['Pages', String(a.pages)] as [string, string]] : []),
    ...(a.kind === 'text' ? [['Extracted', `${a.chars.toLocaleString()} characters`] as [string, string]] : []),
    ['Status', a.sent ? 'Sent with a message' : 'Attached — not sent yet'],
  ]

  return (
    <motion.aside variants={slideRight} initial="hidden" animate="show" exit="exit" aria-label="Attachment details"
      className={`glass-deep flex w-[24rem] max-w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-hidden rounded-xl ${overlay ? 'absolute bottom-3 right-3 top-3 z-panel' : ''}`}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 text-accent"><FileIcon name={a.name} kind={a.kind} size={18} /></span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold" title={a.name}>{a.name}</h2>
            <p className="text-xs text-faint">{a.kind === 'image' ? 'Image attachment' : 'Document attachment'}</p>
          </div>
        </div>
        <button className="icon-btn" aria-label="Close attachment details" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="glass-clear rounded-md p-3 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-0.5"><span className="text-faint">{k}</span><span className="text-right text-ink/90">{v}</span></div>
          ))}
          <p className={`mt-2 flex items-start gap-1.5 ${a.truncated ? 'text-warn' : 'text-ok'}`}>
            {a.truncated ? <AlertTriangle size={13} className="mt-px shrink-0" /> : <CheckCircle2 size={13} className="mt-px shrink-0" />}
            {a.kind === 'image' ? `Sent to the model as an image (needs a vision-capable model)${a.ocr ? ', plus the text recognized in it' : ''}.`
              : a.truncated ? 'Very long file: only the first 60,000 characters are given to the model.'
                : a.ocr ? 'Scanned pages were read with Windows text recognition (on this PC). Recognized text may contain errors.' : 'Text extracted successfully.'}
          </p>
          <p className="mt-1.5 flex items-start gap-1.5 text-mute"><ShieldCheck size={13} className="mt-px shrink-0" />
            Treated as private: Smart mode keeps it on this device, and FRIDAY asks before sending it to a hosted model.</p>
        </section>
        {error && <p className="rounded-sm bg-danger/10 px-3 py-2 text-xs text-danger" role="alert">{error}</p>}
        {a.kind === 'image' ? (
          <>
            {full?.data_url ? <img src={full.data_url} alt={a.name} className="w-full rounded-md border border-line" /> : !error && <div className="shimmer h-48 rounded-md" />}
            {full?.preview && <section><p className="label-xs mb-1.5 px-1">Text recognized in the image</p>
              <pre className="whitespace-pre-wrap break-words rounded-md border border-line p-3 font-mono text-[0.75rem] leading-relaxed text-ink/85" style={{ background: 'var(--code-bg)' }}>{full.preview}</pre></section>}
          </>
        ) : (
          <section>
            <p className="label-xs mb-1.5 px-1">Extracted text{full && a.chars > (full.preview?.length ?? 0) ? ' (preview)' : ''}</p>
            {full ? (
              <pre className="max-h-none whitespace-pre-wrap break-words rounded-md border border-line p-3 font-mono text-[0.75rem] leading-relaxed text-ink/85" style={{ background: 'var(--code-bg)' }}>
                {full.preview}{a.chars > (full.preview?.length ?? 0) ? '\n\n…' : ''}
              </pre>
            ) : !error && <div className="shimmer h-64 rounded-md" />}
          </section>
        )}
      </div>
    </motion.aside>
  )
}
