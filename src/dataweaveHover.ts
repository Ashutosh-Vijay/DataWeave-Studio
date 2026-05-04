/**
 * Monaco hover provider for DataWeave function documentation.
 *
 * Pulls from the auto-generated `dataweaveDocs.ts` (vendored from
 * mulesoft/docs-dataweave@v2.11) and renders signature + description +
 * up to 2 examples as Markdown that Monaco's hover popup can format.
 */

import type * as Monaco from 'monaco-editor';
import { DW_FUNCTIONS, FnDoc, FnOverload } from './dataweaveDocs';

/** Trim a description to the first paragraph (or ~280 chars), so the hover
 *  popup stays compact and doesn't get clipped by adjacent panels. */
function shortDescription(desc: string): string {
  if (!desc) return '';
  const firstPara = desc.split(/\n\s*\n/)[0].trim();
  if (firstPara.length <= 280) return firstPara;
  return firstPara.slice(0, 280).replace(/\s+\S*$/, '') + '…';
}

function buildHoverMarkdown(doc: FnDoc): string {
  const parts: string[] = [];

  // For each overload: module tag, signature in a code block, short description,
  // and a single short example. Keeps the hover compact for narrow editor panes.
  doc.overloads.forEach((ov: FnOverload, i: number) => {
    if (i > 0) parts.push('\n---\n');

    parts.push(`\`dw::${ov.module}\``);
    parts.push('```dataweave');
    parts.push(ov.signature);
    parts.push('```');

    const desc = shortDescription(ov.description);
    if (desc) parts.push(desc);

    const ex = ov.examples[0];
    if (ex && ex.source) {
      parts.push('');
      parts.push('**Example**');
      parts.push('```dataweave');
      parts.push(ex.source);
      parts.push('```');
      if (ex.output) {
        parts.push('```');
        parts.push(ex.output);
        parts.push('```');
      }
    }
  });

  if (doc.overloads.length > 0 && doc.overloads.some((o) => o.examples.length > 1)) {
    parts.push('');
    parts.push('_More examples in the function browser._');
  }

  return parts.join('\n');
}

export function registerDWHoverProvider(monaco: typeof Monaco): Monaco.IDisposable {
  return monaco.languages.registerHoverProvider('dataweave', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const key = word.word.toLowerCase();
      const doc = DW_FUNCTIONS[key];
      if (!doc) return null;

      return {
        range: new monaco.Range(
          position.lineNumber, word.startColumn,
          position.lineNumber, word.endColumn,
        ),
        contents: [{ value: buildHoverMarkdown(doc), isTrusted: false }],
      };
    },
  });
}

/** Markdown summary of a function for the completion-item documentation
 *  field. Shorter than the hover (one signature, no extra examples). */
export function buildCompletionDoc(name: string): string | undefined {
  const doc = DW_FUNCTIONS[name.toLowerCase()];
  if (!doc) return undefined;
  const parts: string[] = [];
  doc.overloads.slice(0, 1).forEach((ov) => {
    parts.push(`**\`dw::${ov.module}\`**`);
    parts.push('```dataweave');
    parts.push(ov.signature);
    parts.push('```');
    if (ov.description) parts.push(ov.description);
  });
  return parts.join('\n\n');
}
