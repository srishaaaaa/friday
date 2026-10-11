import { type ChildProcess, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { app } from 'electron'

export interface BackendConfig {
  baseUrl: string
  token: string
}

let child: ChildProcess | null = null
let config: BackendConfig | null = null
let lastError: string | null = null

export const getBackendConfig = () => config
export const getBackendError = () => lastError

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo
      srv.close(() => resolve(port))
    })
  })
}

async function waitForHealth(baseUrl: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`Backend exited (code ${child.exitCode}).`)
    try {
      const r = await fetch(`${baseUrl}/health`)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('Backend did not become healthy within 30 seconds.')
}

function command(): { cmd: string; args: string[]; cwd?: string } {
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, 'backend', 'friday-backend.exe')
    if (!fs.existsSync(exe)) throw new Error(`Backend executable missing: ${exe}`)
    return { cmd: exe, args: [] }
  }
  const root = path.resolve(__dirname, '..', '..', '..', 'backend')
  // Launched from a shortcut (no dev script): fall back to the project venv created by `npm run setup`.
  const venv = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const py = process.env.FRIDAY_PYTHON ?? (fs.existsSync(venv) ? venv : 'python')
  return { cmd: py, args: ['-m', 'app.main'], cwd: root }
}

export async function startBackend(): Promise<BackendConfig> {
  const port = await freePort()
  const token = randomBytes(32).toString('hex')
  const { cmd, args, cwd } = command()
  const dataDir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  child = spawn(cmd, args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, FRIDAY_HOST: '127.0.0.1', FRIDAY_PORT: String(port), FRIDAY_TOKEN: token, FRIDAY_DATA_DIR: dataDir },
  })
  let stderrTail = ''
  child.stderr?.on('data', (d: Buffer) => (stderrTail = (stderrTail + d.toString()).slice(-2000)))
  child.on('error', (e) => (lastError = `Could not start backend: ${e.message}`))
  const baseUrl = `http://127.0.0.1:${port}`
  try {
    await waitForHealth(baseUrl)
  } catch (e) {
    lastError = `${(e as Error).message}${stderrTail ? `\n${stderrTail}` : ''}`
    stopBackend()
    throw new Error(lastError)
  }
  config = { baseUrl, token }
  return config
}

export function stopBackend(): void {
  if (child && child.exitCode === null) {
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    else child.kill('SIGTERM')
  }
  child = null
}
