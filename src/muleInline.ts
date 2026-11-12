/**
 * Inline DataWeave in a Mule XML file: the CDATA bodies of ee:set-payload,
 * ee:set-variable and ee:set-attributes. Works on the raw text, never a parsed
 * DOM, so writing one script back leaves every other byte of the file alone.
 */

export interface InlineScript {
  /** Position among the file's inline scripts, in document order. */
  index: number;
  /** The enclosing flow or sub-flow name, '' if none. */
  flow: string;
  /** The Transform component's doc:name, '' if none. */
  transform: string;
  /** 'payload', 'attributes', or 'vars.<name>'. */
  target: string;
  /** The script exactly as it sits between `<![CDATA[` and `]]>`. */
  text: string;
  start: number;
  end: number;
}

export function findInlineScripts(xml: string): InlineScript[] {
  const out: InlineScript[] = [];
  const re = /<ee:(set-payload|set-variable|set-attributes)\b([^>]*)>\s*<!\[CDATA\[([\s\S]*?)\]\]>/g;
  for (const m of xml.matchAll(re)) {
    const end = m.index + m[0].length - 3;
    const before = xml.slice(0, m.index);
    const flows = [...before.matchAll(/<(?:sub-)?flow\b[^>]*?\bname="([^"]*)"/g)];
    const transforms = [...before.matchAll(/<ee:transform\b[^>]*?\bdoc:name="([^"]*)"/g)];
    out.push({
      index: out.length,
      flow: flows.length ? flows[flows.length - 1][1] : '',
      transform: transforms.length ? transforms[transforms.length - 1][1] : '',
      target: m[1] === 'set-payload' ? 'payload'
        : m[1] === 'set-attributes' ? 'attributes'
        : `vars.${m[2].match(/\bvariableName="([^"]*)"/)?.[1] ?? '?'}`,
      text: m[3],
      start: end - m[3].length,
      end,
    });
  }
  return out;
}

/** The file with script `index` replaced. Throws rather than write broken XML. */
export function replaceInlineScript(xml: string, index: number, text: string): string {
  const s = findInlineScripts(xml)[index];
  if (!s) throw new Error('That transform is no longer in the file.');
  if (text.includes(']]>')) throw new Error('The script contains "]]>", which would end the CDATA block in the XML.');
  return xml.slice(0, s.start) + text + xml.slice(s.end);
}
