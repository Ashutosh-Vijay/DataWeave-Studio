/**
 * VS Code-webview replacement for `@tauri-apps/plugin-dialog`. Aliased in by
 * vite.config.vscode.ts. Routes open/save dialogs to the extension host, which
 * calls VS Code's native dialog API. Same call signature the UI already uses.
 */
import { invoke } from '../bridge';

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: DialogFilter[];
  defaultPath?: string;
  title?: string;
}

export interface SaveDialogOptions {
  defaultPath?: string;
  filters?: DialogFilter[];
  title?: string;
}

export function open(
  options: OpenDialogOptions = {}
): Promise<string | string[] | null> {
  return invoke('vscode_open_dialog', { options });
}

export function save(options: SaveDialogOptions = {}): Promise<string | null> {
  return invoke('vscode_save_dialog', { options });
}
