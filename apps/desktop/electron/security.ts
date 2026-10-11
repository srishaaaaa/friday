import { type IpcMainInvokeEvent, session } from 'electron'

export const DEV_URL = process.env.VITE_DEV_SERVER_URL

/** True only for the app's own renderer (dev server origin, or the packaged file:// bundle). */
export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  if (DEV_URL) return url.startsWith(DEV_URL)
  return url.startsWith('file://') && url.endsWith('/dist/index.html')
}

export function assertTrusted(event: IpcMainInvokeEvent): void {
  if (!isTrustedSender(event)) throw new Error('Rejected IPC call from untrusted sender')
}

/** Only plain https links may leave the app (opened in the user's browser, never in-app). */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export function lockDownSession(backendOrigin: string): void {
  const ses = session.defaultSession
  // FRIDAY needs no camera, microphone, geolocation, notifications etc. in this release.
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  ses.setPermissionCheckHandler(() => false)
  if (DEV_URL) return // dev server needs inline scripts/HMR; production CSP is a <meta> in index.html
  ses.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src ${backendOrigin}; base-uri 'none'; form-action 'none'; object-src 'none'`,
        ],
      },
    })
  })
}
