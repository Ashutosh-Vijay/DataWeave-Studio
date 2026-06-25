/**
 * Mule 4 XML round-trip for the Flow Designer.
 *
 * Studio's flow model is a lightweight design surface; Mule 4's XML is the
 * deployment artifact. This module bridges the two:
 *
 *   exportFlowToMuleXml(name, nodes)  — Studio flow → Mule 4 XML string
 *   importMuleXml(xml)                — Mule 4 XML → Studio FlowNode[]
 *
 * Supported elements: every leaf + scope type Studio knows about.
 * Unsupported XML elements (Mule features Studio doesn't simulate) become
 * Logger nodes whose label carries the unknown tag name, so users can see
 * what was imported and where it sits in the flow.
 *
 * Studio-only data (mock responses on connectors, payload mime metadata)
 * is preserved as `<!-- studio:json ... -->` comments so an export → import
 * round-trip survives intact.
 */

import type { FlowNode, Branch, NodeType, LeafNodeType, MultipartPart } from './components/FlowDesigner';

// ---------------------------------------------------------------------------
// XML namespaces used by Mule 4 flows. Studio always emits the full set so
// the generated file is valid even if not every connector is referenced.
// ---------------------------------------------------------------------------
const NS_MULE = 'http://www.mulesoft.org/schema/mule/core';
const NS_DOC = 'http://www.mulesoft.org/schema/mule/documentation';
const NS_EE = 'http://www.mulesoft.org/schema/mule/ee/core';
const NS_HTTP = 'http://www.mulesoft.org/schema/mule/http';
const NS_DB = 'http://www.mulesoft.org/schema/mule/db';
const NS_SF = 'http://www.mulesoft.org/schema/mule/salesforce';

// Compact xmlns declarations for re-parsing an XML fragment on import (e.g. the
// inner XML of a disabled `[STUDIO:…]` comment) where prefixes must resolve.
const NS_DECL = `xmlns="${NS_MULE}" xmlns:doc="${NS_DOC}" xmlns:ee="${NS_EE}" xmlns:http="${NS_HTTP}" xmlns:db="${NS_DB}" xmlns:salesforce="${NS_SF}"`;

const ROOT_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="${NS_MULE}"
      xmlns:doc="${NS_DOC}"
      xmlns:ee="${NS_EE}"
      xmlns:http="${NS_HTTP}"
      xmlns:db="${NS_DB}"
      xmlns:salesforce="${NS_SF}"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="
${NS_MULE} http://www.mulesoft.org/schema/mule/core/current/mule.xsd
${NS_EE} http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd
${NS_HTTP} http://www.mulesoft.org/schema/mule/http/current/mule-http.xsd
${NS_DB} http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd
${NS_SF} http://www.mulesoft.org/schema/mule/salesforce/current/mule-salesforce.xsd">`;

// ---------------------------------------------------------------------------
// EXPORT — Studio FlowNode[] → Mule 4 XML
// ---------------------------------------------------------------------------

let _idCounter = 0;
function newImportId(): string {
  return `node-imp-${++_idCounter}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Escape a string for inclusion as XML text content or an attribute value. */
function escXml(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Wrap a DataWeave script in a CDATA section. Handles the rare case where
 *  the script itself contains `]]>` by splitting the CDATA into two sections. */
function cdata(s: string): string {
  if (!s) return '<![CDATA[]]>';
  return '<![CDATA[' + s.replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';
}

/** Build an `attr="value"` pair only when the value is non-empty. */
function attr(name: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  return ` ${name}="${escXml(String(value))}"`;
}

/** Indent each non-empty line by `level` levels of 4 spaces. */
function indent(text: string, level: number): string {
  const pad = '    '.repeat(level);
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n');
}

/** Build the standard `doc:name="..." doc:id="..."` attribute pair. */
function docAttrs(node: FlowNode): string {
  return attr('doc:name', node.label) + attr('doc:id', node.id);
}

/** Studio-only metadata embedded as an XML comment so it survives the round
 *  trip without polluting the deployable Mule XML. Imported back by the
 *  importer when it encounters the same marker. */
function studioComment(payload: Record<string, unknown>): string {
  // Strip undefined/empty values so the comment isn't noisy.
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null && v !== '') clean[k] = v;
  }
  if (Object.keys(clean).length === 0) return '';
  // `--` is illegal inside an XML comment (and JSON-encoded DataWeave often
  // contains `---`), so escape it the same way Studio does: `--` → `&#45;&#45;`.
  return `<!-- studio:${escXml(JSON.stringify(clean)).replace(/--/g, '&#45;&#45;')} -->`;
}

/** Convert one leaf node to its Mule XML element. */
function leafToXml(node: FlowNode): string {
  switch (node.type as LeafNodeType) {
    case 'set-payload': {
      const value = node.config.payload || '';
      const mime = node.config.payloadMime;
      // Mule's `value` attribute is treated as a DataWeave expression when
      // it's wrapped in #[…]. Studio's set-payload stores LITERAL data, not
      // expressions — wrapping `Hello` as `#[Hello]` would make Mule try to
      // resolve `Hello` as an identifier at runtime. Only re-wrap when the
      // user explicitly typed `#[…]`; otherwise emit the value as a literal.
      const looksLikeExpr = value.trim().startsWith('#[');
      const lines: string[] = [
        `<set-payload${attr('value', looksLikeExpr ? value : cdataish(value))}${attr('mimeType', mime)}${docAttrs(node)}/>`,
      ];
      // Embed Studio-only data so import can reconstruct mime + parts + binary refs.
      const meta = studioComment({
        type: 'set-payload',
        rawPayload: value,
        payloadMime: mime,
        multipartParts: node.config.multipartParts,
        payloadFilePath: node.config.payloadFilePath,
        queryParams: node.config.queryParams,
        attributes: node.config.attributes,
      });
      if (meta) lines.push(meta);
      return lines.join('\n');
    }
    case 'transform': {
      const script = node.config.script || '%dw 2.0\noutput application/json\n---\npayload';
      const saveTo = node.config.saveToVariable;
      // Studio's saveToVariable corresponds to <ee:set-variable variableName="..."> in EE Transform.
      const target = saveTo
        ? `<ee:variables>\n    <ee:set-variable${attr('variableName', saveTo)}>${cdata(script)}</ee:set-variable>\n</ee:variables>`
        : `<ee:message>\n    <ee:set-payload>${cdata(script)}</ee:set-payload>\n</ee:message>`;
      return `<ee:transform${docAttrs(node)}>\n${indent(target, 1)}\n</ee:transform>`;
    }
    case 'set-variable': {
      const name = node.config.variableName || 'myVar';
      const isScript = node.config.variableSource === 'script' && node.config.script;
      if (isScript) {
        // Script-sourced var → wrap in an EE Transform so DataWeave can run.
        return `<ee:transform${docAttrs(node)}>\n    <ee:variables>\n        <ee:set-variable${attr('variableName', name)}>${cdata(node.config.script!)}</ee:set-variable>\n    </ee:variables>\n</ee:transform>`;
      }
      // fx expressions are stored bare → re-wrap as #[…]. Literal values stay
      // literal (only auto-wrap a legacy raw value that already carries #[…]).
      const raw = node.config.variableValue || '';
      const value = node.config.variableSource === 'expression'
        ? `#[${raw}]`
        : (raw.trim().startsWith('#[') ? raw : cdataish(raw));
      return `<set-variable${attr('variableName', name)}${attr('value', value)}${docAttrs(node)}/>`;
    }
    case 'logger': {
      // A placeholder for an unsupported element — re-emit its original XML
      // verbatim so unknown components survive an import → export round-trip.
      if (node.config.rawXml) return node.config.rawXml;
      // Studio loggers just dump payload + vars; Mule's logger needs a message
      // expression. Use a sensible default if none is specified.
      const msg = (node.config.payload || '#[payload]').trim().startsWith('#[')
        ? (node.config.payload || '#[payload]')
        : `#[${cdataish(node.config.payload || '"' + node.label + '"')}]`;
      return `<logger${attr('level', 'INFO')}${attr('message', msg)}${docAttrs(node)}/>`;
    }
    case 'flow-ref': {
      const saveTo = node.config.saveToVariable;
      return `<flow-ref${attr('name', node.config.flowRefName || node.label)}${saveTo ? ` target="${escXml(saveTo)}"` : ''}${docAttrs(node)}/>`;
    }
    case 'salesforce': {
      // Mule 4 Salesforce connector (verified against the connector reference
      // and real Studio output):
      //   - query / select  → <salesforce:query><salesforce:salesforce-query>SOQL</…></…>
      //   - create / update / upsert → type="<sObject>" attribute; the records
      //       are a CONTENT child <salesforce:records>#[expr]</salesforce:records>
      //       that DEFAULTS to #[payload], so we omit it unless the user typed an
      //       expression. (`records="…"` as an attribute is INVALID and trips
      //       cvc-complex-type validation in Studio.)
      //   - delete → no type, no child; the record IDs come from #[payload].
      //   - Mule 4 renamed `insert` to `create`. We follow the M4 name.
      const op = node.config.operation || 'query';
      const expr = (node.config.request || '').trim();
      const saveTo = node.config.saveToVariable;
      const isQuery = op === 'query' || op === 'select';
      const opTag = isQuery
        ? 'query'
        : op === 'insert' ? 'create' : op; // M4 uses `create`, not `insert`
      const targetAttr = saveTo ? ` target="${escXml(saveTo)}"` : '';

      const bp = (node.config.bindParams || '').trim();
      const paramsEl = bp ? `<salesforce:parameters>${cdata(bp.startsWith('#[') ? bp : `#[${bp}]`)}</salesforce:parameters>` : '';

      let line: string;
      if (isQuery) {
        const inner = [`<salesforce:salesforce-query>${cdata(expr)}</salesforce:salesforce-query>`];
        if (paramsEl) inner.push(paramsEl);
        line = `<salesforce:query${attr('config-ref', 'Salesforce_Config')}${targetAttr}${docAttrs(node)}>\n${indent(inner.join('\n'), 1)}\n</salesforce:query>`;
      } else if (opTag === 'delete') {
        // delete takes only config-ref; the IDs to delete come from the payload.
        line = `<salesforce:delete${attr('config-ref', 'Salesforce_Config')}${targetAttr}${docAttrs(node)}/>`;
      } else {
        // create / update / upsert. Studio doesn't model the sObject name, so
        // emit a `type` placeholder the user must edit. Only emit a records
        // child when the user supplied an expression — otherwise it defaults to
        // the payload (matching how Studio writes these).
        const hasExpr = expr !== '' && expr !== 'payload' && expr !== '#[payload]';
        const head = `<salesforce:${opTag}${attr('config-ref', 'Salesforce_Config')}${attr('type', 'UnknownObject')}${targetAttr}${docAttrs(node)}`;
        if (hasExpr) {
          const wrapped = expr.startsWith('#[') ? expr : `#[${expr}]`;
          const recordsEl = `<salesforce:records>${cdata(wrapped)}</salesforce:records>`;
          line = `${head}>\n${indent(recordsEl, 1)}\n</salesforce:${opTag}>`;
        } else {
          line = `${head}/>`;
        }
      }

      const lines: string[] = [line];
      // For create/update/upsert, remind the user to set the sObject name.
      if (!isQuery && opTag !== 'delete') {
        lines.push(`<!-- TODO: set type="..." to the actual sObject name (e.g. "Account") before deploying -->`);
      }
      const meta = studioComment({
        type: 'salesforce',
        operation: op,
        mockResponse: node.config.mockResponse,
        mockMime: node.config.mockMime,
      });
      if (meta) lines.push(meta);
      return lines.join('\n');
    }
    case 'database': {
      const op = node.config.operation || 'select';
      const sql = node.config.request || '';
      const saveTo = node.config.saveToVariable;
      const targetAttr = saveTo ? ` target="${escXml(saveTo)}"` : '';
      const dbOp = op === 'query' ? 'select' : op;
      const bp = (node.config.bindParams || '').trim();
      const inner = [`<db:sql>${cdata(sql)}</db:sql>`];
      if (bp) inner.push(`<db:input-parameters>${cdata(bp.startsWith('#[') ? bp : `#[${bp}]`)}</db:input-parameters>`);
      const lines: string[] = [
        `<db:${dbOp}${attr('config-ref', 'Database_Config')}${targetAttr}${docAttrs(node)}>\n${indent(inner.join('\n'), 1)}\n</db:${dbOp}>`,
      ];
      const meta = studioComment({
        type: 'database',
        operation: op,
        mockResponse: node.config.mockResponse,
        mockMime: node.config.mockMime,
      });
      if (meta) lines.push(meta);
      return lines.join('\n');
    }
    case 'http-request': {
      const method = node.config.httpMethod || 'GET';
      const url = node.config.httpUrl || '';
      const saveTo = node.config.saveToVariable;
      const targetAttr = saveTo ? ` target="${escXml(saveTo)}"` : '';
      const lines: string[] = [
        `<http:request${attr('method', method)}${attr('url', url)}${attr('config-ref', 'HTTP_Request_Config')}${targetAttr}${docAttrs(node)}/>`,
      ];
      const meta = studioComment({
        type: 'http-request',
        httpHeaders: node.config.httpHeaders,
        httpQueryParams: node.config.httpQueryParams,
        httpBody: node.config.httpBody,
        mockResponse: node.config.mockResponse,
        mockMime: node.config.mockMime,
      });
      if (meta) lines.push(meta);
      return lines.join('\n');
    }
  }
  return `<!-- unsupported leaf node type: ${escXml(node.type)} -->`;
}

/** Wrap a DataWeave value for an attribute. Mule attributes use `#[...]`
 *  expressions; raw values that contain unsafe chars are CDATA-wrapped. */
function cdataish(s: string): string {
  // For attribute values we cannot use CDATA. Escape special chars instead.
  return s.replace(/\n/g, ' ');
}

/** Escape XML for embedding inside a Studio `[STUDIO:…]` disabled comment.
 *  `<` and `>` are legal in comments and kept intact; only `]` (which would
 *  collide with the `[STUDIO]` delimiter / CDATA closers) and `--` (illegal in
 *  comments) are escaped — exactly as Anypoint Studio does. */
function escStudioInner(xml: string): string {
  return xml.replace(/]/g, '&#93;').replace(/--/g, '&#45;&#45;');
}

/** Reverse escStudioInner. `&#45;`→`-` is applied first so a literal `&#93;`
 *  in the source survives, mirroring the comment-decode order. */
function unescStudioInner(xml: string): string {
  return xml.replace(/&#45;/g, '-').replace(/&#93;/g, ']');
}

/** Render a disabled ("Comment Out") node as Anypoint Studio's
 *  `<!-- [STUDIO:"label"]escaped-xml [STUDIO] -->` form, so it stays visible in
 *  the XML, is skipped at runtime, and survives an export → import round trip. */
function disabledToXml(node: FlowNode): string {
  const label = escStudioInner(node.label || node.type);
  // Drop our own studio:/TODO: meta comments — XML comments can't nest, and a
  // disabled node is itself a comment. The node's real config still round-trips
  // from the element's attributes/children; only Studio-only extras (mocks,
  // mime hints) are dropped for disabled nodes, matching how Studio writes them.
  const raw = nodeToXml(node)
    .split('\n')
    .filter((ln) => !/^\s*<!--\s*(studio:|TODO:)/.test(ln))
    .join('\n');
  const inner = escStudioInner(raw);
  return `<!-- [STUDIO:"${label}"]${inner} [STUDIO] -->`;
}

/** Convert a list of nodes (a branch body or the top-level flow) to a
 *  newline-joined XML fragment in left-to-right execution order. Disabled
 *  nodes are emitted as Studio comments rather than dropped. */
function branchNodesToXml(nodes: FlowNode[]): string {
  const sorted = [...nodes].sort((a, b) => a.x - b.x);
  return sorted.map((n) => (n.disabled ? disabledToXml(n) : nodeToXml(n))).join('\n');
}

/** Convert a scope node and its branches to Mule XML. */
function scopeToXml(node: FlowNode): string {
  const branches = node.branches || [];

  switch (node.type) {
    case 'choice': {
      const parts: string[] = [];
      for (const b of branches) {
        if (b.isOtherwise) {
          parts.push(`<otherwise>\n${indent(branchNodesToXml(b.nodes), 1)}\n</otherwise>`);
        } else {
          const pred = b.predicate || 'false';
          parts.push(`<when${attr('expression', `#[${cdataish(pred)}]`)}>\n${indent(branchNodesToXml(b.nodes), 1)}\n</when>`);
        }
      }
      return `<choice${docAttrs(node)}>\n${indent(parts.join('\n'), 1)}\n</choice>`;
    }
    case 'for-each':
    case 'parallel-for-each': {
      const isParallel = node.type === 'parallel-for-each';
      const tag = isParallel ? 'parallel-foreach' : 'foreach';
      const coll = node.config.forEachCollection || 'payload';
      // `counterVariableName` exists only on the regular <foreach>; emitting it
      // on <parallel-foreach> is a schema violation. parallel-foreach instead
      // takes `maxConcurrency`.
      const counterAttr = isParallel ? '' : attr('counterVariableName', node.config.forEachCounter || 'counter');
      const maxC = isParallel ? attr('maxConcurrency', String(node.config.maxConcurrency ?? 4)) : '';
      const body = branches[0] ? branchNodesToXml(branches[0].nodes) : '';
      return `<${tag}${attr('collection', `#[${cdataish(coll)}]`)}${counterAttr}${maxC}${docAttrs(node)}>\n${indent(body, 1)}\n</${tag}>`;
    }
    case 'scatter-gather': {
      const routes = branches.map((b) => `<route>\n${indent(branchNodesToXml(b.nodes), 1)}\n</route>`).join('\n');
      const meta = studioComment({ type: 'scatter-gather', aggregatorStrategy: node.config.aggregatorStrategy });
      return `<scatter-gather${docAttrs(node)}>\n${indent(routes, 1)}\n</scatter-gather>${meta ? '\n' + meta : ''}`;
    }
    case 'try': {
      const main = branches.find((b) => !b.isErrorHandler);
      const handler = branches.find((b) => b.isErrorHandler);
      const mainBody = main ? branchNodesToXml(main.nodes) : '';
      const handlerXml = handler
        ? `<error-handler>\n    <on-error-continue${attr('type', 'ANY')}>\n${indent(branchNodesToXml(handler.nodes), 2)}\n    </on-error-continue>\n</error-handler>`
        : '';
      return `<try${docAttrs(node)}>\n${indent(mainBody, 1)}${handlerXml ? '\n' + indent(handlerXml, 1) : ''}\n</try>`;
    }
    case 'first-successful': {
      const routes = branches.map((b) => `<route>\n${indent(branchNodesToXml(b.nodes), 1)}\n</route>`).join('\n');
      return `<first-successful${docAttrs(node)}>\n${indent(routes, 1)}\n</first-successful>`;
    }
    case 'round-robin': {
      const routes = branches.map((b) => `<route>\n${indent(branchNodesToXml(b.nodes), 1)}\n</route>`).join('\n');
      return `<round-robin${docAttrs(node)}>\n${indent(routes, 1)}\n</round-robin>`;
    }
    case 'async': {
      const body = branches[0] ? branchNodesToXml(branches[0].nodes) : '';
      return `<async${docAttrs(node)}>\n${indent(body, 1)}\n</async>`;
    }
  }
  return `<!-- unsupported scope: ${escXml(node.type)} -->`;
}

/** Dispatch on node kind/type. */
function nodeToXml(node: FlowNode): string {
  if (node.branches && node.branches.length > 0) return scopeToXml(node);
  return leafToXml(node);
}

/** Sanitize a flow name — Mule requires identifier-like names. */
function sanitizeFlowName(name: string): string {
  return (name || 'studioFlow').replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z_]/, 'f_$&');
}

/** Emit one `<flow>` / `<sub-flow>` block, indented to sit under <mule>. */
function flowBlock(name: string, nodes: FlowNode[], isSubFlow: boolean): string {
  const tag = isSubFlow ? 'sub-flow' : 'flow';
  return `    <${tag} name="${escXml(sanitizeFlowName(name))}">\n${indent(branchNodesToXml(nodes), 2)}\n    </${tag}>`;
}

/** Produce a complete Mule XML document for a single flow. */
export function exportFlowToMuleXml(flowName: string, nodes: FlowNode[]): string {
  return `${ROOT_HEADER}\n\n${flowBlock(flowName, nodes, false)}\n\n</mule>\n`;
}

/** Produce a complete Mule XML document for several flows / sub-flows, so a
 *  multi-flow document imported with importMuleXml can be edited and exported
 *  back whole (instead of dropping every flow but the active one). */
export function exportFlowsToMuleXml(flows: { name: string; nodes: FlowNode[]; isSubFlow?: boolean }[]): string {
  const blocks = flows.map((f) => flowBlock(f.name, f.nodes, f.isSubFlow ?? false)).join('\n\n');
  return `${ROOT_HEADER}\n\n${blocks}\n\n</mule>\n`;
}

// ---------------------------------------------------------------------------
// IMPORT — Mule 4 XML → Studio FlowNode[]
// ---------------------------------------------------------------------------

/** Strip the leading `#[` and trailing `]` from a Mule expression attribute.
 *  Returns the inner expression, or the original string if not wrapped. */
function stripExpr(s: string): string {
  const m = s.match(/^#\[(.*)\]$/s);
  return m ? m[1] : s;
}

/** Local name of a DOM element (drops namespace prefix). */
function localName(el: Element): string {
  return el.localName || el.tagName.replace(/^[^:]*:/, '');
}

/** All direct child *elements* of `el` (ignores text/whitespace). */
function childElements(el: Element): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < el.children.length; i++) out.push(el.children[i]);
  return out;
}

/** Try to recover a `<!-- studio:<JSON> -->` payload from an element's
 *  comment siblings (preceding the element or inside it). Returns null
 *  if none found or the JSON is malformed. */
function recoverStudioMeta(commentText: string): Record<string, unknown> | null {
  const m = commentText.match(/studio:(.*)/s);
  if (!m) return null;
  try {
    // Decode in reverse of the encode order: `&#45;` (our `--` escape) first,
    // and `&amp;` last so a literal entity like `&lt;` isn't double-decoded.
    const decoded = m[1]
      .replace(/&#45;/g, '-')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Parse the inner XML of an Anypoint Studio `[STUDIO:"label"]…[STUDIO]`
 *  disabled-component comment back into a FlowNode marked `disabled:true`.
 *  Returns null if the comment isn't this form or the fragment won't parse. */
function parseDisabledComment(commentText: string): FlowNode | null {
  const m = commentText.match(/^\s*\[STUDIO:"[\s\S]*?"\]([\s\S]*?)\s*\[STUDIO\]\s*$/);
  if (!m) return null;
  const inner = unescStudioInner(m[1]);
  // Wrap in a namespaced root so prefixed elements (salesforce:, ee:, …) resolve.
  const doc = new DOMParser().parseFromString(`<root ${NS_DECL}>${inner}</root>`, 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  const root = doc.documentElement;
  const childEls = childElements(root);
  if (childEls.length === 0) return null;
  // Reuse the normal element walker so studio:json metadata inside the disabled
  // block (mime, mocks, nested disabled nodes) is reattached too.
  const nodes = elementsToNodes(childEls, root);
  if (nodes.length === 0) return null;
  nodes[0].disabled = true;
  return nodes[0];
}

/** Build an empty FlowNode shell with sensible defaults. */
function makeNode(type: NodeType, label: string, config: FlowNode['config'] = {}): FlowNode {
  return {
    id: newImportId(),
    type,
    kind: (type === 'choice' || type === 'for-each' || type === 'parallel-for-each' || type === 'scatter-gather' || type === 'try' || type === 'first-successful' || type === 'round-robin' || type === 'async') ? 'scope' : 'leaf',
    label,
    x: 0,
    y: 0,
    config,
    status: 'idle',
  };
}

/** Map an array of Mule child elements to Studio FlowNodes, applying
 *  any `<!-- studio:JSON -->` comments that follow each element. */
function elementsToNodes(elements: Element[], parent: Element): FlowNode[] {
  const nodes: FlowNode[] = [];

  // Pre-walk the parent's children (mix of elements + comments) to associate
  // each studio:json comment with the element that immediately preceded it.
  const ordered: Node[] = [];
  for (let n = parent.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 || n.nodeType === 8) ordered.push(n);
  }
  let metaForNext: Record<string, unknown> | null = null;
  let elementIdx = 0;

  for (const item of ordered) {
    if (item.nodeType === 8) {
      const data = (item as Comment).data;
      // A disabled ("Comment Out") component round-trips as a [STUDIO:…] comment.
      const disabledNode = parseDisabledComment(data);
      if (disabledNode) {
        if (metaForNext) { applyStudioMeta(disabledNode, metaForNext); metaForNext = null; }
        nodes.push(disabledNode);
        continue;
      }
      // Otherwise try to recover studio metadata for the element JUST emitted.
      const meta = recoverStudioMeta(data);
      if (meta && nodes.length > 0) {
        applyStudioMeta(nodes[nodes.length - 1], meta);
      } else if (meta) {
        metaForNext = meta;
      }
      continue;
    }
    if (item.nodeType !== 1) continue;
    const el = item as Element;
    if (!elements.includes(el)) continue; // edge case — should always be true
    const node = elementToNode(el);
    if (metaForNext) { applyStudioMeta(node, metaForNext); metaForNext = null; }
    nodes.push(node);
    elementIdx++;
  }

  // Auto-assign x positions so they render left-to-right. Scopes render much
  // wider than leaves (their body flows horizontally), so advance further after
  // one to avoid the next node overlapping it on the canvas.
  let cx = 0;
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].x = cx;
    nodes[i].y = 100;
    cx += (nodes[i].branches && nodes[i].branches!.length > 0) ? 760 : 260;
  }
  return nodes;
}

/** Splice studio-only fields back into a node from a recovered comment. */
function applyStudioMeta(node: FlowNode, meta: Record<string, unknown>): void {
  const set = (key: keyof FlowNode['config'], value: unknown) => {
    if (value !== undefined && value !== null && value !== '') {
      (node.config as Record<string, unknown>)[key as string] = value;
    }
  };
  set('payloadMime', meta.payloadMime);
  set('multipartParts', meta.multipartParts as MultipartPart[] | undefined);
  set('payloadFilePath', meta.payloadFilePath);
  set('queryParams', meta.queryParams);
  set('attributes', meta.attributes);
  set('mockResponse', meta.mockResponse);
  set('mockMime', meta.mockMime);
  set('httpHeaders', meta.httpHeaders);
  set('httpQueryParams', meta.httpQueryParams);
  set('httpBody', meta.httpBody);
  set('aggregatorStrategy', meta.aggregatorStrategy as 'object' | 'array' | undefined);
  if (typeof meta.rawPayload === 'string') node.config.payload = meta.rawPayload;
}

/** Convert a single Mule element to a Studio FlowNode. */
function elementToNode(el: Element): FlowNode {
  const name = localName(el);
  const label = el.getAttribute('doc:name') || name;

  switch (name) {
    case 'set-payload': {
      const value = el.getAttribute('value') || '';
      const mime = el.getAttribute('mimeType') || 'application/json';
      const inner = stripExpr(value);
      return makeNode('set-payload', label, {
        payload: inner,
        payloadMime: mime,
        queryParams: '{}',
      });
    }
    case 'set-variable': {
      const varName = el.getAttribute('variableName') || 'myVar';
      const value = el.getAttribute('value') || '';
      // A Mule `value="#[…]"` is a DataWeave expression → import it as an fx
      // expression (bare, no #[…] noise) so the node reads clearly. A plain
      // literal stays a literal value.
      const exprMatch = value.trim().match(/^#\[([\s\S]*)\]$/);
      return makeNode('set-variable', label, exprMatch
        ? { variableName: varName, variableValue: exprMatch[1].trim(), variableSource: 'expression' }
        : { variableName: varName, variableValue: value, variableSource: 'raw' });
    }
    case 'transform': {
      // EE Transform — body is either <ee:message>/<ee:set-payload> or <ee:variables>/<ee:set-variable>.
      const setPayloadEl = el.querySelector('set-payload, ee\\:set-payload');
      const setVarEl = el.querySelector('set-variable, ee\\:set-variable');
      const target = setVarEl || setPayloadEl;
      const script = target?.textContent?.trim() || '%dw 2.0\noutput application/json\n---\npayload';
      const saveTo = setVarEl ? (setVarEl.getAttribute('variableName') || '') : '';
      return makeNode('transform', label, {
        script,
        outputMime: 'application/json',
        saveToVariable: saveTo,
      });
    }
    case 'logger': {
      const msg = el.getAttribute('message') || '#[payload]';
      return makeNode('logger', label, { payload: msg });
    }
    case 'flow-ref': {
      const refName = el.getAttribute('name') || '';
      return makeNode('flow-ref', el.getAttribute('doc:name') || refName || 'Flow Reference', {
        flowRefName: refName,
        saveToVariable: el.getAttribute('target') || '',
      });
    }
    case 'query':
    case 'create':
    case 'update':
    case 'upsert':
    case 'delete': {
      // Could be salesforce: or db: depending on the prefix.
      const prefix = el.prefix || (el.tagName.includes(':') ? el.tagName.split(':')[0] : '');
      const target = el.getAttribute('target') || '';
      if (prefix === 'salesforce') {
        // Query: SOQL lives in a <salesforce:salesforce-query> child.
        // create/update/upsert: records is the CONTENT child <salesforce:records>
        //   in Mule 4. (We also still read a `records="…"` attribute for backward
        //   compat with older Studio exports that wrote it that way.)
        // delete: no records child — the IDs come from the payload.
        const isQuery = name === 'query';
        const recordsEl = el.querySelector('records, salesforce\\:records');
        const recordsAttr = el.getAttribute('records');
        const queryEl = el.querySelector('salesforce-query, salesforce\\:salesforce-query');
        const request = isQuery
          ? (queryEl?.textContent?.trim() || '')
          : (recordsEl ? stripExpr(recordsEl.textContent?.trim() || '') : (recordsAttr ? stripExpr(recordsAttr) : ''));
        // The `:param` bind values live in a <salesforce:parameters>#[{…}]</…> child.
        const paramsEl = el.querySelector('parameters, salesforce\\:parameters');
        const bindParams = paramsEl ? stripExpr(paramsEl.textContent?.trim() || '') : '';
        // Mule 4 renamed `insert` → `create`. Map the M4 name back to Studio's `insert`.
        const mappedOp = name === 'create' ? 'insert' : name;
        return makeNode('salesforce', label, {
          operation: (mappedOp === 'query' ? 'query' : mappedOp) as FlowNode['config']['operation'],
          request,
          bindParams,
          mockResponse: '[]',
          mockMime: 'application/json',
          saveToVariable: target,
        });
      }
      if (prefix === 'db') {
        const inner = el.querySelector('sql, db\\:sql');
        const sql = inner?.textContent?.trim() || '';
        const paramsEl = el.querySelector('input-parameters, db\\:input-parameters');
        const bindParams = paramsEl ? stripExpr(paramsEl.textContent?.trim() || '') : '';
        return makeNode('database', label, {
          operation: (name === 'query' ? 'select' : name) as FlowNode['config']['operation'],
          request: sql,
          bindParams,
          mockResponse: '[]',
          mockMime: 'application/json',
          saveToVariable: target,
        });
      }
      break;
    }
    case 'select':
    case 'insert': {
      // Database connector operations.
      const inner = el.querySelector('sql, db\\:sql');
      const sql = inner?.textContent?.trim() || '';
      const paramsEl = el.querySelector('input-parameters, db\\:input-parameters');
      const bindParams = paramsEl ? stripExpr(paramsEl.textContent?.trim() || '') : '';
      const target = el.getAttribute('target') || '';
      return makeNode('database', label, {
        operation: name as FlowNode['config']['operation'],
        request: sql,
        bindParams,
        mockResponse: '[]',
        mockMime: 'application/json',
        saveToVariable: target,
      });
    }
    case 'request': {
      // HTTP request connector.
      const method = (el.getAttribute('method') || 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      const url = el.getAttribute('url') || '';
      const target = el.getAttribute('target') || '';
      return makeNode('http-request', label, {
        httpMethod: method,
        httpUrl: url,
        httpHeaders: '{}',
        httpQueryParams: '{}',
        httpBody: '',
        mockResponse: '{ "status": "ok" }',
        mockMime: 'application/json',
        saveToVariable: target,
      });
    }
    case 'choice': {
      const branches: Branch[] = [];
      for (const child of childElements(el)) {
        const cn = localName(child);
        if (cn === 'when') {
          const expr = stripExpr(child.getAttribute('expression') || '');
          branches.push({
            id: newImportId(),
            nodes: elementsToNodes(childElements(child), child),
            predicate: expr,
          });
        } else if (cn === 'otherwise') {
          branches.push({
            id: newImportId(),
            nodes: elementsToNodes(childElements(child), child),
            isOtherwise: true,
          });
        }
      }
      const node = makeNode('choice', label, {});
      node.branches = branches;
      return node;
    }
    case 'foreach':
    case 'parallel-foreach': {
      const type: NodeType = name === 'parallel-foreach' ? 'parallel-for-each' : 'for-each';
      const coll = stripExpr(el.getAttribute('collection') || 'payload');
      const counter = el.getAttribute('counterVariableName') || 'counter';
      const maxC = parseInt(el.getAttribute('maxConcurrency') || '4', 10);
      const body: Branch = {
        id: newImportId(),
        label: 'body',
        nodes: elementsToNodes(childElements(el), el),
      };
      const node = makeNode(type, label, {
        forEachCollection: coll,
        forEachCounter: counter,
        ...(type === 'parallel-for-each' ? { maxConcurrency: maxC } : {}),
      });
      node.branches = [body];
      return node;
    }
    case 'scatter-gather': {
      const branches: Branch[] = [];
      let idx = 1;
      for (const route of childElements(el)) {
        if (localName(route) !== 'route') continue;
        branches.push({
          id: newImportId(),
          label: `route${idx++}`,
          nodes: elementsToNodes(childElements(route), route),
        });
      }
      const node = makeNode('scatter-gather', label, { aggregatorStrategy: 'object' });
      node.branches = branches;
      return node;
    }
    case 'try': {
      // Main branch = everything except <error-handler>; handler = inside <error-handler><on-error-continue>...
      const mainChildren: Element[] = [];
      let handlerEl: Element | null = null;
      for (const child of childElements(el)) {
        if (localName(child) === 'error-handler') handlerEl = child;
        else mainChildren.push(child);
      }
      const main: Branch = {
        id: newImportId(),
        label: 'main',
        nodes: elementsToNodes(mainChildren, el),
      };
      let handler: Branch | null = null;
      if (handlerEl) {
        // Find on-error-continue / on-error-propagate. Take its body.
        const onError = childElements(handlerEl).find((c) => /^on-error-/.test(localName(c)));
        if (onError) {
          handler = {
            id: newImportId(),
            label: 'on-error',
            isErrorHandler: true,
            nodes: elementsToNodes(childElements(onError), onError),
          };
        }
      }
      if (!handler) {
        handler = { id: newImportId(), label: 'on-error', isErrorHandler: true, nodes: [] };
      }
      const node = makeNode('try', label, {});
      node.branches = [main, handler];
      return node;
    }
    case 'first-successful':
    case 'round-robin': {
      const branches: Branch[] = [];
      let idx = 1;
      for (const route of childElements(el)) {
        if (localName(route) !== 'route') continue;
        branches.push({
          id: newImportId(),
          label: `route${idx++}`,
          nodes: elementsToNodes(childElements(route), route),
        });
      }
      const node = makeNode(name as NodeType, label, {});
      node.branches = branches;
      return node;
    }
    case 'async': {
      const body: Branch = {
        id: newImportId(),
        label: 'body',
        nodes: elementsToNodes(childElements(el), el),
      };
      const node = makeNode('async', label, {});
      node.branches = [body];
      return node;
    }
  }

  // Unrecognised element — emit a Logger node carrying the original tag name so
  // the user can see what was imported and what slot it occupies. We also stash
  // the element's verbatim XML so an export round-trips it losslessly instead of
  // silently replacing the real component with a <logger>.
  const unknownLogger = makeNode('logger', `${label} (unsupported: ${name})`, {
    payload: `#[/* Imported from <${escXml(name)}> — Studio doesn't simulate this element */]`,
    rawXml: new XMLSerializer().serializeToString(el),
  });
  return unknownLogger;
}

/** Inbound-message attribute fixture (the part of the Mule HTTP listener's
 *  `attributes` a flow reads). Used to seed the Flow Designer's run context. */
export interface FlowAttributes {
  uriParams: Record<string, string>;
  queryParams: Record<string, string>;
  headers: Record<string, string>;
}

/** Scan a fragment for the namespace prefixes it uses (element + attribute) and
 *  return xmlns declarations for any not already in NS_DECL. The guessed URI
 *  only needs to *exist* so the parser accepts the prefix — unknown connectors
 *  then import as Logger placeholders rather than aborting the whole parse. */
function unknownPrefixDecls(xml: string): string {
  const known = new Set(['doc', 'ee', 'http', 'db', 'salesforce', 'xml']);
  const prefixes = new Set<string>();
  for (const m of xml.matchAll(/<\/?([A-Za-z][\w-]*):/g)) prefixes.add(m[1]);
  for (const m of xml.matchAll(/[\s"']([A-Za-z][\w-]*):[A-Za-z][\w.-]*\s*=/g)) prefixes.add(m[1]);
  let out = '';
  for (const p of prefixes) {
    if (known.has(p)) continue;
    known.add(p);
    const ns = p === 'xsi'
      ? 'http://www.w3.org/2001/XMLSchema-instance'
      : `http://www.mulesoft.org/schema/mule/${p}`;
    out += ` xmlns:${p}="${ns}"`;
  }
  return out;
}

/** Parse pasted Mule XML, tolerating a bare <flow>/<sub-flow> copied without its
 *  <mule> root (and therefore without the xmlns:doc / ee / … declarations every
 *  flow relies on). If a straight parse fails, wrap the fragment in a synthetic
 *  <mule> that declares the standard + any spotted namespaces, then retry. */
function parseMuleDoc(xml: string): Document {
  const parser = new DOMParser();
  const direct = parser.parseFromString(xml, 'application/xml');
  if (!direct.querySelector('parsererror')) return direct;
  const fragment = xml.replace(/<\?xml[^>]*\?>/i, '').trim();
  const wrapped = `<mule ${NS_DECL}${unknownPrefixDecls(fragment)}>${fragment}</mule>`;
  return parser.parseFromString(wrapped, 'application/xml');
}

/** Scan imported XML for `attributes.uriParams/queryParams/headers.<key>`
 *  references and return a skeleton with those keys (empty values), so the Flow
 *  Designer can pre-seed an input fixture showing exactly what the flow expects.
 *  Returns null when the flow reads no inbound attributes. */
function extractAttributeSkeleton(xml: string): FlowAttributes | null {
  const result: FlowAttributes = { uriParams: {}, queryParams: {}, headers: {} };
  let found = false;
  for (const group of ['uriParams', 'queryParams', 'headers'] as const) {
    // attributes.group.key | attributes.group.'key-with-dashes' | attributes.group["key"]
    const re = new RegExp(`attributes\\.${group}\\s*(?:\\.\\s*('?)([A-Za-z_][\\w-]*)\\1|\\[\\s*(['"])([^'"\\]]+)\\3\\s*\\])`, 'g');
    for (const m of xml.matchAll(re)) {
      const key = m[2] || m[4];
      if (key) { result[group][key] = ''; found = true; }
    }
  }
  return found ? result : null;
}

export interface ImportedFlow { name: string; nodes: FlowNode[]; isSubFlow: boolean; }

export interface ImportResult {
  ok: true;
  flowName: string;
  nodes: FlowNode[];
  /** Every <flow>/<sub-flow> in the document (first = the active one). */
  allFlows: ImportedFlow[];
  warnings: string[];
  /** Attribute keys the flow reads (empty values), or null if it reads none. */
  suggestedAttributes: FlowAttributes | null;
}
export interface ImportError {
  ok: false;
  error: string;
}

/** Parse a Mule 4 XML document (or a bare flow fragment) into Studio flows.
 *  Returns every <flow>/<sub-flow> found; the first is the active one. */
export function importMuleXml(xml: string): ImportResult | ImportError {
  if (!xml || !xml.trim()) return { ok: false, error: 'Empty input — paste Mule XML.' };
  // Tolerate flow-only pastes that lack the <mule> root + namespace declarations.
  const doc = parseMuleDoc(xml);
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return { ok: false, error: parserError.textContent?.trim() || 'XML parse error.' };
  }
  const flowEls = Array.from(doc.querySelectorAll('flow, sub-flow'));
  if (flowEls.length === 0) {
    return { ok: false, error: 'No <flow> or <sub-flow> element found in the XML.' };
  }
  const warnings: string[] = [];
  const walkForWarnings = (ns: FlowNode[]) => {
    for (const n of ns) {
      if (typeof n.label === 'string' && n.label.includes('(unsupported:')) warnings.push(n.label);
      if (n.branches) for (const b of n.branches) walkForWarnings(b.nodes);
    }
  };
  // One id counter across every flow so node ids stay unique document-wide.
  _idCounter = 0;
  const allFlows: ImportedFlow[] = flowEls.map((el, i) => {
    const name = el.getAttribute('name') || (i === 0 ? 'imported-flow' : `flow-${i + 1}`);
    const nodes = elementsToNodes(childElements(el), el);
    walkForWarnings(nodes);
    return { name, nodes, isSubFlow: localName(el) === 'sub-flow' };
  });
  return {
    ok: true,
    flowName: allFlows[0].name,
    nodes: allFlows[0].nodes,
    allFlows,
    warnings,
    suggestedAttributes: extractAttributeSkeleton(xml),
  };
}
