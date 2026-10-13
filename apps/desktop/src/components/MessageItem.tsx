import { motion } from 'framer-motion'
import { Brain, Check, Clock, Cloud, Copy, Cpu, Download, FileText, History, Loader2, MoreHorizontal, Pencil, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { memo, useEffect, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { dur, ease } from '../design/motion'
import { api } from '../services/api'
import type { Attachment, ChatMessage } from '../types/api'
import { whereFor } from '../utils/models'
import { AIOrb } from './AIOrb'
import { AttachmentChip } from './AttachmentChip'
import { Sources, ToolActivity, toolState } from './ToolActivity'
import { FloatingMenu } from './ui/Menu'
import { Tooltip } from './ui/primitives'

export function nodeText(n: ReactNode): string {
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(nodeText).join('')
  if (n && typeof n === 'object' && 'props' in n) return nodeText((n as { props: { children?: ReactNode } }).props.children)
  return ''
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Tooltip label={done ? 'Copied' : label} side="top">
      <button className="btn-ghost !px-2 !py-1 text-xs" aria-label={label}
        onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }) }}>
        <motion.span key={String(done)} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: dur.micro }}>
          {done ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
        </motion.span>
        {label !== 'Copy' && <span>{done ? 'Copied' : label.replace(/^Copy /, 'Copy ')}</span>}
      </button>
    </Tooltip>
  )
}

const EXT: Record<string, string> = { python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', tsx: 'tsx', jsx: 'jsx', json: 'json', bash: 'sh', sh: 'sh', shell: 'sh', powershell: 'ps1', html: 'html', css: 'css', sql: 'sql', rust: 'rs', go: 'go', java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', yaml: 'yml', markdown: 'md' }

function CodeBlock({ children }: { children?: ReactNode }) {
  const lang = /language-([\w-]+)/.exec(nodeText((children as { props?: { className?: string } })?.props?.className ?? ''))?.[1]
  const raw = nodeText(children).replace(/\n$/, '')
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([raw], { type: 'text/plain' }))
    a.download = `snippet.${(lang && EXT[lang.toLowerCase()]) ?? 'txt'}`
    a.click(); URL.revokeObjectURL(a.href)
  }
  return (
    <div className="not-prose overflow-hidden rounded-md border border-line" style={{ background: 'var(--code-bg)' }}>
      <div className="flex items-center justify-between border-b border-line px-3 py-1 text-xs text-mute">
        <span className="flex items-center gap-2 font-mono"><span className="h-1.5 w-1.5 rounded-full bg-accent/70" />{lang ?? 'code'}</span>
        <div className="flex items-center">
          <Tooltip label="Download"><button className="btn-ghost !px-2 !py-1" aria-label="Download code" onClick={download}><Download size={13} /></button></Tooltip>
          <CopyButton text={raw} label="Copy code" />
        </div>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

const SAFE_LINK = /^(https?:|mailto:)/i

function openLink(url: string) {
  if (!SAFE_LINK.test(url)) return
  if (window.friday) void window.friday.openExternal(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}

const REMARK = [remarkGfm, remarkMath]
const REHYPE = [[rehypeHighlight, { detect: false, ignoreMissing: true }], [rehypeKatex, { throwOnError: false, strict: 'ignore' }]] as never
const COMPONENTS = {
  pre: ({ children }: { children?: ReactNode }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ children }: { children?: ReactNode }) => <div className="table-wrap"><table>{children}</table></div>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => <a href={href} onClick={(e) => { e.preventDefault(); if (href) openLink(href) }}>{children}</a>,
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={COMPONENTS}>{text}</ReactMarkdown>
    </div>
  )
})

function Thinking() {
  return (
    <div className="flex items-center gap-3 py-1" role="status" aria-label="FRIDAY is thinking">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-accent"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }} />
        ))}
      </div>
      <span className="text-sm text-mute">Thinking…</span>
    </div>
  )
}

const thumbCache = new Map<string, string>()

/** Lazy image preview for a sent image attachment (data: URL, allowed by the CSP). */
function ImageThumb({ a, onOpen }: { a: Attachment; onOpen?(): void }) {
  const [src, setSrc] = useState(() => thumbCache.get(a.id) ?? null)
  useEffect(() => {
    if (src) return
    let live = true
    void api.attachment(a.id, true).then((r) => { if (r.data_url && live) { thumbCache.set(a.id, r.data_url); setSrc(r.data_url) } }).catch(() => undefined)
    return () => { live = false }
  }, [a.id, src])
  return (
    <button type="button" onClick={onOpen} aria-label={`Open ${a.name}`}
      className="h-24 w-32 overflow-hidden rounded-sm border border-line bg-ink/[0.04] transition-transform duration-150 hover:scale-[1.02]">
      {src ? <img src={src} alt={a.name} className="h-full w-full object-cover" /> : <span className="shimmer block h-full w-full" />}
    </button>
  )
}

const fmtSecs = (ms?: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

function fmtTime(iso?: string) {
  if (!iso) return null
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function MoreMenu({ m, onRemember }: { m: ChatMessage; onRemember?(text: string): void }) {
  const time = fmtTime(m.created_at)
  return (
    <FloatingMenu label="More actions" placement="top" align="left" className="w-60"
      sections={[{ items: [
        ...(onRemember ? [{ id: 'remember', label: 'Save to memory', icon: <Brain size={14} />, onSelect: () => onRemember(m.content.slice(0, 1000)) }] : []),
        { id: 'time', label: <span className="text-mute">{time ? `Sent ${time}` : 'Not saved yet'}</span>, icon: <Clock size={14} />, disabled: true, onSelect: () => undefined },
      ] }]}
      trigger={({ open, toggle, ref }) => (
        <Tooltip label="More">
          <button ref={ref} className="btn-ghost !px-2 !py-1 text-xs" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><MoreHorizontal size={14} /></button>
        </Tooltip>
      )} />
  )
}

export interface MessageActions {
  onRegenerate(): void
  onEdit?(m: ChatMessage): void
  onFeedback?(id: string, v: 'up' | 'down' | null): void
  onRemember?(text: string): void
  onOpenAttachment?(a: Attachment): void
  onApproveTool?(id: string, ok: boolean): void
}

export const MessageItem = memo(function MessageItem({ m, isLast, isLastUser = false, onRegenerate, onEdit, onFeedback, onRemember, onOpenAttachment, onApproveTool, busy, animateIn = false }: {
  m: ChatMessage; isLast: boolean; isLastUser?: boolean; busy: boolean; animateIn?: boolean
} & MessageActions) {
  const enter = animateIn ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: dur.panel, ease: ease.out } } : {}
  const saved = !m.id.startsWith('tmp-') && !m.id.startsWith('u-')
  if (m.role === 'user') {
    const atts = m.attachments ?? []
    const images = atts.filter((a) => a.kind === 'image')
    const docs = atts.filter((a) => a.kind !== 'image')
    return (
      <motion.div {...enter} className="group flex items-start justify-end gap-1.5" data-testid="user-message">
        <div className="mt-1.5 flex opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
          {isLastUser && onEdit && saved && (
            <Tooltip label="Edit and resend"><button className="btn-ghost !px-2 !py-1 text-xs" aria-label="Edit message" disabled={busy} onClick={() => onEdit(m)}><Pencil size={14} /></button></Tooltip>
          )}
          {m.content && <CopyButton text={m.content} label="Copy" />}
        </div>
        <div className="flex max-w-[min(80%,40rem)] flex-col items-end gap-1.5">
          {images.length > 0 && <div className="flex flex-wrap justify-end gap-1.5">{images.map((a) => <ImageThumb key={a.id} a={a} onOpen={onOpenAttachment ? () => onOpenAttachment(a) : undefined} />)}</div>}
          {docs.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {docs.map((a) => <AttachmentChip key={a.id} name={a.name} att={a} onOpen={onOpenAttachment ? () => onOpenAttachment(a) : undefined} />)}
            </div>
          )}
          {m.content && (
            <div className="whitespace-pre-wrap rounded-lg rounded-br-sm border border-accent/20 px-4 py-2.5 text-[0.95rem] leading-relaxed"
              style={{ background: 'linear-gradient(135deg, rgb(var(--accent-rgb) / 0.13), rgb(var(--accent2-rgb) / 0.08))' }}>
              {m.content}
            </div>
          )}
        </div>
      </motion.div>
    )
  }
  const where = whereFor(m.provider, m.model)
  const activity = m.streaming ? [...(m.activity ?? []), ...(m.statusText ? [m.statusText] : [])] : []
  return (
    <motion.div {...enter} className="group flex gap-3.5" data-testid="assistant-message">
      <div className="mt-0.5 shrink-0"><AIOrb state={m.streaming ? (m.content ? 'generating' : 'thinking') : m.status === 'error' ? 'error' : 'idle'} size={30} detail={false} /></div>
      <div className="min-w-0 flex-1">
        {where && (
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-faint">
            {where.remote ? <Cloud size={12} /> : <Cpu size={12} />}
            <span>{where.label}{m.model ? ` · ${m.model}` : ''}</span>
            {m.usage?.total_ms != null && (
              <span className="font-mono" title={`First word after ${fmtSecs(m.usage.first_token_ms)} · finished in ${fmtSecs(m.usage.total_ms)}`}>
                · {fmtSecs(m.usage.first_token_ms ?? m.usage.total_ms)}
              </span>
            )}
          </p>
        )}
        {activity.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Activity">
            {activity.map((a) => (
              <li key={a} className="glass-clear flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] text-mute">
                {/context window/.test(a) ? <History size={11} className="text-warn" /> : /memor/.test(a) ? <Brain size={11} className="text-accent" /> : /file/.test(a) ? <FileText size={11} className="text-accent" /> : <Loader2 size={11} className="animate-spin" />}
                {a}
              </li>
            ))}
          </ul>
        )}
        <ToolActivity tools={(m.tools ?? []).map(toolState)} onApprove={onApproveTool} live={m.streaming} />
        <div className={m.streaming && m.content ? 'caret' : ''}>
          {m.content ? <Markdown text={m.content} /> : m.streaming ? (m.tools?.some((t) => t.state === 'awaiting') ? null : <Thinking />) : <p className="text-sm text-mute">No response.</p>}
        </div>
        <Sources sources={m.sources ?? []} onOpen={openLink} />
        {m.status === 'cancelled' && <p className="mt-2 text-xs text-warn">Stopped before finishing — the partial answer was kept.</p>}
        {m.status === 'error' && <p className="mt-2 text-xs text-danger">This response failed partway — the partial answer was kept.</p>}
        {!m.streaming && m.content && (
          <div className={`-mb-2 mt-1 flex h-7 items-center gap-0.5 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 ${m.feedback ? 'opacity-100' : 'opacity-0'}`}>
            <CopyButton text={m.content} />
            {isLast && (
              <Tooltip label="Regenerate">
                <button className="btn-ghost !px-2 !py-1 text-xs" aria-label="Regenerate response" disabled={busy} onClick={onRegenerate}><RotateCcw size={14} /></button>
              </Tooltip>
            )}
            {onFeedback && saved && (['up', 'down'] as const).map((v) => {
              const on = m.feedback === v
              const Icon = v === 'up' ? ThumbsUp : ThumbsDown
              return (
                <Tooltip key={v} label={v === 'up' ? 'Good response' : 'Bad response'}>
                  <button className={`btn-ghost !px-2 !py-1 text-xs ${on ? (v === 'up' ? '!text-ok' : '!text-danger') : ''}`} aria-pressed={on}
                    aria-label={v === 'up' ? 'Good response' : 'Bad response'} onClick={() => onFeedback(m.id, on ? null : v)}>
                    <Icon size={14} className={on ? 'fill-current' : ''} />
                  </button>
                </Tooltip>
              )
            })}
            {saved && <MoreMenu m={m} onRemember={onRemember} />}
          </div>
        )}
      </div>
    </motion.div>
  )
})
