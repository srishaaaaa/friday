import { contextBridge, ipcRenderer } from 'electron'

// Narrow, explicit surface. No filesystem, shell or arbitrary-channel access is exposed.
contextBridge.exposeInMainWorld('friday', {
  getBackendConfig: () => ipcRenderer.invoke('friday:backend-config'),
  appInfo: () => ipcRenderer.invoke('friday:app-info'),
  openExternal: (url: string) => ipcRenderer.invoke('friday:open-external', url),
  systemInfo: () => ipcRenderer.invoke('friday:system-info'),
  loginItem: (enable?: boolean) => ipcRenderer.invoke('friday:login-item', enable),
  window: {
    minimize: () => ipcRenderer.invoke('friday:window', 'minimize'),
    maximize: () => ipcRenderer.invoke('friday:window', 'maximize'),
    close: () => ipcRenderer.invoke('friday:window', 'close'),
    togglePin: () => ipcRenderer.invoke('friday:window', 'toggle-pin'),
    isMaximized: () => ipcRenderer.invoke('friday:is-maximized'),
    isPinned: () => ipcRenderer.invoke('friday:is-pinned'),
    onMaximizeChange: (cb: (v: boolean) => void) => {
      const handler = (_: unknown, v: boolean) => cb(Boolean(v))
      ipcRenderer.on('friday:maximized', handler)
      return () => ipcRenderer.removeListener('friday:maximized', handler)
    },
  },
})
