# Security & Privacy

DataWeave Studio is a **local-first desktop app**. It is designed so that your
scripts, payloads, and secrets never leave your machine. This document spells out
exactly what the app does — written for security/compliance reviewers (e.g. at a
bank or other regulated environment) who need to clear it before use.

## TL;DR

- **No telemetry, no analytics, no tracking, no accounts.** Nothing about how you
  use the app is collected or transmitted.
- **The DataWeave engine runs entirely locally** — a bundled JRE 17 executes the
  DataWeave runtime as a child process that talks to the app over local
  stdin/stdout. It never opens a network socket.
- **The only outbound network request the app can make is an optional update
  check** (see below). You can turn it off, making the app 100% offline.
- **Open source (MIT).** You can read every line and build it yourself.

## What data the app handles, and where it lives

| Data | Where it's stored | Leaves your machine? |
|------|-------------------|----------------------|
| Scripts, payloads, workspaces | Local app-data folder (below) | No |
| Settings/preferences | Browser `localStorage` inside the app's WebView | No |
| Encryption keys (Secure Properties tool) | **In memory only** — never written to disk | No |

App-data folder:
- **Windows:** `%APPDATA%\com.dwstudio.desktop`
- **macOS:** `~/Library/Application Support/com.dwstudio.desktop`

There is no cloud sync, no remote storage, and no background upload of any kind.

## Network activity — the complete list

The app makes **one** category of outbound request, and only this one:

- **Update check.** On startup the app may contact the release server to see if a
  newer version exists:
  - `https://ashutosh-vijay.dev/dataweave/update.json`
  - `https://dataweave-studio.pages.dev/update.json`

  It sends only a standard HTTP GET (no payload, no identifiers). If an update
  exists, you are shown a prompt; nothing downloads or installs without your
  explicit click.

  **To disable it entirely:** Settings → Advanced → Privacy →
  *"Check for updates on startup"* (off). With it off, the app makes **no network
  requests at all**.

This is enforced at two layers:
1. The startup check is gated behind the setting above.
2. The app's Content-Security-Policy (`connect-src`) restricts all network access
   to `self` and the two update endpoints above — the WebView cannot reach any
   other origin even if asked to.

Everything else — running scripts, mocking Salesforce/Database/HTTP nodes,
generating secure properties — is computed locally. The Salesforce/Database/HTTP
"connectors" in the Flow Designer are **mocks**: they return sample data you
provide, they do not call any real endpoint.

## Code signing

The installers are **not yet code-signed** (Apple notarization is ~$99/yr and a
Windows EV certificate is ~$300+/yr — a lot for a free side-project). Because of
this your OS will warn on first launch (Windows SmartScreen / Smart App Control,
macOS Gatekeeper). The warning means "the publisher isn't verified," **not** that
the app is malicious.

If you need assurance beyond "trust me":
- **Build from source** (see the README's Development Setup) and run your own
  build — then nothing is unsigned-from-a-stranger.
- **Inspect the source** — the entire app, including the network code and CSP, is
  in this repository.

## Reporting a vulnerability

Found something? Please email **randomx626@gmail.com** with details rather than
opening a public issue, and allow reasonable time to fix before disclosure.
