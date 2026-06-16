// Assemble vscode-extension/resources/ from the desktop build's resources, so
// the packaged .vsix is self-contained (bundled JRE + DataWeave/secure-props
// jars). Run before `vsce package`. The JRE is platform-specific, so this
// bundles whatever the sibling desktop repo built for THIS platform — package
// once per target OS.
import { existsSync, mkdirSync, cpSync, rmSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = join(here, '..');
const src = join(extRoot, '..', 'src-tauri', 'resources');
const dst = join(extRoot, 'resources');

const items = [
  ['dw-server/dwstudio-server.jar', 'dw-server/dwstudio-server.jar'],
  ['secure-properties/secure-properties-tool.jar', 'secure-properties/secure-properties-tool.jar'],
  ['mcp/dw_functions.json', 'mcp/dw_functions.json'], // MCP function reference (offline)
  ['mcp/dw_cookbook.json', 'mcp/dw_cookbook.json'],   // MCP cookbook recipes (offline)
  ['jre', 'jre'], // the whole platform JRE (directory)
];

rmSync(dst, { recursive: true, force: true });
let bundledJre = false;
for (const [rel, out] of items) {
  const from = join(src, rel);
  const to = join(dst, out);
  if (!existsSync(from)) {
    console.warn(`! skip (missing): ${from}`);
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  if (rel === 'jre') {
    bundledJre = true;
    // Belt-and-suspenders: ensure the java launcher is executable on macOS/Linux
    // (cpSync preserves mode, but a stripped-bit source would break the .vsix).
    if (process.platform !== 'win32') {
      const javaBin = join(to, 'bin', 'java');
      if (existsSync(javaBin)) chmodSync(javaBin, 0o755);
    }
  }
  console.log(`✓ ${rel}`);
}

if (!bundledJre) {
  console.warn(
    '\n! No JRE bundled — the .vsix will fall back to system Java. Build the\n' +
    '  desktop app first (it jlinks src-tauri/resources/jre) so a JRE exists.'
  );
}
console.log('\nResources assembled at vscode-extension/resources/');
