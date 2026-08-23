import { describe, it, expect } from 'vitest';
import {
  parseLambdaBindings,
  directiveOptionsAt,
  formatOptionSnippet,
  extractDotChain,
  resolveChainRoot,
  parseScriptDeclarations,
} from '../dataweaveCompletions';

/** What the provider does end to end: text before the cursor → resolved chain. */
function resolve(script: string, textBeforeCursor: string) {
  const decls = parseScriptDeclarations(script);
  const lambdas = parseLambdaBindings(textBeforeCursor);
  const roots = [...decls.vars.keys(), ...lambdas.keys()];
  const raw = extractDotChain(textBeforeCursor, roots);
  if (!raw) return null;
  return resolveChainRoot(raw, new Map([...decls.vars, ...lambdas]));
}

describe('lambda parameter completions', () => {
  it('binds a map parameter to the collection it iterates', () => {
    const line = 'payload.items map ((item, index) -> item.';
    expect(parseLambdaBindings(line).get('item')).toBe('payload.items');
    expect(resolve('', line)).toMatchObject({ root: 'payload', path: ['items'] });
  });

  it('handles the single-parameter form', () => {
    expect(resolve('', 'payload filter (order) -> order.')).toMatchObject({ root: 'payload', path: [] });
  });

  it('resolves a deeper path off the parameter', () => {
    const r = resolve('', 'payload.orders map ((o, i) -> o.customer.');
    expect(r).toMatchObject({ root: 'payload', path: ['orders', 'customer'] });
  });

  it('resolves nested lambdas through the outer binding', () => {
    const line = 'payload.orders map ((order) -> order.lines map ((line) -> line.';
    expect(resolve('', line)).toMatchObject({ root: 'payload', path: ['orders', 'lines'] });
  });

  it('lets an inner parameter shadow an outer one of the same name', () => {
    const line = 'payload.a map ((x) -> x.b map ((x) -> x.';
    expect(parseLambdaBindings(line).get('x')).toBe('x.b');
  });

  it('resolves a parameter over a script-level var', () => {
    const script = 'var rows = payload.data\n';
    expect(resolve(script, 'rows map ((row) -> row.')).toMatchObject({ root: 'payload', path: ['data'] });
  });

  it('ignores object-iterating functions whose parameter is a value, not an element', () => {
    // mapObject's first param is a heterogeneous value — guessing its shape
    // would produce confidently wrong suggestions.
    expect(parseLambdaBindings('payload mapObject ((v, k) -> v.').has('v')).toBe(false);
  });

  it('does not bind when the collection is a call expression', () => {
    expect(parseLambdaBindings('flatten(payload.a) map ((x) -> x.').size).toBe(0);
  });
});

describe('output/input directive options', () => {
  it('offers skipNullOn for JSON — the reported gap', () => {
    const opts = directiveOptionsAt('output application/json ');
    expect(opts?.map((o) => o.name)).toContain('skipNullOn');
  });

  it('offers CSV-specific options and not JSON-only ones', () => {
    const names = directiveOptionsAt('output application/csv ')!.map((o) => o.name);
    expect(names).toContain('separator');
    expect(names).toContain('header');
    expect(names).not.toContain('writeAttributes');
  });

  it('drops options already present on the line', () => {
    const names = directiveOptionsAt('output application/json skipNullOn="everywhere" ')!.map((o) => o.name);
    expect(names).not.toContain('skipNullOn');
    expect(names).toContain('indent');
  });

  it('works on an input directive too', () => {
    expect(directiveOptionsAt('input payload application/csv ')?.map((o) => o.name)).toContain('separator');
  });

  it('does not fire mid-expression or before a MIME type', () => {
    expect(directiveOptionsAt('output ')).toBeNull();
    expect(directiveOptionsAt('payload.items map ')).toBeNull();
    expect(directiveOptionsAt('---')).toBeNull();
  });

  it('returns null for a MIME type we have no docs for', () => {
    expect(directiveOptionsAt('output application/made-up ')).toBeNull();
  });

  it('offers the documented options even where the engine does not validate them', () => {
    // The Java writer accepts any option without complaint (verified: it even
    // accepts a nonsense one), so the docs are the only usable source here.
    expect(directiveOptionsAt('output application/java ')?.map((o) => o.name).sort())
      .toEqual(['duplicateKeyAsArray', 'writeAttributes']);
  });

  it('distinguishes reader from writer properties', () => {
    const reader = directiveOptionsAt('input payload application/csv ')!.map((o) => o.name);
    const writer = directiveOptionsAt('output application/csv ')!.map((o) => o.name);
    expect(reader).toContain('streaming');      // reading only
    expect(writer).not.toContain('streaming');
    expect(writer).toContain('quoteValues');    // writing only
    expect(reader).not.toContain('quoteValues');
  });

  it('builds snippets that put the cursor on the value', () => {
    const opts = directiveOptionsAt('output application/json ')!;
    const skipNull = opts.find((o) => o.name === 'skipNullOn')!;
    // engine-verified values
    expect(formatOptionSnippet(skipNull)).toBe('skipNullOn="${1|arrays,objects,everywhere|}"');
    expect(formatOptionSnippet(opts.find((o) => o.name === 'indent')!)).toBe('indent=${1|true,false|}');
  });
});
