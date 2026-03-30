import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const logoSvg = readFileSync(resolve(root, 'public/logo.svg'));
const iconsDir = resolve(root, 'src-tauri/icons');

// --- Sidebar: 164x314 ---
async function generateSidebar() {
  // Render logo SVG at 100x100
  const logoPng = await sharp(logoSvg)
    .resize(100, 100, { fit: 'contain', background: { r: 8, g: 12, b: 24, alpha: 1 } })
    .png()
    .toBuffer();

  // "DataWeave" text as SVG
  const titleSvg = Buffer.from(`
    <svg width="140" height="22" xmlns="http://www.w3.org/2000/svg">
      <text x="70" y="17" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="17"
        fill="#00a0df">DataWeave</text>
    </svg>
  `);

  // "Studio" text as SVG
  const subtitleSvg = Buffer.from(`
    <svg width="140" height="18" xmlns="http://www.w3.org/2000/svg">
      <text x="70" y="14" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-weight="400" font-size="14"
        fill="#8888aa">Studio</text>
    </svg>
  `);

  // Gradient accent line as SVG
  const lineSvg = Buffer.from(`
    <svg width="120" height="3" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#00D4FF" stop-opacity="0"/>
          <stop offset="50%" stop-color="#00a0df"/>
          <stop offset="100%" stop-color="#7C3AED" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="120" height="1" y="1" rx="1" fill="url(#lg)"/>
    </svg>
  `);

  // "v1.0.0" version text
  const versionSvg = Buffer.from(`
    <svg width="140" height="14" xmlns="http://www.w3.org/2000/svg">
      <text x="70" y="11" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-weight="400" font-size="10"
        fill="#444466">v1.0.0</text>
    </svg>
  `);

  const sidebar = await sharp({
    create: {
      width: 164,
      height: 314,
      channels: 3,
      background: { r: 8, g: 12, b: 24 },
    }
  })
    .composite([
      { input: logoPng, top: 30, left: 32 },
      { input: await sharp(titleSvg).png().toBuffer(), top: 145, left: 12 },
      { input: await sharp(subtitleSvg).png().toBuffer(), top: 168, left: 12 },
      { input: await sharp(lineSvg).png().toBuffer(), top: 192, left: 22 },
      { input: await sharp(versionSvg).png().toBuffer(), top: 200, left: 12 },
    ])
    .removeAlpha()
    .png()
    .toBuffer();

  // Convert PNG to 24-bit BMP manually (sharp doesn't output BMP)
  const { data, info } = await sharp(sidebar).raw().toBuffer({ resolveWithObject: true });
  const bmp = rawToBMP(data, info.width, info.height, info.channels);
  writeFileSync(resolve(iconsDir, 'nsis-sidebar.bmp'), bmp);
  console.log(`Created nsis-sidebar.bmp (${info.width}x${info.height})`);
}

// --- Header: 150x57 ---
async function generateHeader() {
  // Small logo
  const logoSmall = await sharp(logoSvg)
    .resize(40, 40, { fit: 'contain', background: { r: 8, g: 12, b: 24, alpha: 1 } })
    .png()
    .toBuffer();

  // Title text
  const titleSvg = Buffer.from(`
    <svg width="100" height="20" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="15"
        font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="13"
        fill="#e0e0e8">DataWeave Studio</text>
    </svg>
  `);

  // Subtitle
  const subSvg = Buffer.from(`
    <svg width="100" height="14" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="10"
        font-family="Segoe UI, Arial, sans-serif" font-weight="400" font-size="9"
        fill="#00a0df">Desktop Edition</text>
    </svg>
  `);

  const header = await sharp({
    create: {
      width: 150,
      height: 57,
      channels: 3,
      background: { r: 8, g: 12, b: 24 },
    }
  })
    .composite([
      { input: logoSmall, top: 8, left: 4 },
      { input: await sharp(titleSvg).png().toBuffer(), top: 12, left: 48 },
      { input: await sharp(subSvg).png().toBuffer(), top: 32, left: 48 },
    ])
    .removeAlpha()
    .png()
    .toBuffer();

  const { data, info } = await sharp(header).raw().toBuffer({ resolveWithObject: true });
  const bmp = rawToBMP(data, info.width, info.height, info.channels);
  writeFileSync(resolve(iconsDir, 'nsis-header.bmp'), bmp);
  console.log(`Created nsis-header.bmp (${info.width}x${info.height})`);
}

// Convert raw RGB/RGBA pixel data to 24-bit BMP
function rawToBMP(data, width, height, channels) {
  const rowSize = Math.ceil(width * 3 / 4) * 4;
  const imageSize = rowSize * height;
  const fileSize = 54 + imageSize;
  const buf = Buffer.alloc(fileSize);

  // BMP file header
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);

  // DIB header
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(imageSize, 34);
  buf.writeUInt32LE(2835, 38); // ~72 DPI
  buf.writeUInt32LE(2835, 42);

  // BMP rows are bottom-up
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * channels;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const si = srcRow + x * channels;
      const di = dstRow + x * 3;
      buf[di] = data[si + 2];     // B
      buf[di + 1] = data[si + 1]; // G
      buf[di + 2] = data[si];     // R
    }
  }

  return buf;
}

await generateSidebar();
await generateHeader();
console.log('Done!');
