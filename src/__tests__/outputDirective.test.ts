import { describe, it, expect } from 'vitest';
import { declaredOutput, setOutput, formatLabel } from '../outputDirective';

describe('declaredOutput', () => {
  it('reads the directive from the header only', () => {
    expect(declaredOutput('%dw 2.0\noutput application/xml\n---\npayload')).toBe('application/xml');
    expect(declaredOutput('%dw 2.0\noutput application/csv separator=";"\n---\npayload')).toBe('application/csv');
    // "output" in the body is not a directive.
    expect(declaredOutput('%dw 2.0\n---\n{ output: 1 }')).toBeNull();
    expect(declaredOutput('payload.a')).toBeNull();
  });
});

describe('setOutput', () => {
  it('replaces an existing directive, dropping the old format’s properties', () => {
    expect(setOutput('%dw 2.0\noutput application/csv separator=";"\n---\npayload', 'application/json'))
      .toBe('%dw 2.0\noutput application/json\n---\npayload');
  });

  it('adds one just before the separator when the header has none', () => {
    expect(setOutput('%dw 2.0\nimport * from dw::core::Strings\n---\npayload', 'application/xml'))
      .toBe('%dw 2.0\nimport * from dw::core::Strings\noutput application/xml\n---\npayload');
  });

  it('gives a bare expression a header', () => {
    expect(setOutput('payload.items', 'application/csv')).toBe('%dw 2.0\noutput application/csv\n---\npayload.items');
  });

  it('closes a header that has no separator yet', () => {
    expect(setOutput('%dw 2.0\noutput application/json', 'application/yaml')).toBe('%dw 2.0\noutput application/yaml\n---');
  });

  it('removes the directive for Auto, and leaves a script without one alone', () => {
    expect(setOutput('%dw 2.0\noutput application/json\n---\npayload', null)).toBe('%dw 2.0\n---\npayload');
    expect(setOutput('payload', null)).toBe('payload');
  });

  it('never touches the body, and keeps Windows line endings', () => {
    const s = '%dw 2.0\r\noutput application/json\r\n---\r\n{ output: "x" }';
    expect(setOutput(s, 'application/xml')).toBe('%dw 2.0\r\noutput application/xml\r\n---\r\n{ output: "x" }');
  });
});

describe('formatLabel', () => {
  it('names known formats and falls back to the mime type', () => {
    expect(formatLabel('application/json')).toBe('JSON');
    expect(formatLabel('application/xml; charset=UTF-8')).toBe('XML');
    expect(formatLabel('application/vnd.custom')).toBe('application/vnd.custom');
  });
});
