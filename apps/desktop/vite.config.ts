/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Production-only CSP (meta tag, because file:// pages receive no response headers).
// The dev server needs inline scripts/websockets for HMR, so it is intentionally excluded.
const prodCsp = (): Plugin => ({
  name: 'friday-prod-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<!--CSP-->',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src http://127.0.0.1:*; base-uri 'none'; form-action 'none'; object-src 'none'" />`,
    ),
})

export default defineConfig({
  base: './',
  plugins: [react(), prodCsp()],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'jsdom', globals: true, setupFiles: ['tests/setup.ts'], css: false },
})
