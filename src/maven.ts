/**
 * Maven Central for the Java tester: read what the user typed or pasted into
 * coordinates, search Central, and work out the jars a library needs.
 *
 * The resolver is a small version of Maven's own: POMs inherit properties,
 * dependencies and dependencyManagement from their parent chain, BOMs come in
 * through import-scoped dependencyManagement, and transitive versions are
 * settled nearest-first (the first time a group:artifact is reached wins).
 * Test, provided, system and optional dependencies are skipped, as Maven skips
 * them for a runtime classpath. Good enough for the libraries a Mule app calls
 * from Java; not a replacement for `mvn dependency:tree`.
 *
 * Network access goes through `fetchText` (the backend's maven_fetch_text), so
 * the parsing and resolution are plain functions the tests can drive.
 */

export interface Coord { g: string; a: string; v: string }
type Fetch = (url: string) => Promise<string>;

const REPO = 'https://repo1.maven.org/maven2';
const key = (c: { g: string; a: string }) => `${c.g}:${c.a}`;

// ── Reading what the user gave us ──────────────────────────────────────

/**
 * Coordinates from any of the ways people copy a dependency: `g:a:v`, `g:a`
 * (version left empty, meaning latest), a Maven `<dependency>` block (several
 * are fine, a whole pom.xml too), or a Gradle line. Returns [] when nothing
 * looks like a coordinate, so the caller can treat the text as a search.
 */
export function parseDependencyInput(text: string): Coord[] {
  const t = text.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!t) return [];
  if (t.includes('<')) {
    const out: Coord[] = [];
    for (const m of t.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
      const g = tag(m[1], 'groupId'), a = tag(m[1], 'artifactId');
      const scope = tag(m[1], 'scope');
      if (!g || !a || scope === 'test' || scope === 'provided') continue;
      // A ${property} version means the pom defined it; we can't see it, so ask for latest.
      const v = tag(m[1], 'version');
      out.push({ g, a, v: v && !v.includes('${') ? v : '' });
    }
    return out;
  }
  const out: Coord[] = [];
  for (const line of t.split('\n')) {
    // Gradle: implementation 'g:a:v' / implementation("g:a:v") → g:a:v
    const s = line.trim().replace(/^[a-zA-Z]+\s*\(?\s*(?=['"])/, '').replace(/^['"]|['"]\s*\)?$/g, '');
    const m = s.match(/^([\w.-]+):([\w.-]+)(?::([^:\s]+))?(?::[\w.-]+)?$/);
    if (m) out.push({ g: m[1], a: m[2], v: m[3] ?? '' });
  }
  return out;
}

// ── POM parsing ────────────────────────────────────────────────────────

function tag(xml: string, name: string): string | undefined {
  return xml.match(new RegExp(`<${name}>\\s*([\\s\\S]*?)\\s*</${name}>`))?.[1];
}
function cut(xml: string, name: string): string {
  return xml.replace(new RegExp(`<${name}[\\s>][\\s\\S]*?</${name}>`, 'g'), '');
}

interface Dep { g: string; a: string; v?: string; scope?: string; type?: string; classifier?: string; optional?: boolean; exclusions: string[] }
interface RawPom {
  g?: string; a?: string; v?: string; packaging?: string;
  parent?: Coord;
  props: Record<string, string>;
  deps: Dep[];
  managed: Dep[];
}

function readDeps(block: string | undefined): Dep[] {
  if (!block) return [];
  return [...block.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)].map((m) => {
    const body = m[1];
    const ex = tag(body, 'exclusions');
    return {
      g: tag(body, 'groupId') ?? '',
      a: tag(body, 'artifactId') ?? '',
      v: tag(body, 'version'),
      scope: tag(body, 'scope'),
      type: tag(body, 'type'),
      classifier: tag(body, 'classifier'),
      optional: tag(body, 'optional') === 'true',
      exclusions: ex ? [...ex.matchAll(/<exclusion>([\s\S]*?)<\/exclusion>/g)].map((e) => `${tag(e[1], 'groupId')}:${tag(e[1], 'artifactId')}`) : [],
    };
  });
}

export function parsePom(xml: string): RawPom {
  // Only the project's own top level counts: build plugins, profiles and
  // reporting all carry <dependencies>/<version> tags of their own.
  let s = xml.replace(/<!--[\s\S]*?-->/g, '');
  s = cut(cut(cut(s, 'build'), 'profiles'), 'reporting');
  const parentXml = tag(s, 'parent');
  const parent = parentXml ? { g: tag(parentXml, 'groupId') ?? '', a: tag(parentXml, 'artifactId') ?? '', v: tag(parentXml, 'version') ?? '' } : undefined;
  const managed = readDeps(tag(tag(s, 'dependencyManagement') ?? '', 'dependencies'));
  const propsXml = tag(s, 'properties') ?? '';
  s = cut(cut(cut(s, 'parent'), 'dependencyManagement'), 'properties');
  const deps = readDeps(tag(s, 'dependencies'));
  const top = cut(cut(cut(s, 'dependencies'), 'distributionManagement'), 'licenses');
  const props: Record<string, string> = {};
  for (const m of propsXml.matchAll(/<([\w.-]+)>([^<]*)<\/\1>/g)) props[m[1]] = m[2].trim();
  return { g: tag(top, 'groupId'), a: tag(top, 'artifactId'), v: tag(top, 'version'), packaging: tag(top, 'packaging'), parent, props, deps, managed };
}

// ── Effective model (parent chain, properties, BOMs) ───────────────────

interface Model { coord: Coord; packaging: string; props: Record<string, string>; deps: Dep[]; managed: Map<string, Dep> }

function interpolate(v: string | undefined, props: Record<string, string>): string | undefined {
  if (v == null) return v;
  let out = v;
  for (let i = 0; i < 10 && out.includes('${'); i++) out = out.replace(/\$\{([^}]+)\}/g, (m, k: string) => props[k] ?? m);
  return out;
}

/** `[1.2,2.0)` style ranges: take the lower bound, which every range in practice has. */
function pinVersion(v: string): string {
  const m = v.match(/^[[(]\s*([^,\])]+)/);
  return m ? m[1].trim() : v;
}

export function pomUrl(c: Coord): string {
  return `${REPO}/${c.g.replace(/\./g, '/')}/${c.a}/${c.v}/${c.a}-${c.v}.pom`;
}

export async function latestVersion(fetchText: Fetch, g: string, a: string): Promise<string> {
  const xml = await fetchText(`${REPO}/${g.replace(/\./g, '/')}/${a}/maven-metadata.xml`);
  const v = tag(xml, 'release') ?? tag(xml, 'latest') ?? [...xml.matchAll(/<version>([^<]+)<\/version>/g)].pop()?.[1];
  if (!v) throw new Error(`No versions listed for ${g}:${a}`);
  return v;
}

export async function versionsOf(fetchText: Fetch, g: string, a: string): Promise<string[]> {
  const xml = await fetchText(`${REPO}/${g.replace(/\./g, '/')}/${a}/maven-metadata.xml`);
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]).reverse();
}

async function loadModel(fetchText: Fetch, c: Coord, cache: Map<string, Promise<Model>>, depth = 0): Promise<Model> {
  const id = `${c.g}:${c.a}:${c.v}`;
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      if (depth > 12) throw new Error(`Parent chain too deep at ${id}`);
      const raw = parsePom(await fetchText(pomUrl(c)));
      const parent = raw.parent?.g ? await loadModel(fetchText, raw.parent, cache, depth + 1) : undefined;
      const g = raw.g ?? raw.parent?.g ?? c.g;
      const v = raw.v ?? raw.parent?.v ?? c.v;
      const props: Record<string, string> = {
        ...parent?.props,
        ...raw.props,
        'project.groupId': g, 'project.artifactId': c.a, 'project.version': v,
        'pom.groupId': g, 'pom.version': v, groupId: g, version: v,
        ...(raw.parent ? { 'project.parent.version': raw.parent.v, 'project.parent.groupId': raw.parent.g, 'parent.version': raw.parent.v } : {}),
      };
      const fix = (d: Dep): Dep => ({ ...d, g: interpolate(d.g, props)!, a: interpolate(d.a, props)!, v: interpolate(d.v, props) });
      const managed = new Map(parent?.managed);
      for (const d of raw.managed.map(fix)) {
        if (d.scope === 'import' && d.type === 'pom' && d.v) {
          // A BOM: its managed versions apply, but this POM's own entries win.
          try {
            const bom = await loadModel(fetchText, { g: d.g, a: d.a, v: pinVersion(d.v) }, cache, depth + 1);
            for (const [k, m] of bom.managed) if (!raw.managed.some((x) => key(fix(x)) === k)) managed.set(k, m);
          } catch { /* a BOM we can't read only costs us its version hints */ }
        } else {
          managed.set(key(d), d);
        }
      }
      // Children inherit the parent's dependencies too.
      const deps = [...(parent?.deps ?? []), ...raw.deps.map(fix)];
      return { coord: { g, a: c.a, v }, packaging: raw.packaging ?? 'jar', props, deps, managed };
    })();
    cache.set(id, p);
  }
  return p;
}

// ── Transitive resolution ──────────────────────────────────────────────

export interface Resolved {
  /** Jars to download, roots first, then by depth. */
  jars: (Coord & { via?: string })[];
  /** Things we couldn't settle, in plain words, for the dialog to show. */
  problems: string[];
}

const SKIP_SCOPES = new Set(['test', 'provided', 'system', 'import']);
const MAX_JARS = 200;

export async function resolveDependencies(fetchText: Fetch, roots: Coord[], transitive = true): Promise<Resolved> {
  const cache = new Map<string, Promise<Model>>();
  const chosen = new Map<string, Coord & { via?: string }>();
  const problems: string[] = [];
  type Item = { c: Coord; excl: Set<string>; via?: string };
  let level: Item[] = [];

  for (const r of roots) {
    let v = r.v;
    if (!v) {
      try { v = await latestVersion(fetchText, r.g, r.a); }
      catch (e) { problems.push(`${r.g}:${r.a}: ${msg(e)}`); continue; }
    }
    if (chosen.has(key(r))) continue;
    const c = { g: r.g, a: r.a, v };
    chosen.set(key(c), c);
    level.push({ c, excl: new Set() });
  }

  const order: string[] = [...chosen.keys()];
  while (level.length && transitive) {
    const models = await Promise.all(level.map((it) => loadModel(fetchText, it.c, cache).catch((e) => {
      problems.push(`${it.c.g}:${it.c.a}:${it.c.v}: couldn't read its POM (${msg(e)}), so its own dependencies are missing`);
      return null;
    })));
    const next: Item[] = [];
    models.forEach((m, i) => {
      if (!m) return;
      const it = level[i];
      for (const d of m.deps) {
        const mg = m.managed.get(key(d));
        const scope = d.scope ?? mg?.scope ?? 'compile';
        if (SKIP_SCOPES.has(scope) || d.optional || (d.type && d.type !== 'jar') || d.classifier) continue;
        if (it.excl.has(key(d)) || it.excl.has(`${d.g}:*`) || it.excl.has('*:*')) continue;
        if (chosen.has(key(d))) continue;
        const raw = d.v ?? mg?.v;
        if (!raw || raw.includes('${')) {
          problems.push(`${key(d)} (needed by ${it.c.a}): no version could be worked out, add it yourself`);
          continue;
        }
        if (chosen.size >= MAX_JARS) { problems.push(`Stopped at ${MAX_JARS} jars`); return; }
        const c = { g: d.g, a: d.a, v: pinVersion(raw), via: it.c.a };
        chosen.set(key(c), c);
        order.push(key(c));
        next.push({ c, excl: new Set([...it.excl, ...d.exclusions, ...(mg?.exclusions ?? [])]), via: it.c.a });
      }
    });
    level = next;
  }

  // A pom-packaged artifact has no jar of its own (its dependencies came along above).
  const jars: Resolved['jars'] = [];
  for (const k of order) {
    const c = chosen.get(k)!;
    const m = await cache.get(`${c.g}:${c.a}:${c.v}`)?.catch(() => null);
    if (m?.packaging === 'pom') continue;
    jars.push(c);
  }
  return { jars, problems: [...new Set(problems)] };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── Jars from Java imports ─────────────────────────────────────────────

// Packages the JDK itself provides; nothing to download for these.
const JDK_PKG = /^(java|jdk|sun|com\.sun|org\.w3c|org\.xml\.sax|org\.ietf|org\.omg|javax\.(crypto|net|security|xml|naming|management|sql|script|swing|imageio|sound|print|rmi|tools|lang|accessibility|annotation\.processing|transaction\.xa))\./;

/**
 * The library classes a set of Java sources imports, one class per package
 * (that is enough to find the jar). Skips the JDK and the sources' own
 * packages. Wildcard imports (`a.b.*`) name no class, so they come back
 * separately: Central can't be searched by package.
 */
export function libraryImports(sources: string[]): { byPackage: Map<string, string>; wildcards: string[] } {
  const own = new Set(sources.map((s) => s.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1]).filter(Boolean) as string[]);
  const byPackage = new Map<string, string>();
  const wildcards = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/^\s*import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/gm)) {
      let name = m[2];
      // import static a.b.C.method → the class is a.b.C (the first capitalised part).
      if (m[1]) { const parts = name.split('.'); const i = parts.findIndex((p) => /^[A-Z]/.test(p)); if (i < 0) continue; name = parts.slice(0, i + 1).join('.'); }
      if (JDK_PKG.test(name + '.')) continue;
      if (m[3] && !m[1]) { if (!own.has(name)) wildcards.add(name); continue; }
      const pkg = name.split('.').filter((p) => !/^[A-Z]/.test(p)).join('.');
      if (!pkg || byPackage.has(pkg) || [...own].some((o) => pkg === o || pkg.startsWith(o + '.'))) continue;
      byPackage.set(pkg, name.split('.').slice(0, pkg.split('.').length + 1).join('.'));
    }
  }
  return { byPackage, wildcards: [...wildcards] };
}

/**
 * Which artifact on Central holds a class. Central's class search matches
 * every jar that bundles the class (shaded copies, OSGi repackages...), so it
 * is narrowed to groups sharing the package's prefix, longest first, and the
 * candidates are scored: the artifact's name appearing in the package is the
 * strongest sign of the original, repackage words count against, and the most
 * recently published wins a tie (bcprov-jdk18on over bcprov-jdk14).
 */
// Popular libraries whose group shares nothing with their package, so the
// prefix search can't see them under all the jars that shade their classes.
const KNOWN_PACKAGES: [string, string, string][] = [
  ['com.google.common', 'com.google.guava', 'guava'],
  ['org.apache.commons.codec', 'commons-codec', 'commons-codec'],
  ['org.apache.commons.io', 'commons-io', 'commons-io'],
  ['org.apache.commons.logging', 'commons-logging', 'commons-logging'],
  ['org.apache.commons.lang', 'commons-lang', 'commons-lang'],
  ['org.apache.commons.collections', 'commons-collections', 'commons-collections'],
  ['org.apache.commons.beanutils', 'commons-beanutils', 'commons-beanutils'],
  ['org.apache.commons.net', 'commons-net', 'commons-net'],
  ['org.joda.time', 'joda-time', 'joda-time'],
];

export async function artifactForClass(fetchText: Fetch, fqcn: string): Promise<{ g: string; a: string } | null> {
  const pkgParts = fqcn.split('.').filter((p) => !/^[A-Z]/.test(p));
  const pkg = pkgParts.join('.');
  const known = KNOWN_PACKAGES.find(([p]) => pkg === p || pkg.startsWith(p + '.'));
  if (known) return { g: known[1], a: known[2] };
  for (let n = pkgParts.length; n >= 2; n--) {
    const q = `fc:${fqcn} AND g:${pkgParts.slice(0, n).join('.')}*`;
    const json = JSON.parse(await fetchText(`https://search.maven.org/solrsearch/select?q=${encodeURIComponent(q)}&rows=100&wt=json`));
    const docs: { g: string; a: string; timestamp?: number }[] = json.response?.docs ?? [];
    if (!docs.length) continue;
    const seen = new Map<string, { g: string; a: string; count: number; ts: number }>();
    for (const d of docs) {
      const k = `${d.g}:${d.a}`;
      const s = seen.get(k) ?? { g: d.g, a: d.a, count: 0, ts: 0 };
      s.count++; s.ts = Math.max(s.ts, d.timestamp ?? 0);
      seen.set(k, s);
    }
    const newest = Math.max(...[...seen.values()].map((s) => s.ts));
    const score = (s: { a: string; count: number; ts: number }) => {
      const words = s.a.toLowerCase().split(/[-_.]/).filter((w) => w.length > 2);
      // A share, not a count, so a long repackage name can't out-match the original.
      const hits = words.length ? words.filter((w) => pkg.includes(w)).length / words.length : 0;
      const bad = words.filter((w) => /^(osgi|android|ext|shaded|bundle|bundles|all|repackaged|servicemix|orbit)$/.test(w)).length;
      // Nothing published for years while others were: abandoned (google-collect beside guava).
      const stale = newest - s.ts > 6 * 365 * 864e5 ? 3 : 0;
      return hits * 3 - bad * 2 - stale + s.ts / 1e13 + s.count / 1000;
    };
    const best = [...seen.values()].sort((x, y) => score(y) - score(x))[0];
    return { g: best.g, a: best.a };
  }
  return null;
}

// ── Search ─────────────────────────────────────────────────────────────

export interface SearchHit { g: string; a: string; latest: string; versions: number }

export async function searchCentral(fetchText: Fetch, q: string): Promise<SearchHit[]> {
  const term = q.trim();
  const json = JSON.parse(await fetchText(`https://search.maven.org/solrsearch/select?q=${encodeURIComponent(term)}&rows=30&wt=json`));
  const hits: SearchHit[] = (json.response?.docs ?? [])
    .filter((d: any) => d.p !== 'pom')
    .map((d: any) => ({ g: d.g, a: d.a, latest: d.latestVersion, versions: d.versionCount ?? 0 }));
  // Central ranks loosely. An exact artifact match is almost always what was
  // meant, and among the forks that republish one, the original's group shares
  // a word with the artifact (org.apache.commons:commons-lang3, com.google.code.gson:gson).
  const low = term.toLowerCase();
  const rank = (h: SearchHit) => {
    const a = h.a.toLowerCase();
    if (a !== low) return a.startsWith(low) ? 2 : 3;
    const words = a.split(/[-_.]/).filter((w) => w.length > 2);
    return h.g.toLowerCase().split('.').some((p) => words.some((w) => p === w || w.startsWith(p) && p.length > 3)) ? 0 : 1;
  };
  return hits.sort((x, y) => rank(x) - rank(y) || y.versions - x.versions).slice(0, 15);
}
