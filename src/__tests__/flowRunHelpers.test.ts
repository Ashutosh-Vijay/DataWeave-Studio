import { describe, it, expect } from 'vitest';
import { parseMaybe, forceJsonOutput, displayVal } from '../flowRunHelpers';

// Regression coverage for the "vars stored as JSON strings" bug — where
// `vars.savedRequest.paymentMode` threw "Value Selector (String, Name)" because
// the variable held the JSON *text* instead of a structured value.
describe('parseMaybe', () => {
  it('parses JSON objects and arrays into structured values', () => {
    expect(parseMaybe('{"paymentMode":"SMS","amount":1}')).toEqual({ paymentMode: 'SMS', amount: 1 });
    expect(parseMaybe('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parses JSON scalars to their real types', () => {
    expect(parseMaybe('5')).toBe(5);
    expect(parseMaybe('true')).toBe(true);
    expect(parseMaybe('null')).toBeNull();
    expect(parseMaybe('"CREATE"')).toBe('CREATE'); // application/json of a string is quoted
  });

  it('falls back to the raw string when the output is not JSON', () => {
    expect(parseMaybe('CREATE')).toBe('CREATE');
    expect(parseMaybe('')).toBe('');
    expect(parseMaybe('not json {')).toBe('not json {');
  });

  it('enables nested field access after round-tripping through JSON', () => {
    const v = parseMaybe('{"a":{"b":[{"c":42}]}}') as { a: { b: { c: number }[] } };
    expect(v.a.b[0].c).toBe(42);
  });
});

describe('forceJsonOutput', () => {
  it('coerces output application/java to application/json so vars come back structured', () => {
    expect(forceJsonOutput('%dw 2.0\noutput application/java\n---\npayload')).toBe('%dw 2.0\noutput application/json\n---\npayload');
  });

  it('preserves the whitespace between output and the mime type', () => {
    expect(forceJsonOutput('output   application/java\n---\n1')).toBe('output   application/json\n---\n1');
  });

  it('leaves other mime types untouched (incl. the application/javascript trap)', () => {
    expect(forceJsonOutput('output application/json\n---\n1')).toBe('output application/json\n---\n1');
    expect(forceJsonOutput('output application/xml\n---\n1')).toBe('output application/xml\n---\n1');
    expect(forceJsonOutput('output application/javascript\n---\n1')).toBe('output application/javascript\n---\n1');
  });
});

describe('displayVal', () => {
  it('shows strings as-is and serialises everything else', () => {
    expect(displayVal('hello')).toBe('hello');
    expect(displayVal({ a: 1 })).toBe('{"a":1}');
    expect(displayVal([1, 2])).toBe('[1,2]');
    expect(displayVal(5)).toBe('5');
    expect(displayVal(null)).toBe('null');
  });
});
