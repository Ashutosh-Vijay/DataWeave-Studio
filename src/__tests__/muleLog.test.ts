import { describe, it, expect } from 'vitest';
import { parseMuleLog, toCurl } from '../muleLog';

/**
 * The log parser is the piece most likely to meet a shape nobody anticipated —
 * every Mule setup logs through its own pattern — so the cases here are real
 * log shapes rather than tidy fixtures: a wire dump, a dump whose every line
 * carries the log pattern in front of it, a RESPONSE block that must NOT be
 * mistaken for a request, and a body that ends because the next log entry
 * starts rather than because anything said how long it was.
 */

const WIRE = [
  'INFO  2026-05-01 10:00:00,001 [main] org.mule.runtime.core.internal.logging.LogUtil: Started app',
  'DEBUG 2026-05-01 10:00:02,123 [http.requester.HTTP_Request_Config.01] org.mule.service.http.impl.service.HttpMessageLogger: REQUEST',
  'POST /api/v1/orders?region=eu HTTP/1.1',
  'Content-Type: application/json',
  'X-Api-Key: abc123',
  'Host: api.example.com:443',
  'Content-Length: 42',
  'Connection: keep-alive',
  '',
  '{"id":7,"note":"hello"}',
  'DEBUG 2026-05-01 10:00:02,456 [http.requester] org.mule.service.http.impl.service.HttpMessageLogger: RESPONSE',
  'HTTP/1.1 500 Internal Server Error',
  'Content-Type: application/json',
  '',
  '{"error":"boom"}',
  'ERROR 2026-05-01 10:00:02,999 [main] org.mule.runtime.core: HTTP:INTERNAL_SERVER_ERROR',
].join('\n');

describe('parseMuleLog', () => {
  it('pulls the request out of a wire dump', () => {
    const [req, ...rest] = parseMuleLog(WIRE);
    expect(rest).toHaveLength(0);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://api.example.com/api/v1/orders?region=eu');
    expect(req.body).toBe('{"id":7,"note":"hello"}');
    expect(req.line).toBe(3);
  });

  it('does not mistake the RESPONSE block for a second request', () => {
    // `HTTP/1.1 500 …` is a status line, not a request line: no method in front.
    expect(parseMuleLog(WIRE)).toHaveLength(1);
  });

  it('drops the headers cURL sets for itself', () => {
    const keys = parseMuleLog(WIRE)[0].headers.map((h) => h.key.toLowerCase());
    expect(keys).toEqual(['content-type', 'x-api-key']);
    // A stale Content-Length is worse than useless — it truncates the replay.
    expect(keys).not.toContain('content-length');
    expect(keys).not.toContain('host');
    expect(keys).not.toContain('connection');
  });

  it('reads a request line that still has the log pattern in front of it', () => {
    const [req] = parseMuleLog([
      'DEBUG 2026-05-01 10:01:00,000 [x] HttpMessageLogger: GET /health HTTP/1.1',
      'Host: localhost:8081',
      '',
    ].join('\n'));
    expect(req.method).toBe('GET');
    expect(req.url).toBe('http://localhost:8081/health');
  });

  it('finds every request in a log, in order', () => {
    const found = parseMuleLog(WIRE + '\n' + [
      'DEBUG 2026-05-01 10:05:00,000 [x] HttpMessageLogger: PUT /api/v1/orders/7 HTTP/1.1',
      'Host: api.example.com',
      '',
    ].join('\n'));
    expect(found.map((r) => r.method)).toEqual(['POST', 'PUT']);
  });

  it('ends the body at the next log entry, not at a Content-Length', () => {
    // Content-Length says 42; the body is shorter. The next DEBUG line is the
    // only boundary worth trusting in a log.
    expect(parseMuleLog(WIRE)[0].body).not.toContain('RESPONSE');
    expect(parseMuleLog(WIRE)[0].body).not.toContain('error');
  });

  it('handles a request with no body and no blank line after the headers', () => {
    const [req] = parseMuleLog('GET /ping HTTP/1.1\nHost: api.example.com\n');
    expect(req.body).toBe('');
    expect(req.headers).toHaveLength(0); // Host is dropped
  });

  it('guesses the scheme from the port, and localhost is http', () => {
    const https = parseMuleLog('GET /a HTTP/1.1\nHost: api.example.com:443\n')[0];
    const http = parseMuleLog('GET /a HTTP/1.1\nHost: api.example.com:80\n')[0];
    const local = parseMuleLog('GET /a HTTP/1.1\nHost: localhost:8081\n')[0];
    expect(https.url).toBe('https://api.example.com/a');
    expect(http.url).toBe('http://api.example.com/a');
    expect(local.url).toBe('http://localhost:8081/a');
  });

  it('keeps an absolute target as it is, and survives a missing Host', () => {
    expect(parseMuleLog('GET https://api.example.com/a HTTP/1.1\nAccept: */*\n')[0].url)
      .toBe('https://api.example.com/a');
    // Trimmed log, no Host header: the path is all there is, and half a cURL
    // beats refusing to parse.
    expect(parseMuleLog('GET /a HTTP/1.1\nAccept: */*\n')[0].url).toBe('/a');
  });

  it('CRLF line endings parse the same as LF', () => {
    const [req] = parseMuleLog(WIRE.split('\n').join('\r\n'));
    expect(req.method).toBe('POST');
    expect(req.body).toBe('{"id":7,"note":"hello"}');
  });

  it('finds nothing in a log that holds no request', () => {
    expect(parseMuleLog('INFO 2026-05-01 10:00:00,001 [main] Started app\nINFO deployed')).toEqual([]);
    expect(parseMuleLog('')).toEqual([]);
  });

  it('stops collecting headers at a line that is not one', () => {
    const [req] = parseMuleLog([
      'POST /a HTTP/1.1',
      'Content-Type: application/json',
      'this line is not a header',
      '{"x":1}',
    ].join('\n'));
    expect(req.headers.map((h) => h.key)).toEqual(['Content-Type']);
  });
});

describe('toCurl', () => {
  it('writes a command with the method, headers and body', () => {
    const curl = toCurl(parseMuleLog(WIRE)[0]);
    expect(curl).toContain("curl -X POST 'https://api.example.com/api/v1/orders?region=eu'");
    expect(curl).toContain("-H 'Content-Type: application/json'");
    expect(curl).toContain("-H 'X-Api-Key: abc123'");
    expect(curl).toContain('-d \'{"id":7,"note":"hello"}\'');
    // Continuations, so it pastes into a shell as written.
    expect(curl.split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\\'))).toBe(true);
  });

  it("escapes a single quote the way a POSIX shell needs", () => {
    const [req] = parseMuleLog([
      'POST /a HTTP/1.1',
      'Content-Type: application/json',
      '',
      `{"note":"it's here"}`,
    ].join('\n'));
    // Leave the quotes, escape the quote, come back: '\'' — ugly and correct.
    expect(toCurl(req)).toContain(`'{"note":"it'\\''s here"}'`);
  });

  it('leaves out -d entirely when there is no body', () => {
    const curl = toCurl(parseMuleLog('GET /ping HTTP/1.1\nHost: api.example.com\n')[0]);
    expect(curl).not.toContain('-d');
    expect(curl).toBe("curl -X GET 'https://api.example.com/ping'");
  });
});
