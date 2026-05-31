import { describe, it, expect } from 'vitest';
import { convertPropertyKey, findPropertyCalls, convertAllPropertyCalls } from '../dataweavePropertyConverter';

describe('convertPropertyKey', () => {
  it('wraps a key in ${...}, preserving the secure:: namespace', () => {
    expect(convertPropertyKey('db.host')).toBe('${db.host}');
    expect(convertPropertyKey('secure::db.password')).toBe('${secure::db.password}');
  });
});

describe('findPropertyCalls', () => {
  it('finds p(), Mule::p(), single + double quotes', () => {
    const src = `p("a") ++ p('b') ++ Mule::p("secure::c")`;
    const matches = findPropertyCalls(src);
    expect(matches.map((m) => m.key)).toEqual(['a', 'b', 'secure::c']);
    expect(matches.map((m) => m.replacement)).toEqual(['${a}', '${b}', '${secure::c}']);
  });

  it('reports correct offsets and the original match text', () => {
    const src = 'x = p("k")';
    const [m] = findPropertyCalls(src);
    expect(src.slice(m.start, m.end)).toBe('p("k")');
    expect(m.matchText).toBe('p("k")');
  });

  it('does not match p as part of a larger identifier', () => {
    expect(findPropertyCalls('myp("k")')).toHaveLength(0);
    expect(findPropertyCalls('app("k")')).toHaveLength(0);
  });

  it('allows whitespace inside the parens', () => {
    expect(findPropertyCalls('p(  "k" )')[0]?.key).toBe('k');
  });

  it('is repeatable (global regex lastIndex is reset each call)', () => {
    const src = 'p("a") p("b")';
    expect(findPropertyCalls(src).length).toBe(2);
    expect(findPropertyCalls(src).length).toBe(2); // not 0 on the second call
  });
});

describe('convertAllPropertyCalls', () => {
  it('replaces every call and reports count + keys', () => {
    const r = convertAllPropertyCalls(`{ host: p("db.host"), pw: Mule::p("secure::db.pw") }`);
    expect(r.text).toBe('{ host: ${db.host}, pw: ${secure::db.pw} }');
    expect(r.count).toBe(2);
    expect(r.keys).toEqual(['db.host', 'secure::db.pw']);
  });

  it('preserves surrounding text and is a no-op when there are no calls', () => {
    const src = '%dw 2.0\noutput application/json\n---\n{ a: payload.a }';
    expect(convertAllPropertyCalls(src)).toEqual({ text: src, count: 0, keys: [] });
  });

  it('handles multiple calls on one line without corrupting offsets', () => {
    const r = convertAllPropertyCalls('p("a")p("bb")p("ccc")');
    expect(r.text).toBe('${a}${bb}${ccc}');
    expect(r.count).toBe(3);
  });
});
