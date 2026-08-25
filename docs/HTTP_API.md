# Local HTTP API

DataWeave Studio runs the real DataWeave 2.11 engine on your machine. When the
local server is running, that engine is reachable over plain HTTP — so a shell
script, a Python driver, or a CI job can run transforms without deploying
anything.

The usual reason to want this: **testing a transform against real data.** Doing
that in Mule means publishing an API just to exercise the script. Here you POST
the script and the rows and get the results back.

> **Desktop app only.** The VS Code extension talks MCP over stdio and opens no
> port, so there's no HTTP endpoint there. See [VS Code](#vs-code) below.

---

## Starting the server

Left rail → **MCP Server** → **Start server**. Default port **4675**, bound to
`127.0.0.1` — it is never exposed to your network.

The server is off until you start it, and stays off between launches unless you
start it again.

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

Loopback is not a trust boundary: anything on your machine can reach this port.
Leave Safe mode on unless you specifically need Java interop, and turn the
server off when you're done with it.

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

Not available in the extension. Its MCP server speaks JSON-RPC over **stdio**
(`src/mcp/server.ts`), which is what VS Code's MCP client expects — there's no
listening port to attach an HTTP route to.

Adding it would mean the extension host opening a TCP port, which is a different
security proposition from a desktop app the user explicitly starts, so it isn't
something to enable by default. If you need batch runs today, use the desktop
app; both run the same engine and the same script.
