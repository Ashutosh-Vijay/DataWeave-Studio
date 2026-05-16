/**
 * JSON-aware unified diff for test failure display.
 *
 * Pretty-prints both sides with sorted keys (so semantically-equal trees
 * produce zero lines of diff regardless of key order in the source), then
 * runs an LCS-based line diff. Falls back to plain text diff when either
 * side isn't valid JSON.
 */

export interface DiffLine {
  type: 'ctx' | 'add' | 'del';
  /** Line number on the "expected" (left) side, null for added lines. */
  oldNum: number | null;
  /** Line number on the "actual" (right) side, null for deleted lines. */
  newNum: number | null;
  text: string;
}

export interface DiffResult {
  lines: DiffLine[];
  /** Number of `+`/`-` lines. 0 means the inputs match. */
  changeCount: number;
  /** True when one of the inputs wasn't valid JSON — diff was done at the
   *  text level instead. */
  fellBackToText: boolean;
}

function stableStringify(value: unknown, indent = 2): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      // Re-pack with sorted keys so two trees with the same content but
      // different key insertion order serialize identically.
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  }, indent);
}

function tryPretty(s: string): { text: string; isJson: boolean } {
  try {
    const parsed = JSON.parse(s);
    return { text: stableStringify(parsed, 2), isJson: true };
  } catch {
    return { text: s.replace(/\r\n/g, '\n'), isJson: false };
  }
}

/** LCS-based line diff. Returns the longest-common-subsequence indices.
 *  Standard O(N*M) DP; fine for typical test output sizes (<5k lines). */
function lcs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  // DP table: dp[i][j] = length of LCS of a[0..i] and b[0..j]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack to recover matched index pairs.
  const matches: Array<[number, number]> = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      matches.push([i - 1, j - 1]);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return matches.reverse();
}

/** Produce a unified-diff line list from two arrays of lines. */
function unifyLines(aLines: string[], bLines: string[]): DiffLine[] {
  const matches = lcs(aLines, bLines);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let mIdx = 0;
  while (i < aLines.length || j < bLines.length) {
    const next = matches[mIdx];
    if (next && i === next[0] && j === next[1]) {
      // Matched line — context
      out.push({ type: 'ctx', oldNum: i + 1, newNum: j + 1, text: aLines[i] });
      i++; j++; mIdx++;
    } else if (next && i < next[0]) {
      // Deletion
      out.push({ type: 'del', oldNum: i + 1, newNum: null, text: aLines[i] });
      i++;
    } else if (next && j < next[1]) {
      // Addition
      out.push({ type: 'add', oldNum: null, newNum: j + 1, text: bLines[j] });
      j++;
    } else if (i < aLines.length) {
      // Trailing deletions
      out.push({ type: 'del', oldNum: i + 1, newNum: null, text: aLines[i] });
      i++;
    } else {
      // Trailing additions
      out.push({ type: 'add', oldNum: null, newNum: j + 1, text: bLines[j] });
      j++;
    }
  }
  return out;
}

export function diffJson(expected: string, actual: string): DiffResult {
  const e = tryPretty(expected);
  const a = tryPretty(actual);
  const fellBackToText = !e.isJson || !a.isJson;

  if (e.text === a.text) {
    return { lines: [], changeCount: 0, fellBackToText };
  }

  const lines = unifyLines(e.text.split('\n'), a.text.split('\n'));
  const changeCount = lines.filter((l) => l.type !== 'ctx').length;
  return { lines, changeCount, fellBackToText };
}
