import { describe, it, expect } from 'vitest';
import { substituteProperties, substituteFromMaps } from '../propertySubstitution';

describe('substituteProperties', () => {
  it('substitutes ${key} from config YAML', () => {
    const out = substituteProperties('host is ${db.host}', 'db:\n  host: localhost');
    expect(out).toBe('host is localhost');
  });

  it('substitutes ${secure::key} and bare ${key} from secure YAML', () => {
    const out = substituteProperties(
      'pw=${secure::db.pw} also=${db.pw}',
      undefined,
      'db:\n  pw: hunter2',
    );
    expect(out).toBe('pw=hunter2 also=hunter2');
  });

  // Regression: a `$` in the VALUE must be inserted literally. String.replace
  // treats `$$`, `$&`, `$1` etc. specially in the replacement, which used to
  // corrupt secrets and throw a downstream engine error.
  it('keeps a literal $ in the value ($$ does not collapse)', () => {
    expect(substituteFromMaps('"${k}"', { k: 'Pa$$w0rd' }, {})).toBe('"Pa$$w0rd"');
  });

  it('keeps $& in the value (does not re-inject the placeholder)', () => {
    expect(substituteFromMaps('"${k}"', { k: 'a$&b' }, {})).toBe('"a$&b"');
  });

  it('keeps $1 in the value (no phantom backreference)', () => {
    expect(substituteFromMaps('"${secure::k}"', {}, { k: 'cost$1.50' })).toBe('"cost$1.50"');
  });
});
