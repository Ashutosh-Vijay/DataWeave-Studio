/**
 * Lightweight draft auto-save to localStorage. Captures the entire workspace
 * (project name + all requests + active request id + optional flow) so the
 * user can resume an in-progress session even if they never explicitly saved
 * a workspace file.
 *
 * Cleared when the user explicitly saves a workspace (the saved file becomes
 * the source of truth) or starts a fresh new workspace.
 *
 * Schema v2 — stores the full collection. v1 drafts (single-request) are
 * auto-migrated on read into a 1-request collection.
 */

import { Request } from './types';

const KEY = 'dw.draftSession';

export interface DraftSession {
  projectName: string;
  requests: Request[];
  activeRequestId: string;
  flow?: unknown;
  savedAt: number;
}

// Legacy v1 draft shape, kept only so a returning user with an old draft
// in localStorage can still hit Resume.
interface LegacyDraftSession {
  projectName: string;
  script: string;
  payload: string;
  payloadMimeType: string;
  context: unknown;
  namedInputs: unknown[];
  classpath: string[];
  timeoutMs: number;
  multipartParts: unknown[];
  nodeLabel: string;
  queryTemplate: string;
  payloadFilePath: string | null;
  savedAt: number;
}

function isV2Draft(d: unknown): d is DraftSession {
  return typeof d === 'object' && d !== null && Array.isArray((d as { requests?: unknown }).requests);
}

function migrateLegacy(d: LegacyDraftSession): DraftSession {
  const reqId = `req-${Date.now().toString(16)}${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')}`;
  return {
    projectName: d.projectName,
    requests: [{
      id: reqId,
      name: d.projectName || 'Request',
      script: d.script,
      payload: d.payload,
      payloadMimeType: d.payloadMimeType as Request['payloadMimeType'],
      nodeLabel: d.nodeLabel,
      namedInputs: (d.namedInputs as Request['namedInputs']) ?? [],
      queryTemplate: d.queryTemplate,
      classpath: d.classpath,
      timeoutMs: d.timeoutMs,
      payloadFilePath: d.payloadFilePath ?? undefined,
      multipartParts: (d.multipartParts as Request['multipartParts']) ?? [],
      context: d.context as Request['context'],
      tests: [],
    }],
    activeRequestId: reqId,
    flow: undefined,
    savedAt: d.savedAt,
  };
}

export function readDraft(): DraftSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isV2Draft(parsed)) return parsed;
    return migrateLegacy(parsed as LegacyDraftSession);
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
