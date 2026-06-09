# Privacy Policy — DataWeave Studio (VS Code extension)

_Last updated: 2026-06-09_

DataWeave Studio is a local, offline developer tool. It is designed so that your
code and data never leave your machine.

## What we collect

**Nothing.** The extension has no telemetry, analytics, crash reporting,
accounts, or sign-in. We do not collect, transmit, or store any personal or
usage data on any server.

## Network activity

**None from the extension.** DataWeave transforms are evaluated by a local Java
process (the bundled DataWeave 2.11 runtime) over stdin/stdout — no network is
involved. The extension itself makes no outbound requests. Extension updates are
delivered by the VS Code Marketplace (Microsoft), governed by Microsoft's own
policies, not by this extension.

## Data handled locally

- **Scripts, payloads, named inputs, flows** — kept in memory and in workspace
  files you save. Workspaces are stored in the extension's global storage folder
  managed by VS Code.
- **Files** — read or written only when you explicitly choose them through a
  file dialog (e.g. loading a payload, exporting output, adding a classpath JAR).
- **Encryption keys** (Secure Properties tool) — held in memory only for the
  duration of an operation and never written to disk.

## Java runtime

The extension runs a bundled Java runtime (JRE 17) by absolute path. It does not
read, modify, or depend on your system Java, `JAVA_HOME`, or `PATH`.

## Third-party software

The bundled DataWeave runtime and `secure-properties-tool.jar` are by
MuleSoft / Salesforce (BSD-3-Clause). DataWeave Studio is not affiliated with,
endorsed by, or sponsored by MuleSoft or Salesforce.

## Contact

Questions: open an issue at
https://github.com/Ashutosh-Vijay/DataWeave-Studio/issues
