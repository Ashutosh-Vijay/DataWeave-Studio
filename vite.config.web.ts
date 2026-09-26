import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as fs from "fs";
import * as path from "path";
import pkg from "./package.json";

// Build the shared React UI as a static site with the DataWeave engine compiled
// to WebAssembly (npm run build:wasm). No server: host dist-web/ anywhere static,
// e.g. GitHub Pages.
//
// Differences from the desktop (Tauri) build:
//  - base: "./" so the site works under any path (username.github.io/repo/).
//  - resolve.alias swaps the Tauri-only plugins for the same shims the VS Code
//    build uses; they route through bridge.ts, which picks src/webBackend.ts.
//  - the engine files are served from / copied to wasm/ by the plugin below,
//    rather than living in public/, so the other builds don't ship 60 MB of it.

const ENGINE_DIR = path.resolve(__dirname, "web-wasm/target");
const ENGINE_FILES = ["dwengine.js", "dwengine.js.wasm"];

function dataweaveEngine(): Plugin {
  let outDir = "";
  return {
    name: "dataweave-wasm-engine",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      const missing = ENGINE_FILES.filter((f) => !fs.existsSync(path.join(ENGINE_DIR, f)));
      if (missing.length) {
        throw new Error(`DataWeave WASM engine not built (missing ${missing.join(", ")}). Run npm run build:wasm first.`);
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? "").split("?")[0].replace(/^.*\/wasm\//, "");
        if (!(req.url ?? "").includes("/wasm/") || !ENGINE_FILES.includes(name)) return next();
        res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        fs.createReadStream(path.join(ENGINE_DIR, name)).pipe(res);
      });
    },
    closeBundle() {
      fs.mkdirSync(path.join(outDir, "wasm"), { recursive: true });
      for (const f of ENGINE_FILES) fs.copyFileSync(path.join(ENGINE_DIR, f), path.join(outDir, "wasm", f));
    },
  };
}

export default defineConfig({
  plugins: [react(), dataweaveEngine()],
  base: "./",
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
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
  server: {
    port: 1430,
    strictPort: true,
  },
  preview: {
    port: 1430,
    strictPort: true,
  },
  build: {
    outDir: "dist-web",
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
