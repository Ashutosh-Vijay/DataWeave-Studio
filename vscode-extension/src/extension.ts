/**
 * DataWeave Studio — VS Code extension host.
 *
 * Registers the "Open Playground" command, which opens a webview panel and
 * wires its postMessage channel to the Node DataWeave backend (dwHost.ts).
 * This is the extension half of the bridge in src/bridge.ts:
 *   webview → host:  { kind: 'invoke',        id, cmd, args }
 *   host → webview:  { kind: 'invoke:result', id, ok, value? , error? }
 *
 * FIRST MILESTONE: the webview is a minimal test page that runs one eval to
 * prove the round-trip (webview → host → JVM → output). Later milestones swap
 * its HTML for the real built React UI.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import * as httpApi from './httpApi';
import { DwServer, resolveJava, resolveServerJar, runDataweave, warmDataweave, pickJava, javaFailureMessage, RunArgs, WarmArgs, formatDataweave, toolingQuery} from './dwHost';
import * as ws from './workspaceStore';
import * as jarStore from './jarStore';
import * as moduleStore from './moduleStore';

let server: DwServer | null = null;
let warmupError: string | null = null;
let storageDir = '';
let logDir = '';

/** Start the JVM server once, lazily. Shared across all panels. */
async function getServer(extensionRoot: string): Promise<DwServer> {
  if (server) {
    await server.start(); // idempotent
    return server;
  }
  // Preflight by actually RUNNING each candidate, not by checking it exists.
  // We ship a JRE, so "Java not found, install Java" was the wrong thing to say
  // when the real story is that the bundled java.exe is sitting right there and
  // the machine's endpoint security refused to execute it. pickJava walks
  // bundled -> JAVA_HOME -> PATH and reports what each one did, which is both
  // the fix (a system JDK is usually already allowlisted) and the diagnosis.
  const { bin, tried } = await pickJava(extensionRoot);
  if (!bin) throw new Error(javaFailureMessage(tried));
  const jar = resolveServerJar(extensionRoot);
  server = new DwServer(bin, jar);
  await server.start();
  return server;
}

export function activate(context: vscode.ExtensionContext) {
  // Per-extension persistent dirs (VS Code-managed, survive restarts).
  storageDir = context.globalStorageUri.fsPath;
  logDir = path.join(storageDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  // No-op target for the keybindings that swallow VS Code's defaults while our
  // webview is focused (see contributes.keybindings) — the app's own in-webview
  // handler does the real work; this just stops VS Code from also acting.
  context.subscriptions.push(
    vscode.commands.registerCommand('dataweaveStudio.noop', () => {})
  );

  // Empty provider for the activity-bar view — keeps it empty so the
  // viewsWelcome content ("Open Playground" button) shows.
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('dataweaveStudio.welcome', {
      getChildren: () => [],
      getTreeItem: (e: vscode.TreeItem) => e,
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dataweaveStudio.open', () => {
      const webviewDist = vscode.Uri.joinPath(context.extensionUri, 'webview-dist');
      const panel = vscode.window.createWebviewPanel(
        'dataweaveStudio',
        'DataWeave Studio',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [webviewDist],
        }
      );
      // Brand the editor tab with the logo.
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
      panel.webview.html = getWebviewHtml(panel.webview, webviewDist);

      // Kick off JVM spawn + compiler priming now, while the loader is showing,
      // so the first Run is warm. Push the warm-up result to the webview so it
      // can swap the loader for the UI (the webview also polls
      // get_warmup_status on load to cover the already-warm case).
      warmupError = null;
      getServer(context.extensionPath).then(
        () => panel.webview.postMessage({ kind: 'warmup', ready: true, error: null }),
        (e) => {
          warmupError = e instanceof Error ? e.message : String(e);
          panel.webview.postMessage({ kind: 'warmup', ready: false, error: warmupError });
          // Java-runtime problems get an actionable notification. Copy Details comes
          // first because the common case is now a blocked bundled JRE, where the
          // useful action is pasting the path into a mail to IT — not installing a
          // second Java that the same policy would also refuse to run.
          if (/\bjava\b/i.test(warmupError)) {
            const detail = warmupError;
            vscode.window
              .showErrorMessage(detail.split('\n')[0], 'Copy Details', 'Download Java')
              .then((choice) => {
                if (choice === 'Copy Details') {
                  vscode.env.clipboard.writeText(detail);
                  vscode.window.showInformationMessage('Startup diagnostics copied to the clipboard.');
                } else if (choice === 'Download Java') {
                  vscode.env.openExternal(vscode.Uri.parse('https://adoptium.net/temurin/releases/?version=17'));
                }
              });
          }
        }
      );

      panel.webview.onDidReceiveMessage(
        async (msg) => {
          if (!msg || msg.kind !== 'invoke') return;
          const { id, cmd, args } = msg;
          try {
            const value = await handleInvoke(context.extensionPath, cmd, args);
            panel.webview.postMessage({ kind: 'invoke:result', id, ok: true, value });
          } catch (e) {
            panel.webview.postMessage({
              kind: 'invoke:result',
              id,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        },
        undefined,
        context.subscriptions
      );
    })
  );

  registerMcpProvider(context);

  // One-click "add to a client" — Copilot agent mode discovers our MCP server
  // automatically (registerMcpProvider above), but Claude Code / Cursor / Claude
  // Desktop read their OWN config files, so they need the stdio entry written.
  context.subscriptions.push(
    vscode.commands.registerCommand('dataweaveStudio.connectMcp', () => connectMcpToClient(context.extensionPath)),
  );
}

/** The stdio server entry every external MCP client understands. Runs our bundled
 *  `dist/mcp.js` with VS Code's OWN runtime (process.execPath = the Code/Electron
 *  binary) via ELECTRON_RUN_AS_NODE=1 — so it works with NO standalone Node on the
 *  user's PATH (most MuleSoft devs don't have one). Same trick Copilot's provider
 *  uses (registerMcpServerDefinitionProvider). Copilot agent mode doesn't read
 *  this entry — it gets the server from the provider directly. */
function mcpStdioEntry(extensionRoot: string): { command: string; args: string[]; env: Record<string, string> } {
  return {
    command: process.execPath,
    args: [path.join(extensionRoot, 'dist', 'mcp.js')],
    env: { ELECTRON_RUN_AS_NODE: '1', DWSTUDIO_HEARTBEAT: heartbeatFile() },
  };
}

/** File the running MCP process refreshes so the in-app panel can show live state. */
function heartbeatFile(): string {
  return path.join(storageDir, 'mcp-heartbeat.json');
}

/** True if an MCP server process refreshed the heartbeat within the last 12s
 *  (it refreshes every 5s, so this tolerates one missed tick; on Windows where
 *  the process can die without running its cleanup, staleness is the real signal). */
function mcpIsRunning(): boolean {
  try {
    const { ts } = JSON.parse(fs.readFileSync(heartbeatFile(), 'utf8'));
    return typeof ts === 'number' && Date.now() - ts < 12000;
  } catch {
    return false;
  }
}

/** Config file each client reads (all use the same `{ mcpServers: { … } }` shape). */
function clientConfigPath(client: string, workspaceRoot?: string): string | null {
  const home = os.homedir();
  switch (client) {
    case 'claude-code':
      return workspaceRoot ? path.join(workspaceRoot, '.mcp.json') : null;
    case 'cursor':
      return path.join(home, '.cursor', 'mcp.json');
    case 'claude-desktop':
      if (process.platform === 'win32')
        return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
      if (process.platform === 'darwin')
        return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
    default:
      return null;
  }
}

/** Merge our server into a client's config file (creating it if missing). Refuses
 *  to clobber a file that isn't valid JSON. Returns the path + whether it existed. */
function writeMcpClientConfig(client: string, extensionRoot: string, workspaceRoot?: string): { path: string; existed: boolean } {
  const cfgPath = clientConfigPath(client, workspaceRoot);
  if (!cfgPath) throw new Error('No config location for this client.');

  let obj: any = {};
  const existed = fs.existsSync(cfgPath);
  if (existed) {
    const raw = fs.readFileSync(cfgPath, 'utf8').trim();
    if (raw) {
      try { obj = JSON.parse(raw); } catch {
        throw new Error(`${cfgPath} isn't valid JSON — add the server manually (use "Copy config").`);
      }
    }
  }
  if (typeof obj !== 'object' || obj === null) obj = {};
  obj.mcpServers = obj.mcpServers && typeof obj.mcpServers === 'object' ? obj.mcpServers : {};
  obj.mcpServers['dataweave-studio'] = mcpStdioEntry(extensionRoot);

  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(obj, null, 2) + '\n');
  return { path: cfgPath, existed };
}

/** Command body: pick a client, write its config (or copy the snippet). */
async function connectMcpToClient(extensionRoot: string): Promise<void> {
  const items = [
    { label: '$(file-code) Claude Code (this workspace)', detail: 'Writes .mcp.json in the workspace root', client: 'claude-code' },
    { label: '$(edit) Cursor', detail: '~/.cursor/mcp.json', client: 'cursor' },
    { label: '$(comment-discussion) Claude Desktop', detail: 'claude_desktop_config.json', client: 'claude-desktop' },
    { label: '$(clippy) Copy config to clipboard', detail: 'Paste into any MCP client yourself', client: 'copy' },
  ];
  const pick = await vscode.window.showQuickPick(items, {
    title: 'Add DataWeave Studio MCP server to…',
    placeHolder: 'Pick an MCP client (Copilot agent mode already has it automatically)',
  });
  if (!pick) return;

  if (pick.client === 'copy') {
    const snippet = JSON.stringify({ mcpServers: { 'dataweave-studio': mcpStdioEntry(extensionRoot) } }, null, 2);
    await vscode.env.clipboard.writeText(snippet);
    vscode.window.showInformationMessage('DataWeave Studio MCP config copied — paste it into your client\'s mcpServers.');
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (pick.client === 'claude-code' && !workspaceRoot) {
    vscode.window.showErrorMessage('Open a folder/workspace first — Claude Code reads .mcp.json from the workspace root.');
    return;
  }
  try {
    const { path: p, existed } = writeMcpClientConfig(pick.client, extensionRoot, workspaceRoot);
    const note = pick.client === 'claude-code'
      ? 'Run "/mcp" in Claude Code (or reload) to connect.'
      : 'Restart the client to connect.';
    const choice = await vscode.window.showInformationMessage(
      `DataWeave Studio MCP server ${existed ? 'added to' : 'created at'} ${p}. ${note}`,
      'Open config',
    );
    if (choice === 'Open config') {
      vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(p)));
    }
  } catch (e) {
    vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
  }
}

/** Contribute the bundled stdio MCP server to VS Code's agent mode (Copilot,
 *  etc.) so any DataWeave script an agent writes is validated on the real local
 *  engine. The dist/mcp.js process is spawned by VS Code with the extension's
 *  Node (process.execPath + ELECTRON_RUN_AS_NODE), resolves the bundled jar/JRE
 *  itself, and defaults to Safe mode (the RCE gate). The API landed in VS Code
 *  1.101 — feature-detected so older hosts silently skip it (the webview app
 *  and command still work; only the agent auto-wiring is unavailable). */
function registerMcpProvider(context: vscode.ExtensionContext): void {
  const lm = (vscode as any).lm;
  const McpStdio = (vscode as any).McpStdioServerDefinition;
  if (!lm || typeof lm.registerMcpServerDefinitionProvider !== 'function' || !McpStdio) return;

  try {
    context.subscriptions.push(
      lm.registerMcpServerDefinitionProvider('dataweaveStudio.mcpProvider', {
        provideMcpServerDefinitions: async () => {
          const mcpJs = path.join(context.extensionPath, 'dist', 'mcp.js');
          // process.execPath = VS Code's Electron binary; ELECTRON_RUN_AS_NODE
          // makes it behave as a plain Node runtime for our script.
          return [
            new McpStdio(
              'DataWeave Studio',
              process.execPath,
              [mcpJs],
              { ELECTRON_RUN_AS_NODE: '1', DWSTUDIO_HEARTBEAT: heartbeatFile() },
            ),
          ];
        },
      }),
    );
    console.log('[dataweave] MCP server provider registered (run "MCP: List Servers" to start it)');
  } catch (e) {
    // Never let MCP wiring break activation — the rest of the extension is fine.
    console.error('[dataweave] MCP provider registration failed:', e);
  }
}

/** The Node reimplementation of the Tauri command surface. Milestone: just the
 *  subset needed to prove an end-to-end eval. */
async function handleInvoke(
  extensionRoot: string,
  cmd: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (cmd) {
    case 'run_dataweave': {
      const srv = await getServer(extensionRoot);
      return runDataweave(srv, args as unknown as RunArgs);
    }
    case 'is_warmed_up':
      return server?.isWarmed() ?? false;
    case 'get_warmup_status':
      return { ready: server?.isWarmed() ?? false, error: warmupError, encodingOk: server?.isEncodingOk() ?? true };
    case 'warm_dataweave_script': {
      const srv = await getServer(extensionRoot);
      await warmDataweave(srv, args as unknown as WarmArgs);
      return null;
    }
    case 'cancel_dataweave': {
      // Best-effort: restart the JVM to abort an in-flight run. The pending
      // run rejects and the UI surfaces it. (Runs are usually ~20ms, so cancel
      // rarely matters; this matches "kill the engine" semantics.)
      if (!server) return false;
      await server.restart();
      warmupError = null;
      return true;
    }
    case 'http_api_start':
      return httpApi.start(
        () => getServer(extensionRoot),
        Number(args.port ?? httpApi.DEFAULT_PORT),
        Boolean(args.advanced),
      );
    case 'http_api_stop':
      return httpApi.stop().then(() => httpApi.status());
    case 'http_api_status':
      return httpApi.status();
    case 'dw_tooling':
      return toolingQuery(
        await getServer(extensionRoot),
        String(args.kind ?? 'completion'),
        String(args.script ?? ''),
        Number(args.offset ?? 0),
        String(args.payload ?? ''),
        args.newName === undefined ? undefined : String(args.newName),
      );
    case 'dw_format':
      // getServer, not `server` — the latter is null until something has
      // started the engine, and formatting can be the first thing you do.
      return formatDataweave(await getServer(extensionRoot), String(args.script ?? ''));
    case 'restart_engine': {
      const srv = await getServer(extensionRoot);
      await srv.restart();
      warmupError = null;
      return null;
    }
    case 'get_log_dir':
      return logDir;

    // --- Workspaces (port of workspace.rs) ----------------------------------
    case 'save_workspace':
      return ws.saveWorkspace(storageDir, args.workspace);
    case 'load_workspace':
      return ws.loadWorkspace(storageDir, args.filename as string);
    case 'list_workspaces':
      return ws.listWorkspaces(storageDir);
    case 'list_workspaces_meta':
      return ws.listWorkspacesMeta(storageDir);
    case 'delete_workspace':
      ws.deleteWorkspace(storageDir, args.filename as string);
      return null;
    case 'rename_workspace':
      return ws.renameWorkspace(storageDir, args.filename as string, args.newName as string);
    case 'duplicate_workspace_file':
      return ws.duplicateWorkspaceFile(storageDir, args.filename as string);
    case 'get_workspaces_dir':
      return ws.getWorkspacesDir(storageDir);

    // --- Module library (port of module_lib.rs) -----------------------------
    case 'load_modules':
      return moduleStore.loadModules(storageDir);
    case 'save_modules':
      moduleStore.saveModules(storageDir, args.json as string);
      return null;

    // --- MCP client wiring (webview "Add to …" buttons) ---------------------
    case 'mcp_heartbeat':
      return { running: mcpIsRunning() };
    case 'mcp_stdio_config': {
      const entry = mcpStdioEntry(extensionRoot);
      return { ...entry, json: JSON.stringify({ mcpServers: { 'dataweave-studio': entry } }, null, 2) };
    }
    case 'mcp_write_config': {
      const client = args.client as string;
      if (client === 'copy') {
        const snippet = JSON.stringify({ mcpServers: { 'dataweave-studio': mcpStdioEntry(extensionRoot) } }, null, 2);
        await vscode.env.clipboard.writeText(snippet);
        return { copied: true };
      }
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (client === 'claude-code' && !workspaceRoot) {
        throw new Error('Open a folder/workspace first — Claude Code reads .mcp.json from the workspace root.');
      }
      const { path: p, existed } = writeMcpClientConfig(client, extensionRoot, workspaceRoot);
      return { path: p, existed };
    }

    // --- Managed JARs + Java compilation (port of jars.rs) ------------------
    case 'list_managed_jars':
      return jarStore.listManagedJars(storageDir);
    case 'get_jars_dir':
      return jarStore.getJarsDir(storageDir);
    case 'import_jar_file':
      return jarStore.importJarFile(storageDir, args.srcPath as string);
    case 'remove_managed_jar':
      jarStore.removeManagedJar(storageDir, args.path as string);
      return null;
    case 'download_maven_jar':
      return jarStore.downloadMavenJar(storageDir, args.group as string, args.artifact as string, args.version as string);
    case 'compile_java':
      return jarStore.compileJava(storageDir, extensionRoot, args.sources as any, args.classpath as string[]);

    // --- Secure properties (port of secure_properties.rs) -------------------
    case 'secure_properties_invoke':
      return securePropertiesInvoke(extensionRoot, args);

    case 'read_text_file':
      return fs.readFileSync(args.path as string, 'utf8');
    case 'save_output_file':
      fs.writeFileSync(args.path as string, args.content as string);
      return null;
    case 'save_binary_file': {
      // The UI sends bytes as a number[] (Array.from(Uint8Array)).
      fs.writeFileSync(args.path as string, Buffer.from(args.contents as number[]));
      return null;
    }
    case 'get_app_version': {
      const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
      return pkg.version ?? '0.0.0';
    }

    // --- VS Code dialog / opener bridges (replace Tauri dialog/opener) -------
    case 'vscode_open_dialog': {
      const o = (args.options ?? {}) as {
        multiple?: boolean; directory?: boolean;
        filters?: { name: string; extensions: string[] }[]; defaultPath?: string; title?: string;
      };
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: !!o.multiple,
        canSelectFiles: !o.directory,
        canSelectFolders: !!o.directory,
        filters: mapFilters(o.filters),
        defaultUri: o.defaultPath ? vscode.Uri.file(o.defaultPath) : undefined,
        title: o.title,
      });
      if (!uris || uris.length === 0) return null;
      const paths = uris.map((u) => u.fsPath);
      return o.multiple ? paths : paths[0];
    }
    case 'vscode_save_dialog': {
      const o = (args.options ?? {}) as {
        filters?: { name: string; extensions: string[] }[]; defaultPath?: string; title?: string;
      };
      let defaultUri: vscode.Uri | undefined;
      if (o.defaultPath) {
        defaultUri = /[\\/]/.test(o.defaultPath)
          ? vscode.Uri.file(o.defaultPath)
          : (() => {
              const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
              return ws ? vscode.Uri.joinPath(ws, o.defaultPath!) : undefined;
            })();
      }
      const uri = await vscode.window.showSaveDialog({
        filters: mapFilters(o.filters),
        defaultUri,
        title: o.title,
      });
      return uri ? uri.fsPath : null;
    }
    case 'vscode_open_path':
      await vscode.env.openExternal(vscode.Uri.file(args.path as string));
      return null;
    case 'vscode_open_external':
      await vscode.env.openExternal(vscode.Uri.parse(args.url as string));
      return null;

    default:
      throw new Error(`Command not implemented in extension host yet: ${cmd}`);
  }
}

/** Tauri dialog filters ([{name, extensions}]) → VS Code's ({ name: extensions }). */
function mapFilters(
  filters?: { name: string; extensions: string[] }[]
): { [name: string]: string[] } | undefined {
  if (!filters || filters.length === 0) return undefined;
  const out: { [name: string]: string[] } = {};
  for (const f of filters) out[f.name] = f.extensions;
  return out;
}

/** Port of secure_properties.rs — runs MuleSoft's secure-properties-tool.jar so
 *  output is byte-for-byte compatible with what the Mule runtime decrypts. */
function securePropertiesInvoke(
  extensionRoot: string,
  args: Record<string, unknown>
): Promise<string> {
  const operation = args.operation as string;
  const algorithm = args.algorithm as string;
  const mode = args.mode as string;
  const key = args.key as string;
  const value = args.value as string;
  const useRandomIv = !!args.useRandomIv;

  if (operation !== 'encrypt' && operation !== 'decrypt') {
    return Promise.reject(new Error(`Invalid operation '${operation}', expected 'encrypt' or 'decrypt'.`));
  }
  if (!['AES', 'Blowfish', 'DES', 'DESede', 'RC2'].includes(algorithm)) {
    return Promise.reject(new Error(`Invalid algorithm '${algorithm}'.`));
  }
  if (!['CBC', 'CFB', 'ECB', 'OFB'].includes(mode)) {
    return Promise.reject(new Error(`Invalid mode '${mode}'.`));
  }
  if (!key) return Promise.reject(new Error('Key is required.'));
  if (!value) return Promise.reject(new Error('Value is required.'));

  const jar = resolveSecurePropsJar(extensionRoot);
  const java = resolveJava(extensionRoot);
  const cmdArgs = [
    // Fixes the tool's OUTPUT encoding on Java ≤17. Note it does not fix non-ASCII
    // input values: those arrive as argv, which Windows JVMs decode with the OS
    // codepage before -D properties apply (see secure_properties.rs for detail).
    '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8',
    '-cp', jar,
    'com.mulesoft.tools.SecurePropertiesTool',
    'string', operation, algorithm, mode, key, value,
  ];
  if (useRandomIv) cmdArgs.push('--use-random-iv');

  return new Promise<string>((resolve, reject) => {
    execFile(java, cmdArgs, { windowsHide: true }, (err, stdout, stderr) => {
      const out = (stdout || '').trim();
      const errOut = (stderr || '').trim();
      if (err) {
        return reject(new Error(errOut || (err as Error).message));
      }
      // The tool prints usage to stdout (exit 0) on bad input — detect that.
      if (out.startsWith('Invalid arguments') || out.includes('Usage:')) {
        return reject(new Error(`secure-properties-tool rejected the inputs.\n${out}`));
      }
      resolve(out);
    });
  });
}

function resolveSecurePropsJar(extensionRoot: string): string {
  const candidates = [
    path.join(extensionRoot, 'resources', 'secure-properties', 'secure-properties-tool.jar'),
    path.join(extensionRoot, '..', 'src-tauri', 'resources', 'secure-properties', 'secure-properties-tool.jar'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(`secure-properties-tool.jar not found. Looked in:\n${candidates.join('\n')}`);
}

export function deactivate() {
  // The HTTP API must not outlive the extension — a listener left behind after
  // a reload would keep the port and answer nobody.
  void httpApi.stop();
  if (server) {
    server.stop();
    server = null;
  }
}

/** Load the built React UI (webview-dist/) into the webview. Rewrites relative
 *  asset URLs to absolute webview resource URIs, exposes that base to the bundle
 *  as window.__WEBVIEW_BASE__ (for runtime asset paths like the logo), makes the
 *  stylesheets non-render-blocking (so the boot loader paints immediately rather
 *  than after a blank delay), injects a CSP, and overlays a boot loader that
 *  hides once the engine reports warm. */
function getWebviewHtml(webview: vscode.Webview, webviewDist: vscode.Uri): string {
  const indexPath = path.join(webviewDist.fsPath, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return /* html */ `<!doctype html><html><body style="font-family:sans-serif;padding:24px">
      <h2>DataWeave Studio isn't built yet</h2>
      <p>Run <code>npm run build:vscode</code> in the repo root to produce
      <code>vscode-extension/webview-dist/</code>, then reopen this panel.</p>
      </body></html>`;
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  // Rewrite the relative "./asset" URLs in index.html (script/css/preload/icon)
  // to webview resource URIs. We deliberately do NOT use <base href>: in
  // Chromium a <base> makes SVG fragment refs (fill="url(#id)") resolve against
  // it and break, and this UI is full of inline SVGs. Monaco's worker/chunk
  // URLs still resolve correctly because the bundle computes them from
  // import.meta.url — which is the webview URI once the entry script loads from
  // one.
  const baseUri = webview.asWebviewUri(webviewDist).toString().replace(/\/?$/, '/');
  html = html.replace(
    /(\s(?:src|href)=)"\.\/([^"]*)"/g,
    (_m, attr, rel) => `${attr}"${baseUri}${rel}"`
  );

  // Make stylesheets non-render-blocking: VS Code shows a blank/spinner until
  // first paint, which a render-blocking <link rel="stylesheet"> delays. Load
  // them as media="print" (non-blocking) and flip to "all" on load (done in the
  // boot script). The app CSS lands a beat later — hidden under the boot overlay.
  html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (tag) =>
    tag.includes('data-async-css') ? tag : tag.replace(/\s*\/?>$/, ' media="print" data-async-css="1">')
  );

  // Defer the heavy (~4MB) entry bundle: pull it out of <head> and inject it
  // from the boot script after first paint. Otherwise VS Code's blank loading
  // frame lingers while the module downloads/parses; deferring lets our overlay
  // paint immediately, then the bundle loads underneath it.
  let entrySrc = '';
  html = html.replace(
    /<script\s+type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>/,
    (_m, src) => {
      entrySrc = src;
      return '';
    }
  );

  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data: https:`,
    `font-src ${webview.cspSource} data: https://fonts.gstatic.com`,
    `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
    `script-src ${webview.cspSource} 'unsafe-eval' 'nonce-${nonce}'`,
    `worker-src ${webview.cspSource} blob:`,
    `connect-src ${webview.cspSource} blob: data:`,
  ].join('; ');

  const headInjection = `
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <script nonce="${nonce}">window.__WEBVIEW_BASE__ = ${JSON.stringify(baseUri)};</script>
  <style nonce="${nonce}">
    #dw-boot { position: fixed; inset: 0; z-index: 99999; display: flex;
      flex-direction: column; align-items: center; justify-content: center; gap: 18px;
      background: var(--vscode-editor-background, #1e1e1e); transition: opacity .35s ease; }
    #dw-boot.hidden { opacity: 0; pointer-events: none; }
    #dw-boot .spin { width: 42px; height: 42px; border-radius: 50%;
      border: 3px solid var(--vscode-panel-border, #ffffff22);
      border-top-color: var(--vscode-progressBar-background, #3794ff);
      animation: dwspin .8s linear infinite; }
    @keyframes dwspin { to { transform: rotate(360deg); } }
    #dw-boot .t { font: 600 15px var(--vscode-font-family, sans-serif); color: var(--vscode-foreground, #ccc); }
    #dw-boot .s { font: 12px var(--vscode-font-family, sans-serif); color: var(--vscode-descriptionForeground, #999);
      max-width: 360px; text-align: center; line-height: 1.5; }
  </style>`;

  const bootOverlay = `
  <div id="dw-boot">
    <div class="spin"></div>
    <div class="t">DataWeave Studio</div>
    <div class="s">Starting the engine…</div>
  </div>
  <script nonce="${nonce}">
    // Hide the splash once the host reports warm (or errors — the app then
    // shows its own engine-error UI). Does NOT call acquireVsCodeApi (the
    // React bridge owns that single handle); only listens for the push.
    (function () {
      // Activate the non-blocking stylesheets (flipped from media="print").
      var links = document.querySelectorAll('link[data-async-css]');
      links.forEach(function (l) {
        if (l.sheet) l.media = 'all';
        else l.addEventListener('load', function () { l.media = 'all'; });
      });
      setTimeout(function () { links.forEach(function (l) { l.media = 'all'; }); }, 1500);

      var boot = document.getElementById('dw-boot');
      function hide() { if (boot) boot.classList.add('hidden'); }
      // Hide only once the engine is warm AND React has mounted — so the
      // overlay never lifts onto a still-blank screen (e.g. when the engine is
      // already warm on reopen but the bundle is still loading).
      var warm = false, mounted = false;
      function maybeHide() { if (warm && mounted) hide(); }
      window.addEventListener('message', function (ev) {
        var m = ev.data;
        if (!m) return;
        if (m.kind === 'warmup') { warm = true; maybeHide(); }       // ready or error
        else if (m.kind === 'dw-app-mounted') { mounted = true; maybeHide(); }
      });
      // Fallback so the splash can never get stuck if a signal is missed.
      setTimeout(hide, 25000);

      // Load the deferred entry bundle after the overlay has painted (2 rAFs).
      var entry = ${JSON.stringify(entrySrc)};
      if (entry) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var s = document.createElement('script');
            s.type = 'module'; s.crossOrigin = 'anonymous'; s.src = entry;
            document.body.appendChild(s);
          });
        });
      }
    })();
  </script>`;

  html = html.replace('<head>', '<head>' + headInjection);
  html = html.replace('</body>', bootOverlay + '</body>');
  return html;
}

function getNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}
