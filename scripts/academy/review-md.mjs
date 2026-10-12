// Writes docs/academy-chapter0.md: the verified lessons as plain reading, for review.
import { readFileSync, writeFileSync } from 'node:fs';

const { lessons } = JSON.parse(readFileSync('src/academy/chapter0.json', 'utf8'));
const fence = (s, lang = '') => '```' + lang + '\n' + s + '\n```';
let md = '# DataWeave Academy, Chapter 0 (review copy)\n\nGenerated from src/academy/chapter0.json after every example and check passed the engine gate. Edit scripts/academy/chapter0.mjs, not this file.\n';

for (const l of lessons) {
  md += `\n---\n\n## ${l.id} ${l.title}\n*About ${l.minutes} minutes*\n\n`;
  for (const b of l.body) {
    if (b.p) md += b.p + '\n\n';
    if (b.list) md += b.list.map((x) => '- ' + x).join('\n') + '\n\n';
    if (b.callout) md += `> **${b.callout}.** ${b.text}\n\n`;
    if (b.code) md += fence(b.code, 'dataweave') + '\n\n';
    if (b.shape) md += fence(b.shape) + '\n\n';
    if (b.diagram) md += '`' + b.steps.join('  →  ') + '`\n\n';
  }
  if (l.interactive) md += `**Interactive:** ${l.interactive.label ?? l.interactive.kind}\n\n`;
  for (const ex of l.examples ?? []) {
    md += `**Example: ${ex.label}**${ex.fails ? ' (fails on purpose)' : ''}\n\n${fence(ex.script, 'dataweave')}\n\n`;
    if (!ex.fails) md += `Output:\n${fence(ex.output)}\n\n`;
  }
  const c = l.check;
  md += `**Check:** ${c.question ?? c.prompt}\n\n`;
  if (c.kind === 'choice') md += c.options.map((o) => `- ${o.correct ? '**✓**' : '✗'} ${o.text}: ${o.why}`).join('\n') + '\n\n';
  else md += `Graded against ${c.cases.length} inputs. Reference answer:\n${fence(c.solution, 'dataweave')}\n\nHints: ${c.hints.map((h) => `(${c.hints.indexOf(h) + 1}) ${h}`).join(' ')}\n\n${c.finish ? `On passing: ${c.finish}\n\n` : ''}`;
}
writeFileSync('docs/academy-chapter0.md', md);
console.log('wrote docs/academy-chapter0.md', md.split(/\s+/).length, 'words');
