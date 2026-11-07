/**
 * Finds a DataWeave parser bug the engine will not report: a minus sign in
 * front of a variable or a bracket negates the WHOLE chain after it, not just
 * the next value.
 *
 *   var x = 5 --- -x - 5        gives 0, read as -(x - 5); should be -10
 *   -(0) + (-3)                 gives 3, read as -(0 + -3); should be -3
 *   -x * 2 + 1                  gives -11, read as -(x * 2 + 1)
 *   -x > 1                      fails to compile: it negates a Boolean
 *
 * A minus in front of a number literal (`-5 - 5`) is a negative number and is
 * fine. With only `*`, `/`, `mod`, `as` or `default` after it the answer comes
 * out the same, so those are not flagged. Probed against the bundled engine
 * 2026-11-07; MuleSoft has a ticket open for it. Remove once the jar has the fix.
 */

type Tok = { t: 'id' | 'num' | 'str' | 'op' | 'open' | 'close'; s: string; start: number; end: number };

const OPS = ['---', '->', '==', '!=', '>=', '<=', '~=', '++', '::', '.*', '.^', '..'];
const KEYWORDS_BEFORE_VALUE = new Set(['if', 'else', 'unless', 'do', 'and', 'or', 'not', 'case', 'then', 'default', 'return']);
// Anything here ends the chain the minus can swallow.
const STOP_WORDS = new Set(['else', 'then', 'and', 'or', 'default', 'match', 'var', 'fun', 'case', 'if', 'unless', 'update', 'import', 'type', 'ns', 'output', 'input']);
const STOP_OPS = new Set([',', ';', '++', '---', '->', '=', ':']);
const TRIGGERS = new Set(['+', '-', '>', '<', '>=', '<=', '==', '!=', '~=']);

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    const start = i;
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1;
      i++;
      out.push({ t: 'str', s: src.slice(start, i), start, end: i });
      continue;
    }
    if (/[0-9]/.test(c)) {
      while (i < src.length && /[0-9_.]/.test(src[i]) && !(src[i] === '.' && !/[0-9]/.test(src[i + 1] ?? ''))) i++;
      out.push({ t: 'num', s: src.slice(start, i), start, end: i });
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      while (i < src.length && /[\w$]/.test(src[i])) i++;
      out.push({ t: 'id', s: src.slice(start, i), start, end: i });
      continue;
    }
    if ('([{'.includes(c)) { out.push({ t: 'open', s: c, start, end: ++i }); continue; }
    if (')]}'.includes(c)) { out.push({ t: 'close', s: c, start, end: ++i }); continue; }
    const op = OPS.find((o) => src.startsWith(o, i)) ?? c;
    i += op.length;
    out.push({ t: 'op', s: op, start, end: i });
  }
  return out;
}

/** True when the token before a `-` means that minus is a sign, not a subtraction. */
function startsValue(toks: Tok[], i: number): boolean {
  const prev = toks[i - 1];
  if (!prev) return true;
  if (prev.t === 'open' || prev.t === 'op') return true;
  if (prev.t === 'id') return KEYWORDS_BEFORE_VALUE.has(prev.s);
  // `if (cond) -x`: the bracket closes a condition, not a value.
  if (prev.t === 'close' && prev.s === ')') {
    let depth = 0;
    for (let k = i - 1; k >= 0; k--) {
      if (toks[k].t === 'close') depth++;
      else if (toks[k].t === 'open' && --depth === 0) {
        const kw = toks[k - 1];
        return kw?.t === 'id' && (kw.s === 'if' || kw.s === 'unless');
      }
    }
  }
  return false;
}

/** Index just past the bracket group opened at `i`. */
function skipGroup(toks: Tok[], i: number): number {
  let depth = 0;
  for (; i < toks.length; i++) {
    if (toks[i].t === 'open') depth++;
    else if (toks[i].t === 'close' && --depth === 0) return i + 1;
  }
  return toks.length;
}

export type MinusFinding = {
  /** Offset of the `-`. */
  start: number;
  /** Offset just past the value the minus was meant for (`x`, `p.a`, `(0)`). */
  operandEnd: number;
  /** The operator that gets pulled under the minus. */
  op: string;
  message: string;
};

export function findSwallowingMinus(script: string): MinusFinding[] {
  const toks = tokenize(script);
  const found: MinusFinding[] = [];
  for (let i = 0; i < toks.length; i++) {
    const m = toks[i];
    if (m.t !== 'op' || m.s !== '-' || !startsValue(toks, i)) continue;
    const first = toks[i + 1];
    if (!first || first.t === 'num' || first.t === 'str' || (first.t === 'op')) continue;

    // The value the minus is meant for: `x`, `p.a`, `f(1)`, `xs[0]`, `(...)`.
    let j: number;
    if (first.t === 'open' && first.s === '(') j = skipGroup(toks, i + 1);
    else if (first.t === 'id' && !STOP_WORDS.has(first.s)) j = i + 2;
    else continue;
    while (j < toks.length) {
      const k = toks[j];
      if (k.t === 'open' && (k.s === '(' || k.s === '[') && k.start === toks[j - 1].end) { j = skipGroup(toks, j); continue; }
      if (k.t === 'op' && (k.s === '.' || k.s === '..' || k.s === '.*' || k.s === '.^' || k.s === '::') && toks[j + 1]) {
        j += 2;
        // `.*a` or `.'x-y'`: the name after the selector is part of the value
        continue;
      }
      break;
    }
    const operandEnd = toks[j - 1].end;

    // Walk the rest of the chain at this bracket depth for an operator that
    // changes the answer once the minus is applied to it.
    let depth = 0;
    let hit: Tok | null = null;
    for (let k = j; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'open') { depth++; continue; }
      if (t.t === 'close') { if (--depth < 0) break; continue; }
      if (depth > 0) continue;
      if (t.t === 'id' && STOP_WORDS.has(t.s)) break;
      if (t.t !== 'op') continue;
      if (STOP_OPS.has(t.s)) break;
      // A `-` right after another operator is someone else's sign.
      if (TRIGGERS.has(t.s) && !(t.s === '-' && startsValue(toks, k))) { hit = t; break; }
    }
    if (!hit) continue;

    let operand = script.slice(first.start, operandEnd);
    if (operand.length > 24) operand = operand.slice(0, 21) + '...';
    const compare = hit.s !== '+' && hit.s !== '-';
    found.push({
      start: m.start,
      operandEnd,
      op: hit.s,
      message: compare
        ? `DataWeave applies this minus to the whole comparison after it, so it negates a true/false value. Write (-${operand}) to negate only ${operand}.`
        : `DataWeave applies this minus to everything up to the end of the sum, so -${operand} ${hit.s} ... is worked out as -(${operand} ${hit.s} ...). Write (-${operand}) to negate only ${operand}.`,
    });
  }
  return found;
}
