import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from './Icons';
import { Request, TestCase } from '../types';
import { useTestRunner, TestRunOutcome } from '../hooks/useTestRunner';
import { diffJson, DiffLine } from '../jsonDiff';
import { MiniEditor } from './MiniEditor';

interface TestsViewProps {
  request: Request;
  /** Update the request's tests array — used to add / remove / capture. */
  onTestsChange: (tests: TestCase[]) => void;
  /** Update the request's DataWeave script. The script is shared between
   *  Script mode and Tests mode — editing it here updates both. */
  onScriptChange: (script: string) => void;
}

/**
 * Tests pane — fills the same area as the script editor when the user
 * toggles into Tests mode. Left column is the test list + summary, right
 * column changes shape based on what's selected: overview when nothing,
 * passing/failing detail for a selected test, or a "capture expected" CTA
 * for tests that haven't been snapshotted yet.
 */
export function TestsView({ request, onTestsChange, onScriptChange }: TestsViewProps) {
  const { outcomes, running, runOne, runAll, reset, setOutcome } = useTestRunner();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'fail' | 'untested'>('all');

  // When the request changes, clear in-memory outcomes — they belonged to
  // the previous request and would be misleading.
  useEffect(() => { reset(); setSelectedId(null); }, [request.id, reset]);

  // Derived status per test: prefer the in-memory outcome from this
  // session (just ran) over the persisted lastStatus.
  const statusFor = (t: TestCase): 'pass' | 'fail' | 'untested' => {
    const o = outcomes[t.id];
    if (o) return o.status;
    if (t.lastStatus === 'pass' || t.lastStatus === 'fail') return t.lastStatus;
    if (!t.expectedOutput) return 'untested';
    return 'untested';
  };

  const timeFor = (t: TestCase): string | null => {
    const o = outcomes[t.id];
    if (o) return `${o.timeMs}ms`;
    if (t.lastTimeMs !== undefined) return `${t.lastTimeMs}ms`;
    return null;
  };

  const counts = useMemo(() => {
    let pass = 0; let fail = 0; let untested = 0;
    for (const t of request.tests) {
      const s = statusFor(t);
      if (s === 'pass') pass++;
      else if (s === 'fail') fail++;
      else untested++;
    }
    return { pass, fail, untested, total: request.tests.length };
  }, [request.tests, outcomes]);

  const filtered = useMemo(() => {
    if (filter === 'all') return request.tests;
    if (filter === 'fail') return request.tests.filter((t) => statusFor(t) === 'fail');
    return request.tests.filter((t) => statusFor(t) === 'untested');
  }, [request.tests, filter, outcomes]);

  const selected = selectedId ? request.tests.find((t) => t.id === selectedId) ?? null : null;

  // === Mutations ===
  const addBlankTest = () => {
    const id = `test-${Date.now().toString(16)}${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')}`;
    const t: TestCase = {
      id,
      name: `Test ${request.tests.length + 1}`,
      payload: request.payload, // seed with the current payload as a starting point
      payloadMimeType: request.payloadMimeType,
      expectedOutput: undefined,
      comparator: 'semantic-json',
    };
    onTestsChange([...request.tests, t]);
    setSelectedId(id);
  };

  const renameTest = (id: string, name: string) => {
    onTestsChange(request.tests.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const removeTest = (id: string) => {
    onTestsChange(request.tests.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const setExpected = (id: string, expected: string | undefined) => {
    // Capturing must also resolve the stale pre-capture outcome: after
    // "Run & capture" the runner recorded a fail ("no expected output set"),
    // and without this the row keeps showing a red FAIL right after the user
    // saved the expected output — until they manually re-run.
    const o = outcomes[id];
    const justCaptured = expected !== undefined && o?.actualOutput !== undefined && expected === o.actualOutput;
    if (justCaptured) {
      // Saved expected is byte-identical to the last actual — that's a pass.
      setOutcome(id, { status: 'pass', timeMs: o.timeMs });
      onTestsChange(request.tests.map((t) => (
        t.id === id ? { ...t, expectedOutput: expected, lastStatus: 'pass', lastTimeMs: o.timeMs } : t
      )));
    } else {
      // Manual/reset capture: outcome unknown until the next run.
      setOutcome(id, undefined);
      onTestsChange(request.tests.map((t) => (
        t.id === id ? { ...t, expectedOutput: expected, lastStatus: undefined, lastTimeMs: undefined } : t
      )));
    }
  };

  const setPayload = (id: string, payload: string) => {
    onTestsChange(request.tests.map((t) => (t.id === id ? { ...t, payload } : t)));
  };

  const persistOutcome = (id: string, outcome: TestRunOutcome) => {
    onTestsChange(request.tests.map((t) => (
      t.id === id
        ? { ...t, lastStatus: outcome.status, lastTimeMs: outcome.timeMs }
        : t
    )));
  };

  // === Empty state ===
  if (request.tests.length === 0) {
    return (
      <div
        className="flex-1 flex items-center justify-center p-8"
        style={{ background: 'var(--bg)' }}
      >
        <div className="max-w-[420px] text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
            style={{
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              border: '1px dashed var(--accent-border)',
            }}
          >
            <Icons.Activity size={22} />
          </div>
          <div className="text-[15px] font-semibold mb-2" style={{ color: 'var(--content)' }}>
            No tests yet for this request
          </div>
          <div className="text-[12.5px] leading-[1.55] mb-5" style={{ color: 'var(--content-muted)' }}>
            Add a test, run it with your current payload, then snapshot the output as
            the expected. Future runs will be auto-diffed against it.
          </div>
          <button
            onClick={addBlankTest}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md text-[12.5px] font-semibold cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            <Icons.Plus size={11} /> Add first test
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0" style={{ background: 'var(--bg)' }}>
      {/* === Left: test list === */}
      <aside
        className="w-[320px] shrink-0 flex flex-col min-h-0"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--line)' }}
      >
        {/* Summary header */}
        <div className="px-3.5 pt-3 pb-3" style={{ borderBottom: '1px solid var(--line-subtle)' }}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[12.5px] font-semibold flex-1" style={{ color: 'var(--content)' }}>
              Tests
            </span>
            <button
              onClick={addBlankTest}
              className="w-6 h-6 rounded inline-flex items-center justify-center cursor-pointer hover:bg-surface-2"
              style={{ color: 'var(--content-faint)' }}
              title="New test"
            >
              <Icons.Plus size={12} />
            </button>
          </div>
          {/* Stat bar */}
          <div className="flex gap-2.5 text-[11.5px] font-mono">
            <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
              <CheckGlyph color="var(--accent)" /> {counts.pass} passing
            </span>
            <span className="inline-flex items-center gap-1.5" style={{ color: counts.fail > 0 ? 'var(--err)' : 'var(--content-faint)' }}>
              <CrossGlyph color={counts.fail > 0 ? 'var(--err)' : 'var(--content-faint)'} /> {counts.fail} failing
            </span>
            <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--content-faint)' }}>
              <CircleGlyph color="var(--content-faint)" /> {counts.untested} not run
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1 rounded overflow-hidden flex" style={{ background: 'var(--surface-3)' }}>
            {counts.pass > 0 && <div style={{ width: `${(counts.pass / counts.total) * 100}%`, background: 'var(--accent)' }} />}
            {counts.fail > 0 && <div style={{ width: `${(counts.fail / counts.total) * 100}%`, background: 'var(--err)' }} />}
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1 px-3 pt-2.5 pb-1 flex-wrap">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')} label={`All · ${counts.total}`} />
          {counts.fail > 0 && <Chip active={filter === 'fail'} onClick={() => setFilter('fail')} label={`Failing · ${counts.fail}`} />}
          {counts.untested > 0 && <Chip active={filter === 'untested'} onClick={() => setFilter('untested')} label={`Not run · ${counts.untested}`} />}
        </div>

        {/* Test rows */}
        <div className="flex-1 overflow-y-auto px-1.5 pb-1">
          {filtered.map((t) => (
            <TestRow
              key={t.id}
              test={t}
              active={t.id === selectedId}
              status={statusFor(t)}
              time={timeFor(t)}
              isRunning={running.has(t.id)}
              onClick={() => setSelectedId(t.id)}
              onRename={(name) => renameTest(t.id, name)}
              onRemove={() => removeTest(t.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-[11.5px] py-6" style={{ color: 'var(--content-faint)' }}>
              No tests match this filter.
            </div>
          )}
        </div>

        {/* Footer with run-all button */}
        <div
          className="shrink-0 px-3 py-2 flex items-center gap-2"
          style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}
        >
          <button
            onClick={async () => {
              const outcomes = await runAll(request);
              // Persist last-known status onto each test so the badges
              // survive a workspace save/reload.
              onTestsChange(request.tests.map((t, i) => {
                const o = outcomes[i];
                if (!o) return t;
                return { ...t, lastStatus: o.status, lastTimeMs: o.timeMs };
              }));
            }}
            disabled={running.size > 0 || request.tests.length === 0}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-[12px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            title="Run all tests in this request"
          >
            <Icons.Play size={11} /> Run all tests
          </button>
        </div>
      </aside>

      {/* === Right: detail pane === */}
      {selected ? (
        <TestDetail
          test={selected}
          request={request}
          outcome={outcomes[selected.id]}
          isRunning={running.has(selected.id)}
          onRun={async () => {
            const result = await runOne(selected, request);
            persistOutcome(selected.id, result);
          }}
          onCapture={(value) => setExpected(selected.id, value)}
          onPayloadChange={(value) => setPayload(selected.id, value)}
          onScriptChange={onScriptChange}
          onRename={(name) => renameTest(selected.id, name)}
        />
      ) : (
        <TestsOverview
          counts={counts}
          onRunAll={async () => {
            const outcomes = await runAll(request);
            onTestsChange(request.tests.map((t, i) => {
              const o = outcomes[i];
              if (!o) return t;
              return { ...t, lastStatus: o.status, lastTimeMs: o.timeMs };
            }));
          }}
          isRunning={running.size > 0}
        />
      )}
    </div>
  );
}

// =====================================================================
// Subcomponents
// =====================================================================

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-2 h-6 rounded-md text-[11px] cursor-pointer transition-colors"
      style={{
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--content-muted)',
        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--line-subtle)'}`,
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function TestRow({
  test, active, status, time, isRunning, onClick, onRename, onRemove,
}: {
  test: TestCase;
  active: boolean;
  status: 'pass' | 'fail' | 'untested';
  time: string | null;
  isRunning: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(test.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.select());
  }, [editing]);

  const color =
    status === 'pass' ? 'var(--accent)' :
    status === 'fail' ? 'var(--err)' :
    'var(--content-faint)';

  return (
    <div
      onClick={() => !editing && onClick()}
      onDoubleClick={() => { setEditing(true); setDraft(test.name); }}
      className="group flex items-center gap-2.5 px-2.5 py-2 rounded-md my-0.5 cursor-pointer"
      style={{
        background: active ? 'var(--surface-3)' : 'transparent',
        borderLeft: active ? `2px solid ${color}` : '2px solid transparent',
        paddingLeft: active ? '8px' : '10px',
      }}
    >
      <span className="inline-flex w-3.5 items-center justify-center shrink-0">
        {isRunning ? (
          <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: color, borderTopColor: 'transparent' }} />
        ) : status === 'pass' ? (
          <CheckGlyph color={color} size={11} />
        ) : status === 'fail' ? (
          <CrossGlyph color={color} size={11} />
        ) : (
          <CircleGlyph color={color} size={9} />
        )}
      </span>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { if (draft.trim()) onRename(draft.trim()); setEditing(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { if (draft.trim()) onRename(draft.trim()); setEditing(false); }
              if (e.key === 'Escape') setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent outline-none text-[12.5px]"
            style={{ color: 'var(--content)' }}
            spellCheck={false}
          />
        ) : (
          <div
            className="text-[12.5px] truncate"
            style={{ color: active ? 'var(--content)' : 'var(--content-secondary)', fontWeight: active ? 500 : 400 }}
          >
            {test.name}
          </div>
        )}
        <div className="text-[10.5px] font-mono mt-px" style={{ color: 'var(--content-faint)' }}>
          {time ?? (status === 'untested' ? 'not run' : '—')}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="w-4 h-4 rounded inline-flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-surface-2 cursor-pointer"
        style={{ color: 'var(--content-faint)' }}
        title="Remove test"
      >
        <Icons.X size={9} />
      </button>
    </div>
  );
}

function TestsOverview({
  counts, onRunAll, isRunning,
}: {
  counts: { pass: number; fail: number; untested: number; total: number };
  onRunAll: () => void;
  isRunning: boolean;
}) {
  const allPass = counts.fail === 0 && counts.untested === 0 && counts.total > 0;
  const hasFailures = counts.fail > 0;
  const statusColor = allPass ? 'var(--accent)' : hasFailures ? 'var(--err)' : 'var(--warn)';
  const statusIcon = allPass ? <CheckGlyph color={statusColor} size={26} /> :
                     hasFailures ? <CrossGlyph color={statusColor} size={26} /> :
                     <WarnIcon color={statusColor} size={24} />;
  const title = allPass ? `All ${counts.total} tests passing`
              : hasFailures ? `${counts.fail} failing, ${counts.pass} passing`
              : `${counts.untested} test${counts.untested === 1 ? '' : 's'} not yet run`;
  const subtitle = allPass ? 'Every test matched its expected output.'
                 : hasFailures ? 'Check each failing test for the actual output.'
                 : 'Click Run all to execute, or pick a test to capture its expected output.';

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="px-12 py-12 max-w-[760px] mx-auto">
        <div
          className="flex items-center gap-5 p-5 rounded-xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: `color-mix(in oklch, ${statusColor} 14%, transparent)`,
              color: statusColor,
              border: `1px solid color-mix(in oklch, ${statusColor} 30%, transparent)`,
            }}
          >
            {statusIcon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-semibold" style={{ color: 'var(--content)' }}>{title}</div>
            <div className="text-[12.5px] mt-1" style={{ color: 'var(--content-muted)' }}>{subtitle}</div>
          </div>
          <button
            onClick={onRunAll}
            disabled={isRunning || counts.total === 0}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            <Icons.Play size={11} /> Run all
          </button>
        </div>

        <div
          className="mt-6 p-5 rounded-xl flex gap-3 items-start"
          style={{ background: 'var(--surface)', border: '1px dashed var(--line)' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
          >
            <Icons.Zap size={14} />
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--content)' }}>Snapshot tests, not assertions</div>
            <div className="text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--content-muted)' }}>
              For each test, run your script once with the test payload, then click
              <span className="font-semibold mx-1" style={{ color: 'var(--accent)' }}>Capture</span>
              to save the current output as the expected. Future edits to the script are auto-diffed against it.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TestDetail({
  test, request, outcome, isRunning, onRun, onCapture, onPayloadChange, onScriptChange, onRename,
}: {
  test: TestCase;
  request: Request;
  outcome: TestRunOutcome | undefined;
  isRunning: boolean;
  onRun: () => void;
  /** Pass a string to set the expected output; pass undefined to clear it. */
  onCapture: (value: string | undefined) => void;
  onPayloadChange: (value: string) => void;
  /** Update the SHARED request script. All tests use this same script —
   *  edits here also update Script mode. */
  onScriptChange: (script: string) => void;
  onRename: (name: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(test.name);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingName) requestAnimationFrame(() => nameRef.current?.select());
  }, [editingName]);

  // Resolve a "view status" from runtime + persisted state.
  const viewStatus: 'pass' | 'fail' | 'untested' =
    outcome ? outcome.status :
    test.lastStatus === 'pass' || test.lastStatus === 'fail' ? test.lastStatus :
    'untested';

  const noExpected = !test.expectedOutput;

  const statusConfig =
    viewStatus === 'pass' ? { c: 'var(--accent)', label: 'PASS', icon: <CheckGlyph color="var(--accent)" size={14} /> } :
    viewStatus === 'fail' ? { c: 'var(--err)', label: 'FAIL', icon: <CrossGlyph color="var(--err)" size={14} /> } :
    { c: 'var(--content-faint)', label: 'NOT RUN', icon: <CircleGlyph color="var(--content-faint)" size={10} /> };

  // Compute diff once we have actualOutput (failing run with both sides).
  const diff = useMemo(() => {
    if (!outcome || !outcome.actualOutput || !test.expectedOutput) return null;
    return diffJson(test.expectedOutput, outcome.actualOutput);
  }, [outcome, test.expectedOutput]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0" style={{ background: 'var(--surface)' }}>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{
            background: `color-mix(in oklch, ${statusConfig.c} 14%, transparent)`,
            border: `1px solid color-mix(in oklch, ${statusConfig.c} 30%, transparent)`,
            color: statusConfig.c,
          }}
        >
          {statusConfig.icon}
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              ref={nameRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => { if (draftName.trim()) onRename(draftName.trim()); setEditingName(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { if (draftName.trim()) onRename(draftName.trim()); setEditingName(false); }
                if (e.key === 'Escape') setEditingName(false);
              }}
              className="w-full bg-transparent outline-none text-[14px] font-semibold"
              style={{ color: 'var(--content)' }}
              spellCheck={false}
            />
          ) : (
            <div
              className="text-[14px] font-semibold cursor-text"
              style={{ color: 'var(--content)' }}
              onDoubleClick={() => { setEditingName(true); setDraftName(test.name); }}
              title="Double-click to rename"
            >
              {test.name}
            </div>
          )}
          <div className="text-[11px] mt-0.5 flex items-center gap-2.5 font-mono">
            <span style={{ color: statusConfig.c, fontWeight: 700 }}>{statusConfig.label}</span>
            {(outcome?.timeMs ?? test.lastTimeMs) !== undefined && (
              <span style={{ color: 'var(--content-faint)' }}>· {outcome?.timeMs ?? test.lastTimeMs}ms</span>
            )}
            <span style={{ color: 'var(--content-faint)' }}>· {test.comparator}</span>
          </div>
        </div>
        <button
          onClick={onRun}
          disabled={isRunning}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          <Icons.Play size={10} /> {isRunning ? 'Running…' : 'Run'}
        </button>
      </div>

      {/* Failure summary banner */}
      {viewStatus === 'fail' && outcome && (
        <div
          className="px-4 py-2.5 flex items-center gap-2.5 shrink-0"
          style={{
            background: 'color-mix(in oklch, var(--err) 8%, transparent)',
            borderBottom: '1px solid color-mix(in oklch, var(--err) 25%, transparent)',
          }}
        >
          <CrossGlyph color="var(--err)" size={13} />
          <span className="text-[12.5px] font-medium" style={{ color: 'var(--err)' }}>
            {outcome.reason || 'Output differs from expected'}
          </span>
          {outcome.errorMessage && (
            <span className="text-[11.5px] font-mono truncate" style={{ color: 'var(--content-muted)' }}>
              · {outcome.errorMessage.split('\n')[0]}
            </span>
          )}
        </div>
      )}

      {/* Body: (script / payload) | (capture | passing-output | diff)
          The left column splits vertically: the SHARED request script on
          top, this test's payload below. Edits to the script also update
          Script-mode (same underlying field). */}
      <div className="flex-1 flex min-h-0">
        {/* Left: script (top) + payload (bottom) */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0" style={{ borderRight: '1px solid var(--line)' }}>
          {/* Script */}
          <div className="flex flex-col min-h-0" style={{ flex: '1 1 50%' }}>
            <SubHeader
              title={<span>Script <span className="font-mono ml-1" style={{ color: 'var(--content-faint)' }}>(shared)</span></span>}
              right={<span className="text-[10.5px] font-mono" style={{ color: 'var(--content-faint)' }}>dw 2.0</span>}
            />
            <div className="flex-1 min-h-0">
              <MiniEditor
                language="dataweave"
                value={request.script}
                onChange={onScriptChange}
                height="100%"
              />
            </div>
          </div>
          {/* Payload */}
          <div className="flex flex-col min-h-0" style={{ flex: '1 1 50%', borderTop: '1px solid var(--line)' }}>
            <SubHeader title="Payload (input)" right={<span className="text-[10.5px] font-mono" style={{ color: 'var(--content-faint)' }}>{test.payloadMimeType}</span>} />
            <textarea
              value={test.payload}
              onChange={(e) => onPayloadChange(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full p-3 font-mono text-[12px] leading-[1.55] outline-none resize-none"
              style={{ background: 'var(--surface)', color: 'var(--content)' }}
            />
          </div>
        </div>

        {/* Right: expected / actual / diff / capture CTA */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {noExpected ? (
            <CapturePane test={test} request={request} onCapture={onCapture} isRunning={isRunning} onRun={onRun} outcome={outcome} />
          ) : viewStatus === 'fail' && diff && diff.lines.length > 0 ? (
            <DiffPane diff={diff} onRecapture={() => onCapture(outcome?.actualOutput ?? '')} hasActual={!!outcome?.actualOutput} />
          ) : (
            <PassingPane expected={test.expectedOutput || ''} viewStatus={viewStatus} onRecapture={() => onCapture(undefined)} />
          )}
        </div>
      </div>
    </div>
  );
}

function CapturePane({
  test, request, onCapture, onRun, outcome,
}: {
  test: TestCase;
  request: Request;
  onCapture: (value: string) => void;
  isRunning: boolean;
  onRun: () => void;
  outcome: TestRunOutcome | undefined;
}) {
  // If we have an actual output from a recent run, offer to capture it.
  // Otherwise, prompt for run+capture.
  const hasActual = !!outcome?.actualOutput;
  return (
    <>
      <SubHeader
        title="Expected output"
        right={<Pill color={hasActual ? 'var(--accent)' : 'var(--content-faint)'}>{hasActual ? 'READY TO CAPTURE' : 'NOT SET'}</Pill>}
      />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6" style={{ background: 'var(--bg)' }}>
        {hasActual ? (
          <>
            <pre
              className="font-mono text-[12px] p-3 rounded-md overflow-auto max-h-[280px] w-full"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                color: 'var(--content)',
              }}
            >{outcome!.actualOutput}</pre>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onCapture(outcome!.actualOutput!)}
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md text-[12.5px] font-semibold cursor-pointer"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                <Icons.Save size={11} /> Save as expected
              </button>
              <button
                onClick={onRun}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] cursor-pointer"
                style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--content-secondary)' }}
              >
                <Icons.Play size={10} /> Re-run
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
                border: '1px dashed var(--accent-border)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </div>
            <div className="text-center max-w-[320px]">
              <div className="text-[15px] font-semibold" style={{ color: 'var(--content)' }}>No expected output yet</div>
              <div className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--content-muted)' }}>
                Run the script with this payload, then snapshot the output as the expected. Future runs will be auto-diffed.
              </div>
            </div>
            <button
              onClick={onRun}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md text-[12.5px] font-semibold cursor-pointer"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              <Icons.Play size={11} /> Run &amp; capture
            </button>
            <details className="text-[11.5px]" style={{ color: 'var(--content-faint)' }}>
              <summary className="cursor-pointer">Or paste expected JSON manually</summary>
              <textarea
                placeholder='{ "expected": "..." }'
                onBlur={(e) => { if (e.target.value.trim()) onCapture(e.target.value); }}
                spellCheck={false}
                className="mt-2 w-[360px] h-[160px] p-2 font-mono text-[12px] rounded-md outline-none"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  color: 'var(--content)',
                }}
              />
            </details>
            <span className="sr-only">{test.id}/{request.id}</span>
          </>
        )}
      </div>
    </>
  );
}

function PassingPane({ expected, viewStatus, onRecapture }: { expected: string; viewStatus: string; onRecapture: () => void; }) {
  return (
    <>
      <SubHeader
        title={viewStatus === 'pass' ? <span style={{ color: 'var(--accent)' }}>Expected matches actual</span> : 'Expected output'}
        right={
          <div className="flex items-center gap-2">
            {viewStatus === 'pass' && <Pill color="var(--accent)" bold>PASS</Pill>}
            <button
              onClick={onRecapture}
              className="text-[10.5px] cursor-pointer bg-transparent border-none px-1.5 py-0.5"
              style={{ color: 'var(--content-faint)' }}
              title="Clear expected output"
            >
              Reset
            </button>
          </div>
        }
      />
      <pre
        className="flex-1 m-0 p-3 font-mono text-[12px] leading-[1.55] overflow-auto select-text"
        style={{
          background: viewStatus === 'pass' ? 'color-mix(in oklch, var(--accent) 4%, transparent)' : 'var(--surface)',
          color: 'var(--content)',
        }}
      >{expected}</pre>
    </>
  );
}

function DiffPane({
  diff, onRecapture, hasActual,
}: {
  diff: { lines: DiffLine[]; changeCount: number };
  onRecapture: () => void;
  hasActual: boolean;
}) {
  return (
    <>
      <SubHeader
        title="Expected vs Actual"
        right={
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-mono" style={{ color: 'var(--content-faint)' }}>
              <span style={{ color: 'var(--err)' }}>− Expected</span>
              <span style={{ color: 'var(--content-faint)' }}> / </span>
              <span style={{ color: 'var(--accent)' }}>+ Actual</span>
            </span>
            {hasActual && (
              <button
                onClick={onRecapture}
                className="text-[10.5px] cursor-pointer px-2 py-0.5 rounded"
                style={{
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent-border)',
                }}
                title="Snapshot the current actual output as the new expected"
              >
                Re-capture
              </button>
            )}
          </div>
        }
      />
      <div className="flex-1 overflow-auto" style={{ background: 'var(--bg)' }}>
        {diff.lines.map((l, i) => {
          const isAdd = l.type === 'add';
          const isDel = l.type === 'del';
          const bg = isAdd
            ? 'color-mix(in oklch, var(--accent) 12%, transparent)'
            : isDel
            ? 'color-mix(in oklch, var(--err) 12%, transparent)'
            : 'transparent';
          const gut = isAdd ? 'var(--accent)' : isDel ? 'var(--err)' : 'var(--content-faint)';
          const prefix = isAdd ? '+' : isDel ? '−' : ' ';
          return (
            <div
              key={i}
              className="flex items-center font-mono text-[11.5px] leading-[1.55]"
              style={{
                background: bg,
                borderLeft: isAdd || isDel ? `2px solid ${gut}` : '2px solid transparent',
                paddingLeft: 10,
                minHeight: 19,
              }}
            >
              <span
                className="inline-block text-right select-none"
                style={{ width: 26, color: gut, opacity: 0.7, fontSize: 10.5 }}
              >{l.oldNum ?? ''}</span>
              <span
                className="inline-block text-right select-none"
                style={{ width: 26, color: gut, opacity: 0.7, fontSize: 10.5, marginRight: 6 }}
              >{l.newNum ?? ''}</span>
              <span
                className="inline-block text-center select-none"
                style={{ width: 12, color: gut, fontWeight: 600 }}
              >{prefix}</span>
              <span style={{ color: 'var(--content)', whiteSpace: 'pre' }}>{l.text}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SubHeader({ title, right }: { title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div
      className="h-8 shrink-0 flex items-center px-3.5 gap-2"
      style={{ borderBottom: '1px solid var(--line-subtle)', background: 'var(--surface)' }}
    >
      <span className="text-[11.5px] font-medium flex-1" style={{ color: 'var(--content-secondary)' }}>{title}</span>
      {right}
    </div>
  );
}

function Pill({ children, color, bold }: { children: React.ReactNode; color: string; bold?: boolean }) {
  return (
    <span
      className="inline-block px-1.5 py-px rounded text-[10px] font-mono"
      style={{
        background: `color-mix(in oklch, ${color} 14%, transparent)`,
        color,
        border: `1px solid color-mix(in oklch, ${color} 30%, transparent)`,
        fontWeight: bold ? 700 : 500,
      }}
    >{children}</span>
  );
}

// ── Status glyphs ──────────────────────────────────────────────────────

function CheckGlyph({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CrossGlyph({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CircleGlyph({ color, size = 9 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: size, height: size, border: `1.5px solid ${color}` }}
    />
  );
}

function WarnIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
