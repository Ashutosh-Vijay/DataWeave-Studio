import React, { useState, useCallback, useRef, useEffect, useMemo, Fragment } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icons } from './Icons';
import { MiniEditor } from './MiniEditor';
import { WindowControls } from './WindowControls';
import { MIME_OPTIONS } from '../types';
import { toast } from './Toast';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { exportFlowToMuleXml, importMuleXml } from '../muleXmlIO';
const openFile = tauriOpen;

export interface MultipartPart {
  name: string;
  value: string;
  contentType: string;
  isFile: boolean;
  filePath?: string;
  filename?: string;
}

function contentTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    json: 'application/json', xml: 'application/xml', csv: 'text/csv',
    txt: 'text/plain', html: 'text/html', pdf: 'application/octet-stream',
    png: 'application/octet-stream', jpg: 'application/octet-stream',
    zip: 'application/octet-stream', gz: 'application/octet-stream',
  };
  return map[ext] || 'application/octet-stream';
}

function mimeToEditorLang(mime: string): 'json' | 'sql' | 'plaintext' | 'dataweave' {
  if (mime.includes('json') || mime.includes('java')) return 'json';
  if (mime.includes('dw')) return 'dataweave';
  return 'plaintext';
}

// ── Types ──────────────────────────────────────────────────────────

export type LeafNodeType = 'set-payload' | 'transform' | 'set-variable' | 'salesforce' | 'database' | 'http-request' | 'logger';
export type ScopeNodeType = 'choice' | 'for-each' | 'parallel-for-each' | 'scatter-gather' | 'try' | 'first-successful' | 'round-robin' | 'async';
export type NodeType = LeafNodeType | ScopeNodeType;
type ConnectorOp = 'query' | 'insert' | 'update' | 'upsert' | 'delete' | 'select';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped';

const SCOPE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>(['choice', 'for-each', 'parallel-for-each', 'scatter-gather', 'try', 'first-successful', 'round-robin', 'async']);
function isScopeType(t: NodeType): t is ScopeNodeType { return SCOPE_TYPES.has(t); }

/** A Branch is a labeled sub-flow inside a scope node.
 *
 *  Scope-specific semantics of the optional fields:
 *    - Choice: `when` branches have `predicate` (DW boolean expr); exactly
 *      one branch has `isOtherwise: true` (the fallback, predicate ignored).
 *    - For Each / Parallel For Each: exactly one branch (the body). Optional
 *      `label` defaults to "body".
 *    - Scatter-Gather: branches have editable `label` ("route1", "route2", …)
 *      and are run concurrently. */
export interface Branch {
  id: string;
  /** Internal nodes — can themselves contain scope nodes (recursion allowed). */
  nodes: FlowNode[];
  /** Scope-specific branch metadata. */
  label?: string;            // Scatter-Gather/First-Successful/Round-Robin route name
  predicate?: string;        // Choice `when` branches
  isOtherwise?: boolean;     // Choice — true on exactly one branch
  isErrorHandler?: boolean;  // Try — true on the on-error branch
}

export interface FlowNode {
  id: string;
  type: NodeType;
  /** Optional discriminator — absent on legacy v1/v2 workspaces.
   *  Treated as 'leaf' when missing, regardless of `type`. */
  kind?: 'leaf' | 'scope';
  label: string;
  x: number;
  y: number;
  disabled?: boolean;
  config: {
    // set-payload
    payload?: string;
    payloadMime?: string;
    queryParams?: string;    // JSON object for GET API query params
    attributes?: string;     // JSON object for other attributes (headers, method, etc.)
    multipartParts?: MultipartPart[];
    payloadFilePath?: string; // binary file path
    // transform
    script?: string;
    outputMime?: string;
    // set-variable
    variableName?: string;
    variableValue?: string;
    variableSource?: 'raw' | 'script'; // raw = paste value, script = DW expression
    // connectors: shared
    operation?: ConnectorOp;
    request?: string;       // the query / script / body being "sent"
    mockResponse?: string;
    mockMime?: string;
    saveToVariable?: string; // if set, store output in vars instead of replacing payload
    // http-request
    httpMethod?: HttpMethod;
    httpUrl?: string;
    httpHeaders?: string;   // JSON object string
    httpQueryParams?: string; // JSON object string
    httpBody?: string;
    // For Each / Parallel For Each
    forEachCollection?: string;  // DW expression returning an Array
    forEachCounter?: string;     // var name for the iteration index (default: 'counter')
    maxConcurrency?: number;     // informational only — Studio always Promise.all-s
    // Scatter-Gather
    aggregatorStrategy?: 'object' | 'array'; // how to merge branch outputs
  };
  /** Only present on scope nodes (kind === 'scope'). */
  branches?: Branch[];
  output?: string;
  error?: string;
  executionTimeMs?: number;
  status: NodeStatus;
}

// ── Recursive helpers for the nested node tree ─────────────────────

/** Find a node anywhere in the tree by id. */
function findNodeById(nodes: FlowNode[], id: string): FlowNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.branches) {
      for (const b of n.branches) {
        const found = findNodeById(b.nodes, id);
        if (found) return found;
      }
    }
  }
  return null;
}

/** Apply a transform recursively to every node in the tree.
 *  Preserves referential equality where nothing changed — returns the SAME
 *  array, branch, or node object when its subtree is untouched, so React
 *  memoization downstream actually skips re-renders. The previous
 *  implementation unconditionally cloned every level, which degraded
 *  per-keystroke updates on large flows into O(N) work + N React diffs. */
function mapNodesDeep(nodes: FlowNode[], fn: (n: FlowNode) => FlowNode): FlowNode[] {
  let arrayChanged = false;
  const out = nodes.map((n) => {
    const mapped = fn(n);
    let next = mapped;
    if (next.branches) {
      let branchesChanged = false;
      const newBranches = next.branches.map((b) => {
        const newInner = mapNodesDeep(b.nodes, fn);
        if (newInner === b.nodes) return b;
        branchesChanged = true;
        return { ...b, nodes: newInner };
      });
      if (branchesChanged) next = { ...next, branches: newBranches };
    }
    if (next !== n) arrayChanged = true;
    return next;
  });
  return arrayChanged ? out : nodes;
}

/** Count every node in the tree (including those nested inside branches). */
function countAllNodes(nodes: FlowNode[]): number {
  let n = 0;
  for (const node of nodes) {
    n++;
    if (node.branches) for (const b of node.branches) n += countAllNodes(b.nodes);
  }
  return n;
}

/** Remove a node anywhere in the tree by id. */
function removeNodeDeep(nodes: FlowNode[], id: string): FlowNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => {
      if (n.branches) {
        return { ...n, branches: n.branches.map((b) => ({ ...b, nodes: removeNodeDeep(b.nodes, id) })) };
      }
      return n;
    });
}

/** Backfill kind: 'leaf' on legacy workspace nodes that have no discriminator.
 *  Idempotent — safe to call on already-migrated trees. */
function migrateLegacyNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((n) => {
    const kind: 'leaf' | 'scope' = n.kind ?? (isScopeType(n.type) ? 'scope' : 'leaf');
    const migrated: FlowNode = { ...n, kind };
    if (migrated.branches) {
      migrated.branches = migrated.branches.map((b) => ({ ...b, nodes: migrateLegacyNodes(b.nodes) }));
    }
    return migrated;
  });
}

interface RunResult {
  output: string;
  error: string | null;
  execution_time_ms: number;
}

// ── Constants ──────────────────────────────────────────────────────

/** Flow-entry input fixture: the sample message a test run starts from — the
 *  payload a real HTTP listener would hand the flow, plus the inbound
 *  `attributes` (uriParams / queryParams / headers / method) the flow reads. */
interface FlowInput {
  payload: string;
  mime: string;
  attributesJson: string;
}
const DEFAULT_FLOW_INPUT: FlowInput = {
  payload: '',
  mime: 'application/json',
  attributesJson: '{\n  "uriParams": {},\n  "queryParams": {},\n  "headers": {},\n  "method": "GET"\n}',
};

const NODE_W = 220;
const PORT_R = 6;

const NODE_META: Record<NodeType, { label: string; color: string; desc: string; badge: string }> = {
  'set-payload':  { label: 'Set Payload',    color: '#f59e0b',       desc: 'Initial payload data',           badge: 'PAYL' },
  'transform':    { label: 'Transform',      color: 'var(--accent)', desc: 'DataWeave 2.0 script',           badge: 'DW'   },
  'set-variable': { label: 'Set Variable',   color: '#10b981',       desc: 'Store a value in vars',          badge: 'VAR'  },
  'salesforce':   { label: 'Salesforce',     color: '#00a1e0',       desc: 'SF query / operation',           badge: 'SOQL' },
  'database':     { label: 'Database',       color: '#a855f7',       desc: 'DB query / operation',           badge: 'SQL'  },
  'http-request': { label: 'HTTP Request',   color: '#f97316',       desc: 'HTTP endpoint mock',             badge: 'HTTP' },
  'logger':       { label: 'Logger',         color: '#6b7280',       desc: 'Inspect payload (pass-through)', badge: 'LOG'  },
  'choice':              { label: 'Choice',             color: '#06b6d4', desc: 'When/otherwise router',           badge: 'CHOICE' },
  'for-each':            { label: 'For Each',           color: '#eab308', desc: 'Iterate over a collection',       badge: 'EACH'   },
  'parallel-for-each':   { label: 'Parallel For Each',  color: '#ca8a04', desc: 'Iterate concurrently',            badge: 'PARFE'  },
  'scatter-gather':      { label: 'Scatter-Gather',     color: '#8b5cf6', desc: 'Run routes in parallel, aggregate', badge: 'SCATGA' },
  'try':                 { label: 'Try',                color: '#ef4444', desc: 'Catch errors with handler',       badge: 'TRY'    },
  'first-successful':    { label: 'First Successful',   color: '#22c55e', desc: 'Try routes until one succeeds',   badge: 'FIRST'  },
  'round-robin':         { label: 'Round Robin',        color: '#64748b', desc: 'Rotate through routes',           badge: 'RR'     },
  'async':               { label: 'Async',              color: '#94a3b8', desc: 'Fire-and-forget sub-flow',        badge: 'ASYNC'  },
};

/** Wider footprint for scope nodes — they stack branches vertically. */
const SCOPE_NODE_W = 320;
function nodeWidth(type: NodeType): number {
  return isScopeType(type) ? SCOPE_NODE_W : NODE_W;
}

const DEFAULT_SCRIPT = `%dw 2.0
output application/json
---
payload`;

let idCounter = 0;
function newId() { return `node-${++idCounter}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

// ── Field validation ─────────────────────────────────────────────
// Extracts top-level field names from a JSON string (shallow parse)
function extractJsonFields(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.length > 0 && typeof parsed[0] === 'object' ? Object.keys(parsed[0]) : [];
    }
    return typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : [];
  } catch { return []; }
}

function validateFields(request: string, response: string): { missing: string[]; extra: string[] } | null {
  const reqFields = extractJsonFields(request);
  const resFields = extractJsonFields(response);
  if (reqFields.length === 0 || resFields.length === 0) return null;
  const missing = reqFields.filter(f => !resFields.includes(f));
  const extra = resFields.filter(f => !reqFields.includes(f));
  return (missing.length > 0 || extra.length > 0) ? { missing, extra } : null;
}

// ── Node Icons (inline SVGs) ──────────────────────────────────────

function NodeIcon({ type, size = 14 }: { type: NodeType; size?: number }) {
  const s = { width: size, height: size, fill: 'currentColor', className: 'shrink-0' };
  switch (type) {
    case 'set-payload':
      return <svg {...s} viewBox="0 0 16 16"><path d="M14 4.5V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2h5.5L14 4.5zM9.5 3A1.5 1.5 0 018 1.5V0H4a1 1 0 00-1 1v14a1 1 0 001 1h8a1 1 0 001-1V4.5H9.5z" /></svg>;
    case 'transform':
      return <svg {...s} viewBox="0 0 16 16"><path d="M1 10.5A1.5 1.5 0 002.5 12h3.879a2.5 2.5 0 001.768-.732l4.586-4.586A2.5 2.5 0 0012.268 6 1.533 1.533 0 0113.5 4.5a1.5 1.5 0 10-1.5-1.5 1.533 1.533 0 01-1.5 1.232A2.5 2.5 0 009.768 5L5.182 9.586A2.5 2.5 0 003.5 10.5H2.5A1.5 1.5 0 011 10.5zm0-5A1.5 1.5 0 012.5 4h1a1.5 1.5 0 010 3h-1A1.5 1.5 0 011 5.5zm12 5a1.5 1.5 0 01-1.5 1.5h-1a1.5 1.5 0 010-3h1a1.5 1.5 0 011.5 1.5z"/></svg>;
    case 'set-variable':
      return <svg {...s} viewBox="0 0 16 16"><path d="M3.38 3.012a.75.75 0 10-1.408-.516l-1.5 4.09a.75.75 0 001.408.516l.263-.717h1.614l.263.717a.75.75 0 001.408-.516l-1.5-4.09-.024-.065zM3.136 5.01l.334-.91.334.91H3.136zm7.878 6.243a.75.75 0 00-1.06 0L8.012 13.2l-1.943-1.947a.75.75 0 00-1.061 1.061l2.473 2.478a.75.75 0 001.062 0l2.473-2.478a.75.75 0 00-.002-1.06zM11.5 1a.75.75 0 01.75.75v9.5a.75.75 0 01-1.5 0v-9.5A.75.75 0 0111.5 1z" /></svg>;
    case 'salesforce':
      return <svg {...s} viewBox="0 0 16 16"><path d="M4.406 3.342A5.53 5.53 0 018.027 2c1.469 0 2.79.593 3.77 1.558a4.475 4.475 0 016.052.634A4.066 4.066 0 0116 8.07a4.071 4.071 0 01-3.032 3.934 3.81 3.81 0 01-2.56 2.247 3.786 3.786 0 01-2.963-.398 4.545 4.545 0 01-3.238 1.395C1.98 15.248 0 13.233 0 10.723a4.525 4.525 0 012.17-3.868 4.077 4.077 0 012.236-3.513z" /></svg>;
    case 'database':
      return <svg {...s} viewBox="0 0 16 16"><ellipse cx="8" cy="3.5" rx="6" ry="2.5" /><path d="M14 3.5v3c0 1.38-2.69 2.5-6 2.5S2 7.88 2 6.5v-3" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M14 6.5v3c0 1.38-2.69 2.5-6 2.5S2 11.38 2 10v-3.5" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M14 10v2.5c0 1.38-2.69 2.5-6 2.5S2 13.88 2 12.5V10" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>;
    case 'http-request':
      return <svg {...s} viewBox="0 0 16 16"><path d="M0 8a8 8 0 1116 0A8 8 0 010 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 005.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 01.64-1.539 6.7 6.7 0 01.597-.933A7.025 7.025 0 002.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 00-.656 2.5h2.49zM4.847 5a12.5 12.5 0 00-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 00-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 00.337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 01-.597-.933A9.268 9.268 0 014.09 12H2.255a7.024 7.024 0 003.072 2.472zM3.82 11a13.652 13.652 0 01-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0013.745 12H11.91a9.27 9.27 0 01-.64 1.539 6.688 6.688 0 01-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 01-.312 2.5zm2.802-3.5a6.959 6.959 0 00-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 00-3.072-2.472c.218.284.418.598.597.933zM10.855 4a7.966 7.966 0 00-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4h2.355z"/></svg>;
    case 'logger':
      return <svg {...s} viewBox="0 0 16 16"><path d="M5 0a1 1 0 00-1 1v1H3a2 2 0 00-2 2v9a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2h-1V1a1 1 0 00-1-1H5zm0 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z"/></svg>;
    case 'choice':
      // Branching arrow: one input that splits into two output paths.
      return <svg {...s} viewBox="0 0 16 16"><path d="M8 1.5a.5.5 0 01.5.5v3.5h3a2 2 0 012 2v2h1.793l-2.146-2.146a.5.5 0 11.707-.707l3 3a.5.5 0 010 .707l-3 3a.5.5 0 11-.707-.707L13.293 10.5H11.5v-3a1 1 0 00-1-1H8.5V11l-.5 1-.5-1V6.5H5.5a1 1 0 00-1 1v3H2.707l2.147 2.146a.5.5 0 01-.708.708l-3-3a.5.5 0 010-.708l3-3a.5.5 0 01.708.707L2.707 9.5H3.5v-2a2 2 0 012-2h2V2a.5.5 0 01.5-.5z"/></svg>;
    case 'for-each':
      // Circular arrow (loop).
      return <svg {...s} viewBox="0 0 16 16"><path d="M8 3a5 5 0 014.546 2.914.5.5 0 11-.908.418A4 4 0 1012 8a.5.5 0 011 0 5 5 0 11-5-5zm4.5-.5a.5.5 0 01.5.5v2.5a.5.5 0 01-.5.5H10a.5.5 0 010-1h1.793l-1.147-1.146a.5.5 0 01.708-.708L12.5 4.793V3a.5.5 0 01.5-.5z"/></svg>;
    case 'parallel-for-each':
      // Doubled loop — two stacked arcs to suggest concurrency.
      return <svg {...s} viewBox="0 0 16 16"><path d="M3 5a4 4 0 117.446 2.034.5.5 0 11-.892-.452A3 3 0 104 5a.5.5 0 01-1 0zm0 4a4 4 0 117.446 2.034.5.5 0 11-.892-.452A3 3 0 104 9a.5.5 0 01-1 0zm9-6.5a.5.5 0 01.5.5v2.5a.5.5 0 01-.5.5H9.5a.5.5 0 010-1h1.793L10.146 3.854a.5.5 0 11.708-.708L12 4.293V2.5a.5.5 0 01.5-.5z"/></svg>;
    case 'scatter-gather':
      // Outward arrows fanning from center — scatter & gather visual.
      return <svg {...s} viewBox="0 0 16 16"><path d="M8 7a1 1 0 100 2 1 1 0 000-2zM5.146 3.146a.5.5 0 11.708.708L4.207 5.5H5.5a.5.5 0 010 1H3a.5.5 0 01-.5-.5V3.5a.5.5 0 011 0v1.293l1.646-1.647zm5.708 0a.5.5 0 00-.708.708L11.793 5.5H10.5a.5.5 0 000 1H13a.5.5 0 00.5-.5V3.5a.5.5 0 00-1 0v1.293l-1.646-1.647zm-5.708 9.708a.5.5 0 11-.708-.708L6.293 10.5H5a.5.5 0 010-1h2.5a.5.5 0 01.5.5v3a.5.5 0 01-1 0v-1.793l-1.354 1.354zm5.708 0a.5.5 0 00.708-.708L9.207 10.5H10.5a.5.5 0 000-1H8a.5.5 0 00-.5.5v3a.5.5 0 001 0v-1.793l1.354 1.354z"/></svg>;
    case 'try':
      // Shield with a checkmark — protective error scope.
      return <svg {...s} viewBox="0 0 16 16"><path d="M5.338 1.59a61.44 61.44 0 00-2.837.856.481.481 0 00-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.725 10.725 0 002.287 2.233c.346.244.652.42.893.533.12.057.218.095.293.118a.55.55 0 00.101.025.615.615 0 00.1-.025c.076-.023.174-.061.294-.118.24-.113.547-.29.893-.533a10.726 10.726 0 002.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 00-.328-.39c-.651-.213-1.75-.51-2.837-.855C9.552 1.255 8.531 1 8 1c-.531 0-1.552.255-2.662.59z"/></svg>;
    case 'first-successful':
      // Numbered list / queue with check — try first, then next.
      return <svg {...s} viewBox="0 0 16 16"><path d="M3 2.5a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v3.5a.5.5 0 01-1 0v-3H3.5a.5.5 0 01-.5-.5zm3.5 1a.5.5 0 01.5-.5h7a.5.5 0 010 1H7a.5.5 0 01-.5-.5zM6.5 7a.5.5 0 01.5-.5h7a.5.5 0 010 1H7a.5.5 0 01-.5-.5zm0 3.5a.5.5 0 01.5-.5h7a.5.5 0 010 1H7a.5.5 0 01-.5-.5zm-2.5 0a.5.5 0 01.5-.5h.5a.5.5 0 010 1H4.5a.5.5 0 01-.5-.5zm-1-3.5a.5.5 0 01.5-.5H4a.5.5 0 010 1h-.5a.5.5 0 01-.5-.5z"/></svg>;
    case 'round-robin':
      // Cyclic arrows.
      return <svg {...s} viewBox="0 0 16 16"><path d="M11.534 7h3.932a.25.25 0 01.192.41l-1.966 2.36a.25.25 0 01-.384 0l-1.966-2.36a.25.25 0 01.192-.41zm-11 2h3.932a.25.25 0 00.192-.41L2.692 6.23a.25.25 0 00-.384 0L.342 8.59A.25.25 0 00.534 9z"/><path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 11-.771-.636A6.002 6.002 0 0113.917 7H12.9A5.002 5.002 0 008 3zM3.1 9a5.002 5.002 0 008.757 2.182.5.5 0 01.771.636A6.002 6.002 0 012.083 9H3.1z"/></svg>;
    case 'async':
      // Lightning bolt — fire and forget.
      return <svg {...s} viewBox="0 0 16 16"><path d="M5.52.359A.5.5 0 016 0h4a.5.5 0 01.474.658L8.694 6H12.5a.5.5 0 01.395.807l-7 9a.5.5 0 01-.873-.454L6.823 9.5H3.5a.5.5 0 01-.48-.641l2.5-8.5z"/></svg>;
  }
}

// ── Main Component ────────────────────────────────────────────────

interface FlowDesignerProps {
  open: boolean;
  onClose: () => void;
}

export function FlowDesigner({ open, onClose }: FlowDesignerProps) {
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const [paletteDrag, setPaletteDrag] = useState<{ type: NodeType; x: number; y: number } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [stepping, setStepping] = useState(false); // true = waiting for user to click Next
  const stepResolveRef = useRef<(() => void) | null>(null);
  /** The node currently paused on (for step-through UI). Used to decide
   *  whether to show "Skip Scope" — only visible when the node is a scope. */
  const [currentStepNodeId, setCurrentStepNodeId] = useState<string | null>(null);
  /** If set, pauseIfStepping won't pause inside this scope's subtree.
   *  Cleared when execution exits the scope. */
  const skipUntilNodeRef = useRef<string | null>(null);
  const [configTab, setConfigTab] = useState<'general' | 'request' | 'response' | 'variables'>('general');
  const [dismissedValidations, setDismissedValidations] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  /** Open mini-palette for adding a leaf into a Choice branch. */
  const [branchPalette, setBranchPalette] = useState<{ scopeId: string; branchId: string } | null>(null);
  /** Set of nested-scope node ids that the user has collapsed. Collapsed
   *  scopes show only their header inside a branch; expanded scopes show
   *  the full nested body. Top-level scopes can't be collapsed. */
  const [collapsedScopes, setCollapsedScopes] = useState<Set<string>>(new Set());
  // Flow-entry input fixture (declared up here so runPipeline can read it).
  const [flowInput, setFlowInput] = useState<FlowInput>(DEFAULT_FLOW_INPUT);
  const [showInputEditor, setShowInputEditor] = useState(false);
  const [inputDraft, setInputDraft] = useState<FlowInput>(DEFAULT_FLOW_INPUT);
  const toggleScopeCollapsed = useCallback((id: string) => {
    setCollapsedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const abortRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => (selectedId ? findNodeById(nodes, selectedId) : null), [nodes, selectedId]);

  // Reset config tab when selection changes
  useEffect(() => { setConfigTab('general'); }, [selectedId]);

  // Execution order at the TOP level: sort by x position, skip disabled nodes.
  // Inside scopes, each branch has its own internal X-sort applied at run time.
  const executionOrder = useMemo(() => [...nodes].filter(n => !n.disabled).sort((a, b) => a.x - b.x), [nodes]);

  // Connections: sequential pairs in execution order
  const connections = useMemo(() => {
    const pairs: { from: FlowNode; to: FlowNode }[] = [];
    for (let i = 0; i < executionOrder.length - 1; i++) {
      pairs.push({ from: executionOrder[i], to: executionOrder[i + 1] });
    }
    return pairs;
  }, [executionOrder]);

  // Collect current pipeline variables for display
  const pipelineVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const node of executionOrder) {
      if (node.status !== 'success') break;
      if (node.type === 'set-variable' && node.config.variableName && node.output) {
        vars[node.config.variableName] = node.output;
      }
      if ((node.type === 'transform' || node.type === 'salesforce' || node.type === 'database' || node.type === 'http-request') && node.config.saveToVariable && node.output) {
        vars[node.config.saveToVariable] = node.output;
      }
    }
    return vars;
  }, [executionOrder]);

  // ── Pinch/Ctrl zoom via non-passive wheel listener ───────────────
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const z = zoomRef.current;
        const wx = (canvas.scrollLeft + mx) / z;
        const wy = (canvas.scrollTop + my) / z;
        const next = Math.min(2, Math.max(0.25, z - e.deltaY * 0.002));
        setZoom(next);
        setContextMenu(null); // close context menu on zoom
        // Defer the scroll until AFTER React has flushed the new zoom and the
        // browser has applied the resulting transform. requestAnimationFrame
        // fires before paint, so the canvas scrollable area is still at the
        // old size when we try to set scrollLeft — the browser clamps to the
        // unscaled bounds and the viewport jitters. setTimeout(0) defers to
        // the next macrotask, by which point React has rendered and the
        // canvas has its new scaled dimensions, so the scroll target lands
        // where the user expects.
        setTimeout(() => {
          if (canvasRef.current) {
            canvasRef.current.scrollLeft = wx * next - mx;
            canvasRef.current.scrollTop = wy * next - my;
          }
        }, 0);
      }
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [open]);

  // ── Cleanup on unmount — abort any in-flight pipeline/step-through ──
  useEffect(() => {
    return () => {
      abortRef.current = true;
      stepResolveRef.current?.();
    };
  }, []);

  // ── Keyboard ────────────────────────────────────────────────────
  // Dialog state is declared later, so track via refs for the keyboard handler
  const dialogOpenRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Let dialog-level handlers deal with Escape when a dialog is open
      if (dialogOpenRef.current) return;
      if (e.key === 'Escape') {
        if (contextMenu) { setContextMenu(null); return; }
        if (selectedId) setSelectedId(null);
        else onClose();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'SELECT') {
          setNodes((prev) => removeNodeDeep(prev, selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, selectedId, contextMenu]);

  // ── Node dragging ───────────────────────────────────────────────
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    e.preventDefault();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const canvas = canvasRef.current;
    const scrollX = canvas ? canvas.scrollLeft : 0;
    const scrollY = canvas ? canvas.scrollTop : 0;
    setDragState({ nodeId, offsetX: (e.clientX + scrollX) / zoom - node.x, offsetY: (e.clientY + scrollY) / zoom - node.y });
    setSelectedId(nodeId);
  }, [nodes, zoom]);

  useEffect(() => {
    if (!dragState) return;
    const handleMove = (e: MouseEvent) => {
      setNodes((prev) => prev.map((n) =>
        n.id === dragState.nodeId
          ? { ...n, x: Math.max(0, (e.clientX + (canvasRef.current?.scrollLeft ?? 0)) / zoom - dragState.offsetX), y: Math.max(0, (e.clientY + (canvasRef.current?.scrollTop ?? 0)) / zoom - dragState.offsetY) }
          : n
      ));
    };
    const handleUp = () => setDragState(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragState, zoom]);

  // ── Palette drag ────────────────────────────────────────────────
  useEffect(() => {
    if (!paletteDrag) return;
    const handleMove = (e: MouseEvent) => {
      setPaletteDrag((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
    };
    const handleUp = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (canvas && paletteDrag) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left + canvas.scrollLeft) / zoom - NODE_W / 2;
        const y = (e.clientY - rect.top + canvas.scrollTop) / zoom - 40;
        if (x >= 0 && y >= 0) {
          addNode(paletteDrag.type, Math.max(20, x), Math.max(20, y));
        }
      }
      setPaletteDrag(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [paletteDrag]);

  // ── Add node ────────────────────────────────────────────────────
  const addNode = useCallback((type: NodeType, x: number, y: number) => {
    const meta = NODE_META[type];
    const config: FlowNode['config'] = {};
    switch (type) {
      case 'set-payload':
        config.payload = '{\n  "message": "Hello"\n}';
        config.payloadMime = 'application/json';
        config.queryParams = '{}';
        break;
      case 'transform':
        config.script = DEFAULT_SCRIPT;
        config.outputMime = 'application/json';
        config.saveToVariable = '';
        break;
      case 'set-variable':
        config.variableName = 'myVar';
        config.variableValue = '';
        config.variableSource = 'raw';
        break;
      case 'salesforce':
        config.operation = 'query';
        config.request = 'SELECT Id, Name, Email FROM Contact WHERE Email != null LIMIT 10';
        config.mockResponse = '[\n  { "Id": "003xx000004TmiQAAS", "Name": "John Doe", "Email": "john@example.com" }\n]';
        config.mockMime = 'application/json';
        config.saveToVariable = '';
        break;
      case 'database':
        config.operation = 'select';
        config.request = 'SELECT id, name, email FROM users WHERE active = 1';
        config.mockResponse = '[\n  { "id": 1, "name": "John Doe", "email": "john@example.com" }\n]';
        config.mockMime = 'application/json';
        config.saveToVariable = '';
        break;
      case 'http-request':
        config.httpMethod = 'GET';
        config.httpUrl = 'https://api.example.com/data';
        config.httpHeaders = '{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer {{token}}"\n}';
        config.httpQueryParams = '{}';
        config.httpBody = '';
        config.mockResponse = '{\n  "status": "ok",\n  "data": []\n}';
        config.mockMime = 'application/json';
        config.saveToVariable = '';
        break;
      case 'choice':
        // Default Choice has one `when` and one `otherwise`.
        // No nodes inside either branch yet — user drops them via the
        // branch-level Add buttons in the node body.
        break;
      case 'for-each':
      case 'parallel-for-each':
        config.forEachCollection = 'payload';
        config.forEachCounter = 'counter';
        if (type === 'parallel-for-each') config.maxConcurrency = 4;
        break;
      case 'scatter-gather':
        config.aggregatorStrategy = 'object';
        break;
      default: // logger
        break;
    }
    const isScope = isScopeType(type);
    let branches: Branch[] | undefined;
    if (type === 'choice') {
      branches = [
        { id: newId(), nodes: [], predicate: 'payload.value > 0' },
        { id: newId(), nodes: [], isOtherwise: true },
      ];
    } else if (type === 'for-each' || type === 'parallel-for-each') {
      branches = [{ id: newId(), nodes: [], label: 'body' }];
    } else if (type === 'scatter-gather') {
      branches = [
        { id: newId(), nodes: [], label: 'route1' },
        { id: newId(), nodes: [], label: 'route2' },
      ];
    } else if (type === 'try') {
      branches = [
        { id: newId(), nodes: [], label: 'main' },
        { id: newId(), nodes: [], label: 'on-error', isErrorHandler: true },
      ];
    } else if (type === 'first-successful' || type === 'round-robin') {
      branches = [
        { id: newId(), nodes: [], label: 'route1' },
        { id: newId(), nodes: [], label: 'route2' },
      ];
    } else if (type === 'async') {
      branches = [{ id: newId(), nodes: [], label: 'body' }];
    }
    const node: FlowNode = {
      id: newId(),
      type,
      kind: isScope ? 'scope' : 'leaf',
      label: meta.label,
      x, y, config,
      branches,
      status: 'idle',
    };
    setNodes((prev) => [...prev, node]);
    setSelectedId(node.id);
  }, []);

  // ── Update selected node config ─────────────────────────────────
  // Deep so nodes nested inside Choice branches are also updatable.
  const updateNode = useCallback((id: string, patch: Partial<FlowNode>) => {
    setNodes((prev) => mapNodesDeep(prev, (n) => n.id === id ? { ...n, ...patch } : n));
  }, []);

  const updateConfig = useCallback((id: string, patch: Partial<FlowNode['config']>) => {
    setNodes((prev) => mapNodesDeep(prev, (n) =>
      n.id === id ? { ...n, config: { ...n.config, ...patch } } : n
    ));
  }, []);

  /** Update one branch of a scope node by id. */
  const updateBranch = useCallback((scopeId: string, branchId: string, patch: Partial<Branch>) => {
    setNodes((prev) => mapNodesDeep(prev, (n) => {
      if (n.id !== scopeId || !n.branches) return n;
      return {
        ...n,
        branches: n.branches.map((b) => b.id === branchId ? { ...b, ...patch } : b),
      };
    }));
  }, []);

  /** Append a new node (leaf OR scope) to a branch's `nodes` array.
   *  Scope nodes get seeded with default branches identical to top-level
   *  addNode — Choice gets one `when` + one `otherwise`, Try gets main +
   *  on-error, etc. */
  const addNodeToBranch = useCallback((scopeId: string, branchId: string, type: NodeType) => {
    const meta = NODE_META[type];
    const config: FlowNode['config'] = {};
    switch (type) {
      case 'set-payload':
        config.payload = '{\n  "message": "Hello"\n}';
        config.payloadMime = 'application/json';
        config.queryParams = '{}';
        break;
      case 'transform':
        config.script = DEFAULT_SCRIPT;
        config.outputMime = 'application/json';
        config.saveToVariable = '';
        break;
      case 'set-variable':
        config.variableName = 'myVar';
        config.variableValue = '';
        config.variableSource = 'raw';
        break;
      case 'salesforce':
        config.operation = 'query';
        config.request = 'SELECT Id, Name FROM Contact LIMIT 10';
        config.mockResponse = '[\n  { "Id": "003xx", "Name": "John" }\n]';
        config.mockMime = 'application/json';
        config.saveToVariable = '';
        break;
      case 'database':
        config.operation = 'select';
        config.request = 'SELECT id, name FROM users';
        config.mockResponse = '[\n  { "id": 1, "name": "John" }\n]';
        config.mockMime = 'application/json';
        config.saveToVariable = '';
        break;
      case 'http-request':
        config.httpMethod = 'GET';
        config.httpUrl = 'https://api.example.com/data';
        config.httpHeaders = '{}';
        config.httpQueryParams = '{}';
        config.httpBody = '';
        config.mockResponse = '{ "status": "ok" }';
        config.mockMime = 'application/json';
        config.saveToVariable = '';
        break;
      case 'for-each':
      case 'parallel-for-each':
        config.forEachCollection = 'payload';
        config.forEachCounter = 'counter';
        if (type === 'parallel-for-each') config.maxConcurrency = 4;
        break;
      case 'scatter-gather':
        config.aggregatorStrategy = 'object';
        break;
    }
    const isScope = isScopeType(type);
    let branches: Branch[] | undefined;
    if (type === 'choice') {
      branches = [
        { id: newId(), nodes: [], predicate: 'payload.value > 0' },
        { id: newId(), nodes: [], isOtherwise: true },
      ];
    } else if (type === 'for-each' || type === 'parallel-for-each') {
      branches = [{ id: newId(), nodes: [], label: 'body' }];
    } else if (type === 'scatter-gather') {
      branches = [
        { id: newId(), nodes: [], label: 'route1' },
        { id: newId(), nodes: [], label: 'route2' },
      ];
    } else if (type === 'try') {
      branches = [
        { id: newId(), nodes: [], label: 'main' },
        { id: newId(), nodes: [], label: 'on-error', isErrorHandler: true },
      ];
    } else if (type === 'first-successful' || type === 'round-robin') {
      branches = [
        { id: newId(), nodes: [], label: 'route1' },
        { id: newId(), nodes: [], label: 'route2' },
      ];
    } else if (type === 'async') {
      branches = [{ id: newId(), nodes: [], label: 'body' }];
    }
    const newNode: FlowNode = {
      id: newId(),
      type,
      kind: isScope ? 'scope' : 'leaf',
      label: meta.label,
      x: 0,
      y: 0,
      config,
      branches,
      status: 'idle',
    };
    setNodes((prev) => mapNodesDeep(prev, (n) => {
      if (n.id !== scopeId || !n.branches) return n;
      return {
        ...n,
        branches: n.branches.map((b) => {
          if (b.id !== branchId) return b;
          // Re-assign x positions so the X-sorted execution order matches
          // the visual chip order, left-to-right.
          const ordered = [...b.nodes, newNode].map((nn, i) => ({ ...nn, x: i * 90 }));
          return { ...b, nodes: ordered };
        }),
      };
    }));
    setSelectedId(newNode.id);
  }, []);

  // ── Pipeline execution ──────────────────────────────────────────
  // Recursive walker: top-level nodes are executed in X order; scope nodes
  // (currently just Choice) recurse into the matched branch. The execution
  // context (payload, mime, attributes, variables) flows through every node.
  const runPipeline = useCallback(async (stepThrough = false) => {
    if (nodes.length === 0) return;
    setIsRunning(true);
    abortRef.current = false;

    // Reset all statuses across the entire tree (including branch-inner nodes).
    setNodes((prev) => mapNodesDeep(prev, (n) => ({ ...n, status: 'idle' as const, output: undefined, error: undefined, executionTimeMs: undefined })));

    // Execution context — passed explicitly through every recursive call.
    // Sequential calls within a single runList share the same ctx object so
    // siblings see each other's mutations. Concurrent forks (parallel-for-
    // each, scatter-gather, async, first-successful) create fresh ctx copies
    // so branches can't trample each other across awaits.
    type ExecCtx = {
      payload: string;
      mime: string;
      attributes: string;
      multipartJson: string | null;
      payloadFilePath: string | null;
      variables: Record<string, string>;
    };
    // Seed from the flow-entry input fixture so payload + attributes.* resolve
    // the way they would behind a real HTTP listener. Invalid attributes JSON
    // falls back to an empty object rather than aborting the run.
    let seedAttrs = '{}';
    try { seedAttrs = JSON.stringify(JSON.parse(flowInput.attributesJson || '{}')); } catch {}
    const initialCtx: ExecCtx = {
      payload: flowInput.payload,
      mime: flowInput.mime || 'application/json',
      attributes: seedAttrs,
      multipartJson: null,
      payloadFilePath: null,
      variables: {},
    };
    /** Build a deep-enough copy of a ctx for forking. variables is the only
     *  nested object we mutate, so cloning that and shallow-copying the rest
     *  is sufficient. */
    const forkCtx = (ctx: ExecCtx): ExecCtx => ({ ...ctx, variables: { ...ctx.variables } });

    // Track step index globally across recursion so the header shows progress.
    let stepCounter = 0;

    /** Mark a node's status by id, anywhere in the tree. */
    const markNode = (id: string, patch: Partial<FlowNode>) => {
      setNodes((prev) => mapNodesDeep(prev, (n) => n.id === id ? { ...n, ...patch } : n));
    };

    /** Mark every node-id in the set as 'skipped'. */
    const markSkipped = (ids: Set<string>) => {
      if (ids.size === 0) return;
      setNodes((prev) => mapNodesDeep(prev, (n) => ids.has(n.id) ? { ...n, status: 'skipped' as const } : n));
    };

    /** Collect every node-id under a list (including nested branches). */
    const collectIds = (ns: FlowNode[], out: Set<string>) => {
      for (const n of ns) {
        out.add(n.id);
        if (n.branches) for (const b of n.branches) collectIds(b.nodes, out);
      }
    };

    /** Pause for step-through. Resolves when the user clicks Next.
     *  Skips the pause when inside a scope the user chose to Step Over. */
    const pauseIfStepping = async (nodeId: string): Promise<boolean> => {
      if (!stepThrough) return true;
      if (skipUntilNodeRef.current) return true; // Step Over active
      setCurrentStepNodeId(nodeId);
      setSelectedId(nodeId); // surface the current node's config/response in the panel
      setStepping(true);
      await new Promise<void>((resolve) => { stepResolveRef.current = resolve; });
      setStepping(false);
      setCurrentStepNodeId(null);
      return !abortRef.current;
    };

    /** Execute one leaf node. Returns true on success, false on error/abort.
     *  Mutates `ctx` in place so siblings in the same runList see the result. */
    const runLeaf = async (node: FlowNode, ctx: ExecCtx): Promise<boolean> => {
      try {
        if (node.type === 'set-payload') {
          ctx.payload = node.config.payload || '';
          ctx.mime = node.config.payloadMime || 'application/json';
          ctx.multipartJson = null;
          ctx.payloadFilePath = null;
          if (ctx.mime === 'multipart/form-data' && node.config.multipartParts?.length) {
            ctx.multipartJson = JSON.stringify(node.config.multipartParts);
          }
          if (ctx.mime === 'application/octet-stream' && node.config.payloadFilePath) {
            ctx.payloadFilePath = node.config.payloadFilePath;
          }
          const attrs: Record<string, unknown> = {};
          try { Object.assign(attrs, JSON.parse(node.config.attributes || '{}')); } catch {}
          try { attrs.queryParams = JSON.parse(node.config.queryParams || '{}'); } catch {}
          ctx.attributes = JSON.stringify(attrs);
          const displayOutput = ctx.mime === 'multipart/form-data'
            ? `[multipart: ${node.config.multipartParts?.length || 0} parts]`
            : ctx.mime === 'application/octet-stream'
              ? `[binary: ${node.config.payloadFilePath?.split(/[/\\]/).pop() || 'no file'}]`
              : ctx.payload;
          markNode(node.id, { status: 'success', output: displayOutput, executionTimeMs: 0 });
          return true;
        }

        if (node.type === 'set-variable') {
          const varName = node.config.variableName || 'myVar';
          // Evaluate through the engine when the value is a DataWeave script OR a
          // raw `#[…]` expression (imported set-variables keep their #[…] form so
          // `attributes.*` / `vars.*` / `payload` resolve against the run context).
          let scriptToRun: string | null = null;
          if (node.config.variableSource === 'script' && node.config.script) {
            scriptToRun = node.config.script;
          } else {
            const exprMatch = (node.config.variableValue || '').match(/^#\[([\s\S]*)\]$/);
            if (exprMatch) scriptToRun = `%dw 2.0\noutput application/json\n---\n${exprMatch[1]}`;
          }
          let varValue: string;
          if (scriptToRun !== null) {
            const result = await invoke<RunResult>('run_dataweave', {
              script: scriptToRun,
              payload: ctx.payload,
              payloadMimeType: ctx.mime,
              attributesJson: ctx.attributes,
              varsJson: JSON.stringify(ctx.variables),
              namedInputsJson: '[]',
              payloadFilePath: ctx.payloadFilePath,
              classpath: [],
              timeoutMs: 0,
              multipartPartsJson: ctx.multipartJson,
            });
            if (result.error) {
              markNode(node.id, { status: 'error', error: result.error ?? undefined, executionTimeMs: result.execution_time_ms });
              return false;
            }
            varValue = result.output;
          } else {
            varValue = node.config.variableValue || ctx.payload;
          }
          ctx.variables[varName] = varValue;
          markNode(node.id, { status: 'success', output: `vars.${varName} = ${varValue}`, executionTimeMs: 0 });
          return true;
        }

        if (node.type === 'transform') {
          const result = await invoke<RunResult>('run_dataweave', {
            script: node.config.script || DEFAULT_SCRIPT,
            payload: ctx.payload,
            payloadMimeType: ctx.mime,
            attributesJson: ctx.attributes,
            varsJson: JSON.stringify(ctx.variables),
            namedInputsJson: '[]',
            payloadFilePath: null,
            classpath: [],
            timeoutMs: 0,
            multipartPartsJson: null,
          });
          if (result.error) {
            markNode(node.id, { status: 'error', error: result.error ?? undefined, executionTimeMs: result.execution_time_ms });
            return false;
          }
          if (node.config.saveToVariable) {
            ctx.variables[node.config.saveToVariable] = result.output;
            markNode(node.id, { status: 'success', output: `vars.${node.config.saveToVariable} = ${result.output}`, executionTimeMs: result.execution_time_ms });
          } else {
            ctx.payload = result.output;
            ctx.mime = node.config.outputMime || 'application/json';
            markNode(node.id, { status: 'success', output: result.output, executionTimeMs: result.execution_time_ms });
          }
          return true;
        }

        if (node.type === 'salesforce' || node.type === 'database' || node.type === 'http-request') {
          const response = node.config.mockResponse || '';
          const mime = node.config.mockMime || 'application/json';
          if (node.config.saveToVariable) {
            ctx.variables[node.config.saveToVariable] = response;
            markNode(node.id, { status: 'success', output: `vars.${node.config.saveToVariable} = ${response}`, executionTimeMs: 0 });
          } else {
            ctx.payload = response;
            ctx.mime = mime;
            markNode(node.id, { status: 'success', output: response, executionTimeMs: 0 });
          }
          return true;
        }

        if (node.type === 'logger') {
          const logOutput = `── Logger ──\nPayload (${ctx.mime}):\n${ctx.payload}\n\n── Variables ──\n${Object.keys(ctx.variables).length > 0
            ? Object.entries(ctx.variables).map(([k, v]) => `${k}: ${v}`).join('\n')
            : '(none)'}`;
          markNode(node.id, { status: 'success', output: logOutput, executionTimeMs: 0 });
          return true;
        }
        return true;
      } catch (e) {
        markNode(node.id, { status: 'error', error: String(e) });
        return false;
      }
    };

    /** Evaluate a DataWeave expression against the given context.
     *  Returns the parsed JSON value on success, or an error string. */
    const evalExpression = async (expr: string, ctx: ExecCtx): Promise<{ ok: true; value: unknown; raw: string } | { ok: false; error: string }> => {
      const script = `%dw 2.0\noutput application/json\n---\n${expr}`;
      try {
        const result = await invoke<RunResult>('run_dataweave', {
          script,
          payload: ctx.payload,
          payloadMimeType: ctx.mime,
          attributesJson: ctx.attributes,
          varsJson: JSON.stringify(ctx.variables),
          namedInputsJson: '[]',
          payloadFilePath: ctx.payloadFilePath,
          classpath: [],
          timeoutMs: 0,
          multipartPartsJson: ctx.multipartJson,
        });
        if (result.error) return { ok: false, error: result.error };
        let value: unknown = result.output;
        try { value = JSON.parse(result.output); } catch { /* keep raw string */ }
        return { ok: true, value, raw: result.output };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    };

    /** Dispatcher: pick the right per-scope runner.
     *  Honors Step Over: scope handlers clear skipUntilNodeRef when they exit. */
    const runScope = async (node: FlowNode, ctx: ExecCtx): Promise<boolean> => {
      const t0 = performance.now();
      let ok = true;
      let summary = '';
      try {
        if (node.type === 'choice') {
          const r = await runChoice(node, ctx);
          ok = r.ok; summary = r.summary;
        } else if (node.type === 'for-each' || node.type === 'parallel-for-each') {
          const r = await runForEach(node, node.type === 'parallel-for-each', ctx);
          ok = r.ok; summary = r.summary;
        } else if (node.type === 'scatter-gather') {
          const r = await runScatterGather(node, ctx);
          ok = r.ok; summary = r.summary;
        } else if (node.type === 'try') {
          const r = await runTry(node, ctx);
          ok = r.ok; summary = r.summary;
        } else if (node.type === 'first-successful') {
          const r = await runFirstSuccessful(node, ctx);
          ok = r.ok; summary = r.summary;
        } else if (node.type === 'round-robin') {
          const r = await runRoundRobin(node, ctx);
          ok = r.ok; summary = r.summary;
        } else if (node.type === 'async') {
          const r = await runAsync(node, ctx);
          ok = r.ok; summary = r.summary;
        }
      } finally {
        if (skipUntilNodeRef.current === node.id) skipUntilNodeRef.current = null;
      }
      const elapsed = Math.round(performance.now() - t0);
      if (ok) {
        markNode(node.id, { status: 'success', output: summary, executionTimeMs: elapsed });
      } else {
        markNode(node.id, { status: 'error', error: summary || 'Scope execution failed', executionTimeMs: elapsed });
      }
      return ok;
    };

    /** Choice: first matching `when` predicate wins, fall back to `otherwise`.
     *  Sequential — the matched branch shares ctx with the parent. */
    const runChoice = async (node: FlowNode, ctx: ExecCtx): Promise<{ ok: boolean; summary: string }> => {
      if (!node.branches || node.branches.length === 0) {
        return { ok: true, summary: '(empty choice — nothing to run)' };
      }
      let matched: Branch | null = null;
      let matchedReason = '';
      for (const b of node.branches) {
        if (b.isOtherwise) continue;
        if (!b.predicate || !b.predicate.trim()) continue;
        const result = await evalExpression(b.predicate, ctx);
        if (!result.ok) {
          return { ok: false, summary: `Predicate "${b.predicate}" failed: ${result.error}` };
        }
        if (result.value === true || result.raw.trim() === 'true') {
          matched = b;
          matchedReason = `when ${b.predicate}`;
          break;
        }
      }
      if (!matched) {
        matched = node.branches.find((b) => b.isOtherwise) || null;
        matchedReason = matched ? 'otherwise' : '(no branch matched)';
      }
      const skipIds = new Set<string>();
      for (const b of node.branches) {
        if (b !== matched) collectIds(b.nodes, skipIds);
      }
      markSkipped(skipIds);

      let branchOk = true;
      if (matched && matched.nodes.length > 0) {
        branchOk = await runList(matched.nodes, ctx);
      }
      return {
        ok: branchOk,
        summary: branchOk ? `Took branch: ${matchedReason}` : `Branch "${matchedReason}" failed`,
      };
    };

    /** For Each / Parallel For Each: iterate over a collection expression,
     *  set payload to each item, run the (single) body branch, aggregate
     *  outputs as a JSON array.
     *  Parallel mode forks a fresh ctx per iteration so concurrent bodies
     *  can't trample each other across awaits. Sequential mode threads one
     *  fresh ctx per iteration too — body mutations are intentionally
     *  isolated so a later iteration starts from the parent's payload, not
     *  the previous body's output (which is what Mule for-each does). */
    const runForEach = async (node: FlowNode, parallel: boolean, ctx: ExecCtx): Promise<{ ok: boolean; summary: string }> => {
      const collectionExpr = node.config.forEachCollection || 'payload';
      const counterName = (node.config.forEachCounter || 'counter').trim() || 'counter';
      const body = node.branches?.[0];
      if (!body) return { ok: false, summary: 'No body branch defined.' };

      const coll = await evalExpression(collectionExpr, ctx);
      if (!coll.ok) return { ok: false, summary: `Collection "${collectionExpr}" failed: ${coll.error}` };
      if (!Array.isArray(coll.value)) {
        return { ok: false, summary: `Collection didn't evaluate to an Array — got ${typeof coll.value}.` };
      }
      const items = coll.value;
      if (items.length === 0) {
        ctx.payload = '[]';
        ctx.mime = 'application/json';
        return { ok: true, summary: 'Iterated over 0 items.' };
      }

      const runOneIter = async (item: unknown, index: number): Promise<string | null> => {
        const iterCtx: ExecCtx = {
          payload: typeof item === 'string' ? item : JSON.stringify(item),
          mime: 'application/json',
          attributes: ctx.attributes,
          multipartJson: null,
          payloadFilePath: null,
          variables: { ...ctx.variables, [counterName]: String(index) },
        };
        const ok = await runList(body.nodes, iterCtx);
        return ok ? iterCtx.payload : null;
      };

      let outputs: (string | null)[];
      if (parallel) {
        outputs = await Promise.all(items.map((item, idx) => runOneIter(item, idx)));
      } else {
        outputs = [];
        for (let i = 0; i < items.length; i++) {
          outputs.push(await runOneIter(items[i], i));
          if (abortRef.current) break;
        }
      }
      const failedIdx = outputs.findIndex((o) => o === null);
      if (failedIdx >= 0) {
        return { ok: false, summary: `Iteration ${failedIdx + 1} of ${items.length} failed.` };
      }
      const parsed = outputs.map((o) => {
        try { return JSON.parse(o!); } catch { return o; }
      });
      ctx.payload = JSON.stringify(parsed);
      ctx.mime = 'application/json';
      return { ok: true, summary: `${parallel ? 'Parallel-iterated' : 'Iterated'} over ${items.length} item${items.length === 1 ? '' : 's'}.` };
    };

    /** Scatter-Gather: fork the current context into every branch concurrently,
     *  aggregate the outputs as { route1: ..., route2: ... } (or array).
     *  Each route gets its own forked ctx — concurrent branches cannot
     *  race on the parent's payload/vars. */
    const runScatterGather = async (node: FlowNode, ctx: ExecCtx): Promise<{ ok: boolean; summary: string }> => {
      if (!node.branches || node.branches.length === 0) {
        return { ok: true, summary: '(no routes)' };
      }
      const strategy = node.config.aggregatorStrategy || 'object';

      const runOneRoute = async (branch: Branch): Promise<{ name: string; output: string | null }> => {
        const name = (branch.label && branch.label.trim()) || `route${(node.branches!.indexOf(branch) + 1)}`;
        const branchCtx = forkCtx(ctx);
        const ok = await runList(branch.nodes, branchCtx);
        return { name, output: ok ? branchCtx.payload : null };
      };

      const results = await Promise.all(node.branches.map(runOneRoute));
      const failed = results.find((r) => r.output === null);
      if (failed) {
        return { ok: false, summary: `Route "${failed.name}" failed.` };
      }
      let aggregated: unknown;
      if (strategy === 'array') {
        aggregated = results.map((r) => {
          try { return JSON.parse(r.output!); } catch { return r.output; }
        });
      } else {
        const obj: Record<string, unknown> = {};
        for (const r of results) {
          try { obj[r.name] = JSON.parse(r.output!); } catch { obj[r.name] = r.output; }
        }
        aggregated = obj;
      }
      ctx.payload = JSON.stringify(aggregated);
      ctx.mime = 'application/json';
      return { ok: true, summary: `Gathered ${results.length} route${results.length === 1 ? '' : 's'}.` };
    };

    /** Try: run the main branch; if any node errors, capture into vars.error
     *  and run the on-error branch. Mirrors Mule's `try` / `error-handler`. */
    const runTry = async (node: FlowNode, ctx: ExecCtx): Promise<{ ok: boolean; summary: string }> => {
      const main = node.branches?.find((b) => !b.isErrorHandler);
      const onError = node.branches?.find((b) => b.isErrorHandler);
      if (!main) return { ok: false, summary: 'Try has no main branch.' };

      const mainOk = await runList(main.nodes, ctx);
      if (mainOk) {
        if (onError) {
          const skipIds = new Set<string>();
          collectIds(onError.nodes, skipIds);
          markSkipped(skipIds);
        }
        return { ok: true, summary: 'main branch succeeded.' };
      }

      const failingNode = (() => {
        const flat: FlowNode[] = [];
        const walk = (ns: FlowNode[]) => { for (const n of ns) { flat.push(n); if (n.branches) for (const b of n.branches) walk(b.nodes); } };
        walk(main.nodes);
        return flat.find((n) => n.status === 'error');
      })();
      ctx.variables.error = failingNode?.error || 'Unknown error';

      if (!onError) {
        return { ok: false, summary: 'main branch failed and no on-error handler.' };
      }
      const handlerOk = await runList(onError.nodes, ctx);
      return {
        ok: handlerOk,
        summary: handlerOk ? 'main failed → on-error recovered.' : 'main failed AND on-error failed.',
      };
    };

    /** First Successful: try each branch in order, stop on first success.
     *  Each attempt gets a fork of ctx so failed routes don't leak into
     *  the next attempt or back into the parent. The winning route's ctx
     *  is copied back so its payload/vars flow to siblings. */
    const runFirstSuccessful = async (node: FlowNode, ctx: ExecCtx): Promise<{ ok: boolean; summary: string }> => {
      if (!node.branches || node.branches.length === 0) {
        return { ok: true, summary: '(no routes)' };
      }
      let lastError = '';
      const t0 = performance.now();
      for (let i = 0; i < node.branches.length; i++) {
        const b = node.branches[i];
        const attemptCtx = forkCtx(ctx);
        const ok = await runList(b.nodes, attemptCtx);
        if (ok) {
          // Copy the winner's ctx back to the parent so siblings see it.
          ctx.payload = attemptCtx.payload;
          ctx.mime = attemptCtx.mime;
          ctx.attributes = attemptCtx.attributes;
          ctx.multipartJson = attemptCtx.multipartJson;
          ctx.payloadFilePath = attemptCtx.payloadFilePath;
          ctx.variables = attemptCtx.variables;
          // Mark remaining branches as skipped
          const skipIds = new Set<string>();
          for (let j = i + 1; j < node.branches.length; j++) collectIds(node.branches[j].nodes, skipIds);
          markSkipped(skipIds);
          return { ok: true, summary: `Route "${b.label || `route${i + 1}`}" succeeded (took ${Math.round(performance.now() - t0)}ms).` };
        }
        const failingNode = (() => {
          const flat: FlowNode[] = [];
          const walk = (ns: FlowNode[]) => { for (const n of ns) { flat.push(n); if (n.branches) for (const c of n.branches) walk(c.nodes); } };
          walk(b.nodes);
          return flat.find((n) => n.status === 'error');
        })();
        lastError = failingNode?.error || 'failed';
      }
      return { ok: false, summary: `All ${node.branches.length} routes failed. Last error: ${lastError}` };
    };

    /** Round Robin: in Mule this rotates per invocation; in Studio (which
     *  runs one-shot) we always pick branch 0 and skip the rest. */
    const runRoundRobin = async (node: FlowNode, ctx: ExecCtx): Promise<{ ok: boolean; summary: string }> => {
      if (!node.branches || node.branches.length === 0) {
        return { ok: true, summary: '(no routes)' };
      }
      const first = node.branches[0];
      const skipIds = new Set<string>();
      for (let i = 1; i < node.branches.length; i++) collectIds(node.branches[i].nodes, skipIds);
      markSkipped(skipIds);
      const ok = await runList(first.nodes, ctx);
      return {
        ok,
        summary: ok
          ? `Took route "${first.label || 'route1'}" (Round Robin always picks branch 0 in Studio).`
          : `Route "${first.label || 'route1'}" failed.`,
      };
    };

    /** Async: spawn the branch without awaiting. The parent flow continues
     *  immediately. Spawned work gets its own forked ctx so background
     *  mutations cannot affect the parent. Step-through pauses are
     *  suppressed inside async scopes (parent can't await them). */
    const runAsync = async (node: FlowNode, ctx: ExecCtx): Promise<{ ok: boolean; summary: string }> => {
      const body = node.branches?.[0];
      if (!body || body.nodes.length === 0) return { ok: true, summary: '(empty async — nothing to run)' };
      const prevSkip = skipUntilNodeRef.current;
      skipUntilNodeRef.current = node.id;
      const asyncCtx = forkCtx(ctx);
      void (async () => {
        try { await runList(body.nodes, asyncCtx); } catch { /* swallowed */ }
      })();
      skipUntilNodeRef.current = prevSkip;
      return { ok: true, summary: `Spawned ${body.nodes.length} node${body.nodes.length === 1 ? '' : 's'} asynchronously.` };
    };

    /** Run a list of nodes sequentially (top-level or branch-inner).
     *  Siblings share the same ctx — earlier nodes' mutations are visible
     *  to later ones. Concurrent forking happens inside scope handlers. */
    const runList = async (ns: FlowNode[], ctx: ExecCtx): Promise<boolean> => {
      const ordered = [...ns].filter((n) => !n.disabled).sort((a, b) => a.x - b.x);
      for (const node of ordered) {
        if (abortRef.current) return false;
        setStepIndex(stepCounter++);
        markNode(node.id, { status: 'running' });

        if (isScopeType(node.type)) {
          // Pause BEFORE a scope so the user can Step Into it.
          if (!(await pauseIfStepping(node.id))) return false;
          if (!(await runScope(node, ctx))) return false;
        } else {
          // Run the leaf first, THEN pause on it — stepping to a connector should
          // execute it and show its result, not wait for the next click to run it.
          if (!(await runLeaf(node, ctx))) return false;
          if (!(await pauseIfStepping(node.id))) return false;
        }
      }
      return true;
    };

    await runList(nodes, initialCtx);

    setIsRunning(false);
    setStepIndex(null);
  }, [nodes, flowInput]);

  // ── Step-through controls ────────────────────────────────────────
  const stepNext = useCallback(() => {
    if (stepResolveRef.current) {
      stepResolveRef.current();
      stepResolveRef.current = null;
    }
  }, []);

  const stepCancel = useCallback(() => {
    abortRef.current = true;
    if (stepResolveRef.current) {
      stepResolveRef.current();
      stepResolveRef.current = null;
    }
    setIsRunning(false);
    setStepping(false);
    setStepIndex(null);
    setCurrentStepNodeId(null);
    skipUntilNodeRef.current = null;
  }, []);

  /** Step Over: if currently paused on a scope, fast-forward through all its
   *  nested nodes without pausing for each one. The scope's runChoice clears
   *  the skip flag automatically when it exits. */
  const stepOver = useCallback(() => {
    if (!currentStepNodeId) return;
    skipUntilNodeRef.current = currentStepNodeId;
    if (stepResolveRef.current) {
      stepResolveRef.current();
      stepResolveRef.current = null;
    }
  }, [currentStepNodeId]);

  // ── Toggle disabled ─────────────────────────────────────────────
  const toggleDisabled = useCallback((id: string) => {
    setNodes((prev) => mapNodesDeep(prev, (n) => n.id === id ? { ...n, disabled: !n.disabled } : n));
  }, []);

  // ── Duplicate node ──────────────────────────────────────────────
  const duplicateNode = useCallback((id: string) => {
    setNodes((prev) => {
      // Only support duplicating top-level nodes — duplicating an in-branch
      // node is rarely useful and would require resolving its branch parent.
      const src = prev.find((n) => n.id === id);
      if (!src) return prev;
      // Recursive deep-clone so nested branches (Choice inside Scatter-Gather,
      // For Each inside Try, etc.) get fresh ids at every level. The previous
      // one-level-deep map left inner scopes' grandchildren sharing refs
      // with the original — mutating the duplicate would silently mutate
      // the source tree.
      const deepClone = (n: FlowNode): FlowNode => ({
        ...n,
        id: newId(),
        status: 'idle',
        output: undefined,
        error: undefined,
        executionTimeMs: undefined,
        config: { ...n.config },
        branches: n.branches?.map((b) => ({
          ...b,
          id: newId(),
          nodes: b.nodes.map(deepClone),
        })),
      });
      const clone = deepClone(src);
      clone.x = src.x + 40;
      clone.y = src.y + 40;
      return [...prev, clone];
    });
  }, []);

  // ── Save / Load flow ────────────────────────────────────────────
  const [flowName, setFlowName] = useState('Untitled Flow');
  const [flowDirty, setFlowDirty] = useState(false);
  const [flowCurrentFile, setFlowCurrentFile] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveDialogName, setSaveDialogName] = useState('');
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [openDialogFiles, setOpenDialogFiles] = useState<{ filename: string; projectName: string }[]>([]);
  const [openDialogQuery, setOpenDialogQuery] = useState('');
  const [openDialogActive, setOpenDialogActive] = useState(0);
  const openDialogInputRef = useRef<HTMLInputElement>(null);
  const saveDialogInputRef = useRef<HTMLInputElement>(null);
  // Mule XML round-trip dialogs
  const [muleXmlExport, setMuleXmlExport] = useState<string | null>(null);
  const [showMuleXmlImport, setShowMuleXmlImport] = useState(false);
  const [muleXmlImportText, setMuleXmlImportText] = useState('');
  const [muleXmlImportResult, setMuleXmlImportResult] = useState<{ kind: 'error'; msg: string } | { kind: 'preview'; flowName: string; nodeCount: number; warnings: string[] } | null>(null);
  // Sync dialog-open ref for keyboard handler (declared earlier)
  dialogOpenRef.current = showSaveDialog || showOpenDialog || muleXmlExport !== null || showMuleXmlImport || showInputEditor;

  // Mark dirty on any node change
  useEffect(() => { if (nodes.length > 0) setFlowDirty(true); }, [nodes]);

  const doSaveFlow = useCallback(async (name: string) => {
    try {
      // v2 schema: a flow-only workspace has 0 requests and the flow lives
      // in the top-level `flow` field. The Rust save_workspace skips its
      // default-request injection when flow is present.
      const workspace = {
        version: '2.0',
        projectName: name,
        createdAt: '',
        updatedAt: '',
        requests: [],
        // Reset transient runtime fields on every node in the tree (including
        // nodes nested inside scope branches) before serialization.
        flow: mapNodesDeep(nodes, (n) => ({ ...n, status: 'idle', output: undefined, error: undefined, executionTimeMs: undefined })),
        flowInput,
      };
      const path = await invoke<string>('save_workspace', { workspace });
      const filename = path.split(/[/\\]/).pop() || '';
      setFlowName(name);
      setFlowCurrentFile(filename);
      setFlowDirty(false);
      toast(`Saved "${name}"`, 'success');
    } catch (e) {
      toast(`Failed to save: ${(e as Error).message}`, 'error');
    }
  }, [nodes, flowInput]);

  const saveFlow = useCallback(() => {
    if (flowCurrentFile) {
      // Already saved before — overwrite silently
      doSaveFlow(flowName);
    } else {
      // First save — prompt for name
      setSaveDialogName(flowName);
      setShowSaveDialog(true);
      requestAnimationFrame(() => saveDialogInputRef.current?.select());
    }
  }, [flowCurrentFile, flowName, doSaveFlow]);

  const openFlowPicker = useCallback(async () => {
    try {
      const metas = await invoke<{ filename: string; projectName: string; mode: string }[]>('list_workspaces_meta');
      const flowMetas = metas.filter(m => m.mode === 'flow');
      setOpenDialogFiles(flowMetas);
      setOpenDialogQuery('');
      setOpenDialogActive(0);
      setShowOpenDialog(true);
      requestAnimationFrame(() => openDialogInputRef.current?.focus());
    } catch (e) {
      toast(`Failed to list workspaces: ${(e as Error).message}`, 'error');
    }
  }, []);

  const loadFlowFile = useCallback(async (filename: string) => {
    try {
      // v2 schema: the flow lives in the top-level `flow` field. Legacy v1
      // workspaces auto-migrated by the Rust backend still expose their
      // nodes through this field (migration copies flowNodes -> flow).
      const ws = await invoke<{ projectName: string; flow?: FlowNode[] | null; flowInput?: Partial<FlowInput> | null }>('load_workspace', { filename });
      const flowNodes = ws.flow;
      if (flowNodes && Array.isArray(flowNodes) && flowNodes.length > 0) {
        // Backfill kind: 'leaf' for v1/v2 nodes that pre-date scope support.
        const migrated = migrateLegacyNodes(flowNodes);
        setNodes(migrated.map((n) => ({ ...n, status: 'idle' as const, output: undefined, error: undefined, executionTimeMs: undefined })));
        setFlowName(ws.projectName);
        setFlowCurrentFile(filename);
        setFlowDirty(false);
        setSelectedId(null);
        setFlowInput(ws.flowInput
          ? { payload: ws.flowInput.payload ?? '', mime: ws.flowInput.mime ?? 'application/json', attributesJson: ws.flowInput.attributesJson ?? DEFAULT_FLOW_INPUT.attributesJson }
          : DEFAULT_FLOW_INPUT);
        toast(`Opened "${ws.projectName}"`, 'success');
      } else {
        toast('This workspace does not contain a message flow.', 'error');
      }
    } catch (e) {
      toast(`Failed to load: ${(e as Error).message}`, 'error');
    }
  }, []);

  // ── Clear flow ──────────────────────────────────────────────────
  const clearFlow = useCallback(() => {
    setNodes([]);
    setSelectedId(null);
    setDismissedValidations(new Set());
  }, []);

  // ── Mule 4 XML round-trip ───────────────────────────────────────
  const handleExportMuleXml = useCallback(() => {
    if (nodes.length === 0) {
      toast('Build a flow first — there\'s nothing to export.', 'error');
      return;
    }
    try {
      const xml = exportFlowToMuleXml(flowName, nodes);
      setMuleXmlExport(xml);
    } catch (e) {
      toast(`Failed to export: ${(e as Error).message}`, 'error');
    }
  }, [flowName, nodes]);

  const handleImportMuleXml = useCallback(() => {
    setMuleXmlImportText('');
    setMuleXmlImportResult(null);
    setShowMuleXmlImport(true);
  }, []);

  /** Try-parse the import textarea — preview the result before committing. */
  const previewMuleXmlImport = useCallback(() => {
    const result = importMuleXml(muleXmlImportText);
    if (!result.ok) {
      setMuleXmlImportResult({ kind: 'error', msg: result.error });
      return;
    }
    setMuleXmlImportResult({
      kind: 'preview',
      flowName: result.flowName,
      nodeCount: countAllNodes(result.nodes),
      warnings: result.warnings,
    });
  }, [muleXmlImportText]);

  /** Confirm import — replaces the current flow with the parsed one. */
  const confirmMuleXmlImport = useCallback(() => {
    const result = importMuleXml(muleXmlImportText);
    if (!result.ok) {
      toast(`Import failed: ${result.error}`, 'error');
      return;
    }
    setNodes(result.nodes);
    setFlowName(result.flowName);
    setFlowDirty(true);
    setFlowCurrentFile(null);
    setSelectedId(null);
    // Pre-seed the input fixture with the inbound attribute keys the flow reads
    // (empty values) so the user sees exactly what to fill in to test it.
    let attrNote = '';
    if (result.suggestedAttributes) {
      const a = result.suggestedAttributes;
      setFlowInput((prev) => ({
        ...prev,
        attributesJson: JSON.stringify({ uriParams: a.uriParams, queryParams: a.queryParams, headers: a.headers, method: 'GET' }, null, 2),
      }));
      const keyCount = Object.keys(a.uriParams).length + Object.keys(a.queryParams).length + Object.keys(a.headers).length;
      if (keyCount > 0) attrNote = ` · seeded ${keyCount} input attribute${keyCount === 1 ? '' : 's'} — set values under “Input”`;
    }
    setShowMuleXmlImport(false);
    setMuleXmlImportText('');
    setMuleXmlImportResult(null);
    const tail = result.warnings.length > 0 ? ` (${result.warnings.length} unsupported element${result.warnings.length === 1 ? '' : 's'} imported as Logger placeholder)` : '';
    toast(`Imported "${result.flowName}" — ${countAllNodes(result.nodes)} node${countAllNodes(result.nodes) === 1 ? '' : 's'}${tail}${attrNote}`, 'success');
  }, [muleXmlImportText]);

  if (!open) return null;

  // ── Recursive scope-body renderer ────────────────────────────────
  // Returns the JSX that goes INSIDE a scope's body (config bar +
  // branches with their inner-node chains + add-branch buttons).
  //
  // `depth` is the nesting level — 0 for top-level scopes, 1 for a
  // scope inside a branch, etc. It only drives a subtle visual indent;
  // execution treats all depths the same.
  //
  // Inside each branch's inner-node chain, leaf nodes render as chips
  // (compact pills) and SCOPE nodes render as full expanded cards
  // (see renderNestedScope below) so the user can see + edit nested
  // hierarchies at a glance without drill-down.
  const renderNestedScope = (innerNode: FlowNode, depth: number): React.ReactNode => {
    const innerMeta = NODE_META[innerNode.type];
    const isCollapsed = collapsedScopes.has(innerNode.id);
    const isInnerSelected = innerNode.id === selectedId;
    const branchCount = innerNode.branches?.length ?? 0;

    // Status-driven background tint, mirroring the chip style for visual
    // consistency between leaf chips and nested scope cards in the same row.
    const statusBg = innerNode.status === 'success'
      ? `color-mix(in oklch, ${innerMeta.color} 6%, var(--surface-2))`
      : innerNode.status === 'error'
        ? 'color-mix(in oklch, var(--err) 6%, var(--surface-2))'
        : innerNode.status === 'skipped'
          ? 'color-mix(in oklch, var(--content) 3%, var(--surface-2))'
          : 'var(--surface-2)';

    return (
      <div
        key={innerNode.id}
        className="rounded-md border overflow-hidden shrink-0 self-start"
        style={{
          // Subtle left accent in the scope's color so the user can spot
          // its type at a glance even when collapsed.
          borderColor: isInnerSelected
            ? 'var(--accent)'
            : `color-mix(in oklch, ${innerMeta.color} 30%, transparent)`,
          background: statusBg,
          opacity: innerNode.disabled || innerNode.status === 'skipped' ? 0.55 : 1,
        }}
        onClick={(e) => { e.stopPropagation(); setSelectedId(innerNode.id); }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ x: e.clientX, y: e.clientY, nodeId: innerNode.id });
        }}
      >
        {/* Slim header: collapse toggle + icon + badge + label + status */}
        <div
          className="flex items-center gap-1.5 px-2 py-1"
          style={{
            background: `color-mix(in oklch, ${innerMeta.color} 8%, var(--surface-2))`,
            borderBottom: isCollapsed ? 'none' : `1px solid color-mix(in oklch, ${innerMeta.color} 18%, transparent)`,
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); toggleScopeCollapsed(innerNode.id); }}
            className="shrink-0 w-3.5 h-3.5 flex items-center justify-center text-content-faint hover:text-content cursor-pointer"
            title={isCollapsed ? 'Expand scope' : 'Collapse scope'}
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>
              <path d="M3 1l5 4-5 4V1z" />
            </svg>
          </button>
          <div style={{ color: innerMeta.color }}><NodeIcon type={innerNode.type} size={10} /></div>
          <span className="text-[8.5px] font-mono font-bold uppercase tracking-wider shrink-0 px-1 py-px rounded" style={{ color: innerMeta.color, background: `color-mix(in oklch, ${innerMeta.color} 14%, transparent)` }}>
            {innerMeta.badge}
          </span>
          <span className="text-[10.5px] font-semibold text-content truncate flex-1">{innerNode.label}</span>
          {isCollapsed && branchCount > 0 && (
            <span className="text-[9px] font-mono text-content-ghost shrink-0">
              {branchCount} branch{branchCount === 1 ? '' : 'es'}
            </span>
          )}
          {innerNode.status === 'running' && (
            <div className="w-2.5 h-2.5 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: innerMeta.color, borderTopColor: 'transparent' }} />
          )}
          {innerNode.status === 'success' && (
            <svg className="shrink-0" width="10" height="10" viewBox="0 0 16 16" fill={innerMeta.color}><path d="M13.485 3.929a1 1 0 01.036 1.414l-6 6.5a1 1 0 01-1.45.022l-3-3a1 1 0 111.414-1.414L6.95 9.915l5.293-5.95a1 1 0 011.242-.036z"/></svg>
          )}
          {innerNode.status === 'error' && (
            <svg className="shrink-0" width="10" height="10" viewBox="0 0 16 16" fill="var(--err)"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 3a.75.75 0 00-.75.75v4.5a.75.75 0 001.5 0v-4.5A.75.75 0 008 4zm0 8a1 1 0 100-2 1 1 0 000 2z"/></svg>
          )}
        </div>
        {/* Expanded body — only when not collapsed */}
        {!isCollapsed && (
          <div className="px-1.5 py-1.5" style={{ background: 'color-mix(in oklch, var(--bg) 50%, var(--surface-2))' }}>
            {renderScopeBody(innerNode, depth)}
          </div>
        )}
      </div>
    );
  };

  // A single leaf node rendered as an Anypoint-style "station": a colored icon
  // tile with the doc:name caption beneath, joined to neighbours by a rail.
  const renderStation = (inner: FlowNode): React.ReactNode => {
    const m = NODE_META[inner.type];
    const sel = inner.id === selectedId;
    const stepping = inner.id === currentStepNodeId;
    const tileBg = inner.status === 'success'
      ? `color-mix(in oklch, ${m.color} 16%, var(--surface))`
      : inner.status === 'error'
        ? 'color-mix(in oklch, var(--err) 16%, var(--surface))'
        : inner.status === 'skipped'
          ? 'color-mix(in oklch, var(--content) 5%, var(--surface))'
          : 'var(--surface)';
    return (
      <button
        key={inner.id}
        onClick={(e) => { e.stopPropagation(); setSelectedId(inner.id); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, nodeId: inner.id }); }}
        className="flex flex-col items-center gap-1 w-[86px] shrink-0 cursor-pointer"
        style={{ opacity: inner.disabled || inner.status === 'skipped' ? 0.5 : 1 }}
        title={`${m.label} — ${inner.label}`}
      >
        <div
          className="relative w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-colors"
          style={{
            borderColor: sel || stepping ? 'var(--accent)' : `color-mix(in oklch, ${m.color} 38%, transparent)`,
            background: tileBg,
            boxShadow: sel || stepping ? '0 0 0 3px color-mix(in oklch, var(--accent) 22%, transparent)' : 'none',
          }}
        >
          <span style={{ color: m.color }}><NodeIcon type={inner.type} size={20} /></span>
          {inner.status === 'running' && (
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: m.color, borderTopColor: 'transparent', background: 'var(--surface)' }} />
          )}
          {inner.status === 'success' && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: m.color }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="white"><path d="M13.485 3.929a1 1 0 01.036 1.414l-6 6.5a1 1 0 01-1.45.022l-3-3a1 1 0 111.414-1.414L6.95 9.915l5.293-5.95a1 1 0 011.242-.036z"/></svg>
            </span>
          )}
          {inner.status === 'error' && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'var(--err)' }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="white"><path d="M8 3.5a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 018 3.5zm0 7a1 1 0 100 2 1 1 0 000-2z"/></svg>
            </span>
          )}
        </div>
        <span
          className="text-[9.5px] leading-tight text-center font-medium"
          style={{
            color: inner.disabled ? 'var(--content-faint)' : 'var(--content)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {inner.label}
        </span>
      </button>
    );
  };

  const renderScopeBody = (scopeNode: FlowNode, depth: number): React.ReactNode => {
    const meta = NODE_META[scopeNode.type];
    if (!scopeNode.branches) return null;
    return (
      <div className="space-y-2" data-no-drag>
        {/* For Each / Parallel For Each: scope-level inputs above the body */}
        {(scopeNode.type === 'for-each' || scopeNode.type === 'parallel-for-each') && (
          <div className="space-y-1 px-1 pb-1 border-b border-line-subtle">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 w-[60px]" style={{ color: meta.color }}>collection</span>
              <input
                value={scopeNode.config.forEachCollection || ''}
                onChange={(e) => updateConfig(scopeNode.id, { forEachCollection: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="payload.items"
                className="flex-1 min-w-0 text-[10.5px] font-mono bg-transparent border-b border-line-subtle outline-none text-content placeholder:text-content-ghost focus:border-accent"
                spellCheck={false}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 w-[60px] text-content-faint">counter</span>
              <input
                value={scopeNode.config.forEachCounter || ''}
                onChange={(e) => updateConfig(scopeNode.id, { forEachCounter: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="counter"
                className="flex-1 min-w-0 text-[10.5px] font-mono bg-transparent border-b border-line-subtle outline-none text-content placeholder:text-content-ghost focus:border-accent"
                spellCheck={false}
              />
              <span className="text-[9px] text-content-ghost">→ vars.{scopeNode.config.forEachCounter || 'counter'}</span>
            </div>
          </div>
        )}
        {/* Scatter-Gather: aggregator strategy toggle */}
        {scopeNode.type === 'scatter-gather' && (
          <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-line-subtle">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider shrink-0" style={{ color: meta.color }}>aggregate</span>
            <button
              onClick={(e) => { e.stopPropagation(); updateConfig(scopeNode.id, { aggregatorStrategy: 'object' }); }}
              className={`text-[9.5px] font-mono px-1.5 py-px rounded cursor-pointer border ${(scopeNode.config.aggregatorStrategy || 'object') === 'object' ? '' : 'border-transparent'}`}
              style={(scopeNode.config.aggregatorStrategy || 'object') === 'object'
                ? { borderColor: meta.color, color: meta.color, background: `color-mix(in oklch, ${meta.color} 8%, transparent)` }
                : { color: 'var(--content-faint)' }}
            >{'{ route1: ..., route2: ... }'}</button>
            <button
              onClick={(e) => { e.stopPropagation(); updateConfig(scopeNode.id, { aggregatorStrategy: 'array' }); }}
              className={`text-[9.5px] font-mono px-1.5 py-px rounded cursor-pointer border ${scopeNode.config.aggregatorStrategy === 'array' ? '' : 'border-transparent'}`}
              style={scopeNode.config.aggregatorStrategy === 'array'
                ? { borderColor: meta.color, color: meta.color, background: `color-mix(in oklch, ${meta.color} 8%, transparent)` }
                : { color: 'var(--content-faint)' }}
            >{'[r1, r2]'}</button>
          </div>
        )}
        {scopeNode.branches.map((branch, branchIdx) => {
          const isChoice = scopeNode.type === 'choice';
          const isForEach = scopeNode.type === 'for-each' || scopeNode.type === 'parallel-for-each';
          const isScatter = scopeNode.type === 'scatter-gather';
          const isTry = scopeNode.type === 'try';
          const isMultiRoute = scopeNode.type === 'first-successful' || scopeNode.type === 'round-robin';
          const isAsync = scopeNode.type === 'async';
          const labelTag = isChoice
            ? (branch.isOtherwise ? 'else' : 'when')
            : isForEach || isAsync
              ? 'body'
              : isTry
                ? (branch.isErrorHandler ? 'on-error' : 'main')
                : (branch.label || `route${branchIdx + 1}`);
          const branchAccent = (isChoice && branch.isOtherwise) || (isTry && branch.isErrorHandler) ? null : meta.color;
          const labelEditable = isScatter || isMultiRoute;
          return (
          <div
            key={branch.id}
            className="rounded-md border overflow-hidden"
            style={{
              borderColor: branchAccent
                ? `color-mix(in oklch, ${branchAccent} 25%, transparent)`
                : 'color-mix(in oklch, var(--content) 12%, transparent)',
              background: branchAccent
                ? `color-mix(in oklch, ${branchAccent} 4%, var(--surface-2))`
                : 'color-mix(in oklch, var(--content) 3%, var(--surface-2))',
            }}
          >
            {/* Branch label / predicate */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b" style={{ borderColor: 'color-mix(in oklch, var(--content) 8%, transparent)' }}>
              {labelEditable ? (
                <input
                  value={branch.label || ''}
                  onChange={(e) => updateBranch(scopeNode.id, branch.id, { label: e.target.value })}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder={`route${branchIdx + 1}`}
                  className="text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 w-[70px] px-1 py-px rounded bg-transparent border-none outline-none focus:bg-surface-3"
                  style={{
                    color: meta.color,
                    background: `color-mix(in oklch, ${meta.color} 12%, transparent)`,
                  }}
                  spellCheck={false}
                />
              ) : (
                <span
                  className="text-[8.5px] font-mono font-bold uppercase tracking-wider shrink-0 px-1 py-px rounded"
                  style={{
                    color: branchAccent || 'var(--content-faint)',
                    background: branchAccent
                      ? `color-mix(in oklch, ${branchAccent} 12%, transparent)`
                      : 'color-mix(in oklch, var(--content) 6%, transparent)',
                  }}
                >
                  {labelTag}
                </span>
              )}
              {isChoice && branch.isOtherwise ? (
                <span className="text-[10.5px] text-content-faint italic flex-1">otherwise (no predicate matches)</span>
              ) : isChoice ? (
                <input
                  value={branch.predicate || ''}
                  onChange={(e) => updateBranch(scopeNode.id, branch.id, { predicate: e.target.value })}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder="DataWeave boolean expression (e.g. payload.age > 18)"
                  className="flex-1 min-w-0 text-[10.5px] font-mono bg-transparent border-none outline-none text-content placeholder:text-content-ghost"
                  spellCheck={false}
                />
              ) : (
                <span className="flex-1" />
              )}
              {((isChoice && !branch.isOtherwise && (scopeNode.branches?.filter((b) => !b.isOtherwise).length ?? 0) > 1) ||
                (isScatter && (scopeNode.branches?.length ?? 0) > 1) ||
                (isMultiRoute && (scopeNode.branches?.length ?? 0) > 1)) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = scopeNode.branches!.filter((b) => b.id !== branch.id);
                    updateNode(scopeNode.id, { branches: next });
                  }}
                  className="shrink-0 w-4 h-4 rounded text-[10px] text-content-ghost hover:text-[var(--err)] hover:bg-surface-3 cursor-pointer"
                  title="Remove this branch"
                >×</button>
              )}
            </div>

            {/* Inner-node chain — Anypoint-style station track. Leaves render as
                icon + caption stations joined by a rail; nested scopes break to
                their own row as expanded cards. */}
            <div className="flex items-start gap-1 px-3 py-3" style={{ background: 'color-mix(in oklch, var(--bg) 35%, transparent)' }}>
              {[...branch.nodes].sort((a, b) => a.x - b.x).map((inner, idx) => (
                <Fragment key={inner.id}>
                  {idx > 0 && (
                    <div className="shrink-0 self-start rounded-full" style={{ marginTop: 22, height: 2, width: 16, background: 'color-mix(in oklch, var(--content) 28%, transparent)' }} />
                  )}
                  {isScopeType(inner.type) ? renderNestedScope(inner, depth + 1) : renderStation(inner)}
                </Fragment>
              ))}
              {branch.nodes.length > 0 && (
                <div className="shrink-0 self-start rounded-full" style={{ marginTop: 22, height: 2, width: 12, background: 'color-mix(in oklch, var(--content) 18%, transparent)' }} />
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setBranchPalette({ scopeId: scopeNode.id, branchId: branch.id }); }}
                className="shrink-0 self-start flex items-center justify-center w-12 h-12 rounded-xl border-2 border-dashed text-content-faint hover:text-accent hover:border-accent cursor-pointer transition-colors text-[18px] leading-none"
                title="Add a node to this branch"
              >+</button>
            </div>
          </div>
          );
        })}
        {/* Add-branch button — hidden for fixed-arity scopes. */}
        {scopeNode.type === 'choice' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const otherwise = scopeNode.branches!.find((b) => b.isOtherwise);
              const others = scopeNode.branches!.filter((b) => !b.isOtherwise);
              const newBranches: Branch[] = [
                ...others,
                { id: newId(), nodes: [], predicate: '' },
                ...(otherwise ? [otherwise] : []),
              ];
              updateNode(scopeNode.id, { branches: newBranches });
            }}
            className="w-full text-[10px] font-mono py-1 rounded-md border border-dashed text-content-faint hover:text-accent hover:border-accent transition-colors cursor-pointer"
          >
            + Add when branch
          </button>
        )}
        {(scopeNode.type === 'scatter-gather' || scopeNode.type === 'first-successful' || scopeNode.type === 'round-robin') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const idx = (scopeNode.branches?.length ?? 0) + 1;
              const newBranches: Branch[] = [...(scopeNode.branches ?? []), { id: newId(), nodes: [], label: `route${idx}` }];
              updateNode(scopeNode.id, { branches: newBranches });
            }}
            className="w-full text-[10px] font-mono py-1 rounded-md border border-dashed text-content-faint hover:text-accent hover:border-accent transition-colors cursor-pointer"
          >
            + Add route
          </button>
        )}
      </div>
    );
  };

  // Determine which tabs to show for the selected node
  const isConnector = selected && (selected.type === 'salesforce' || selected.type === 'database' || selected.type === 'http-request');
  const showTabs = isConnector;

  // Field validation for connector nodes (only for query/select operations)
  const validation = selected && isConnector
    && (selected.config.operation === 'query' || selected.config.operation === 'select' || selected.type === 'http-request')
    && !dismissedValidations.has(selected.id)
    ? validateFields(selected.config.request || '', selected.config.mockResponse || '')
    : null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg">
      {/* ── Header ───────────────────────────────────────────────── */}
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-3 pl-4 pr-3 bg-surface border-b border-line">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Back to workspace"
        >
          <Icons.ChevronRight size={12} className="rotate-180" />
          Back
        </button>
        <div className="w-px h-4 bg-line" />
        <Icons.Flow size={14} className="shrink-0" style={{ color: 'var(--accent)' }} />
        <input
          value={flowName}
          onChange={(e) => { setFlowName(e.target.value); setFlowDirty(true); }}
          className="text-[13px] font-semibold text-content tracking-tight bg-transparent border-none outline-none w-auto min-w-[80px] max-w-[200px] focus:bg-surface-2 focus:px-1.5 focus:rounded"
          spellCheck={false}
        />
        {flowDirty && <span className="text-[10px] text-content-ghost">●</span>}
        <span className="text-[11px] text-content-faint font-mono">
          · {nodes.length} node{nodes.length !== 1 ? 's' : ''}
        </span>

        {/* Show active variables count */}
        {Object.keys(pipelineVars).length > 0 && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in oklch, #10b981 15%, transparent)', color: '#10b981' }}>
            {Object.keys(pipelineVars).length} var{Object.keys(pipelineVars).length !== 1 ? 's' : ''}
          </span>
        )}

        <span className="flex-1" />

        {/* Run controls */}
        {stepping ? (
          <>
            <span className="text-[11px] text-content-faint font-mono">
              Step {(stepIndex ?? 0) + 1}
            </span>
            {currentStepNodeId && (() => {
              const cur = findNodeById(nodes, currentStepNodeId);
              return cur && isScopeType(cur.type) ? (
                <button
                  onClick={stepOver}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors border border-line text-content-faint hover:text-content hover:bg-surface-2"
                  title="Run this scope to completion without pausing inside"
                >
                  Step Over
                </button>
              ) : null;
            })()}
            <button
              onClick={stepNext}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              title={currentStepNodeId && isScopeType(findNodeById(nodes, currentStepNodeId)?.type ?? 'logger')
                ? 'Step Into: pause at each node inside the scope'
                : 'Next step'}
            >
              {currentStepNodeId && isScopeType(findNodeById(nodes, currentStepNodeId)?.type ?? 'logger') ? 'Step Into →' : 'Next →'}
            </button>
            <button
              onClick={stepCancel}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors border border-line text-content-faint hover:text-content hover:bg-surface-2"
            >
              Stop
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => runPipeline(false)}
              disabled={isRunning || executionOrder.length === 0}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              <Icons.Play size={10} /> Run All
            </button>
            <button
              onClick={() => runPipeline(true)}
              disabled={isRunning || executionOrder.length === 0}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors border border-accent-border text-accent hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Step Through
            </button>
          </>
        )}
        <button
          onClick={() => { setInputDraft(flowInput); setShowInputEditor(true); }}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors border border-accent-border text-accent hover:bg-accent-dim"
          title="Set the flow's input message (payload + uriParams/queryParams/headers) used for test runs"
        >
          <span className="font-mono">{'{ }'}</span> Input
        </button>
        <div className="w-px h-4 bg-line" />
        <button
          onClick={saveFlow}
          disabled={nodes.length === 0}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Save flow workspace"
        >
          <Icons.Save size={11} /> Save
        </button>
        <button
          onClick={openFlowPicker}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Open flow workspace"
        >
          <Icons.Folder size={11} /> Open
        </button>
        <button
          onClick={clearFlow}
          disabled={nodes.length === 0}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icons.Trash size={11} /> Clear
        </button>
        <div className="w-px h-4 bg-line" />
        <button
          onClick={handleExportMuleXml}
          disabled={nodes.length === 0}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Export this flow as a deployable Mule 4 XML file"
        >
          <span className="font-mono">&lt;/&gt;</span> Export XML
        </button>
        <button
          onClick={handleImportMuleXml}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Import a Mule 4 flow XML and edit it in Studio"
        >
          <span className="font-mono">&lt;/&gt;</span> Import XML
        </button>
        <div className="w-px h-4 bg-line" />
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.15))}
            className="w-6 h-6 rounded flex items-center justify-center text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors text-[14px] font-mono"
            title="Zoom out"
          >−</button>
          <button
            onClick={() => setZoom(1)}
            className="h-6 px-1.5 rounded text-[10px] font-mono text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
            title="Reset zoom"
          >{Math.round(zoom * 100)}%</button>
          <button
            onClick={() => setZoom((z) => Math.min(2, z + 0.15))}
            className="w-6 h-6 rounded flex items-center justify-center text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors text-[14px] font-mono"
            title="Zoom in"
          >+</button>
        </div>
        {/* OS window controls — Flow Designer is fixed-fullscreen so the
            app's top-bar controls are covered. Without these the user can't
            minimize / maximize / close while in the flow view. */}
        <WindowControls />
      </header>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* ── Component Palette ───────────────────────────────────── */}
        <aside className="w-[180px] shrink-0 border-r border-line bg-surface-panel flex flex-col">
          <div className="px-3 py-2.5 border-b border-line-subtle">
            <div className="text-[10px] text-content-faint uppercase tracking-widest font-semibold">Components</div>
          </div>
          <div className="flex-1 overflow-y-auto py-1.5 px-2 space-y-1">
            {(Object.keys(NODE_META) as NodeType[]).map((type) => (
              <div
                key={type}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setPaletteDrag({ type, x: e.clientX, y: e.clientY });
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-surface-2 transition-colors select-none"
              >
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: `color-mix(in oklch, ${NODE_META[type].color} 15%, transparent)`, color: NODE_META[type].color }}
                >
                  <NodeIcon type={type} size={13} />
                </div>
                <div>
                  <div className="text-[11.5px] font-medium text-content leading-tight">{NODE_META[type].label}</div>
                  <div className="text-[9.5px] text-content-ghost leading-tight mt-0.5">{NODE_META[type].desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-line-subtle space-y-1">
            <div className="text-[9.5px] text-content-ghost leading-relaxed">
              Drag a component onto the canvas. Nodes execute left-to-right.
            </div>
            <div className="text-[9px] text-content-ghost leading-relaxed">
              Tip: Click a node, then edit its name in the config panel. Right-click for more options.
            </div>
          </div>
        </aside>

        {/* ── Canvas ──────────────────────────────────────────────── */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-auto relative"
          style={{
            background: 'var(--bg)',
            backgroundImage: 'radial-gradient(circle, color-mix(in oklch, var(--content) 6%, transparent) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
          onClick={(e) => {
            if (contextMenu) { setContextMenu(null); return; }
            if (e.target === canvasRef.current) setSelectedId(null);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Empty state */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-[13px] text-content-faint mb-1">Drag components from the palette to build your flow</div>
                <div className="text-[11px] text-content-ghost">Nodes execute in left-to-right order</div>
              </div>
            </div>
          )}

          {/* Zoomable content wrapper */}
          <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', minWidth: 3000 / zoom, minHeight: 2000 / zoom }}>
          {/* SVG connections layer */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: 3000, minHeight: 2000 }}>
            <defs>
              <marker id="flow-arrow" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 4 L 0 8 z" fill="color-mix(in oklch, var(--accent) 50%, transparent)" />
              </marker>
              <marker id="flow-arrow-active" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 4 L 0 8 z" fill="var(--accent)" />
              </marker>
            </defs>
            {connections.map(({ from, to }) => {
              const fromX = from.x + nodeWidth(from.type);
              const fromY = from.y + 45;
              const toX = to.x;
              const toY = to.y + 45;
              const dx = Math.abs(toX - fromX) * 0.5;
              const bothDone = from.status === 'success' && (to.status === 'success' || to.status === 'running');
              return (
                <path
                  key={`${from.id}-${to.id}`}
                  d={`M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`}
                  fill="none"
                  stroke={bothDone ? 'var(--accent)' : 'color-mix(in oklch, var(--content) 15%, transparent)'}
                  strokeWidth={bothDone ? 2 : 1.5}
                  strokeDasharray={bothDone ? 'none' : '6 4'}
                  markerEnd={bothDone ? 'url(#flow-arrow-active)' : 'url(#flow-arrow)'}
                  className="transition-all duration-300"
                />
              );
            })}
          </svg>

          {/* Nodes */}
          <div className="relative" style={{ minWidth: 3000, minHeight: 2000 }}>
            {nodes.map((node) => {
              const meta = NODE_META[node.type];
              const isSelected = node.id === selectedId;
              const isStepTarget = stepIndex !== null && executionOrder[stepIndex]?.id === node.id;
              return (
                <div
                  key={node.id}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onClick={(e) => { e.stopPropagation(); setContextMenu(null); setSelectedId(node.id); }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
                  }}
                  className={`absolute select-none transition-shadow duration-200 ${dragState?.nodeId === node.id ? 'z-20' : 'z-10'}`}
                  style={{
                    left: node.x,
                    top: node.y,
                    // Scopes grow to fit their now-horizontal body so the flow reads
                    // left-to-right (the canvas scrolls); leaves keep a fixed width.
                    width: isScopeType(node.type) ? 'max-content' : nodeWidth(node.type),
                    minWidth: isScopeType(node.type) ? SCOPE_NODE_W : undefined,
                    opacity: node.disabled ? 0.45 : 1,
                  }}
                >
                  {/* Input port */}
                  <div
                    className="absolute rounded-full border-2 transition-colors"
                    style={{
                      width: PORT_R * 2,
                      height: PORT_R * 2,
                      left: -PORT_R,
                      top: 45 - PORT_R,
                      borderColor: meta.color,
                      background: node.status === 'success' ? meta.color : 'var(--bg)',
                    }}
                  />
                  {/* Output port */}
                  <div
                    className="absolute rounded-full border-2 transition-colors"
                    style={{
                      width: PORT_R * 2,
                      height: PORT_R * 2,
                      right: -PORT_R,
                      top: 45 - PORT_R,
                      borderColor: meta.color,
                      background: node.status === 'success' ? meta.color : 'var(--bg)',
                    }}
                  />

                  {/* Card */}
                  <div
                    className={`rounded-xl overflow-hidden border transition-all duration-200 ${
                      isSelected
                        ? 'border-accent shadow-lg shadow-[var(--accent)]/10'
                        : isStepTarget
                          ? 'border-accent/60 shadow-md'
                          : 'border-line hover:border-line-secondary shadow-sm'
                    }`}
                    style={{ background: 'var(--surface)' }}
                  >
                    {/* Colored header — small status dot, icon, title, type badge */}
                    <div
                      className="flex items-center gap-1.5 px-3 py-2 cursor-grab active:cursor-grabbing"
                      style={{ background: `color-mix(in oklch, ${meta.color} 10%, var(--surface))` }}
                    >
                      <span
                        className="inline-block rounded-full shrink-0"
                        style={{
                          width: 7,
                          height: 7,
                          background: node.disabled ? 'var(--content-faint)' : meta.color,
                        }}
                      />
                      <div style={{ color: node.disabled ? 'var(--content-faint)' : meta.color }}><NodeIcon type={node.type} size={12} /></div>
                      <span className={`text-[11.5px] font-semibold truncate flex-1 ${node.disabled ? 'text-content-faint line-through' : 'text-content'}`}>{node.label}</span>
                      {node.disabled && (
                        <span className="text-[8px] uppercase tracking-wider font-bold text-content-ghost bg-surface-2 px-1.5 py-0.5 rounded">// out</span>
                      )}
                      {!node.disabled && (
                        <span
                          className="text-[9px] font-bold font-mono px-[5px] py-px rounded shrink-0"
                          style={{
                            background: `color-mix(in oklch, ${meta.color} 14%, transparent)`,
                            color: meta.color,
                            letterSpacing: '0.4px',
                          }}
                          title={meta.label}
                        >
                          {meta.badge}
                        </span>
                      )}
                      {node.status === 'running' && (
                        <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: meta.color, borderTopColor: 'transparent' }} />
                      )}
                      {node.status === 'success' && (
                        <svg className="shrink-0" width="12" height="12" viewBox="0 0 16 16" fill={meta.color}><path d="M13.485 3.929a1 1 0 01.036 1.414l-6 6.5a1 1 0 01-1.45.022l-3-3a1 1 0 111.414-1.414L6.95 9.915l5.293-5.95a1 1 0 011.242-.036z"/></svg>
                      )}
                      {node.status === 'error' && (
                        <svg className="shrink-0" width="12" height="12" viewBox="0 0 16 16" fill="var(--err)"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 3a.75.75 0 00-.75.75v4.5a.75.75 0 001.5 0v-4.5A.75.75 0 008 4zm0 8a1 1 0 100-2 1 1 0 000 2z"/></svg>
                      )}
                    </div>

                    {/* Body preview */}
                    <div className="px-3 py-2 min-h-[40px]">
                      {node.type === 'transform' && (
                        <div>
                          <pre className="text-[10px] text-content-muted font-mono leading-tight truncate whitespace-pre overflow-hidden" style={{ maxHeight: 36 }}>
                            {(node.config.script || '').split('\n').slice(0, 3).join('\n')}
                          </pre>
                          {node.config.saveToVariable && (
                            <div className="text-[9px] font-mono mt-1 truncate" style={{ color: '#10b981' }}>
                              → vars.{node.config.saveToVariable}
                            </div>
                          )}
                        </div>
                      )}
                      {node.type === 'set-payload' && (
                        <div className="text-[10px] text-content-muted font-mono truncate">
                          {node.config.payloadMime || 'application/json'} · {
                            node.config.payloadMime === 'multipart/form-data'
                              ? `${node.config.multipartParts?.length || 0} parts`
                              : node.config.payloadMime === 'application/octet-stream'
                              ? (node.config.payloadFilePath?.split(/[/\\]/).pop() || 'no file')
                              : `${(node.config.payload || '').split('\n').length} lines`
                          }
                        </div>
                      )}
                      {node.type === 'set-variable' && (
                        <div className="text-[10px] text-content-muted font-mono truncate">
                          <span style={{ color: '#10b981' }}>vars.</span>{node.config.variableName || 'myVar'}
                          {node.config.variableSource === 'script' ? ' ← DW script' : ' ← raw value'}
                        </div>
                      )}
                      {(node.type === 'salesforce' || node.type === 'database') && (
                        <div className="text-[10px] text-content-muted font-mono truncate">
                          <span className="capitalize">{node.config.operation || 'query'}</span>
                          {node.config.saveToVariable ? <> → <span style={{ color: '#10b981' }}>vars.{node.config.saveToVariable}</span></> : null}
                        </div>
                      )}
                      {node.type === 'http-request' && (
                        <div className="text-[10px] text-content-muted font-mono truncate">
                          <span className="font-semibold">{node.config.httpMethod || 'GET'}</span> {(() => { try { return new URL(node.config.httpUrl || '').pathname; } catch { return node.config.httpUrl || '/'; } })()}
                          {node.config.saveToVariable ? <> → <span style={{ color: '#10b981' }}>vars.{node.config.saveToVariable}</span></> : null}
                        </div>
                      )}
                      {node.type === 'logger' && (
                        <div className="text-[10px] text-content-muted">Inspect payload & vars</div>
                      )}
                      {/* Scope body — recursive renderer so a Choice can contain a
                          Choice, a Try can contain a For Each, etc. Top-level
                          scopes call with depth=0; each nested scope card
                          increments depth and the inner body recurses. */}
                      {isScopeType(node.type) && node.branches && renderScopeBody(node, 0)}
                    </div>

                    {/* Status bar */}
                    {node.status !== 'idle' && (
                      <div
                        className="px-3 py-1.5 border-t text-[10px] font-mono truncate"
                        style={{
                          borderColor: 'var(--line)',
                          color: node.status === 'error' ? 'var(--err)' : meta.color,
                          background: node.status === 'error'
                            ? 'color-mix(in oklch, var(--err) 6%, transparent)'
                            : `color-mix(in oklch, ${meta.color} 4%, transparent)`,
                        }}
                      >
                        {node.status === 'running' && 'Running...'}
                        {node.status === 'success' && `${node.executionTimeMs ?? 0}ms`}
                        {node.status === 'error' && (node.error || 'Error').split('\n')[0].slice(0, 60)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>{/* end zoom wrapper */}
        </div>

        {/* ── Config Panel ────────────────────────────────────────── */}
        {selected && (
          <aside className="w-[380px] shrink-0 border-l border-line bg-surface-panel flex flex-col">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-line flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                style={{ background: `color-mix(in oklch, ${NODE_META[selected.type].color} 15%, transparent)`, color: NODE_META[selected.type].color }}
              >
                <NodeIcon type={selected.type} size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <input
                  data-no-drag
                  value={selected.label}
                  onChange={(e) => updateNode(selected.id, { label: e.target.value })}
                  className="text-[13px] font-semibold text-content bg-transparent w-full focus:outline-none"
                />
                <div className="text-[10px] text-content-ghost">{NODE_META[selected.type].desc}</div>
              </div>
              <button
                onClick={() => { setNodes((prev) => removeNodeDeep(prev, selected.id)); setSelectedId(null); }}
                className="text-content-faint hover:text-[var(--err)] cursor-pointer p-1 transition-colors"
                title="Delete node"
              >
                <Icons.Trash size={13} />
              </button>
            </div>

            {/* Tabs for connector nodes */}
            {showTabs && (
              <div className="flex border-b border-line px-2 gap-1">
                {(['general', 'request', 'response'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setConfigTab(tab)}
                    className={`px-3 py-2 text-[11px] font-medium cursor-pointer transition-colors border-b-2 capitalize ${
                      configTab === tab
                        ? 'border-accent text-accent'
                        : 'border-transparent text-content-faint hover:text-content'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {/* ── Set Payload config ──────────────────────────────── */}
              {selected.type === 'set-payload' && (
                <div className="p-4 space-y-3">
                  <ConfigLabel label="MIME Type" />
                  <select
                    data-no-drag
                    value={selected.config.payloadMime || 'application/json'}
                    onChange={(e) => updateConfig(selected.id, { payloadMime: e.target.value })}
                    className="w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] text-content focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {MIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
                  </select>

                  {/* Multipart form-data parts builder */}
                  {(selected.config.payloadMime === 'multipart/form-data') && (() => {
                    const parts: MultipartPart[] = selected.config.multipartParts || [];
                    const setParts = (newParts: MultipartPart[]) => updateConfig(selected.id, { multipartParts: newParts });
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-content-faint uppercase tracking-wide">Parts</span>
                          <button
                            onClick={() => setParts([...parts, { name: `part${parts.length + 1}`, value: '', contentType: 'text/plain', isFile: false }])}
                            className="text-[10px] text-accent hover:text-accent-hover cursor-pointer"
                          >+ Add Part</button>
                        </div>
                        {parts.length === 0 && (
                          <div className="text-[10px] text-content-ghost italic py-2">No parts yet — add text or file parts</div>
                        )}
                        {parts.map((part, i) => (
                          <div key={i} className="bg-surface-section border border-line-secondary rounded-lg p-2 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text" value={part.name}
                                onChange={(e) => { const u = [...parts]; u[i] = { ...part, name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') }; setParts(u); }}
                                placeholder="name"
                                className="flex-1 bg-surface-input border border-line rounded px-2 py-1 text-[11px] font-mono text-content focus:border-accent focus:outline-none"
                              />
                              <button
                                onClick={() => { const u = [...parts]; u[i] = { ...part, isFile: !part.isFile, filePath: undefined, value: '', contentType: !part.isFile ? 'application/octet-stream' : 'text/plain' }; setParts(u); }}
                                className={`px-2 py-1 text-[10px] rounded border cursor-pointer transition-colors ${part.isFile ? 'bg-violet-tint text-violet border-violet-border' : 'bg-accent-dim text-accent border-accent-border'}`}
                              >{part.isFile ? 'File' : 'Text'}</button>
                              <input
                                type="text" value={part.contentType}
                                onChange={(e) => { const u = [...parts]; u[i] = { ...part, contentType: e.target.value }; setParts(u); }}
                                placeholder="text/plain"
                                className="w-28 bg-surface-input border border-line rounded px-2 py-1 text-[10px] text-content-muted focus:border-accent focus:outline-none"
                              />
                              <button onClick={() => setParts(parts.filter((_, j) => j !== i))} className="text-content-ghost hover:text-err cursor-pointer text-xs px-1">✕</button>
                            </div>
                            {part.isFile ? (
                              <div className="flex items-center gap-2">
                                {part.filePath ? (
                                  <>
                                    <span className="flex-1 text-[10px] font-mono text-accent truncate">{part.filePath.split(/[/\\]/).pop()}</span>
                                    <button
                                      onClick={async () => {
                                        const picked = await openFile({ multiple: false, directory: false });
                                        if (picked) { const fp = typeof picked === 'string' ? picked : picked[0]; const fname = fp.split(/[/\\]/).pop() || fp; const u = [...parts]; u[i] = { ...part, filePath: fp, filename: fname, contentType: contentTypeFromFilename(fname) }; setParts(u); }
                                      }}
                                      className="text-[10px] text-accent border border-accent-border rounded px-2 py-0.5 cursor-pointer hover:bg-accent-dim"
                                    >Change</button>
                                    <button onClick={() => { const u = [...parts]; u[i] = { ...part, filePath: undefined, filename: undefined }; setParts(u); }} className="text-[10px] text-content-ghost hover:text-err cursor-pointer">Clear</button>
                                  </>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      const picked = await openFile({ multiple: false, directory: false });
                                      if (picked) { const fp = typeof picked === 'string' ? picked : picked[0]; const fname = fp.split(/[/\\]/).pop() || fp; const u = [...parts]; u[i] = { ...part, filePath: fp, filename: fname, contentType: contentTypeFromFilename(fname) }; setParts(u); }
                                    }}
                                    className="text-[10px] text-accent border border-accent-border rounded px-2 py-1 cursor-pointer hover:bg-accent-dim"
                                  >Pick File...</button>
                                )}
                              </div>
                            ) : (
                              <input
                                type="text" value={part.value}
                                onChange={(e) => { const u = [...parts]; u[i] = { ...part, value: e.target.value }; setParts(u); }}
                                placeholder="value"
                                className="w-full bg-surface-input border border-line rounded px-2 py-1 text-[11px] font-mono text-content focus:border-accent focus:outline-none"
                              />
                            )}
                          </div>
                        ))}
                        {parts.length > 0 && (
                          <div className="text-[9px] text-content-ghost">
                            Access via <code className="text-content-faint">payload.parts.name.content</code>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Binary file picker */}
                  {(selected.config.payloadMime === 'application/octet-stream') && (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <div className="text-content-faint text-[11px]">Binary payload — select a file</div>
                      {selected.config.payloadFilePath ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-accent">{selected.config.payloadFilePath.split(/[/\\]/).pop()}</span>
                          <button
                            onClick={async () => {
                              const picked = await openFile({ multiple: false, directory: false });
                              if (picked) { const fp = typeof picked === 'string' ? picked : picked[0]; updateConfig(selected.id, { payloadFilePath: fp }); }
                            }}
                            className="text-[10px] text-accent border border-accent-border rounded px-2 py-0.5 cursor-pointer hover:bg-accent-dim"
                          >Change</button>
                          <button onClick={() => updateConfig(selected.id, { payloadFilePath: undefined })} className="text-[10px] text-content-ghost hover:text-err cursor-pointer">Clear</button>
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            const picked = await openFile({ multiple: false, directory: false });
                            if (picked) { const fp = typeof picked === 'string' ? picked : picked[0]; updateConfig(selected.id, { payloadFilePath: fp }); }
                          }}
                          className="text-[11px] text-accent border border-accent-border rounded px-3 py-1.5 cursor-pointer hover:bg-accent-dim"
                        >Pick File...</button>
                      )}
                    </div>
                  )}

                  {/* Text editor for normal MIME types */}
                  {selected.config.payloadMime !== 'multipart/form-data' && selected.config.payloadMime !== 'application/octet-stream' && (
                    <>
                      <ConfigLabel label="Payload Body" />
                      <MiniEditor
                        value={selected.config.payload || ''}
                        onChange={(v) => updateConfig(selected.id, { payload: v })}
                        language={mimeToEditorLang(selected.config.payloadMime || 'application/json')}
                        height={180}
                      />
                    </>
                  )}

                  <ConfigLabel label="Query Parameters (attributes.queryParams)" />
                  <MiniEditor
                    value={selected.config.queryParams || '{}'}
                    onChange={(v) => updateConfig(selected.id, { queryParams: v })}
                    language="json"
                    height={80}
                  />
                  <div className="text-[10px] text-content-ghost">
                    Access in DW via <code className="px-1 py-0.5 rounded bg-surface-2">attributes.queryParams.paramName</code>
                  </div>
                </div>
              )}

              {/* ── Transform config ───────────────────────────────── */}
              {selected.type === 'transform' && (
                <div className="p-4 space-y-3">
                  <ConfigLabel label="Output MIME" />
                  <select
                    data-no-drag
                    value={selected.config.outputMime || 'application/json'}
                    onChange={(e) => updateConfig(selected.id, { outputMime: e.target.value })}
                    className="w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] text-content focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {MIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
                  </select>
                  <ConfigLabel label="DataWeave Script" />
                  <MiniEditor
                    value={selected.config.script || ''}
                    onChange={(v) => updateConfig(selected.id, { script: v })}
                    language="dataweave"
                    height={280}
                  />
                  {Object.keys(pipelineVars).length > 0 && (
                    <div className="text-[10px] text-content-ghost">
                      Available vars: {Object.keys(pipelineVars).map(k => <code key={k} className="mx-0.5 px-1 py-0.5 rounded bg-surface-2 text-[#10b981]">vars.{k}</code>)}
                    </div>
                  )}

                  {/* Set Variable — like Anypoint's Transform Message */}
                  <div className="pt-2 border-t border-line-subtle">
                    <ConfigLabel label="Set Variable (optional)" />
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[11px] text-content-faint shrink-0">Save output to</span>
                      <div className="flex items-center gap-1 flex-1">
                        <span className="text-[11px] font-mono text-[#10b981]">vars.</span>
                        <input
                          data-no-drag
                          value={selected.config.saveToVariable || ''}
                          onChange={(e) => updateConfig(selected.id, { saveToVariable: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                          placeholder="variableName"
                          className="flex-1 h-7 px-2 rounded bg-surface-2 border border-line text-[11px] text-content font-mono focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                    {selected.config.saveToVariable ? (
                      <div className="mt-1.5 text-[10px] text-content-ghost">
                        Output stored in <code className="px-1 py-0.5 rounded bg-surface-2 text-[#10b981]">vars.{selected.config.saveToVariable}</code> — payload stays unchanged
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[10px] text-content-ghost">
                        Leave empty to replace payload with the transform output (default behavior)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Set Variable config ────────────────────────────── */}
              {selected.type === 'set-variable' && (
                <div className="p-4 space-y-3">
                  <div
                    className="flex items-start gap-2 px-3 py-2 rounded-lg text-[11px] leading-relaxed"
                    style={{ background: 'color-mix(in oklch, #10b981 8%, transparent)', border: '1px solid color-mix(in oklch, #10b981 20%, transparent)', color: '#10b981' }}
                  >
                    Stores a value as a named variable. Subsequent Transform nodes can access it via <code className="font-mono">vars.{selected.config.variableName || 'myVar'}</code>.
                  </div>
                  <ConfigLabel label="Variable Name" />
                  <input
                    data-no-drag
                    value={selected.config.variableName || ''}
                    onChange={(e) => updateConfig(selected.id, { variableName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                    placeholder="myVar"
                    className="w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] text-content font-mono focus:outline-none focus:border-accent"
                  />
                  <ConfigLabel label="Value Source" />
                  <div className="flex gap-2">
                    <button
                      data-no-drag
                      onClick={() => updateConfig(selected.id, { variableSource: 'raw' })}
                      className={`flex-1 h-8 rounded-md text-[11px] font-medium cursor-pointer transition-colors border ${
                        (selected.config.variableSource || 'raw') === 'raw'
                          ? 'border-accent bg-accent-dim text-accent'
                          : 'border-line text-content-faint hover:text-content'
                      }`}
                    >
                      Raw value
                    </button>
                    <button
                      data-no-drag
                      onClick={() => updateConfig(selected.id, { variableSource: 'script' })}
                      className={`flex-1 h-8 rounded-md text-[11px] font-medium cursor-pointer transition-colors border ${
                        selected.config.variableSource === 'script'
                          ? 'border-accent bg-accent-dim text-accent'
                          : 'border-line text-content-faint hover:text-content'
                      }`}
                    >
                      DW Script
                    </button>
                  </div>

                  {(selected.config.variableSource || 'raw') === 'raw' ? (
                    <>
                      <ConfigLabel label="Value" />
                      <MiniEditor
                        value={selected.config.variableValue || ''}
                        onChange={(v) => updateConfig(selected.id, { variableValue: v })}
                        language="json"
                        height={160}
                      />
                    </>
                  ) : (
                    <>
                      <ConfigLabel label="DataWeave Script" />
                      <MiniEditor
                        value={selected.config.script || '%dw 2.0\noutput application/json\n---\npayload'}
                        onChange={(v) => updateConfig(selected.id, { script: v })}
                        language="dataweave"
                        height={200}
                      />
                    </>
                  )}
                </div>
              )}

              {/* ── Salesforce / Database connector config ──────────── */}
              {(selected.type === 'salesforce' || selected.type === 'database') && (
                <>
                  {/* General tab */}
                  {configTab === 'general' && (
                    <div className="p-4 space-y-3">
                      <div
                        className="flex items-start gap-2 px-3 py-2 rounded-lg text-[11px] leading-relaxed"
                        style={{
                          background: `color-mix(in oklch, ${NODE_META[selected.type].color} 8%, transparent)`,
                          border: `1px solid color-mix(in oklch, ${NODE_META[selected.type].color} 20%, transparent)`,
                          color: NODE_META[selected.type].color,
                        }}
                      >
                        {selected.type === 'salesforce'
                          ? 'Configure the Salesforce operation. The request tab shows the SOQL/DML being "sent". The response tab shows mock data returned.'
                          : 'Configure the Database operation. The request tab shows the SQL query/statement. The response tab shows mock data returned.'}
                      </div>

                      <ConfigLabel label="Operation" />
                      <select
                        data-no-drag
                        value={selected.config.operation || (selected.type === 'salesforce' ? 'query' : 'select')}
                        onChange={(e) => updateConfig(selected.id, { operation: e.target.value as ConnectorOp })}
                        className="w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] text-content focus:outline-none focus:border-accent cursor-pointer"
                      >
                        {selected.type === 'salesforce' ? (
                          <>
                            <option value="query">Query (SOQL)</option>
                            <option value="insert">Insert</option>
                            <option value="update">Update</option>
                            <option value="upsert">Upsert</option>
                            <option value="delete">Delete</option>
                          </>
                        ) : (
                          <>
                            <option value="select">Select</option>
                            <option value="insert">Insert</option>
                            <option value="update">Update</option>
                            <option value="delete">Delete</option>
                          </>
                        )}
                      </select>

                      <ConfigLabel label="Save Output To Variable (optional)" />
                      <input
                        data-no-drag
                        value={selected.config.saveToVariable || ''}
                        onChange={(e) => updateConfig(selected.id, { saveToVariable: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                        placeholder="Leave empty to set as payload"
                        className="w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] text-content font-mono focus:outline-none focus:border-accent"
                      />
                      {selected.config.saveToVariable && (
                        <div className="text-[10px] text-content-ghost">
                          Output will be stored in <code className="mx-0.5 px-1 py-0.5 rounded bg-surface-2 text-[#10b981]">vars.{selected.config.saveToVariable}</code> instead of replacing payload
                        </div>
                      )}

                      {/* Field validation warning */}
                      {validation && (
                        <div className="px-3 py-2 rounded-lg text-[11px] leading-relaxed border" style={{ background: 'color-mix(in oklch, #f59e0b 6%, transparent)', borderColor: 'color-mix(in oklch, #f59e0b 25%, transparent)', color: '#f59e0b' }}>
                          <div className="font-semibold mb-1">Field mismatch detected</div>
                          {validation.missing.length > 0 && (
                            <div>Request fields not in response: <span className="font-mono">{validation.missing.join(', ')}</span></div>
                          )}
                          {validation.extra.length > 0 && (
                            <div>Response fields not in request: <span className="font-mono">{validation.extra.join(', ')}</span></div>
                          )}
                          <button
                            data-no-drag
                            onClick={() => setDismissedValidations(prev => new Set([...prev, selected.id]))}
                            className="mt-1.5 text-[10px] underline cursor-pointer opacity-80 hover:opacity-100"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Request tab */}
                  {configTab === 'request' && (
                    <div className="p-4 space-y-3">
                      <ConfigLabel label={selected.type === 'salesforce' ? 'SOQL / DML Statement' : 'SQL Query / Statement'} />
                      <MiniEditor
                        value={selected.config.request || ''}
                        onChange={(v) => updateConfig(selected.id, { request: v })}
                        language="sql"
                        height={240}
                      />
                      <div className="text-[10px] text-content-ghost leading-relaxed">
                        This is the {selected.type === 'salesforce' ? 'SOQL/DML' : 'SQL'} that would be sent in a real Mule app. It's shown for documentation — actual data comes from the Response tab.
                      </div>
                    </div>
                  )}

                  {/* Response tab */}
                  {configTab === 'response' && (
                    <div className="p-4 space-y-3">
                      <ConfigLabel label="Response MIME" />
                      <select
                        data-no-drag
                        value={selected.config.mockMime || 'application/json'}
                        onChange={(e) => updateConfig(selected.id, { mockMime: e.target.value })}
                        className="w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] text-content focus:outline-none focus:border-accent cursor-pointer"
                      >
                        {MIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
                      </select>
                      <ConfigLabel label="Mock Response Data" />
                      <MiniEditor
                        value={selected.config.mockResponse || ''}
                        onChange={(v) => updateConfig(selected.id, { mockResponse: v })}
                        language="json"
                        height={280}
                      />
                      <div className="text-[10px] text-content-ghost leading-relaxed">
                        Paste the response you'd get from {selected.type === 'salesforce' ? 'Salesforce (Inspector, Workbench)' : 'your database (MySQL Workbench, DBeaver)'}.
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── HTTP Request connector config ──────────────────── */}
              {selected.type === 'http-request' && (
                <>
                  {configTab === 'general' && (
                    <div className="p-4 space-y-3">
                      <div
                        className="flex items-start gap-2 px-3 py-2 rounded-lg text-[11px] leading-relaxed"
                        style={{ background: 'color-mix(in oklch, #f97316 8%, transparent)', border: '1px solid color-mix(in oklch, #f97316 20%, transparent)', color: '#f97316' }}
                      >
                        Configure the HTTP request. The request tab defines the endpoint details. The response tab provides mock data returned.
                      </div>

                      <div className="flex gap-2">
                        <div className="w-[100px]">
                          <ConfigLabel label="Method" />
                          <select
                            data-no-drag
                            value={selected.config.httpMethod || 'GET'}
                            onChange={(e) => updateConfig(selected.id, { httpMethod: e.target.value as HttpMethod })}
                            className="w-full h-8 px-2 rounded-md bg-surface-2 border border-line text-[12px] text-content focus:outline-none focus:border-accent cursor-pointer font-mono font-semibold mt-1.5"
                          >
                            <option>GET</option>
                            <option>POST</option>
                            <option>PUT</option>
                            <option>PATCH</option>
                            <option>DELETE</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <ConfigLabel label="URL" />
                          <input
                            data-no-drag
                            value={selected.config.httpUrl || ''}
                            onChange={(e) => updateConfig(selected.id, { httpUrl: e.target.value })}
                            placeholder="https://api.example.com/endpoint"
                            className="w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] text-content font-mono focus:outline-none focus:border-accent mt-1.5"
                          />
                        </div>
                      </div>

                      <ConfigLabel label="Save Output To Variable (optional)" />
                      <input
                        data-no-drag
                        value={selected.config.saveToVariable || ''}
                        onChange={(e) => updateConfig(selected.id, { saveToVariable: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                        placeholder="Leave empty to set as payload"
                        className="w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] text-content font-mono focus:outline-none focus:border-accent"
                      />
                      {selected.config.saveToVariable && (
                        <div className="text-[10px] text-content-ghost">
                          Output will be stored in <code className="mx-0.5 px-1 py-0.5 rounded bg-surface-2 text-[#10b981]">vars.{selected.config.saveToVariable}</code> instead of replacing payload
                        </div>
                      )}
                    </div>
                  )}

                  {configTab === 'request' && (
                    <div className="p-4 space-y-3">
                      <ConfigLabel label="Headers (JSON object)" />
                      <MiniEditor
                        value={selected.config.httpHeaders || '{}'}
                        onChange={(v) => updateConfig(selected.id, { httpHeaders: v })}
                        language="json"
                        height={120}
                      />
                      <ConfigLabel label="Query Parameters (JSON object)" />
                      <MiniEditor
                        value={selected.config.httpQueryParams || '{}'}
                        onChange={(v) => updateConfig(selected.id, { httpQueryParams: v })}
                        language="json"
                        height={80}
                      />
                      {(selected.config.httpMethod !== 'GET' && selected.config.httpMethod !== 'DELETE') && (
                        <>
                          <ConfigLabel label="Request Body" />
                          <MiniEditor
                            value={selected.config.httpBody || ''}
                            onChange={(v) => updateConfig(selected.id, { httpBody: v })}
                            language="json"
                            height={160}
                          />
                        </>
                      )}
                      <div className="text-[10px] text-content-ghost leading-relaxed">
                        These define the HTTP request that would be sent in a real Mule app. Actual data comes from the Response tab.
                      </div>
                    </div>
                  )}

                  {configTab === 'response' && (
                    <div className="p-4 space-y-3">
                      <ConfigLabel label="Response MIME" />
                      <select
                        data-no-drag
                        value={selected.config.mockMime || 'application/json'}
                        onChange={(e) => updateConfig(selected.id, { mockMime: e.target.value })}
                        className="w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] text-content focus:outline-none focus:border-accent cursor-pointer"
                      >
                        {MIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
                      </select>
                      <ConfigLabel label="Mock Response Data" />
                      <MiniEditor
                        value={selected.config.mockResponse || ''}
                        onChange={(v) => updateConfig(selected.id, { mockResponse: v })}
                        language="json"
                        height={280}
                      />
                    </div>
                  )}
                </>
              )}

              {/* ── Logger config ──────────────────────────────────── */}
              {selected.type === 'logger' && (
                <div className="p-4">
                  <div className="text-[12px] text-content-muted leading-relaxed">
                    Logger passes the payload through unchanged. Shows both the current payload and all pipeline variables.
                  </div>
                </div>
              )}

              {/* ── Choice config ───────────────────────────────────── */}
              {selected.type === 'choice' && (
                <div className="p-4 space-y-3">
                  <div className="text-[12px] text-content-muted leading-relaxed">
                    Choice routes the flow into the first <span className="font-mono text-content-secondary">when</span> branch whose predicate evaluates to <span className="font-mono text-content-secondary">true</span>. If none match, the <span className="font-mono text-content-secondary">otherwise</span> branch runs (or the scope completes with no effect).
                  </div>
                  <div className="text-[11px] text-content-faint">
                    Predicates run as standalone DataWeave scripts with the same context as a Transform node — they see <span className="font-mono">payload</span>, <span className="font-mono">vars</span>, and <span className="font-mono">attributes</span>.
                  </div>
                  <div>
                    <ConfigLabel label="Predicate examples" />
                    <pre className="mt-1 px-2 py-1.5 text-[10.5px] font-mono bg-surface-2 rounded border border-line-subtle text-content-secondary leading-relaxed whitespace-pre">
{`payload.age >= 18
payload.country == "US"
sizeOf(payload.items) > 0
vars.role == "admin"
attributes.method == "POST"`}
                    </pre>
                  </div>
                  <div className="text-[11px] text-content-ghost leading-relaxed">
                    Edit predicates and add nodes directly on the canvas — each branch in the node has its own predicate input and <span className="font-mono">+ add</span> button.
                  </div>
                </div>
              )}

              {/* ── For Each / Parallel For Each config ─────────────── */}
              {(selected.type === 'for-each' || selected.type === 'parallel-for-each') && (
                <div className="p-4 space-y-3">
                  <div className="text-[12px] text-content-muted leading-relaxed">
                    {selected.type === 'parallel-for-each' ? (
                      <>Iterates over a collection <span className="font-semibold">concurrently</span>. All iterations run via <span className="font-mono">Promise.all</span> — order of side effects is non-deterministic. The aggregated output preserves the original collection's order.</>
                    ) : (
                      <>Iterates over a collection sequentially. The body branch runs once per element with <span className="font-mono">payload</span> set to that element. Outputs are aggregated into a JSON array.</>
                    )}
                  </div>
                  <div>
                    <ConfigLabel label="Collection expression" />
                    <input
                      value={selected.config.forEachCollection || ''}
                      onChange={(e) => updateConfig(selected.id, { forEachCollection: e.target.value })}
                      placeholder="payload.items"
                      className="mt-1 w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] font-mono text-content focus:outline-none focus:border-accent"
                      spellCheck={false}
                    />
                    <div className="text-[10px] text-content-ghost mt-1">Any DataWeave expression that returns an Array.</div>
                  </div>
                  <div>
                    <ConfigLabel label="Counter variable name" />
                    <input
                      value={selected.config.forEachCounter || ''}
                      onChange={(e) => updateConfig(selected.id, { forEachCounter: e.target.value })}
                      placeholder="counter"
                      className="mt-1 w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] font-mono text-content focus:outline-none focus:border-accent"
                      spellCheck={false}
                    />
                    <div className="text-[10px] text-content-ghost mt-1">Exposed as <span className="font-mono">vars.{selected.config.forEachCounter || 'counter'}</span> inside the body — a 0-based String index.</div>
                  </div>
                  {selected.type === 'parallel-for-each' && (
                    <div>
                      <ConfigLabel label="Max concurrency (informational)" />
                      <input
                        type="number"
                        min={1}
                        value={selected.config.maxConcurrency ?? 4}
                        onChange={(e) => updateConfig(selected.id, { maxConcurrency: parseInt(e.target.value) || 1 })}
                        className="mt-1 w-full h-8 px-2.5 rounded-md bg-surface-2 border border-line text-[12px] font-mono text-content focus:outline-none focus:border-accent"
                      />
                      <div className="text-[10px] text-content-ghost mt-1">Real Mule honors this; Studio always runs all iterations concurrently.</div>
                    </div>
                  )}
                  <div>
                    <ConfigLabel label="Example collection expressions" />
                    <pre className="mt-1 px-2 py-1.5 text-[10.5px] font-mono bg-surface-2 rounded border border-line-subtle text-content-secondary leading-relaxed whitespace-pre">
{`payload
payload.items
payload..orderItems
1 to 10
vars.users`}
                    </pre>
                  </div>
                </div>
              )}

              {/* ── Scatter-Gather config ───────────────────────────── */}
              {selected.type === 'scatter-gather' && (
                <div className="p-4 space-y-3">
                  <div className="text-[12px] text-content-muted leading-relaxed">
                    Forks the current payload into every route concurrently and aggregates the results. All routes see the same starting <span className="font-mono">payload</span>, <span className="font-mono">vars</span>, and <span className="font-mono">attributes</span> — they do <em>not</em> share state with each other.
                  </div>
                  <div>
                    <ConfigLabel label="Aggregator strategy" />
                    <div className="mt-1 flex gap-1.5">
                      {(['object', 'array'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => updateConfig(selected.id, { aggregatorStrategy: s })}
                          className={`flex-1 h-8 rounded-md text-[11px] font-mono cursor-pointer transition-colors ${
                            (selected.config.aggregatorStrategy || 'object') === s
                              ? 'border border-accent text-accent bg-accent-dim'
                              : 'border border-line text-content-faint hover:bg-surface-2'
                          }`}
                        >
                          {s === 'object' ? '{ route1: ..., route2: ... }' : '[r1, r2]'}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-content-ghost mt-1">
                      {(selected.config.aggregatorStrategy || 'object') === 'object'
                        ? 'Merged as an object keyed by route name (recommended — preserves which route produced what).'
                        : 'Bundled as an array in route order (drop the names).'}
                    </div>
                  </div>
                  <div className="text-[11px] text-content-ghost leading-relaxed">
                    Real Mule Scatter-Gather returns rich metadata per route (attributes, exception, timestamps). Studio's aggregator is simplified: just the payload from each route.
                  </div>
                </div>
              )}

              {/* ── Try config ──────────────────────────────────────── */}
              {selected.type === 'try' && (
                <div className="p-4 space-y-3">
                  <div className="text-[12px] text-content-muted leading-relaxed">
                    Wraps the <span className="font-mono">main</span> branch in error handling. If any node inside <span className="font-mono">main</span> fails, execution jumps to the <span className="font-mono">on-error</span> branch with the error message exposed as <span className="font-mono">vars.error</span>.
                  </div>
                  <div className="text-[11px] text-content-faint">
                    The on-error branch sees the same payload/vars that existed at the moment of failure, plus <span className="font-mono">vars.error</span>.
                  </div>
                  <div>
                    <ConfigLabel label="Reading the error in on-error" />
                    <pre className="mt-1 px-2 py-1.5 text-[10.5px] font-mono bg-surface-2 rounded border border-line-subtle text-content-secondary leading-relaxed whitespace-pre">
{`%dw 2.0
output application/json
---
{
  status: "failed",
  message: vars.error
}`}
                    </pre>
                  </div>
                  <div className="text-[11px] text-content-ghost leading-relaxed">
                    Studio simplifies Mule's error model — only the error message string is exposed. Real Mule injects a full error object (errorType, cause, etc.) into <span className="font-mono">error</span>.
                  </div>
                </div>
              )}

              {/* ── First Successful config ─────────────────────────── */}
              {selected.type === 'first-successful' && (
                <div className="p-4 space-y-3">
                  <div className="text-[12px] text-content-muted leading-relaxed">
                    Tries each route in order until one completes without error. The first route that succeeds wins — remaining routes are skipped. If all routes fail, the scope errors with the last route's failure message.
                  </div>
                  <div className="text-[11px] text-content-faint">
                    Useful for primary/fallback patterns: try the live API; if that fails, fall back to a cache; if that fails, return a hard-coded default.
                  </div>
                  <div className="text-[11px] text-content-ghost leading-relaxed">
                    Each route gets a fresh snapshot of payload/vars. Side effects in failed routes do not leak into the next attempt.
                  </div>
                </div>
              )}

              {/* ── Round Robin config ──────────────────────────────── */}
              {selected.type === 'round-robin' && (
                <div className="p-4 space-y-3">
                  <div className="text-[12px] text-content-muted leading-relaxed">
                    In real Mule, Round Robin rotates which route receives each invocation — useful for load-balancing across endpoints. Studio runs one-shot, so this scope always picks <span className="font-mono">route1</span>.
                  </div>
                  <div
                    className="rounded-md p-2.5 text-[11px] leading-relaxed border"
                    style={{
                      background: 'color-mix(in oklch, var(--warn) 6%, transparent)',
                      borderColor: 'color-mix(in oklch, var(--warn) 30%, transparent)',
                      color: 'var(--warn)',
                    }}
                  >
                    Studio-only caveat: rotation is not simulated. To verify each route's behavior, edit the route order so the one you want to test is at index 0, or use First Successful with deliberately-failing earlier routes.
                  </div>
                </div>
              )}

              {/* ── Async config ────────────────────────────────────── */}
              {selected.type === 'async' && (
                <div className="p-4 space-y-3">
                  <div className="text-[12px] text-content-muted leading-relaxed">
                    Spawns the body as a fire-and-forget sub-flow. The parent flow continues immediately — the async scope reports success as soon as the body starts, regardless of whether the inner nodes have finished or not.
                  </div>
                  <div className="text-[11px] text-content-faint">
                    Inner-node status updates appear asynchronously as the background work progresses. The aggregated payload of the body does <em>not</em> flow back to the parent.
                  </div>
                  <div
                    className="rounded-md p-2.5 text-[11px] leading-relaxed border"
                    style={{
                      background: 'color-mix(in oklch, var(--warn) 6%, transparent)',
                      borderColor: 'color-mix(in oklch, var(--warn) 30%, transparent)',
                      color: 'var(--warn)',
                    }}
                  >
                    Step-through cannot pause inside an Async scope — the parent flow can't wait on it. The Step Over button still works at the scope boundary.
                  </div>
                </div>
              )}

              {/* ── Output preview ─────────────────────────────────── */}
              {selected.output && (
                <div className="border-t border-line">
                  <div className="px-4 py-2 flex items-center justify-between">
                    <ConfigLabel label="Output" />
                    <button
                      onClick={async () => { try { await navigator.clipboard.writeText(selected.output || ''); } catch {} }}
                      className="text-[10px] text-content-faint hover:text-content cursor-pointer flex items-center gap-1"
                    >
                      <Icons.Copy size={10} /> Copy
                    </button>
                  </div>
                  <pre
                    className="px-4 pb-4 text-[11.5px] font-mono text-content-secondary leading-relaxed whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto select-text"
                  >
                    {selected.output}
                  </pre>
                </div>
              )}

              {/* ── Error display ──────────────────────────────────── */}
              {selected.error && (
                <div className="border-t border-line p-4">
                  <ConfigLabel label="Error" />
                  <pre className="mt-2 text-[11px] font-mono text-[var(--err)] leading-relaxed whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto select-text">
                    {selected.error}
                  </pre>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ── Palette drag ghost ────────────────────────────────────── */}
      {paletteDrag && (
        <div
          className="fixed pointer-events-none z-[90] rounded-xl border border-accent shadow-lg px-3 py-2 flex items-center gap-2"
          style={{
            left: paletteDrag.x - 60,
            top: paletteDrag.y - 20,
            background: 'var(--surface)',
            opacity: 0.9,
          }}
        >
          <NodeIcon type={paletteDrag.type} size={13} />
          <span className="text-[11px] font-medium text-content">{NODE_META[paletteDrag.type].label}</span>
        </div>
      )}

      {/* ── Right-click context menu ──────────────────────────────── */}
      {contextMenu && (() => {
        const ctxNode = findNodeById(nodes, contextMenu.nodeId);
        if (!ctxNode) return null;
        const isInner = !nodes.some((n) => n.id === ctxNode.id);
        return (
          <div
            className="fixed z-[100] py-1 rounded-lg border border-line shadow-xl min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y, background: 'var(--surface)' }}
          >
            <CtxItem
              label={ctxNode.disabled ? 'Uncomment' : 'Comment Out'}
              hint={ctxNode.disabled ? 'Re-enable this node' : 'Skip during execution'}
              onClick={() => { toggleDisabled(contextMenu.nodeId); setContextMenu(null); }}
            />
            {!isInner && (
              <CtxItem
                label="Duplicate"
                onClick={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); }}
              />
            )}
            <div className="mx-2 my-1 h-px bg-line-subtle" />
            <CtxItem
              label="Delete"
              danger
              onClick={() => {
                setNodes((prev) => removeNodeDeep(prev, contextMenu.nodeId));
                if (selectedId === contextMenu.nodeId) setSelectedId(null);
                setContextMenu(null);
              }}
            />
          </div>
        );
      })()}

      {/* ── Branch palette popup ──────────────────────────────────── */}
      {branchPalette && (
        <div
          className="fixed inset-0 z-[110]"
          onClick={() => setBranchPalette(null)}
          onContextMenu={(e) => { e.preventDefault(); setBranchPalette(null); }}
        >
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] rounded-xl border border-line shadow-2xl overflow-hidden"
            style={{ background: 'var(--surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 border-b border-line text-[12px] font-semibold text-content">
              Add node to branch
            </div>
            <div className="py-1.5 px-2 max-h-[60vh] overflow-y-auto">
              {/* Leaf nodes */}
              <div className="px-1 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-content-ghost">Steps</div>
              {(['set-payload', 'transform', 'set-variable', 'salesforce', 'database', 'http-request', 'logger'] as LeafNodeType[]).map((t) => {
                const m = NODE_META[t];
                return (
                  <button
                    key={t}
                    onClick={() => {
                      addNodeToBranch(branchPalette.scopeId, branchPalette.branchId, t);
                      setBranchPalette(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-2 transition-colors text-left"
                  >
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: `color-mix(in oklch, ${m.color} 15%, transparent)`, color: m.color }}
                    >
                      <NodeIcon type={t} size={13} />
                    </div>
                    <div>
                      <div className="text-[11.5px] font-medium text-content leading-tight">{m.label}</div>
                      <div className="text-[9.5px] text-content-ghost leading-tight mt-0.5">{m.desc}</div>
                    </div>
                  </button>
                );
              })}
              {/* Scope nodes — separated so the user sees they can nest. */}
              <div className="mx-1 my-1 h-px bg-line-subtle" />
              <div className="px-1 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-content-ghost">Scopes (nestable)</div>
              {(['choice', 'for-each', 'parallel-for-each', 'scatter-gather', 'try', 'first-successful', 'round-robin', 'async'] as ScopeNodeType[]).map((t) => {
                const m = NODE_META[t];
                return (
                  <button
                    key={t}
                    onClick={() => {
                      addNodeToBranch(branchPalette.scopeId, branchPalette.branchId, t);
                      setBranchPalette(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-2 transition-colors text-left"
                  >
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: `color-mix(in oklch, ${m.color} 15%, transparent)`, color: m.color }}
                    >
                      <NodeIcon type={t} size={13} />
                    </div>
                    <div>
                      <div className="text-[11.5px] font-medium text-content leading-tight">{m.label}</div>
                      <div className="text-[9.5px] text-content-ghost leading-tight mt-0.5">{m.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Save Flow Dialog ──────────────────────────────────────── */}
      {showSaveDialog && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh] px-4"
          style={{ background: 'color-mix(in oklch, var(--bg) 60%, transparent)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            className="w-full max-w-sm bg-surface border border-line rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') setShowSaveDialog(false);
              if (e.key === 'Enter' && saveDialogName.trim()) {
                setShowSaveDialog(false);
                doSaveFlow(saveDialogName.trim());
              }
            }}
          >
            <div className="px-4 pt-4 pb-1 text-[13px] font-semibold text-content">Save Flow Workspace</div>
            <div className="px-4 py-3">
              <input
                ref={saveDialogInputRef}
                value={saveDialogName}
                onChange={e => setSaveDialogName(e.target.value)}
                placeholder="Flow name…"
                className="w-full h-8 px-2.5 rounded-md border border-line bg-surface-2 text-[12.5px] text-content placeholder:text-content-ghost outline-none focus:border-accent"
                spellCheck={false}
              />
            </div>
            <div className="px-4 pb-4 flex justify-end gap-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="h-7 px-3 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
              >Cancel</button>
              <button
                onClick={() => { setShowSaveDialog(false); doSaveFlow(saveDialogName.trim()); }}
                disabled={!saveDialogName.trim()}
                className="h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Open Flow Dialog ──────────────────────────────────────── */}
      {showOpenDialog && (() => {
        const needle = openDialogQuery.trim().toLowerCase();
        const filtered = needle
          ? openDialogFiles.filter(f => f.projectName.toLowerCase().includes(needle) || f.filename.toLowerCase().includes(needle))
          : openDialogFiles;
        return (
          <div
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
            style={{ background: 'color-mix(in oklch, var(--bg) 60%, transparent)', backdropFilter: 'blur(2px)' }}
            onClick={() => setShowOpenDialog(false)}
          >
            <div
              className="w-full max-w-xl bg-surface border border-line rounded-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Escape') { setShowOpenDialog(false); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setOpenDialogActive(i => Math.min(filtered.length - 1, i + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setOpenDialogActive(i => Math.max(0, i - 1)); }
                else if (e.key === 'Enter') {
                  e.preventDefault();
                  const f = filtered[openDialogActive];
                  if (f) { setShowOpenDialog(false); loadFlowFile(f.filename); }
                }
              }}
            >
              <div className="h-11 shrink-0 flex items-center gap-2 px-3.5 border-b border-line">
                <Icons.Search size={14} className="text-content-faint shrink-0" />
                <input
                  ref={openDialogInputRef}
                  value={openDialogQuery}
                  onChange={e => { setOpenDialogQuery(e.target.value); setOpenDialogActive(0); }}
                  placeholder="Open flow workspace…"
                  className="flex-1 bg-transparent text-[13px] text-content placeholder:text-content-ghost outline-none"
                />
                <span className="font-mono text-[10.5px] text-content-faint">Esc</span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto py-1.5">
                {filtered.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[12px] text-content-faint">
                    {openDialogFiles.length === 0 ? 'No saved flow workspaces yet.' : 'No matches.'}
                  </div>
                ) : filtered.map((f, i) => (
                  <button
                    key={f.filename}
                    onMouseEnter={() => setOpenDialogActive(i)}
                    onClick={() => { setShowOpenDialog(false); loadFlowFile(f.filename); }}
                    className={`w-full flex items-center gap-2.5 px-3.5 h-8 text-left cursor-pointer ${
                      i === openDialogActive ? 'bg-surface-2' : 'hover:bg-surface-2'
                    }`}
                  >
                    <Icons.Flow size={13} className="shrink-0 opacity-60" style={{ color: 'var(--accent)' }} />
                    <span className="flex-1 text-[12.5px] text-content truncate">{f.projectName}</span>
                    {flowCurrentFile === f.filename && (
                      <span className="font-mono text-[10px] text-content-ghost">current</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="h-8 shrink-0 px-3.5 flex items-center border-t border-line text-[10.5px] text-content-ghost gap-3">
                <span>↑↓ navigate</span>
                <span>↵ open</span>
                <span className="flex-1" />
                <span>{filtered.length} flow{filtered.length === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Mule XML Export Dialog ──────────────────────────────────── */}
      {muleXmlExport !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] px-4"
          style={{ background: 'color-mix(in oklch, var(--bg) 60%, transparent)', backdropFilter: 'blur(2px)' }}
          onClick={() => setMuleXmlExport(null)}
        >
          <div
            className="w-full max-w-3xl bg-surface border border-line rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[84vh]"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') setMuleXmlExport(null); }}
          >
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <span className="font-mono text-[12px]" style={{ color: 'var(--accent)' }}>&lt;/&gt;</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-content">Export to Mule 4 XML</div>
                <div className="text-[10.5px] text-content-ghost mt-0.5">
                  Drop this into a Mule project's <span className="font-mono">src/main/mule/</span> folder. Studio-only metadata is preserved as XML comments so re-importing later restores it intact.
                </div>
              </div>
              <button
                onClick={() => setMuleXmlExport(null)}
                className="text-content-faint hover:text-content cursor-pointer p-1"
                title="Close"
              >
                <Icons.X size={13} />
              </button>
            </div>
            <pre
              className="flex-1 overflow-auto px-4 py-3 text-[11.5px] font-mono leading-relaxed select-text whitespace-pre"
              style={{ background: 'var(--surface-2)', color: 'var(--content-secondary)' }}
            >
              {muleXmlExport}
            </pre>
            <div className="px-4 py-3 border-t border-line flex items-center gap-2">
              <span className="text-[10.5px] text-content-ghost">
                {(muleXmlExport.length / 1024).toFixed(1)} KB · {muleXmlExport.split('\n').length} lines
              </span>
              <span className="flex-1" />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(muleXmlExport);
                    toast('Copied XML to clipboard', 'success');
                  } catch {
                    toast('Failed to copy', 'error');
                  }
                }}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer border border-line transition-colors"
              >
                <Icons.Copy size={11} /> Copy
              </button>
              <button
                onClick={async () => {
                  try {
                    const safeName = (flowName || 'studioFlow').replace(/[^A-Za-z0-9_-]/g, '_');
                    const path = await tauriSave({
                      defaultPath: `${safeName}.xml`,
                      filters: [{ name: 'Mule XML', extensions: ['xml'] }],
                    });
                    if (path) {
                      await invoke('save_output_file', { path, content: muleXmlExport });
                      toast('Saved XML file', 'success');
                    }
                  } catch (e) {
                    toast(`Failed to save: ${(e as Error).message}`, 'error');
                  }
                }}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                <Icons.Save size={11} /> Save .xml…
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mule XML Import Dialog ──────────────────────────────────── */}
      {showMuleXmlImport && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] px-4"
          style={{ background: 'color-mix(in oklch, var(--bg) 60%, transparent)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowMuleXmlImport(false)}
        >
          <div
            className="w-full max-w-3xl bg-surface border border-line rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[84vh]"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowMuleXmlImport(false); }}
          >
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <span className="font-mono text-[12px]" style={{ color: 'var(--accent)' }}>&lt;/&gt;</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-content">Import from Mule 4 XML</div>
                <div className="text-[10.5px] text-content-ghost mt-0.5">
                  Paste a flow's XML below. Studio elements you don't have an equivalent for (Mule connectors, custom modules, etc.) come in as labeled <span className="font-mono">Logger</span> placeholders.
                </div>
              </div>
              <button
                onClick={() => setShowMuleXmlImport(false)}
                className="text-content-faint hover:text-content cursor-pointer p-1"
                title="Close"
              >
                <Icons.X size={13} />
              </button>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <textarea
                value={muleXmlImportText}
                onChange={(e) => { setMuleXmlImportText(e.target.value); setMuleXmlImportResult(null); }}
                placeholder={'<flow name="example">\n    <set-payload value="#[payload]"/>\n    ...\n</flow>'}
                spellCheck={false}
                className="flex-1 w-full px-4 py-3 text-[11.5px] font-mono leading-relaxed bg-transparent outline-none resize-none text-content placeholder:text-content-ghost"
                style={{ minHeight: 280 }}
              />
              {muleXmlImportResult && muleXmlImportResult.kind === 'error' && (
                <div
                  className="border-t px-4 py-2.5 text-[11.5px]"
                  style={{
                    borderColor: 'color-mix(in oklch, var(--err) 30%, transparent)',
                    background: 'color-mix(in oklch, var(--err) 6%, transparent)',
                    color: 'var(--err)',
                  }}
                >
                  <div className="font-semibold text-[10.5px] uppercase tracking-wide mb-1">Parse error</div>
                  <pre className="font-mono whitespace-pre-wrap break-words">{muleXmlImportResult.msg}</pre>
                </div>
              )}
              {muleXmlImportResult && muleXmlImportResult.kind === 'preview' && (
                <div
                  className="border-t px-4 py-2.5 text-[11.5px] space-y-1"
                  style={{
                    borderColor: 'color-mix(in oklch, var(--accent) 30%, transparent)',
                    background: 'color-mix(in oklch, var(--accent) 4%, transparent)',
                  }}
                >
                  <div className="font-semibold" style={{ color: 'var(--accent)' }}>
                    Parsed successfully — "{muleXmlImportResult.flowName}" · {muleXmlImportResult.nodeCount} node{muleXmlImportResult.nodeCount === 1 ? '' : 's'}
                  </div>
                  {muleXmlImportResult.warnings.length > 0 && (
                    <div className="text-[10.5px] text-content-faint">
                      {muleXmlImportResult.warnings.length} unsupported element{muleXmlImportResult.warnings.length === 1 ? '' : 's'} will become Logger placeholder{muleXmlImportResult.warnings.length === 1 ? '' : 's'}. Importing replaces the current flow.
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-line flex items-center gap-2">
              <span className="text-[10.5px] text-content-ghost">
                {muleXmlImportText.trim() ? `${(muleXmlImportText.length / 1024).toFixed(1)} KB · ${muleXmlImportText.split('\n').length} lines` : ''}
              </span>
              <span className="flex-1" />
              <button
                onClick={() => setShowMuleXmlImport(false)}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer border border-line transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={previewMuleXmlImport}
                disabled={!muleXmlImportText.trim()}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer border border-line transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Preview
              </button>
              <button
                onClick={confirmMuleXmlImport}
                disabled={!muleXmlImportText.trim() || (muleXmlImportResult?.kind === 'error')}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Import flow
              </button>
            </div>
          </div>
        </div>
      )}

      {showInputEditor && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] px-4"
          style={{ background: 'color-mix(in oklch, var(--bg) 60%, transparent)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowInputEditor(false)}
        >
          <div
            className="w-full max-w-2xl bg-surface border border-line rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[84vh]"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowInputEditor(false); }}
          >
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <span className="font-mono text-[12px]" style={{ color: 'var(--accent)' }}>{'{ }'}</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-content">Flow input</div>
                <div className="text-[10.5px] text-content-ghost mt-0.5">
                  The starting message a <span className="font-mono">Run</span> uses — the payload a listener would hand the flow, plus inbound <span className="font-mono">attributes</span> (<span className="font-mono">uriParams</span>, <span className="font-mono">queryParams</span>, <span className="font-mono">headers</span>). It propagates forward: each node's output becomes the next node's input.
                </div>
              </div>
              <button onClick={() => setShowInputEditor(false)} className="text-content-faint hover:text-content cursor-pointer p-1" title="Close">
                <Icons.X size={13} />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <ConfigLabel label="Payload" />
                  <select
                    value={inputDraft.mime}
                    onChange={(e) => setInputDraft((d) => ({ ...d, mime: e.target.value }))}
                    className="h-6 px-1.5 rounded bg-surface-2 border border-line text-[10.5px] text-content-faint cursor-pointer outline-none"
                  >
                    {['application/json', 'application/xml', 'text/plain', 'application/csv', 'application/java'].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <textarea
                  value={inputDraft.payload}
                  onChange={(e) => setInputDraft((d) => ({ ...d, payload: e.target.value }))}
                  placeholder={'{\n  "example": "starting payload"\n}'}
                  spellCheck={false}
                  className="w-full px-3 py-2 text-[11.5px] font-mono leading-relaxed bg-surface-2 border border-line rounded-md outline-none resize-y text-content placeholder:text-content-ghost"
                  style={{ minHeight: 110 }}
                />
              </div>
              <div>
                <ConfigLabel label="Attributes (inbound message metadata)" />
                <textarea
                  value={inputDraft.attributesJson}
                  onChange={(e) => setInputDraft((d) => ({ ...d, attributesJson: e.target.value }))}
                  spellCheck={false}
                  className="mt-1 w-full px-3 py-2 text-[11.5px] font-mono leading-relaxed bg-surface-2 border border-line rounded-md outline-none resize-y text-content placeholder:text-content-ghost"
                  style={{ minHeight: 130 }}
                />
                {(() => { try { JSON.parse(inputDraft.attributesJson || '{}'); return null; } catch { return (
                  <div className="mt-1 text-[10.5px]" style={{ color: 'var(--err)' }}>Not valid JSON — attributes fall back to an empty object at run time.</div>
                ); } })()}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-line flex items-center gap-2">
              <button
                onClick={() => setInputDraft(DEFAULT_FLOW_INPUT)}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer border border-line transition-colors"
              >
                Reset
              </button>
              <span className="flex-1" />
              <button
                onClick={() => setShowInputEditor(false)}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer border border-line transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setFlowInput(inputDraft); setShowInputEditor(false); toast('Flow input updated', 'success'); }}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Save input
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigLabel({ label }: { label: string }) {
  return <div className="text-[10px] text-content-faint uppercase tracking-widest font-semibold">{label}</div>;
}

function CtxItem({ label, hint, danger, onClick }: { label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-[12px] cursor-pointer transition-colors flex items-center justify-between gap-4 ${
        danger ? 'text-[var(--err)] hover:bg-[color-mix(in_oklch,var(--err)_8%,transparent)]' : 'text-content hover:bg-surface-2'
      }`}
    >
      <span>{label}</span>
      {hint && <span className="text-[10px] text-content-ghost">{hint}</span>}
    </button>
  );
}
