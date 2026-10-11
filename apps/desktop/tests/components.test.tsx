import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { Composer, ModeSelector } from '../src/components/Composer'
import { ErrorBanner } from '../src/components/ErrorBanner'
import { MessageItem } from '../src/components/MessageItem'
import { Sidebar } from '../src/components/Sidebar'
import { BASE_SETTINGS } from './fixtures'
import type { AppSettings } from '../src/types/api'

const settings: AppSettings = { ...BASE_SETTINGS,
  default_mode: 'local', cloud_enabled: true, hosted_provider: 'anthropic', hosted_model: 'm', ollama_model: 'llama3',
  system_prompt: '', max_tokens: 1024, theme: 'dark',
}
const models = { ollama: { models: [{ id: 'llama3', name: 'llama3', provider: 'ollama' }], error: null } }

describe('Composer', () => {
  it('sends on Enter, keeps newline on Shift+Enter, and clears the field', async () => {
    const onSend = vi.fn()
    render(<Composer streaming={false} settings={settings} models={models} restored={null} onSend={onSend} onStop={vi.fn()} onSettings={vi.fn()} />)
    const box = screen.getByLabelText('Message FRIDAY')
    await userEvent.type(box, 'line one{Shift>}{Enter}{/Shift}line two')
    expect(box).toHaveValue('line one\nline two')
    await userEvent.type(box, '{Enter}')
    expect(onSend).toHaveBeenCalledWith('line one\nline two', [])
    expect(box).toHaveValue('')
  })
  it('disables send for blank input and shows Stop while streaming', async () => {
    const onStop = vi.fn()
    const { rerender } = render(<Composer streaming={false} settings={settings} models={models} restored={null} onSend={vi.fn()} onStop={onStop} onSettings={vi.fn()} />)
    expect(screen.getByLabelText('Send message')).toBeDisabled()
    rerender(<Composer streaming settings={settings} models={models} restored={null} onSend={vi.fn()} onStop={onStop} onSettings={vi.fn()} />)
    await userEvent.click(screen.getByLabelText('Stop generating'))
    expect(onStop).toHaveBeenCalled()
  })
  it('restores a rejected draft', () => {
    render(<Composer streaming={false} settings={settings} models={models} restored={{ text: 'my draft', n: 1 }} onSend={vi.fn()} onStop={vi.fn()} onSettings={vi.fn()} />)
    expect(screen.getByLabelText('Message FRIDAY')).toHaveValue('my draft')
  })
  it('changes model for the active mode', async () => {
    const onSettings = vi.fn()
    render(<Composer streaming={false} settings={settings} models={{ ollama: { models: [{ id: 'a', name: 'a', provider: 'ollama' }, { id: 'llama3', name: 'llama3', provider: 'ollama' }], error: null } }} restored={null} onSend={vi.fn()} onStop={vi.fn()} onSettings={onSettings} />)
    await userEvent.click(screen.getByLabelText('Model'))
    await userEvent.click(screen.getByRole('option', { name: /^a/ }))
    expect(onSettings).toHaveBeenCalledWith({ ollama_model: 'a' })
  })
})

describe('ModeSelector', () => {
  it('is an accessible radiogroup and reports changes', async () => {
    const onChange = vi.fn()
    render(<ModeSelector mode="smart" onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'Smart' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Cloud' }))
    expect(onChange).toHaveBeenCalledWith('cloud')
  })
})

describe('ErrorBanner', () => {
  it('announces the error and offers retry + settings only when relevant', async () => {
    const onRetry = vi.fn(), onSettings = vi.fn()
    render(<ErrorBanner error={{ code: 'auth_error', message: 'The API key was rejected.', retryable: false }} onRetry={onRetry} onSettings={onSettings} onDismiss={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The API key was rejected.')
    expect(screen.queryByText('Retry')).toBeNull()
    await userEvent.click(screen.getByText('Open settings'))
    expect(onSettings).toHaveBeenCalled()
  })
})

describe('MessageItem', () => {
  it('renders markdown with a copy button on code blocks and a stopped note', () => {
    render(<MessageItem busy={false} isLast onRegenerate={vi.fn()} m={{ id: '1', role: 'assistant', status: 'cancelled', provider: 'ollama', model: 'llama3', content: '**bold**\n\n```python\nprint(1)\n```' }} />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByLabelText('Copy code')).toBeInTheDocument()
    expect(screen.getByText(/Stopped before finishing/)).toBeInTheDocument()
    expect(screen.getByText(/On this device · llama3/)).toBeInTheDocument()
  })
  it('does not render raw HTML from model output', () => {
    render(<MessageItem busy={false} isLast={false} onRegenerate={vi.fn()} m={{ id: '1', role: 'assistant', content: '<img src=x onerror=alert(1)> hi' }} />)
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('Sidebar', () => {
  const conv = [{ id: 'c1', title: 'Zebras', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]
  const base = { conversations: conv, activeId: 'c1', search: '', onSearch: vi.fn(), onOpen: vi.fn(), onNew: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(), onSettings: vi.fn(), collapsed: false, onToggle: vi.fn() }
  it('requires confirmation before deleting', async () => {
    const onDelete = vi.fn()
    render(<Sidebar {...base} onDelete={onDelete} />)
    await userEvent.click(screen.getByLabelText('Delete Zebras'))
    expect(onDelete).not.toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText('Confirm delete Zebras'))
    expect(onDelete).toHaveBeenCalled()
  })
  it('supports rename', async () => {
    const onRename = vi.fn()
    render(<Sidebar {...base} onRename={onRename} />)
    await userEvent.click(screen.getByLabelText('Rename Zebras'))
    const input = screen.getByLabelText('Conversation title')
    await userEvent.clear(input); await userEvent.type(input, 'Zoo{Enter}')
    expect(onRename).toHaveBeenCalledWith('c1', 'Zoo')
  })
  it('shows an empty-search message', () => {
    render(<Sidebar {...base} conversations={[]} search="xyz" />)
    expect(screen.getByText('No conversations match your search.')).toBeInTheDocument()
  })
})
