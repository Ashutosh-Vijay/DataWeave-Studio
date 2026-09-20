/**
 * Pull HTTP requests back out of a Mule log.
 *
 * The situation this exists for: something failed in an environment you can't
 * attach a debugger to, and all you have is the log. Mule's own wire logger
 * (`org.mule.service.http.impl.service.HttpMessageLogger`, switched on with
 * `DEBUG` on that category) dumps the whole request — request line, headers,
 * body — but as log output, which you cannot replay. Turning it back into a
 * cURL command is a tedious manual job that this does exactly.
 *
 * What it understands is a raw HTTP request block anywhere in the text, so it
 * also works on a request pasted from Studio's console, from a proxy, or from a
 * colleague's message. Anything that isn't a request block is skipped, which is
 * most of a log file.
 */

export interface LoggedRequest {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body: string;
  /** 1-based line in the pasted text where the request line was found. */
  line: number;
  /** REQUEST in the log means outbound; a listener logs it too. Display only. */
  label: string;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/** A request line, with or without a log prefix in front of it. Mule's wire
 *  logger writes the dump raw, but plenty of setups run every line through the
 *  log pattern first, so `… HttpMessageLogger: POST /x HTTP/1.1` happens too. */
const REQUEST_LINE = new RegExp(`(?:^|[:\\]]\\s)\\s*(${METHODS.join('|')})\\s+(\\S+)\\s+HTTP/\\d`, 'i');

/** The start of a new log entry — a level, or a timestamp. Used to know where a
 *  body ends, since a log gives no content boundary we can trust. */
const LOG_ENTRY = /^(?:\[?\d{4}-\d{2}-\d{2}|(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\b)/;

/** Headers that describe the connection rather than the request. cURL sets all
 *  of these itself, and a stale Content-Length is actively harmful. */
const DROP_HEADERS = ['host', 'content-length', 'connection', 'transfer-encoding', 'accept-encoding'];

export function parseMuleLog(text: string): LoggedRequest[] {
  const lines = text.split(/\r?\n/);
  const out: LoggedRequest[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = REQUEST_LINE.exec(lines[i]);
    if (!m) continue;
    const method = m[1].toUpperCase();
    const target = m[2];

    // Headers run until a blank line, the next log entry, or anything that
    // isn't `Name: value` — a log has no framing, so this has to stop on its
    // own rather than trusting a Content-Length that may have been rewritten.
    const headers: { key: string; value: string }[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const raw = lines[j];
      if (!raw.trim()) { j++; break; }
      if (LOG_ENTRY.test(raw.trim())) break;
      const colon = raw.indexOf(':');
      if (colon <= 0) break;
      const key = raw.slice(0, colon).trim();
      if (!/^[A-Za-z0-9-]+$/.test(key)) break;
      headers.push({ key, value: raw.slice(colon + 1).trim() });
    }

    // Body: everything up to the next log entry or the next request line.
    const bodyLines: string[] = [];
    for (; j < lines.length; j++) {
      const raw = lines[j];
      if (LOG_ENTRY.test(raw.trim()) || REQUEST_LINE.test(raw)) break;
      bodyLines.push(raw);
    }

    const host = headers.find((h) => h.key.toLowerCase() === 'host')?.value ?? '';
    out.push({
      method,
      url: absoluteUrl(target, host),
      headers: headers.filter((h) => !DROP_HEADERS.includes(h.key.toLowerCase())),
      body: bodyLines.join('\n').trim(),
      line: i + 1,
      label: `${method} ${target.length > 60 ? target.slice(0, 60) + '…' : target}`,
    });
    i = j - 1;
  }

  return out;
}

/** The request line carries a path; the scheme and host live in the Host header
 *  (or nowhere, when the log was trimmed). Port 443 or no port means https —
 *  a guess, but the one that's right nearly always, and visible to correct. */
function absoluteUrl(target: string, host: string): string {
  if (/^https?:\/\//i.test(target)) return target;
  if (!host) return target;
  const scheme = /:80$/.test(host) || /^localhost(:|$)/.test(host) ? 'http' : 'https';
  const cleaned = host.replace(/:443$/, '').replace(/:80$/, '');
  return `${scheme}://${cleaned}${target.startsWith('/') ? '' : '/'}${target}`;
}

/** Single-quoted for a POSIX shell. A `'` inside has to leave the quotes,
 *  escape itself, and come back — `'\''` — which is ugly and correct. */
function shellQuote(s: string): string {
  return `'${s.split("'").join(`'\\''`)}'`;
}

export function toCurl(req: LoggedRequest): string {
  const parts = [`curl -X ${req.method} ${shellQuote(req.url)}`];
  for (const h of req.headers) parts.push(`  -H ${shellQuote(`${h.key}: ${h.value}`)}`);
  if (req.body) parts.push(`  -d ${shellQuote(req.body)}`);
  return parts.join(' \\\n');
}
