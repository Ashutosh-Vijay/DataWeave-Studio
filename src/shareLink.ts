/**
 * Shareable snapshots — "send me your whole playground in one link".
 *
 * Packs the script plus everything it needs to actually run (payload + MIME,
 * flow vars, headers, query params, method, named inputs) into one compressed,
 * URL-safe string. The recipient pastes it back and gets an identical setup —
 * something the hosted DataWeave Playground can't do.
 *
 * The blob lives in the URL FRAGMENT (`…/s#<code>`), which browsers never send
 * to the server. So a link can be shared over Slack or email and the payload
 * still never touches anyone's infrastructure — including ours. That matters:
 * people paste production-shaped data into this tool.
 *
 * Format: `dws1.` + base64url(deflate(JSON)). The version prefix is there so a
 * future format change can be rejected with a clear message instead of
 * exploding on a stale link.
 */
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';

export const SHARE_PREFIX = 'dws1.';
/** Where a shared link points. The page just hands the fragment to the app. */
export const SHARE_BASE_URL = 'https://ashutosh-vijay.dev/dataweave/s';

/** One request's worth of shareable state. */
export interface ShareRequest {
  /** Request name, when the link carries a whole workspace. */
  label?: string;
  script: string;
  payload: string;
  payloadMime: string;
  /** Flow variables, as the Context panel stores them. */
  vars?: { key: string; value: string; valueType: string }[];
  headers?: { key: string; value: string }[];
  queryParams?: { key: string; value: string }[];
  method?: string;
  namedInputs?: { name: string; content: string; mimeType: string }[];
  /** Multipart bodies — in-memory parts only; file-backed parts can't travel. */
  multipartParts?: { name: string; value: string; contentType: string }[];
  /** Transform / Salesforce Query / DB Query — changes how the request runs. */
  nodeLabel?: string;
  queryTemplate?: string;
}

export interface ShareSnapshot extends ShareRequest {
  /** Workspace name, shown to the recipient. */
  name?: string;
  /**
   * Every request, when sharing a whole workspace. The flat fields above still
   * describe the ACTIVE request, so an older reader (and the web landing page)
   * shows something useful instead of nothing.
   */
  requests?: ShareRequest[];
}

/**
 * Things in the current workspace that physically cannot travel in a link, so
 * the sender can be told rather than the recipient silently getting less than
 * was promised. A local file path means nothing on someone else's machine.
 */
export function unshareableItems(w: {
  payloadFilePath?: string | null;
  multipartParts?: { name: string; isFile?: boolean }[];
  namedInputs?: { name: string; filePath?: string }[];
}): string[] {
  const out: string[] = [];
  if (w.payloadFilePath) out.push('the payload file picked from disk');
  for (const p of w.multipartParts || []) if (p.isFile) out.push(`multipart file part “${p.name}”`);
  for (const n of w.namedInputs || []) if (n.filePath) out.push(`input file “${n.name}”`);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Drop empty collections so a simple snapshot stays a short link. */
function compactRequest<T extends ShareRequest>(req: T): T {
  const out = {
    script: req.script,
    payload: req.payload,
    payloadMime: req.payloadMime,
  } as T;
  if (req.label) out.label = req.label;
  if (req.method && req.method !== 'GET') out.method = req.method;
  // 'Transform' is the default role; only carry it when it differs.
  if (req.nodeLabel && req.nodeLabel !== 'Transform') out.nodeLabel = req.nodeLabel;
  if (req.queryTemplate && req.queryTemplate.trim()) out.queryTemplate = req.queryTemplate;
  const keep = <R extends { key?: string; name?: string }>(rows?: R[]) =>
    (rows || []).filter((r) => (r.key ?? r.name ?? '').trim() !== '');
  if (keep(req.vars).length) out.vars = keep(req.vars);
  if (keep(req.headers).length) out.headers = keep(req.headers);
  if (keep(req.queryParams).length) out.queryParams = keep(req.queryParams);
  if (keep(req.namedInputs).length) out.namedInputs = keep(req.namedInputs);
  if (keep(req.multipartParts).length) out.multipartParts = keep(req.multipartParts);
  return out;
}

function compact(snap: ShareSnapshot): ShareSnapshot {
  const out: ShareSnapshot = compactRequest(snap);
  if (snap.name) out.name = snap.name;
  if (snap.requests && snap.requests.length > 1) out.requests = snap.requests.map(compactRequest);
  return out;
}

/** Snapshot → shareable code (`dws1.…`). */
export function encodeShare(snap: ShareSnapshot): string {
  const json = JSON.stringify(compact(snap));
  // level 9: these are pasted into chat windows, so size beats a few ms.
  return SHARE_PREFIX + toBase64Url(deflateSync(strToU8(json), { level: 9 }));
}

/** Shareable code (or a full URL containing one) → snapshot. */
export function decodeShare(input: string): ShareSnapshot {
  let code = input.trim();
  // Accept a pasted URL, with the code in the fragment or the query.
  const hash = code.match(/[#?](?:s=)?(dws1\.[A-Za-z0-9_-]+)/);
  if (hash) code = hash[1];
  // Or a bare code that may have picked up whitespace/newlines from an email.
  code = code.replace(/\s+/g, '');
  if (!code.startsWith(SHARE_PREFIX)) {
    throw new Error('That doesn’t look like a DataWeave Studio share link.');
  }
  let snap: ShareSnapshot;
  try {
    snap = JSON.parse(strFromU8(inflateSync(fromBase64Url(code.slice(SHARE_PREFIX.length)))));
  } catch {
    throw new Error('This share link is damaged or incomplete — ask for it again.');
  }
  if (typeof snap?.script !== 'string') throw new Error('This share link has no script in it.');
  return snap;
}

/** Full URL for a snapshot, with the payload kept in the fragment. */
export function shareUrl(snap: ShareSnapshot): string {
  return `${SHARE_BASE_URL}#${encodeShare(snap)}`;
}

/**
 * Links get pasted into chat clients that wrap or truncate very long URLs, and
 * some corporate filters reject them outright. Past this size, offer the
 * existing Playground-zip export instead of a link that silently breaks.
 */
export const SHARE_URL_SOFT_LIMIT = 8000;

export function isShareTooLong(url: string): boolean {
  return url.length > SHARE_URL_SOFT_LIMIT;
}
