# Security & Privacy

DataWeave Studio is a local desktop app and VS Code extension. This page lists
exactly what it does on your machine and on the network, for security and
compliance reviewers who need to approve it before use.

## Summary

- **No telemetry, analytics, tracking or accounts.**
- **The DataWeave engine runs locally.** A bundled JRE 17 runs the DataWeave runtime
  as a child process that talks to the app over stdin/stdout. It doesn't open a
  network socket.
- **The app connects to the internet in three cases**, listed below: an optional
  update check, feedback when you choose to send it, and Java library downloads
  when you ask for one.
- **Open source (MIT).** You can read every line and build it yourself.

## What data the app handles, and where it lives

| Data | Where it's stored | Leaves your machine? |
|------|-------------------|----------------------|
| Scripts, payloads, workspaces | Local app-data folder (below) | No |
| Settings and preferences | `localStorage` inside the app's WebView | No |
| Encryption keys (Secure Properties tool) | Memory only, never written to disk | No |
| Feedback you send | The feedback server (see below) | Only when you press Send |

App-data folder:
- **Windows:** `%APPDATA%\com.dwstudio.desktop`
- **macOS:** `~/Library/Application Support/com.dwstudio.desktop`

There is no cloud sync and no background upload.

## Network activity: the complete list

1. **Update check (desktop app only).** On startup the app asks one of these
   endpoints whether a newer version exists:
   - `https://ashutosh-vijay.dev/dataweave/update.json`
   - `https://dataweave-studio.pages.dev/update.json`

   The request is an HTTP GET carrying the app version and platform in the query
   string (for example `?v=3.2.0&t=windows-x86_64`). The server adds one to a daily
   count for that version and platform, and stores nothing else: no IP address, no
   identifier. If an update exists you are shown a notice, and nothing downloads
   until you click.

   **To turn it off:** Settings → Advanced → Privacy → *Check for updates on
   startup*. The Microsoft Store build never makes this request, and the VS Code
   extension is updated by the Marketplace instead.

2. **Feedback, when you send it.** The app asks for a rating after a few sessions,
   and there is a feedback button in the top bar. Nothing is sent unless you press
   **Send**. A rating is a POST to `/api/feedback` on the same two domains, and
   stores the score (1 to 5), your optional comment, the app version, whether it
   came from the desktop app or the VS Code extension, and the date. To limit spam,
   the server keeps a hash of your IP address combined with the date for one day,
   so it can count how many ratings arrive from one address. It can't be linked
   across days and is deleted the next day. Comments are published on the
   [feedback page](https://ashutosh-vijay.dev/dataweave/feedback) only after they
   have been read.

3. **Java library downloads, when you ask.** The Java tester can fetch a JAR from
   Maven Central (`repo1.maven.org`) when you request one.

Clicking a link (for example "report a bug", which opens a GitHub issue) opens it
in your normal browser; the app itself doesn't send anything.

On the desktop app this is enforced by the WebView's Content-Security-Policy:
`connect-src` allows only the app itself and the two domains above.

Everything else, including running scripts, the Flow Designer's Salesforce,
Database and HTTP steps, and secure-property encryption, is computed locally. The
Flow Designer's connectors are **mocks** that return sample data you provide; they
don't call real endpoints.

## The local server

The app can run a local server so AI assistants and scripts on the same machine
can use the engine. It is off until you start it from **Tools → Local Server**.

- It listens on `127.0.0.1` only (port 4675 by default), so other machines can't
  reach it.
- `/mcp` serves AI assistants; `POST /run` runs a script and returns the output.
  Both refuse a request whose `Host` header isn't `localhost` or `127.0.0.1`
  (the defence against DNS rebinding), and `/run` also refuses any request
  carrying an `Origin` header, which browsers add to every request a web page
  makes.
- **Safe mode** (the default) runs scripts with the DataWeave engine's own
  privilege checks on and nothing granted: `readUrl`, `eval` and `run`, Java
  interop, `dw::io` file access and environment variables are refused when they
  are called. **Advanced mode** lifts this for a fully trusted local agent.

Scripts opened from a share link or an imported zip don't run on their own in the
app; they wait for you to press **Run**.

## Code signing

The direct-download installers aren't code-signed yet (Apple notarization is about
$99 a year and a Windows EV certificate $300+), so your OS will warn on first launch.
That warning means the publisher isn't verified. The **Microsoft Store** build is
signed by Microsoft and shows no warning.

For more assurance:
- **Build from source** (see the README's Development setup) and run your own build.
- **Read the source.** The whole app, including its network code and CSP, is in this
  repository.

## Reporting a vulnerability

Please email **issues@ashutosh-vijay.dev** with details rather than opening a public
issue, and allow reasonable time for a fix before disclosure.
