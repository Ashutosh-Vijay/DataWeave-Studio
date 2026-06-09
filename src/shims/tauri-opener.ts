/**
 * VS Code-webview replacement for `@tauri-apps/plugin-opener`. Routes to the
 * extension host, which uses vscode.env.openExternal.
 */
import { invoke } from '../bridge';

export async function openPath(path: string): Promise<void> {
  await invoke('vscode_open_path', { path });
}

export async function openUrl(url: string): Promise<void> {
  await invoke('vscode_open_external', { url });
}
