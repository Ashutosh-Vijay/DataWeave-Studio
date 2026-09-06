// Generates JSON resources the Rust MCP server serves (function reference +
// cookbook), from the app's existing auto-generated TS data.
//   node scripts/genMcpResources.mjs
//
// This runs as the last step of `npm run docs:refresh`. It has to: the app
// reads the TS modules directly, the MCP server reads these JSON copies, and
// for months nothing regenerated them — the agent-facing reference sat at 309
// functions and 83 recipes while the app had 360 and 172.
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'fs';

// The data modules are self-contained (no imports), so the bundled CJS never
// calls require — a throwing stub is safe.
const noRequire = () => { throw new Error('require not supported in data module'); };

async function load(tsFile, name) {
  const r = await build({ entryPoints: [tsFile], bundle: true, format: 'cjs', write: false, platform: 'node' });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', r.outputFiles[0].text)(m, m.exports, noRequire);
  return m.exports[name];
}

mkdirSync('src-tauri/resources/mcp', { recursive: true });

const functions = await load('src/dataweaveDocs.ts', 'DW_FUNCTIONS');
writeFileSync('src-tauri/resources/mcp/dw_functions.json', JSON.stringify(functions));

// Both recipe sets, deduped by id — exactly what RecipeBrowser.tsx shows. The
// MCP used to serve only the hand-built set, so an agent couldn't reach any of
// the recipes extracted from MuleSoft's own cookbook.
const recipes = [
  ...(await load('src/cookbookRecipes.ts', 'COOKBOOK_RECIPES')),
  ...(await load('src/cookbookOfficialRecipes.ts', 'OFFICIAL_RECIPES')),
];
const merged = [...new Map(recipes.map((r) => [r.id, r])).values()];
writeFileSync('src-tauri/resources/mcp/dw_cookbook.json', JSON.stringify(merged));

console.log('functions:', Object.keys(functions).length, ' recipes:', merged.length);
