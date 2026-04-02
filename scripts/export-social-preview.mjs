import { readFileSync, writeFileSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(new URL('../docs/social-preview.svg', import.meta.url), 'utf8');

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1280 },
});

const pngData = resvg.render();
const pngBuffer = pngData.asPng();

writeFileSync(new URL('../docs/social-preview.png', import.meta.url), pngBuffer);
console.log('Exported docs/social-preview.png (1280x640)');
