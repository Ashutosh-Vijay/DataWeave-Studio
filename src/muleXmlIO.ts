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
      // Same logic as set-payload: literal values stay literal, only re-wrap
      // when the user explicitly authored an expression with #[…].
      const raw = node.config.variableValue || '';
      const value = raw.trim().startsWith('#[') ? raw : cdataish(raw);
      return `<set-variable${attr('variableName', name)}${attr('value', value)}${docAttrs(node)}/>`;
    }
    case 'logger': {
      // Studio loggers just dump payload + vars; Mule's logger needs a message
      // expression. Use a sensible default if none is specified.
      const msg = (node.config.payload || '#[payload]').trim().startsWith('#[')
        ? (node.config.payload || '#[payload]')
        : `#[${cdataish(node.config.payload || '"' + node.label + '"')}]`;
      return `<logger${attr('level', 'INFO')}${attr('message', msg)}${docAttrs(node)}/>`;
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

      let line: string;
      if (isQuery) {
        const innerEl = `<salesforce:salesforce-query>${cdata(expr)}</salesforce:salesforce-query>`;
        line = `<salesforce:query${attr('config-ref', 'Salesforce_Config')}${targetAttr}${docAttrs(node)}>\n${indent(innerEl, 1)}\n</salesforce:query>`;
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
      const lines: string[] = [
        `<db:${dbOp}${attr('config-ref', 'Database_Config')}${targetAttr}${docAttrs(node)}>\n    <db:sql>${cdata(sql)}</db:sql>\n</db:${dbOp}>`,
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

/** Top-level: produce a complete Mule XML document for the given flow. */
export function exportFlowToMuleXml(flowName: string, nodes: FlowNode[]): string {
  const body = branchNodesToXml(nodes);
  // Sanitize the flow name — Mule requires identifier-like names.
  const safeName = (flowName || 'studioFlow')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/^[^A-Za-z_]/, 'f_$&');
  return `${ROOT_HEADER}

    <flow name="${escXml(safeName)}">
${indent(body, 2)}
    </flow>

</mule>
`;
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

  // Auto-assign x positions so they render left-to-right.
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].x = i * 260;
    nodes[i].y = 100;
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
      return makeNode('set-variable', label, {
        variableName: varName,
        variableValue: stripExpr(value),
        variableSource: 'raw',
      });
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
        // Mule 4 renamed `insert` → `create`. Map the M4 name back to Studio's `insert`.
        const mappedOp = name === 'create' ? 'insert' : name;
        return makeNode('salesforce', label, {
          operation: (mappedOp === 'query' ? 'query' : mappedOp) as FlowNode['config']['operation'],
          request,
          mockResponse: '[]',
          mockMime: 'application/json',
          saveToVariable: target,
        });
      }
      if (prefix === 'db') {
        const inner = el.querySelector('sql, db\\:sql');
        const sql = inner?.textContent?.trim() || '';
        return makeNode('database', label, {
          operation: (name === 'query' ? 'select' : name) as FlowNode['config']['operation'],
          request: sql,
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
      const target = el.getAttribute('target') || '';
      return makeNode('database', label, {
        operation: name as FlowNode['config']['operation'],
        request: sql,
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

  // Unrecognised element — emit a Logger node carrying the original tag name
  // so the user can see what was imported and what slot it occupies.
  const unknownLogger = makeNode('logger', `${label} (unsupported: ${name})`, {
    payload: `#[/* Imported from <${escXml(name)}> — Studio doesn't simulate this element */]`,
  });
  return unknownLogger;
}

export interface ImportResult {
  ok: true;
  flowName: string;
  nodes: FlowNode[];
  warnings: string[];
}
export interface ImportError {
  ok: false;
  error: string;
}

/** Parse a Mule 4 XML document and produce a Studio flow. */
export function importMuleXml(xml: string): ImportResult | ImportError {
  if (!xml || !xml.trim()) return { ok: false, error: 'Empty input — paste Mule XML.' };
  const parser = new DOMParser();
  // Some sources omit the XML declaration; DOMParser handles either case.
  const doc = parser.parseFromString(xml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return { ok: false, error: parserError.textContent?.trim() || 'XML parse error.' };
  }
  // Locate the first <flow> element regardless of namespace handling.
  const flowEl = doc.querySelector('flow');
  if (!flowEl) {
    return { ok: false, error: 'No <flow> element found in the XML.' };
  }
  const flowName = flowEl.getAttribute('name') || 'imported-flow';
  const warnings: string[] = [];

  // Walk the flow's children, ignoring whitespace.
  _idCounter = 0;
  const nodes = elementsToNodes(childElements(flowEl), flowEl);
  // Collect warnings for any unrecognised elements that landed as Loggers.
  const walkForWarnings = (ns: FlowNode[]) => {
    for (const n of ns) {
      if (typeof n.label === 'string' && n.label.includes('(unsupported:')) {
        warnings.push(n.label);
      }
      if (n.branches) for (const b of n.branches) walkForWarnings(b.nodes);
    }
  };
  walkForWarnings(nodes);
  return { ok: true, flowName, nodes, warnings };
}
