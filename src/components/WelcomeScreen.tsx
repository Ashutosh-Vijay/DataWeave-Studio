/**
 * First-run welcome — brand hero, a self-running (canned) transform demo, and a
 * bento of features. Ported from the Claude Design "Welcome" mock, but using the
 * app's real theme tokens (so Paper/light works), the bundled font stack (no
 * network fonts — the app is 100% offline), the real version, and reduced-motion
 * gating. The in-mock "guided tour" carousel is intentionally dropped: the
 * "Take the tour" button launches the app's real spotlight tour instead.
 */
import { useEffect, useState } from 'react';
import { logoUrl } from '../assets';

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const EXAMPLES = [
  {
    label: 'map & reshape', inType: 'application/json',
    in: '[{ "id": 1, "name": "ada" },\n { "id": 2, "name": "linus" }]',
    script: 'payload map (u) -> {\n  userId: u.id,\n  handle: upper(u.name)\n}',
    out: '[\n  { "userId": 1, "handle": "ADA" },\n  { "userId": 2, "handle": "LINUS" }\n]',
  },
  {
    label: 'group & count', inType: 'application/json',
    in: '[{ "team": "a" }, { "team": "b" },\n { "team": "a" }]',
    script: 'payload\n  groupBy (r) -> r.team\n  mapObject (v, k) -> { (k): sizeOf(v) }',
    out: '{\n  "a": 2,\n  "b": 1\n}',
  },
  {
    label: 'JSON to XML', inType: 'application/json',
    in: '{ "order": { "id": 7, "paid": true } }',
    script: 'output application/xml\n---\n{ receipt: payload.order }',
    out: '<?xml version="1.0"?>\n<receipt>\n  <id>7</id>\n  <paid>true</paid>\n</receipt>',
  },
];

const svg = (paths: React.ReactNode, size = 16, sw = 1.7) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);
const ICONS = {
  mcp: svg(<><path d="M12 2v4" /><path d="M5.5 5.5 8 8" /><path d="M18.5 5.5 16 8" /><rect x="6" y="8" width="12" height="8" rx="3" /><path d="M9 16v3a3 3 0 0 0 6 0v-3" /></>),
  ref: svg(<><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" /><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" /></>),
  logs: svg(<><path d="M4 6h16M4 12h10M4 18h7" /></>),
  flow: svg(<><circle cx="5" cy="6" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="5" cy="18" r="2" /><path d="M7 6h6a4 4 0 0 1 4 4M7 18h6a4 4 0 0 0 4-4" /></>),
  modules: svg(<><path d="m16 6 4 14M12 6v14M8 8l-4 12" /></>),
  java: svg(<><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></>),
  cookbook: svg(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>),
  secure: svg(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  offline: svg(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>),
  target: svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></>),
  tests: svg(<><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M8 16h8" /></>),
  lsp: svg(<><polyline points="7 8 3 12 7 16" /><polyline points="17 8 21 12 17 16" /><line x1="14" y1="5" x2="10" y2="19" /></>),
  share: svg(<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" /></>),
};

const BENTO = [
  { key: 'target', tag: 'NEW', title: 'Target your Mule', desc: 'Check scripts against the runtime you deploy to — a function your Mule lacks fails here, not on the server.', icon: ICONS.target },
  { key: 'tests', tag: 'NEW', title: 'Unit tests', desc: 'Real dw::test suites, run by the bundled engine, with the engine’s own failure messages and line numbers.', icon: ICONS.tests },
  { key: 'lsp', tag: 'NEW', title: 'Real IDE editing', desc: 'MuleSoft’s own language service: type-aware completion, go-to-definition, rename, outline and quick fixes.', icon: ICONS.lsp },
  { key: 'share', title: 'Share as a link', desc: 'Script, payload, context and target compressed into a URL — nothing is uploaded, the data rides in the link.', icon: ICONS.share },
  { key: 'mcp', title: 'Local server', desc: 'Expose the engine to Claude, Cursor & Copilot so an agent can run and self-correct scripts.', icon: ICONS.mcp },
  { key: 'flow', title: 'Message flows', desc: 'Chain transforms into a pipeline with the visual Message Flow designer.', icon: ICONS.flow },
  { key: 'ref', title: '309 functions', desc: 'The full DataWeave standard library, searchable, with signatures and runnable examples.', icon: ICONS.ref },
  { key: 'modules', title: 'Module library', desc: 'Save reusable .dwl modules once, then import them from any script.', icon: ICONS.modules },
  { key: 'cookbook', title: 'Cookbook', desc: 'A searchable library of ready-to-run recipes — load one and tweak it.', icon: ICONS.cookbook },
  { key: 'java', title: 'Java tester', desc: 'Compile the Java classes your Mule app calls and run them against a payload.', icon: ICONS.java },
  { key: 'secure', title: 'Secure properties', desc: 'Encrypt & decrypt ${secure::key} values with the built-in crypto tool.', icon: ICONS.secure },
  { key: 'offline', title: '100% offline', desc: 'No telemetry, no account, no network. Your payloads never leave the machine.', icon: ICONS.offline },
];

const CHIPS = ['DataWeave 2.12 runtime', 'Bundled JVM', 'JSON · XML · CSV · YAML', 'cURL import', 'OpenAPI import', 'Share links', 'Cross-platform'];

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return !!reduce;
}

export function WelcomeScreen({ appVersion, onOpenPlayground, onTakeTour }: {
  appVersion: string;
  onOpenPlayground: () => void;
  onTakeTour: () => void;
}) {
  const reduce = useReducedMotion();
  const [ex, setEx] = useState(0);
  const [lines, setLines] = useState(reduce ? 99 : 0);
  const [dwell, setDwell] = useState(0);

  // Canned, self-running demo: reveal output line-by-line, dwell, then advance.
  useEffect(() => {
    if (reduce) return;
    const iv = setInterval(() => {
      const total = EXAMPLES[ex].out.split('\n').length;
      if (lines < total) setLines((l) => l + 1);
      else if (dwell < 14) setDwell((d) => d + 1);
      else { setEx((e) => (e + 1) % EXAMPLES.length); setLines(0); setDwell(0); }
    }, 230);
    return () => clearInterval(iv);
  }, [reduce, ex, lines, dwell]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenPlayground(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenPlayground]);

  const example = EXAMPLES[ex];
  const outLines = example.out.split('\n');
  const shown = reduce ? example.out : outLines.slice(0, lines).join('\n');
  const done = reduce || lines >= outLines.length;
  const anim = (v: string) => (reduce ? undefined : v);

  return (
    <div className="fixed inset-0 z-[120] overflow-hidden text-content" style={{ background: 'var(--bg)', fontSize: 13 }}>
      <style>{`
        @keyframes wDrift { 0%,100% { transform: translate(0,0); opacity:.7 } 50% { transform: translate(14px,-18px); opacity:1 } }
        @keyframes wFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes wBlink { 0%,100% { opacity:1 } 50% { opacity:0 } }
      `}</style>

      {/* ambient field */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(60% 70% at 82% -6%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 60%), radial-gradient(48% 60% at 6% 108%, color-mix(in oklch, var(--violet) 12%, transparent), transparent 60%)' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.7, animation: anim('wDrift 11s ease-in-out infinite'), backgroundImage: 'radial-gradient(1.4px 1.4px at 12% 22%, color-mix(in oklch, var(--accent) 55%, transparent), transparent 100%), radial-gradient(1.4px 1.4px at 34% 68%, color-mix(in oklch, var(--violet) 45%, transparent), transparent 100%), radial-gradient(1.2px 1.2px at 58% 32%, color-mix(in oklch, var(--cyan) 40%, transparent), transparent 100%), radial-gradient(1.4px 1.4px at 78% 74%, color-mix(in oklch, var(--accent) 40%, transparent), transparent 100%), radial-gradient(1.2px 1.2px at 90% 40%, color-mix(in oklch, var(--accent) 45%, transparent), transparent 100%)' }} />

      {/* top bar */}
      <div className="relative flex items-center gap-3 px-[18px]" style={{ height: 46 }}>
        <div className="flex gap-[7px]">
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--content-faint)', marginLeft: 4 }}>DataWeave Studio · v{appVersion}</span>
        <div className="flex-1" />
        <button onClick={onOpenPlayground} className="cursor-pointer rounded-md transition-colors hover:bg-surface-2 hover:text-content" style={{ height: 28, padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--content-faint)', fontSize: 12 }}>Skip intro</button>
      </div>

      <div className="absolute overflow-y-auto" style={{ inset: '46px 0 0' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '26px 36px 40px' }}>

          {/* hero */}
          <div className="flex items-end flex-wrap" style={{ gap: 28 }}>
            <div style={{ flex: 1, minWidth: 460 }}>
              <div className="flex items-center" style={{ gap: 13, marginBottom: 20 }}>
                <img src={logoUrl} alt="" width={46} height={46} style={{ filter: 'drop-shadow(0 8px 22px color-mix(in oklch, var(--cyan) 30%, transparent))', animation: anim('wFloat 4s ease-in-out infinite') }} />
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.4, color: 'var(--content-faint)' }}>DATAWEAVE&nbsp;STUDIO</div>
              </div>
              <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.04, fontWeight: 800, letterSpacing: -1.4, maxWidth: '13ch' }}>Transform data, <span style={{ color: 'var(--accent)' }}>locally.</span></h1>
              <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--content-secondary)', maxWidth: '50ch' }}>A fast workbench for DataWeave 2.0 — write a transform, run it against real JSON, XML, CSV or YAML, and see the output instantly. The full DataWeave&nbsp;2.12 runtime, bundled. No Anypoint, no cloud, no waiting.</p>
              <div className="flex flex-wrap" style={{ gap: 12, marginTop: 26 }}>
                <button onClick={onOpenPlayground} className="cursor-pointer hover:brightness-110 inline-flex items-center" style={{ gap: 9, height: 46, padding: '0 22px', borderRadius: 11, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 14, fontWeight: 600, boxShadow: '0 10px 30px color-mix(in oklch, var(--accent) 34%, transparent)' }}>
                  Open the playground
                  {svg(<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>, 15, 2.2)}
                </button>
                <button onClick={onTakeTour} className="cursor-pointer inline-flex items-center hover:bg-surface-2 hover:text-content" style={{ gap: 9, height: 46, padding: '0 20px', borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--content-secondary)', fontSize: 14, fontWeight: 600 }}>
                  {svg(<><circle cx="12" cy="12" r="9" /><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" /></>, 15, 1.8)}
                  Take the 60-second tour
                </button>
              </div>
            </div>

            {/* live transform demo */}
            <div style={{ flex: 1, minWidth: 440 }}>
              <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'color-mix(in oklch, var(--surface) 86%, transparent)', backdropFilter: 'blur(8px)', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>
                <div className="flex items-center" style={{ height: 38, gap: 9, padding: '0 14px', borderBottom: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--content-secondary)' }}>Live transform</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--content-faint)' }}>· {example.label}</span>
                  <div className="flex-1" />
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--accent)' }}>{done ? '✓ ok' : '●'}</span>
                </div>
                {/* input */}
                <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--line-subtle)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--content-faint)', marginBottom: 6 }}>Input · {example.inType}</div>
                  <pre style={{ margin: 0, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.55, color: 'var(--content-secondary)', whiteSpace: 'pre-wrap' }}>{example.in}</pre>
                </div>
                {/* script */}
                <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--line-subtle)', background: 'color-mix(in oklch, var(--accent) 5%, transparent)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>DataWeave</div>
                  <pre style={{ margin: 0, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.55, color: 'var(--content)', whiteSpace: 'pre-wrap' }}>{example.script}</pre>
                </div>
                {/* output */}
                <div style={{ padding: '11px 14px' }}>
                  <div className="flex items-center" style={{ gap: 7, marginBottom: 6 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--content-faint)' }}>Output · application/json</div>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 5, color: done ? 'var(--accent)' : 'var(--content-faint)', background: done ? 'color-mix(in oklch, var(--accent) 14%, transparent)' : 'var(--surface-2)', border: '1px solid ' + (done ? 'var(--accent-border)' : 'var(--line)') }}>{done ? 'ran in ' + (40 + ex * 9) + ' ms' : 'running…'}</span>
                  </div>
                  <pre style={{ margin: 0, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.55, color: 'var(--accent)', whiteSpace: 'pre-wrap', minHeight: 64 }}>{shown}{!done && <span style={{ display: 'inline-block', width: 7, height: 13, marginLeft: 1, transform: 'translateY(2px)', background: 'var(--accent)', animation: anim('wBlink 1s steps(1) infinite') }} />}</pre>
                </div>
              </div>
            </div>
          </div>

          {/* bento */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 22 }}>
            {BENTO.map((c) => {
              const isNew = c.tag === 'NEW';
              return (
                <div key={c.key} className="transition-transform" style={{ position: 'relative', overflow: 'hidden', padding: '16px 17px', borderRadius: 14, background: isNew ? 'linear-gradient(150deg, color-mix(in oklch, var(--accent) 14%, var(--surface)), var(--surface))' : 'var(--surface)', border: '1px solid ' + (isNew ? 'var(--accent-border)' : 'var(--line)') }}>
                  <div className="flex items-center" style={{ gap: 9, marginBottom: 11 }}>
                    <span className="grid place-items-center" style={{ width: 30, height: 30, borderRadius: 9, color: isNew ? 'var(--accent)' : 'var(--content-secondary)', background: isNew ? 'color-mix(in oklch, var(--accent) 16%, transparent)' : 'var(--surface-2)', border: '1px solid ' + (isNew ? 'var(--accent-border)' : 'var(--line)') }}>{c.icon}</span>
                    {c.tag && <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.7, padding: '2px 7px', borderRadius: 5, color: 'var(--accent-ink)', background: 'var(--accent)' }}>{c.tag}</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>{c.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--content-muted)', marginTop: 4, lineHeight: 1.5 }}>{c.desc}</div>
                </div>
              );
            })}
          </div>

          {/* footer chips */}
          <div className="flex items-center flex-wrap" style={{ marginTop: 20, gap: 10, fontSize: 11.5, color: 'var(--content-faint)' }}>
            {CHIPS.map((t) => (
              <span key={t} className="inline-flex items-center" style={{ gap: 6, padding: '5px 11px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />{t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
