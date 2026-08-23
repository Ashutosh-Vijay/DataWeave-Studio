import { describe, it, expect } from 'vitest';
import { maskIds } from '../components/CompareTool';

describe('maskIds — Compare tool "Ignore IDs"', () => {
  it('collapses two exports that differ only by doc:id', () => {
    const a = `<flow name="orders" doc:id="8f1c2a10-4b3d-4e2f-9a1b-2c3d4e5f6a7b">
  <logger level="INFO" doc:name="Log" doc:id="11111111-2222-3333-4444-555555555555"/>
</flow>`;
    const b = `<flow name="orders" doc:id="ffffffff-0000-1111-2222-333333333333">
  <logger level="INFO" doc:name="Log" doc:id="99999999-8888-7777-6666-555555555555"/>
</flow>`;
    expect(a).not.toEqual(b);
    expect(maskIds(a)).toEqual(maskIds(b));
  });

  it('still shows a real change when one exists', () => {
    const a = `<logger level="INFO" doc:id="11111111-2222-3333-4444-555555555555"/>`;
    const b = `<logger level="DEBUG" doc:id="99999999-8888-7777-6666-555555555555"/>`;
    expect(maskIds(a)).not.toEqual(maskIds(b));
  });

  it('handles single-quoted attributes and doc:docId', () => {
    const a = `<set-variable doc:docId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' variableName="x"/>`;
    const b = `<set-variable doc:docId='12345678-90ab-cdef-1234-567890abcdef' variableName="x"/>`;
    expect(maskIds(a)).toEqual(maskIds(b));
  });

  it('masks bare UUIDs outside XML (JSON payloads, correlation ids)', () => {
    const a = '{ "correlationId": "8f1c2a10-4b3d-4e2f-9a1b-2c3d4e5f6a7b", "total": 10 }';
    const b = '{ "correlationId": "00000000-1111-2222-3333-444444444444", "total": 10 }';
    expect(maskIds(a)).toEqual(maskIds(b));
    // ...but a genuine value change still differs.
    expect(maskIds(a)).not.toEqual(maskIds(b.replace('10', '11')));
  });

  it('leaves meaningful attributes and non-UUID text alone', () => {
    const src = `<flow name="orders" doc:name="Set Payload" ref="abc123"/>`;
    expect(maskIds(src)).toEqual(src);
  });
});
