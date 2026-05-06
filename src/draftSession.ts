/**
 * Lightweight draft auto-save to localStorage. Captures the entire workspace
 * state so the user can resume an in-progress session even if they never
 * explicitly saved a workspace file.
 *
 * Cleared when the user explicitly saves a workspace (the saved file becomes
 * the source of truth) or starts a fresh new workspace.
 */

import { ContextState, MimeType, NamedInput, MultipartPart } from './types';

const KEY = 'dw.draftSession';

export interface DraftSession {
  projectName: string;
  script: string;
  payload: string;
  payloadMimeType: MimeType;
  context: ContextState;
  namedInputs: NamedInput[];
  classpath: string[];
  timeoutMs: number;
  multipartParts: MultipartPart[];
  nodeLabel: string;
  queryTemplate: string;
  payloadFilePath: string | null;
  savedAt: number;
}

export function readDraft(): DraftSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftSession;
  } catch { return null; }
}

export function writeDraft(d: DraftSession): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* quota or unavailable */ }
}

export function clearDraft(): void {
  try { localStorage.removeItem(KEY); } catch { /* unavailable */ }
}

export function hasDraft(): boolean {
  try { return localStorage.getItem(KEY) != null; } catch { return false; }
}
