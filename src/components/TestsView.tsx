/**
 * The Tests panel: write a `dw::test` suite, run it, read the report.
 *
 * This replaces the snapshot runner. That one ran the request's script against
 * a stored payload and diffed the result against a captured blob, which only
 * ever answered "did the output change" — and the capture went stale the moment
 * the transform legitimately changed, so a red panel usually meant "re-capture"
 * rather than "you broke something".
 *
 * `dw::test` is the real thing MuleSoft ships: named assertions, proper failure
 * messages, and source locations, so a failure points at the line that failed
 * instead of at a diff you have to read yourself.
 *
 * Worth knowing about the model: dw::test exercises FUNCTIONS. A request's
 * script is a transform, not a module of functions, so a suite either defines
 * what it tests inline or imports from the Module library. The empty state says
 * so, because that is the first thing anyone hits.
 */
import { useCallback } from 'react';
import { MiniEditor } from './MiniEditor';
import { Icons } from './Icons';
import { Request } from '../types';
import { useTestRunner, DWTestNode, isLeaf, tally } from '../hooks/useTestRunner';

const STARTER = [
  '%dw 2.0',
  'import * from dw::test::Tests',
  'import * from dw::test::Asserts',
  '---',
  '"my transform" describedBy [',
  '    "adds correctly" in do {',
  '        (1 + 1) must equalTo(2)',
  '    },',
  ']',
].join('\n');

interface TestsViewProps {
  request: Request;
  /** Target runtime in force, so a suite is gated exactly like a Run is. */
  languageLevel: string;
  onTestScriptChange: (script: string) => void;
}

export function TestsView({ request, languageLevel, onTestScriptChange }: TestsViewProps) {
  const { result, running, runSuite } = useTestRunner();

  const run = useCallback(() => { void runSuite(request, languageLevel); }, [runSuite, request, languageLevel]);
  const hasSuite = !!(request.testScript ?? '').trim();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* header */}
      <div
        className="h-[30px] shrink-0 flex items-center gap-2 px-3.5 border-b"
        style={{ borderColor: 'var(--line-secondary)' }}
      >
        <Icons.Activity size={11} />
        <span className="text-[11.5px] font-medium" style={{ color: 'var(--content-secondary)' }}>
          Tests
        </span>
        <span className="flex-1" />

        {result.root && (
          <div className="flex items-center gap-2 text-[10.5px] font-mono">
            <span style={{ color: result.failed ? 'var(--err)' : 'var(--accent)' }}>
              {result.passed} passed
            </span>
            {result.failed > 0 && <span style={{ color: 'var(--err)' }}>{result.failed} failed</span>}
            <span style={{ color: 'var(--content-ghost)' }}>{result.timeMs}ms</span>
          </div>
        )}

        <button
          onClick={run}
          disabled={running || !hasSuite}
          className="inline-flex items-center gap-1.5 h-[21px] px-2.5 rounded text-[11px] font-medium cursor-pointer"
          style={{
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            color: hasSuite ? 'var(--content-secondary)' : 'var(--content-ghost)',
            opacity: running ? 0.6 : 1,
          }}
          title={hasSuite ? 'Run this suite' : 'Write a suite first'}
        >
          {running ? 'Running…' : 'Run tests'}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* suite source */}
        <div className="flex flex-col overflow-hidden" style={{ flex: '1 1 55%', minWidth: 0 }}>
          {hasSuite ? (
            <MiniEditor
              value={request.testScript ?? ''}
              onChange={onTestScriptChange}
              language="dataweave"
              height="100%"
            />
          ) : (
            <EmptyState onInsert={() => onTestScriptChange(STARTER)} />
          )}
        </div>

        {/* report */}
        <div
          className="flex flex-col overflow-auto border-l"
          style={{ flex: '1 1 45%', minWidth: 0, borderColor: 'var(--line-secondary)' }}
        >
          <Report result={result} running={running} hasSuite={hasSuite} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onInsert }: { onInsert: () => void }) {
  return (
    <div className="flex-1 grid place-items-center" style={{ padding: 24 }}>
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--content)', marginBottom: 6 }}>
          No test suite yet
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--content-muted)' }}>
          Tests here are real <b>dw::test</b> suites, run by the bundled engine — the same
          framework MuleSoft ships. You get named assertions, proper failure messages, and a
          line number for whatever failed.
          <br /><br />
          One thing to know up front: dw::test exercises <b>functions</b>. A request&rsquo;s
          script is a transform rather than a module, so a suite either defines what it tests
          inline or imports from your Module library.
        </div>
        <button
          onClick={onInsert}
          className="inline-flex items-center cursor-pointer"
          style={{
            marginTop: 16, height: 28, padding: '0 14px',
            border: '1px solid var(--line)', background: 'var(--surface)',
            color: 'var(--content-secondary)', borderRadius: 8,
            fontSize: 12, fontWeight: 600,
          }}
        >
          Start from a template
        </button>
      </div>
    </div>
  );
}

function Report({
  result, running, hasSuite,
}: { result: ReturnType<typeof useTestRunner>['result']; running: boolean; hasSuite: boolean }) {
  if (result.error) {
    return (
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--err)', marginBottom: 6 }}>
          The suite didn&rsquo;t run
          {result.errorLine != null && (
            <span style={{ fontFamily: 'monospace', fontWeight: 400 }}> · line {result.errorLine}</span>
          )}
        </div>
        <pre
          style={{
            margin: 0, fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', color: 'var(--content-muted)', userSelect: 'text',
          }}
        >
          {result.error}
        </pre>
      </div>
    );
  }

  if (!result.root) {
    return (
      <div className="flex-1 grid place-items-center" style={{ padding: 20 }}>
        <div style={{ fontSize: 11.5, color: 'var(--content-ghost)', textAlign: 'center' }}>
          {running ? 'Running…' : hasSuite ? 'Run the suite to see results.' : 'Nothing to run yet.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 4px 14px' }}>
      <Node node={result.root} depth={0} />
    </div>
  );
}

function Node({ node, depth }: { node: DWTestNode; depth: number }) {
  const leaf = isLeaf(node);
  const counts = tally(node);
  const failed = leaf ? node.status !== 'OK' : counts.failed > 0;
  const line = node.location?.start?.line;

  return (
    <div>
      <div
        className="flex items-start gap-2"
        style={{ padding: '3px 12px', paddingLeft: 12 + depth * 14 }}
      >
        <span style={{ marginTop: 2, color: failed ? 'var(--err)' : 'var(--accent)' }}>
          {leaf
            ? (failed ? <Cross /> : <Tick />)
            : <span style={{ fontSize: 10, color: 'var(--content-ghost)' }}>▾</span>}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-baseline gap-2">
            <span
              style={{
                fontSize: 11.5,
                color: leaf ? 'var(--content-secondary)' : 'var(--content)',
                fontWeight: leaf ? 400 : 600,
              }}
            >
              {node.name}
            </span>
            {!leaf && (
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--content-ghost)' }}>
                {counts.passed}/{counts.passed + counts.failed}
              </span>
            )}
            {leaf && typeof node.time === 'number' && (
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--content-ghost)' }}>
                {node.time}ms
              </span>
            )}
          </div>

          {leaf && failed && node.errorMessage && (
            <pre
              style={{
                margin: '4px 0 6px', padding: '7px 9px',
                background: 'color-mix(in oklch, var(--err) 8%, transparent)',
                border: '1px solid color-mix(in oklch, var(--err) 26%, transparent)',
                borderRadius: 7, fontSize: 10.5, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: 'var(--content-secondary)', userSelect: 'text',
              }}
            >
              {node.errorMessage}
              {line != null && (
                <span style={{ color: 'var(--content-ghost)' }}>{'\n'}at line {line}</span>
              )}
            </pre>
          )}
        </div>
      </div>

      {!leaf && (node.tests ?? []).map((child, i) => (
        <Node key={`${child.name}-${i}`} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

const Tick = () => (
  <svg width={11} height={11} viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.485 3.929a1 1 0 01.036 1.414l-6 6.5a1 1 0 01-1.45.022l-3-3a1 1 0 111.414-1.414L6.95 9.915l5.293-5.95a1 1 0 011.242-.036z" />
  </svg>
);

const Cross = () => (
  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
