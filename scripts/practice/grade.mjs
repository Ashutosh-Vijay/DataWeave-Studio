/**
 * Grading a submission.
 *
 * The 3.2 plan said "dw::test IS the grader". Reading the code says otherwise,
 * and the reason is written down in src/hooks/useTestRunner.ts: **a suite gets
 * no payload.** It is bound to `{}` on purpose, because MuleSoft's own
 * `dw::test` examples declare their fixtures inside the suite and a suite that
 * leans on an ambient payload runs here and nowhere else.
 *
 * A practice question is payload-in, output-out — which is precisely the shape
 * a suite cannot see. There is also no way for a suite to invoke the text of
 * somebody's mapping script: a script's body is not importable.
 *
 * So grading is what LeetCode actually does: run the submitted script once per
 * hidden case and compare the output. `dw::test` stays what it already is — a
 * feature of the app the practice set can teach, not the machinery underneath it.
 *
 * Comparison is semantic by default (parse, then deep-compare) so that
 * whitespace and formatting are not the thing that fails someone. A question
 * whose whole point is literal output — duplicate keys, key order, a CSV's
 * exact bytes — sets `compare: "text"` instead.
 */

/** Deep equality with array order significant and object key order ignored. */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
}

/**
 * Run `script` against every case and report the first failure.
 *
 * `cases[0]` is the sample shown with the question; the rest are hidden, and
 * they exist for one reason — a solution that hardcodes the sample's answer has
 * to fail on case two, or the question teaches nothing.
 */
export async function grade(dw, question, script) {
  const results = [];
  for (const [i, c] of question.cases.entries()) {
    const r = await dw.run(script, {
      payload: c.input,
      payloadMime: question.inputMime ?? 'application/json',
      outputMime: question.outputMime ?? 'application/json',
    });

    if (!r.ok) {
      results.push({ index: i, pass: false, hidden: i > 0, reason: 'error', error: r.error, ms: r.ms });
      break;
    }

    let pass;
    if ((question.compare ?? 'json') === 'text') {
      // Trailing-newline differences are not a wrong answer.
      pass = r.output.replace(/\r\n/g, '\n').trimEnd() === c.output.replace(/\r\n/g, '\n').trimEnd();
    } else {
      try {
        pass = deepEqual(JSON.parse(r.output), JSON.parse(c.output));
      } catch {
        pass = r.output.trim() === c.output.trim();
      }
    }

    results.push({ index: i, pass, hidden: i > 0, got: r.output, want: c.output, ms: r.ms });
    if (!pass) break;
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    solved: passed === question.cases.length,
    passed,
    total: question.cases.length,
    failure: results.find((r) => !r.pass) ?? null,
    ms: results.reduce((t, r) => t + (r.ms ?? 0), 0),
  };
}
