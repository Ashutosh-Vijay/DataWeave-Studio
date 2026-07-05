import { describe, it, expect } from 'vitest';
import {
  extractDotChain,
  parseScriptDeclarations,
  parseDwObjectLiteral,
  resolveChainRoot,
  dwSelector,
} from '../dataweaveCompletions';

describe('extractDotChain', () => {
  it('extracts payload root with path', () => {
    expect(extractDotChain('payload.template.')).toEqual({ root: 'payload', path: ['template'] });
  });

  it('does not match a root that is a suffix of a longer identifier', () => {
    expect(extractDotChain('mypayload.')).toBeNull();
    expect(extractDotChain('foo.payload.')).toBeNull();
  });

  it('matches extra roots (named inputs / script vars)', () => {
    expect(extractDotChain('template.', ['template'])).toEqual({ root: 'template', path: [] });
    expect(extractDotChain('x = template.inner.', ['template'])).toEqual({ root: 'template', path: ['inner'] });
  });

  it('returns null when the text does not end with a dot', () => {
    expect(extractDotChain('payload')).toBeNull();
  });
});

describe('parseScriptDeclarations', () => {
  it('parses single-line var declarations', () => {
    const { vars } = parseScriptDeclarations('%dw 2.0\nvar template = payload.template\n---\ntemplate');
    expect(vars.get('template')).toBe('payload.template');
  });

  it('parses multi-line object literal vars', () => {
    const script = '%dw 2.0\nvar cfg = {\n  a: 1,\n  b: { c: 2 }\n}\nvar other = payload\n---\ncfg';
    const { vars } = parseScriptDeclarations(script);
    expect(vars.get('cfg')).toBe('{\n  a: 1,\n  b: { c: 2 }\n}');
    expect(vars.get('other')).toBe('payload');
  });

  it('stops var capture at the body separator', () => {
    const { vars } = parseScriptDeclarations('var t = payload.x\n---\nnotPartOfVar');
    expect(vars.get('t')).toBe('payload.x');
  });

  it('strips line comments from the RHS', () => {
    const { vars } = parseScriptDeclarations('var t = payload.x // pick x\n---\nt');
    expect(vars.get('t')).toBe('payload.x');
  });

  it('collects fun names', () => {
    const { funs } = parseScriptDeclarations('fun greet(name: String) = "hi " ++ name\n---\ngreet("a")');
    expect(funs).toEqual(['greet']);
  });
});

describe('dwSelector (quoted selectors for non-identifier keys)', () => {
  it('keeps plain identifiers bare', () => {
    expect(dwSelector('name')).toBe('name');
    expect(dwSelector('_private2')).toBe('_private2');
  });

  it('quotes keys DW would misparse', () => {
    expect(dwSelector('Content-Type')).toBe('"Content-Type"');
    expect(dwSelector('order id')).toBe('"order id"');
    expect(dwSelector('2ndItem')).toBe('"2ndItem"');
  });
});

describe('parseDwObjectLiteral', () => {
  it('parses unquoted-key object literals', () => {
    expect(parseDwObjectLiteral('{ a: 1, b: "x" }')).toEqual({ a: 1, b: 'x' });
  });

  it('parses nested literals and single-quoted strings', () => {
    expect(parseDwObjectLiteral("{ a: { b: 'y' } }")).toEqual({ a: { b: 'y' } });
  });

  it('rejects non-literals', () => {
    expect(parseDwObjectLiteral('payload.x')).toBeUndefined();
    expect(parseDwObjectLiteral('someFun(1)')).toBeUndefined();
  });
});

describe('resolveChainRoot (the var = payload.template bug)', () => {
  const vars = (entries: Record<string, string>) => new Map(Object.entries(entries));

  it('resolves a var aliasing a payload path', () => {
    const resolved = resolveChainRoot(
      { root: 'template', path: [] },
      vars({ template: 'payload.template' }),
    );
    expect(resolved).toEqual({ root: 'payload', path: ['template'] });
  });

  it('prepends the var path to the typed path', () => {
    const resolved = resolveChainRoot(
      { root: 'template', path: ['header'] },
      vars({ template: 'payload.template' }),
    );
    expect(resolved).toEqual({ root: 'payload', path: ['template', 'header'] });
  });

  it('follows var-to-var chains', () => {
    const resolved = resolveChainRoot(
      { root: 'b', path: ['z'] },
      vars({ a: 'payload.x', b: 'a.y' }),
    );
    expect(resolved).toEqual({ root: 'payload', path: ['x', 'y', 'z'] });
  });

  it('resolves object-literal vars to the literal', () => {
    const resolved = resolveChainRoot(
      { root: 'cfg', path: ['b'] },
      vars({ cfg: '{ a: 1, b: { c: 2 } }' }),
    );
    expect(resolved.obj).toEqual({ a: 1, b: { c: 2 } });
    expect(resolved.path).toEqual(['b']);
  });

  it('leaves unresolvable roots untouched', () => {
    const resolved = resolveChainRoot(
      { root: 't', path: [] },
      vars({ t: 'someFun(payload)' }),
    );
    expect(resolved).toEqual({ root: 't', path: [] });
  });

  it('survives self-referencing and circular vars', () => {
    expect(resolveChainRoot({ root: 'a', path: [] }, vars({ a: 'a.x' }))).toEqual({ root: 'a', path: [] });
    const circular = resolveChainRoot({ root: 'a', path: [] }, vars({ a: 'b.x', b: 'a.y' }));
    expect(circular.root).toMatch(/^[ab]$/); // bounded, no infinite loop
  });
});
