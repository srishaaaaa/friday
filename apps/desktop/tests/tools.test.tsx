import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MessageItem } from '../src/components/MessageItem'
import { Sources, ToolActivity, toolState } from '../src/components/ToolActivity'
import type { ToolEvent } from '../src/types/api'

describe('ToolActivity', () => {
  it('shows exactly what an action will do and reports Allow / Deny', async () => {
    const onApprove = vi.fn()
    const t: ToolEvent = { id: 'c1', name: 'run_command', label: 'Running a command', detail: 'Get-Date', state: 'awaiting', args: { command: 'Get-Date' } }
    render(<ToolActivity tools={[t]} onApprove={onApprove} live />)
    expect(screen.getByRole('alertdialog', { name: /Run a PowerShell command/ })).toHaveTextContent('Get-Date')
    await userEvent.click(screen.getByText('Deny'))
    expect(onApprove).toHaveBeenCalledWith('c1', false)
    await userEvent.click(screen.getByText('Allow'))
    expect(onApprove).toHaveBeenCalledWith('c1', true)
  })
  it('never shows an approval prompt for a finished (stored) reply', () => {
    const t = toolState({ id: 'c2', name: 'save_file', label: 'Saving a file', detail: 'a.txt', approval: 'declined', ok: false, summary: 'Declined by you' } as never)
    render(<ToolActivity tools={[t]} />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(t.state).toBe('declined')
    expect(screen.getByText('Declined by you')).toBeInTheDocument()
  })
})

describe('Sources', () => {
  it('lists numbered sources and opens them', async () => {
    const onOpen = vi.fn()
    render(<Sources sources={[{ n: 1, title: 'Gemma 4', url: 'https://www.example.com/g4' }]} onOpen={onOpen} />)
    expect(screen.getByText('example.com')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Gemma 4'))
    expect(onOpen).toHaveBeenCalledWith('https://www.example.com/g4')
  })
  it('renders tools and sources inside an assistant reply', () => {
    render(<MessageItem busy={false} isLast onRegenerate={vi.fn()} m={{
      id: 'm1', role: 'assistant', content: 'Released in 2026 [1].', provider: 'ollama', model: 'gemma4:cloud',
      tools: [{ id: 'w', name: 'web_search', label: 'Searching the web', detail: 'gemma 4', state: 'done', summary: '5 results' }],
      sources: [{ n: 1, title: 'Gemma 4 launch', url: 'https://example.com' }],
    }} />)
    expect(screen.getByLabelText('Tool activity')).toHaveTextContent('Searching the web')
    expect(screen.getByLabelText('Sources')).toHaveTextContent('Gemma 4 launch')
  })
})
