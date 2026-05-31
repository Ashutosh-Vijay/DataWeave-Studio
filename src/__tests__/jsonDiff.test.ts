import { describe, it, expect } from 'vitest';
import { diffJson } from '../jsonDiff';

describe('jsonDiff', () => {
  describe('stableStringify (via diffJson)', () => {
    it('should match identical JSON structures despite different key order', () => {
      const objA = JSON.stringify({ name: 'mule', version: 2, active: true });
      const objB = JSON.stringify({ version: 2, active: true, name: 'mule' });

      // diffJson should return no changes since they are semantically equivalent
      const diff = diffJson(objA, objB);
      expect(diff.changeCount).toBe(0);
      expect(diff.lines.length).toBe(0);
      expect(diff.fellBackToText).toBe(false);
    });

    it('should sort nested keys stably', () => {
      const complexA = JSON.stringify({
        root: {
          config: { retries: 3, timeout: 30 },
          enabled: true
        }
      });
      const complexB = JSON.stringify({
        root: {
          enabled: true,
          config: { timeout: 30, retries: 3 }
        }
      });

      const diff = diffJson(complexA, complexB);
      expect(diff.changeCount).toBe(0);
      expect(diff.fellBackToText).toBe(false);
    });
  });

  describe('diffJson and LCS output', () => {
    it('should generate line-by-line unified diff additions and deletions', () => {
      const expected = JSON.stringify({ a: 1, b: 2 });
      const actual = JSON.stringify({ a: 1, b: 3 });

      const diff = diffJson(expected, actual);
      expect(diff.changeCount).toBe(2); // one deletion, one addition
      expect(diff.fellBackToText).toBe(false);

      // Verify diff line structure
      const delLine = diff.lines.find((l) => l.type === 'del');
      const addLine = diff.lines.find((l) => l.type === 'add');
      const ctxLines = diff.lines.filter((l) => l.type === 'ctx');

      expect(delLine).toBeDefined();
      expect(delLine?.text).toContain('"b": 2');
      expect(addLine).toBeDefined();
      expect(addLine?.text).toContain('"b": 3');
      expect(ctxLines.length).toBeGreaterThan(0); // surrounding braces, "a": 1, etc.
    });

    it('should fallback to plain text diffing for invalid JSON input', () => {
      const expectedText = 'first line\nsecond line\nthird line';
      const actualText = 'first line\nmodified second line\nthird line';

      const diff = diffJson(expectedText, actualText);
      expect(diff.fellBackToText).toBe(true);
      expect(diff.changeCount).toBe(2); // one deleted line, one added line

      const delLine = diff.lines.find((l) => l.type === 'del');
      expect(delLine?.text).toBe('second line');

      const addLine = diff.lines.find((l) => l.type === 'add');
      expect(addLine?.text).toBe('modified second line');
    });
  });
});
