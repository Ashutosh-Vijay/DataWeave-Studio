// Safe mode is enforced by the engine's privilege checks (the `sandbox` request
// flag in DwServer). This proves the flag still reaches the engine: each script
// below needs a privilege, runs normally without the sandbox, and is refused
// with a privilege error inside it. An ordinary transform must work in both.
//
// Run: npm run test:sandbox
import { openEngine } from './dwEngine.mjs';

const H = '%dw 2.0\noutput application/json\n---\n';
const privileged = [
  ['eval', `%dw 2.0\nimport * from dw::Runtime\noutput application/json\n---\neval("main.dwl", {"main.dwl": "1 + 1"}, {})`, 'Execution'],
  ['Java interop', `%dw 2.0\nimport java!java::lang::Math\noutput application/json\n---\nMath::max(1, 2)`, 'Java'],
  ['readUrl', H + `sizeOf(readUrl("classpath://dw/core/Strings.dwl", "text/plain"))`, 'Resource'],
];
const ordinary = H + `payload map (o) -> { id: o.id, total: o.qty * o.price }`;

const dw = await openEngine({ quiet: true });
let failed = 0;
const check = (label, pass, detail) => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${pass ? '' : `: ${detail}`}`);
  if (!pass) failed++;
};

for (const sandbox of [false, true]) {
  const r = await dw.run(ordinary, { payload: '[{"id":1,"qty":2,"price":3}]', sandbox });
  check(`ordinary transform, sandbox ${sandbox ? 'on' : 'off'}`, r.ok, r.error);
}
for (const [label, script, privilege] of privileged) {
  const inside = await dw.run(script, { sandbox: true });
  check(`${label} refused in the sandbox`, !inside.ok && /SecurityPrivilegeViolation/.test(inside.error) && inside.error.includes(privilege), inside.error ?? inside.output);
  const outside = await dw.run(script, { sandbox: false });
  // readUrl of a classpath:// URL isn't supported by our URL service, so it
  // fails differently outside the sandbox; what matters is it isn't a privilege error.
  check(`${label} not blocked outside it`, outside.ok || !/SecurityPrivilegeViolation/.test(outside.error), outside.error);
}
dw.close();
process.exitCode = failed ? 1 : 0;
