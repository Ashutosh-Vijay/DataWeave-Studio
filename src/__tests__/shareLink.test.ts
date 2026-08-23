import { describe, it, expect } from 'vitest';
import { encodeShare, decodeShare, shareUrl, isShareTooLong, unshareableItems, SHARE_PREFIX } from '../shareLink';

const full = {
  name: 'Order mapping',
  script: '%dw 2.0\noutput application/json\n---\n{ id: payload.orderId, who: vars.user }',
  payload: '{ "orderId": "A-1", "items": [1,2,3] }',
  payloadMime: 'application/json',
  method: 'POST',
  vars: [{ key: 'user', value: '"alex"', valueType: 'json' }],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  queryParams: [{ key: 'debug', value: 'true' }],
  namedInputs: [{ name: 'accounts', content: '[]', mimeType: 'application/json' }],
};

describe('share links', () => {
  it('round-trips everything needed to actually run the script', () => {
    expect(decodeShare(encodeShare(full))).toEqual(full);
  });

  it('round-trips through a full URL, not just a bare code', () => {
    expect(decodeShare(shareUrl(full))).toEqual(full);
  });

  it('keeps the payload in the fragment so it never reaches a server', () => {
    const url = shareUrl(full);
    const [base, fragment] = url.split('#');
    expect(base).not.toContain('orderId');
    expect(fragment).toContain(SHARE_PREFIX.replace('.', ''));
    // Nothing identifying leaks into the path or query.
    expect(base).toBe('https://ashutosh-vijay.dev/dataweave/s');
  });

  it('drops empty rows so a simple snapshot stays a short link', () => {
    const snap = {
      script: 'payload', payload: '{}', payloadMime: 'application/json',
      vars: [{ key: '', value: '', valueType: 'string' }],
      headers: [{ key: '', value: '' }],
    };
    const out = decodeShare(encodeShare(snap));
    expect(out.vars).toBeUndefined();
    expect(out.headers).toBeUndefined();
  });

  it('compresses — a repetitive payload does not produce a proportional link', () => {
    const big = { script: 'payload', payload: JSON.stringify(Array(400).fill({ a: 1, b: 'xx' })), payloadMime: 'application/json' };
    const code = encodeShare(big);
    expect(code.length).toBeLessThan(big.payload.length / 5);
    expect(decodeShare(code).payload).toEqual(big.payload);
  });

  it('survives whitespace and newlines from a pasted email', () => {
    const code = encodeShare(full);
    const mangled = `${code.slice(0, 20)}\n  ${code.slice(20)}  `;
    expect(decodeShare(mangled).script).toEqual(full.script);
  });

  it('preserves non-ASCII payloads', () => {
    const snap = { script: 'payload', payload: '{ "greeting": "नमस्ते", "emoji": "🚀" }', payloadMime: 'application/json' };
    expect(decodeShare(encodeShare(snap)).payload).toEqual(snap.payload);
  });

  it('rejects junk with a message a human can act on', () => {
    expect(() => decodeShare('https://example.com/nope')).toThrow(/share link/i);
    expect(() => decodeShare('dws1.!!!!not-base64!!!!')).toThrow(/damaged|incomplete/i);
  });

  it('flags links too long to paste reliably', () => {
    expect(isShareTooLong(shareUrl(full))).toBe(false);
    // Must be genuinely incompressible — Array.fill() repeats one object and
    // deflate crushes it, which is exactly why an earlier version of this test
    // passed a "huge" payload that produced a tiny link.
    const rows = Array.from({ length: 4000 }, (_, i) => ({ id: `${i}-${Math.random().toString(36).slice(2)}` }));
    const huge = { script: 'payload', payload: JSON.stringify(rows), payloadMime: 'application/json' };
    expect(isShareTooLong(shareUrl(huge))).toBe(true);
  });

  it('carries every request when sharing a whole workspace', () => {
    const snap = {
      name: 'Billing',
      ...{ script: 'payload', payload: '{}', payloadMime: 'application/json' },
      requests: [
        { label: 'Fetch', script: 'a', payload: '{"a":1}', payloadMime: 'application/json' },
        { label: 'Map', script: 'b', payload: '{"b":2}', payloadMime: 'application/json', nodeLabel: 'DB Query', queryTemplate: 'SELECT 1' },
      ],
    };
    const out = decodeShare(encodeShare(snap));
    expect(out.name).toBe('Billing');
    expect(out.requests).toHaveLength(2);
    expect(out.requests![1]).toMatchObject({ label: 'Map', nodeLabel: 'DB Query', queryTemplate: 'SELECT 1' });
    // The flat fields still describe the active request, so older readers and
    // the web landing page still show something.
    expect(out.script).toBe('payload');
  });

  it('does not bloat a single-request link with a requests array', () => {
    const one = { script: 'payload', payload: '{}', payloadMime: 'application/json',
      requests: [{ script: 'payload', payload: '{}', payloadMime: 'application/json' }] };
    expect(decodeShare(encodeShare(one)).requests).toBeUndefined();
  });

  it('round-trips in-memory multipart parts', () => {
    const snap = { script: 'payload', payload: '', payloadMime: 'multipart/form-data',
      multipartParts: [{ name: 'meta', value: '{"id":1}', contentType: 'application/json' }] };
    expect(decodeShare(encodeShare(snap)).multipartParts).toEqual(snap.multipartParts);
  });

  it('names content that cannot travel in a link', () => {
    expect(unshareableItems({})).toEqual([]);
    const items = unshareableItems({
      payloadFilePath: 'C:/tmp/big.xlsx',
      multipartParts: [{ name: 'invoice', isFile: true }, { name: 'meta', isFile: false }],
      namedInputs: [{ name: 'accounts', filePath: 'C:/tmp/a.json' }],
    });
    expect(items).toHaveLength(3);
    expect(items.join(' ')).toContain('payload file');
    expect(items.join(' ')).toContain('invoice');
    expect(items.join(' ')).not.toContain('meta');
  });
});
