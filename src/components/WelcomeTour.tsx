/**
 * Guided spotlight tour — dims the app and cuts a hole around the real element
 * each step describes, with a callout anchored beside it. Ported from the Claude
 * Design "Spotlight Tour" mock, using the app's real `data-tour` anchors + theme
 * tokens. Steps whose anchor isn't on screen are skipped (so e.g. the MCP step
 * shows up only once that rail button exists).
 *
 * Same contract as before — App renders <WelcomeTour onComplete={…}/> off the
 * `showTour` flag; onComplete fires on Done or Skip.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';

interface WelcomeTourProps {
  onComplete: () => void;
}

type Side = 'right' | 'left' | 'bottom' | 'top';
interface Step {
  sel: string;       // data-tour value
  side: Side;
  kicker: string;
  title: string;
  desc: string;
  tip?: string;
  tag?: string;
}

const STEPS: Step[] = [
  { sel: 'palette', side: 'bottom', kicker: 'Command palette', title: 'Everything, one keystroke away',
    desc: 'Press ⌘K to run, save, open a tool, switch theme or jump anywhere without leaving the keyboard.',
    tip: '⌘/ lists every shortcut · ⌘B toggles the sidebar.' },
  { sel: 'payload', side: 'right', kicker: 'Input', title: 'Feed it real data',
    desc: 'Paste a payload, pick its MIME type (JSON, XML, CSV, YAML…), or attach files. Add named inputs here for multi-source transforms.',
    tip: 'Drop a file straight onto this pane to load larger samples from disk.' },
  { sel: 'context-panel', side: 'right', kicker: 'Context', title: 'vars, headers and properties',
    desc: 'Set flow variables, attributes, query params and config properties in a form — no scenario files to hand-write. ${secure::key} values decrypt locally too.' },
  { sel: 'script-editor', side: 'right', kicker: 'Editor', title: 'A real language service, not guesswork',
    desc: 'The editor talks to MuleSoft’s own DataWeave language service: completion that knows your payload’s actual fields, hover types, signature help, go-to-definition (F12), find references (⇧F12), rename (F2), an outline, folding and quick fixes.',
    tip: 'Errors underline as you type — the same checker the runtime uses, not a lookalike.' },
  { sel: 'run-controls', side: 'bottom', kicker: 'Run', title: 'It runs as you type',
    desc: 'Auto-run is on, so the output re-renders about a second after you stop typing — no button to press. Everything runs on the bundled DataWeave 2.12 engine, on your machine. Run also follows the pane you are in: the script, or the test suite.',
    tip: '⌘↵ runs on demand. The caret beside Run holds auto-run and value trace if you want either off.' },
  { sel: 'output', side: 'left', kicker: 'Output', title: 'See it instantly',
    desc: 'Results render here as formatted JSON, XML or text — copy or export in one click. Errors show the exact line, a source snippet and a collapsible stack trace.' },
  { sel: 'output', side: 'left', kicker: 'Trace', tag: 'NEW', title: 'Every value, without a single log()',
    desc: 'Under the output is a Trace panel listing what each expression in your script evaluated to, in source order — click a row to jump to it. A map body that ran 500 times is one row with a count, not 500 rows, and when a script fails you get everything it worked out before the throw.',
    tip: 'On by default. It replaces wrapping things in log() and then having to take them back out.' },
  { sel: 'debug', side: 'bottom', kicker: 'Debugger', tag: 'NEW', title: 'Stop on a line and look around',
    desc: 'Click the gutter beside a line number to set a breakpoint, then press Debug. The script parks there and you get the call stack, every variable in scope, step over / into / out, and a box to evaluate any expression against the paused frame.',
    tip: 'Press Debug again to detach.' },
  { sel: 'target-runtime', side: 'top', kicker: 'Target runtime', tag: 'NEW', title: 'Check against the Mule you deploy to',
    desc: 'The engine here is the newest DataWeave. The status bar says what you are compiling against — point it at your actual runtime and anything too new, a 2.10 function on Mule 4.4 say, fails here instead of on the server.',
    tip: 'Click it to change. Set once, applies everywhere; Settings → Runtime can make it per-workspace.' },
  { sel: 'pane-switch', side: 'bottom', kicker: 'Tests', tag: 'NEW', title: 'Real dw::test suites',
    desc: 'Write named assertions with the same testing framework MuleSoft ships, and run them against the bundled engine. Failures come back with the engine’s own message and the line that failed.' },
  { sel: 'share', side: 'bottom', kicker: 'Share', title: 'Send the whole setup as a link',
    desc: 'One click copies a link carrying the script, the payload, the context and the target runtime — compressed into the URL itself, so nothing is uploaded anywhere. Whoever opens it lands on exactly your setup.',
    tip: '⌘K → “share” copies the whole workspace instead of one request.' },
  { sel: 'rail-config-crypto', side: 'right', kicker: 'Config encryption', tag: 'NEW', title: 'Secure a whole config, not one value',
    desc: 'Paste a YAML or .properties config and encrypt every value at once — or decrypt one to read it. Values already written as ![…] are left alone, comments and layout survive, and every field is listed with what will happen to it before anything runs.',
    tip: 'The single-value Secure Properties tool is still there, one icon up.' },
  { sel: 'rail-ref', side: 'right', kicker: 'Function reference', title: '361 DataWeave functions',
    desc: 'Browse and search the full DataWeave standard library with signatures and examples — the same docs that power the editor’s autocomplete and hover cards. Now including dw::test::Asserts and the file module, which MuleSoft’s own docs leave out.' },
  { sel: 'rail-flow', side: 'right', kicker: 'Message flows', title: 'Chain transforms into a pipeline',
    desc: 'The visual Message Flow designer links several transforms end-to-end — model a real integration where one step’s output feeds the next.' },
  { sel: 'rail-java', side: 'right', kicker: 'Java tester', title: 'Run your own Java',
    desc: 'Compile the src/main/java classes a Mule app calls and exercise them against a payload — manage the JAR dependencies right here.' },
  { sel: 'rail-mcp', side: 'right', kicker: 'Local server', title: 'Serve your engine to AI agents',
    desc: 'Turn Studio’s runtime into a tool for Claude, Cursor and Copilot. An agent writes a script, runs it here to get the real error, fixes it, and hands you tested code.',
    tip: 'Safe mode is on by default — agents can transform data but can’t touch Java or the filesystem.' },
  { sel: 'sidebar', side: 'right', kicker: 'Toolbox', title: 'It all lives in the rail',
    desc: 'Function reference, cookbook, flows, the Java tester, your module library, secure properties, config encryption, compare and the OpenAPI reader all dock from the left rail. ⌘B toggles it; ⌘K opens any of them by name.',
    tip: 'You’re ready — close this and start transforming.' },
];

const PAD = 7;
const CALLOUT_W = 332;
const GAP = 18;
const MARGIN = 16;

interface Rect { top: number; left: number; width: number; height: number; }
const rectOf = (sel: string): Rect | null => {
  const el = document.querySelector(`[data-tour="${sel}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

export function WelcomeTour({ onComplete }: WelcomeTourProps) {
  // Only steps whose anchor is actually on screen.
  const steps = useMemo(() => STEPS.filter((s) => rectOf(s.sel) !== null), []);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  const step = steps[i];

  const measure = useCallback(() => {
    if (!step) return;
    setRect(rectOf(step.sel));
  }, [step]);

  useEffect(() => {
    measure();
    const id = requestAnimationFrame(measure); // after layout settles
    return () => cancelAnimationFrame(id);
  }, [measure]);

  useEffect(() => {
    const onResize = () => { setVp({ w: window.innerWidth, h: window.innerHeight }); measure(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', measure, true); };
  }, [measure]);

  const next = useCallback(() => { if (i < steps.length - 1) setI(i + 1); else onComplete(); }, [i, steps.length, onComplete]);
  const back = useCallback(() => { if (i > 0) setI(i - 1); }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onComplete(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onComplete]);

  if (!step || !rect) {
    // Nothing to anchor to — don't trap the user behind a blank scrim.
    return null;
  }

  // ── ring (cutout) ──
  const rt = rect.top - PAD, rl = rect.left - PAD, rw = rect.width + PAD * 2, rh = rect.height + PAD * 2;

  // ── callout position ──
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  let left = 0, top = 0, tx = '0', ty = '0';
  let side = step.side;
  if (side === 'right') { left = rect.left + rect.width + GAP; top = cy; ty = '-50%'; if (left + CALLOUT_W > vp.w - MARGIN) { left = rect.left - GAP; tx = '-100%'; } }
  else if (side === 'left') { left = rect.left - GAP; top = cy; tx = '-100%'; ty = '-50%'; if (left - CALLOUT_W < MARGIN) { left = rect.left + rect.width + GAP; tx = '0'; } }
  else if (side === 'bottom') { left = cx; top = rect.top + rect.height + GAP; tx = '-50%'; }
  else { left = cx; top = rect.top - GAP; tx = '-50%'; ty = '-100%'; }
  if (side === 'bottom' || side === 'top') left = Math.max(MARGIN + CALLOUT_W / 2, Math.min(left, vp.w - MARGIN - CALLOUT_W / 2));
  else top = Math.max(MARGIN + 90, Math.min(top, vp.h - MARGIN - 90));

  const accent = 'var(--accent)';
  const isLast = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[130]" style={{ fontSize: 13 }}>
      <style>{`@keyframes spPop { from { opacity:0; transform: translate(var(--tx,0), calc(var(--ty,0) + 9px)) } to { opacity:1; transform: translate(var(--tx,0), var(--ty,0)) } }`}</style>

      {/* backdrop — swallow clicks so the app underneath isn't touched mid-tour */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* cutout ring */}
      <div style={{
        position: 'fixed', top: rt, left: rl, width: rw, height: rh, borderRadius: 12, pointerEvents: 'none', zIndex: 1,
        boxShadow: '0 0 0 9999px color-mix(in oklch, var(--bg) 80%, transparent)',
        outline: '2px solid var(--accent)', outlineOffset: 0,
      }} />

      {/* callout */}
      <div key={i} style={{ position: 'fixed', left, top, width: CALLOUT_W, zIndex: 2, ['--tx' as string]: tx, ['--ty' as string]: ty, transform: `translate(${tx}, ${ty})`, animation: 'spPop .3s cubic-bezier(.2,.9,.3,1) both' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 16px 14px', boxShadow: '0 26px 70px rgba(0,0,0,.55)' }}>
          {/* header */}
          <div className="flex items-center" style={{ gap: 9, marginBottom: 11 }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, fontWeight: 700, color: accent }}>{String(i + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</span>
            <span style={{ height: 13, width: 1, background: 'var(--line)' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--content-faint)' }}>{step.kicker}</span>
            {step.tag && <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.6, padding: '2px 6px', borderRadius: 5, color: 'var(--accent-ink)', background: accent }}>{step.tag}</span>}
            <div className="flex-1" />
            <button onClick={onComplete} className="grid place-items-center cursor-pointer hover:text-content" style={{ width: 24, height: 24, border: 'none', background: 'transparent', borderRadius: 6, color: 'var(--content-faint)' }} title="Skip tour (Esc)">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div style={{ fontSize: 17.5, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.18 }}>{step.title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--content-secondary)', lineHeight: 1.6, marginTop: 8 }}>{step.desc}</div>
          {step.tip && (
            <div className="flex" style={{ marginTop: 12, gap: 9, padding: '9px 11px', borderRadius: 9, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}>
              <span style={{ color: accent, flexShrink: 0, marginTop: 1 }}><svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><path d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /></svg></span>
              <span style={{ fontSize: 11, color: accent, lineHeight: 1.55 }}>{step.tip}</span>
            </div>
          )}
          {/* footer */}
          <div className="flex items-center" style={{ marginTop: 16 }}>
            <div className="flex" style={{ gap: 5 }}>
              {steps.map((_, n) => (
                <button key={n} onClick={() => setI(n)} className="cursor-pointer" style={{ height: 6, width: n === i ? 18 : 6, borderRadius: 999, border: 'none', padding: 0, transition: 'width .25s', background: n === i ? accent : (n < i ? 'var(--accent-border)' : 'var(--line)') }} />
              ))}
            </div>
            <div className="flex-1" />
            <div className="flex items-center" style={{ gap: 8 }}>
              {i > 0 && <button onClick={back} className="cursor-pointer hover:text-content" style={{ height: 32, padding: '0 13px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--content-secondary)', fontSize: 12, fontWeight: 600 }}>Back</button>}
              <button onClick={next} className="cursor-pointer" style={{ height: 32, padding: '0 17px', borderRadius: 8, border: '1px solid var(--accent)', background: accent, color: 'var(--accent-ink)', fontSize: 12, fontWeight: 600, boxShadow: '0 6px 18px color-mix(in oklch, var(--accent) 30%, transparent)' }}>{isLast ? 'Done' : 'Next'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
