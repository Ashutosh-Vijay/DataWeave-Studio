/**
 * VS Code-webview replacement for `@tauri-apps/plugin-updater`. The Marketplace
 * handles extension updates, so check() always reports "no update". The Update
 * type mirrors the bits the UI consumes so the call sites still type-check.
 */

type DownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished'; data?: unknown };

export interface Update {
  available: boolean;
  version: string;
  currentVersion?: string;
  body?: string;
  date?: string;
  downloadAndInstall(onEvent?: (e: DownloadEvent) => void): Promise<void>;
}

export async function check(): Promise<Update | null> {
  return null;
}
