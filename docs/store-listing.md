# Microsoft Store listing

Store ID: 9NWD4L4J7D92 · Listing: https://apps.microsoft.com/detail/9NWD4L4J7D92

**LIVE on the Microsoft Store since 2026-08-24** (submission 1, first attempt, 2.4.0.0).

---

## Category
Developer tools

## Listing text: updated automatically

The short description, description, key features and search terms live in
[`store-listing.json`](store-listing.json). The "What's new in this version" text is
that version's entry in [`src/releases.json`](../src/releases.json), the same notes the
app's What's New shows (desktop items only).

On every `v*` tag, [`.github/workflows/store.yml`](../.github/workflows/store.yml)
uploads the package as a draft, applies all of that with
[`scripts/store-listing.mjs`](../scripts/store-listing.mjs), then submits it. Edit the
JSON, not Partner Center, or the next release will overwrite your change.

Not covered: the category, the support contact, the privacy URL and the restricted
capability justification below. Those rarely change and stay manual.

## Support contact
issues@ashutosh-vijay.dev

## Privacy policy URL
https://ashutosh-vijay.dev/dataweave/privacy

---

## Submission options: restricted capability justification

Paste this into the "Restricted capabilities" explanation for runFullTrust.
NOTE: the field caps at 500 characters, so this is the trimmed version.

Win32 desktop app packaged as MSIX; runFullTrust is required for it to run at all. It launches its bundled Java runtime as a child process to run DataWeave transforms locally, compiles user-supplied Java sources with the bundled javac, and binds a loopback-only port (127.0.0.1) for an optional local MCP server that AI coding assistants on the same machine can call. It does not need network access to work: it only goes online when the user sends feedback or asks it to download a Java library.

---

## Screenshots (minimum 1, at least 1366x768)
Suggested set:
1. Workbench: payload on the left, script centre, result right
2. Message Flow designer with a flow laid out
3. OpenAPI reader with a spec open
4. MCP server panel showing "Server is live"
