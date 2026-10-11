import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AIOrb } from '../src/components/AIOrb'
import { Composer } from '../src/components/Composer'
import { MessageItem } from '../src/components/MessageItem'
import { ConfirmDialog } from '../src/components/ui/Dialog'
import { BASE_SETTINGS } from './fixtures'
import type { AppSettings, ProviderStatus } from '../src/types/api'
import { isOllamaCloud, readiness, whereFor } from '../src/utils/models'

const settings: AppSettings = { ...BASE_SETTINGS,
  default_mode: 'local', cloud_enabled: true, hosted_provider: 'anthropic', hosted_model: 'm', ollama_model: 'gemma4:e2b',
  system_prompt: '', max_tokens: 1024, theme: 'dark',
}
const up = (id: string, available: boolean): ProviderStatus => ({ id, name: id, local: id === 'ollama', configured: true, available, detail: '' })

describe('model location labels', () => {
  it('distinguishes Ollama cloud models from on-device models', () => {
    expect(isOllamaCloud('gemma4:cloud')).toBe(true)
    expect(isOllamaCloud('gpt-oss:120b-cloud')).toBe(true)
    expect(isOllamaCloud('gemma4:e2b')).toBe(false)
    expect(whereFor('ollama', 'gemma4:cloud')).toEqual({ label: 'Ollama cloud', remote: true })
    expect(whereFor('ollama', 'gemma4:e2b')).toEqual({ label: 'On this device', remote: false })
    expect(whereFor('anthropic', 'x')?.remote).toBe(true)
    expect(whereFor(null, 'x')).toBeNull()
  })
  it('labels a cloud reply honestly in the message header', () => {
    render(<MessageItem busy={false} isLast={false} onRegenerate={vi.fn()} m={{ id: '1', role: 'assistant', provider: 'ollama', model: 'gemma4:cloud', content: 'hi' }} />)
    expect(screen.getByText('Ollama cloud · gemma4:cloud')).toBeInTheDocument()
  })
})

describe('readiness', () => {
  it('follows the routing mode preconditions', () => {
    expect(readiness(settings, [up('ollama', true), up('anthropic', false)]).ready).toBe(true)
    expect(readiness({ ...settings, ollama_model: '' }, [up('ollama', true)]).ready).toBe(false)
    expect(readiness({ ...settings, default_mode: 'cloud' }, [up('ollama', true), up('anthropic', true)]).ready).toBe(true)
    expect(readiness({ ...settings, default_mode: 'cloud', cloud_enabled: false }, [up('anthropic', true)]).ready).toBe(false)
    expect(readiness(settings, []).checked).toBe(false)
  })
})

describe('AIOrb', () => {
  it('exposes its real state to assistive tech', () => {
    const { rerender } = render(<AIOrb state="thinking" />)
    expect(screen.getByRole('img', { name: 'FRIDAY: Thinking' })).toHaveAttribute('data-state', 'thinking')
    rerender(<AIOrb state="offline" />)
    expect(screen.getByRole('img', { name: 'FRIDAY: No AI provider available' })).toBeInTheDocument()
  })
})

describe('Composer prefill', () => {
  it('fills the draft from a suggestion card without sending', () => {
    const onSend = vi.fn()
    render(<Composer streaming={false} settings={settings} models={{}} restored={null} prefill={{ text: 'Plan this: ', n: 1 }} onSend={onSend} onStop={vi.fn()} onSettings={vi.fn()} />)
    expect(screen.getByLabelText('Message FRIDAY')).toHaveValue('Plan this: ')
    expect(onSend).not.toHaveBeenCalled()
  })
  it('Escape stops generation', async () => {
    const onStop = vi.fn()
    render(<Composer streaming settings={settings} models={{}} restored={null} onSend={vi.fn()} onStop={onStop} onSettings={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Message FRIDAY'), '{Escape}')
    expect(onStop).toHaveBeenCalled()
  })
})

describe('ConfirmDialog', () => {
  it('focuses Cancel first and closes on Escape', async () => {
    const onCancel = vi.fn(), onConfirm = vi.fn()
    render(<ConfirmDialog open title="Delete?" body="Gone forever" confirmLabel="Delete" onCancel={onCancel} onConfirm={onConfirm} />)
    expect(screen.getByText('Cancel')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
