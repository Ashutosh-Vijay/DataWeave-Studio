/**
 * Local HTTP API for the VS Code extension — the counterpart to the desktop
 * app's `POST /run`.
 *
 * WHY THIS EXISTS IN THE EXTENSION AT ALL
 *   The obvious answer was "use the desktop app for scripted runs". That fails
 *   for the people who most need it: on a locked-down corporate network the
 *   desktop installer is a blocked browser download and its updater can't reach
 *   GitHub either, so the extension is the only build they can actually run.
 *   Shipping the feature only where those users can't get to it makes it
 *   decorative.
 *
 * SECURITY POSTURE — identical to the desktop app's, deliberately:
 *   - off until the user explicitly starts it, and never auto-starts
 *   - bound to 127.0.0.1 only, never 0.0.0.0
 *   - Safe mode by default: `java!` / `readUrl` / `dw::io` are rejected before
 *     the script runs
 *   - stops when the extension deactivates
 *
 * That is the same shape as Live Server, Live Preview and every debug adapter.
 * The risk is a port on loopback, which is not a trust boundary — hence the
 * safe-mode gate rather than trusting whatever can reach it.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import { DwServer, runDataweave } from './dwHost';

export const DEFAULT_PORT = 4675;

/** Mirrors the desktop's `safe_mode_block_reason` — keep the two in step. */
function safeModeBlockReason(script: string): string | null {
  if (script.includes('java!')) return 'Java interop (`import java!…`)';
  if (/\breadUrl\s*\(/.test(script)) return '`readUrl`';
  if (script.includes('dw::io')) return 'the `dw::io` module';
  return null;
}

interface Row {
  payload?: unknown;
  vars?: unknown;
  attributes?: unknown;
}

interface RunRequest extends Row {
  script?: string;
  payloadMime?: string;
  rows?: Row[];
}

/** A JSON value is serialised; a JSON *string* passes through verbatim so XML
 *  and CSV payloads aren't wrapped in quotes. */
function toPayload(v: unknown): string {
  if (v === undefined || v === null) return '{}';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function toJson(v: unknown, fallback: string): string {
  return v === undefined || v === null ? fallback : JSON.stringify(v);
}

let listening: http.Server | null = null;

export function status(): { running: boolean; port: number | null } {
  const addr = listening?.address() as AddressInfo | undefined;
  return { running: !!listening, port: addr ? addr.port : null };
}

export async function stop(): Promise<void> {
  const s = listening;
  listening = null;
  if (s) await new Promise<void>((res) => s.close(() => res()));
}

export async function start(
  getServer: () => Promise<DwServer>,
  port = DEFAULT_PORT,
  advanced = false,
): Promise<{ running: boolean; port: number | null }> {
  if (listening) return status();

  const srv = http.createServer((req, res) => {
    const send = (code: number, body: unknown) => {
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      res.writeHead(code, {
        'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      });
      res.end(text);
    };

    if (req.method !== 'POST' || (req.url || '').split('?')[0] !== '/run') {
      return send(404, 'Not found. The only endpoint is POST /run.');
    }

    // Loopback keeps the network out, but not the browser. Any page you visit
    // can fire a cross-origin POST at 127.0.0.1 from JavaScript — it can't read
    // the reply, but the side effect here is *running code*, so the request
    // must not happen at all. Two cheap guards:
    //
    //   1. Require application/json. That takes the request out of CORS's
    //      "simple request" set, so a browser must preflight it — and we never
    //      answer a preflight, so it's blocked before the body is sent.
    //   2. Refuse anything carrying Origin. Browsers always set it on
    //      cross-origin fetch/XHR; curl, Python and Node don't set it at all.
    if (req.headers.origin) {
      return send(403, 'Refused: requests from a web page are not accepted.');
    }
    const ctype = String(req.headers['content-type'] || '');
    if (!ctype.toLowerCase().includes('application/json')) {
      return send(415, 'Content-Type must be application/json.');
    }

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', async () => {
      let body: RunRequest;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (e) {
        return send(400, `Failed to parse the request body as JSON: ${(e as Error).message}`);
      }
      if (!body.script) return send(400, 'Missing "script".');

      if (!advanced) {
        const reason = safeModeBlockReason(body.script);
        if (reason) {
          const denied = {
            ok: false,
            error: `${reason} is blocked while the HTTP API is in Safe mode.`,
            executionTimeMs: 0,
          };
          return send(200, body.rows ? { results: body.rows.map(() => denied) } : denied);
        }
      }

      const rows: Row[] = body.rows ?? [body];
      const batch = !!body.rows;
      const results: unknown[] = [];

      for (const row of rows) {
        const started = Date.now();
        try {
          const dw = await getServer();
          const r = await runDataweave(dw, {
            script: body.script!,
            payload: toPayload(row.payload),
            payloadMimeType: body.payloadMime || 'application/json',
            attributesJson: toJson(row.attributes, '{}'),
            varsJson: toJson(row.vars, '{}'),
            namedInputsJson: '[]',
          });
          results.push(
            r.error
              ? { ok: false, error: r.error, executionTimeMs: Date.now() - started }
              : { ok: true, output: r.output, executionTimeMs: Date.now() - started },
          );
        } catch (e) {
          results.push({ ok: false, error: String(e), executionTimeMs: Date.now() - started });
        }
      }

      send(200, batch ? { results } : results[0]);
    });
  });

  await new Promise<void>((resolve, reject) => {
    srv.once('error', reject);
    // Loopback only. Passing no host would bind every interface and expose the
    // engine to the network, which is exactly what this must never do.
    srv.listen(port, '127.0.0.1', () => resolve());
  });

  listening = srv;
  return status();
}
