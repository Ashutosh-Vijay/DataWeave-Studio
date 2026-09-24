# Practice mode — the content pipeline

Offline, LeetCode-style DataWeave practice inside Studio. This folder is the
authoring side: the syllabus, the grader, and the gate that content has to pass
before it is allowed near the app. Nothing here ships — it produces the bundle
that does.

```
npm run practice:verify          # the gate — run before committing content
npm run practice:verify -- <id>  # just one question, while drafting it
npm run practice:bundle          # questions/*.json -> src/practiceQuestions.json
npm run practice:selftest        # proves the gate can still fail
node scripts/practice/dw.mjs <jobs.json>   # ask the engine a batch of things
```

## The one rule

**Nothing is true until this engine has run it.** Not the answers, not the
hidden cases, and not the snippets inside an explanation — including the ones
presented as the wrong way to do it. An explanation contains *more* code than
the answer does ("you could also write it as…"), and that code is exactly as
likely to be wrong.

`scripts/dwEngine.mjs` is how a script reaches the engine headlessly: the same
`dwstudio-server.jar` the app ships, over the same stdio protocol, from Node.

## Two things the plan had wrong

**1. `dw::test` is not the grader.** The plan said it was. The code says
otherwise, and `src/hooks/useTestRunner.ts` explains why: **a suite gets no
payload.** It is bound to `{}` deliberately, because MuleSoft's own `dw::test`
examples declare fixtures inside the suite, and a suite that leans on an ambient
payload runs here and nowhere else. A practice question is payload-in,
output-out — the one shape a suite cannot see — and a script's body is not
importable, so a suite cannot invoke a submission either.

So grading is what LeetCode actually does: run the submitted script once per
hidden case, compare the output. `dw::test` stays a feature of the
app that the practice set can *teach*, not the machinery underneath it.

**2. Writing traps from memory does not work, even with care.** Two of the
gotchas drafted for the syllabus were wrong, and the engine caught both:

- `YYYY` vs `yyyy` — real, but it diverges at the **end** of December
  (`|2026-12-31|` → `2026` / `2027`), not on 1 January, which is where the first
  draft put it.
- `[1] ++ 2` — drafted as a silent append. It is a compile error.

Both would have shipped as confident, wrong teaching. They are the reason
`curriculum.json` carries a `verified` array quoting actual engine output rather
than prose.

## The four checks

`verify-questions.mjs` refuses a question unless:

1. the reference solution passes every case;
2. every `mustFail` entry fails — so a hardcoded answer cannot pass, and the
   hidden cases have teeth;
3. every explanation snippet runs and returns **exactly** what the explanation
   claims (or errors, when it claims an error);
4. no DataWeave function or module named in prose is missing from the snippets
   that ran.

Check 4 is the "no name in prose unless it appeared in a snippet that ran" rule,
enforced instead of promised. It is precisely what would have caught
`import isOdd from dw::core::Numbers` — `isOdd` is in core, there is no such
import, and the engine says so in 3ms.

`selftest.mjs` breaks a good question in each of those four ways and asserts the
gate reports it. A verifier that has only ever printed "ok" is indistinguishable
from one that cannot fail.

## Layout

| file | what it is |
|---|---|
| `curriculum.json` | 40 units — the syllabus, picked up front so the set has coverage instead of forty variations on `map` |
| `questions/*.json` | one question each: `basics`, prompt, cases, hints, solution, `mustFail`, explanation |
| `verify-questions.mjs` | the gate. Runs under vite-node so it uses the APP's grader (`src/practiceGrading.ts`) rather than a second copy |
| `bundle.mjs` | collects the questions into the file the app imports; drops `mustFail` |
| `dw.mjs` | one-shot engine CLI for drafting — a batch of snippets, one JVM |
| `selftest.mjs` | proves the gate bites |
| `verify-traps*.mjs`, `probe-*.mjs` | how the engine facts were established |

## Every new question teaches the basics first

The set is ordered as a course, and somebody working through it may be meeting
`groupBy` — or `payload` — for the very first time. A question that assumes the
concept only teaches people who already knew it.

So a new question carries a **`basics`** field: a short primer, in plain words,
for someone who has never seen this idea. It renders above the task behind
*"New to this? Start here"*, collapsed by default (open on the Easy tier), so it
never gets in the way of someone who already knows.

Write it for a person heading towards a MuleSoft certification who has not
written DataWeave before. Say what the thing *is* and what it is *for* before
any trap or subtlety — those belong in the explanation, after they have tried.

It is prose, so **check 4 applies to it**: any function it names must appear in
a snippet that ran.

The original 40 predate this and do not have one. That is fine and they are not
being retrofitted; the gate prints a note rather than failing. New ones should
have it.

## Question shape

`cases[0]` is the sample shown with the question; the rest are hidden. Comparison
is semantic by default — parse, then deep-compare, so formatting is never the
thing that fails someone. A question whose point *is* the literal output
(duplicate keys, key order, a CSV's exact bytes) sets `"compare": "text"`.

## Drafting

The syllabus is fixed first, then each unit is drafted against **one** seed —
either a cookbook recipe (`dw_cookbook.json`, 172 of them, already verified
against this engine) or one function-reference entry (`dw_functions.json`, 361).
An open brief produces forty variations on `groupBy`. Read those files directly;
they are on disk, and a round trip through MCP to fetch them buys nothing. The
MCP and the engine are for the part that needs a running engine: validation.

A draft that fails the gate is **discarded, not repaired**. Repairing invites a
model to argue with the engine.
