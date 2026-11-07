import { describe, expect, it } from 'vitest';
import { findSwallowingMinus } from '../minusLint';

const body = (expr: string) => `%dw 2.0\noutput application/json\nvar x = 5\nvar p = {a: 5}\n---\n${expr}`;
const flagged = (expr: string) => findSwallowingMinus(body(expr)).map((f) => f.op);

describe('findSwallowingMinus', () => {
  // Each of these gives a wrong answer (or a compile error) on the bundled engine.
  it.each([
    ['-x - 5', '-'],
    ['-x + 1', '+'],
    ['-(0) + (-3)', '+'],
    ['-(1) + 2', '+'],
    ['-x * 2 + 1', '+'],
    ['-p.a + 1', '+'],
    ['-sum([1]) + 1', '+'],
    ['1 + -x - 5', '-'],
    ['-x > 1', '>'],
    ['-x == -5', '=='],
    ['-x as Number + 1', '+'],
    ['-x\n+ 1', '+'],
    ['if (true) -x - 5 else 0', '-'],
    ['{a: -x + 1}', '+'],
    ['[1, -x - 5]', '-'],
  ])('flags %s', (expr, op) => {
    expect(flagged(expr)).toEqual([op]);
  });

  // These come out right on the engine.
  it.each([
    '-5 - 5',
    '-1 - x',
    '(-x) - 5',
    '-x',
    '-x * 2',
    '-x / 5',
    '-x mod 2',
    '-x as String',
    '-x default 0',
    '-x ++ "a"',
    '[-x, 1]',
    '{a: -x, b: 1}',
    'x - 5',
    '"-x - 5"',
    '// -x - 5\n1',
    'if (true) -x else 0 - 1',
    'f(-x) + 1',
  ])('leaves %s alone', (expr) => {
    expect(flagged(expr)).toEqual([]);
  });

  it('ignores mime types in the header', () => {
    expect(findSwallowingMinus('%dw 2.0\noutput application/x-www-form-urlencoded\n---\n{a: 1}')).toEqual([]);
  });

  it('marks the minus and the value it was meant for', () => {
    const src = body('-p.a + 1');
    const [f] = findSwallowingMinus(src);
    expect(src.slice(f.start, f.operandEnd)).toBe('-p.a');
    expect(f.message).toContain('(-p.a)');
  });
});
