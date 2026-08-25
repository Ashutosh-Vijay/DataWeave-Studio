/**
 * MCP Server control panel. Ported from the Claude Design "MCP Server" mock and
 * wired to the real in-process Rust server (mcp_server.rs): Start/Stop, live
 * status (uptime + requests), editable port, Safe/Advanced mode, and copy-paste
 * connect snippets. One tool is live today — validate_and_run_dataweave; the
 * others are marked planned (honest, not faked).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke, isTauri } from '../bridge';
import { toast } from './Toast';

interface McpStatus { running: boolean; port: number | null; advanced: boolean; uptimeSecs: number; requests: number; decryptKeySet: boolean; }
type LogLine = { t: string; m: string; kind: 'ok' | 'warn' | 'err' | 'muted' };

const PORT_KEY = 'dw.mcp.port';
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const plug = (size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v4" /><path d="M5.5 5.5 8 8" /><path d="M18.5 5.5 16 8" /><rect x="6" y="8" width="12" height="8" rx="3" /><path d="M9 16v3a3 3 0 0 0 6 0v-3" />
  </svg>
);

function fmtUptime(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return `${m}m ${String(r).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
const clock = () => new Date().toTimeString().slice(0, 8);

export function MCPServerPanel({ open, onClose, onRunningChange }: {
  open: boolean;
  onClose: () => void;
  onRunningChange?: (running: boolean) => void;
}) {
  const [status, setStatus] = useState<McpStatus>({ running: false, port: null, advanced: false, uptimeSecs: 0, requests: 0, decryptKeySet: false });
  // Advanced is a persisted user setting, NOT read from the poll — the backend
  // only holds the flag while running, so polling it would snap the toggle back
  // to Safe the moment the server is stopped.
  const [advanced, setAdvancedState] = useState(() => { try { return localStorage.getItem('dw.mcp.advanced') === 'true'; } catch { return false; } });
  const [port, setPort] = useState(() => { try { return localStorage.getItem(PORT_KEY) || '4675'; } catch { return '4675'; } });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'claude' | 'cursor' | 'vscode'>('claude');
  // Two different ways to reach the same engine, and nothing in the UI said
  // the HTTP one existed. MCP is for AI clients; /run is for scripts.
  const [mode, setMode] = useState<'mcp' | 'http'>('mcp');

  // VS Code manages the MCP server's lifecycle, but NOT the HTTP API — that one
  // the user starts explicitly, same as on the desktop.
  const [httpApi, setHttpApi] = useState<{ running: boolean; port: number | null }>({ running: false, port: null });
  useEffect(() => {
    if (isTauri) return;
    invoke<{ running: boolean; port: number | null }>('http_api_status')
      .then(setHttpApi)
      .catch(() => { /* older extension build without the endpoint */ });
  }, []);
  const toggleHttpApi = async () => {
    try {
      const next = httpApi.running
        ? await invoke<{ running: boolean; port: number | null }>('http_api_stop')
        : await invoke<{ running: boolean; port: number | null }>('http_api_start', { port: 4675, advanced: false });
      setHttpApi(next);
      toast(next.running ? `HTTP API listening on 127.0.0.1:${next.port}` : 'HTTP API stopped', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };
  const [copied, setCopied] = useState('');
  const [log, setLog] = useState<LogLine[]>([{ t: '—', m: 'Server stopped. Press Start to listen on the port.', kind: 'muted' }]);
  const lastReq = useRef(0);
  // VS Code only: whether an MCP server process is currently alive (heartbeat).
  // VS Code spawns it on demand, so this reflects "an agent has it running now".
  const [vscodeRunning, setVscodeRunning] = useState(false);
  useEffect(() => {
    if (isTauri || !open) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await invoke<{ running: boolean }>('mcp_heartbeat');
        if (alive) setVscodeRunning(r.running);
      } catch { /* command missing — leave stopped */ }
    };
    poll();
    const iv = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(iv); };
  }, [open]);

  const addLog = useCallback((m: string, kind: LogLine['kind']) => {
    setLog((l) => [...l.slice(-40), { t: clock(), m, kind }]);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<McpStatus>('mcp_status');
      setStatus(s);
      onRunningChange?.(s.running);
      if (s.running && s.requests > lastReq.current) {
        addLog(`validate_and_run_dataweave × ${s.requests - lastReq.current} → served`, 'ok');
      }
      lastReq.current = s.requests;
    } catch { /* command missing (e.g. extension host) — leave stopped */ }
  }, [onRunningChange, addLog]);

  useEffect(() => { if (!open) return; refresh(); const iv = setInterval(refresh, 1000); return () => clearInterval(iv); }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const endpoint = `http://127.0.0.1:${status.running && status.port ? status.port : port}/mcp`;

  // Copy-paste-able curl for the HTTP tab. Uses the live port so it works as-is.
  const runUrl = `http://127.0.0.1:${status.running && status.port ? status.port : port}/run`;
  const httpSample =
    `curl -X POST ${runUrl} \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  -d '{\n` +
    `        "script": "%dw 2.0\\noutput application/json\\n---\\n{ n: sizeOf(payload) }",\n` +
    `        "payload": [1, 2, 3]\n` +
    `      }'`;

  const toggleServer = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (status.running) {
        await invoke('mcp_stop');
        addLog('Server stopped. Port released.', 'warn');
      } else {
        const p = parseInt(port, 10);
        if (!Number.isInteger(p) || p < 1 || p > 65535) { toast('Enter a valid port (1–65535)', 'error'); setBusy(false); return; }
        try { localStorage.setItem(PORT_KEY, String(p)); } catch { /* ignore */ }
        await invoke('mcp_start', { port: p, advanced });
        addLog(`Listening on http://127.0.0.1:${p}/mcp`, 'ok');
      }
      await refresh();
    } catch (e) {
      toast(String(e), 'error');
      addLog(String(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const setAdvanced = async (next: boolean) => {
    setAdvancedState(next);
    try { localStorage.setItem('dw.mcp.advanced', String(next)); } catch { /* ignore */ }
    addLog(next ? 'Advanced mode ON — Java interop allowed (RCE risk)' : 'Safe mode ON — Java interop blocked', next ? 'warn' : 'ok');
    // Live-toggle if running; otherwise it's applied at the next Start.
    try { if (status.running) await invoke('mcp_set_advanced', { advanced: next }); }
    catch (e) { toast(String(e), 'error'); }
  };

  // Secure-properties decryption key — session-only, kept in memory (never
  // localStorage; it's a secret). Applied to the server so it decrypts ![...]
  // values in config/secure_config before a run.
  const [decryptKey, setDecryptKey] = useState('');
  const [decryptAlgo, setDecryptAlgo] = useState('AES');
  const [decryptMode, setDecryptMode] = useState('CBC');
  const applyDecrypt = async (clear = false) => {
    try {
      await invoke('mcp_set_decrypt', {
        key: clear ? null : (decryptKey || null),
        algorithm: decryptAlgo,
        mode: decryptMode,
        useRandomIv: false,
      });
      if (clear) setDecryptKey('');
      addLog(clear ? 'Decryption key cleared' : `Decryption key set (${decryptAlgo}/${decryptMode}) — session only`, 'ok');
    } catch (e) { toast(String(e), 'error'); }
  };

  const copy = (key: string, text: string) => {
    try { navigator.clipboard?.writeText(text); } catch { /* ignore */ }
    setCopied(key);
    setTimeout(() => setCopied(''), 1300);
  };

  const configFile = { claude: 'claude_desktop_config.json', cursor: '~/.cursor/mcp.json', vscode: '.vscode/mcp.json' }[tab];
  const snippet = tab === 'vscode'
    ? `{\n  "servers": {\n    "dataweave-studio": {\n      "type": "http",\n      "url": "${endpoint}"\n    }\n  }\n}`
    : `{\n  "mcpServers": {\n    "dataweave-studio": {\n      "url": "${endpoint}"\n    }\n  }\n}`;
  const configHint = tab === 'vscode'
    ? 'Drop this in .vscode/mcp.json, then enable the server in Copilot Agent Mode’s tool picker.'
    : tab === 'cursor'
      ? 'Add to ~/.cursor/mcp.json, then toggle it on in Cursor › Settings › MCP.'
      : 'Add to your Claude Desktop config, fully quit, and reopen. The tools appear under the ⊕ menu.';

  if (!open) return null;

  // In VS Code the MCP server is NOT an in-app HTTP server we start/stop — VS Code
  // owns its lifecycle (the extension registers a stdio server provider; VS Code
  // spawns dist/mcp.js on demand). So the desktop's port/start/stop controls don't
  // apply; show how to use it through VS Code's own MCP instead.
  if (!isTauri) {
    const step: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start' };
    const num: React.CSSProperties = { flexShrink: 0, width: 20, height: 20, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: 'var(--accent)' };
    const kbd = (t: string) => <code style={{ fontFamily: MONO, fontSize: 11.5, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '1px 6px' }}>{t}</code>;
    const TOOLS = ['validate_and_run_dataweave', 'secure_properties', 'migrate_dw_1_to_2', 'format_dataweave', 'dw_function_reference', 'dw_cookbook'];
    const addToClient = async (client: string, label: string) => {
      try {
        const r = await invoke<{ copied?: boolean; path?: string; existed?: boolean }>('mcp_write_config', { client });
        if (r.copied) toast('MCP config copied — paste it into your client', 'success');
        else toast(`${r.existed ? 'Updated' : 'Added'} ${label} · ${r.path}`, 'success');
      } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
    };
    const btnPrimary: React.CSSProperties = { height: 30, padding: '0 13px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', color: 'var(--accent)' };
    const btnGhost: React.CSSProperties = { height: 30, padding: '0 13px', borderRadius: 8, fontSize: 11.5, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--content-secondary)' };
    return (
      <div className="fixed inset-0 z-[95] flex items-center justify-center" style={{ padding: 22, background: 'color-mix(in oklch, var(--bg) 64%, transparent)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
        <style>{`@keyframes mcpDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.78)}} @keyframes mcpRing{0%{transform:scale(.6);opacity:.6}100%{transform:scale(1.6);opacity:0}}`}</style>
        <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(680px, 96vw)', maxHeight: '92vh', overflow: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: '0 32px 90px rgba(0,0,0,.6)' }}>
          <div className="flex items-center" style={{ height: 52, gap: 12, padding: '0 16px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg, var(--surface-2), var(--surface))' }}>
            <span className="grid place-items-center" style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}>{plug(17)}</span>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>Local Server</div>
              <div style={{ fontSize: 10.5, color: 'var(--content-faint)' }}>MCP is managed by VS Code · the HTTP API you start yourself</div>
            </div>
            <div className="flex-1" />
            <span className="inline-flex items-center" title={vscodeRunning ? 'An agent is running the MCP server now' : 'No MCP server process running — VS Code starts it on demand'} style={{ gap: 7, height: 26, padding: '0 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, background: vscodeRunning ? 'color-mix(in oklch, #10b981 15%, transparent)' : 'color-mix(in oklch, #ef4444 11%, transparent)', border: '1px solid ' + (vscodeRunning ? 'color-mix(in oklch, #10b981 45%, transparent)' : 'color-mix(in oklch, #ef4444 36%, transparent)'), color: vscodeRunning ? '#10b981' : '#ef4444' }}>
              <span style={{ position: 'relative', width: 8, height: 8 }}>
                {vscodeRunning && <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: '1.5px solid #10b981', animation: 'mcpRing 2.2s ease-out infinite' }} />}
                <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: vscodeRunning ? '#10b981' : '#ef4444', animation: vscodeRunning ? 'mcpDot 1.4s ease-in-out infinite' : 'none' }} />
              </span>
              {vscodeRunning ? 'Running' : 'Idle'}
            </span>
            <button onClick={onClose} className="grid place-items-center cursor-pointer hover:bg-surface-2 hover:text-content" style={{ width: 30, height: 30, border: 'none', background: 'transparent', borderRadius: 8, color: 'var(--content-faint)' }} title="Close (Esc)">
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--content-muted)' }}>
              This extension ships a Model Context Protocol server so an AI agent can run and validate DataWeave
              on the real local engine. <b>GitHub Copilot agent mode discovers it automatically</b> — other clients
              (Claude Code, Cursor, Claude Desktop) read their own config, so add it there with one click below.
            </p>

            {/* One-click: write the stdio entry into a client's config. */}
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--content-faint)' }}>Add to a client</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button style={btnPrimary} onClick={() => addToClient('claude-code', 'Claude Code')} className="hover:brightness-110">＋ Claude Code (workspace)</button>
                <button style={btnGhost} onClick={() => addToClient('cursor', 'Cursor')} className="hover:text-content">＋ Cursor</button>
                <button style={btnGhost} onClick={() => addToClient('claude-desktop', 'Claude Desktop')} className="hover:text-content">＋ Claude Desktop</button>
                <button style={btnGhost} onClick={() => addToClient('copy', '')} className="hover:text-content">⧉ Copy config</button>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--content-faint)', lineHeight: 1.5 }}>
                Writes a stdio entry into the client's <code style={{ fontFamily: MONO }}>mcpServers</code> that runs the bundled server with VS Code's own runtime — no separate Node.js install needed. For Claude Code, run {kbd('/mcp')} afterwards to connect.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--content-faint)' }}>Or with GitHub Copilot</div>
              <div style={step}><span style={num}>1</span><div style={{ fontSize: 12.5, lineHeight: 1.55 }}>Open the Command Palette ({kbd('Ctrl/Cmd+Shift+P')}) and run {kbd('MCP: List Servers')}.</div></div>
              <div style={step}><span style={num}>2</span><div style={{ fontSize: 12.5, lineHeight: 1.55 }}>Pick <b>DataWeave Studio</b> → <b>Start Server</b>.</div></div>
              <div style={step}><span style={num}>3</span><div style={{ fontSize: 12.5, lineHeight: 1.55 }}>In Copilot Chat, switch to <b>Agent</b> mode — the DataWeave tools appear under the 🔧 Tools picker.</div></div>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--content-faint)', marginBottom: 8 }}>6 tools exposed</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TOOLS.map((t) => <code key={t} style={{ fontFamily: MONO, fontSize: 11, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, padding: '3px 7px', color: 'var(--content)' }}>{t}</code>)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11.5, lineHeight: 1.55, color: 'var(--content-muted)' }}>
              <div><b>Safe mode (default):</b> a pure-transform sandbox — <code style={{ fontFamily: MONO }}>java!</code> / <code style={{ fontFamily: MONO }}>readUrl</code> / <code style={{ fontFamily: MONO }}>dw::io</code> are rejected (in scripts and imported modules). To lift the gate for FULL local access, set the env var {kbd('DWSTUDIO_MCP_ADVANCED=1')} on the server entry in <code style={{ fontFamily: MONO }}>mcp.json</code>.</div>
              <div><b>Encrypted secure config:</b> pass the key per-call as <code style={{ fontFamily: MONO }}>secureKey</code>, or set {kbd('DWSTUDIO_SECURE_KEY')} on the server. A <code style={{ fontFamily: MONO }}>{'![…]'}</code> value with no key is rejected (never run as ciphertext).</div>
              <div><b>Custom modules:</b> pass a <code style={{ fontFamily: MONO }}>modules</code> array so <code style={{ fontFamily: MONO }}>import x from MyModule</code> resolves.</div>
            </div>

            {/* HTTP API — the one thing here VS Code does NOT manage, so it gets
                its own start/stop rather than hiding in a paragraph. */}
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--content-faint)', flex: 1 }}>HTTP API — run scripts from anything</div>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: httpApi.running ? '#10b981' : 'var(--content-faint)' }}>
                  {httpApi.running ? `127.0.0.1:${httpApi.port}` : 'Stopped'}
                </span>
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--content-muted)' }}>
                <code style={{ fontFamily: MONO }}>POST /run</code> takes <code style={{ fontFamily: MONO }}>{'{ script, payload, vars }'}</code> and
                returns the output. Send a <code style={{ fontFamily: MONO }}>rows</code> array instead and one script runs over every row —
                a back-test across a CSV of real traffic, without deploying an API just to try a transform.
                Loopback only, Safe mode applies, and it stays off until you start it.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <button style={httpApi.running ? btnGhost : btnPrimary} onClick={toggleHttpApi} className="hover:brightness-110">
                  {httpApi.running ? '■ Stop HTTP API' : '▶ Start HTTP API'}
                </button>
                {httpApi.running && (
                  <button style={btnGhost} className="hover:text-content" onClick={() => {
                    navigator.clipboard.writeText(`curl -X POST http://127.0.0.1:${httpApi.port}/run -H 'Content-Type: application/json' -d '{"script":"%dw 2.0
output application/json
---
{ n: sizeOf(payload) }","payload":[1,2,3]}'`);
                    toast('curl copied', 'success');
                  }}>⧉ Copy a curl</button>
                )}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--content-faint)', lineHeight: 1.5 }}>
              Requires VS Code 1.101+. If <b>DataWeave Studio</b> doesn't appear in <i>MCP: List Servers</i>, reload the window.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const running = status.running;
  const accent = 'var(--accent)';
  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' };
  const cardHead = (title: string, sub?: string) => (
    <div style={{ padding: '13px 16px 11px', borderBottom: '1px solid var(--line-subtle)' }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--content-muted)', marginTop: 1 }}>{sub}</div>}
    </div>
  );

  const chip = (label: string, value: string, hot?: boolean) => (
    <div className="inline-flex flex-col justify-center" style={{ height: 32, padding: '0 13px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
      <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, lineHeight: 1, color: hot ? accent : 'var(--content)' }}>{value}</span>
      <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--content-faint)', marginTop: 3 }}>{label}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center" style={{ padding: 22, background: 'color-mix(in oklch, var(--bg) 64%, transparent)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <style>{`@keyframes mcpDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.78)}} @keyframes mcpRing{0%{transform:scale(.6);opacity:.6}100%{transform:scale(1.5);opacity:0}}`}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(1080px, 96vw)', height: 'min(724px, 94vh)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: '0 32px 90px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Title bar */}
        <div className="flex items-center" style={{ height: 52, gap: 12, padding: '0 16px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg, var(--surface-2), var(--surface))' }}>
          <span className="grid place-items-center" style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: accent }}>{plug(17)}</span>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Local Server</div>
            <div style={{ fontSize: 10.5, color: 'var(--content-faint)' }}>One engine, two ways in · MCP for AI agents, HTTP for your own scripts</div>
          </div>
          <div className="flex-1" />
          <span className="inline-flex items-center" style={{ gap: 7, height: 26, padding: '0 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, background: running ? 'color-mix(in oklch, var(--accent) 14%, transparent)' : 'var(--surface-2)', border: '1px solid ' + (running ? 'var(--accent-border)' : 'var(--line)'), color: running ? accent : 'var(--content-muted)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: running ? accent : 'var(--content-faint)', animation: running ? 'mcpDot 1.4s ease-in-out infinite' : 'none' }} />
            {running ? 'Running' : 'Stopped'}
          </span>
          <button onClick={onClose} className="grid place-items-center cursor-pointer hover:bg-surface-2 hover:text-content" style={{ width: 30, height: 30, marginLeft: 6, border: 'none', background: 'transparent', borderRadius: 8, color: 'var(--content-faint)' }} title="Close (Esc)">
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Hero */}
        <div className="flex items-center" style={{ flexShrink: 0, padding: '22px 26px', gap: 26, borderBottom: '1px solid var(--line)', background: 'radial-gradient(120% 160% at 12% -10%, color-mix(in oklch, var(--accent) 9%, transparent), transparent 60%)' }}>
          <div className="relative grid place-items-center" style={{ width: 96, height: 96, flexShrink: 0 }}>
            {running && [0, 1, 2].map((i) => <span key={i} className="absolute" style={{ inset: 0, borderRadius: '50%', border: '1.5px solid var(--accent)', animation: `mcpRing 2.6s ease-out ${i * 0.85}s infinite` }} />)}
            <div className="grid place-items-center" style={{ width: 56, height: 56, borderRadius: 17, background: running ? 'linear-gradient(145deg, var(--accent), var(--accent-hover))' : 'var(--surface-3)', color: running ? 'var(--accent-ink)' : 'var(--content-faint)', boxShadow: running ? '0 10px 30px color-mix(in oklch, var(--accent) 45%, transparent)' : 'none' }}>{plug(26)}</div>
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.1 }}>{running ? 'Server is live' : 'Server is stopped'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--content-muted)', marginTop: 3 }}>{running ? 'Agents can run & validate scripts right now' : 'Start it, then connect an AI client over MCP or POST to /run from a script'}</div>
            <div className="flex items-center flex-wrap" style={{ marginTop: 14, gap: 8 }}>
              <div className="inline-flex items-center" style={{ gap: 9, height: 32, padding: '0 6px 0 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--line)', fontFamily: MONO, fontSize: 12.5, color: 'var(--content-secondary)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: running ? accent : 'var(--content-faint)', animation: running ? 'mcpDot 1.4s ease-in-out infinite' : 'none' }} />
                {endpoint}
                <button onClick={() => copy('ep', endpoint)} className="grid place-items-center cursor-pointer hover:bg-surface-3 hover:text-content" style={{ width: 22, height: 22, border: 'none', background: 'transparent', borderRadius: 6, color: 'var(--content-faint)' }} title="Copy endpoint">
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                </button>
              </div>
              {chip('uptime', running ? fmtUptime(status.uptimeSecs) : '—')}
              {chip('requests', running ? String(status.requests) : '—', running && status.requests > 0)}
            </div>
          </div>
          <button onClick={toggleServer} disabled={busy} className="inline-flex items-center cursor-pointer disabled:opacity-50" style={{ gap: 9, height: 46, padding: '0 22px', borderRadius: 11, fontSize: 14, fontWeight: 600, border: running ? '1px solid color-mix(in oklch, var(--err) 45%, transparent)' : '1px solid var(--accent)', background: running ? 'color-mix(in oklch, var(--err) 12%, transparent)' : 'var(--accent)', color: running ? 'var(--err)' : 'var(--accent-ink)', boxShadow: running ? 'none' : '0 8px 24px color-mix(in oklch, var(--accent) 35%, transparent)' }}>
            {running ? <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg> : <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>}
            {busy ? '…' : running ? 'Stop server' : 'Start server'}
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto" style={{ flex: 1, padding: '22px 26px', display: 'grid', gridTemplateColumns: '1.32fr 1fr', gap: 22, alignContent: 'start', background: 'var(--bg)' }}>
          {/* LEFT */}
          <div className="flex flex-col" style={{ gap: 20, minWidth: 0 }}>
            {/* Endpoint */}
            <section style={card}>
              {cardHead('Endpoint', 'Where clients connect — AI agents and scripts alike. Bound to localhost, never exposed to your network.')}
              <div className="flex items-center" style={{ gap: 14, padding: '13px 16px' }}>
                <div className="flex-1">
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>Port</div>
                  <div style={{ fontSize: 11, color: 'var(--content-muted)', marginTop: 1 }}>Default 4675. {running ? 'Stop the server to change it.' : 'Change if another app holds it.'}</div>
                </div>
                <div className="inline-flex items-center" style={{ height: 30, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', overflow: 'hidden', opacity: running ? 0.6 : 1 }}>
                  <span style={{ padding: '0 8px 0 10px', fontFamily: MONO, fontSize: 11, color: 'var(--content-faint)' }}>:</span>
                  <input value={port} disabled={running} onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} inputMode="numeric" style={{ width: 58, height: 28, border: 'none', background: 'transparent', outline: 'none', color: 'var(--content)', fontFamily: MONO, fontSize: 13, fontWeight: 500 }} />
                </div>
              </div>
            </section>

            {/* Security */}
            <section style={{ ...card, borderColor: advanced ? 'color-mix(in oklch, var(--err) 40%, transparent)' : 'var(--line)' }}>
              <div className="flex items-center" style={{ gap: 9, padding: '13px 16px 11px', borderBottom: '1px solid var(--line-subtle)' }}>
                <span style={{ color: advanced ? 'var(--err)' : accent }}><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg></span>
                <div className="flex-1">
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Execution security</div>
                  <div style={{ fontSize: 11, color: 'var(--content-muted)', marginTop: 1 }}>Controls what generated scripts are allowed to touch.</div>
                </div>
              </div>
              <div style={{ padding: 14 }}>
                <div className="flex" style={{ gap: 10 }}>
                  {([
                    [false, 'Safe mode', 'No java! imports, no JAR loading — a pure transform reads your payload and nothing else. Recommended.'],
                    [true, 'Advanced mode', 'Allows import java! so scripts can use Java libs — but a generated script could run arbitrary code.'],
                  ] as const).map(([adv, title, desc]) => {
                    const on = advanced === adv;
                    const tone = adv ? 'var(--err)' : accent;
                    return (
                      <button key={String(adv)} onClick={() => setAdvanced(adv)} className="flex-1 text-left cursor-pointer" style={{ padding: '11px 13px', borderRadius: 10, background: on ? `color-mix(in oklch, ${tone} 11%, transparent)` : 'var(--surface-2)', border: `1.5px solid ${on ? tone : 'var(--line)'}`, color: 'var(--content)' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: on ? tone : 'var(--content)' }}>{title}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--content-muted)', lineHeight: 1.5 }}>{desc}</div>
                      </button>
                    );
                  })}
                </div>
                {advanced && (
                  <div className="flex" style={{ marginTop: 12, gap: 10, padding: '11px 13px', borderRadius: 10, background: 'color-mix(in oklch, var(--err) 11%, transparent)', border: '1px solid color-mix(in oklch, var(--err) 38%, transparent)' }}>
                    <span style={{ color: 'var(--err)', flexShrink: 0, marginTop: 1 }}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg></span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--err)' }}>Remote-code-execution risk</div>
                      <div style={{ fontSize: 11, color: 'var(--content-secondary)', marginTop: 2, lineHeight: 1.55 }}>An AI agent runs scripts you didn’t write. With Java interop on, a hallucinated script can touch the filesystem or shell out. Only enable for fully-trusted local agents.</div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Secure properties decryption key */}
            <section style={card}>
              <div className="flex items-center" style={{ gap: 9, padding: '13px 16px 11px', borderBottom: '1px solid var(--line-subtle)' }}>
                <span style={{ color: accent }}><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
                <div className="flex-1">
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Secure-properties key</div>
                  <div style={{ fontSize: 11, color: 'var(--content-muted)', marginTop: 1 }}>Decrypts <code style={{ fontFamily: MONO, fontSize: 10.5 }}>![…]</code> values in config before a run. Session-only — never saved or sent over MCP.</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 5, color: status.decryptKeySet ? accent : 'var(--content-muted)', background: `color-mix(in oklch, ${status.decryptKeySet ? 'var(--accent)' : 'var(--content-muted)'} 13%, transparent)`, border: `1px solid color-mix(in oklch, ${status.decryptKeySet ? 'var(--accent)' : 'var(--content-muted)'} 28%, transparent)` }}>{status.decryptKeySet ? 'Key set' : 'No key'}</span>
              </div>
              <div style={{ padding: 14 }}>
                <input
                  type="password"
                  value={decryptKey}
                  onChange={(e) => setDecryptKey(e.target.value)}
                  placeholder="Decryption key (e.g. 16/24/32-char AES key)"
                  autoComplete="off"
                  style={{ width: '100%', height: 34, padding: '0 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1.5px solid var(--line)', outline: 'none', color: 'var(--content)', fontFamily: MONO, fontSize: 12.5 }}
                />
                <div className="flex items-center" style={{ gap: 8, marginTop: 10 }}>
                  <select value={decryptAlgo} onChange={(e) => setDecryptAlgo(e.target.value)} style={{ flex: 1, height: 30, padding: '0 8px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--content)', fontSize: 12 }}>
                    {['AES', 'Blowfish', 'DES', 'DESede', 'RC2'].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select value={decryptMode} onChange={(e) => setDecryptMode(e.target.value)} style={{ flex: 1, height: 30, padding: '0 8px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--content)', fontSize: 12 }}>
                    {['CBC', 'CFB', 'ECB', 'OFB'].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button onClick={() => applyDecrypt(false)} disabled={!decryptKey} className="cursor-pointer" style={{ height: 30, padding: '0 14px', borderRadius: 8, background: accent, color: 'var(--accent-contrast, #fff)', border: 'none', fontSize: 12, fontWeight: 600, opacity: decryptKey ? 1 : 0.5 }}>Set</button>
                  {status.decryptKeySet && <button onClick={() => applyDecrypt(true)} className="cursor-pointer" style={{ height: 30, padding: '0 12px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--content-secondary)', border: '1px solid var(--line)', fontSize: 12 }}>Clear</button>}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--content-muted)', marginTop: 10, lineHeight: 1.5 }}>An agent can also pass <code style={{ fontFamily: MONO, fontSize: 10 }}>secure_key</code> per call, which overrides this. If a <code style={{ fontFamily: MONO, fontSize: 10 }}>![…]</code> value appears with no key set, the run is rejected — ciphertext is never sent to the engine.</div>
              </div>
            </section>

            {/* Tools */}
            <section style={card}>
              {cardHead('Tools exposed', 'Capabilities the agent can call over the protocol.')}
              {[
                { name: 'validate_and_run_dataweave', desc: 'Run a script + payload locally; returns output or the exact error & line. Supports attributes, vars, named inputs, config / secure-config (with ![…] decryption), and multipart/binary.', badge: 'Live', live: true },
                { name: 'secure_properties', desc: 'Encrypt / decrypt MuleSoft ![…] secure values (AES/Blowfish/… via the official tool).', badge: 'Live', live: true },
                { name: 'migrate_dw_1_to_2', desc: 'Best-effort DataWeave 1.0 → 2.0 migration; flags manual-fixup spots. Validate the result with the run tool.', badge: 'Live', live: true },
                { name: 'dw_function_reference', desc: 'Offline DataWeave 2.11 stdlib reference — 309 functions with signatures, docs & examples (by name, search, or list).', badge: 'Live', live: true },
                { name: 'dw_cookbook', desc: 'Offline cookbook — 83 validated recipes for common transforms (by id, search, or category).', badge: 'Live', live: true },
                { name: 'format_dataweave', desc: 'Pretty-print / reformat a script via the engine’s own IDE formatter.', badge: 'Live', live: true },
              ].map((t) => (
                <div key={t.name} className="flex items-center" style={{ gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line-subtle)', opacity: t.live ? 1 : 0.6 }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <code style={{ fontFamily: MONO, fontSize: 12, color: 'var(--content)' }}>{t.name}</code>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 5, color: t.live ? accent : 'var(--content-muted)', background: `color-mix(in oklch, ${t.live ? 'var(--accent)' : 'var(--content-muted)'} 13%, transparent)`, border: `1px solid color-mix(in oklch, ${t.live ? 'var(--accent)' : 'var(--content-muted)'} 28%, transparent)` }}>{t.badge}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--content-muted)', marginTop: 3 }}>{t.desc}</div>
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col" style={{ gap: 20, minWidth: 0 }}>
            {/* Protocol switch — MCP for agents, plain HTTP for scripts. */}
            <div className="flex" style={{ gap: 3, padding: 3, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
              {([['mcp', 'AI clients (MCP)'], ['http', 'HTTP API']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className="flex-1 cursor-pointer"
                  style={{ height: 32, borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, background: mode === id ? 'var(--surface-3)' : 'transparent', color: mode === id ? 'var(--content)' : 'var(--content-muted)' }}
                >{label}</button>
              ))}
            </div>

            {mode === 'http' ? (
              <section style={card}>
                {cardHead('Run scripts over HTTP', 'The same engine, behind a POST any script can call — no MCP client needed.')}
                <div style={{ padding: '12px 14px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--content-muted)' }}>
                  <div style={{ marginBottom: 10 }}>
                    Send a script and a payload, get the output back. Send a <code style={{ fontFamily: MONO }}>rows</code> array
                    instead and one script runs over every row — a back-test across a CSV export of real traffic,
                    without deploying an API just to try a transform.
                  </div>
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden' }}>
                    <div className="flex items-center" style={{ gap: 7, padding: '7px 11px', borderBottom: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--content-faint)', flex: 1 }}>POST {endpoint.replace('/mcp', '/run')}</span>
                      <button onClick={() => copy('http', httpSample)} className="inline-flex items-center cursor-pointer hover:text-content" style={{ gap: 5, height: 22, padding: '0 9px', border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 6, color: 'var(--content-secondary)', fontSize: 10.5, fontWeight: 600 }}>{copied === 'http' ? 'Copied' : 'Copy'}</button>
                    </div>
                    <pre style={{ margin: 0, padding: '13px 14px', fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: 'var(--content-secondary)', whiteSpace: 'pre', overflowX: 'auto' }}>{httpSample}</pre>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--content-faint)', lineHeight: 1.5 }}>
                    <b>Any format, in and out.</b> Only the request envelope is JSON — set
                    <code style={{ fontFamily: MONO }}>payloadMime</code> to <code style={{ fontFamily: MONO }}>application/xml</code>,
                    <code style={{ fontFamily: MONO }}>application/csv</code> or anything else, and the output is whatever your
                    script&rsquo;s <code style={{ fontFamily: MONO }}>output</code> directive says.
                    <br /><br />
                    The engine compiles the script once and caches it — the first row costs about a second, every row
                    after runs in milliseconds. Safe mode applies here too. A worked Python example lives in
                    <code style={{ fontFamily: MONO }}> docs/examples/dw_backtest.py</code>.
                  </div>
                </div>
              </section>
            ) : (
            <section style={card}>
              {cardHead('Connect your AI client', 'Add this once. Your client then lists the tools to the model.')}
              <div style={{ padding: '12px 14px' }}>
                <div className="flex" style={{ gap: 3, padding: 3, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                  {(['claude', 'cursor', 'vscode'] as const).map((id) => (
                    <button key={id} onClick={() => setTab(id)} className="flex-1 cursor-pointer" style={{ height: 30, borderRadius: 7, border: 'none', fontSize: 11.5, fontWeight: 600, background: tab === id ? 'var(--surface-3)' : 'transparent', color: tab === id ? 'var(--content)' : 'var(--content-muted)' }}>{id === 'claude' ? 'Claude Desktop' : id === 'cursor' ? 'Cursor' : 'VS Code'}</button>
                  ))}
                </div>
                <div style={{ marginTop: 11, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden' }}>
                  <div className="flex items-center" style={{ gap: 7, padding: '7px 11px', borderBottom: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--content-faint)', flex: 1 }}>{configFile}</span>
                    <button onClick={() => copy('cfg', snippet)} className="inline-flex items-center cursor-pointer hover:text-content" style={{ gap: 5, height: 22, padding: '0 9px', border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 6, color: 'var(--content-secondary)', fontSize: 10.5, fontWeight: 600 }}>{copied === 'cfg' ? 'Copied' : 'Copy'}</button>
                  </div>
                  <pre style={{ margin: 0, padding: '13px 14px', fontFamily: MONO, fontSize: 11.5, lineHeight: 1.65, color: 'var(--content-secondary)', whiteSpace: 'pre', overflowX: 'auto' }}>{snippet}</pre>
                </div>
                <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--content-faint)', lineHeight: 1.5 }}>{configHint}</div>
              </div>
            </section>
            )}

            {/* Activity */}
            <section style={{ ...card, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 200 }}>
              <div className="flex items-center" style={{ gap: 8, padding: '13px 16px 11px', borderBottom: '1px solid var(--line-subtle)' }}>
                <div className="flex-1"><div style={{ fontSize: 13, fontWeight: 600 }}>Activity</div></div>
                <span className="inline-flex items-center" style={{ gap: 6, height: 22, padding: '0 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', background: running ? 'color-mix(in oklch, var(--accent) 13%, transparent)' : 'var(--surface-2)', color: running ? accent : 'var(--content-faint)', border: '1px solid ' + (running ? 'var(--accent-border)' : 'var(--line)') }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: running ? 'mcpDot 1.4s ease-in-out infinite' : 'none' }} />{running ? 'Live' : 'Idle'}
                </span>
              </div>
              <div className="overflow-y-auto" style={{ flex: 1, padding: '8px 6px 10px' }}>
                {[...log].reverse().map((l, i) => (
                  <div key={i} className="flex items-baseline" style={{ gap: 10, padding: '5px 12px' }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--content-ghost)', flexShrink: 0, width: 52 }}>{l.t}</span>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: l.kind === 'err' ? 'var(--err)' : l.kind === 'warn' ? 'var(--warn)' : l.kind === 'ok' ? accent : 'var(--content-ghost)' }} />
                    <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.5, color: l.kind === 'err' ? 'var(--err)' : l.kind === 'warn' ? 'var(--warn)' : l.kind === 'ok' ? 'var(--content-secondary)' : 'var(--content-muted)' }}>{l.m}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
