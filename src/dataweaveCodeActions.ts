/**
 * DataWeave code actions (Monaco quick-fixes).
 *
 * Currently provides:
 *   - "Convert `p(...)` to `${...}` placeholder" — surfaces on any line
 *     containing a Mule property-lookup call.
 *
 * Code actions appear via:
 *   - The lightbulb gutter icon when the cursor is on a match
 *   - Cmd+. / Ctrl+. (quick-fix shortcut)
 *   - Right-click → "Refactor" / "Source Action"
 */

import type * as Monaco from 'monaco-editor';
import { findPropertyCalls } from './dataweavePropertyConverter';

export function registerDWCodeActionProvider(monaco: typeof Monaco): Monaco.IDisposable {
  return monaco.languages.registerCodeActionProvider('dataweave', {
    provideCodeActions(model, range) {
      const text = model.getValue();
      const matches = findPropertyCalls(text);
      if (matches.length === 0) {
        return { actions: [], dispose: () => {} };
      }

      // Selection range in absolute character offsets — used to filter
      // matches to ones that overlap the current cursor/selection.
      const selStart = model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn });
      const selEnd = model.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn });

      const actions: Monaco.languages.CodeAction[] = [];

      // Per-occurrence quick-fix: any p() call overlapping the cursor.
      for (const m of matches) {
        const overlaps = m.end >= selStart && m.start <= selEnd;
        if (!overlaps) continue;

        const startPos = model.getPositionAt(m.start);
        const endPos = model.getPositionAt(m.end);
        actions.push({
          title: `Convert to \${${m.key}}`,
          kind: 'quickfix',
          isPreferred: true,
          edit: {
            edits: [
              {
                resource: model.uri,
                versionId: model.getVersionId(),
                textEdit: {
                  range: {
                    startLineNumber: startPos.lineNumber,
                    startColumn: startPos.column,
                    endLineNumber: endPos.lineNumber,
                    endColumn: endPos.column,
                  },
                  text: m.replacement,
                },
              },
            ] as Monaco.languages.IWorkspaceTextEdit[],
          },
        });
      }

      // Always offer a "convert all" action when 2+ matches exist anywhere
      // in the document — useful even if cursor isn't on a specific p() call.
      if (matches.length >= 2) {
        // Build edits in reverse so offsets stay valid as Monaco applies them.
        const edits = [...matches].reverse().map((m) => {
          const startPos = model.getPositionAt(m.start);
          const endPos = model.getPositionAt(m.end);
          return {
            resource: model.uri,
            versionId: model.getVersionId(),
            textEdit: {
              range: {
                startLineNumber: startPos.lineNumber,
                startColumn: startPos.column,
                endLineNumber: endPos.lineNumber,
                endColumn: endPos.column,
              },
              text: m.replacement,
            },
          };
        });
        actions.push({
          title: `Convert all p() calls to \${} placeholders (${matches.length})`,
          kind: 'source.fixAll',
          edit: { edits: edits as Monaco.languages.IWorkspaceTextEdit[] },
        });
      }

      return {
        actions,
        dispose: () => {},
      };
    },
  });
}
