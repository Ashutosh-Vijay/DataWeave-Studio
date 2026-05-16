// === Workspace / State Types ===

export interface KeyValuePair {
  key: string;
  value: string;
  /** Per-row enable. Undefined or true = included in execution; false = skipped. */
  enabled?: boolean;
}

export interface VarEntry {
  key: string;
  value: string;
  valueType: 'string' | 'json';
  /** Per-row enable. Undefined or true = included in execution; false = skipped. */
  enabled?: boolean;
}

export interface EncryptionSettings {
  algorithm: string;
  mode: string;
  useRandomIVs: boolean;
}

export interface ContextState {
  method: string;
  queryParams: KeyValuePair[];
  headers: KeyValuePair[];
  vars: VarEntry[];
  configYaml?: string;
  secureConfigYaml?: string;
  encryptionSettings?: EncryptionSettings;
}

export interface MultipartPart {
  name: string;
  value: string;
  contentType: string;
  isFile: boolean;
  filePath?: string;
  filename?: string;
}

export interface NamedInput {
  name: string;
  content: string;
  mimeType: MimeType;
  /** Absolute path to a binary file — when set, content is ignored */
  filePath?: string;
}

/** A single test case attached to a request (Phase 2). */
export interface TestCase {
  id: string;
  name: string;
  payload: string;
  payloadMimeType: string;
  /** `undefined` = not yet captured. User runs once + snapshots. */
  expectedOutput?: string;
  /** "exact" — byte-for-byte; "semantic-json" — parse + compare. */
  comparator: 'exact' | 'semantic-json';
  /** Last-known status. The runner updates this. */
  lastStatus?: 'pass' | 'fail' | 'untested';
  lastTimeMs?: number;
}

/**
 * One request inside a workspace. A workspace is a *collection* of these,
 * Postman-style — same project, multiple transforms (happy path, edge case,
 * etc.). Each request is fully self-contained: its own script, payload,
 * context, named inputs, and (Phase 2) tests.
 */
export interface Request {
  id: string;
  name: string;
  script: string;
  payload: string;
  payloadMimeType: MimeType;
  nodeLabel: string;
  namedInputs: NamedInput[];
  queryTemplate: string;
  classpath: string[];
  timeoutMs?: number;
  payloadFilePath?: string;
  multipartParts: MultipartPart[];
  context: ContextState;
  tests: TestCase[];
}

/**
 * v2 workspace schema — a project name plus N requests plus an optional
 * message flow that pipelines them. Legacy v1 files (with `singleTransform`)
 * are auto-migrated by the Rust backend on load.
 */
export interface WorkspaceFile {
  version: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  requests: Request[];
  activeRequestId?: string;
  flow?: unknown;
}

// === MIME type options ===

export type MimeType =
  | 'application/json'
  | 'application/xml'
  | 'application/csv'
  | 'text/plain'
  | 'application/x-www-form-urlencoded'
  | 'multipart/form-data'
  | 'application/java'
  | 'application/dw'
  | 'application/octet-stream'
  | 'application/yaml'
  | 'application/x-ndjson'
  | 'text/x-java-properties';

const VALID_MIMES = new Set<string>([
  'application/json', 'application/xml', 'application/csv', 'text/plain',
  'application/x-www-form-urlencoded', 'multipart/form-data', 'application/java',
  'application/dw', 'application/octet-stream', 'application/yaml',
  'application/x-ndjson', 'text/x-java-properties',
]);

export function isValidMimeType(v: string): v is MimeType {
  return VALID_MIMES.has(v);
}

export const MIME_OPTIONS: { label: string; value: MimeType }[] = [
  { label: 'JSON', value: 'application/json' },
  { label: 'XML', value: 'application/xml' },
  { label: 'CSV', value: 'application/csv' },
  { label: 'Plain Text', value: 'text/plain' },
  { label: 'Form URL-Encoded', value: 'application/x-www-form-urlencoded' },
  { label: 'Multipart Form Data', value: 'multipart/form-data' },
  { label: 'Java Object', value: 'application/java' },
  { label: 'DataWeave', value: 'application/dw' },
  { label: 'YAML', value: 'application/yaml' },
  { label: 'NDJSON', value: 'application/x-ndjson' },
  { label: 'Java Properties', value: 'text/x-java-properties' },
  { label: 'Binary', value: 'application/octet-stream' },
];

// === HTTP method options ===

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Postman-style method colors */
export const METHOD_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  GET:    { text: 'text-accent', bg: 'bg-accent-dim', border: 'border-accent-border' },
  POST:   { text: 'text-warn',   bg: 'bg-warn-tint',  border: 'border-warn-border' },
  PUT:    { text: 'text-cyan',   bg: 'bg-cyan-tint',  border: 'border-cyan-border' },
  DELETE: { text: 'text-err',    bg: 'bg-err-tint',   border: 'border-err-border' },
  PATCH:  { text: 'text-violet', bg: 'bg-violet-tint', border: 'border-violet-border' },
};

/** Node label accent colors */
export const NODE_LABEL_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  Transform:         { text: 'text-violet', bg: 'bg-violet-tint', border: 'border-violet-border' },
  'Salesforce Query': { text: 'text-cyan',   bg: 'bg-cyan-tint',   border: 'border-cyan-border' },
  'DB Query':        { text: 'text-warn',   bg: 'bg-warn-tint',   border: 'border-warn-border' },
};

// === Node labels ===

export const NODE_LABELS = [
  'Transform',
  'Salesforce Query',
  'DB Query',
] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];
