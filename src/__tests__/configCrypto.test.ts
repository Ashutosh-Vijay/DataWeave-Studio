import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  scanConfig,
  applyEdits,
  yamlScalar,
  looksLikeSecret,
} from '../configCrypto';

const YAML = `# production config
db:
  host: "db.production.internal"
  port: 5432
  user: app_admin
  password: "MySuperSecretPassword123!"

api:
  client_id: 7f8b9c0d1e2f3a4b
  client_secret: "![alreadyEncryptedBlob==]"

jwt:
  private_key: MIIEvgIBADANBgkqhkiG9w0
`;

const PROPS = `# production config
db.host=db.production.internal
db.port=5432
db.user=app_admin
db.password=MySuperSecretPassword123!

api.client_id=7f8b9c0d1e2f3a4b
api.client_secret=![alreadyEncryptedBlob==]
`;

describe('detectFormat', () => {
  it('recognises YAML', () => expect(detectFormat(YAML)).toBe('yaml'));
  it('recognises properties', () => expect(detectFormat(PROPS)).toBe('properties'));
  it('defaults to YAML when there is nothing to go on', () => expect(detectFormat('')).toBe('yaml'));
  it('is not fooled by a leading comment block', () => {
    expect(detectFormat('# one\n# two\n\na.b=c\n')).toBe('properties');
  });
});

describe('scanConfig — YAML', () => {
  const fields = scanConfig(YAML, 'yaml');

  it('reports every leaf value with its dotted path', () => {
    expect(fields.map((f) => f.path)).toEqual([
      'db.host', 'db.port', 'db.user', 'db.password',
      'api.client_id', 'api.client_secret',
      'jwt.private_key',
    ]);
  });

  it('strips surrounding quotes from the value', () => {
    expect(fields.find((f) => f.path === 'db.host')!.value).toBe('db.production.internal');
    expect(fields.find((f) => f.path === 'db.password')!.value).toBe('MySuperSecretPassword123!');
  });

  it('flags a value that is already encrypted, quotes and all', () => {
    const f = fields.find((x) => x.path === 'api.client_secret')!;
    expect(f.encrypted).toBe(true);
    expect(fields.filter((x) => x.encrypted)).toHaveLength(1);
  });

  it('does not treat a parent key as a value', () => {
    expect(fields.some((f) => f.path === 'db')).toBe(false);
  });

  it('points at the exact span of the value', () => {
    const line = YAML.split('\n')[fields[0].line];
    expect(line.slice(fields[0].start, fields[0].end)).toBe('"db.production.internal"');
  });
});

describe('scanConfig — YAML edge cases', () => {
  it('skips block scalars, flow collections, anchors and list items', () => {
    const src = [
      'cert: |',
      '  -----BEGIN-----',
      'hosts: [a, b]',
      'opts: { x: 1 }',
      'base: &anchor value',
      'items:',
      '  - one',
      '  - two',
    ].join('\n');
    const skips = Object.fromEntries(
      scanConfig(src, 'yaml').filter((f) => f.skip).map((f) => [f.path, f.skip]),
    );
    expect(skips).toEqual({
      cert: 'multi-line block',
      hosts: 'list or map',
      opts: 'list or map',
      base: 'anchor or alias',
    });
  });

  it('skips ${...} placeholders — they point at a value, they are not one', () => {
    const f = scanConfig('a:\n  b: ${some.other.key}\n', 'yaml')[0];
    expect(f.skip).toBe('placeholder');
  });

  it('skips a value that merely contains a placeholder — encrypting it would break the substitution', () => {
    expect(scanConfig('a: ${base.url}/callback\n', 'yaml')[0].skip).toBe('placeholder');
    expect(scanConfig('a=${base.url}/callback\n', 'properties')[0].skip).toBe('placeholder');
  });

  it('ignores a trailing comment when reading an unquoted value', () => {
    const f = scanConfig('a: plain # not part of it\n', 'yaml')[0];
    expect(f.value).toBe('plain');
    expect('a: plain # not part of it'.slice(f.start, f.end)).toBe('plain');
  });

  it('keeps a # that is inside the value', () => {
    expect(scanConfig('a: "pa#ss"\n', 'yaml')[0].value).toBe('pa#ss');
    expect(scanConfig('a: pa#ss\n', 'yaml')[0].value).toBe('pa#ss');
  });

  it('unescapes a double-quoted scalar', () => {
    expect(scanConfig('a: "he said \\"hi\\""\n', 'yaml')[0].value).toBe('he said "hi"');
  });

  it('unescapes a single-quoted scalar', () => {
    expect(scanConfig("a: 'it''s here'\n", 'yaml')[0].value).toBe("it's here");
  });
});

describe('scanConfig — properties', () => {
  const fields = scanConfig(PROPS, 'properties');

  it('reports every key', () => {
    expect(fields.map((f) => f.path)).toEqual([
      'db.host', 'db.port', 'db.user', 'db.password',
      'api.client_id', 'api.client_secret',
    ]);
  });

  it('flags the already-encrypted one', () => {
    expect(fields.find((f) => f.path === 'api.client_secret')!.encrypted).toBe(true);
  });

  it('skips comments, including the ! form', () => {
    expect(scanConfig('# a=1\n! b=2\nc=3\n', 'properties').map((f) => f.path)).toEqual(['c']);
  });

  it('leaves a line-continued value alone', () => {
    const f = scanConfig('a=one \\\n  two\n', 'properties')[0];
    expect(f.skip).toBe('continued over lines');
  });

  it('unescapes a value', () => {
    expect(scanConfig('a=c\\:\\\\x\n', 'properties')[0].value).toBe('c:\\x');
  });
});

describe('yamlScalar', () => {
  it('quotes an encrypted value — bare ![...] is a tag to every YAML parser', () => {
    expect(yamlScalar('![abc==]')).toBe('"![abc==]"');
  });
  it('leaves a plain value bare', () => {
    expect(yamlScalar('db.production.internal')).toBe('db.production.internal');
  });
  it('quotes what needs it', () => {
    expect(yamlScalar('a: b')).toBe('"a: b"');
    expect(yamlScalar('he said "hi"')).toBe('"he said \\"hi\\""');
    expect(yamlScalar('two\nlines')).toBe('"two\\nlines"');
    expect(yamlScalar(' padded ')).toBe('" padded "');
    expect(yamlScalar('')).toBe('""');
  });
});

describe('applyEdits', () => {
  it('replaces only the value, keeping comments and layout', () => {
    const fields = scanConfig(YAML, 'yaml');
    const pw = fields.find((f) => f.path === 'db.password')!;
    const out = applyEdits(YAML, [{ line: pw.line, start: pw.start, end: pw.end, text: '"![enc]"' }]);
    expect(out).toContain('# production config');
    expect(out).toContain('  password: "![enc]"');
    expect(out).toContain('  host: "db.production.internal"');
    // Every other line is untouched.
    expect(out.split('\n').length).toBe(YAML.split('\n').length);
  });

  it('preserves CRLF line endings', () => {
    const src = 'a: one\r\nb: two\r\n';
    const f = scanConfig(src, 'yaml')[0];
    expect(applyEdits(src, [{ line: f.line, start: f.start, end: f.end, text: 'x' }]))
      .toBe('a: x\r\nb: two\r\n');
  });

  it('rewrites several lines at once', () => {
    const fields = scanConfig(PROPS, 'properties');
    const out = applyEdits(
      PROPS,
      fields.filter((f) => !f.encrypted).map((f) => ({ line: f.line, start: f.start, end: f.end, text: 'X' })),
    );
    expect(out).toContain('db.password=X');
    expect(out).toContain('api.client_secret=![alreadyEncryptedBlob==]');
  });
});

describe('looksLikeSecret', () => {
  it('spots the usual names', () => {
    for (const k of ['db.password', 'api.client_secret', 'jwt.private_key', 'x.apiKey', 'a.token'])
      expect(looksLikeSecret(k)).toBe(true);
  });
  it('leaves ordinary settings alone', () => {
    for (const k of ['db.host', 'db.port', 'api.client_id', 'app.name'])
      expect(looksLikeSecret(k)).toBe(false);
  });
});
