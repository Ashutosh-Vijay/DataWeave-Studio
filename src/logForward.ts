/**
 * Forward `console.log/info/warn/error` to the Tauri log plugin so messages
 * also show up in the `npm run tauri dev` terminal — saves opening DevTools
 * for quick debug runs. Browser console still gets them too (we wrap, not
 * replace).
 *
 * Imported once for side effects from main.tsx.
 */

import { info, warn, error } from '@tauri-apps/plugin-log';

const orig = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

function fmt(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(' ');
}

console.log = (...args: unknown[]) => {
  orig.log.apply(console, args);
  void info(fmt(args)).catch(() => {});
};
console.info = (...args: unknown[]) => {
  orig.info.apply(console, args);
  void info(fmt(args)).catch(() => {});
};
console.warn = (...args: unknown[]) => {
  orig.warn.apply(console, args);
  void warn(fmt(args)).catch(() => {});
};
console.error = (...args: unknown[]) => {
  orig.error.apply(console, args);
  void error(fmt(args)).catch(() => {});
};
