/**
 * VS Code-webview replacement for `@tauri-apps/api/app`. Reports the extension
 * version (the host reads it from the extension's package.json).
 */
import { invoke } from '../bridge';

export async function getVersion(): Promise<string> {
  try {
    return await invoke<string>('get_app_version');
  } catch {
    return '0.0.0';
  }
}
