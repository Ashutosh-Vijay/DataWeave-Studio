/**
 * Engine-backed language features — completion, hover, signature help,
 * go-to-definition, find-references, rename, outline, folding and type
 * diagnostics, all answered by the real DataWeave language service inside the
 * bundled engine instead of our own heuristics.
 *
 * The jar has shipped MuleSoft's full language server since day one; this asks
 * it. `payload.` returns the payload's actual fields, and a `map` lambda's
 * parameter resolves to the element type — neither of which a text-pattern
 * guess can do correctly.
 *
 * Hover and signature help register as their own providers here. Completion
 * does NOT — `dataweaveCompletions.ts` calls `engineFieldSuggestions()` for
 * dotted positions instead. Registering a second completion provider made
 * Monaco merge both answers and show every field twice, once with the engine's
 * real type and once with the heuristic's guess.
 *
 * Every failure returns null on purpose: a cold engine, a restart mid-edit or
 * an unparseable script all fall back to the static suggestions rather than
 * emptying the popup.
 */
import type * as Monaco from 'monaco-editor';
import { invoke } from './bridge';
import type { DWCompletionContext } from './dataweaveCompletions';

/** One suggestion as the engine reports it. */
interface EngineSuggestion {
  label: string;
  insertText: string;
  /** The engine's own item classification; we only use it to pick an icon. */
  itemType: number;
  type?: string;
  doc?: string;
}

/**
 * The engine is a single process behind a mutex, so overlapping queries would
 * queue up behind each other and land after the user has typed on. Keeping one
 * in flight and dropping the rest is better than a backlog of stale answers.
 */
let inFlight = false;

async function ask<T>(
  kind: string,
  script: string,
  offset: number,
  payload: string,
  languageLevel: string,
): Promise<T | null> {
  // No runtime check on purpose. `invoke` bridges to whichever host is running,
  // and an unimplemented command just rejects — which the catch turns into the
  // static-completion fallback. Guarding on isTauri would silently skip the
  // engine in VS Code even after its host implements dw_tooling.
  if (inFlight) return null;
  inFlight = true;
  try {
    return await invoke<T>('dw_tooling', { kind, script, offset, payload, languageLevel });
  } catch {
    return null; // engine cold, restarting, host doesn't implement it, or the script doesn't parse
  } finally {
    inFlight = false;
  }
}

/**
 * Same query, but for things the user explicitly asked for.
 *
 * `ask` drops a request when another is already running, which is right while
 * typing — a stale completion is worse than none. It is wrong for F12, Shift+F12
 * and F2: silently doing nothing because a background hover happened to be in
 * flight would read as the feature being broken. The engine serialises requests
 * behind its own mutex anyway, so waiting our turn costs a few ms.
 */
async function askNow<T>(
  kind: string,
  script: string,
  offset: number,
  payload: string,
  languageLevel: string,
  extra?: Record<string, unknown>,
): Promise<T | null> {
  try {
    return await invoke<T>('dw_tooling', { kind, script, offset, payload, languageLevel, ...extra });
  } catch {
    return null;
  }
}

/** Character offset of a Monaco position — what the language service wants. */
function offsetOf(model: Monaco.editor.ITextModel, position: Monaco.IPosition): number {
  return model.getOffsetAt(position);
}

/** One checker or linter finding. `code` is the engine's message class name,
 *  which reads like a lint rule id (UnusedImportModule, InvalidReferenceMessage). */
interface EngineMessage {
  severity: string;
  location: EngineLoc;
  message: string;
  code?: string;
  quickFixes?: { name: string; description: string }[];
}

/**
 * The last diagnostics computed per model, kept so the code-action provider can
 * offer fixes without paying for a second type-check.
 *
 * The script text is stored with them on purpose. Quick fixes are applied by
 * index (see applyQuickFix in DwServer.scala — a QuickFixAction is a live object
 * and cannot travel over stdio), so an index only means anything against the
 * exact text it was computed from. If the user has typed since, we would rather
 * offer nothing than rewrite the document from a stale index.
 */
const lastDiagnostics = new Map<string, { script: string; messages: EngineMessage[] }>();

/** A source range as the engine reports it. Offsets, not line/column — see the
 *  note on locJson in DwServer.scala for why. */
interface EngineLoc {
  startIndex: number;
  endIndex: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

/** Engine offsets -> a Monaco range. Null when the engine had no real location,
 *  which it reports as -1 rather than omitting the field. */
function rangeOf(model: Monaco.editor.ITextModel, loc: EngineLoc | undefined): Monaco.IRange | null {
  if (!loc || loc.startIndex < 0 || loc.endIndex < loc.startIndex) return null;
  const max = model.getValueLength();
  const a = model.getPositionAt(Math.min(loc.startIndex, max));
  const b = model.getPositionAt(Math.min(loc.endIndex, max));
  return {
    startLineNumber: a.lineNumber,
    startColumn: a.column,
    endLineNumber: b.lineNumber,
    endColumn: b.column,
  };
}

/**
 * The engine's itemType is a numeric enum. We don't need a faithful mapping —
 * a field and a function just need to look different in the popup.
 */
function iconFor(monaco: typeof Monaco, s: EngineSuggestion): Monaco.languages.CompletionItemKind {
  const K = monaco.languages.CompletionItemKind;
  if (s.type && /=>|->/.test(s.type)) return K.Function;
  return K.Field;
}

export function registerEngineLanguageFeatures(
  monaco: typeof Monaco,
  getContext: () => DWCompletionContext | null,
): Monaco.IDisposable {
  const payloadOf = () => {
    const ctx = getContext();
    // Only JSON can be turned into a type right now; anything else just means
    // no implicit input, which still gives function and keyword suggestions.
    if (!ctx || !/json/i.test(ctx.payloadMimeType || '')) return '';
    return ctx.payload || '';
  };

  // Target runtime for the editor, so completion and diagnostics agree with
  // what a Run would accept. Changing it invalidates the engine's editor cache,
  // so it is read per query rather than pushed on every keystroke.
  const levelOf = () => getContext()?.languageLevel || '';

  const hover = monaco.languages.registerHoverProvider('dataweave', {
    async provideHover(model, position) {
      const res = await ask<{ type?: string | null; doc?: string }>(
        'hover',
        model.getValue(),
        offsetOf(model, position),
        payloadOf(), levelOf(),
      );
      if (!res?.type) return null;
      const contents: Monaco.IMarkdownString[] = [{ value: '```dataweave\n' + res.type + '\n```' }];
      if (res.doc) contents.push({ value: res.doc });
      return { contents };
    },
  });

  const signature = monaco.languages.registerSignatureHelpProvider('dataweave', {
    signatureHelpTriggerCharacters: ['(', ','],

    async provideSignatureHelp(model, position) {
      const res = await ask<{ name?: string | null; activeParameter?: number; signatures?: string[] }>(
        'signature',
        model.getValue(),
        offsetOf(model, position),
        payloadOf(), levelOf(),
      );
      if (!res?.name || !res.signatures?.length) return null;
      return {
        value: {
          signatures: res.signatures.map((label) => ({ label, parameters: [] })),
          activeSignature: 0,
          activeParameter: res.activeParameter ?? 0,
        },
        dispose: () => {},
      };
    },
  });

  // ── Navigation ────────────────────────────────────────────────────────────
  // All four of these were listed as "No" against MuleSoft's extension in the
  // README's comparison table. The engine has answered them since day one; we
  // simply were not asking.

  const definition = monaco.languages.registerDefinitionProvider('dataweave', {
    async provideDefinition(model, position) {
      const res = await askNow<{ links?: { name: string; target: EngineLoc }[] }>(
        'definition',
        model.getValue(),
        offsetOf(model, position),
        payloadOf(), levelOf(),
      );
      const out: Monaco.languages.Location[] = [];
      for (const link of res?.links ?? []) {
        const range = rangeOf(model, link.target);
        if (range) out.push({ uri: model.uri, range });
      }
      return out.length ? out : null;
    },
  });

  const references = monaco.languages.registerReferenceProvider('dataweave', {
    async provideReferences(model, position) {
      const res = await askNow<{ references?: { name: string; location: EngineLoc }[] }>(
        'references',
        model.getValue(),
        offsetOf(model, position),
        payloadOf(), levelOf(),
      );
      const out: Monaco.languages.Location[] = [];
      for (const ref of res?.references ?? []) {
        const range = rangeOf(model, ref.location);
        if (range) out.push({ uri: model.uri, range });
      }
      return out.length ? out : null;
    },
  });

  const rename = monaco.languages.registerRenameProvider('dataweave', {
    async provideRenameEdits(model, position, newName) {
      // The engine resolves the symbol through its scope graph, so a name that
      // is shadowed in an inner scope is correctly left alone — which is the
      // whole reason to ask it instead of running a find-and-replace.
      const res = await askNow<{ references?: { name: string; location: EngineLoc }[] }>(
        'rename',
        model.getValue(),
        offsetOf(model, position),
        payloadOf(), levelOf(),
        { newName },
      );
      const edits: Monaco.languages.IWorkspaceTextEdit[] = [];
      for (const ref of res?.references ?? []) {
        const range = rangeOf(model, ref.location);
        if (range) {
          edits.push({
            resource: model.uri,
            textEdit: { range, text: newName },
            versionId: model.getVersionId(),
          });
        }
      }
      if (!edits.length) {
        return { edits: [], rejectReason: 'Nothing here can be renamed.' };
      }
      return { edits };
    },
  });

  const symbols = monaco.languages.registerDocumentSymbolProvider('dataweave', {
    displayName: 'DataWeave',
    async provideDocumentSymbols(model) {
      const res = await askNow<{
        symbols?: { name: string; kind: number; location: EngineLoc; container?: string }[];
      }>('documentSymbol', model.getValue(), 0, payloadOf(), levelOf());
      const out: Monaco.languages.DocumentSymbol[] = [];
      for (const sym of res?.symbols ?? []) {
        const range = rangeOf(model, sym.location);
        if (!range) continue;
        out.push({
          name: sym.name,
          detail: sym.container ?? '',
          // The engine numbers symbol kinds exactly as LSP does (File = 1);
          // Monaco's enum is the same list zero-based.
          kind: Math.max(0, sym.kind - 1) as Monaco.languages.SymbolKind,
          tags: [],
          range,
          selectionRange: range,
        });
      }
      return out;
    },
  });

  const folding = monaco.languages.registerFoldingRangeProvider('dataweave', {
    async provideFoldingRanges(model) {
      const res = await askNow<{ regions?: { kind: number; location: EngineLoc }[] }>(
        'folding',
        model.getValue(),
        0,
        payloadOf(), levelOf(),
      );
      const out: Monaco.languages.FoldingRange[] = [];
      for (const region of res?.regions ?? []) {
        const range = rangeOf(model, region.location);
        // A region confined to one line has nothing to fold.
        if (!range || range.endLineNumber <= range.startLineNumber) continue;
        out.push({
          start: range.startLineNumber,
          end: range.endLineNumber,
          // RegionKind.COMMENTS === 0 upstream; everything else folds as a region.
          kind:
            region.kind === 0
              ? monaco.languages.FoldingRangeKind.Comment
              : region.kind === 6
                ? monaco.languages.FoldingRangeKind.Imports
                : monaco.languages.FoldingRangeKind.Region,
        });
      }
      return out;
    },
  });

  // ── Quick fixes and refactorings ──────────────────────────────────────────
  // Both arrive as code actions (the lightbulb). Neither carries an `edit` when
  // first offered: computing one means asking the engine to actually perform the
  // change, and building the menu would then cost one round-trip per available
  // fix. Monaco calls resolveCodeAction only for the action the user picks, so
  // the cost is paid once and only when it is really wanted.
  const actions = monaco.languages.registerCodeActionProvider('dataweave', {
    provideCodeActions(model, range) {
      const out: DWCodeAction[] = [];
      const cached = lastDiagnostics.get(model.uri.toString());

      // Fixes for any finding the cursor or selection touches.
      if (cached && cached.script === model.getValue()) {
        cached.messages.forEach((m, messageIndex) => {
          if (!m.quickFixes?.length) return;
          const at = rangeOf(model, m.location);
          if (!at || !monaco.Range.areIntersectingOrTouching(at, range)) return;
          m.quickFixes.forEach((fix, fixIndex) => {
            out.push({
              title: fix.name,
              kind: 'quickfix',
              isPreferred: fixIndex === 0,
              __dw: { op: 'quickfix', script: cached.script, messageIndex, fixIndex },
            });
          });
        });
      }

      // Documentation only applies to a function declaration. The engine returns
      // nothing for anything else, and a menu entry that silently does nothing is
      // worse than no entry, so check the line before offering it rather than
      // spending a round-trip to find out.
      const lineText = model.getLineContent(range.startLineNumber);
      if (/^\s*fun\s+[A-Za-z_$][\w$]*/.test(lineText)) {
        out.push({
          title: 'Generate documentation comment',
          kind: 'refactor.rewrite',
          __dw: { op: 'docs', script: model.getValue(), line: range.startLineNumber },
        });
      }

      // Extract only makes sense over a real selection.
      if (!range.isEmpty()) {
        const start = model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn });
        const end = model.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn });
        // The engine offers extractConstant too, but it currently produces the
        // same `var` declaration as extractVariable, so listing both would just
        // be two menu entries that do one thing.
        out.push({
          title: 'Extract to variable',
          kind: 'refactor.extract',
          __dw: { op: 'refactor', refactor: 'variable', script: model.getValue(), start, end },
        });
        out.push({
          title: 'Extract to function',
          kind: 'refactor.extract',
          __dw: { op: 'refactor', refactor: 'function', script: model.getValue(), start, end },
        });
      }

      return { actions: out, dispose: () => {} };
    },

    async resolveCodeAction(codeAction) {
      const action = codeAction as DWCodeAction;
      const req = action.__dw;
      if (!req) return codeAction;

      const model = monaco.editor.getModels().find((m) => m.getValue() === req.script);
      if (!model) return codeAction;

      // Docs are the odd one out: the engine hands back just the comment, not a
      // rewritten document, so this is an insert rather than a whole-file swap.
      if (req.op === 'docs') {
        const lineStart = model.getOffsetAt({ lineNumber: req.line, column: 1 });
        const lineEnd = lineStart + model.getLineLength(req.line);
        const res = await askNow<{ docs?: string | null }>('scaffoldDocs', req.script, lineStart, payloadOf(), levelOf(), {
          start: lineStart,
          end: lineEnd,
        });
        if (!res?.docs) return codeAction;
        // The scaffold arrives with a leading blank line and trailing padding,
        // and knows nothing about where it will land - so match the function's
        // own indentation here.
        const indent = /^\s*/.exec(model.getLineContent(req.line))?.[0] ?? '';
        const body = res.docs
          .replace(/^\r?\n/, '')
          .replace(/[ \t]+$/gm, '')
          .replace(/\s+$/, '')
          .split(/\r?\n/)
          .map((l) => (l ? indent + l : l))
          .join('\n');
        codeAction.edit = {
          edits: [
            {
              resource: model.uri,
              textEdit: {
                range: {
                  startLineNumber: req.line,
                  startColumn: 1,
                  endLineNumber: req.line,
                  endColumn: 1,
                },
                text: body + '\n',
              },
              versionId: model.getVersionId(),
            },
          ],
        };
        return codeAction;
      }

      const res =
        req.op === 'quickfix'
          ? await askNow<{ script?: string }>('applyQuickFix', req.script, 0, payloadOf(), levelOf(), {
              messageIndex: req.messageIndex,
              fixIndex: req.fixIndex,
            })
          : await askNow<{ script?: string }>('refactor', req.script, 0, payloadOf(), levelOf(), {
              refactor: req.refactor,
              start: req.start,
              end: req.end,
            });
      if (!res?.script) return codeAction;

      // Quick fixes and refactors rewrite whole documents rather than emitting
      // patches, so those are a full replace. Monaco still records one undo step.
      codeAction.edit = {
        edits: [
          {
            resource: model.uri,
            textEdit: { range: model.getFullModelRange(), text: res.script },
            versionId: model.getVersionId(),
          },
        ],
      };
      return codeAction;
    },
  },
  // Declared on the registration rather than the provider: Monaco uses this to
  // decide whether to even ask us when a menu is filtered to one kind.
  { providedCodeActionKinds: ['quickfix', 'refactor.extract', 'refactor.rewrite'] });

  return {
    dispose() {
      hover.dispose();
      signature.dispose();
      definition.dispose();
      references.dispose();
      rename.dispose();
      symbols.dispose();
      folding.dispose();
      actions.dispose();
    },
  };
}

/** What a pending code action needs in order to compute its edit later. */
type DWActionRequest =
  | { op: 'quickfix'; script: string; messageIndex: number; fixIndex: number }
  | { op: 'refactor'; script: string; refactor: 'variable' | 'function'; start: number; end: number }
  | { op: 'docs'; script: string; line: number };

type DWCodeAction = Monaco.languages.CodeAction & { __dw?: DWActionRequest };

/**
 * Live type diagnostics for one editor.
 *
 * This is the engine's own type checker, so it catches things no amount of
 * pattern-matching would: a field that isn't on the payload, an argument of the
 * wrong type, a function that doesn't exist. Previously none of it surfaced
 * until you pressed Run and read an error message.
 *
 * Attached per-editor rather than registered globally on purpose. Every Flow
 * Designer node owns a DataWeave model too, and type-checking all of them on
 * every keystroke would put real load on a single-threaded engine for squiggles
 * nobody is looking at. The main script editor is the one that earns it.
 *
 * Markers use their own owner string so they sit alongside, and never clobber,
 * the run-time error markers the runner sets.
 */
export function attachEngineDiagnostics(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  getPayload: () => string,
  getLevel: () => string,
): { dispose(): void; refresh(): void } {
  const OWNER = 'dataweave-engine';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let generation = 0;

  const run = async () => {
    const model = editor.getModel();
    if (!model || disposed) return;
    const mine = ++generation;
    const script = model.getValue();
    const res = await askNow<{ messages?: EngineMessage[] }>('typeCheck', script, 0, getPayload(), getLevel());
    // The user kept typing while we were waiting — that answer is about a
    // script that no longer exists.
    if (disposed || mine !== generation || model.isDisposed()) return;
    if (!res) return; // engine cold or restarting: leave the last markers alone
    lastDiagnostics.set(model.uri.toString(), { script, messages: res.messages ?? [] });

    const markers: Monaco.editor.IMarkerData[] = [];
    for (const m of res.messages ?? []) {
      const range = rangeOf(model, m.location);
      if (!range) continue;
      markers.push({
        severity:
          m.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: m.message,
        // Surfaces as the rule id beside the message, the way a linter does.
        code: m.code,
        source: 'DataWeave',
        // An unused import is dead weight rather than a mistake; Monaco greys it
        // out instead of underlining it, which is the usual editor convention.
        tags: m.code === 'UnusedImportModule' ? [monaco.MarkerTag.Unnecessary] : undefined,
        ...range,
      });
    }
    monaco.editor.setModelMarkers(model, OWNER, markers);
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    // Long enough that a fast typist doesn't queue a check per keystroke, short
    // enough that the squiggle feels like it belongs to what you just wrote.
    timer = setTimeout(run, 450);
  };

  const sub = editor.onDidChangeModelContent(schedule);
  const swap = editor.onDidChangeModel(() => {
    generation++;
    schedule();
  });
  schedule();

  return {
    /** Re-check without an edit. The check normally rides on content changes,
     *  so changing the target runtime would otherwise leave the last version's
     *  squiggles up until the next keystroke — the editor silently disagreeing
     *  with what Run would do. */
    refresh: schedule,
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      sub.dispose();
      swap.dispose();
      const model = editor.getModel();
      if (model && !model.isDisposed()) {
        monaco.editor.setModelMarkers(model, OWNER, []);
        lastDiagnostics.delete(model.uri.toString());
      }
    },
  };
}

/**
 * Field suggestions for a `foo.` position, straight from the language service.
 *
 * Called by the static provider in `dataweaveCompletions.ts` rather than
 * registered as its own provider: two providers answering the same position
 * showed every field twice, once with the engine's real type and once with the
 * heuristic's guess. Returns null when the engine can't answer, and the caller
 * falls through to its own logic.
 */
export async function engineFieldSuggestions(
  script: string,
  offset: number,
  payload: string,
  monaco: typeof Monaco,
  range: Monaco.IRange,
  languageLevel: string,
): Promise<Monaco.languages.CompletionItem[] | null> {
  const res = await ask<{ items?: EngineSuggestion[]; replacementStart?: number; replacementEnd?: number }>(
    'completion',
    script,
    offset,
    payload,
    languageLevel,
  );
  if (!res?.items?.length) return null;

  return res.items.map((s, i) => ({
    label: s.label,
    kind: iconFor(monaco, s),
    insertText: s.insertText || s.label,
    detail: s.type,
    documentation: s.doc,
    range,
    sortText: `0${String(i).padStart(4, '0')}`,
  }));
}
