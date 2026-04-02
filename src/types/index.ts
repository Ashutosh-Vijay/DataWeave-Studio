// === Workspace / State Types ===

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface VarEntry {
  key: string;
  value: string;
  valueType: 'string' | 'json';
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

export interface NamedInput {
  name: string;
  content: string;
  mimeType: MimeType;
  /** Absolute path to a binary file — when set, content is ignored */
  filePath?: string;
}

export interface SingleTransform {
  script: string;
  payload: string;
  payloadMimeType: string;
  nodeLabel: string;
  namedInputs?: NamedInput[];
  queryTemplate?: string;
  classpath?: string[];
  timeoutMs?: number;
  payloadFilePath?: string;
}

export interface WorkspaceFile {
  version: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  mode: string;
  singleTransform: SingleTransform;
  context: ContextState;
}

// === DW Runner Types ===

export interface RunResult {
  output: string;
  error: string | null;
  execution_time_ms: number;
}

export interface DWError {
  message: string;
  line: number | null;
  column: number | null;
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
  | 'application/flatfile'
  | 'application/octet-stream';

export const MIME_OPTIONS: { label: string; value: MimeType }[] = [
  { label: 'JSON', value: 'application/json' },
  { label: 'XML', value: 'application/xml' },
  { label: 'CSV', value: 'application/csv' },
  { label: 'Plain Text', value: 'text/plain' },
  { label: 'Form URL-Encoded', value: 'application/x-www-form-urlencoded' },
  { label: 'Multipart Form Data', value: 'multipart/form-data' },
  { label: 'Java Object', value: 'application/java' },
  { label: 'DataWeave', value: 'application/dw' },
  { label: 'Flat File', value: 'application/flatfile' },
  { label: 'Binary', value: 'application/octet-stream' },
];

// === HTTP method options ===

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Postman-style method colors */
export const METHOD_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  GET:    { text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  POST:   { text: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30' },
  PUT:    { text: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30' },
  DELETE: { text: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/30' },
  PATCH:  { text: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/30' },
};

/** Node label accent colors */
export const NODE_LABEL_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  Transform:         { text: 'text-violet-400',   bg: 'bg-violet-500/15',  border: 'border-violet-500/30' },
  'Salesforce Query': { text: 'text-sky-400',     bg: 'bg-sky-500/15',     border: 'border-sky-500/30' },
  'DB Query':        { text: 'text-orange-400',   bg: 'bg-orange-500/15',  border: 'border-orange-500/30' },
};

// === Node labels ===

export const NODE_LABELS = [
  'Transform',
  'Salesforce Query',
  'DB Query',
] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];
