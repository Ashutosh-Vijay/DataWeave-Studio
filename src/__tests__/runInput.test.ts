import { describe, it, expect } from 'vitest';
import { buildAttributesJson, buildVarsJson, withErrorInput } from '../runInput';
import { MULE_ERRORS, generateMuleError } from '../muleError';
import type { ContextState, KeyValuePair, NamedInput, VarEntry } from '../types';

const kv = (key: string, value: string, enabled = true): KeyValuePair => ({ key, value, enabled });
const v = (key: string, value: string, valueType: VarEntry['valueType'] = 'string', enabled = true): VarEntry => ({ key, value, valueType, enabled });

describe('buildAttributesJson (single-script run inputs)', () => {
  it('emits just the method when there are no params', () => {
    expect(JSON.parse(buildAttributesJson('GET', [], []))).toEqual({ method: 'GET' });
  });

  it('includes uriParams, queryParams and headers', () => {
    const attrs = JSON.parse(buildAttributesJson(
      'POST',
      [kv('page', '2')],
      [kv('Authorization', 'Bearer x')],
      [kv('loan-application-id', 'LA-1')],
    ));
    expect(attrs).toEqual({
      method: 'POST',
      uriParams: { 'loan-application-id': 'LA-1' },
      queryParams: { page: '2' },
      headers: { Authorization: 'Bearer x' },
    });
  });

  it('defaults uriParams to empty when called with the old 3-arg signature', () => {
    const attrs = JSON.parse(buildAttributesJson('GET', [kv('a', '1')], []));
    expect(attrs.uriParams).toBeUndefined();
    expect(attrs.queryParams).toEqual({ a: '1' });
  });

  it('drops disabled rows and empty-value rows (absent ≠ empty in DataWeave)', () => {
    const attrs = JSON.parse(buildAttributesJson(
      'GET',
      [kv('keep', '1'), kv('off', '2', false), kv('blank', '')],
      [kv('', 'no-key')],
      [kv('u', 'v')],
    ));
    expect(attrs.queryParams).toEqual({ keep: '1' });
    expect(attrs.headers).toBeUndefined(); // only an empty-key row → group omitted
    expect(attrs.uriParams).toEqual({ u: 'v' });
  });
});

describe('buildVarsJson (single-script run inputs)', () => {
  it('passes string vars through', () => {
    expect(JSON.parse(buildVarsJson([v('env', 'dev')]))).toEqual({ env: 'dev' });
  });

  it('parses JSON-typed vars into structured values', () => {
    expect(JSON.parse(buildVarsJson([v('cfg', '{"timeout":30}', 'json')]))).toEqual({ cfg: { timeout: 30 } });
    expect(JSON.parse(buildVarsJson([v('list', '[1,2]', 'json')]))).toEqual({ list: [1, 2] });
  });

  it('falls back to the raw string when a JSON-typed var is invalid JSON', () => {
    expect(JSON.parse(buildVarsJson([v('bad', '{not json', 'json')]))).toEqual({ bad: '{not json' });
  });

  it('turns empty / whitespace-only values into null (DataWeave cannot select on "")', () => {
    expect(JSON.parse(buildVarsJson([v('a', ''), v('b', '   ')]))).toEqual({ a: null, b: null });
  });

  it('drops disabled and unkeyed rows', () => {
    const out = JSON.parse(buildVarsJson([v('keep', '1'), v('off', '2', 'string', false), v('', 'no-key')]));
    expect(out).toEqual({ keep: '1' });
  });
});

describe('withErrorInput (the Error tab)', () => {
  const ctx = (errorJson?: string): ContextState => ({ method: 'GET', queryParams: [], headers: [], vars: [], errorJson });
  const other: NamedInput = { name: 'lookup', content: '{}', mimeType: 'application/json' };

  it('adds nothing when the tab is empty', () => {
    expect(withErrorInput([other], ctx())).toEqual([other]);
    expect(withErrorInput([other], ctx('  '))).toEqual([other]);
  });

  it('binds the object as an input named error, replacing a hand-made one', () => {
    const own: NamedInput = { name: 'error', content: '{"old":1}', mimeType: 'application/json' };
    const out = withErrorInput([other, own], ctx('{"description":"x"}'));
    expect(out).toEqual([other, { name: 'error', content: '{"description":"x"}', mimeType: 'application/json' }]);
  });
});

describe('generateMuleError', () => {
  it('gives every type the shape Mule hands an error handler, chained up to MULE:ANY', () => {
    for (const { type } of MULE_ERRORS) {
      const e = JSON.parse(generateMuleError(type));
      expect(Object.keys(e)).toEqual(expect.arrayContaining(['description', 'detailedDescription', 'errorType', 'errorMessage', 'childErrors']));
      if (!type.startsWith('APP:')) expect(`${e.errorType.namespace}:${e.errorType.identifier}`).toBe(type);
      let t = e.errorType;
      while (t.parentErrorType) t = t.parentErrorType;
      expect(`${t.namespace}:${t.identifier}`).toBe('MULE:ANY');
    }
  });

  it('carries the HTTP response for status errors', () => {
    const e = JSON.parse(generateMuleError('HTTP:NOT_FOUND'));
    expect(e.errorMessage.attributes.statusCode).toBe(404);
    expect(e.description).toMatch(/failed: not found \(404\)\.$/);
  });
});
