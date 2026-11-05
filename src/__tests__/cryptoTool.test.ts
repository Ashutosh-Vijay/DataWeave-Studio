import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, PRESETS, encryptedFrom, generateJava, presetOf, effective, sameHash, toolArgs, parseFileRows, fileTable, TOOL_SOURCE, TOOL_SCRIPT, TOOL_PACKAGE } from '../cryptoTool';

describe('presets', () => {
  it('each preset is recognised by its own settings, and the default is the recommended one', () => {
    for (const p of PRESETS) expect(presetOf({ ...DEFAULT_SETTINGS, ...p.s })).toBe(p.name);
    expect(presetOf(DEFAULT_SETTINGS)).toBe(PRESETS[0].name);
  });

  it('settings that do not apply do not stop a preset matching', () => {
    // GCM has no padding choice; a leftover NoPadding must not make it "Custom".
    expect(presetOf({ ...DEFAULT_SETTINGS, padding: 'NoPadding' })).toBe(PRESETS[0].name);
    expect(effective({ ...DEFAULT_SETTINGS, mode: 'ECB', ivMode: 'fixed', iv: 'abc' }).iv).toBe('');
  });

  it('a changed setting is Custom', () => {
    expect(presetOf({ ...DEFAULT_SETTINGS, encoding: 'hex' })).toBe('');
  });

  it("the user's own presets are recognised too", () => {
    const own = [{ name: 'Partner API', s: { ...DEFAULT_SETTINGS, encoding: 'hex' } }];
    expect(presetOf({ ...DEFAULT_SETTINGS, encoding: 'hex' }, own)).toBe('Partner API');
    expect(presetOf(DEFAULT_SETTINGS, own)).toBe(PRESETS[0].name);
  });
});

describe('sameHash', () => {
  it('compares hex without case, spaces or colons, and Base64 exactly', () => {
    expect(sameHash('ea9cf2b40cea1168868233d18bbe930c', 'EA9C F2B4 0CEA 1168 8682 33D1 8BBE 930C')).toBe(true);
    expect(sameHash('ea9cf2b4', 'ea:9c:f2:b4')).toBe(true);
    expect(sameHash('ea9cf2b4', 'ea9cf2b5')).toBe(false);
    expect(sameHash('q6Lk0bJ0n0m6', 'q6lk0bj0n0m6')).toBe(false);
  });
});

describe('files', () => {
  it('sends the file list for Hash and HMAC, and ignores it elsewhere', () => {
    expect(toolArgs('hash', DEFAULT_SETTINGS, '', 'text', ['C:/a.zip', 'C:/b.zip'])).toMatchObject({ op: 'hashFiles', text: 'C:/a.zip\nC:/b.zip' });
    expect(toolArgs('hmac', DEFAULT_SETTINGS, 'k', 'text', ['C:/a.zip'])).toMatchObject({ op: 'hmacFiles', text: 'C:/a.zip' });
    expect(toolArgs('encrypt', DEFAULT_SETTINGS, 'k', 'text', ['C:/a.zip'])).toMatchObject({ op: 'encrypt', text: 'text' });
    expect(toolArgs('hash', DEFAULT_SETTINGS, '', 'text', [])).toMatchObject({ op: 'hash', text: 'text' });
  });

  it('reads the rows, failures included, and writes a table Excel and CSV readers accept', () => {
    const rows = parseFileRows('C:\\vapt\\api-one.zip\t1024\tab12\nC:\\vapt\\gone, old.zip\t-1\t!not found\n');
    expect(rows).toEqual([
      { path: 'C:\\vapt\\api-one.zip', name: 'api-one.zip', size: 1024, hash: 'ab12', error: '' },
      { path: 'C:\\vapt\\gone, old.zip', name: 'gone, old.zip', size: -1, hash: '', error: 'not found' },
    ]);
    expect(fileTable(rows, 'MD5', ',')).toBe(
      'File,Size (bytes),MD5,Path\r\napi-one.zip,1024,ab12,C:\\vapt\\api-one.zip\r\n"gone, old.zip",,ERROR: not found,"C:\\vapt\\gone, old.zip"\r\n');
    expect(fileTable(rows, 'MD5', '\t').split('\r\n')[1]).toBe('api-one.zip\t1024\tab12\tC:\\vapt\\api-one.zip');
  });
});

describe('encryptedFrom', () => {
  it('reads a bare string, a JSON string, or the value inside the object', () => {
    expect(encryptedFrom('  abc==  ')).toBe('abc==');
    expect(encryptedFrom('"abc=="')).toBe('abc==');
    expect(encryptedFrom('{"encryptedBody":"abc=="}')).toBe('abc==');
    expect(encryptedFrom('{"decryptedBody":"abc=="}')).toBe('abc==');
    expect(encryptedFrom('{"data":"abc=="}')).toBe('abc==');
  });
});

describe('the Java', () => {
  it('the tool and the generated class share the same core', () => {
    const core = TOOL_SOURCE.slice(TOOL_SOURCE.indexOf('// ---- The rest is the same'));
    expect(generateJava('encrypt', DEFAULT_SETTINGS, 'k')).toContain(core);
  });

  it('the script imports the class from the package it is compiled in', () => {
    expect(TOOL_SOURCE.startsWith(`package ${TOOL_PACKAGE};`)).toBe(true);
    expect(TOOL_SCRIPT).toContain(`import java!${TOOL_PACKAGE.replace(/\./g, '::')}::CryptoTool`);
  });

  it('a key with quotes or backslashes is written as a valid Java string', () => {
    expect(generateJava('encrypt', DEFAULT_SETTINGS, 'a"b\\c')).toContain('SECRET = "a\\"b\\\\c";');
  });
});
