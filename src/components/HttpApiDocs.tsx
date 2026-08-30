/**
 * In-app reference for the local HTTP API.
 *
 * The panel used to point at `docs/examples/dw_backtest.py` — a path in a
 * GitHub repo that someone who installed from the Microsoft Store or the VS
 * Code Marketplace has never seen and has no reason to find. Worse, nothing
 * anywhere showed how to send vars or headers, which is the first thing you
 * need after "hello world".
 *
 * So the reference lives in the app, every snippet is copyable, and it reads
 * top to bottom in the order questions actually arrive.
 */
import { useEffect, useState } from 'react';

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function Snippet({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden', margin: '10px 0' }}>
      <div className="flex items-center" style={{ gap: 7, padding: '6px 10px', borderBottom: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--content-faint)', flex: 1 }}>{label || ''}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="inline-flex items-center cursor-pointer hover:text-content"
          style={{ height: 21, padding: '0 9px', border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 6, color: 'var(--content-secondary)', fontSize: 10, fontWeight: 600 }}
        >{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre style={{ margin: 0, padding: '11px 13px', fontFamily: MONO, fontSize: 11, lineHeight: 1.65, color: 'var(--content-secondary)', whiteSpace: 'pre', overflowX: 'auto' }}>{code}</pre>
    </div>
  );
}

const H = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--content)', marginTop: 22, marginBottom: 6 }}>{children}</div>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--content-muted)' }}>{children}</div>
);
const C = ({ children }: { children: React.ReactNode }) => (
  <code style={{ fontFamily: MONO, fontSize: 11.5, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '1px 5px' }}>{children}</code>
);

export function HttpApiDocs({ open, onClose, port }: { open: boolean; onClose: () => void; port: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const url = `http://127.0.0.1:${port}/run`;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center"
      style={{ padding: 22, background: 'color-mix(in oklch, var(--bg) 68%, transparent)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(760px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: '0 32px 90px rgba(0,0,0,.6)' }}
      >
        <div className="flex items-center" style={{ height: 52, gap: 12, padding: '0 18px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg, var(--surface-2), var(--surface))' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Running scripts over HTTP</div>
            <div style={{ fontSize: 10.5, color: 'var(--content-faint)' }}>Everything you can send, and what comes back</div>
          </div>
          <button onClick={onClose} className="grid place-items-center cursor-pointer hover:bg-surface-2 hover:text-content" style={{ width: 30, height: 30, border: 'none', background: 'transparent', borderRadius: 8, color: 'var(--content-faint)' }} title="Close (Esc)">
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '4px 22px 24px', overflowY: 'auto' }}>
          <H>The idea</H>
          <P>
            The engine running in this app is the real DataWeave 2.12 runtime. While the server is on,
            anything on your machine can POST a script to it and get the output back — a shell script, a
            Python driver, a CI job. No Mule app, no deployed endpoint.
          </P>

          <H>1 · The simplest call</H>
          <Snippet
            label="POST /run"
            code={`curl -X POST ${url} \\
  -H 'Content-Type: application/json' \\
  -d '{
        "script": "%dw 2.0\\noutput application/json\\n---\\n{ n: sizeOf(payload) }",
        "payload": [1, 2, 3]
      }'`}
          />
          <P>Returns <C>{'{ "ok": true, "output": "{ \\"n\\": 3 }", "executionTimeMs": 33 }'}</C></P>

          <H>2 · Variables — <C>vars.*</C></H>
          <P>
            Anything in <C>vars</C> is available as <C>vars.name</C> in the script. Nested objects work,
            so <C>{'{"vars":{"user":{"id":7}}}'}</C> is <C>vars.user.id</C>.
          </P>
          <Snippet
            code={`{
  "script": "%dw 2.0\\noutput application/json\\n---\\n{ hi: vars.name, tier: vars.account.tier }",
  "vars": {
    "name": "Ada",
    "account": { "tier": "gold" }
  }
}`}
          />

          <H>3 · Headers, method, query params — <C>attributes.*</C></H>
          <P>
            These go in <C>attributes</C>, exactly as a Mule flow would see them. A header with a dash or
            a dot needs quoting in DataWeave: <C>{'attributes.headers."X-Trace-Id"'}</C>.
          </P>
          <Snippet
            code={`{
  "script": "%dw 2.0\\noutput application/json\\n---\\n{\\n  verb:  attributes.method,\\n  token: attributes.headers.\\"X-Auth\\",\\n  page:  attributes.queryParams.page\\n}",
  "attributes": {
    "method": "POST",
    "headers":     { "X-Auth": "abc123", "Content-Type": "application/json" },
    "queryParams": { "page": "2" }
  },
  "payload": {}
}`}
          />

          <H>4 · Any format, in and out</H>
          <P>
            Only the request envelope is JSON. Set <C>payloadMime</C> to whatever your data actually is,
            and the output is whatever your script&rsquo;s <C>output</C> line says. A payload given as a
            JSON <b>string</b> is passed to the engine untouched, so XML and CSV don&rsquo;t get quoted.
          </P>
          <Snippet
            label="XML in, CSV out"
            code={`{
  "script": "%dw 2.0\\noutput application/csv\\n---\\npayload.items.*item map { id: $.@id, name: $.name }",
  "payloadMime": "application/xml",
  "payload": "<items><item id=\\"1\\"><name>Ada</name></item></items>"
}`}
          />

          <H>5 · Many rows, one script</H>
          <P>
            Send <C>rows</C> and each entry runs separately — its own <C>payload</C>, <C>vars</C> and
            <C> attributes</C> — coming back as <C>results</C> in the same order. This is the one that
            replaces deploying an endpoint to test against real data.
          </P>
          <Snippet
            code={`{
  "script": "%dw 2.0\\noutput application/json\\n---\\n{ greeting: \\"Hi \\" ++ vars.name }",
  "rows": [
    { "vars": { "name": "Ada"  } },
    { "vars": { "name": "Alan" } }
  ]
}`}
          />
          <P>
            The engine compiles the script once and caches it, so the first row costs about a second and
            every row after runs in milliseconds. Twenty thousand rows is a few minutes. A row that fails
            comes back with <C>ok: false</C> and its error — the rest still run.
          </P>

          <H>6 · Driving it from Python</H>
          <P>Every column of a CSV becomes a var, so a <C>templateMessage</C> column is <C>vars.templateMessage</C>.</P>
          <Snippet
            label="backtest.py"
            code={`import csv, json, requests

rows = [{"vars": r} for r in csv.DictReader(open("rows.csv", encoding="utf-8-sig"))]

res = requests.post("${url}", json={
    "script": open("transform.dwl", encoding="utf-8").read(),
    "rows": rows,
}).json()["results"]

failed = [r for r in res if not r["ok"]]
print(f"{len(res) - len(failed)}/{len(res)} ran")

for row, r in zip(rows, res):
    if r["ok"]:
        out = json.loads(r["output"])
        # ...assert whatever your script reports, e.g. out["matched"]
    else:
        print(row, r["error"])`}
          />

          <H>Good to know</H>
          <P>
            <b>Safe mode</b> blocks <C>java!</C>, <C>readUrl</C> and <C>dw::io</C> before a script runs.
            Leave it on unless you need Java interop.
            <br /><br />
            <b>Loopback is not a trust boundary.</b> Any process on your machine can reach this port, and
            a web page you visit could try to. That&rsquo;s why the endpoint requires
            <C>Content-Type: application/json</C> and refuses anything sending an <C>Origin</C> header —
            it makes a browser preflight the request, and the preflight is never answered. Scripts are
            unaffected. Still, stop the server when you&rsquo;re done with it.
          </P>
        </div>
      </div>
    </div>
  );
}
