import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ModelSelect } from '../src/components/Composer'
import { ModelVerifier } from '../src/components/ModelVerifier'
import { api } from '../src/services/api'
import type { ModelInfo, ModelsResponse } from '../src/types/api'
import { BASE_SETTINGS } from './fixtures'

const discovered: ModelInfo[] = [
  { id: 'gemma4:cloud', name: 'gemma4:cloud', provider: 'ollama', remote: true, remote_model: 'gemma4:31b', parameter_size: '32.7B', capabilities: ['completion', 'tools', 'vision', 'thinking'], can_chat: true },
  { id: 'gemma4:e2b', name: 'gemma4:e2b', provider: 'ollama', remote: false, parameter_size: '4.6B', quantization: 'Q4_K_M', size: 4587156505, context_length: 131072, capabilities: ['completion', 'vision', 'tools'], can_chat: true },
  { id: 'nomic-embed-text:latest', name: 'nomic-embed-text:latest', provider: 'ollama', capabilities: ['embedding'], can_chat: false },
]
const models: ModelsResponse = { ollama: { models: discovered, error: null } }
const up = [{ id: 'ollama', name: 'Ollama', local: true, configured: true, available: true, detail: '' }]

describe('ModelSelect (discovered models)', () => {
  it('lists exact model IDs with reported metadata and refreshes when opened', async () => {
    const onRefresh = vi.fn(), onChange = vi.fn()
    render(<ModelSelect settings={{ ...BASE_SETTINGS, ollama_model: 'gemma4:e2b' }} models={models} providers={up} onChange={onChange} onRefresh={onRefresh} />)
    await userEvent.click(screen.getByLabelText('Model'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    const list = screen.getByRole('listbox', { name: 'Choose a model' })
    expect(within(list).getByText('gemma4:cloud')).toBeInTheDocument()
    expect(within(list).getByText(/4\.6B · Q4_K_M · 4\.3 GB · 128K ctx · on device/)).toBeInTheDocument()
    expect(within(list).getByText(/Ollama cloud → gemma4:31b/)).toBeInTheDocument()
    expect(within(list).getByText('nomic-embed-text:latest').closest('[role=option]')).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(within(list).getByText('gemma4:cloud'))
    expect(onChange).toHaveBeenCalledWith({ ollama_model: 'gemma4:cloud' })
  })
  it('warns when the selected model is no longer installed', async () => {
    render(<ModelSelect settings={{ ...BASE_SETTINGS, ollama_model: 'mistral:7b' }} models={models} providers={up} onChange={vi.fn()} />)
    await userEvent.click(screen.getByLabelText('Model'))
    expect(screen.getByText(/Selected but not installed/)).toBeInTheDocument()
    expect(screen.getByText('ollama pull mistral:7b', { exact: false })).toBeInTheDocument()
  })
})

describe('ModelVerifier', () => {
  it('runs a real check per model and reports success and failure', async () => {
    const spy = vi.spyOn(api, 'verifyModel').mockImplementation(async (_p, model) => model === 'gemma4:e2b'
      ? { provider: 'ollama', model, ok: true, latency_ms: 2300, first_token_ms: 900, sample: 'ready', error: null }
      : { provider: 'ollama', model, ok: false, latency_ms: 10, first_token_ms: null, sample: '', error: { code: 'provider_error', message: 'Ollama returned HTTP 500' } })
    render(<ModelVerifier provider="ollama" models={discovered} selected="gemma4:e2b" />)
    await userEvent.click(screen.getByText('Test all'))
    expect(await screen.findByText(/Replied “ready” · first token 900 ms · total 2\.3 s/)).toBeInTheDocument()
    expect(screen.getByText('Ollama returned HTTP 500')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(2) // the embedding-only model is skipped
    expect(screen.getByLabelText('Test nomic-embed-text:latest')).toBeDisabled()
    spy.mockRestore()
  })
})
