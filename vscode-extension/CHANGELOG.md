# Changelog

All notable changes to DataWeave Studio for VS Code.

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
