#!/usr/bin/env python3
"""
Run one DataWeave script over many rows of real data, using the DataWeave
Studio desktop app as the engine. No Mule app, no deployed endpoint.

WHY THIS EXISTS
    Testing a transform against production-shaped data normally means
    publishing an API just to exercise it. But the engine is already running
    locally — DataWeave Studio exposes it on loopback, so a script can feed it
    directly. Crucially this is the REAL DataWeave 2.11 engine running the exact
    .dwl you will ship, not a Python reimplementation that drifts from it.

SETUP
    1. Open DataWeave Studio.
    2. Left rail -> MCP Server -> Start server.  (Default port 4675.)
    3. pip install requests
    4. python dw_backtest.py --script extract.dwl --csv rows.csv

INPUT CSV
    Any columns you like. Each row becomes DataWeave `vars`, so a column named
    `templateMessage` is `vars.templateMessage` in the script. Use --payload-col
    if one column should be the `payload` instead.

OUTPUT
    A summary, plus failures.json holding every row whose result was not a
    success — with the input that produced it, so a failure is reproducible.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from typing import Any

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

DEFAULT_URL = "http://127.0.0.1:4675/run"

# The engine compiles the script once and caches it, so only the first row pays
# the ~1s compile. Batches keep one HTTP round-trip from dominating, while
# staying small enough that a failure doesn't cost the whole run.
BATCH_SIZE = 200


def load_rows(path: str, payload_col: str | None) -> list[dict[str, Any]]:
    """CSV -> the request's `rows`. Every column becomes a var, except the
    payload column if one was named."""
    rows: list[dict[str, Any]] = []
    with open(path, encoding="utf-8-sig") as f:  # -sig: Excel writes a BOM
        for record in csv.DictReader(f):
            row: dict[str, Any] = {}
            if payload_col:
                row["payload"] = record.pop(payload_col, "")
            row["vars"] = {k: v for k, v in record.items() if k}
            rows.append(row)
    return rows


def run(url: str, script: str, rows: list[dict[str, Any]], mime: str) -> list[dict[str, Any]]:
    """POST in batches. Returns one result per input row, in order."""
    results: list[dict[str, Any]] = []
    for start in range(0, len(rows), BATCH_SIZE):
        chunk = rows[start : start + BATCH_SIZE]
        try:
            resp = requests.post(
                url,
                json={"script": script, "payloadMime": mime, "rows": chunk},
                timeout=300,
            )
        except requests.ConnectionError:
            sys.exit(
                f"Couldn't reach {url}.\n"
                "Open DataWeave Studio, then MCP Server in the left rail, then Start server."
            )
        if resp.status_code != 200:
            sys.exit(f"HTTP {resp.status_code}: {resp.text[:400]}")

        body = resp.json()
        # `rows` always comes back as `results`; a single run comes back flat.
        results.extend(body.get("results") or [body])
        print(f"  {min(start + BATCH_SIZE, len(rows))}/{len(rows)}", end="\r", flush=True)
    print()
    return results


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--script", required=True, help="path to the .dwl file")
    ap.add_argument("--csv", required=True, help="path to the input CSV")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--payload-col", help="CSV column to send as `payload` instead of a var")
    ap.add_argument("--mime", default="application/json", help="MIME type of the payload")
    ap.add_argument(
        "--fail-key",
        default="matched",
        help="a boolean field in the script's output that means 'this row is fine' "
        "(default: matched). Use --fail-key '' if the script has no such field.",
    )
    ap.add_argument("--group-by", default="templateId", help="output field to cluster failures by")
    args = ap.parse_args()

    script = open(args.script, encoding="utf-8").read()
    rows = load_rows(args.csv, args.payload_col)
    print(f"{len(rows)} rows -> {args.url}")

    results = run(args.url, script, rows, args.mime)

    errors: list[dict[str, Any]] = []   # the script itself failed to run
    failures: list[dict[str, Any]] = [] # it ran, but the row didn't pass
    parsed_ok = 0

    for row, result in zip(rows, results):
        if not result.get("ok"):
            errors.append({"input": row, "error": result.get("error")})
            continue
        try:
            out = json.loads(result["output"])
        except json.JSONDecodeError:
            # Non-JSON output (XML, CSV, plain text) — nothing to assert on.
            parsed_ok += 1
            continue
        parsed_ok += 1
        if args.fail_key and out.get(args.fail_key) is False:
            failures.append({"input": row, "output": out})

    total = len(results)
    print(f"\nran        {parsed_ok}/{total}")
    if errors:
        print(f"ERRORED    {len(errors)}  (the script didn't run — see failures.json)")
        # One example up front: usually every error is the same compile problem.
        print(f"  first: {str(errors[0]['error'])[:200]}")
    if args.fail_key:
        pct = len(failures) / total * 100 if total else 0
        print(f"failed     {len(failures)}  ({pct:.1f}%)")

    # Clustering is the real payoff. Failures concentrated in one id means one
    # bad data row; failures spread evenly mean a logic gap.
    if failures and args.group_by:
        counts = Counter(
            f["output"].get(args.group_by) or f["input"]["vars"].get(args.group_by, "?")
            for f in failures
        )
        print(f"\ntop failing {args.group_by}:")
        for key, n in counts.most_common(15):
            print(f"  {n:5}  {key}")

    if failures or errors:
        with open("failures.json", "w", encoding="utf-8") as f:
            json.dump({"errors": errors, "failures": failures}, f, ensure_ascii=False, indent=2)
        print("\nwrote failures.json")


if __name__ == "__main__":
    main()
