# Changelog

All notable changes to DataWeave Studio for VS Code.

## 0.0.6 — 2026-06-13

**Test Java, wire up property config, and a more resilient engine.**

- **New Java tester.** Compile your own `src/main/java` classes (or add a library JAR from disk / fetch one from Maven Central) and call them from DataWeave against a sample payload — see the result, or the compile error inline. Open it from the sidebar rail or the Tools menu.
- **Config & secure properties in the Flow Designer.** The flow's Input panel now takes **Config** and **Secure Config** YAML (plus a decryption key for `![…]` values); `${key}` / `${secure::key}` placeholders resolve on every node run.
- **`p()` just works.** Pasted Mule scripts using `p("key")` / `Mule::p(...)` now run directly — resolved against your config automatically. (The one-click convert to `${...}` is still there, and now quotes the value and drops a dead `import p from Mule`.)
- **Compare tool:** a word-wrap toggle.
- **Output:** the code-folding controls are always visible now.
- **Flow Designer:** `Ctrl/Cmd+S` saves the *flow* (not the single-script workspace); Flow References work inside scopes.
- **More resilient engine:** it self-heals if the Java process dies, instead of getting stuck on "server not running".

## 0.0.5 — 2026-06-11

**Redesigned layout — it now reads the way DataWeave works.**

- **Input → Script → Output flow.** The workspace now lays out left-to-right the way you think about a transform: your **payload and context** (request attributes, variables, config) sit together on the left, the **script** in the middle, the **output** on the right. Previously the transform led and inputs were split around it.
- **New Playground layout** (formerly "Focus"). A clean three-pane view like the online DataWeave playground — and, unlike before, it now has full access to **Settings** and every tool. Switch layouts anytime from the top bar, or with `Ctrl/Cmd+Shift+1` (Workbench) and `Ctrl/Cmd+Shift+2` (Playground).
- **Tools menu + Settings in the top bar.** The function reference, cookbook, flow designer, secure-properties tool, cURL import, snippets, and keyboard-shortcut list are now one click away in either layout.

## 0.0.4 — 2026-06-10

- Fixed **paste** in the script and input editors — `Ctrl+V`, right-click → Paste, and `Shift+Insert` now work everywhere.

## 0.0.3 — 2026-06-10

- Fixed the **Find widget** (`Ctrl+F`): the close button no longer flickers and is reliably clickable.

## 0.0.2 — 2026-06-10

- Polished the Marketplace listing and documentation.

## 0.0.1 — 2026-06-10

- First release. The real **DataWeave 2.11** engine inside VS Code — run, test, and design MuleSoft transforms, fully offline, with a bundled Java runtime. No Anypoint Studio, no Maven project required.
