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

  // Regression: a `$` in a value that lands INSIDE a DataWeave string must be
  // escaped to `\$` — DataWeave interpolates `$` in strings, so a raw value
  // like `Pa$$w0rd` or `$qwer%$#` throws "Unable to resolve reference of `$`".
  it('escapes $ inside a double-quoted string', () => {
    expect(substituteFromMaps('"${k}"', { k: 'Pa$$w0rd' }, {})).toBe('"Pa\\$\\$w0rd"');
  });

  it('escapes the real-world repro inside a string', () => {
    expect(substituteFromMaps('{ hello: "${secure::password}" }', {}, { password: '$qwer%$#@!^&*()' }))
      .toBe('{ hello: "\\$qwer%\\$#@!^&*()" }');
  });

  it('escapes $ inside a single-quoted string too (DW interpolates there as well)', () => {
    expect(substituteFromMaps("'${k}'", { k: 'a$b' }, {})).toBe("'a\\$b'");
  });

  it('does NOT escape $ in a bare (non-string) position', () => {
    expect(substituteFromMaps('x = ${k}', { k: 'a$b' }, {})).toBe('x = a$b');
  });

  it('escapes a quote in the value so it cannot break out of the string', () => {
    expect(substituteFromMaps('"${k}"', { k: 'a"b' }, {})).toBe('"a\\"b"');
  });

  it('leaves real DataWeave interpolation $(...) untouched', () => {
    expect(substituteFromMaps('"hi $(payload.name)"', {}, {})).toBe('"hi $(payload.name)"');
  });
});
