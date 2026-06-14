/**
 * MCP Server control panel. Ported from the Claude Design "MCP Server" mock and
 * wired to the real in-process Rust server (mcp_server.rs): Start/Stop, live
 * status (uptime + requests), editable port, Safe/Advanced mode, and copy-paste
 * connect snippets. One tool is live today — validate_and_run_dataweave; the
 * others are marked planned (honest, not faked).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '../bridge';
import { toast } from './Toast';

interface McpStatus { running: boolean; port: number | null; advanced: boolean; uptimeSecs: number; requests: number; }
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
  const [status, setStatus] = useState<McpStatus>({ running: false, port: null, advanced: false, uptimeSecs: 0, requests: 0 });
  // Advanced is a persisted user setting, NOT read from the poll — the backend
  // only holds the flag while running, so polling it would snap the toggle back
  // to Safe the moment the server is stopped.
  const [advanced, setAdvancedState] = useState(() => { try { return localStorage.getItem('dw.mcp.advanced') === 'true'; } catch { return false; } });
  const [port, setPort] = useState(() => { try { return localStorage.getItem(PORT_KEY) || '4675'; } catch { return '4675'; } });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'claude' | 'cursor' | 'vscode'>('claude');
  const [copied, setCopied] = useState('');
  const [log, setLog] = useState<LogLine[]>([{ t: '—', m: 'Server stopped. Press Start to listen on the port.', kind: 'muted' }]);
  const lastReq = useRef(0);

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
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>MCP Server</div>
            <div style={{ fontSize: 10.5, color: 'var(--content-faint)' }}>Model Context Protocol · expose the DataWeave engine to AI agents</div>
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
            <div style={{ fontSize: 12.5, color: 'var(--content-muted)', marginTop: 3 }}>{running ? 'Agents can run & validate scripts right now' : 'Start the server, then point your AI client at the endpoint below'}</div>
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
              {cardHead('Endpoint', 'Where AI clients connect. Bound to localhost — never exposed to your network.')}
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

            {/* Tools */}
            <section style={card}>
              {cardHead('Tools exposed', 'Capabilities the agent can call over the protocol.')}
              {[
                { name: 'validate_and_run_dataweave', desc: 'Run a script + payload locally, return output or the exact error & line. The self-correct loop.', badge: 'Live', live: true },
                { name: 'format_dataweave', desc: 'Pretty-print a DataWeave script.', badge: 'Planned', live: false },
                { name: 'migrate_dw_1_to_2', desc: 'Upgrade a DataWeave 1.0 script to 2.0.', badge: 'Planned', live: false },
                { name: 'secure_properties', desc: 'Encrypt / decrypt ${secure::…} values.', badge: 'Planned', live: false },
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
            {/* Connect */}
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
