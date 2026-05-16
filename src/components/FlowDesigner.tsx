import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icons } from './Icons';
import { MiniEditor } from './MiniEditor';
import { WindowControls } from './WindowControls';
import { MIME_OPTIONS } from '../types';
import { toast } from './Toast';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
const openFile = tauriOpen;

interface MultipartPart {
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

type NodeType = 'set-payload' | 'transform' | 'set-variable' | 'salesforce' | 'database' | 'http-request' | 'logger';
type ConnectorOp = 'query' | 'insert' | 'update' | 'upsert' | 'delete' | 'select';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface FlowNode {
  id: string;
  type: NodeType;
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
  };
  output?: string;
  error?: string;
  executionTimeMs?: number;
  status: 'idle' | 'running' | 'success' | 'error';
}

interface RunResult {
  output: string;
  error: string | null;
  execution_time_ms: number;
}

// ── Constants ──────────────────────────────────────────────────────

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
};

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
  const [configTab, setConfigTab] = useState<'general' | 'request' | 'response' | 'variables'>('general');
  const [dismissedValidations, setDismissedValidations] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const abortRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  // Reset config tab when selection changes
  useEffect(() => { setConfigTab('general'); }, [selectedId]);

  // Execution order: sort by x position, skip disabled nodes
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
        requestAnimationFrame(() => {
          canvas.scrollLeft = wx * next - mx;
          canvas.scrollTop = wy * next - my;
        });
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
          setNodes((prev) => prev.filter((n) => n.id !== selectedId));
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
      default: // logger
        break;
    }
    const node: FlowNode = { id: newId(), type, label: meta.label, x, y, config, status: 'idle' };
    setNodes((prev) => [...prev, node]);
    setSelectedId(node.id);
  }, []);

  // ── Update selected node config ─────────────────────────────────
  const updateNode = useCallback((id: string, patch: Partial<FlowNode>) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, ...patch } : n));
  }, []);

  const updateConfig = useCallback((id: string, patch: Partial<FlowNode['config']>) => {
    setNodes((prev) => prev.map((n) =>
      n.id === id ? { ...n, config: { ...n.config, ...patch } } : n
    ));
  }, []);

  // ── Pipeline execution ──────────────────────────────────────────
  const runPipeline = useCallback(async (stepThrough = false) => {
    if (executionOrder.length === 0) return;
    setIsRunning(true);
    abortRef.current = false;

    // Reset all statuses
    setNodes((prev) => prev.map((n) => ({ ...n, status: 'idle' as const, output: undefined, error: undefined, executionTimeMs: undefined })));

    let currentPayload = '';
    let currentMime = 'application/json';
    let currentAttributes = '{}';
    let currentMultipartJson: string | null = null;
    let currentPayloadFilePath: string | null = null;
    const variables: Record<string, string> = {};

    for (let i = 0; i < executionOrder.length; i++) {
      if (abortRef.current) break;
      const node = executionOrder[i];
      setStepIndex(i);

      // Mark running
      setNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, status: 'running' as const } : n));

      if (stepThrough) {
        // Wait for user to click Next Step
        setStepping(true);
        await new Promise<void>((resolve) => { stepResolveRef.current = resolve; });
        setStepping(false);
        if (abortRef.current) break;
      }

      try {
        if (node.type === 'set-payload') {
          currentPayload = node.config.payload || '';
          currentMime = node.config.payloadMime || 'application/json';
          currentMultipartJson = null;
          currentPayloadFilePath = null;
          if (currentMime === 'multipart/form-data' && node.config.multipartParts?.length) {
            currentMultipartJson = JSON.stringify(node.config.multipartParts);
          }
          if (currentMime === 'application/octet-stream' && node.config.payloadFilePath) {
            currentPayloadFilePath = node.config.payloadFilePath;
          }
          // Build attributes from queryParams + explicit attributes
          const attrs: Record<string, unknown> = {};
          try { Object.assign(attrs, JSON.parse(node.config.attributes || '{}')); } catch {}
          try { attrs.queryParams = JSON.parse(node.config.queryParams || '{}'); } catch {}
          currentAttributes = JSON.stringify(attrs);
          const displayOutput = currentMime === 'multipart/form-data'
            ? `[multipart: ${node.config.multipartParts?.length || 0} parts]`
            : currentMime === 'application/octet-stream'
            ? `[binary: ${node.config.payloadFilePath?.split(/[/\\]/).pop() || 'no file'}]`
            : currentPayload;
          setNodes((prev) => prev.map((n) => n.id === node.id
            ? { ...n, status: 'success' as const, output: displayOutput, executionTimeMs: 0 }
            : n));

        } else if (node.type === 'set-variable') {
          const varName = node.config.variableName || 'myVar';
          let varValue = '';

          if (node.config.variableSource === 'script' && node.config.script) {
            // Run DW script to compute the variable value
            const result = await invoke<RunResult>('run_dataweave', {
              script: node.config.script,
              payload: currentPayload,
              payloadMimeType: currentMime,
              attributesJson: '{}',
              varsJson: JSON.stringify(variables),
              namedInputsJson: '[]',
              payloadFilePath: currentPayloadFilePath,
              classpath: [],
              timeoutMs: 0,
              multipartPartsJson: currentMultipartJson,
            });
            if (result.error) {
              setNodes((prev) => prev.map((n) => n.id === node.id
                ? { ...n, status: 'error' as const, error: result.error ?? undefined, executionTimeMs: result.execution_time_ms }
                : n));
              break;
            }
            varValue = result.output;
          } else {
            varValue = node.config.variableValue || currentPayload;
          }

          variables[varName] = varValue;
          // Set Variable does NOT change the payload — pass-through
          setNodes((prev) => prev.map((n) => n.id === node.id
            ? { ...n, status: 'success' as const, output: `vars.${varName} = ${varValue}`, executionTimeMs: 0 }
            : n));

        } else if (node.type === 'transform') {
          const result = await invoke<RunResult>('run_dataweave', {
            script: node.config.script || DEFAULT_SCRIPT,
            payload: currentPayload,
            payloadMimeType: currentMime,
            attributesJson: currentAttributes,
            varsJson: JSON.stringify(variables),
            namedInputsJson: '[]',
            payloadFilePath: null,
            classpath: [],
            timeoutMs: 0,
            multipartPartsJson: null,
          });

          if (result.error) {
            setNodes((prev) => prev.map((n) => n.id === node.id
              ? { ...n, status: 'error' as const, error: result.error ?? undefined, executionTimeMs: result.execution_time_ms }
              : n));
            break;
          }

          if (node.config.saveToVariable) {
            // Save transform output to variable, don't change payload
            variables[node.config.saveToVariable] = result.output;
            setNodes((prev) => prev.map((n) => n.id === node.id
              ? { ...n, status: 'success' as const, output: `vars.${node.config.saveToVariable} = ${result.output}`, executionTimeMs: result.execution_time_ms }
              : n));
          } else {
            currentPayload = result.output;
            currentMime = node.config.outputMime || 'application/json';
            setNodes((prev) => prev.map((n) => n.id === node.id
              ? { ...n, status: 'success' as const, output: result.output, executionTimeMs: result.execution_time_ms }
              : n));
          }

        } else if (node.type === 'salesforce' || node.type === 'database' || node.type === 'http-request') {
          // Connector: inject mock response
          const response = node.config.mockResponse || '';
          const mime = node.config.mockMime || 'application/json';

          if (node.config.saveToVariable) {
            // Store in variable, don't change payload
            variables[node.config.saveToVariable] = response;
            setNodes((prev) => prev.map((n) => n.id === node.id
              ? { ...n, status: 'success' as const, output: `vars.${node.config.saveToVariable} = ${response}`, executionTimeMs: 0 }
              : n));
          } else {
            currentPayload = response;
            currentMime = mime;
            setNodes((prev) => prev.map((n) => n.id === node.id
              ? { ...n, status: 'success' as const, output: response, executionTimeMs: 0 }
              : n));
          }

        } else if (node.type === 'logger') {
          const logOutput = `── Logger ──\nPayload (${currentMime}):\n${currentPayload}\n\n── Variables ──\n${Object.keys(variables).length > 0
            ? Object.entries(variables).map(([k, v]) => `${k}: ${v}`).join('\n')
            : '(none)'}`;
          setNodes((prev) => prev.map((n) => n.id === node.id
            ? { ...n, status: 'success' as const, output: logOutput, executionTimeMs: 0 }
            : n));
        }
      } catch (e) {
        setNodes((prev) => prev.map((n) => n.id === node.id
          ? { ...n, status: 'error' as const, error: String(e) }
          : n));
        break;
      }
    }

    setIsRunning(false);
    setStepIndex(null);
  }, [executionOrder]);

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
  }, []);

  // ── Toggle disabled ─────────────────────────────────────────────
  const toggleDisabled = useCallback((id: string) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, disabled: !n.disabled } : n));
  }, []);

  // ── Duplicate node ──────────────────────────────────────────────
  const duplicateNode = useCallback((id: string) => {
    setNodes((prev) => {
      const src = prev.find((n) => n.id === id);
      if (!src) return prev;
      const clone: FlowNode = { ...src, id: newId(), x: src.x + 40, y: src.y + 40, status: 'idle', output: undefined, error: undefined, config: { ...src.config } };
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
  // Sync dialog-open ref for keyboard handler (declared earlier)
  dialogOpenRef.current = showSaveDialog || showOpenDialog;

  // Mark dirty on any node change
  useEffect(() => { if (nodes.length > 0) setFlowDirty(true); }, [nodes]);

  const doSaveFlow = useCallback(async (name: string) => {
    try {
      const workspace = {
        version: '1.0',
        projectName: name,
        createdAt: '',
        updatedAt: '',
        mode: 'flow',
        singleTransform: { script: '', payload: '', payloadMimeType: 'application/json', nodeLabel: 'Transform' },
        context: { method: 'GET', queryParams: [], headers: [], vars: [] },
        flowNodes: nodes.map(n => ({ ...n, status: 'idle', output: undefined, error: undefined, executionTimeMs: undefined })),
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
  }, [nodes]);

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
      const ws = await invoke<{ mode: string; flowNodes?: FlowNode[]; projectName: string }>('load_workspace', { filename });
      if (ws.flowNodes && ws.flowNodes.length > 0) {
        setNodes(ws.flowNodes.map(n => ({ ...n, status: 'idle' as const, output: undefined, error: undefined, executionTimeMs: undefined })));
        setFlowName(ws.projectName);
        setFlowCurrentFile(filename);
        setFlowDirty(false);
        setSelectedId(null);
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

  if (!open) return null;

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
              Step {(stepIndex ?? 0) + 1}/{executionOrder.length}
            </span>
            <button
              onClick={stepNext}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Next →
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
              const fromX = from.x + NODE_W;
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
                    width: NODE_W,
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
                onClick={() => { setNodes((prev) => prev.filter((n) => n.id !== selected.id)); setSelectedId(null); }}
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
        const ctxNode = nodes.find(n => n.id === contextMenu.nodeId);
        if (!ctxNode) return null;
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
            <CtxItem
              label="Duplicate"
              onClick={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); }}
            />
            <div className="mx-2 my-1 h-px bg-line-subtle" />
            <CtxItem
              label="Delete"
              danger
              onClick={() => {
                setNodes(prev => prev.filter(n => n.id !== contextMenu.nodeId));
                if (selectedId === contextMenu.nodeId) setSelectedId(null);
                setContextMenu(null);
              }}
            />
          </div>
        );
      })()}

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
