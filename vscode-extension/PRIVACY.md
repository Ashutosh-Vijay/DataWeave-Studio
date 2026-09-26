# Privacy Policy: DataWeave Studio for VS Code

_Last updated: 2026-09-26_

The extension has no telemetry, analytics, crash reporting, accounts or sign-in.
Scripts run on a DataWeave engine bundled with the extension.

## Network activity

The extension connects to the internet in two cases, both started by you:

- **Sending feedback.** The extension asks for a rating after a few sessions, and
  there's a feedback button in the top bar. Nothing is sent unless you press
  **Send**. A rating stores the score, your optional comment, the extension version
  and the date, on `ashutosh-vijay.dev` (or `dataweave-studio.pages.dev`). To limit
  spam, a hash of your IP address and the date is kept for one day and then deleted.
  Comments appear on the [feedback page](https://ashutosh-vijay.dev/dataweave/feedback)
  after they have been read. The full details are in the
  [privacy policy](https://ashutosh-vijay.dev/dataweave/privacy).
- **Downloading a Java library.** Only when you ask the Java tester to fetch one from
  Maven Central (`repo1.maven.org`).

Extension updates come from the VS Code Marketplace and are covered by Microsoft's
policies.

## Data handled locally

- **Scripts, payloads, named inputs and flows** are kept in memory and in the
  workspace files you save. Workspaces go in the same folder the desktop app uses
  (for example `%LOCALAPPDATA%\com.dwstudio.desktop\workspaces` on Windows), so
  both see the same ones. Everything else stays in the extension's storage folder
  managed by VS Code.
- **Files** are read or written only when you choose them in a file dialog, for
  example to load a payload, export output or add a JAR.
- **Encryption keys** for the Secure Properties tool are held in memory only and
  never written to disk.

## Java runtime

The extension runs its own bundled Java runtime (JRE 17). It doesn't read, change or
depend on your system Java, `JAVA_HOME` or `PATH`.

## Third-party software

The bundled DataWeave runtime is published by MuleSoft/Salesforce. DataWeave Studio is
not affiliated with, endorsed by or sponsored by MuleSoft or Salesforce.

## Contact

Open an issue at https://github.com/Ashutosh-Vijay/DataWeave-Studio/issues or email
issues@ashutosh-vijay.dev.
