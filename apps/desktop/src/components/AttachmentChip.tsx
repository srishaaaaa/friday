import { motion } from 'framer-motion'
import { AlertTriangle, FileCode2, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react'
import { dur, ease } from '../design/motion'
import type { Attachment } from '../types/api'
import { fmtBytes } from '../utils/models'

// Mirrors backend/app/services/attachments.py so obviously-unsupported files are rejected before upload.
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif']
const DOC_EXT = ['pdf', 'docx']
const TEXT_EXT = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'log', 'xml', 'html', 'htm',
  'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'ipynb', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php',
  'swift', 'sql', 'sh', 'bat', 'ps1', 'r', 'lua', 'dart', 'vue', 'svelte', 'tex', 'rst']
const CODE_EXT = new Set(TEXT_EXT.filter((e) => !['txt', 'md', 'markdown', 'csv', 'tsv', 'log'].includes(e)))
export const ACCEPT = [...IMAGE_EXT, ...DOC_EXT, ...TEXT_EXT].map((e) => `.${e}`).join(',')
export const MAX_FILES = 8

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? ''

/** Returns an error message, or null when the file can be uploaded. */
export function validateFile(f: File): string | null {
  const e = ext(f.name)
  const isImage = IMAGE_EXT.includes(e)
  if (!isImage && !DOC_EXT.includes(e) && !TEXT_EXT.includes(e) && !f.type.startsWith('text/')) return `${f.name}: unsupported file type`
  if (f.size === 0) return `${f.name} is empty`
  if (isImage && f.size > 5 * 1024 * 1024) return `${f.name}: images must be under 5 MB`
  if (f.size > 15 * 1024 * 1024) return `${f.name}: files must be under 15 MB`
  return null
}

export interface PendingFile {
  key: string
  name: string
  size: number
  progress: number
  status: 'uploading' | 'ready' | 'error'
  error?: string
  att?: Attachment
  ctrl?: AbortController
}

export function FileIcon({ name, kind, size = 15 }: { name: string; kind?: string; size?: number }) {
  const e = ext(name)
  if (kind === 'image' || IMAGE_EXT.includes(e)) return <ImageIcon size={size} />
  if (CODE_EXT.has(e)) return <FileCode2 size={size} />
  return <FileText size={size} />
}

function detail(a: Attachment) {
  if (a.kind === 'image') return `Image · ${fmtBytes(a.size)}${a.ocr ? ' · text found' : ''}`
  return [a.pages ? `${a.pages} page${a.pages === 1 ? '' : 's'}` : null, `${a.chars.toLocaleString()} chars`, a.ocr ? 'OCR' : null, a.truncated ? 'truncated' : null]
    .filter(Boolean).join(' · ')
}

/** Chip for an attachment — pending (composer) or sent (message). Clicking a ready chip opens its details. */
export function AttachmentChip({ name, size, att, progress, status = 'ready', error, onRemove, onOpen }: {
  name: string; size?: number; att?: Attachment; progress?: number; status?: PendingFile['status']; error?: string
  onRemove?(): void; onOpen?(): void
}) {
  const clickable = status === 'ready' && !!onOpen
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: dur.ui, ease: ease.out }}
      className={`group relative flex max-w-[15rem] items-center gap-2 overflow-hidden rounded-sm border px-2.5 py-1.5 text-xs ${status === 'error' ? 'border-danger/40 bg-danger/10' : 'border-line bg-ink/[0.04]'}`}>
      <span className={`shrink-0 ${status === 'error' ? 'text-danger' : 'text-accent'}`}>
        {status === 'uploading' ? <Loader2 size={15} className="animate-spin" /> : status === 'error' ? <AlertTriangle size={15} /> : <FileIcon name={name} kind={att?.kind} />}
      </span>
      <button type="button" disabled={!clickable} onClick={onOpen} className="min-w-0 text-left disabled:cursor-default" aria-label={clickable ? `Open ${name}` : name}>
        <span className="block truncate font-medium text-ink">{name}</span>
        <span className="block truncate text-faint">
          {status === 'uploading' ? `Uploading… ${progress ?? 0}%` : status === 'error' ? error : att ? detail(att) : size !== undefined ? fmtBytes(size) : ''}
        </span>
      </button>
      {onRemove && (
        <button type="button" className="icon-btn -mr-1 shrink-0 !p-1" aria-label={`Remove ${name}`} onClick={onRemove}><X size={13} /></button>
      )}
      {status === 'uploading' && <span className="absolute bottom-0 left-0 h-[2px] bg-accent transition-[width] duration-200" style={{ width: `${progress ?? 0}%` }} />}
    </motion.div>
  )
}
