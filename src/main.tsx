import React from "react";
import ReactDOM from "react-dom/client";
// Slim Monaco entry: editor core API + contributions only, no language packs.
// Importing the default `monaco-editor` pulls in CSS, HTML, TypeScript, and
// ~80 basic languages we never use — adds 9MB of dead chunks. Splitting the
// import: editor.api gives us the typed API surface, edcore.main runs as a
// side-effect to register editor contributions (find, format, comment, etc.)
// without any language packs.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/edcore.main";
// Explicitly opt into the JSON language (used for payload + output editors).
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import { loader } from "@monaco-editor/react";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./ThemeContext";
import { isTauri } from "./bridge";
import "./index.css";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return new jsonWorker();
    return new editorWorker();
  },
};

// Use locally bundled Monaco instead of CDN
loader.config({ monaco });

// Webview-only: force Monaco's classic hidden-<textarea> input model instead of
// the experimental EditContext (default-on in 0.55). EditContext attaches its
// paste/copy listeners to a plain <div>; inside VS Code's sandboxed webview
// iframe the browser gates `paste`-event delivery on clipboard-READ permission
// for the frame (copy/cut = write still fire), so Ctrl+V / right-click paste /
// Shift+Insert all silently die while copy works. The <textarea> model isn't
// gated this way — it's how VS Code's own editors paste in the same sandbox.
// Patch both factories once here so every editor (and any future one) inherits
// it. Desktop runs in WebView2 (not a sandboxed iframe) and pastes fine on
// EditContext, so leave it alone there.
if (!isTauri) {
  const ed = monaco.editor as unknown as {
    create: (...a: any[]) => unknown;
    createDiffEditor: (...a: any[]) => unknown;
  };
  const origCreate = ed.create;
  const origDiff = ed.createDiffEditor;
  ed.create = (el: unknown, opts?: any, ...rest: unknown[]) =>
    origCreate(el, { editContext: false, ...opts }, ...rest);
  ed.createDiffEditor = (el: unknown, opts?: any, ...rest: unknown[]) =>
    origDiff(el, { editContext: false, ...opts }, ...rest);
}

// Apply the user's saved accent before React mounts so the first paint
// already has the right color. Without this, the app boots with emerald
// and only updates to the saved accent once SettingsScreen mounts and
// re-applies it — which is annoying for users who picked sky or violet.
(function applySavedAccent() {
  try {
    // When adopting the VS Code theme, the accent comes from VS Code's button
    // color via the .dw-vscode-theme CSS class — setting an inline --accent here
    // would override it (inline beats class), so skip.
    if (!isTauri && localStorage.getItem("dw.matchVsCode") !== "0") return;
    const id = localStorage.getItem("dw.accent");
    if (!id || id === "emerald") return; // emerald is the CSS default
    const swatches: Record<string, { hue: number; chroma: number }> = {
      emerald: { hue: 158, chroma: 0.15 },
      sky:     { hue: 220, chroma: 0.13 },
      violet:  { hue: 290, chroma: 0.14 },
      amber:   { hue: 80,  chroma: 0.14 },
      rose:    { hue: 20,  chroma: 0.18 },
    };
    const sw = swatches[id];
    if (!sw) return;
    const isDark = !document.documentElement.classList.contains("light");
    const L = isDark ? 72 : 55;
    const hoverL = isDark ? 78 : 50;
    const root = document.documentElement;
    root.style.setProperty("--accent", `oklch(${L}% ${sw.chroma} ${sw.hue})`);
    root.style.setProperty("--accent-hover", `oklch(${hoverL}% ${sw.chroma} ${sw.hue})`);
    root.style.setProperty("--accent-dim", `oklch(${L}% ${sw.chroma} ${sw.hue} / 0.14)`);
    root.style.setProperty("--accent-border", `oklch(${L}% ${sw.chroma} ${sw.hue} / 0.32)`);
  } catch { /* ignore */ }
})();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Tell the VS Code webview boot overlay that React has mounted, so it can lift
// once the engine is also warm (no-op on desktop — nothing listens). Guarded so
// we don't post on Tauri.
if (!isTauri) {
  requestAnimationFrame(() => window.postMessage({ kind: "dw-app-mounted" }, "*"));
}
