import { describe, it, expect } from 'vitest';
import { findInlineScripts, replaceInlineScript } from '../muleInline';

// Made-up flows; nothing here comes from a real project.
const XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<mule xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core">',
  '\t<flow name="get-pets" doc:id="a1">',
  '\t\t<ee:transform doc:name="Build request" doc:id="a2">',
  '\t\t\t<ee:message>',
  '\t\t\t\t<ee:set-payload><![CDATA[%dw 2.0',
  'output application/json',
  '---',
  '{ id: payload.petId }]]></ee:set-payload>',
  '\t\t\t</ee:message>',
  '\t\t\t<ee:variables>',
  '\t\t\t\t<ee:set-variable variableName="status" ><![CDATA[200]]></ee:set-variable>',
  '\t\t\t</ee:variables>',
  '\t\t</ee:transform>',
  '\t\t<logger message="#[payload]"/>',
  '\t</flow>',
  '\t<sub-flow name="shape-error">',
  '\t\t<ee:transform doc:name="Error body">',
  '\t\t\t<ee:message>',
  '\t\t\t\t<ee:set-payload resource="dwl/ignored.dwl"/>',
  '\t\t\t\t<ee:set-attributes>',
  '\t\t\t\t\t<![CDATA[{ statusCode: 500 }]]>',
  '\t\t\t\t</ee:set-attributes>',
  '\t\t\t</ee:message>',
  '\t\t</ee:transform>',
  '\t</sub-flow>',
  '</mule>',
].join('\r\n');

describe('findInlineScripts', () => {
  const found = findInlineScripts(XML);
  it('finds each CDATA script with its flow, transform and target', () => {
    expect(found.map((s) => [s.flow, s.transform, s.target])).toEqual([
      ['get-pets', 'Build request', 'payload'],
      ['get-pets', 'Build request', 'vars.status'],
      ['shape-error', 'Error body', 'attributes'],
    ]);
  });
  it('returns the script exactly as written', () => {
    expect(found[0].text).toBe('%dw 2.0\r\noutput application/json\r\n---\r\n{ id: payload.petId }');
    expect(found[1].text).toBe('200');
    expect(XML.slice(found[2].start, found[2].end)).toBe('{ statusCode: 500 }');
  });
});

describe('replaceInlineScript', () => {
  it('writing a script back unchanged leaves the file identical', () => {
    for (const s of findInlineScripts(XML)) expect(replaceInlineScript(XML, s.index, s.text)).toBe(XML);
  });
  it('changes only the chosen script', () => {
    const next = replaceInlineScript(XML, 1, '404');
    expect(findInlineScripts(next).map((s) => s.text)).toEqual([findInlineScripts(XML)[0].text, '404', '{ statusCode: 500 }']);
    expect(next.length).toBe(XML.length);
  });
  it('refuses a script that would close the CDATA block', () => {
    expect(() => replaceInlineScript(XML, 0, 'payload ++ "]]>"')).toThrow(/CDATA/);
  });
  it('refuses an index that is gone', () => {
    expect(() => replaceInlineScript(XML, 9, 'x')).toThrow(/no longer/);
  });
});
