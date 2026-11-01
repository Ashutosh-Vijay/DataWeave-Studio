/**
 * The accent palette, in one place.
 *
 * Three callers need it and used to each carry their own copy: `main.tsx`
 * (applies the saved accent before React mounts, so the first paint is right),
 * `SettingsScreen` (the picker), and the seasonal themes. A fourth copy of the
 * same five hue/chroma pairs was where a wrong shade was going to creep in.
 */

export interface Accent {
  hue: number;
  chroma: number;
}

/** The named accents offered in Settings. Seasons can use a hue of their own. */
export const ACCENTS: (Accent & { id: string; name: string })[] = [
  { id: 'emerald', hue: 158, chroma: 0.15, name: 'Emerald' },
  { id: 'sky', hue: 220, chroma: 0.13, name: 'Sky' },
  { id: 'violet', hue: 290, chroma: 0.14, name: 'Violet' },
  { id: 'amber', hue: 80, chroma: 0.14, name: 'Amber' },
  { id: 'rose', hue: 20, chroma: 0.18, name: 'Rose' },
];

/**
 * Write an accent into the CSS variables everything else reads.
 *
 * Light and dark need different lightness for the same hue to stay legible —
 * the dark palette sits at 72% and light at 55%, which is why this takes the
 * theme rather than reading it: `main.tsx` runs before React, when the class on
 * <html> is the only source of truth.
 */
/** WCAG relative luminance of an oklch colour (OKLab -> linear sRGB). */
function luminance(l: number, c: number, hueDeg: number): number {
  const h = (hueDeg * Math.PI) / 180;
  const a = c * Math.cos(h), b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const r = clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
  const g = clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
  const bl = clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

export function applyAccentVars(accent: Accent, isDark: boolean): void {
  const root = document.documentElement;
  const l = isDark ? 72 : 55;
  const hoverL = isDark ? 78 : 50;
  root.style.setProperty('--accent', `oklch(${l}% ${accent.chroma} ${accent.hue})`);
  root.style.setProperty('--accent-hover', `oklch(${hoverL}% ${accent.chroma} ${accent.hue})`);
  root.style.setProperty('--accent-dim', `oklch(${l}% ${accent.chroma} ${accent.hue} / 0.14)`);
  root.style.setProperty('--accent-border', `oklch(${l}% ${accent.chroma} ${accent.hue} / 0.32)`);
  // Text on an accent fill (Run, Save): white on some hues failed contrast, so
  // pick whichever of near-black and white reads better on this exact colour.
  const y = luminance(l / 100, accent.chroma, accent.hue);
  const onWhite = 1.05 / (y + 0.05), onDark = (y + 0.05) / 0.055;
  root.style.setProperty('--accent-ink', onWhite >= onDark ? 'oklch(100% 0 0)' : 'oklch(14% 0.004 80)');
}
