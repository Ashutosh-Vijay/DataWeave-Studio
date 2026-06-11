// Bundles two CJS entry points into dist/:
//   - extension.js  the VS Code extension host (src/extension.ts)
//   - mcp.js        the standalone stdio MCP server (src/mcp/server.ts)
// Both share dwHost.ts (the engine layer). `vscode` and Node built-ins stay
// external; the MCP entry doesn't import vscode, so that's harmless for it.
// Run via the package.json scripts: `compile` (dev, sourcemaps), `package`
// (--production, minified — used by vscode:prepublish).
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: { extension: 'src/extension.ts', mcp: 'src/mcp/server.ts' },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outdir: 'dist',
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
    logLevel: 'info',
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
