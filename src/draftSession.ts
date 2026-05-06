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
    if (!raw) {
      console.log('[draft] readDraft: no draft in localStorage');
      return null;
    }
    const d = JSON.parse(raw) as DraftSession;
    console.log('[draft] readDraft: loaded', {
      projectName: d.projectName,
      scriptLen: d.script?.length,
      scriptPreview: d.script?.slice(0, 80),
      savedAt: new Date(d.savedAt).toISOString(),
    });
    return d;
  } catch (e) {
    console.warn('[draft] readDraft: parse failed', e);
    return null;
  }
}

export function writeDraft(d: DraftSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    console.log('[draft] writeDraft', {
      scriptLen: d.script?.length,
      scriptPreview: d.script?.slice(0, 80),
      savedAt: new Date(d.savedAt).toISOString(),
    });
  } catch (e) { console.warn('[draft] writeDraft failed:', e); }
}

export function clearDraft(): void {
  try {
    const had = localStorage.getItem(KEY) != null;
    localStorage.removeItem(KEY);
    if (had) console.log('[draft] clearDraft: cleared an existing draft');
  } catch (e) { console.warn('[draft] clearDraft failed:', e); }
}

export function hasDraft(): boolean {
  try { return localStorage.getItem(KEY) != null; } catch { return false; }
}
