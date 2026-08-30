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
): Promise<T | null> {
  // No runtime check on purpose. `invoke` bridges to whichever host is running,
  // and an unimplemented command just rejects — which the catch turns into the
  // static-completion fallback. Guarding on isTauri would silently skip the
  // engine in VS Code even after its host implements dw_tooling.
  if (inFlight) return null;
  inFlight = true;
  try {
    return await invoke<T>('dw_tooling', { kind, script, offset, payload });
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
  extra?: Record<string, unknown>,
): Promise<T | null> {
  try {
    return await invoke<T>('dw_tooling', { kind, script, offset, payload, ...extra });
  } catch {
    return null;
  }
}

/** Character offset of a Monaco position — what the language service wants. */
function offsetOf(model: Monaco.editor.ITextModel, position: Monaco.IPosition): number {
  return model.getOffsetAt(position);
}

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

  const hover = monaco.languages.registerHoverProvider('dataweave', {
    async provideHover(model, position) {
      const res = await ask<{ type?: string | null; doc?: string }>(
        'hover',
        model.getValue(),
        offsetOf(model, position),
        payloadOf(),
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
        payloadOf(),
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
        payloadOf(),
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
        payloadOf(),
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
        payloadOf(),
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
      }>('documentSymbol', model.getValue(), 0, payloadOf());
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
        payloadOf(),
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

  return {
    dispose() {
      hover.dispose();
      signature.dispose();
      definition.dispose();
      references.dispose();
      rename.dispose();
      symbols.dispose();
      folding.dispose();
    },
  };
}

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
): Monaco.IDisposable {
  const OWNER = 'dataweave-engine';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let generation = 0;

  const run = async () => {
    const model = editor.getModel();
    if (!model || disposed) return;
    const mine = ++generation;
    const res = await askNow<{
      messages?: {
        severity: string;
        location: EngineLoc;
        message: string;
        quickFixes?: { name: string; description: string }[];
      }[];
    }>('typeCheck', model.getValue(), 0, getPayload());
    // The user kept typing while we were waiting — that answer is about a
    // script that no longer exists.
    if (disposed || mine !== generation || model.isDisposed()) return;
    if (!res) return; // engine cold or restarting: leave the last markers alone

    const markers: Monaco.editor.IMarkerData[] = [];
    for (const m of res.messages ?? []) {
      const range = rangeOf(model, m.location);
      if (!range) continue;
      const fixes = m.quickFixes?.length
        ? ` (${m.quickFixes.map((f) => f.name).join(', ')})`
        : '';
      markers.push({
        severity:
          m.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: m.message + fixes,
        source: 'DataWeave',
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
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      sub.dispose();
      swap.dispose();
      const model = editor.getModel();
      if (model && !model.isDisposed()) monaco.editor.setModelMarkers(model, OWNER, []);
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
): Promise<Monaco.languages.CompletionItem[] | null> {
  const res = await ask<{ items?: EngineSuggestion[]; replacementStart?: number; replacementEnd?: number }>(
    'completion',
    script,
    offset,
    payload,
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
