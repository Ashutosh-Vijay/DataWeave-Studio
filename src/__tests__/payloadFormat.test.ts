import { describe, it, expect } from 'vitest';
import { canFormatPayload, formatPayload } from '../payloadFormat';

const fmt = (s: string, mime = 'application/json') => {
  const r = formatPayload(s, mime);
  if ('error' in r) throw new Error(r.error);
  return r.text;
};

describe('payload formatting', () => {
  it('offers itself only where formatting means something', () => {
    expect(canFormatPayload('application/json')).toBe(true);
    expect(canFormatPayload('application/xml')).toBe(true);
    expect(canFormatPayload('text/csv')).toBe(false);
    expect(canFormatPayload('text/plain')).toBe(false);
    expect(canFormatPayload('application/octet-stream')).toBe(false);
  });

  it('formats JSON without changing what it means', () => {
    const out = fmt('{"b":[1,2],"a":{"c":"x"}}');
    expect(out).toBe('{\n  "b": [\n    1,\n    2\n  ],\n  "a": {\n    "c": "x"\n  }\n}');
    expect(JSON.parse(out)).toEqual({ b: [1, 2], a: { c: 'x' } });
  });

  it('reports invalid JSON instead of mangling it', () => {
    const r = formatPayload('{ nope', 'application/json');
    expect(r).toHaveProperty('error');
    expect((r as { error: string }).error).toMatch(/not valid json/i);
  });

  it('indents XML by nesting depth', () => {
    const out = fmt('<a><b><c>1</c></b></a>', 'application/xml');
    expect(out).toBe('<a>\n  <b>\n    <c>1</c>\n  </b>\n</a>');
  });

  it('keeps a short text element on one line', () => {
    // Exploding <name>Ada</name> over three lines makes payloads harder to read.
    expect(fmt('<p><name>Ada</name></p>', 'application/xml')).toBe('<p>\n  <name>Ada</name>\n</p>');
  });

  it('leaves the prolog and self-closing tags at their own depth', () => {
    const out = fmt('<?xml version="1.0"?><r><br/><x>1</x></r>', 'application/xml');
    expect(out).toBe('<?xml version="1.0"?>\n<r>\n  <br/>\n  <x>1</x>\n</r>');
  });

  it('never reinterprets CDATA, even when it contains angle brackets', () => {
    const src = '<r><d><![CDATA[<not><a><tag>]]></d></r>';
    const out = fmt(src, 'application/xml');
    expect(out).toContain('<![CDATA[<not><a><tag>]]>');
    // the fake tags inside CDATA must not have changed the indentation
    expect(out.split('\n')).toHaveLength(3);
  });

  it('preserves attributes verbatim', () => {
    const out = fmt('<a id="1" x=\'2\'><b/></a>', 'application/xml');
    expect(out).toContain('<a id="1" x=\'2\'>');
  });

  it('refuses content that clearly is not XML', () => {
    const r = formatPayload('id,name\n1,ada', 'application/xml');
    expect(r).toHaveProperty('error');
  });

  it('says so when there is nothing to format', () => {
    expect(formatPayload('   ', 'application/json')).toHaveProperty('error');
  });
});
