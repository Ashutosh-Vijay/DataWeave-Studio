// Generates JSON resources the Rust MCP server serves (function reference +
// cookbook), from the app's existing auto-generated TS data. Re-run after
// scripts/extract-dw-docs.mjs or scripts/buildCookbook.mjs change the data.
//   node scripts/genMcpResources.mjs
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'fs';

// The data modules are self-contained (no imports), so the bundled CJS never
// calls require — a throwing stub is safe.
const noRequire = () => { throw new Error('require not supported in data module'); };

async function dump(tsFile, name, out) {
  const r = await build({ entryPoints: [tsFile], bundle: true, format: 'cjs', write: false, platform: 'node' });
  const code = r.outputFiles[0].text;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, noRequire);
  const data = m.exports[name];
  writeFileSync(out, JSON.stringify(data));
  return Array.isArray(data) ? data.length : Object.keys(data).length;
}

mkdirSync('src-tauri/resources/mcp', { recursive: true });
const f = await dump('src/dataweaveDocs.ts', 'DW_FUNCTIONS', 'src-tauri/resources/mcp/dw_functions.json');
const c = await dump('src/cookbookRecipes.ts', 'COOKBOOK_RECIPES', 'src-tauri/resources/mcp/dw_cookbook.json');
console.log('functions:', f, ' recipes:', c);
