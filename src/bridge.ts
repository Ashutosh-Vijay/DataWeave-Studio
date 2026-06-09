/**
 * Backend bridge. The shared React UI calls `invoke('command', args)` exactly
 * the same way in both runtimes — this module routes the call to the right
 * place:
 *
 *   - Desktop (Tauri):  window has `__TAURI_INTERNALS__` → delegate to the real
 *     Tauri `invoke()`, which round-trips to the Rust commands in src-tauri/.
 *   - VS Code webview:  `acquireVsCodeApi()` exists → postMessage to the
 *     extension host (vscode-extension/), which reimplements the same command
 *     surface in Node. The host replies with a matching message keyed by id.
 *
 * Wire protocol (must match vscode-extension/src/extension.ts):
 *   webview → host:  { kind: 'invoke',        id, cmd, args }
 *   host → webview:  { kind: 'invoke:result', id, ok, value? , error? }
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core';

// Tauri injects __TAURI_INTERNALS__ into the webview global before our code
// runs. Its absence means we're in the VS Code webview (or a plain browser).
// Exported so UI can drop desktop-only chrome (e.g. window controls) in VS Code.
export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// --- VS Code webview transport ----------------------------------------------
// acquireVsCodeApi() may be called only ONCE per webview, so cache the handle.
type VsCodeApi = { postMessage: (msg: unknown) => void };
let vscode: VsCodeApi | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: unknown) => void }
>();

function ensureVsCode(): VsCodeApi {
  if (vscode) return vscode;
  const acquire = (window as unknown as {
    acquireVsCodeApi?: () => VsCodeApi;
  }).acquireVsCodeApi;
  if (!acquire) {
    throw new Error(
      'Not running in Tauri or a VS Code webview — no backend transport available.'
    );
  }
  vscode = acquire();
  window.addEventListener('message', (ev: MessageEvent) => {
    const msg = ev.data;
    if (!msg || msg.kind !== 'invoke:result') return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.value);
    else p.reject(new Error(msg.error ?? 'Backend error'));
  });
  return vscode;
}

function vscodeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const api = ensureVsCode();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    api.postMessage({ kind: 'invoke', id, cmd, args: args ?? {} });
  });
}

/**
 * The one call the whole UI uses. Same signature as Tauri's `invoke`, so the
 * call sites don't care which runtime they're in.
 */
export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return isTauri ? tauriInvoke<T>(cmd, args) : vscodeInvoke<T>(cmd, args);
}
