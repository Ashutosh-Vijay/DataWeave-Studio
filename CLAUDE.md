## graphify

This project has a knowledge graph at graphify-out/ with cross-file symbol relationships (calls, imports, type references). It is **good at one specific thing and bad at others** — use it accordingly, don't run it reflexively.

**Use graphify for symbol-relationship questions** (where it beats ripgrep): you can *name* a function/type and want its neighborhood.
- `graphify query "<symbol>"` → the definition **plus** what it calls, what types it touches, and who imports it, in one shot. Saves the grep-the-symbol-then-grep-each-callsite dance.
- `graphify path "<A>" "<B>"` → how two symbols connect.
- `graphify explain "<concept>"` → a focused subgraph for a concept.

**Use ripgrep (Grep), not graphify, for:**
- "Where does behavior X live?" phrased in English (e.g. "where is the loopback port bound"). graphify seeds its search from the literal words you type, so if the answer is in a function not named that, it whiffs — a keyword grep (`bind`, `127.0.0.1`) wins.
- Single "where is this defined" lookups — one grep is cheaper than a query (each query spends ~2k tokens of budget).

**Maintenance:** after editing code, run `graphify update .` (AST-only, no API cost, ~seconds). Read graphify-out/GRAPH_REPORT.md only for broad architecture review. `.graphifyignore` must exclude generated bundles (`vscode-extension/webview-dist/`, `dist/`) — a Vite production bundle slipping in once bloated the graph from 3.4 MB to 21 MB of minified-symbol noise and broke queries.
