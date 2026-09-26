#!/usr/bin/env node
// Builds the DataWeave engine as a WebAssembly module with GraalVM Web Image.
//
// Needs Oracle GraalVM 25.1+ (JAVA_HOME), Maven, and binaryen's wasm-as on PATH.
// Output: web-wasm/target/dwengine.js + dwengine.js.wasm, which
// vite.config.web.ts serves and bundles under wasm/.
//
// Environment:
//   SKIP_MVN=1             reuse dw-server/target/dwstudio-server.jar
//   MVN_OFFLINE=1          mvn -o
//   MVN_SETTINGS=<file>    mvn -s <file>
//   NATIVE_IMAGE_ARGS      extra native-image flags, e.g. "-Ob" for a quick build
//
// Plain Node so the same build runs on Linux, macOS and Windows.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const OUT = path.join(HERE, "target");
const JAR = path.join(ROOT, "dw-server", "target", "dwstudio-server.jar");
const SECURE_JAR = path.join(ROOT, "src-tauri", "resources", "secure-properties", "secure-properties-tool.jar");
const WIN = process.platform === "win32";

const JAVA_HOME = process.env.JAVA_HOME;
if (!JAVA_HOME) fail("Set JAVA_HOME to an Oracle GraalVM 25.1+ install");
if (!onPath("wasm-as")) fail("wasm-as (binaryen) not found on PATH");

// On Windows native-image and mvn are .cmd batch files, which Node only runs
// through a shell; see run().
const jdkTool = (name, winExt = ".exe") => path.join(JAVA_HOME, "bin", name + (WIN ? winExt : ""));

if (process.env.SKIP_MVN !== "1") {
  const args = ["-B", "-q"];
  if (process.env.MVN_OFFLINE) args.push("-o");
  if (process.env.MVN_SETTINGS) args.push("-s", process.env.MVN_SETTINGS);
  run(WIN ? "mvn.cmd" : "mvn", [...args, "-DskipTests", "package"], path.join(ROOT, "dw-server"));
}

const classes = path.join(OUT, "classes");
fs.rmSync(classes, { recursive: true, force: true });
fs.mkdirSync(classes, { recursive: true });
run(jdkTool("javac"), [
  "--add-modules", "org.graalvm.webimage.api", "-parameters",
  "-cp", JAR, "-d", classes,
  ...javaSources(path.join(HERE, "src")),
]);

// DwServer drives secure-properties-tool.jar purely by reflection.
const listing = run(jdkTool("jar"), ["tf", SECURE_JAR], ROOT, true);
const reflected = listing.split(/\r?\n/)
  .filter((e) => /^(com\/mulesoft|org\/mule\/encryption)\/.*\.class$/.test(e))
  .map((e) => ({
    name: e.replace(/\.class$/, "").replace(/\//g, "."),
    allDeclaredConstructors: true, allPublicConstructors: true,
    allDeclaredMethods: true, allPublicMethods: true,
  }));
const reflectConfig = path.join(OUT, "reflect-config.json");
fs.writeFileSync(reflectConfig, JSON.stringify(reflected, null, 1));

run(jdkTool("native-image", ".cmd"), [
  "--tool:svm-wasm",
  "-cp", [classes, JAR, SECURE_JAR].join(path.delimiter),
  "-H:+UnlockExperimentalVMOptions",
  "-H:IncludeResources=.*\\.(dwl|properties|json|yaml|yml|xml|xsd|txt|proto|csv)$",
  `-H:ReflectionConfigurationFiles=${reflectConfig}`,
  "-H:-UnlockExperimentalVMOptions",
  "--no-fallback",
  ...(process.env.NATIVE_IMAGE_ARGS ?? "").split(/\s+/).filter(Boolean),
  "-o", "dwengine",
  "com.dwstudio.WasmMain",
], OUT);

for (const f of ["dwengine.js", "dwengine.js.wasm"]) {
  const size = fs.statSync(path.join(OUT, f)).size;
  console.log(`${f}  ${(size / 1048576).toFixed(1)} MB`);
}

function run(cmd, args, cwd = ROOT, capture = false) {
  const shell = WIN && cmd.endsWith(".cmd");
  const r = spawnSync(shell ? quote(cmd) : cmd, shell ? args.map(quote) : args, {
    cwd, shell, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (r.error) fail(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) fail(`${path.basename(cmd)} exited with ${r.status}`);
  return r.stdout;
}

// cmd.exe treats | & < > ^ as operators unless the argument is double-quoted.
function quote(a) {
  return /[\s"|&<>^()%!]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a;
}

function javaSources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? javaSources(p) : d.name.endsWith(".java") ? [p] : [];
  });
}

function onPath(name) {
  const exts = WIN ? (process.env.PATHEXT ?? ".EXE").split(";") : [""];
  return (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)
    .some((d) => exts.some((e) => fs.existsSync(path.join(d, name + e))));
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
