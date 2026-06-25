import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';

// Polyfill DOMParser for the Node.js test environment
if (typeof globalThis.DOMParser === 'undefined') {
  const { window } = new JSDOM();
  globalThis.DOMParser = window.DOMParser;
  globalThis.XMLSerializer = window.XMLSerializer;
}

import { exportFlowToMuleXml, exportFlowsToMuleXml, importMuleXml } from '../muleXmlIO';
import type { FlowNode } from '../components/FlowDesigner';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('muleXmlIO', () => {
  describe('Inlined Helpers & XML Escaping', () => {
    // We cannot access the internal escXml / cdata directly, but we can verify their
    // behaviors via export output. Let's build nodes that force their execution.
    it('should correctly escape XML special characters in labels and values', () => {
      const mockNode: FlowNode = {
        id: 'node-1',
        type: 'set-variable',
        kind: 'leaf',
        label: 'Set Var <&> "',
        x: 0,
        y: 0,
        config: {
          variableName: 'testVar',
          variableValue: 'value <&> "',
          variableSource: 'raw',
        },
        status: 'idle',
      };

      const xml = exportFlowToMuleXml('My Flow', [mockNode]);
      // Labels and raw values should be escaped
      expect(xml).toContain('doc:name="Set Var &lt;&amp;&gt; &quot;"');
      expect(xml).toContain('value="value &lt;&amp;&gt; &quot;"');
    });

    it('should CDATA-wrap DataWeave scripts in transform and handle CDATA closers', () => {
      const mockNode: FlowNode = {
        id: 'node-2',
        type: 'transform',
        kind: 'leaf',
        label: 'Transform',
        x: 0,
        y: 0,
        config: {
          script: '%dw 2.0\n---\n"hello ]]> world"',
        },
        status: 'idle',
      };

      const xml = exportFlowToMuleXml('Flow', [mockNode]);
      // Should handle nested CDATA split escaping (ignoring exact nested indentation spaces)
      expect(xml.replace(/\s+/g, '')).toContain('<![CDATA[%dw2.0---"hello]]]]><![CDATA[>world"]]>'.replace(/\s+/g, ''));
    });
  });

  describe('Disabled Components / Studio Comments', () => {
    it('should export and import disabled components using Studio [STUDIO:...] comments', () => {
      const mockNode: FlowNode = {
        id: 'node-3',
        type: 'logger',
        kind: 'leaf',
        label: 'My Debug Logger',
        disabled: true,
        x: 0,
        y: 0,
        config: {
          payload: '"logging info"',
        },
        status: 'idle',
      };

      const xml = exportFlowToMuleXml('DisabledFlow', [mockNode]);
      expect(xml).toContain('<!-- [STUDIO:"My Debug Logger"]');
      expect(xml).toContain('<logger level="INFO"');
      expect(xml).toContain('[STUDIO] -->');

      // Import back
      const imported = importMuleXml(xml);
      expect(imported.ok).toBe(true);
      if (imported.ok) {
        expect(imported.nodes.length).toBe(1);
        expect(imported.nodes[0].disabled).toBe(true);
        expect(imported.nodes[0].type).toBe('logger');
        expect(imported.nodes[0].label).toBe('My Debug Logger');
      }
    });
  });

  describe('Attribute Extraction & Skeletons', () => {
    it('should scan flow scripts and generate correct empty attribute skeletons', () => {
      const flowXml = `
        <mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core">
          <flow name="test">
            <set-payload value="#[attributes.queryParams.accountId]"/>
            <logger message="#[attributes.headers.'x-correlation-id']"/>
            <set-variable variableName="uri" value="#[attributes.uriParams['customerId']]"/>
          </flow>
        </mule>
      `;

      const result = importMuleXml(flowXml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.suggestedAttributes).toEqual({
          uriParams: { customerId: '' },
          queryParams: { accountId: '' },
          headers: { 'x-correlation-id': '' },
        });
      }
    });

    it('should return null suggestedAttributes when flow references no inbound attributes', () => {
      const flowXml = `
        <mule xmlns="http://www.mulesoft.org/schema/mule/core">
          <flow name="test">
            <set-payload value="constantValue"/>
          </flow>
        </mule>
      `;
      const result = importMuleXml(flowXml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.suggestedAttributes).toBeNull();
      }
    });
  });

  describe('End-to-End Connector Round-trips', () => {
    it('should roundtrip Salesforce query operation correctly', () => {
      const sfNode: FlowNode = {
        id: 'sf-node',
        type: 'salesforce',
        kind: 'leaf',
        label: 'SF Account Query',
        x: 0,
        y: 0,
        config: {
          operation: 'query',
          request: 'SELECT Id, Name FROM Account',
          mockResponse: '[{"Id":"001"}]',
          mockMime: 'application/json',
        },
        status: 'idle',
      };

      const xml = exportFlowToMuleXml('SFFlow', [sfNode]);
      expect(xml).toContain('<salesforce:query');
      expect(xml).toContain('<salesforce:salesforce-query><![CDATA[SELECT Id, Name FROM Account]]></salesforce:salesforce-query>');
      expect(xml).toContain('Salesforce_Config');

      // Import
      const imported = importMuleXml(xml);
      expect(imported.ok).toBe(true);
      if (imported.ok) {
        expect(imported.nodes.length).toBe(1);
        const importedNode = imported.nodes[0];
        expect(importedNode.type).toBe('salesforce');
        expect(importedNode.config.operation).toBe('query');
        expect(importedNode.config.request).toBe('SELECT Id, Name FROM Account');
        // Check metadata comment re-attachment
        expect(importedNode.config.mockResponse).toBe('[{"Id":"001"}]');
      }
    });

    it('should roundtrip Database select operation correctly', () => {
      const dbNode: FlowNode = {
        id: 'db-node',
        type: 'database',
        kind: 'leaf',
        label: 'Fetch Users',
        x: 0,
        y: 0,
        config: {
          operation: 'select',
          request: 'SELECT * FROM users WHERE status = :status',
          mockResponse: '[]',
        },
        status: 'idle',
      };

      const xml = exportFlowToMuleXml('DbFlow', [dbNode]);
      expect(xml).toContain('<db:select');
      expect(xml).toContain('<db:sql><![CDATA[SELECT * FROM users WHERE status = :status]]></db:sql>');

      const imported = importMuleXml(xml);
      expect(imported.ok).toBe(true);
      if (imported.ok) {
        expect(imported.nodes.length).toBe(1);
        const importedNode = imported.nodes[0];
        expect(importedNode.type).toBe('database');
        expect(importedNode.config.operation).toBe('select');
        expect(importedNode.config.request).toBe('SELECT * FROM users WHERE status = :status');
      }
    });

    it('round-trips Salesforce bind parameters (<salesforce:parameters>)', () => {
      const sfNode: FlowNode = {
        id: 'sf', type: 'salesforce', kind: 'leaf', label: 'Q', x: 0, y: 0, status: 'idle',
        config: { operation: 'query', request: 'SELECT Id FROM Loan__c WHERE Id IN (:idList)', bindParams: '{ idList: vars.idList }', mockResponse: '[]' },
      };
      const xml = exportFlowToMuleXml('F', [sfNode]);
      expect(xml).toContain('<salesforce:parameters><![CDATA[#[{ idList: vars.idList }]]]></salesforce:parameters>');
      const imported = importMuleXml(xml);
      expect(imported.ok && imported.nodes[0].config.bindParams).toBe('{ idList: vars.idList }');
    });

    it('imports bind params from hand-written Mule XML (the connector "parameters" CDATA)', () => {
      const xml = `<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:salesforce="http://www.mulesoft.org/schema/mule/salesforce">
        <flow name="f">
          <salesforce:query config-ref="Salesforce_Config">
            <salesforce:salesforce-query><![CDATA[SELECT Id FROM Loan_Application__c WHERE Loan_Application_ID__c IN (:idList)]]></salesforce:salesforce-query>
            <salesforce:parameters><![CDATA[#[{ idList: vars.idList }]]]></salesforce:parameters>
          </salesforce:query>
        </flow>
      </mule>`;
      const imported = importMuleXml(xml);
      expect(imported.ok).toBe(true);
      if (imported.ok) {
        expect(imported.nodes[0].config.request).toContain(':idList');
        expect(imported.nodes[0].config.bindParams).toBe('{ idList: vars.idList }');
      }
    });

    it('round-trips Database input-parameters', () => {
      const dbNode: FlowNode = {
        id: 'db', type: 'database', kind: 'leaf', label: 'Q', x: 0, y: 0, status: 'idle',
        config: { operation: 'select', request: 'SELECT * FROM t WHERE id = :id', bindParams: '{ id: payload.id }', mockResponse: '[]' },
      };
      const xml = exportFlowToMuleXml('F', [dbNode]);
      expect(xml).toContain('<db:input-parameters><![CDATA[#[{ id: payload.id }]]]></db:input-parameters>');
      const imported = importMuleXml(xml);
      expect(imported.ok && imported.nodes[0].config.bindParams).toBe('{ id: payload.id }');
    });
  });

  describe('Scope Nodes & Branches', () => {
    it('should export and import Choice routers with predicates and Otherwise branches', () => {
      const choiceNode: FlowNode = {
        id: 'choice-1',
        type: 'choice',
        kind: 'scope',
        label: 'Route Request',
        x: 0,
        y: 0,
        config: {},
        branches: [
          {
            id: 'b1',
            predicate: 'payload.amount > 1000',
            nodes: [
              {
                id: 'n1',
                type: 'logger',
                kind: 'leaf',
                label: 'Log High Amount',
                x: 0,
                y: 0,
                config: { payload: '"large payment"' },
                status: 'idle',
              }
            ],
          },
          {
            id: 'b2',
            isOtherwise: true,
            nodes: [
              {
                id: 'n2',
                type: 'set-payload',
                kind: 'leaf',
                label: 'Set Low Default',
                x: 0,
                y: 0,
                config: { payload: '0', payloadMime: 'application/json' },
                status: 'idle',
              }
            ],
          }
        ],
        status: 'idle',
      };

      const xml = exportFlowToMuleXml('ChoiceFlow', [choiceNode]);
      expect(xml).toContain('<choice');
      expect(xml).toContain('<when expression="#[payload.amount &gt; 1000]">');
      expect(xml).toContain('<otherwise>');

      const imported = importMuleXml(xml);
      expect(imported.ok).toBe(true);
      if (imported.ok) {
        expect(imported.nodes.length).toBe(1);
        const choice = imported.nodes[0];
        expect(choice.type).toBe('choice');
        expect(choice.branches?.length).toBe(2);

        expect(choice.branches?.[0].predicate).toBe('payload.amount > 1000');
        expect(choice.branches?.[0].nodes[0].type).toBe('logger');

        expect(choice.branches?.[1].isOtherwise).toBe(true);
        expect(choice.branches?.[1].nodes[0].type).toBe('set-payload');
      }
    });

    it('should gracefully import unknown XML elements as Logger nodes with original tags', () => {
      const unknownXml = `
        <mule xmlns="http://www.mulesoft.org/schema/mule/core">
          <flow name="test">
            <custom-connector:unsupported-operation doc:name="Unknown Component" config-ref="Conf"/>
          </flow>
        </mule>
      `;

      const result = importMuleXml(unknownXml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.nodes.length).toBe(1);
        expect(result.nodes[0].type).toBe('logger');
        expect(result.nodes[0].label).toContain('(unsupported: unsupported-operation)');
        expect(result.warnings.length).toBe(1);
        expect(result.warnings[0]).toContain('unsupported: unsupported-operation');
      }
    });

    it('round-trips an unsupported element verbatim through import → export', () => {
      const original = '<batch:job jobName="bj"><batch:process-records/></batch:job>';
      const xml = `<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:batch="http://www.mulesoft.org/schema/mule/batch"><flow name="f">${original}</flow></mule>`;

      const imported = importMuleXml(xml);
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;
      // The placeholder logger carries the element's verbatim source XML…
      expect(imported.nodes[0].type).toBe('logger');
      expect(imported.nodes[0].config.rawXml).toContain('batch:job');
      expect(imported.nodes[0].config.rawXml).toContain('batch:process-records');

      // …so an export re-emits the real component instead of a <logger>.
      const out = exportFlowToMuleXml('f', imported.nodes);
      expect(out).toContain('batch:job');
      expect(out).toContain('batch:process-records');
      expect(out).toContain('jobName="bj"');
      expect(out).not.toMatch(/<logger[^>]*Imported from/);

      // And it stays intact across a second import → export (stable round-trip).
      const again = importMuleXml(out);
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.nodes[0].config.rawXml).toContain('batch:job');
    });
  });
});

// ---------------------------------------------------------------------------
// Regression suite for the connector shapes / scopes / fixes added in 1.5.x.
// Mostly export -> import round-trips (robust to formatting) plus a few targeted
// assertions on the emitted XML for shape-specific bug fixes.
// ---------------------------------------------------------------------------

let _tid = 0;
const leaf = (type: FlowNode['type'], config: FlowNode['config'] = {}, extra: Partial<FlowNode> = {}): FlowNode => ({
  id: `n${++_tid}`, type, kind: 'leaf', label: (extra.label ?? type) as string, x: extra.x ?? 0, y: 0, config, status: 'idle', ...extra,
});
const scope = (type: FlowNode['type'], branches: NonNullable<FlowNode['branches']>, extra: Partial<FlowNode> = {}): FlowNode => ({
  id: `s${++_tid}`, type, kind: 'scope', label: (extra.label ?? type) as string, x: extra.x ?? 0, y: 0, config: extra.config ?? {}, branches, status: 'idle', ...extra,
});
/** export -> import, asserting the import succeeded. Returns { xml, nodes }. */
const roundtrip = (nodes: FlowNode[]) => {
  const xml = exportFlowToMuleXml('TestFlow', nodes);
  const r = importMuleXml(xml);
  if (!r.ok) throw new Error(`import failed: ${r.error}\n--- xml ---\n${xml}`);
  return { xml, nodes: r.nodes };
};

describe('muleXmlIO — Salesforce DML shapes (Mule 4)', () => {
  it('emits records as a <salesforce:records> CHILD (never a records="" attribute)', () => {
    const xml = exportFlowToMuleXml('F', [leaf('salesforce', { operation: 'update', request: 'vars.recs' }, { label: 'Upd' })]);
    expect(xml).toContain('<salesforce:update');
    expect(xml).toContain('<salesforce:records><![CDATA[#[vars.recs]]]></salesforce:records>');
    expect(xml).not.toContain('records="'); // the Mule-3 attribute shape is invalid in M4
  });

  it('round-trips update with a custom records expression', () => {
    const { nodes } = roundtrip([leaf('salesforce', { operation: 'update', request: 'vars.recs' })]);
    expect(nodes[0].type).toBe('salesforce');
    expect(nodes[0].config.operation).toBe('update');
    expect(nodes[0].config.request).toBe('vars.recs');
  });

  it('omits the records child when the expression defaults to payload', () => {
    const xml = exportFlowToMuleXml('F', [leaf('salesforce', { operation: 'update', request: '' })]);
    expect(xml).toContain('<salesforce:update');
    expect(xml).not.toContain('<salesforce:records>');
    expect(xml).toContain('type="UnknownObject"');
  });

  it('maps Studio insert -> M4 <salesforce:create>, and create imports back as insert', () => {
    const xml = exportFlowToMuleXml('F', [leaf('salesforce', { operation: 'insert', request: '' })]);
    expect(xml).toContain('<salesforce:create');
    expect(xml).not.toContain('<salesforce:insert');
    const r = importMuleXml(xml);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nodes[0].config.operation).toBe('insert');
  });

  it('emits <salesforce:delete> with no type and no records child', () => {
    const xml = exportFlowToMuleXml('F', [leaf('salesforce', { operation: 'delete' })]);
    expect(xml).toContain('<salesforce:delete');
    expect(xml).not.toContain('type=');
    expect(xml).not.toContain('<salesforce:records>');
  });

  it('still imports a legacy records="" attribute (back-compat)', () => {
    const legacy = `<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:salesforce="http://www.mulesoft.org/schema/mule/salesforce">
      <flow name="f"><salesforce:create type="Account" records="#[vars.old]" config-ref="Salesforce_Config"/></flow></mule>`;
    const r = importMuleXml(legacy);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nodes[0].config.request).toBe('vars.old');
  });
});

describe('muleXmlIO — for-each vs parallel-foreach', () => {
  const body = (): NonNullable<FlowNode['branches']> => [{ id: 'b', nodes: [leaf('logger', { payload: '#[payload]' })] }];

  it('regular foreach gets counterVariableName', () => {
    const xml = exportFlowToMuleXml('F', [scope('for-each', body(), { config: { forEachCollection: 'payload.items', forEachCounter: 'i' } })]);
    expect(xml).toContain('<foreach');
    expect(xml).toContain('counterVariableName="i"');
    expect(xml).toContain('collection="#[payload.items]"');
  });

  it('parallel-foreach must NOT emit counterVariableName (schema violation), but emits maxConcurrency', () => {
    const xml = exportFlowToMuleXml('F', [scope('parallel-for-each', body(), { config: { forEachCollection: 'payload', maxConcurrency: 8 } })]);
    expect(xml).toContain('<parallel-foreach');
    expect(xml).not.toContain('counterVariableName');
    expect(xml).toContain('maxConcurrency="8"');
  });
});

describe('muleXmlIO — flow-ref', () => {
  it('round-trips name + target', () => {
    const xml = exportFlowToMuleXml('F', [leaf('flow-ref', { flowRefName: 'sub-flow-a', saveToVariable: 'apilog' }, { label: 'Call A' })]);
    expect(xml).toContain('<flow-ref');
    expect(xml).toContain('name="sub-flow-a"');
    expect(xml).toContain('target="apilog"');
    const r = importMuleXml(xml);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nodes[0].type).toBe('flow-ref');
      expect(r.nodes[0].config.flowRefName).toBe('sub-flow-a');
      expect(r.nodes[0].config.saveToVariable).toBe('apilog');
    }
  });
});

describe('muleXmlIO — namespace auto-repair & multi-flow', () => {
  it('imports a bare <flow> fragment with no <mule> root or xmlns declarations', () => {
    const frag = `<flow name="fetch"><set-variable variableName="x" value="#[attributes.uriParams.id]" doc:name="x"/><logger doc:name="L" message="#[payload]"/></flow>`;
    const r = importMuleXml(frag);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.flowName).toBe('fetch');
      expect(r.nodes.length).toBe(2);
    }
  });

  it('imports a bare <sub-flow> fragment', () => {
    const r = importMuleXml(`<sub-flow name="helper"><logger doc:name="L"/></sub-flow>`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flowName).toBe('helper');
  });

  it('returns every flow + sub-flow in allFlows (first = active)', () => {
    const xml = `<mule xmlns="http://www.mulesoft.org/schema/mule/core">
      <flow name="main"><logger doc:name="A"/></flow>
      <sub-flow name="sub1"><logger doc:name="B"/></sub-flow>
      <flow name="other"><logger doc:name="C"/></flow></mule>`;
    const r = importMuleXml(xml);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.allFlows.map((f) => f.name)).toEqual(['main', 'sub1', 'other']);
      expect(r.flowName).toBe('main');
      expect(r.nodes).toBe(r.allFlows[0].nodes);
    }
  });

  it('round-trips a multi-flow document via exportFlowsToMuleXml, preserving flow/sub-flow kinds', () => {
    const xml = `<mule xmlns="http://www.mulesoft.org/schema/mule/core">
      <flow name="main"><logger doc:name="A"/></flow>
      <sub-flow name="sub1"><logger doc:name="B"/></sub-flow>
      <flow name="other"><logger doc:name="C"/></flow></mule>`;
    const r1 = importMuleXml(xml);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = importMuleXml(exportFlowsToMuleXml(r1.allFlows));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.allFlows.map((f) => f.name)).toEqual(['main', 'sub1', 'other']);
    expect(r2.allFlows.map((f) => f.isSubFlow)).toEqual([false, true, false]);
    expect(r2.allFlows.every((f) => f.nodes.length === 1 && f.nodes[0].type === 'logger')).toBe(true);
  });

  it('emits <sub-flow> for a lone sub-flow and <flow> otherwise (export routing)', () => {
    const node = leaf('logger', { payload: '#[payload]' });
    const subOut = exportFlowsToMuleXml([{ name: 'helper', nodes: [node], isSubFlow: true }]);
    expect(subOut).toContain('<sub-flow name="helper"');
    expect(subOut).not.toMatch(/<flow\b/);

    const flowOut = exportFlowsToMuleXml([{ name: 'main', nodes: [node], isSubFlow: false }]);
    expect(flowOut).toContain('<flow name="main"');
    expect(flowOut).not.toContain('<sub-flow');
  });

  it('errors on empty input and on XML with no flow', () => {
    expect(importMuleXml('').ok).toBe(false);
    expect(importMuleXml('   ').ok).toBe(false);
    expect(importMuleXml('<mule xmlns="http://www.mulesoft.org/schema/mule/core"></mule>').ok).toBe(false);
  });
});

describe('muleXmlIO — set-variable expression handling', () => {
  it('exports #[...] for an expression and re-imports it as a bare fx expression', () => {
    const xml = exportFlowToMuleXml('F', [leaf('set-variable', { variableName: 'loanId', variableValue: '#[attributes.uriParams.id]', variableSource: 'raw' })]);
    expect(xml).toContain('value="#[attributes.uriParams.id]"');
    const r = importMuleXml(xml);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nodes[0].config.variableSource).toBe('expression');
      expect(r.nodes[0].config.variableValue).toBe('attributes.uriParams.id');
    }
  });

  it('round-trips an fx expression var (bare in app, #[...] in XML)', () => {
    const xml = exportFlowToMuleXml('F', [leaf('set-variable', { variableName: 'v', variableValue: 'payload.id', variableSource: 'expression' })]);
    expect(xml).toContain('value="#[payload.id]"');
    const r = importMuleXml(xml);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nodes[0].config.variableSource).toBe('expression');
      expect(r.nodes[0].config.variableValue).toBe('payload.id');
    }
  });

  it('script-sourced set-variable exports as an ee:transform and re-imports', () => {
    const xml = exportFlowToMuleXml('F', [leaf('set-variable', { variableName: 'v', variableSource: 'script', script: '%dw 2.0\noutput application/json\n---\npayload.x' })]);
    expect(xml).toContain('<ee:transform');
    expect(xml).toContain('<ee:set-variable');
    const r = importMuleXml(xml);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nodes[0].config.saveToVariable).toBe('v');
  });
});

describe('muleXmlIO — studio comment escaping (--- safety)', () => {
  it('round-trips a payload containing -- / --- / ] without breaking the XML comment', () => {
    const tricky = 'a -- b --- c ]] d';
    const { nodes } = roundtrip([leaf('set-payload', { payload: tricky, payloadMime: 'application/json' })]);
    expect(nodes[0].config.payload).toBe(tricky);
  });

  it('round-trips a disabled transform whose script contains --- and ]]>', () => {
    const node = leaf('transform', { script: '%dw 2.0\noutput application/json\n---\n{ a: payload[0] }' }, { disabled: true, label: 'Disabled DW' });
    const xml = exportFlowToMuleXml('F', [node]);
    expect(xml).toContain('[STUDIO:"Disabled DW"]');
    expect(xml).not.toContain('---]]>'); // would be a broken comment; must be escaped
    const r = importMuleXml(xml);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nodes[0].disabled).toBe(true);
      expect(r.nodes[0].type).toBe('transform');
      expect(r.nodes[0].config.script).toContain('payload[0]');
    }
  });
});

describe('muleXmlIO — scopes round-trip', () => {
  it('try / error-handler', () => {
    const node = scope('try', [
      { id: 'm', isErrorHandler: false, nodes: [leaf('logger', { payload: '#[payload]' }, { label: 'main' })] },
      { id: 'h', isErrorHandler: true, nodes: [leaf('logger', { payload: '#["err"]' }, { label: 'onErr' })] },
    ], { label: 'Try' });
    const { nodes } = roundtrip([node]);
    expect(nodes[0].type).toBe('try');
    const handler = nodes[0].branches?.find((b) => b.isErrorHandler);
    expect(handler).toBeTruthy();
    expect(handler?.nodes[0].type).toBe('logger');
  });

  it('scatter-gather preserves aggregator strategy via studio meta', () => {
    const node = scope('scatter-gather', [
      { id: 'r1', label: 'route1', nodes: [leaf('logger', {}, { label: 'L1' })] },
      { id: 'r2', label: 'route2', nodes: [leaf('logger', {}, { label: 'L2' })] },
    ], { label: 'SG', config: { aggregatorStrategy: 'array' } });
    const { nodes } = roundtrip([node]);
    expect(nodes[0].type).toBe('scatter-gather');
    expect(nodes[0].branches?.length).toBe(2);
    expect(nodes[0].config.aggregatorStrategy).toBe('array');
  });

  it('async + first-successful + round-robin import as their own types', () => {
    for (const t of ['async', 'first-successful', 'round-robin'] as const) {
      const node = scope(t, [{ id: 'b', label: 'r1', nodes: [leaf('logger', {}, { label: 'L' })] }], { label: t });
      const { nodes } = roundtrip([node]);
      expect(nodes[0].type).toBe(t);
    }
  });

  it('nested choice-in-choice preserves the hierarchy', () => {
    const inner = scope('choice', [
      { id: 'iw', predicate: 'vars.x == 1', nodes: [leaf('logger', {}, { label: 'inner-when' })] },
      { id: 'io', isOtherwise: true, nodes: [leaf('logger', {}, { label: 'inner-else' })] },
    ], { label: 'Inner' });
    const outer = scope('choice', [
      { id: 'ow', predicate: 'payload.ok', nodes: [inner] },
      { id: 'oo', isOtherwise: true, nodes: [leaf('logger', {}, { label: 'outer-else' })] },
    ], { label: 'Outer' });
    const { nodes } = roundtrip([outer]);
    expect(nodes[0].type).toBe('choice');
    const innerImported = nodes[0].branches?.[0].nodes[0];
    expect(innerImported?.type).toBe('choice');
    expect(innerImported?.branches?.length).toBe(2);
  });

  it('a disabled scope round-trips as a [STUDIO] comment and re-imports disabled', () => {
    const node = scope('choice', [
      { id: 'w', predicate: 'payload.a > 1', nodes: [leaf('logger', {}, { label: 'L' })] },
      { id: 'o', isOtherwise: true, nodes: [] },
    ], { label: 'Disabled Choice', disabled: true });
    const xml = exportFlowToMuleXml('F', [node]);
    expect(xml).toContain('[STUDIO:"Disabled Choice"]');
    const r = importMuleXml(xml);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nodes.length).toBe(1);
      expect(r.nodes[0].disabled).toBe(true);
      expect(r.nodes[0].type).toBe('choice');
    }
  });
});

describe('muleXmlIO — hardening / edge cases', () => {
  it('sanitizes flow names (spaces, punctuation, leading digit)', () => {
    const xml = exportFlowToMuleXml('123 my flow! (v2)', [leaf('logger', {}, { label: 'L' })]);
    // non-identifier chars → _, and a leading non-letter gets an f_ prefix
    expect(xml).toMatch(/<flow name="f_123_my_flow___v2_"/);
    expect(importMuleXml(xml).ok).toBe(true);
  });

  it('round-trips a label containing XML special chars and quotes', () => {
    const label = `A & B <c> "d" 'e'`;
    const { nodes } = roundtrip([leaf('logger', { payload: '#[payload]' }, { label })]);
    expect(nodes[0].label).toBe(label);
  });

  it('round-trips a DISABLED node whose label contains ] and -- (escaping in the STUDIO comment)', () => {
    const label = 'weird ] name -- end';
    const node = leaf('logger', { payload: '#[payload]' }, { disabled: true, label });
    const xml = exportFlowToMuleXml('F', [node]);
    const r = importMuleXml(xml);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nodes[0].disabled).toBe(true);
      expect(r.nodes[0].label).toBe(label);
    }
  });

  it('round-trips a choice with several when branches + otherwise', () => {
    const branches: NonNullable<FlowNode['branches']> = [
      { id: 'w1', predicate: 'payload.a == 1', nodes: [leaf('logger', {}, { label: 'one' })] },
      { id: 'w2', predicate: 'payload.a == 2', nodes: [leaf('logger', {}, { label: 'two' })] },
      { id: 'w3', predicate: 'payload.a == 3', nodes: [leaf('logger', {}, { label: 'three' })] },
      { id: 'o', isOtherwise: true, nodes: [leaf('logger', {}, { label: 'else' })] },
    ];
    const { nodes } = roundtrip([scope('choice', branches, { label: 'Multi' })]);
    expect(nodes[0].branches?.length).toBe(4);
    expect(nodes[0].branches?.filter((b) => b.isOtherwise).length).toBe(1);
    expect(nodes[0].branches?.[1].predicate).toBe('payload.a == 2');
  });

  it('round-trips deeply nested scopes (choice > try > choice)', () => {
    const deepest = scope('choice', [
      { id: 'dw', predicate: 'vars.y', nodes: [leaf('logger', {}, { label: 'deep' })] },
      { id: 'do', isOtherwise: true, nodes: [] },
    ], { label: 'Deepest' });
    const mid = scope('try', [
      { id: 'm', nodes: [deepest] },
      { id: 'h', isErrorHandler: true, nodes: [leaf('logger', {}, { label: 'err' })] },
    ], { label: 'Try' });
    const top = scope('choice', [
      { id: 'tw', predicate: 'payload.x', nodes: [mid] },
      { id: 'to', isOtherwise: true, nodes: [] },
    ], { label: 'Top' });
    const { nodes } = roundtrip([top]);
    const tryNode = nodes[0].branches?.[0].nodes[0];
    expect(tryNode?.type).toBe('try');
    const deepChoice = tryNode?.branches?.find((b) => !b.isErrorHandler)?.nodes[0];
    expect(deepChoice?.type).toBe('choice');
  });

  it('for-each round-trips its collection and counter name', () => {
    const node = scope('for-each', [{ id: 'b', nodes: [leaf('logger', {}, { label: 'L' })] }], {
      config: { forEachCollection: 'payload.items', forEachCounter: 'idx' },
    });
    const { nodes } = roundtrip([node]);
    expect(nodes[0].config.forEachCollection).toBe('payload.items');
    expect(nodes[0].config.forEachCounter).toBe('idx');
  });

  it('flow-ref with no explicit name falls back to the label', () => {
    const xml = exportFlowToMuleXml('F', [leaf('flow-ref', {}, { label: 'do-the-thing' })]);
    expect(xml).toContain('name="do-the-thing"');
    const r = importMuleXml(xml);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nodes[0].config.flowRefName).toBe('do-the-thing');
  });

  it('exportFlowsToMuleXml of an empty list yields a flow-less doc that fails import cleanly', () => {
    const xml = exportFlowsToMuleXml([]);
    expect(xml).toContain('<mule');
    expect(xml).toContain('</mule>');
    expect(importMuleXml(xml).ok).toBe(false);
  });

  it('survives a disabled scope that itself contains a disabled child (nested STUDIO comments)', () => {
    const innerDisabled = leaf('logger', { payload: '#[payload]' }, { disabled: true, label: 'inner off' });
    const outer = scope('choice', [
      { id: 'w', predicate: 'payload.x', nodes: [innerDisabled, leaf('logger', {}, { label: 'on' })] },
      { id: 'o', isOtherwise: true, nodes: [] },
    ], { label: 'Outer off', disabled: true });
    const xml = exportFlowToMuleXml('F', [outer]);
    // No raw "--" may leak into the emitted XML comment (would be invalid).
    expect(importMuleXml(xml).ok).toBe(true);
    const r = importMuleXml(xml);
    if (r.ok) {
      expect(r.nodes.length).toBe(1);
      expect(r.nodes[0].disabled).toBe(true);
      expect(r.nodes[0].type).toBe('choice');
    }
  });

  it('round-trips a mock response containing comment-breaking chars (-- / ]]> / -->)', () => {
    const mock = '{ "note": "a -- b", "raw": "x]]> y -->" }';
    const { nodes } = roundtrip([leaf('salesforce', { operation: 'query', request: 'SELECT Id FROM A', mockResponse: mock })]);
    expect(nodes[0].config.mockResponse).toBe(mock);
  });
});

describe('muleXmlIO — real example files (local only)', () => {
  // The example/ dir is gitignored (real workplace XML the user pastes in), so
  // this is skipped in CI but gives a local regression net against actual data.
  const dir = join(process.cwd(), 'example');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(txt|xml)$/i.test(f)) : [];

  it.skipIf(files.length === 0)('imports every example file without crashing', () => {
    let imported = 0;
    for (const f of files) {
      const xml = readFileSync(join(dir, f), 'utf8');
      const r = importMuleXml(xml); // must never throw
      if (r.ok) {
        imported++;
        expect(r.allFlows.length).toBeGreaterThan(0);
        // every imported flow should round-trip through export without throwing
        expect(() => exportFlowsToMuleXml(r.allFlows)).not.toThrow();
      } else {
        expect(typeof r.error).toBe('string');
      }
    }
    // at least one example should be a parseable Mule flow
    expect(imported).toBeGreaterThan(0);
  });
});

describe('muleXmlIO — realistic multi-flow integration', () => {
  // Mirrors a real workplace document: a main flow that reads inbound attributes,
  // routes on a Choice, calls Salesforce, references a sub-flow, has a disabled
  // node, plus a separate <sub-flow>. Imported -> exported whole -> re-imported.
  const REAL = `<mule xmlns="http://www.mulesoft.org/schema/mule/core"
        xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
        xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core"
        xmlns:salesforce="http://www.mulesoft.org/schema/mule/salesforce">
    <flow name="process-payment" doc:id="abc">
      <set-variable variableName="opType" value="#[attributes.queryParams.opType default 'CREATE']" doc:name="opType"/>
      <set-variable variableName="leadId" value="#[attributes.uriParams.'lead-id']" doc:name="leadId"/>
      <choice doc:name="Route by op">
        <when expression="#[vars.opType == 'CREATE']">
          <salesforce:create type="Lead__c" doc:name="Create Lead" config-ref="Salesforce_Config">
            <salesforce:records><![CDATA[#[payload]]]></salesforce:records>
          </salesforce:create>
          <logger level="INFO" doc:name="Created" message="#[payload]"/>
        </when>
        <otherwise>
          <salesforce:query doc:name="Find Lead" config-ref="Salesforce_Config">
            <salesforce:salesforce-query><![CDATA[#[payload]]]></salesforce:salesforce-query>
          </salesforce:query>
        </otherwise>
      </choice>
      <flow-ref doc:name="audit" name="save-audit-log" target="auditResult"/>
      <logger level="DEBUG" doc:name="trace" message="#[vars.auditResult]"/>
    </flow>
    <sub-flow name="save-audit-log">
      <ee:transform doc:name="Build audit"><ee:message/><ee:variables>
        <ee:set-variable variableName="audit"><![CDATA[%dw 2.0
output application/json
---
{ at: now(), op: vars.opType }]]></ee:set-variable>
      </ee:variables></ee:transform>
      <logger level="INFO" doc:name="Audit logged" message="#[vars.audit]"/>
    </sub-flow>
  </mule>`;

  it('imports the whole document, then survives an export -> re-import round-trip', () => {
    const r1 = importMuleXml(REAL);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // both flows present, kinds correct
    expect(r1.allFlows.map((f) => f.name)).toEqual(['process-payment', 'save-audit-log']);
    expect(r1.allFlows.map((f) => f.isSubFlow)).toEqual([false, true]);

    // inbound attributes were surfaced for the input fixture
    expect(r1.suggestedAttributes?.queryParams).toHaveProperty('opType');
    expect(r1.suggestedAttributes?.uriParams).toHaveProperty('lead-id');

    // main flow shape: 2 set-vars, a choice, a flow-ref, a logger
    const main = r1.allFlows[0].nodes;
    expect(main.map((n) => n.type)).toEqual(['set-variable', 'set-variable', 'choice', 'flow-ref', 'logger']);
    const choice = main[2];
    expect(choice.branches?.[0].predicate).toContain("vars.opType == 'CREATE'");
    expect(choice.branches?.[0].nodes[0].type).toBe('salesforce');
    expect(choice.branches?.[0].nodes[0].config.operation).toBe('insert'); // create -> insert
    expect(main[3].config.flowRefName).toBe('save-audit-log');
    expect(main[3].config.saveToVariable).toBe('auditResult');

    // round-trip the whole collection
    const r2 = importMuleXml(exportFlowsToMuleXml(r1.allFlows));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.allFlows.map((f) => f.name)).toEqual(['process-payment', 'save-audit-log']);
    expect(r2.allFlows.map((f) => f.isSubFlow)).toEqual([false, true]);
    expect(r2.allFlows[0].nodes.map((n) => n.type)).toEqual(['set-variable', 'set-variable', 'choice', 'flow-ref', 'logger']);
    // the variable expressions still carry their #[...] form (so they evaluate)
    expect(r2.allFlows[0].nodes[0].config.variableValue).toContain('attributes.queryParams.opType');
  });
});

describe('muleXmlIO — connectors & transform round-trips', () => {
  it('http-request preserves method/url + headers/body via studio meta', () => {
    const node = leaf('http-request', {
      httpMethod: 'POST', httpUrl: 'https://api.test/v1', httpHeaders: '{"x":"y"}', httpBody: '#[payload]',
      mockResponse: '{ "ok": true }', mockMime: 'application/json',
    }, { label: 'Call API' });
    const { nodes } = roundtrip([node]);
    expect(nodes[0].type).toBe('http-request');
    expect(nodes[0].config.httpMethod).toBe('POST');
    expect(nodes[0].config.httpUrl).toBe('https://api.test/v1');
    expect(nodes[0].config.httpHeaders).toBe('{"x":"y"}');
  });

  it('transform with saveToVariable round-trips script + target', () => {
    const node = leaf('transform', { script: '%dw 2.0\noutput application/json\n---\n{ id: payload.id }', saveToVariable: 'result' }, { label: 'T' });
    const { xml, nodes } = roundtrip([node]);
    expect(xml).toContain('<ee:variables>');
    expect(nodes[0].type).toBe('transform');
    expect(nodes[0].config.saveToVariable).toBe('result');
    expect(nodes[0].config.script).toContain('payload.id');
  });
});
