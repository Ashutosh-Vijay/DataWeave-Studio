/**
 * VS Code-webview replacement for `@tauri-apps/plugin-process`. There's no
 * process to relaunch — the extension runs inside VS Code — so this is a no-op.
 * (Only reached from update flows, which never fire since the updater shim
 * reports no updates.)
 */
export async function relaunch(): Promise<void> {
  /* no-op in VS Code */
}
