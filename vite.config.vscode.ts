import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

// Build the shared React UI for the VS Code webview.
//
// Differences from the desktop (Tauri) build:
//  - base: "./"  — relative asset URLs, so the host can resolve them against a
//    <base href> pointing at the webview's resource URI.
//  - resolve.alias — swap the Tauri-only plugins for webview shims (src/shims/).
//    @tauri-apps/api/core is NOT aliased: bridge.ts routes invoke() at runtime.
//  - outDir — vscode-extension/webview-dist, so the bundle sits inside the
//    extension (under its localResourceRoots) for packaging.
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "src/shims/tauri-dialog.ts"),
      "@tauri-apps/plugin-opener": path.resolve(__dirname, "src/shims/tauri-opener.ts"),
      "@tauri-apps/plugin-updater": path.resolve(__dirname, "src/shims/tauri-updater.ts"),
      "@tauri-apps/plugin-process": path.resolve(__dirname, "src/shims/tauri-process.ts"),
      "@tauri-apps/api/app": path.resolve(__dirname, "src/shims/tauri-app.ts"),
      "@tauri-apps/api/window": path.resolve(__dirname, "src/shims/tauri-window.ts"),
    },
  },
  build: {
    outDir: "vscode-extension/webview-dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
              return "react-vendor";
            }
          }
        },
      },
    },
  },
});
