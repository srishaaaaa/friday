import os from 'node:os'
import path from 'node:path'
import { BrowserWindow, Menu, app, dialog, ipcMain, shell } from 'electron'
import { getBackendConfig, getBackendError, startBackend, stopBackend } from './backend'
import { DEV_URL, assertTrusted, lockDownSession, safeExternalUrl } from './security'

let win: BrowserWindow | null = null
const WINDOW_ACTIONS = new Set(['minimize', 'maximize', 'close', 'toggle-pin'])

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1280, height: 820, minWidth: 480, minHeight: 500,
    frame: false, backgroundColor: '#050914', show: false, title: 'FRIDAY',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false, spellcheck: false,
    },
  })
  w.once('ready-to-show', () => w.show())
  w.webContents.setWindowOpenHandler(({ url }) => {
    const safe = safeExternalUrl(url)
    if (safe) void shell.openExternal(safe)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (e, url) => {
    if (!(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault()
  })
  w.on('maximize', () => w.webContents.send('friday:maximized', true))
  w.on('unmaximize', () => w.webContents.send('friday:maximized', false))
  if (DEV_URL) void w.loadURL(DEV_URL)
  else void w.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  return w
}

function registerIpc(): void {
  ipcMain.handle('friday:backend-config', (e) => {
    assertTrusted(e)
    return { config: getBackendConfig(), error: getBackendError() }
  })
  ipcMain.handle('friday:window', (e, action: unknown) => {
    assertTrusted(e)
    if (typeof action !== 'string' || !WINDOW_ACTIONS.has(action) || !win) return false
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize())
    else if (action === 'close') win.close()
    else { win.setAlwaysOnTop(!win.isAlwaysOnTop()); return win.isAlwaysOnTop() }
    return true
  })
  ipcMain.handle('friday:is-maximized', (e) => {
    assertTrusted(e)
    return win?.isMaximized() ?? false
  })
  ipcMain.handle('friday:open-external', (e, url: unknown) => {
    assertTrusted(e)
    const safe = safeExternalUrl(url)
    if (!safe) return false
    void shell.openExternal(safe)
    return true
  })
  ipcMain.handle('friday:app-info', (e) => {
    assertTrusted(e)
    return { version: app.getVersion(), electron: process.versions.electron, platform: process.platform, arch: process.arch }
  })
  ipcMain.handle('friday:is-pinned', (e) => {
    assertTrusted(e)
    return win?.isAlwaysOnTop() ?? false
  })
  ipcMain.handle('friday:system-info', async (e) => {
    assertTrusted(e)
    const cpus = os.cpus()
    let gpus: string[] = []
    try {
      const info = (await app.getGPUInfo('basic')) as { gpuDevice?: { description?: string; active?: boolean }[] }
      gpus = (info.gpuDevice ?? []).map((g) => g.description ?? '').filter(Boolean)
    } catch { /* GPU info is best-effort */ }
    return {
      cpu: cpus[0]?.model.trim() ?? 'Unknown', cores: cpus.length,
      totalMem: os.totalmem(), freeMem: os.freemem(), gpus, os: `${os.type()} ${os.release()}`,
    }
  })
  ipcMain.handle('friday:login-item', (e, enable: unknown) => {
    assertTrusted(e)
    if (typeof enable === 'boolean' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: enable })
    return { openAtLogin: app.getLoginItemSettings().openAtLogin, supported: app.isPackaged }
  })
}

if (process.platform === 'win32') app.setAppUserModelId('com.friday.assistant')
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    registerIpc()
    try {
      const cfg = await startBackend()
      lockDownSession(new URL(cfg.baseUrl).origin)
    } catch (e) {
      lockDownSession('http://127.0.0.1:*')
      dialog.showErrorBox('FRIDAY could not start its backend', (e as Error).message)
    }
    win = createWindow()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', stopBackend)
}
