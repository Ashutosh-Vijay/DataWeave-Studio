/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--surface)',
          panel: 'var(--surface-panel)',
          elevated: 'var(--surface-elevated)',
          input: 'var(--surface-input)',
          section: 'var(--surface-section)',
          sidebar: 'var(--surface-sidebar)',
          active: 'var(--surface-active)',
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
      },
    },
  },
  plugins: [],
}
