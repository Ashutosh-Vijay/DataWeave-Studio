import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, PRESETS, encryptedFrom, generateJava, presetOf, effective, TOOL_SOURCE, TOOL_SCRIPT, TOOL_PACKAGE } from '../cryptoTool';

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
