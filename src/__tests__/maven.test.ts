import { describe, it, expect } from 'vitest';
import { parseDependencyInput, parsePom, resolveDependencies, pomUrl } from '../maven';

const pom = (body: string) => `<?xml version="1.0"?><project>${body}</project>`;
const dep = (g: string, a: string, v?: string, extra = '') =>
  `<dependency><groupId>${g}</groupId><artifactId>${a}</artifactId>${v ? `<version>${v}</version>` : ''}${extra}</dependency>`;

function fakeCentral(poms: Record<string, string>, metadata: Record<string, string> = {}) {
  const seen: string[] = [];
  const fetch = async (url: string) => {
    seen.push(url);
    for (const [id, xml] of Object.entries(poms)) {
      const [g, a, v] = id.split(':');
      if (url === pomUrl({ g, a, v })) return xml;
    }
    for (const [ga, v] of Object.entries(metadata)) {
      const [g, a] = ga.split(':');
      if (url.endsWith(`${g.replace(/\./g, '/')}/${a}/maven-metadata.xml`)) return `<metadata><versioning><release>${v}</release></versioning></metadata>`;
    }
    throw new Error('Not found');
  };
  return { fetch, seen };
}

describe('parseDependencyInput', () => {
  it('reads g:a:v, g:a and Gradle lines', () => {
    expect(parseDependencyInput('org.apache.commons:commons-lang3:3.14.0')).toEqual([{ g: 'org.apache.commons', a: 'commons-lang3', v: '3.14.0' }]);
    expect(parseDependencyInput('com.google.code.gson:gson')).toEqual([{ g: 'com.google.code.gson', a: 'gson', v: '' }]);
    expect(parseDependencyInput(`implementation 'a.b:c:1.0'\nimplementation("d.e:f:2.0")`)).toEqual([
      { g: 'a.b', a: 'c', v: '1.0' }, { g: 'd.e', a: 'f', v: '2.0' },
    ]);
  });

  it('reads pasted <dependency> blocks and drops test-scoped ones', () => {
    const text = `${dep('a.b', 'c', '1.0')}\n${dep('x.y', 'junit', '4', '<scope>test</scope>')}\n${dep('p.q', 'r', '${r.version}')}`;
    expect(parseDependencyInput(text)).toEqual([{ g: 'a.b', a: 'c', v: '1.0' }, { g: 'p.q', a: 'r', v: '' }]);
  });

  it('treats a plain word as a search, not a coordinate', () => {
    expect(parseDependencyInput('jackson')).toEqual([]);
  });
});

describe('parsePom', () => {
  it('ignores dependencies inside build plugins and profiles', () => {
    const p = parsePom(pom(`<groupId>g</groupId><artifactId>a</artifactId><version>1</version>
      <dependencies>${dep('x', 'real', '1')}</dependencies>
      <build><plugins><plugin><dependencies>${dep('x', 'plugin-dep', '1')}</dependencies></plugin></plugins></build>
      <profiles><profile><dependencies>${dep('x', 'profile-dep', '1')}</dependencies></profile></profiles>`));
    expect(p.deps.map((d) => d.a)).toEqual(['real']);
    expect(p.v).toBe('1');
  });
});

describe('resolveDependencies', () => {
  it('follows transitive deps with versions from parent properties and dependencyManagement', async () => {
    const { fetch } = fakeCentral({
      'com.lib:parent:5': pom(`<groupId>com.lib</groupId><artifactId>parent</artifactId><version>5</version><packaging>pom</packaging>
        <properties><core.version>2.1</core.version></properties>
        <dependencyManagement><dependencies>${dep('com.lib', 'annotations', '3.0')}</dependencies></dependencyManagement>`),
      'com.lib:databind:5': pom(`<parent><groupId>com.lib</groupId><artifactId>parent</artifactId><version>5</version></parent>
        <artifactId>databind</artifactId>
        <dependencies>${dep('com.lib', 'core', '${core.version}')}${dep('com.lib', 'annotations')}
          ${dep('junit', 'junit', '4', '<scope>test</scope>')}${dep('com.opt', 'opt', '1', '<optional>true</optional>')}</dependencies>`),
      'com.lib:core:2.1': pom(`<groupId>com.lib</groupId><artifactId>core</artifactId><version>2.1</version>`),
      'com.lib:annotations:3.0': pom(`<groupId>com.lib</groupId><artifactId>annotations</artifactId><version>3.0</version>`),
    });
    const r = await resolveDependencies(fetch, [{ g: 'com.lib', a: 'databind', v: '5' }]);
    expect(r.jars.map((j) => `${j.a}:${j.v}`)).toEqual(['databind:5', 'core:2.1', 'annotations:3.0']);
    expect(r.problems).toEqual([]);
  });

  it('nearest version wins, exclusions are honoured, and a missing version picks latest', async () => {
    const { fetch } = fakeCentral({
      'r:root:1': pom(`<groupId>r</groupId><artifactId>root</artifactId><version>1</version><dependencies>
        ${dep('s', 'shared', '2')}${dep('m', 'mid', '1', '<exclusions><exclusion><groupId>x</groupId><artifactId>bad</artifactId></exclusion></exclusions>')}</dependencies>`),
      'm:mid:1': pom(`<groupId>m</groupId><artifactId>mid</artifactId><version>1</version><dependencies>${dep('s', 'shared', '1')}${dep('x', 'bad', '1')}</dependencies>`),
      's:shared:2': pom('<groupId>s</groupId><artifactId>shared</artifactId><version>2</version>'),
    }, { 'r:root': '1' });
    const r = await resolveDependencies(fetch, [{ g: 'r', a: 'root', v: '' }]);
    expect(r.jars.map((j) => `${j.a}:${j.v}`)).toEqual(['root:1', 'shared:2', 'mid:1']);
  });

  it('only the root when transitive is off', async () => {
    const { fetch, seen } = fakeCentral({});
    const r = await resolveDependencies(fetch, [{ g: 'a', a: 'b', v: '1' }], false);
    expect(r.jars).toEqual([{ g: 'a', a: 'b', v: '1' }]);
    expect(seen).toEqual([]);
  });
});
