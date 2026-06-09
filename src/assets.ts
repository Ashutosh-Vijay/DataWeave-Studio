// Asset URLs that must resolve in both runtimes.
//
// Desktop (Tauri): base is "/", so logoUrl is "/logo.svg".
//
// VS Code webview: a relative/"./" path is NOT enough — the webview document is
// served from a `vscode-webview://` origin that doesn't map to the extension's
// files. Asset URLs must be the absolute `asWebviewUri` form. The host injects
// that base as window.__WEBVIEW_BASE__ before the bundle runs (see
// vscode-extension getWebviewHtml).
declare global {
  interface Window {
    __WEBVIEW_BASE__?: string;
  }
}

const base =
  (typeof window !== 'undefined' && window.__WEBVIEW_BASE__) ||
  import.meta.env.BASE_URL;

export const logoUrl = `${base}logo.svg`;
