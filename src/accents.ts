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
export function applyAccentVars(accent: Accent, isDark: boolean): void {
  const root = document.documentElement;
  const l = isDark ? 72 : 55;
  const hoverL = isDark ? 78 : 50;
  root.style.setProperty('--accent', `oklch(${l}% ${accent.chroma} ${accent.hue})`);
  root.style.setProperty('--accent-hover', `oklch(${hoverL}% ${accent.chroma} ${accent.hue})`);
  root.style.setProperty('--accent-dim', `oklch(${l}% ${accent.chroma} ${accent.hue} / 0.14)`);
  root.style.setProperty('--accent-border', `oklch(${l}% ${accent.chroma} ${accent.hue} / 0.32)`);
}
