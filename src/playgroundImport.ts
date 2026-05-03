/**
 * Import a DataWeave Playground export zip.
 *
 * Playground export structure (verified against a real export):
 *   pom.xml
 *   src/main/dw/<name>.dwl                                        ← script
 *   src/test/resources/<name>/Playground/inputs/payload.<ext>     ← payload
 *   src/test/resources/<name>/Playground/inputs/vars.json         ← vars (optional)
 *   src/test/resources/<name>/Playground/inputs/attributes.json   ← attributes (optional)
 *   src/test/resources/<name>/Playground/inputs/<other>.<ext>     ← named inputs (optional)
 *
 * Tolerant: globs for any `.dwl` and any `inputs/` folder so future-version
 * tweaks don't break the importer.
 */

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { ContextState, KeyValuePair, MimeType, NamedInput, VarEntry } from './types';

export interface PlaygroundImportResult {
  projectName: string;
  script: string;
  payload: string;
  payloadMimeType: MimeType;
  context: ContextState;
  namedInputs: NamedInput[];
  warnings: string[];
}

const MIME_BY_EXT: Record<string, MimeType> = {
  json: 'application/json',
  xml: 'application/xml',
  csv: 'application/csv',
  txt: 'text/plain',
  dwl: 'application/dw',
};

const EXT_BY_MIME: Partial<Record<MimeType, string>> = {
  'application/json': 'json',
  'application/xml': 'xml',
  'application/csv': 'csv',
  'text/plain': 'txt',
  'application/dw': 'dwl',
};

function ext(path: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function stem(path: string): string {
  const b = basename(path);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(0, i) : b;
}

function mimeFor(path: string): MimeType {
  return MIME_BY_EXT[ext(path)] ?? 'application/octet-stream';
}

/** Convert a parsed `attributes.json` blob back into our ContextState shape. */
function attributesToContext(attrs: Record<string, unknown>): {
  method: string;
  queryParams: KeyValuePair[];
  headers: KeyValuePair[];
} {
  const method = typeof attrs.method === 'string' ? attrs.method.toUpperCase() : 'GET';
  const toKV = (obj: unknown): KeyValuePair[] => {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
  };
  return {
    method,
    queryParams: toKV(attrs.queryParams ?? attrs.queryParameters),
    headers: toKV(attrs.headers),
  };
}

/** Convert a parsed `vars.json` blob into our VarEntry[] shape. */
function varsToEntries(vars: Record<string, unknown>): VarEntry[] {
  return Object.entries(vars).map(([key, value]) => {
    if (typeof value === 'string') {
      return { key, value, valueType: 'string' };
    }
    return { key, value: JSON.stringify(value, null, 2), valueType: 'json' };
  });
}

export async function importPlaygroundZip(file: File): Promise<PlaygroundImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (e) {
    throw new Error(`Could not read zip: ${(e as Error).message}`);
  }

  const warnings: string[] = [];
  const paths = Object.keys(entries).filter((p) => !p.endsWith('/'));

  // Find the .dwl script. Prefer one under src/main/dw/, fall back to any .dwl.
  const dwlPaths = paths.filter((p) => ext(p) === 'dwl');
  if (dwlPaths.length === 0) {
    throw new Error('No .dwl file found in the zip — is this a DataWeave Playground export?');
  }
  const scriptPath =
    dwlPaths.find((p) => /(^|\/)src\/main\/dw\//.test(p)) ?? dwlPaths[0];
  const script = strFromU8(entries[scriptPath]);
  const projectName = stem(scriptPath);

  // Find the inputs folder. Real exports use src/test/resources/<name>/Playground/inputs/
  // but accept any folder ending in /inputs/ to be tolerant.
  const inputFiles = paths.filter((p) => /(^|\/)inputs\/[^/]+$/.test(p));

  // Defaults
  let payload = '';
  let payloadMimeType: MimeType = 'application/json';
  let context: ContextState = {
    method: 'GET',
    queryParams: [],
    headers: [],
    vars: [],
  };
  const namedInputs: NamedInput[] = [];

  for (const path of inputFiles) {
    const name = basename(path);
    const stemName = stem(path);
    const text = strFromU8(entries[path]);

    if (stemName === 'payload') {
      payload = text;
      payloadMimeType = mimeFor(path);
      continue;
    }
    if (name === 'vars.json') {
      try {
        context = { ...context, vars: varsToEntries(JSON.parse(text)) };
      } catch (e) {
        warnings.push(`vars.json parse failed: ${(e as Error).message}`);
      }
      continue;
    }
    if (name === 'attributes.json') {
      try {
        const attrs = JSON.parse(text) as Record<string, unknown>;
        context = { ...context, ...attributesToContext(attrs) };
      } catch (e) {
        warnings.push(`attributes.json parse failed: ${(e as Error).message}`);
      }
      continue;
    }
    // Anything else = named input. The DW input name is the file stem.
    namedInputs.push({
      name: stemName,
      content: text,
      mimeType: mimeFor(path),
    });
  }

  if (!payload && namedInputs.length === 0) {
    warnings.push('No inputs folder found — only the script was imported.');
  }

  return {
    projectName,
    script,
    payload,
    payloadMimeType,
    context,
    namedInputs,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export — produce a Playground-compatible zip
// ─────────────────────────────────────────────────────────────────────────────

export interface PlaygroundExportInput {
  projectName: string;
  script: string;
  payload: string;
  payloadMimeType: MimeType;
  context: ContextState;
  namedInputs: NamedInput[];
}

const POM_TEMPLATE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/maven-v4_0_0.xsd">

    <modelVersion>4.0.0</modelVersion>
    <groupId>org.mycompany</groupId>
    <artifactId>__ARTIFACT__</artifactId>
    <version>2.4.0</version>
    <packaging>dw-library</packaging>
    <name>__NAME__</name>

    <properties>
        <data.weave.version>2.4.0-20220420</data.weave.version>
        <data.weave.testing.framework.version>1.1.2</data.weave.testing.framework.version>
        <data.weave.maven.plugin.version>0.2.0</data.weave.maven.plugin.version>
    </properties>

    <dependencies>
        <dependency><groupId>org.mule.weave</groupId><artifactId>runtime</artifactId><version>\${data.weave.version}</version><scope>provided</scope></dependency>
        <dependency><groupId>org.mule.weave</groupId><artifactId>core-modules</artifactId><version>\${data.weave.version}</version><scope>provided</scope></dependency>
        <dependency><groupId>org.mule.weave</groupId><artifactId>java-module</artifactId><version>\${data.weave.version}</version><scope>provided</scope></dependency>
        <dependency><groupId>org.mule.weave</groupId><artifactId>yaml-module</artifactId><version>\${data.weave.version}</version><scope>provided</scope></dependency>
        <dependency><groupId>org.mule.weave</groupId><artifactId>ndjson-module</artifactId><version>\${data.weave.version}</version><scope>provided</scope></dependency>
        <dependency><groupId>org.mule.weave</groupId><artifactId>data-weave-testing-framework</artifactId><version>\${data.weave.testing.framework.version}</version><scope>test</scope></dependency>
    </dependencies>

    <build>
        <resources>
            <resource><directory>src/main/dw</directory></resource>
            <resource><directory>src/main/resources</directory></resource>
        </resources>
        <testResources>
            <testResource><directory>src/test/dw</directory></testResource>
            <testResource><directory>src/test/resources</directory></testResource>
        </testResources>
        <plugins>
            <plugin>
                <groupId>org.mule.weave</groupId>
                <artifactId>data-weave-maven-plugin</artifactId>
                <version>\${data.weave.maven.plugin.version}</version>
                <extensions>true</extensions>
            </plugin>
        </plugins>
    </build>

    <repositories>
        <repository><id>mule-releases</id><url>https://repository-master.mulesoft.org/nexus/content/repositories/releases</url></repository>
        <repository><id>mule-snapshots</id><url>https://repository-master.mulesoft.org/nexus/content/repositories/snapshots</url></repository>
    </repositories>
    <pluginRepositories>
        <pluginRepository><id>mule-releases</id><url>https://repository-master.mulesoft.org/nexus/content/repositories/releases</url></pluginRepository>
        <pluginRepository><id>mule-snapshots</id><url>https://repository-master.mulesoft.org/nexus/content/repositories/snapshots</url></pluginRepository>
    </pluginRepositories>
</project>
`;

function safeName(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'main';
}

function extFor(mime: MimeType): string {
  return EXT_BY_MIME[mime] ?? 'bin';
}

function varsToJson(vars: VarEntry[]): string {
  const obj: Record<string, unknown> = {};
  for (const v of vars) {
    if (!v.key || v.enabled === false) continue;
    if (v.valueType === 'json') {
      try {
        obj[v.key] = JSON.parse(v.value);
      } catch {
        obj[v.key] = v.value;
      }
    } else {
      obj[v.key] = v.value;
    }
  }
  return JSON.stringify(obj, null, 2);
}

function attributesJson(ctx: ContextState): string | null {
  const kvToObj = (arr: KeyValuePair[]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const p of arr) {
      if (p.enabled === false) continue;
      if (p.key && p.value !== '') out[p.key] = p.value;
    }
    return out;
  };
  const queryParams = kvToObj(ctx.queryParams);
  const headers = kvToObj(ctx.headers);
  const isDefault =
    (ctx.method ?? 'GET') === 'GET' &&
    Object.keys(queryParams).length === 0 &&
    Object.keys(headers).length === 0;
  if (isDefault) return null;
  const out: Record<string, unknown> = { method: ctx.method ?? 'GET' };
  if (Object.keys(queryParams).length > 0) out.queryParams = queryParams;
  if (Object.keys(headers).length > 0) out.headers = headers;
  return JSON.stringify(out, null, 2);
}

/**
 * Build a Playground-compatible zip Blob from the current workspace.
 * Mirrors the structure produced by the official Playground export.
 */
export function exportPlaygroundZip(input: PlaygroundExportInput): Blob {
  const name = safeName(input.projectName);
  const inputsBase = `${name}/src/test/resources/${name}/Playground/inputs`;
  const files: Record<string, Uint8Array> = {};

  files[`${name}/pom.xml`] = strToU8(
    POM_TEMPLATE.replace('__ARTIFACT__', name).replace('__NAME__', `${name}-project`)
  );
  files[`${name}/src/main/dw/${name}.dwl`] = strToU8(input.script);
  files[`${inputsBase}/payload.${extFor(input.payloadMimeType)}`] = strToU8(input.payload ?? '');

  const vars = varsToJson(input.context.vars);
  if (vars !== '{}') files[`${inputsBase}/vars.json`] = strToU8(vars);

  const attrs = attributesJson(input.context);
  if (attrs) files[`${inputsBase}/attributes.json`] = strToU8(attrs);

  for (const ni of input.namedInputs) {
    if (!ni.name) continue;
    files[`${inputsBase}/${safeName(ni.name)}.${extFor(ni.mimeType)}`] = strToU8(ni.content);
  }

  const zipped = zipSync(files, { level: 6 });
  // zipSync returns a Uint8Array view that may share buffer; copy into a fresh
  // ArrayBuffer so Blob doesn't get fed a SharedArrayBuffer view.
  return new Blob([zipped.slice()], { type: 'application/zip' });
}

/** Trigger a browser download of the produced zip. */
export function downloadPlaygroundZip(input: PlaygroundExportInput): void {
  const blob = exportPlaygroundZip(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(input.projectName)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

