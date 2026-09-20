import { describe, it, expect } from 'vitest';
import { parseCurl } from '../components/CurlImporter';

/**
 * Three flags that cURL carries and the parser used to skip: they were listed
 * as "flags with a value" purely so the value would not be mistaken for the
 * URL. The importer has nowhere to put them, but the Mule XML export does, and
 * an export that quietly drops the credentials is one that 401s in front of you.
 */

describe('parseCurl — auth, redirects and timeout', () => {
  it('reads -u as a username and password', () => {
    const r = parseCurl("curl -u admin:hunter2 'https://api.example.com/a'");
    expect(r.auth).toEqual({ username: 'admin', password: 'hunter2' });
    // …and the credentials are not mistaken for the URL.
    expect(r.url).toBe('https://api.example.com/a');
  });

  it('keeps a password that contains colons', () => {
    const r = parseCurl("curl --user 'admin:pa:ss:word' 'https://api.example.com/a'");
    expect(r.auth).toEqual({ username: 'admin', password: 'pa:ss:word' });
  });

  it('accepts a username with no password', () => {
    expect(parseCurl("curl -u admin 'https://api.example.com/a'").auth)
      .toEqual({ username: 'admin', password: '' });
  });

  it('reads -L, and leaves the flag undefined when it is absent', () => {
    expect(parseCurl("curl -L 'https://api.example.com/a'").followRedirects).toBe(true);
    expect(parseCurl("curl --location 'https://api.example.com/a'").followRedirects).toBe(true);
    expect(parseCurl("curl 'https://api.example.com/a'").followRedirects).toBeUndefined();
  });

  it('converts --max-time from seconds to milliseconds', () => {
    expect(parseCurl("curl -m 30 'https://api.example.com/a'").timeoutMs).toBe(30000);
    expect(parseCurl("curl --max-time 2.5 'https://api.example.com/a'").timeoutMs).toBe(2500);
    expect(parseCurl("curl 'https://api.example.com/a'").timeoutMs).toBeUndefined();
  });

  it('ignores a --max-time that is not a number rather than emitting NaN', () => {
    expect(parseCurl("curl -m soon 'https://api.example.com/a'").timeoutMs).toBeUndefined();
  });

  it('still parses everything else around them', () => {
    const r = parseCurl(
      "curl -L -u admin:hunter2 -m 10 -X POST 'https://api.example.com/v1/orders?region=eu' " +
      "-H 'Content-Type: application/json' -d '{\"id\":7}'",
    );
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://api.example.com/v1/orders?region=eu');
    expect(r.queryParams).toEqual([{ key: 'region', value: 'eu' }]);
    expect(r.headers).toEqual([{ key: 'Content-Type', value: 'application/json' }]);
    expect(r.payload).toContain('"id": 7');
    expect(r.auth?.username).toBe('admin');
    expect(r.followRedirects).toBe(true);
    expect(r.timeoutMs).toBe(10000);
  });
});
