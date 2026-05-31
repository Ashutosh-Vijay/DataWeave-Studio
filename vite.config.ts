/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into separate chunks so the parser
        // doesn't chew through one massive file. NOTE: deliberately NOT
        // chunking `monaco-editor` here — Rollup interprets the package name
        // as an additional entry point, which re-pulls the default
        // editor.main.js (with TypeScript/CSS/HTML language contributions and
        // their ~9MB of dead worker chunks) regardless of how slimly we
        // import. Leave monaco inside the main bundle; tree-shaking from
        // edcore.main works correctly only without manualChunks for it.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
              return 'react-vendor';
            }
            if (id.includes('@tauri-apps/')) {
              return 'tauri';
            }
          }
        },
      },
    },
  },
}));
