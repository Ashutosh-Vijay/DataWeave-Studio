/**
 * Generate the MSIX tile/logo assets in Assets/ from the app icon.
 *
 * `winapp init` drops generic placeholder tiles; those would ship as the app's
 * face in the Microsoft Store. Tauri already renders proper Windows logo sizes
 * into src-tauri/icons/, so build the Store assets from those instead.
 *
 * Re-run after changing the app icon:  node scripts/gen-msix-assets.mjs
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const icons = (n) => path.join(ROOT, 'src-tauri', 'icons', n);
const out = (n) => path.join(ROOT, 'Assets', n);

const MASTER = icons('Square310x310Logo.png');

// Square tiles. Prefer a purpose-built source at the exact size (sharper at
// small sizes than downscaling the 310px master), else scale the master.
const squares = [
  ['AppList.png', 44, icons('Square44x44Logo.png')],
  ['AppList.scale-200.png', 88, MASTER],
  ['AppList.targetsize-24_altform-unplated.png', 24, icons('Square44x44Logo.png')],
  ['MedTile.png', 150, icons('Square150x150Logo.png')],
  ['MedTile.scale-200.png', 300, MASTER],
  ['StoreLogo.png', 50, icons('Square71x71Logo.png')],
];

// Wide tiles: the logo is square, so centre it on a transparent canvas at the
// tile's aspect ratio rather than stretching it. ~62% of height keeps the
// safe margin Windows expects around tile artwork.
const wides = [
  ['WideTile.png', 310, 150],
  ['WideTile.scale-200.png', 620, 300],
];

for (const [name, size, src] of squares) {
  await sharp(src).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(out(name));
  console.log(`${name}  ${size}x${size}`);
}

for (const [name, w, h] of wides) {
  const logo = Math.round(h * 0.62);
  const scaled = await sharp(MASTER).resize(logo, logo, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png().toFile(out(name));
  console.log(`${name}  ${w}x${h} (logo ${logo}px, centred)`);
}
