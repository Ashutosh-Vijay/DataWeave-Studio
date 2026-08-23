# Microsoft Store listing — copy/paste source

Store ID: 9NWD4L4J7D92 · Listing: https://apps.microsoft.com/detail/9NWD4L4J7D92

---

## Category
Developer tools

## Short description (used in search results)
Write, run and debug DataWeave 2.0 transforms locally — with the real MuleSoft
engine built in. Free, offline, no Anypoint Studio required.

---

## Description

DataWeave Studio is a fast, local workbench for DataWeave 2.0. It runs the real
MuleSoft DataWeave 2.11 engine on your own machine, so you get authentic output and
authentic error messages — not an approximation — without booting Anypoint Studio or
creating a Maven project.

Paste a payload, write a script, press Run. That's the whole loop.

Everything happens on your computer. There is no account, no sign-up, no telemetry,
and no cloud. Your scripts and data never leave your machine, which means you can
safely use it with production payloads.

WHAT'S INSIDE

• Instant transforms — a warm engine returns results in milliseconds, with inline
  error line and column when something's wrong.
• Any format — JSON, XML, CSV, YAML, NDJSON, Excel, form-urlencoded, multipart and
  more, as both input and output.
• Message Flow designer — chain transforms together with mock Salesforce, Database
  and HTTP connectors, and import real Mule flow XML to test it locally.
• Java tester — compile your own Java classes and call them from DataWeave, exactly
  as a Mule app would.
• OpenAPI / Swagger reader — open a spec and turn any request, response or example
  into a ready-to-edit sample payload plus a DataWeave skeleton.
• Built-in MCP server — let AI assistants in Claude Code, Cursor or GitHub Copilot
  validate DataWeave against the real engine before handing you code. Free, local,
  and off unless you start it.
• Share a whole setup in one link — script, payload, variables and headers travel
  inside the URL itself, so a colleague opens it and presses Run. The data rides in the
  part of a URL browsers never send to a server, so nothing is uploaded to create one.
• Secure properties — encrypt and decrypt MuleSoft secure-property values.
• Compare — side-by-side diff for payloads and Mule XML, with an option to ignore
  the generated doc:id and UUID noise.
• Workspaces — organise related requests together, search inside them, and pick up
  where you left off.
• Function reference and cookbook — every DataWeave function and a library of
  worked recipes, searchable, offline.

Bundled with its own Java runtime, so there is nothing else to install.

Free and open source (MIT): https://github.com/Ashutosh-Vijay/DataWeave-Studio

---

## Key features (short bullets for the listing form)
1. Runs the real MuleSoft DataWeave 2.11 engine locally
2. Works fully offline — no account, no telemetry, no cloud
3. Results in milliseconds, with inline error line and column
4. JSON, XML, CSV, YAML, Excel, multipart and more
5. Message Flow designer with mock Salesforce/Database/HTTP connectors
6. Built-in MCP server so AI assistants can validate DataWeave for real
7. OpenAPI/Swagger reader generates sample payloads and DataWeave
8. Java tester — call your own Java classes from DataWeave
9. Offline function reference and cookbook
10. Share a whole setup in one link — nothing is uploaded
11. Free and open source (MIT)

## Search terms
(max 7 terms — avoid words already in the product name)
mulesoft
dataweave playground
dwl
mule esb
anypoint
json to xml
integration

## Support contact
issues@ashutosh-vijay.dev

## Privacy policy URL
https://ashutosh-vijay.dev/dataweave/privacy

---

## Submission options — restricted capability justification

Paste this into the "Restricted capabilities" explanation for runFullTrust:

DataWeave Studio is a Win32 desktop application packaged as MSIX, so runFullTrust is
required for it to run at all. Specifically, the app launches its bundled Java
runtime as a child process to execute DataWeave transformations locally, compiles
user-supplied Java sources with the bundled javac, and binds a loopback-only port
(127.0.0.1) for an optional local MCP server that AI coding assistants on the same
machine can call. No data is transmitted off the device and the app requires no
network access to function.

---

## Screenshots (minimum 1, at least 1366x768)
Suggested set:
1. Workbench — payload on the left, script centre, result right
2. Message Flow designer with a flow laid out
3. OpenAPI reader with a spec open
4. MCP server panel showing "Server is live"
