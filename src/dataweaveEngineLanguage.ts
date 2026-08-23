/**
 * Engine-backed language features — completion, hover and signature help
 * answered by the real DataWeave language service inside the bundled engine,
 * instead of our own heuristics.
 *
 * The jar has shipped MuleSoft's full language server since day one; this asks
 * it. `payload.` returns the payload's actual fields, and a `map` lambda's
 * parameter resolves to the element type — neither of which a text-pattern
 * guess can do correctly.
 *
 * This registers ALONGSIDE the static provider in `dataweaveCompletions.ts`,
 * which stays as the instant fallback. Monaco merges suggestions from every
 * provider, so a slow or cold engine degrades to exactly today's behaviour
 * rather than an empty popup. Every failure here is swallowed on purpose.
 */
import type * as Monaco from 'monaco-editor';
import { invoke, isTauri } from './bridge';
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
  if (!isTauri || inFlight) return null;
  inFlight = true;
  try {
    return await invoke<T>('dw_tooling', { kind, script, offset, payload });
  } catch {
    return null; // engine cold, restarting, or the script doesn't parse
  } finally {
    inFlight = false;
  }
}

/** Character offset of a Monaco position — what the language service wants. */
function offsetOf(model: Monaco.editor.ITextModel, position: Monaco.IPosition): number {
  return model.getOffsetAt(position);
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

  const completion = monaco.languages.registerCompletionItemProvider('dataweave', {
    triggerCharacters: ['.'],

    async provideCompletionItems(model, position) {
      const res = await ask<{ items?: EngineSuggestion[]; replacementStart?: number; replacementEnd?: number }>(
        'completion',
        model.getValue(),
        offsetOf(model, position),
        payloadOf(),
      );
      if (!res?.items?.length) return { suggestions: [] };
      const items = res.items;

      // The engine reports the range it means to replace, in offsets. Honour it
      // so accepting `orderId` after `payload.` doesn't leave `payload..orderId`.
      const { replacementStart, replacementEnd } = res;
      const start =
        typeof replacementStart === 'number' && replacementStart >= 0
          ? model.getPositionAt(replacementStart)
          : position;
      const end =
        typeof replacementEnd === 'number' && replacementEnd >= 0
          ? model.getPositionAt(replacementEnd)
          : position;
      const range: Monaco.IRange = {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      };

      return {
        suggestions: items.map((s, i) => ({
          label: s.label,
          kind: iconFor(monaco, s),
          insertText: s.insertText || s.label,
          detail: s.type,
          documentation: s.doc,
          range,
          // Engine answers are type-correct, so they sort above the static
          // catalog's guesses for the same prefix.
          sortText: `0${String(i).padStart(4, '0')}`,
        })),
      };
    },
  });

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

  return {
    dispose() {
      completion.dispose();
      hover.dispose();
      signature.dispose();
    },
  };
}
