import { describe, it, expect } from 'vitest';
import { migrateDW1to2 } from '../dwMigrate';

describe('migrateDW1to2 (DataWeave 1.0 -> 2.0)', () => {
  it('rewrites the version header and directives', () => {
    const { output } = migrateDW1to2('%dw 1.0\n%output application/json\n%var x = 1\n---\nx');
    expect(output).toContain('%dw 2.0');
    expect(output).toContain('output application/json');
    expect(output).toContain('var x = 1');
    expect(output).not.toContain('%output');
    expect(output).not.toContain('%var');
  });

  it('converts %function to fun and %input to input', () => {
    const { output } = migrateDW1to2('%function double(x) = x * 2\n%input payload application/json');
    expect(output).toContain('fun double(x) = x * 2');
    expect(output).toContain('input payload application/json');
  });

  it('maps Mule 3 bindings: flowVars -> vars, inboundProperties -> attributes', () => {
    const { output } = migrateDW1to2('flowVars.foo ++ inboundProperties["http.method"] ++ inboundProperties.bar');
    expect(output).toContain('vars.foo');
    expect(output).toContain('attributes.method');
    expect(output).toContain('attributes.headers.bar');
    expect(output).not.toContain('flowVars');
    expect(output).not.toContain('inboundProperties');
  });

  it('rewrites legacy type-coercion syntax', () => {
    const { output } = migrateDW1to2('payload.a as :string ++ payload.b as :number ++ payload.c as :datetime');
    expect(output).toContain('as String');
    expect(output).toContain('as Number');
    expect(output).toContain('as DateTime');
    expect(output).not.toMatch(/as\s+:/);
  });

  it('flags constructs with no DW 2.0 equivalent as warnings', () => {
    const { warnings } = migrateDW1to2('outboundProperties.x\nsessionVars.y\nlookup("flow", payload)');
    expect(warnings.some((w) => w.includes('outboundProperties'))).toBe(true);
    expect(warnings.some((w) => w.includes('sessionVars'))).toBe(true);
    expect(warnings.some((w) => w.includes('lookup'))).toBe(true);
  });

  it('comments out %namespace and warns', () => {
    const { output, warnings } = migrateDW1to2('%namespace ns http://example.com');
    expect(output).toContain('// %namespace');
    expect(warnings.some((w) => w.includes('%namespace'))).toBe(true);
  });

  it('warns on p("key") but not when app.* is in scope', () => {
    expect(migrateDW1to2('p("db.host")').warnings.some((w) => w.startsWith('p('))).toBe(true);
    expect(migrateDW1to2('app.config.host').warnings.some((w) => w.startsWith('p('))).toBe(false);
  });

  it('reports a structured change summary', () => {
    const { changes } = migrateDW1to2('%dw 1.0\n---\nflowVars.x as :string');
    const labels = changes.map((c) => c.label);
    expect(labels).toContain('%dw 1.0 → 2.0');
    expect(changes.find((c) => c.label === '%dw 1.0 → 2.0')?.count).toBe(1);
    expect(labels.some((l) => l.includes('flowVars'))).toBe(true);
  });

  it('makes no changes to a clean DW 2.0 script', () => {
    const src = '%dw 2.0\noutput application/json\n---\n{ id: payload.id }';
    const { output, changes, warnings } = migrateDW1to2(src);
    expect(output).toBe(src);
    expect(changes).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});
