# Privacy Policy — DataWeave Studio

**Last updated: 22 August 2026**

DataWeave Studio does not collect, transmit, or store any personal data. There is
no account, no sign-up, no telemetry, and no analytics of any kind.

## What stays on your device

Everything you work with stays on your machine:

- Your DataWeave scripts, payloads, sample data, and test cases
- Saved workspaces, custom modules, and snippets
- Encryption keys and secure-property values you enter
- Configuration, settings, and logs

Transformations run on a DataWeave engine bundled inside the app. Your scripts and
data are never uploaded anywhere, and the developer has no ability to see them.

## When the app uses the internet

The app is fully usable offline. It makes network requests in only three cases,
none of which include your scripts, data, or any identifying information:

1. **Checking for updates** — the desktop app asks a static file on
   `ashutosh-vijay.dev` (or `dataweave-studio.pages.dev`) whether a newer version
   exists. You can turn this off in **Settings → Advanced**.
   *This is disabled entirely in the Microsoft Store version*, where Windows
   handles updates.
2. **Downloading a Java library** — only when you explicitly ask the Java tester to
   fetch a library from Maven Central (`repo1.maven.org`).
3. **Opening a link you clicked** — for example "Send feedback", which opens a
   pre-filled GitHub issue in your normal browser. Nothing is sent automatically;
   you decide what to submit.

## The built-in MCP server

DataWeave Studio can run a local MCP server so AI coding assistants on your machine
can validate DataWeave scripts against the real engine. When you start it:

- It listens on `127.0.0.1` (your machine only) and is never exposed to your network
- It is **off by default** and only runs while you choose to run it
- Scripts sent to it are executed locally and are not transmitted anywhere

## Third parties and children

There are no third-party analytics, advertising, tracking, or data-sharing services
in this application. No data is sold or shared, because none is collected. The app
is a developer tool and is not directed at children.

## Your rights

Because no personal data is collected, there is nothing to request, correct, or
delete. Data you create lives on your own device, and you can remove it at any time
by deleting your workspaces or uninstalling the app.

## Contact

Questions about this policy: **issues@ashutosh-vijay.dev**

Source code: https://github.com/Ashutosh-Vijay/DataWeave-Studio

## Changes

If this policy changes, the updated version will be posted at this URL with a new
"last updated" date.
