// Loads the Web Image build in Node and pushes a few requests through dwHandle.
// Usage: node web-wasm/smoke-test.cjs   (after npm run build:wasm)
const fs = require('fs');
const path = require('path');

// The package is "type": "module", so Node needs a .cjs copy of the launcher,
// and the launcher looks for its module at its own name + ".wasm".
const target = path.join(__dirname, 'target');
const cjs = path.join(target, 'dwengine.cjs');
fs.copyFileSync(path.join(target, 'dwengine.js'), cjs);
fs.rmSync(cjs + '.wasm', { force: true });
fs.copyFileSync(path.join(target, 'dwengine.js.wasm'), cjs + '.wasm');

const cases = [
  {
    name: 'json transform',
    req: {
      id: 1,
      script: '%dw 2.0\ninput payload application/json\noutput application/json\n---\n{ n: sizeOf(payload.x), up: upper("hi"), total: sum(payload.x) }',
      payloadContent: '{"x":[1,2,3]}',
      payloadMime: 'application/json',
    },
    expect: (r) => r.ok && JSON.parse(r.output).total === 6,
  },
  {
    name: 'csv -> xml with vars',
    req: {
      id: 2,
      script: '%dw 2.0\ninput payload application/csv\ninput vars application/json\noutput application/xml\n---\nrows: { (payload map (r) -> row: { name: r.name, tag: vars.tag }) }',
      payloadContent: 'name,age\nann,30\nbob,40\n',
      payloadMime: 'application/csv',
      varsContent: '{"tag":"t1"}',
    },
    expect: (r) => r.ok && r.output.includes('<name>bob</name>') && r.output.includes('<tag>t1</tag>'),
  },
  {
    name: 'format',
    req: { id: 3, op: 'format', script: '%dw 2.0\noutput application/json\n---\n{a:1,b:[1,2]}' },
    expect: (r) => r.ok && r.output.length > 0,
  },
  {
    name: 'compile error is reported, not thrown',
    req: { id: 4, script: '%dw 2.0\noutput application/json\n---\n{ a: nope(1) }', payloadContent: '{}', payloadMime: 'application/json' },
    expect: (r) => !r.ok && /nope/.test(r.error || ''),
  },
  {
    name: 'yaml input',
    req: {
      id: 5,
      script: '%dw 2.0\ninput payload application/yaml\noutput application/json\n---\npayload.app.name',
      payloadContent: 'app:\n  name: studio\n',
      payloadMime: 'application/yaml',
    },
    expect: (r) => r.ok && r.output.includes('studio'),
  },
  {
    name: 'tooling completion',
    req: { id: 6, op: 'tooling', kind: 'completion', script: '%dw 2.0\noutput application/json\n---\nupp', offset: 39, payload: '' },
    expect: (r) => r.ok && JSON.stringify(r.result || '').includes('upper'),
  },
  {
    name: 'secure properties round trip',
    req: { id: 7, op: 'secureProps', operation: 'encrypt', algorithm: 'AES', mode: 'CBC', key: '1234567890123456', values: ['s3cret'], useRandomIv: false },
    expect: (r) => {
      if (!r.ok || !r.results || !r.results[0]) return false;
      const back = JSON.parse(globalThis.dwHandle(JSON.stringify({ id: 8, op: 'secureProps', operation: 'decrypt', algorithm: 'AES', mode: 'CBC', key: '1234567890123456', values: [r.results[0]], useRandomIv: false })));
      return back.ok && back.results[0] === 's3cret';
    },
  },
  {
    name: 'traced run reports the real parse error',
    req: { id: 9, script: '%dw 2.0\noutput application/json\n---\npayload groupBy $.dept', payloadContent: '{\n[{"dept":"eng"}]\n}', payloadMime: 'application/json', valueTrace: true, trace: true },
    expect: (r) => !r.ok && /Unexpected character '\['/.test(r.error || '') && Array.isArray(r.trace),
  },
];

globalThis.onDwReady = (version) => {
  console.log('engine ready, DataWeave', version);  let failed = 0;
  for (const c of cases) {
    const t0 = Date.now();
    let r;
    try {
      r = JSON.parse(globalThis.dwHandle(JSON.stringify(c.req)));
    } catch (e) {
      r = { ok: false, error: 'THROWN: ' + e };
    }
    const pass = c.expect(r);
    if (!pass) failed++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.name}  (${Date.now() - t0} ms)`);
    if (!pass) console.log('   ', JSON.stringify(r).slice(0, 1500));
  }
  process.exitCode = failed ? 1 : 0;
};

require(cjs);
