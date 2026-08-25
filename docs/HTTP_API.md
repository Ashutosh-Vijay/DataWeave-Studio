# Local HTTP API

DataWeave Studio runs the real DataWeave 2.11 engine on your machine. When the
local server is running, that engine is reachable over plain HTTP — so a shell
script, a Python driver, or a CI job can run transforms without deploying
anything.

The usual reason to want this: **testing a transform against real data.** Doing
that in Mule means publishing an API just to exercise the script. Here you POST
the script and the rows and get the results back.

Available in **both** the desktop app and the VS Code extension. In each, it is
off until you start it.

---

## Starting the server

**Desktop:** left rail → **Local Server** → **Start server**.

**VS Code:** open the DataWeave Studio panel → **Local Server** → **Start HTTP
API**. (The MCP half is managed by VS Code itself; the HTTP half you start.)

Default port **4675**, bound to `127.0.0.1` — never exposed to your network. It
stays off between launches unless you start it again.

---

## `POST /run`

### One run

```bash
curl -X POST http://127.0.0.1:4675/run \
  -H 'Content-Type: application/json' \
  -d '{
        "script": "%dw 2.0\noutput application/json\n---\n{ n: sizeOf(payload) }",
        "payload": [1, 2, 3]
      }'
```

```json
{ "ok": true, "output": "{\n  \"n\": 3\n}", "executionTimeMs": 33 }
```

### Many rows, one script

Send `rows` instead, and you get one result per row, in order:

```bash
curl -X POST http://127.0.0.1:4675/run \
  -H 'Content-Type: application/json' \
  -d '{
        "script": "%dw 2.0\noutput application/json\n---\n{ greeting: \"Hi \" ++ vars.name }",
        "rows": [
          { "vars": { "name": "Ada" } },
          { "vars": { "name": "Alan" } }
        ]
      }'
```

```json
{
  "results": [
    { "ok": true, "output": "{\n  \"greeting\": \"Hi Ada\"\n}", "executionTimeMs": 1179 },
    { "ok": true, "output": "{\n  \"greeting\": \"Hi Alan\"\n}", "executionTimeMs": 13 }
  ]
}
```

**The first row is slow and the rest are not.** The engine compiles the script
once and caches it, so a batch costs roughly `1s + 15ms × rows`. Twenty thousand
rows is a few minutes.

---

## Any format, in and out

`Content-Type: application/json` applies to the **request envelope** — the JSON
object carrying `script`, `payload` and `rows`. It says nothing about your data.

Your payload can be any format the engine reads, and the output is whatever the
script's `output` directive produces:

```jsonc
// POST /run  —  XML in, CSV out
{
  "script": "%dw 2.0\noutput application/csv\n---\npayload.*item map { id: $.@id, name: $.name }",
  "payloadMime": "application/xml",
  "payload": "<items><item id=\"1\"><name>Ada</name></item></items>"
}
```

XML in, CSV out. A JSON **string** payload is passed to the engine verbatim, so
XML and CSV aren't wrapped in quotes; a JSON object or array is serialised.

The envelope has to be JSON for a security reason, not a technical one — see
[Safe mode](#safe-mode).

---

## Request fields

| field | type | notes |
|---|---|---|
| `script` | string | **required.** A full DataWeave script including the `%dw 2.0` header and `---`. |
| `payload` | any | Input payload. A JSON value is passed as-is; a JSON **string** is passed verbatim, so XML and CSV aren't wrapped in quotes. |
| `payloadMime` | string | MIME type of `payload`. Default `application/json`. |
| `vars` | object | Flow variables — `vars.*` in the script. Nested objects work: `{"vars":{"a":{"b":1}}}` is `vars.a.b`. |
| `attributes` | object | Inbound attributes — `attributes.*`. |
| `rows` | array | Batch mode. Each entry may carry its own `payload`, `vars` and `attributes`. When present, the top-level `payload`/`vars`/`attributes` are ignored. |

## Response

Single run returns one result object. Batch returns `{ "results": [ … ] }`.

| field | notes |
|---|---|
| `ok` | `true` when the script ran and produced output. |
| `output` | The rendered result, as a string, in whatever format the script's `output` directive asked for. |
| `error` | Present when `ok` is false — the engine's compile or runtime error, with line and column. |
| `executionTimeMs` | Wall-clock for that row. |

A failing row does not stop the batch; it comes back with `ok: false` and the
rest still run.

---

## Safe mode

The same gate that protects the MCP tools applies here. In Safe mode (the
default) a script using `import java!…`, `readUrl` or `dw::io` is **rejected
before it runs** — every row returns `ok: false` with an explanation.

Loopback is not a trust boundary. Two things can reach this port that people
often assume can't:

- **Any process on your machine.** There's no authentication.
- **Any web page you visit.** A page's JavaScript can POST to `127.0.0.1` even
  though it can't read the reply — and here the side effect is *running code*.

That second one is why the endpoint requires `Content-Type: application/json`
and refuses any request carrying an `Origin` header. Requiring JSON takes the
request out of CORS's "simple request" set, so a browser must preflight it, and
the preflight is never answered. `curl`, Python and Node don't send `Origin` at
all, so they're unaffected.

Leave Safe mode on unless you specifically need Java interop, and stop the
server when you're done with it.

---

## Worked example

[`docs/examples/dw_backtest.py`](examples/dw_backtest.py) runs a `.dwl` file
over a CSV export and reports what failed and where it clusters:

```bash
pip install requests
python docs/examples/dw_backtest.py --script extract.dwl --csv rows.csv
```

Every CSV column becomes a var, so a `templateMessage` column is
`vars.templateMessage` in the script. It writes `failures.json` containing each
failing row *with the input that produced it*, so a failure can be reproduced by
pasting it back into the app.

The clustering is usually the most useful output. Failures concentrated in one
id mean one bad data row — fix the data. Failures spread evenly across ids mean
a gap in the transform.

---

## VS Code

Supported, with one difference worth knowing: the extension's **MCP** server
speaks JSON-RPC over stdio and VS Code owns its lifecycle, so there's no
start/stop for it. The **HTTP API** is separate and you start it yourself, from
the same panel.

This matters more than it sounds. On a locked-down corporate network the desktop
installer is often a blocked browser download — and its updater can't reach
GitHub either — so the extension is the only build some people can run. Shipping
this only on the desktop would have put it out of reach of the people most
likely to need it.

Same engine, same script, same results in both.
