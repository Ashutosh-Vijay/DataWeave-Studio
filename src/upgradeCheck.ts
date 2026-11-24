/**
 * The Upgrade check itself, shared by the Upgrade check screen, the desktop MCP
 * tool (which asks the app window to run it) and the VS Code extension's MCP
 * server. Each caller passes its own way to fetch, list and read files and to
 * reach the engine; everything else is here so the three never disagree.
 *
 * Each version is the real engine, resolved from MuleSoft's repository and
 * loaded by the engine server into its own classloader (op=engineCheck).
 * Compile only: syntax, imports, types and functions, not output on real data.
 */
import { resolveDependencies, type Coord } from './maven';
import { findInlineScripts } from './muleInline';

const CENTRAL = 'https://repo1.maven.org/maven2';
const MULE_REPO = 'https://repository.mulesoft.org/nexus/content/repositories/releases';

export type Status = 'breaks' | 'fixed' | 'both' | 'ok';
export interface Item { key: string; script: string; path: string; project: string; file: string; test: boolean; index?: number; flow?: string; target?: string }
export interface Outcome { ok: boolean; error?: string; line?: number }
export interface Row extends Item { status: Status; from?: Outcome; to?: Outcome }

export interface UpgradeIO {
  fetchText: (url: string) => Promise<string>;
  /** Paths relative to `dir`: .dwl files and flow XML under src/main/mule. */
  listFiles: (dir: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
  engineCheck: (request: { jars: Coord[]; items: { key: string; script: string; path: string }[] }) => Promise<{ results: (Outcome & { key: string })[]; problems: string[] }>;
}

export const STATUS_LABEL: Record<Status, string> = { breaks: 'Breaks', fixed: 'Fixed by upgrade', both: 'Fails on both', ok: 'OK' };

/** Mule 4.x ships DataWeave 2.x. */
export const muleOf = (dw: string) => `Mule 4.${dw.split('.')[1]}`;

// A released POM never changes, so a second check doesn't ask again.
const pomCache = new Map<string, Promise<string>>();
/** The resolver asks Maven Central; DataWeave's own artifacts live in
 *  MuleSoft's repository, so try that first for every request. */
function cachedFetch(io: UpgradeIO, url: string): Promise<string> {
  let p = pomCache.get(url);
  if (!p) {
    p = io.fetchText(url.replace(CENTRAL, MULE_REPO)).catch(() => io.fetchText(url));
    p.catch(() => pomCache.delete(url));
    if (!url.endsWith('maven-metadata.xml')) pomCache.set(url, p);
  }
  return p;
}

/** Every released DataWeave version, newest first (plain x.y.z only). */
export async function dwVersions(io: UpgradeIO): Promise<string[]> {
  const xml = await cachedFetch(io, `${CENTRAL}/org/mule/weave/runtime/maven-metadata.xml`);
  const all = [...xml.matchAll(/<version>(\d+\.\d+\.\d+)<\/version>/g)].map((m) => m[1]);
  return [...new Set(all)].filter((v) => v.startsWith('2.')).sort((a, b) => {
    const [, am, ap] = a.split('.').map(Number); const [, bm, bp] = b.split('.').map(Number);
    return bm - am || bp - ap;
  });
}

/** "4.4", "Mule 4.9", "2.4" and "2.4.0" all name a version; a line picks its latest patch. */
export function pickVersion(versions: string[], want: string): string | null {
  const w = want.trim().replace(/^mule\s*/i, '');
  if (versions.includes(w)) return w;
  const line = w.match(/^4\.(\d+)$/) ? `2.${w.split('.')[1]}` : w.match(/^2\.\d+$/) ? w : null;
  return line ? versions.find((v) => v.startsWith(line + '.')) ?? null : null;
}

/** What to do about the errors we understand. */
export function hintFor(error: string, script: string): string | null {
  const ref = error.match(/Unable to resolve reference of: `([^`]+)`/)?.[1];
  if (ref && new RegExp(`import[^\\n]*\\b${ref}\\b[^\\n]*from`).test(script)) {
    return `Up to DataWeave 2.11 an import was accepted if the module merely saw the name (often through dw::Core). From 2.12 the module must declare it. Import ${ref} from the module that declares it, or drop the import if it comes from dw::Core.`;
  }
  if (/Unable to resolve module with identifier dw::util::jwt/.test(error)) {
    return 'The JWT modules are in DataWeave 2.13, and in patch releases 2.6.31, 2.9.19 and 2.12.4. Pick a later patch of the target line.';
  }
  if (/Unable to resolve module with identifier dw::test::/.test(error)) {
    return 'dw::test modules come with MUnit, not with DataWeave, so this check cannot load them.';
  }
  const fn = error.match(/`([A-Za-z]+)` requires runtime version `([\d.]+)`/);
  if (fn) return `${fn[1]} needs DataWeave ${fn[2]} or later.`;
  return null;
}

// The engine plus the modules Mule ships that change what compiles: Java
// interop, YAML and the JSON / XML schema loaders. Some are missing for old
// versions; that is reported, not fatal.
async function engineJars(io: UpgradeIO, v: string, notes: string[]): Promise<Coord[]> {
  const fetch = (url: string) => cachedFetch(io, url);
  const core = await resolveDependencies(fetch, [
    { g: 'org.mule.weave', a: 'runtime', v }, { g: 'org.mule.weave', a: 'core-modules', v },
  ]);
  if (!core.jars.length) throw new Error(`DataWeave ${v} could not be resolved: ${core.problems.join('; ')}`);
  const byKey = new Map(core.jars.map((j) => [`${j.g}:${j.a}`, { g: j.g, a: j.a, v: j.v }]));
  const extras = ['java-module', 'yaml-module', 'jsonschema-module', 'xmlschema-module'];
  const resolved = await Promise.all(extras.map((a) => resolveDependencies(fetch, [{ g: 'org.mule.weave', a, v }]).catch(() => null)));
  extras.forEach((a, i) => {
    const extra = resolved[i];
    // A version that doesn't exist still comes back as itself, with a
    // "couldn't read its POM" problem.
    if (!extra || !extra.jars.length || extra.problems.some((p) => p.startsWith(`org.mule.weave:${a}:${v}:`))) {
      notes.push(`${a} isn't published for DataWeave ${v}, so scripts that need it fail on that version.`);
      return;
    }
    for (const j of extra.jars) if (!byKey.has(`${j.g}:${j.a}`)) byKey.set(`${j.g}:${j.a}`, { g: j.g, a: j.a, v: j.v });
  });
  return [...byKey.values()];
}

/**
 * Compile every script under `folder` on both versions. Returns rows sorted
 * breaks first, or null rows with the reason in `notes` when nothing could be
 * checked. Never throws.
 */
export async function checkUpgrade(
  folder: string, from: string, to: string, includeTests: boolean, io: UpgradeIO,
  onProgress?: (text: string) => void, stopped?: () => boolean,
): Promise<{ rows: Row[] | null; notes: string[] }> {
  const notes: string[] = [];
  try {
    onProgress?.('Finding scripts…');
    // listFiles returns paths relative to the folder.
    const base = folder.replace(/\\/g, '/').replace(/\/+$/, '');
    const items: Item[] = [];
    for (const rel of await io.listFiles(folder)) {
      const path = `${base}/${rel}`;
      const at = path.indexOf('/src/');
      const projectRoot = at >= 0 ? path.slice(0, at) : path.slice(0, path.lastIndexOf('/'));
      const project = projectRoot.split('/').pop() || projectRoot;
      const file = at >= 0 ? path.slice(at + 1) : path.split('/').pop()!;
      // MUnit suites and their recorded .dwl data are not what an upgrade breaks first.
      const test = file.startsWith('src/test/');
      if (test && !includeTests) continue;
      const text = await io.readFile(path);
      if (/\.dwl$/i.test(path)) {
        items.push({ key: path, script: text, path, project, file, test });
      } else {
        for (const s of findInlineScripts(text)) {
          items.push({ key: `${path}#${s.index}`, script: s.text, path, project, file, test, index: s.index, flow: s.flow, target: s.target });
        }
      }
    }
    if (!items.length) return { rows: null, notes: [`No .dwl files or inline transforms found in this folder${includeTests ? '' : ' outside src/test'}.`] };

    const projects = [...new Set(items.map((i) => i.project))];
    const outcomes: Record<string, Map<string, Outcome>> = { from: new Map(), to: new Map() };
    for (const [side, v] of [['from', from], ['to', to]] as const) {
      onProgress?.(`Getting DataWeave ${v} (${muleOf(v)})… the first time downloads it.`);
      const jars = await engineJars(io, v, notes);
      for (let p = 0; p < projects.length; p++) {
        if (stopped?.()) throw new Error('Stopped.');
        const group = items.filter((i) => i.project === projects[p]);
        onProgress?.(`Compiling on DataWeave ${v}: ${projects[p]} (${p + 1} of ${projects.length}, ${group.length} scripts)${p === 0 ? '. The first time, this downloads the engine (about 30 MB).' : ''}`);
        const res = await io.engineCheck({ jars, items: group.map(({ key, script, path }) => ({ key, script, path })) });
        for (const r of res.results) outcomes[side].set(r.key, r);
        notes.push(...res.problems);
      }
    }
    const rows: Row[] = items.map((it) => {
      const a = outcomes.from.get(it.key), b = outcomes.to.get(it.key);
      const status: Status = a?.ok && b?.ok ? 'ok' : a?.ok && !b?.ok ? 'breaks' : !a?.ok && b?.ok ? 'fixed' : 'both';
      return { ...it, status, from: a, to: b };
    });
    const order: Status[] = ['breaks', 'both', 'fixed', 'ok'];
    rows.sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status) || x.project.localeCompare(y.project) || x.file.localeCompare(y.file));
    return { rows, notes: [...new Set(notes)] };
  } catch (e) {
    return { rows: null, notes: [...new Set([e instanceof Error ? e.message : String(e), ...notes])] };
  }
}

/** Where a row lives: the file, plus the flow and target for an inline Transform. */
export const whereOf = (r: Row) => (r.index !== undefined ? `${r.file} · ${r.flow} / ${r.target}` : r.file);

/** The Markdown report. OK rows are only counted. `limit` caps each section. */
export function upgradeReport(rows: Row[], folder: string, from: string, to: string, limit = Infinity): string {
  const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Record<Status, number>);
  const md: string[] = [`# Upgrade check: ${muleOf(from)} (DataWeave ${from}) to ${muleOf(to)} (DataWeave ${to})`, '', `Folder: ${folder}`, '',
    `Breaks: ${counts.breaks ?? 0} · Fails on both: ${counts.both ?? 0} · Fixed by upgrade: ${counts.fixed ?? 0} · OK: ${counts.ok ?? 0}`, ''];
  for (const s of ['breaks', 'both', 'fixed'] as Status[]) {
    const list = rows.filter((r) => r.status === s);
    if (!list.length) continue;
    md.push(`## ${STATUS_LABEL[s]} (${list.length})`, '');
    for (const r of list.slice(0, limit)) {
      const err = s === 'fixed' ? r.from : r.to;
      md.push(`- **${r.project}**${r.test ? ' (test)' : ''} \`${whereOf(r)}\`${err?.line ? ` line ${err.line}` : ''}: ${err?.error ?? ''}`);
      const h = err?.error ? hintFor(err.error, r.script) : null;
      if (h) md.push(`  - ${h}`);
    }
    if (list.length > limit) md.push(`- …and ${list.length - limit} more`);
    md.push('');
  }
  return md.join('\n');
}

/** The MCP tool's whole job, the same in the desktop app and the extension. */
export async function mcpUpgradeCheck(folder: string, from: string, to: string, includeTests: boolean, io: UpgradeIO): Promise<{ ok: boolean; text: string }> {
  let versions: string[];
  try { versions = await dwVersions(io); } catch (e) {
    return { ok: false, text: `Couldn't list DataWeave versions from MuleSoft's repository: ${e instanceof Error ? e.message : String(e)}` };
  }
  const a = pickVersion(versions, from), b = pickVersion(versions, to);
  if (!a || !b) return { ok: false, text: `Unknown version "${!a ? from : to}". Use a Mule version like 4.4 or a DataWeave version like 2.4.0.` };
  const res = await checkUpgrade(folder, a, b, includeTests, io);
  const notes = res.notes.length ? `\n\nNotes:\n${res.notes.map((n) => `- ${n}`).join('\n')}` : '';
  if (!res.rows) return { ok: false, text: (res.notes.join('\n') || 'Nothing was checked.') };
  return { ok: true, text: upgradeReport(res.rows, folder, a, b, 100) + notes };
}
