/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        bg: 'var(--bg)',
        rail: 'var(--rail)',
        surface: {
          DEFAULT: 'var(--surface)',
          panel: 'var(--surface-panel)',
          elevated: 'var(--surface-elevated)',
          input: 'var(--surface-input)',
          section: 'var(--surface-section)',
          sidebar: 'var(--surface-sidebar)',
          active: 'var(--surface-active)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        content: {
          DEFAULT: 'var(--content)',
          secondary: 'var(--content-secondary)',
          muted: 'var(--content-muted)',
          faint: 'var(--content-faint)',
          ghost: 'var(--content-ghost)',
        },
        line: {
          DEFAULT: 'var(--line)',
          secondary: 'var(--line-secondary)',
          subtle: 'var(--line-subtle)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          dim: 'var(--accent-dim)',
          border: 'var(--accent-border)',
          ink: 'var(--accent-ink)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          tint: 'color-mix(in oklch, var(--warn) 12%, transparent)',
          border: 'color-mix(in oklch, var(--warn) 30%, transparent)',
        },
        err: {
          DEFAULT: 'var(--err)',
          tint: 'color-mix(in oklch, var(--err) 12%, transparent)',
          border: 'color-mix(in oklch, var(--err) 30%, transparent)',
        },
        violet: {
          DEFAULT: 'var(--violet)',
          tint: 'color-mix(in oklch, var(--violet) 14%, transparent)',
          border: 'color-mix(in oklch, var(--violet) 30%, transparent)',
        },
        cyan: {
          DEFAULT: 'var(--cyan)',
          tint: 'color-mix(in oklch, var(--cyan) 14%, transparent)',
          border: 'color-mix(in oklch, var(--cyan) 30%, transparent)',
        },
      },
    },
  },
  plugins: [],
}
