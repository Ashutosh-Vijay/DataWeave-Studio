import { describe, it, expect } from 'vitest';
import { buildAttributesJson, buildVarsJson } from '../runInput';
import type { KeyValuePair, VarEntry } from '../types';

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
