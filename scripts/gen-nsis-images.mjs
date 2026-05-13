/**
 * Generate NSIS installer sidebar (164×314) and header (150×57) BMP images.
 * No hardcoded version — the installer gets that from tauri.conf.json.
 *
 * Run: node scripts/gen-nsis-images.mjs
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const logoSvg = readFileSync(resolve(root, 'public/logo.svg'), 'utf8');

// ── Sidebar: 164 × 314 ─────────────────────────────────────────────
const sidebarSvg = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
  <rect width="164" height="314" fill="#0f1117"/>
  <!-- Subtle gradient glow -->
  <defs>
    <radialGradient id="glow" cx="50%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="164" height="314" fill="url(#glow)"/>
  <!-- Accent line at top -->
  <rect x="30" y="0" width="104" height="2" rx="1" fill="#10b981" opacity="0.6"/>
  <!-- App name -->
  <text x="82" y="240" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="18" font-weight="700" fill="#e8e4db" letter-spacing="0.3">DataWeave</text>
  <text x="82" y="264" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="18" font-weight="700" fill="#5eead4" letter-spacing="0.3">Studio</text>
  <!-- Thin separator -->
  <line x1="50" y1="280" x2="114" y2="280" stroke="#e8e4db" stroke-opacity="0.15" stroke-width="1"/>
  <!-- Subtitle -->
  <text x="82" y="298" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="9" fill="#e8e4db" opacity="0.4" letter-spacing="0.5">Desktop Edition</text>
</svg>`;

// ── Header: 150 × 57 ───────────────────────────────────────────────
const headerSvg = `<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
  <rect width="150" height="57" fill="#0f1117"/>
  <text x="75" y="30" text-anchor="middle" dominant-baseline="central" font-family="Segoe UI, sans-serif" font-size="13" font-weight="600" fill="#e8e4db" letter-spacing="0.3">
    <tspan fill="#e8e4db">DataWeave </tspan><tspan fill="#5eead4">Studio</tspan>
  </text>
  <!-- Bottom accent line -->
  <rect x="0" y="55" width="150" height="2" fill="#10b981" opacity="0.4"/>
</svg>`;

// Also composite the logo onto the sidebar
const logoPng = await sharp(Buffer.from(logoSvg))
  .resize(80, 80, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const sidebarBase = await sharp(Buffer.from(sidebarSvg))
  .png()
  .toBuffer();

// Output as PNG (sharp can't write BMP), then convert via PowerShell
const sidebarOut = resolve(root, 'src-tauri/icons/nsis-sidebar.png');
const headerOut = resolve(root, 'src-tauri/icons/nsis-header.png');

await sharp(sidebarBase)
  .composite([{ input: logoPng, left: 42, top: 110 }])
  .png()
  .toFile(sidebarOut);
console.log('✓ nsis-sidebar.png');

await sharp(Buffer.from(headerSvg))
  .png()
  .toFile(headerOut);
console.log('✓ nsis-header.png');

console.log('\nConvert to BMP with:');
console.log(`powershell -Command "Add-Type -AssemblyName System.Drawing; [System.Drawing.Bitmap]::new('${sidebarOut}').Save('${sidebarOut.replace('.png','.bmp')}', [System.Drawing.Imaging.ImageFormat]::Bmp); [System.Drawing.Bitmap]::new('${headerOut}').Save('${headerOut.replace('.png','.bmp')}', [System.Drawing.Imaging.ImageFormat]::Bmp)"`);
