/**
 * The activity-bar Side Bar: three webview views in one container.
 *
 * It used to be a single view whose whole body was a `viewsWelcome` markdown
 * string containing one "Open Playground" link — a panel that existed only to
 * open something else. Now:
 *
 *   Workspaces         list what you saved; clicking opens the playground ON it
 *   DataWeave Reference  search the function set without leaving your .dwl
 *   Secure Properties  encrypt/decrypt in place (the only tool that fits 300px)
 *
 * Saved encryption keys live in `context.secrets` — the OS keychain — and the
 * secret never enters this webview: picking a saved key sends its NAME, and the
 * host resolves it at run time. Only the names are ours, in globalState.
 *
 * Two of the three do their work here and never open the panel, which is the
 * point. Chrome comes from --vscode-* vars so every theme (including High
 * Contrast) works; the DataWeave green is spent only on identity — the active
 * row stripe, the empty-state mark, focus rings.
 */

import * as vscode from 'vscode';
import * as ws from './workspaceStore';
import { loadMcpJson } from './mcp/mcpResources';

/** Shared chrome for all three views. `body` is markup, `script` runs on load. */
function shell(body: string, script: string): string {
  const nonce = Array.from({ length: 24 }, () =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)],
  ).join('');
  return /* html */ `<!doctype html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root {
    --dw-accent: oklch(72% 0.15 158);
    --dw-accent-dim: oklch(72% 0.15 158 / 0.14);
    --dw-accent-border: oklch(72% 0.15 158 / 0.34);
  }
  body.vscode-light, body.vscode-high-contrast-light {
    --dw-accent: oklch(55% 0.15 158);
    --dw-accent-dim: oklch(55% 0.15 158 / 0.10);
    --dw-accent-border: oklch(55% 0.15 158 / 0.35);
  }
  * { box-sizing: border-box; }
  /* A class that sets display beats the UA stylesheet's [hidden] rule, so say
     it louder — .two is display:flex and would otherwise ignore hidden. */
  [hidden] { display: none !important; }
  body {
    margin: 0; padding: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-sideBar-foreground, var(--vscode-foreground));
    background: transparent;
    user-select: none;
  }
  :focus-visible { outline: 1px solid var(--dw-accent); outline-offset: -1px; }

  /* rows */
  .row {
    display: flex; align-items: center; gap: 7px;
    padding: 3px 12px 3px 14px; cursor: pointer; min-height: 22px;
  }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.on {
    background: var(--dw-accent-dim);
    box-shadow: inset 2px 0 0 var(--dw-accent);
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 6px; background: var(--vscode-descriptionForeground); opacity: .5; }
  .row.on .dot { background: var(--dw-accent); opacity: 1; }
  .rmain { min-width: 0; flex: 1; }
  .rname { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rmeta {
    display: block; font-size: 10.5px; opacity: .7; font-variant-numeric: tabular-nums;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: var(--vscode-descriptionForeground);
  }

  /* inputs */
  .pad { padding: 6px 12px 8px 14px; display: flex; flex-direction: column; gap: 7px; }
  input[type=text], input[type=search], input[type=password], select {
    width: 100%; height: 26px; padding: 0 7px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px;
    font-family: inherit; font-size: 12.5px; outline: none;
  }
  input:focus, select:focus { border-color: var(--dw-accent); }
  input::placeholder { color: var(--vscode-input-placeholderForeground); }
  .lbl {
    font-size: 9.5px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
    color: var(--vscode-descriptionForeground); margin-bottom: 3px;
  }
  button.primary {
    height: 27px; border: 0; border-radius: 3px; cursor: pointer; width: 100%;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    font-family: inherit; font-size: 12.5px; font-weight: 600;
  }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.primary:disabled { opacity: .5; cursor: default; }
  .seg { display: flex; gap: 2px; padding: 2px; border-radius: 4px; background: var(--vscode-input-background); }
  .seg button {
    flex: 1; height: 21px; border: 0; border-radius: 2px; cursor: pointer;
    background: transparent; color: var(--vscode-descriptionForeground);
    font-family: inherit; font-size: 11px; font-weight: 500;
  }
  .seg button[aria-pressed=true] { background: var(--dw-accent-dim); color: var(--dw-accent); }
  .two { display: flex; gap: 6px; align-items: center; }
  .two > input, .two > select { flex: 1; min-width: 0; }
  /* Saved-key picker sits in the key row rather than on a label line of its
     own — the pane is a fixed slice of the Side Bar, so every line costs. */
  select.mini {
    flex: 0 0 auto; width: auto; max-width: 96px; height: 24px; padding: 0 2px;
    font-size: 10.5px; border-radius: 3px;
    background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent);
    color: var(--dw-accent); cursor: pointer;
  }
  select.mini:hover { border-color: var(--dw-accent-border); }
  /* algorithm/mode disclosure — AES·CBC is right for almost everyone, so it
     costs one line until someone actually needs to change it */
  .disclose {
    display: flex; align-items: center; gap: 5px; width: 100%; height: 19px;
    padding: 0; border: 0; background: transparent; cursor: pointer;
    font-family: inherit; font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .disclose:hover { color: var(--vscode-foreground); }
  .disclose .tw { transition: transform .12s ease; display: inline-flex; }
  .disclose[aria-expanded=true] .tw { transform: rotate(90deg); }
  .disclose b { font-weight: 500; color: var(--dw-accent); font-family: var(--vscode-editor-font-family, monospace); }

  /* notices */
  .note { padding: 8px 14px 10px; font-size: 11.5px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
  .err {
    margin: 0 12px 0 14px; padding: 6px 8px; border-radius: 3px; font-size: 11.5px; line-height: 1.45;
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    color: var(--vscode-foreground);
    user-select: text; word-break: break-word;
  }
  .out {
    display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 3px;
    background: var(--dw-accent-dim); border: 1px solid var(--dw-accent-border);
  }
  .out code {
    flex: 1; min-width: 0; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px;
    color: var(--dw-accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    user-select: text;
  }
  .icon {
    width: 22px; height: 22px; flex: 0 0 22px; border: 0; border-radius: 3px; cursor: pointer;
    background: transparent; color: var(--vscode-descriptionForeground); display: grid; place-items: center;
  }
  .icon:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }

  /* empty state — the one place the mark gets to be large */
  .empty { padding: 34px 20px 26px; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .empty svg { color: var(--dw-accent); opacity: .9; }
  .empty h4 { margin: 14px 0 6px; font-size: 13.5px; font-weight: 600; color: var(--vscode-foreground); }
  .empty p { margin: 0 0 16px; font-size: 11.5px; line-height: 1.5; color: var(--vscode-descriptionForeground); max-width: 30ch; }

  /* reference */
  .fn { padding: 4px 12px 5px 14px; cursor: pointer; }
  .fn:hover { background: var(--vscode-list-hoverBackground); }
  .fnhead { display: flex; align-items: baseline; gap: 6px; }
  .fnname {
    font-family: var(--vscode-editor-font-family, monospace); font-size: 12.5px;
    color: var(--vscode-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fnname mark { background: var(--dw-accent-dim); color: var(--dw-accent); border-radius: 2px; }
  .mod {
    font-family: var(--vscode-editor-font-family, monospace); font-size: 9px;
    letter-spacing: .05em; text-transform: uppercase; padding: 0 4px; border-radius: 2px;
    border: 1px solid currentColor; color: var(--vscode-descriptionForeground); opacity: .85;
  }
  .fn[data-mod=core] .mod { color: var(--dw-accent); }
  .ovl {
    margin-left: auto; font-family: var(--vscode-editor-font-family, monospace);
    font-size: 9.5px; color: var(--vscode-descriptionForeground); opacity: .8;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .sig {
    font-family: var(--vscode-editor-font-family, monospace); font-size: 10.5px;
    color: var(--vscode-descriptionForeground); margin-top: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fn.open .sig { white-space: normal; overflow: visible; }
  .detail { display: none; padding: 6px 0 3px; }
  .fn.open .detail { display: block; }
  .detail p {
    margin: 0 0 7px; font-size: 11.5px; line-height: 1.5;
    color: var(--vscode-descriptionForeground); user-select: text;
  }
  .acts { display: flex; gap: 5px; }
  .acts button {
    height: 21px; padding: 0 8px; border-radius: 3px; cursor: pointer;
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-contrastBorder, transparent);
    font-family: inherit; font-size: 11px;
  }
  .acts button:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground)); }
</style></head><body>
${body}
<script nonce="${nonce}">${script}</script>
</body></html>`;
}

/** Secret entry per saved encryption key. The names are kept in globalState
 *  (they aren't secret); the keys themselves only ever live in the keychain. */
const SECRET_PREFIX = 'dwstudio.secureKey.';
const KEY_NAMES = 'dwstudio.secureKeyNames';

// Exported so the playground panel's Secure Properties tool (the shared React
// UI, via handleInvoke) reads the SAME store as the Side Bar view. Save a key in
// one, use it in the other.
export function secureKeyNames(context: vscode.ExtensionContext): string[] {
  return context.globalState.get<string[]>(KEY_NAMES, []).slice().sort();
}

export async function secureKeySave(
  context: vscode.ExtensionContext, name: string, value: string,
): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Give the key a name.');
  if (!value) throw new Error('Type a key before saving it.');
  await context.secrets.store(SECRET_PREFIX + trimmed, value);
  const names = secureKeyNames(context);
  if (!names.includes(trimmed)) {
    await context.globalState.update(KEY_NAMES, [...names, trimmed]);
  }
  return secureKeyNames(context);
}

export async function secureKeyDelete(
  context: vscode.ExtensionContext, name: string,
): Promise<string[]> {
  await context.secrets.delete(SECRET_PREFIX + name);
  await context.globalState.update(KEY_NAMES, secureKeyNames(context).filter((n) => n !== name));
  return secureKeyNames(context);
}

/** Resolve a saved name to its secret. Throws if the keychain no longer has it,
 *  dropping the stale name so the pickers stop offering it. */
export async function secureKeyGet(
  context: vscode.ExtensionContext, name: string,
): Promise<string> {
  const stored = await context.secrets.get(SECRET_PREFIX + name);
  if (stored === undefined) {
    await context.globalState.update(KEY_NAMES, secureKeyNames(context).filter((n) => n !== name));
    throw new Error(`Saved key "${name}" is no longer in the keychain — type it in again.`);
  }
  return stored;
}

/** Escape for innerHTML — every view renders host data into markup. */
const ESC = `function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}`;

const COPY_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">' +
  '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>';

const PLUS_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

const CHEV_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
  'stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>';

/** The ⟨W⟩ mark, same paths as media/activitybar.svg. */
const MARK_SVG =
  '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M5 4 L1.7 12 L5 20"/><path d="M19 4 L22.3 12 L19 20"/>' +
  '<path d="M7.5 8 L9.5 16 L12 10.5 L14.5 16 L16.5 8"/></svg>';

function timeAgo(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
}

/**
 * Register all three views.
 *
 * @param openWorkspace  opens the playground panel on a saved workspace
 * @param encrypt        the host's secure-properties runner (extension.ts owns it)
 */
export function registerSidebar(
  context: vscode.ExtensionContext,
  storageDir: string,
  extensionRoot: string,
  openWorkspace: (filename: string | null) => void,
  encrypt: (args: Record<string, unknown>) => Promise<string>,
): void {
  // --- 1. Workspaces --------------------------------------------------------
  let workspacesView: vscode.WebviewView | null = null;

  const pushWorkspaces = () => {
    if (!workspacesView) return;
    let rows: { filename: string; name: string; meta: string }[] = [];
    try {
      rows = ws
        .listWorkspacesMeta(storageDir)
        .filter((m) => m.mode !== 'flow')
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .map((m) => {
          const bits = [`${m.requestCount} ${m.requestCount === 1 ? 'script' : 'scripts'}`];
          if (m.flowCount > 0) bits.push(`${m.flowCount} flow${m.flowCount === 1 ? '' : 's'}`);
          const when = timeAgo(m.updatedAt);
          if (when) bits.push(when);
          return { filename: m.filename, name: m.projectName || 'Untitled', meta: bits.join(' · ') };
        });
    } catch {
      rows = [];
    }
    workspacesView.webview.postMessage({ kind: 'rows', rows });
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'dataweaveStudio.workspaces',
      {
        resolveWebviewView(view) {
          workspacesView = view;
          view.webview.options = { enableScripts: true };
          view.webview.html = shell(
            '<div id="list"></div>',
            `${ESC}
const vs = acquireVsCodeApi();
const list = document.getElementById('list');
let active = null;

function render(rows) {
  if (!rows.length) {
    list.innerHTML = '<div class="empty">${MARK_SVG.replace(/'/g, "\\'")}' +
      '<h4>No workspace yet</h4>' +
      '<p>Open the playground to write a transform — it shows up here once you save.</p>' +
      '<button class="primary" id="new">Open Playground</button></div>';
    document.getElementById('new').onclick = function () { vs.postMessage({ kind: 'open', filename: null }); };
    return;
  }
  list.innerHTML = rows.map(function (r) {
    return '<div class="row' + (r.filename === active ? ' on' : '') + '" data-f="' + esc(r.filename) + '" title="' + esc(r.name) + '">' +
      '<span class="dot"></span><span class="rmain">' +
      '<span class="rname">' + esc(r.name) + '</span>' +
      '<span class="rmeta">' + esc(r.meta) + '</span>' +
      '</span></div>';
  }).join('');
  Array.prototype.forEach.call(list.querySelectorAll('.row'), function (el) {
    el.onclick = function () {
      active = el.getAttribute('data-f');
      Array.prototype.forEach.call(list.querySelectorAll('.row'), function (o) { o.classList.remove('on'); });
      el.classList.add('on');
      vs.postMessage({ kind: 'open', filename: active });
    };
  });
}

window.addEventListener('message', function (e) {
  if (e.data && e.data.kind === 'rows') render(e.data.rows);
});
vs.postMessage({ kind: 'ready' });`,
          );

          view.webview.onDidReceiveMessage((m) => {
            if (m?.kind === 'ready') pushWorkspaces();
            else if (m?.kind === 'open') openWorkspace(m.filename ?? null);
          });

          // Saving in the panel should show up here without a manual refresh.
          view.onDidChangeVisibility(() => { if (view.visible) pushWorkspaces(); });
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dataweaveStudio.refreshWorkspaces', pushWorkspaces),
  );

  // --- 2. DataWeave Reference ----------------------------------------------
  // Search runs in the host over the same dw_functions.json the MCP tools read,
  // so the 336KB never enters this 300px webview.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'dataweaveStudio.reference',
      {
        resolveWebviewView(view) {
          view.webview.options = { enableScripts: true };
          view.webview.html = shell(
            `<div class="pad" style="padding-bottom:4px">
               <input id="q" type="search" placeholder="Search functions…" spellcheck="false" autocomplete="off">
             </div>
             <div id="hits"></div>`,
            `${ESC}
const vs = acquireVsCodeApi();
const q = document.getElementById('q');
const hits = document.getElementById('hits');
let timer = null;

q.addEventListener('input', function () {
  clearTimeout(timer);
  timer = setTimeout(function () { vs.postMessage({ kind: 'search', q: q.value }); }, 90);
});

function mark(name, needle) {
  if (!needle) return esc(name);
  const i = name.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return esc(name);
  return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + needle.length)) + '</mark>' + esc(name.slice(i + needle.length));
}

function render(items, needle, total) {
  if (total) q.placeholder = 'Search ' + total + ' functions…';
  if (!items.length) {
    hits.innerHTML = '<div class="note">' + (needle
      ? 'No function matches \\u201c' + esc(needle) + '\\u201d.'
      : esc(total) + ' functions. Start typing to filter.') + '</div>';
    return;
  }
  hits.innerHTML = items.map(function (f) {
    return '<div class="fn" data-mod="' + esc(f.module) + '" data-name="' + esc(f.name) + '">' +
      '<div class="fnhead"><span class="fnname">' + mark(f.name, needle) + '</span>' +
      '<span class="mod">' + esc(f.module) + '</span>' +
      '<span class="ovl">' + f.overloads + (f.overloads === 1 ? ' ovl' : ' ovls') + '</span></div>' +
      '<div class="sig">' + esc(f.signature) + '</div>' +
      '<div class="detail"><p>' + esc(f.description) + '</p>' +
      '<div class="acts"><button data-act="insert">Insert</button><button data-act="copy">Copy signature</button></div>' +
      '</div></div>';
  }).join('');

  Array.prototype.forEach.call(hits.querySelectorAll('.fn'), function (el) {
    el.onclick = function (ev) {
      const btn = ev.target.closest('button');
      if (btn) {
        ev.stopPropagation();
        vs.postMessage({ kind: btn.getAttribute('data-act'), name: el.getAttribute('data-name') });
        return;
      }
      el.classList.toggle('open');
    };
  });
}

window.addEventListener('message', function (e) {
  const m = e.data;
  if (m && m.kind === 'hits') render(m.items, m.q, m.total);
});
vs.postMessage({ kind: 'search', q: '' });`,
          );

          view.webview.onDidReceiveMessage(async (m) => {
            if (m?.kind === 'search') {
              let obj: Record<string, any>;
              try {
                obj = loadMcpJson(extensionRoot, 'dw_functions.json') as Record<string, any>;
              } catch {
                view.webview.postMessage({ kind: 'hits', items: [], q: m.q, total: 0 });
                return;
              }
              const needle = String(m.q ?? '').trim().toLowerCase();
              const names = Object.keys(obj);
              const matched = needle
                ? names.filter((k) => k.toLowerCase().includes(needle))
                : names;
              // Prefix matches first — typing "split" should surface splitBy
              // before a function that merely contains it further along.
              matched.sort((a, b) => {
                const ap = a.toLowerCase().startsWith(needle) ? 0 : 1;
                const bp = b.toLowerCase().startsWith(needle) ? 0 : 1;
                return ap - bp || a.localeCompare(b);
              });
              const items = matched.slice(0, 60).map((k) => {
                const d = obj[k];
                const first = d?.overloads?.[0] ?? {};
                const desc = String(first.description ?? '')
                  .split('\n')
                  .filter((l: string) => l.trim())
                  .slice(0, 3)
                  .join(' ');
                return {
                  name: d?.name ?? k,
                  module: first.module ?? 'core',
                  signature: first.signature ?? '',
                  overloads: d?.overloads?.length ?? 1,
                  description: desc.length > 280 ? desc.slice(0, 280) + '…' : desc,
                };
              });
              view.webview.postMessage({ kind: 'hits', items, q: m.q, total: names.length });
              return;
            }

            if (m?.kind === 'copy' || m?.kind === 'insert') {
              let sig = m.name as string;
              try {
                const obj = loadMcpJson(extensionRoot, 'dw_functions.json') as Record<string, any>;
                sig = obj[m.name]?.overloads?.[0]?.signature ?? m.name;
              } catch { /* fall back to the bare name */ }
              if (m.kind === 'copy') {
                await vscode.env.clipboard.writeText(sig);
                vscode.window.setStatusBarMessage(`Copied ${m.name} signature`, 2000);
              } else {
                const ed = vscode.window.activeTextEditor;
                if (!ed) {
                  vscode.window.showInformationMessage('Open a file first — Insert drops the function name at your cursor.');
                  return;
                }
                // appendText escapes snippet syntax — no DW function name contains
                // $ } or \ today, but the docs are regenerated from upstream.
                await ed.insertSnippet(new vscode.SnippetString().appendText(String(m.name)));
              }
            }
          });
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // --- 3. Secure Properties -------------------------------------------------
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'dataweaveStudio.secure',
      {
        resolveWebviewView(view) {
          view.webview.options = { enableScripts: true };
          view.webview.html = shell(
            `<div class="pad">
               <div class="seg" role="group" aria-label="Mode">
                 <button type="button" data-op="encrypt" aria-pressed="true">Encrypt</button>
                 <button type="button" data-op="decrypt" aria-pressed="false">Decrypt</button>
               </div>
               <input id="value" type="text" spellcheck="false" autocomplete="off" placeholder="value to encrypt" aria-label="Value">
               <div class="two">
                 <input id="key" type="password" spellcheck="false" autocomplete="off" placeholder="encryption key" aria-label="Key">
                 <select id="saved" class="mini" aria-label="Saved key"></select>
                 <button class="icon" id="savekey" title="Save this key under a name">${PLUS_SVG.replace(/'/g, "\\'")}</button>
               </div>
               <button class="disclose" id="optToggle" aria-expanded="false">
                 <span class="tw">${CHEV_SVG.replace(/'/g, "\\'")}</span>
                 <span>Cipher</span> <b id="optSummary">AES · CBC</b>
               </button>
               <div class="two" id="opts" hidden>
                 <select id="algo" aria-label="Algorithm">
                   <option>AES</option><option>Blowfish</option><option>DES</option><option>DESede</option><option>RC2</option>
                 </select>
                 <select id="mode" aria-label="Mode">
                   <option>CBC</option><option>CFB</option><option>ECB</option><option>OFB</option>
                 </select>
               </div>
               <button class="primary" id="go">Encrypt</button>
             </div>
             <div id="result" class="pad" style="padding-top:0"></div>`,
            `${ESC}
const vs = acquireVsCodeApi();
const value = document.getElementById('value');
const key = document.getElementById('key');
const saved = document.getElementById('saved');
const savekey = document.getElementById('savekey');
const algo = document.getElementById('algo');
const mode = document.getElementById('mode');
const opts = document.getElementById('opts');
const optToggle = document.getElementById('optToggle');
const optSummary = document.getElementById('optSummary');
const go = document.getElementById('go');
const result = document.getElementById('result');
let op = 'encrypt';
// '' = type it in; otherwise the NAME of a key held in the OS keychain. The
// secret itself is never sent to this webview — only the name goes back out.
let savedName = '';
let names = [];

Array.prototype.forEach.call(document.querySelectorAll('.seg button'), function (b) {
  b.onclick = function () {
    op = b.getAttribute('data-op');
    Array.prototype.forEach.call(document.querySelectorAll('.seg button'), function (o) {
      o.setAttribute('aria-pressed', String(o === b));
    });
    go.textContent = op === 'encrypt' ? 'Encrypt' : 'Decrypt';
    value.placeholder = op === 'encrypt' ? 'secret to encrypt' : '![encrypted value]';
    result.innerHTML = '';
  };
});

optToggle.onclick = function () {
  const open = optToggle.getAttribute('aria-expanded') === 'true';
  optToggle.setAttribute('aria-expanded', String(!open));
  opts.hidden = open;
};
[algo, mode].forEach(function (s) {
  s.onchange = function () { optSummary.textContent = algo.value + ' \\u00b7 ' + mode.value; };
});

function renderSaved() {
  let html = '<option value="">type it in</option>';
  for (const n of names) html += '<option value="' + esc(n) + '">' + esc(n) + '</option>';
  if (names.length) html += '<option value="__manage">manage\\u2026</option>';
  saved.innerHTML = html;
  saved.value = savedName;
  key.disabled = !!savedName;
  key.placeholder = savedName ? 'using \\u201c' + savedName + '\\u201d' : 'encryption key';
  if (savedName) key.value = '';
  savekey.disabled = !!savedName;
  savekey.style.opacity = savedName ? '.35' : '1';
}

saved.onchange = function () {
  if (saved.value === '__manage') { saved.value = savedName; vs.postMessage({ kind: 'manageKeys' }); return; }
  savedName = saved.value;
  renderSaved();
  result.innerHTML = '';
};

savekey.onclick = function () {
  if (!key.value) {
    result.innerHTML = '<div class="err">Type a key first, then save it under a name.</div>';
    return;
  }
  vs.postMessage({ kind: 'saveKey', value: key.value });
};

function run() {
  if (!value.value) { result.innerHTML = '<div class="err">Enter a value.</div>'; return; }
  if (!savedName && !key.value) { result.innerHTML = '<div class="err">Enter the encryption key, or pick a saved one.</div>'; return; }
  go.disabled = true;
  go.textContent = op === 'encrypt' ? 'Encrypting\\u2026' : 'Decrypting\\u2026';
  result.innerHTML = '';
  vs.postMessage({
    kind: 'run', op: op, value: value.value,
    key: savedName ? '' : key.value, keyName: savedName,
    algorithm: algo.value, mode: mode.value,
  });
}

go.onclick = run;
[value, key].forEach(function (el) {
  el.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
});

window.addEventListener('message', function (e) {
  const m = e.data;
  if (!m) return;
  if (m.kind === 'keys') {
    names = m.names || [];
    // A key deleted elsewhere must not stay selected, or Run fails on a name
    // the keychain no longer has.
    if (m.selected !== undefined) savedName = m.selected;
    if (savedName && names.indexOf(savedName) < 0) savedName = '';
    renderSaved();
    return;
  }
  if (m.kind !== 'done') return;
  go.disabled = false;
  go.textContent = op === 'encrypt' ? 'Encrypt' : 'Decrypt';
  if (m.error) {
    result.innerHTML = '<div class="err">' + esc(m.error) + '</div>';
    return;
  }
  result.innerHTML = '<div class="out"><code id="o">' + esc(m.text) + '</code>' +
    '<button class="icon" id="c" title="Copy">${COPY_SVG.replace(/'/g, "\\'")}</button></div>';
  document.getElementById('c').onclick = function () { vs.postMessage({ kind: 'copy', text: m.text }); };
});

renderSaved();
vs.postMessage({ kind: 'keys' });`,
          );

          // Saved keys live in context.secrets — the OS keychain (Windows
          // Credential Manager / macOS Keychain / libsecret), not a file we
          // write. Only the NAMES are ours to keep, in globalState.
          const keyNames = () => secureKeyNames(context);
          const pushNames = (selected?: string) =>
            view.webview.postMessage({ kind: 'keys', names: keyNames(), selected });

          view.webview.onDidReceiveMessage(async (m) => {
            if (m?.kind === 'copy') {
              await vscode.env.clipboard.writeText(String(m.text ?? ''));
              vscode.window.setStatusBarMessage('Copied', 1500);
              return;
            }

            if (m?.kind === 'keys') { pushNames(); return; }

            if (m?.kind === 'saveKey') {
              const existing = keyNames();
              const name = (await vscode.window.showInputBox({
                title: 'Save encryption key',
                prompt: 'Name it for the environment it belongs to — uat, prod, …',
                placeHolder: 'uat',
                validateInput: (v) => {
                  const t = v.trim();
                  if (!t) return 'Give the key a name.';
                  if (t === '__manage') return 'Pick a different name.';
                  if (existing.includes(t)) return `"${t}" already exists — saving will replace it.`;
                  return null;
                },
              }))?.trim();
              if (!name) return;
              await secureKeySave(context, name, String(m.value ?? ''));
              pushNames(name);
              vscode.window.setStatusBarMessage(`Saved key "${name}" to the OS keychain`, 2500);
              return;
            }

            if (m?.kind === 'manageKeys') {
              const pick = await vscode.window.showQuickPick(
                keyNames().map((n) => ({ label: n, description: 'stored in the OS keychain' })),
                { title: 'Delete a saved encryption key', placeHolder: 'Pick the key to forget' },
              );
              if (!pick) return;
              const yes = await vscode.window.showWarningMessage(
                `Forget the encryption key "${pick.label}"?`,
                { modal: true, detail: 'It is removed from the OS keychain. Anything already encrypted with it stays encrypted.' },
                'Forget it',
              );
              if (yes !== 'Forget it') return;
              await secureKeyDelete(context, pick.label);
              pushNames();
              return;
            }

            if (m?.kind !== 'run') return;
            try {
              // A saved key arrives as a name; resolve it here so the secret
              // itself never has to live in the webview.
              let key = String(m.key ?? '');
              if (m.keyName) {
                try {
                  key = await secureKeyGet(context, m.keyName);
                } catch (e) {
                  pushNames('');
                  throw e;
                }
              }
              const text = await encrypt({
                operation: m.op,
                algorithm: m.algorithm,
                mode: m.mode,
                key,
                value: m.value,
                useRandomIv: false,
              });
              view.webview.postMessage({ kind: 'done', text });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              view.webview.postMessage({ kind: 'done', error: msg.split('\n').slice(0, 3).join(' ') });
            }
          });
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Saving from the panel fires this so the list stays honest.
  return;
}
