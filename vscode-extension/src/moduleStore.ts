/**
 * Persistent global DataWeave module library (port of src-tauri/src/module_lib.rs).
 *
 * Users save reusable `.dwl` modules once and every run resolves
 * `import x from MyModule` against them. Stored as a single JSON file in the
 * extension's global storage: `[{ "name": "...", "content": "..." }]`.
 */
import * as fs from 'fs';
import * as path from 'path';

function modulesFile(storageDir: string): string {
  fs.mkdirSync(storageDir, { recursive: true });
  return path.join(storageDir, 'modules.json');
}

/** Load the saved module library as a JSON array string. Missing file → "[]". */
export function loadModules(storageDir: string): string {
  try {
    const s = fs.readFileSync(modulesFile(storageDir), 'utf8');
    return s.trim() ? s : '[]';
  } catch {
    return '[]';
  }
}

/** Persist the library. `json` must be a JSON array of `{name, content}`. */
export function saveModules(storageDir: string, json: string): void {
  const parsed = JSON.parse(json); // throws on invalid JSON → surfaced to the UI
  if (!Array.isArray(parsed)) throw new Error('Modules must be a JSON array');
  fs.writeFileSync(modulesFile(storageDir), json);
}
