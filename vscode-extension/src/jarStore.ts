/**
 * Node port of src-tauri/src/jars.rs for the VS Code extension host.
 *
 * Managed JARs (file picker + Maven Central) and Java-source compilation live
 * under the extension's global storage. Mirrors the desktop command surface so
 * the shared Java tester UI works unchanged in the webview.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { spawnSync } from 'child_process';

export interface JarInfo { path: string; filename: string; sizeBytes: number; }
interface JavaSource { name: string; content: string; }
export interface CompileResult { ok: boolean; classesDir: string; diagnostics: string; }

function jarsDir(storageDir: string): string {
  const dir = path.join(storageDir, 'jars');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jarInfo(p: string): JarInfo {
  let sizeBytes = 0;
  try { sizeBytes = fs.statSync(p).size; } catch { /* ignore */ }
  return { path: p, filename: path.basename(p), sizeBytes };
}

export function getJarsDir(storageDir: string): string {
  return jarsDir(storageDir);
}

export function listManagedJars(storageDir: string): JarInfo[] {
  const dir = jarsDir(storageDir);
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .filter((n) => n.toLowerCase().endsWith('.jar'))
    .map((n) => jarInfo(path.join(dir, n)))
    .sort((a, b) => a.filename.toLowerCase().localeCompare(b.filename.toLowerCase()));
}

export function importJarFile(storageDir: string, srcPath: string): JarInfo {
  if (!srcPath.toLowerCase().endsWith('.jar')) throw new Error('Not a .jar file.');
  const dest = path.join(jarsDir(storageDir), path.basename(srcPath));
  fs.copyFileSync(srcPath, dest);
  return jarInfo(dest);
}

export function removeManagedJar(storageDir: string, p: string): void {
  const dir = path.resolve(jarsDir(storageDir));
  if (!path.resolve(p).startsWith(dir)) throw new Error('Refusing to delete a file outside the managed jars folder.');
  try {
    fs.unlinkSync(p);
  } catch (e: any) {
    if (e && (e.code === 'EBUSY' || e.code === 'EPERM')) {
      throw new Error("Can't remove — the engine has this JAR loaded. Restart the engine, then remove it.");
    }
    throw new Error(`Failed to remove JAR: ${e?.message ?? e}`);
  }
}

function httpGet(url: string, redirects = 0): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirects < 5) {
        res.resume();
        resolve(httpGet(new URL(res.headers.location, url).toString(), redirects + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () => resolve({ status, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

export async function downloadMavenJar(storageDir: string, group: string, artifact: string, version: string): Promise<JarInfo> {
  group = (group || '').trim(); artifact = (artifact || '').trim(); version = (version || '').trim();
  if (!group || !artifact || !version) throw new Error('group, artifact and version are all required.');
  const url = `https://repo1.maven.org/maven2/${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
  let res: { status: number; body: Buffer };
  try { res = await httpGet(url); } catch (e: any) { throw new Error(`Download failed: ${e?.message ?? e}`); }
  if (res.status === 404) throw new Error(`Not found on Maven Central: ${group}:${artifact}:${version}`);
  if (res.status !== 200) throw new Error(`Maven Central returned HTTP ${res.status}`);
  if (res.body.length < 4 || res.body[0] !== 0x50 || res.body[1] !== 0x4b) {
    throw new Error('Downloaded file is not a valid JAR (zip) archive.');
  }
  const dest = path.join(jarsDir(storageDir), `${artifact}-${version}.jar`);
  fs.writeFileSync(dest, res.body);
  return jarInfo(dest);
}

/** Resolve `javac` — bundled (sibling of the bundled java), else JAVA_HOME, else PATH. */
function resolveJavac(extensionRoot: string): string {
  const exe = process.platform === 'win32' ? 'javac.exe' : 'javac';
  const bundled = path.join(extensionRoot, 'resources', 'jre', 'bin', exe);
  if (fs.existsSync(bundled)) return bundled;
  const home = process.env.JAVA_HOME;
  if (home) {
    const p = path.join(home, 'bin', exe);
    if (fs.existsSync(p)) return p;
  }
  return 'javac';
}

export function compileJava(storageDir: string, extensionRoot: string, sources: JavaSource[], classpath: string[]): CompileResult {
  if (!sources || sources.length === 0) throw new Error('No Java sources to compile.');
  const work = path.join(storageDir, 'java', Date.now().toString());
  const srcDir = path.join(work, 'src');
  const classesDir = path.join(work, 'classes');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(classesDir, { recursive: true });

  const files: string[] = [];
  for (const s of sources) {
    const fname = /\.java$/i.test(s.name) ? s.name : `${s.name}.java`;
    const fp = path.join(srcDir, fname);
    fs.writeFileSync(fp, s.content);
    files.push(fp);
  }

  const javac = resolveJavac(extensionRoot);
  const sep = process.platform === 'win32' ? ';' : ':';
  // Target the engine's Java 17 runtime (class-file major 61) — a newer system
  // javac (e.g. JDK 21 → class 65) otherwise produces classes the JRE can't load.
  // -encoding UTF-8: we write the .java files as UTF-8, but javac reads them with
  // the platform default charset on Java ≤17, mangling non-ASCII literals/comments.
  const args = ['-source', '17', '-target', '17', '-Xlint:-options', '-encoding', 'UTF-8', '-d', classesDir];
  if (classpath && classpath.length > 0) args.push('-cp', classpath.join(sep));
  args.push(...files);

  const r = spawnSync(javac, args, { windowsHide: true, encoding: 'utf8' });
  if (r.error) throw new Error(`Couldn't run javac (${javac}): ${r.error.message}`);
  const diagnostics = `${r.stderr || ''}${r.stdout || ''}`.trim();
  return { ok: r.status === 0, classesDir, diagnostics };
}
