/**
 * VS Code-webview replacement for `@tauri-apps/api/window`. A webview panel is
 * a VS Code tab, not an OS window — there's nothing to minimize/maximize/close.
 * These are no-ops so the shared code doesn't crash; WindowControls itself
 * renders nothing in the webview (see WindowControls.tsx).
 */
export function getCurrentWindow() {
  return {
    async isMaximized(): Promise<boolean> {
      return false;
    },
    async onResized(_cb: () => void): Promise<() => void> {
      return () => {};
    },
    minimize() {},
    maximize() {},
    unmaximize() {},
    toggleMaximize() {},
    close() {},
    async setTitle(_title: string) {},
  };
}
