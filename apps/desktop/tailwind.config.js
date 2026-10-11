/** @type {import('tailwindcss').Config} */
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: rgb('--text-rgb'), mute: rgb('--muted-rgb'), faint: rgb('--faint-rgb'),
        accent: rgb('--accent-rgb'), accent2: rgb('--accent2-rgb'), accent3: rgb('--accent3-rgb'),
        ok: rgb('--ok-rgb'), warn: rgb('--warn-rgb'), danger: rgb('--danger-rgb'),
        bg0: rgb('--bg0-rgb'), bg1: rgb('--bg1-rgb'), bg2: rgb('--bg2-rgb'),
        line: 'var(--line)', 'line-strong': 'var(--line-strong)',
      },
      fontFamily: {
        sans: ['"Manrope Variable"', '"Segoe UI Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'Consolas', 'monospace'],
      },
      borderRadius: { xs: 'var(--r-xs)', sm: 'var(--r-sm)', md: 'var(--r-md)', lg: 'var(--r-lg)', xl: 'var(--r-xl)' },
      zIndex: { panel: '30', menu: '60', modal: '80', toast: '90', tooltip: '100' },
    },
  },
  plugins: [],
}
