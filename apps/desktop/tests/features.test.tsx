import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { validateFile } from '../src/components/AttachmentChip'
import { Composer } from '../src/components/Composer'
import { MessageItem } from '../src/components/MessageItem'
import type { Attachment } from '../src/types/api'
import { BASE_SETTINGS } from './fixtures'

const file = (name: string, size: number, type = '') => new File([new Uint8Array(size)], name, { type })
const att: Attachment = { id: 'a1', name: 'report.pdf', mime: 'application/pdf', size: 2048, kind: 'text', pages: 3, chars: 5000, truncated: false, created_at: '', sent: true }

describe('attachment validation', () => {
  it('accepts documents, code and images within limits and rejects the rest', () => {
    expect(validateFile(file('notes.md', 10))).toBeNull()
    expect(validateFile(file('report.pdf', 1000))).toBeNull()
    expect(validateFile(file('main.py', 10))).toBeNull()
    expect(validateFile(file('photo.jpg', 1000))).toBeNull()
    expect(validateFile(file('setup.exe', 10))).toMatch(/unsupported/)
    expect(validateFile(file('empty.txt', 0))).toMatch(/empty/)
    expect(validateFile(file('huge.png', 6 * 1024 * 1024))).toMatch(/5 MB/)
  })
})

describe('Composer editing', () => {
  it('loads the message into the box, resubmits as an edit and cancels with Escape', async () => {
    const onEdit = vi.fn(), onCancel = vi.fn(), onSend = vi.fn()
    const { rerender } = render(<Composer streaming={false} settings={BASE_SETTINGS} models={{}} restored={null} editing={{ text: 'old question', n: 1 }}
      onSend={onSend} onEdit={onEdit} onCancelEdit={onCancel} onStop={vi.fn()} onSettings={vi.fn()} />)
    const box = screen.getByLabelText('Message FRIDAY')
    expect(box).toHaveValue('old question')
    expect(screen.getByLabelText('Attach files')).toBeDisabled()
    await userEvent.clear(box); await userEvent.type(box, 'new question{Enter}')
    expect(onEdit).toHaveBeenCalledWith('new question')
    expect(onSend).not.toHaveBeenCalled()
    rerender(<Composer streaming={false} settings={BASE_SETTINGS} models={{}} restored={null} editing={{ text: 'again', n: 2 }}
      onSend={onSend} onEdit={onEdit} onCancelEdit={onCancel} onStop={vi.fn()} onSettings={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Message FRIDAY'), '{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })
  it('restores attachments together with a rejected draft', () => {
    render(<Composer streaming={false} settings={BASE_SETTINGS} models={{}} restored={{ text: 'see file', attachments: [att], n: 1 }}
      onSend={vi.fn()} onStop={vi.fn()} onSettings={vi.fn()} />)
    expect(screen.getByText('report.pdf')).toBeInTheDocument()
    expect(screen.getByLabelText('Send message')).not.toBeDisabled()
  })
})

describe('MessageItem actions', () => {
  it('offers feedback on saved replies and toggles it', async () => {
    const onFeedback = vi.fn()
    render(<MessageItem busy={false} isLast onRegenerate={vi.fn()} onFeedback={onFeedback}
      m={{ id: 'm1', role: 'assistant', content: 'Answer', provider: 'ollama', model: 'gemma4:e2b', feedback: 'up' }} />)
    expect(screen.getByLabelText('Good response')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByLabelText('Good response'))
    expect(onFeedback).toHaveBeenCalledWith('m1', null)
    await userEvent.click(screen.getByLabelText('Bad response'))
    expect(onFeedback).toHaveBeenCalledWith('m1', 'down')
  })
  it('shows Edit only on the last saved user message, plus its attachments', async () => {
    const onEdit = vi.fn(), onOpen = vi.fn()
    render(<MessageItem busy={false} isLast={false} isLastUser onRegenerate={vi.fn()} onEdit={onEdit} onOpenAttachment={onOpen}
      m={{ id: 'u1', role: 'user', content: 'Summarize', attachments: [att] }} />)
    await userEvent.click(screen.getByLabelText('Edit message'))
    expect(onEdit).toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText('Open report.pdf'))
    expect(onOpen).toHaveBeenCalledWith(att)
    expect(screen.getByText(/3 pages/)).toBeInTheDocument()
  })
  it('shows live pipeline activity while streaming', () => {
    render(<MessageItem busy isLast onRegenerate={vi.fn()} m={{ id: 'tmp-1', role: 'assistant', content: '', streaming: true, activity: ['Using 2 saved memories'] }} />)
    expect(screen.getByText('Using 2 saved memories')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'FRIDAY is thinking' })).toBeInTheDocument()
  })
  it('never opens javascript: links from model output', async () => {
    const open = vi.fn()
    window.friday = { openExternal: open } as unknown as typeof window.friday
    render(<MessageItem busy={false} isLast={false} onRegenerate={vi.fn()} m={{ id: 'm2', role: 'assistant', content: '[click](javascript:alert(1)) and [ok](https://example.com)' }} />)
    await userEvent.click(screen.getByText('click'))
    expect(open).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('ok'))
    expect(open).toHaveBeenCalledWith('https://example.com')
    window.friday = undefined
  })
})
