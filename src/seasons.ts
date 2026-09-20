/**
 * Seasonal themes — what day it is decides how the app greets you.
 *
 * Two rules shaped this. The splash is the only place decoration is free: the
 * app is already sitting there waiting for the JVM, so a themed loader costs
 * nothing anyone was going to use. And the effects that run inside the app stay
 * on the chrome — bars, empty space, Settings — never over an editor, because
 * the one thing worse than no confetti is confetti on the line you're reading.
 *
 * Nothing here changes a setting behind your back. A season paints the splash;
 * keeping its accent is a question you answer once, and the answer sticks for
 * that festival that year.
 */
import { Accent } from './accents';

export type EffectKind = 'snow' | 'diyas' | 'colors' | 'bats' | 'blood' | 'sparks' | 'pumpkins';

export interface Season {
  id: string;
  /** Shown in Settings and in the offer. */
  name: string;
  /** The line on the splash. Plain, never exclamatory twice over. */
  greeting: string;
  accent: Accent;
  /** Layers, drawn together. A festival is rarely one thing: Halloween is
   *  pumpkins and bats, Diwali is lamps and fireworks. */
  effects: EffectKind[];
  /** Applied along with the accent when the offer is accepted. */
  prefer?: 'dark' | 'light';
}

export const SEASONS: Record<string, Season> = {
  diwali: {
    id: 'diwali',
    name: 'Diwali',
    greeting: 'Happy Diwali',
    accent: { hue: 75, chroma: 0.15 },
    effects: ['diyas', 'sparks'],
    prefer: 'dark',
  },
  holi: {
    id: 'holi',
    name: 'Holi',
    greeting: 'Happy Holi',
    accent: { hue: 330, chroma: 0.19 },
    effects: ['colors'],
    prefer: 'light',
  },
  halloween: {
    id: 'halloween',
    name: 'Halloween',
    greeting: 'Happy Halloween',
    accent: { hue: 55, chroma: 0.17 },
    effects: ['pumpkins', 'bats'],
    prefer: 'dark',
  },
  christmas: {
    id: 'christmas',
    name: 'Christmas',
    greeting: 'Merry Christmas',
    accent: { hue: 145, chroma: 0.14 },
    effects: ['snow'],
  },
  newyear: {
    id: 'newyear',
    name: 'New Year',
    greeting: 'Happy New Year',
    accent: { hue: 265, chroma: 0.15 },
    effects: ['sparks'],
    prefer: 'dark',
  },
  /** Not seasonal — the one you can just switch on. Paper + blood. */
  vampire: {
    id: 'vampire',
    name: 'Vampire',
    greeting: 'Good evening',
    accent: { hue: 20, chroma: 0.19 },
    effects: ['blood', 'bats'],
    prefer: 'light',
  },
};

/**
 * Diwali and Holi are lunisolar: they move every year and there is no formula
 * worth carrying — working them out properly needs an ephemeris, and an
 * approximation that lands a day early is worse than nothing. So: a table,
 * checked against drikpanchang and diwali.info rather than recalled.
 *
 * Diwali is the Lakshmi Puja day; the window below covers the five-day festival
 * around it. Holi is Rangwali Holi, with Holika Dahan the evening before.
 *
 * When the table runs out, no festival fires and nothing breaks — which is the
 * right failure. Top it up when it gets thin.
 */
const DIWALI: Record<number, string> = {
  2026: '11-08', 2027: '10-29', 2028: '10-17', 2029: '11-05',
  2030: '10-26', 2031: '11-14', 2032: '11-02', 2033: '10-22',
};

const HOLI: Record<number, string> = {
  2027: '03-22', 2028: '03-11', 2029: '03-01', 2030: '03-20',
};

/** Days either side of the dated day that still count as the festival. */
const DIWALI_WINDOW = { before: 2, after: 2 };
const HOLI_WINDOW = { before: 1, after: 0 };

function daysBetween(a: Date, b: Date): number {
  const dayA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const dayB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((dayA - dayB) / 86400000);
}

function inTableWindow(
  now: Date,
  table: Record<number, string>,
  window: { before: number; after: number },
): boolean {
  // Check this year and the one before, so a festival in the first days of
  // January (which cannot happen for these two, but can for a future entry)
  // still resolves.
  for (const year of [now.getFullYear(), now.getFullYear() - 1]) {
    const entry = table[year];
    if (!entry) continue;
    const [month, day] = entry.split('-').map(Number);
    const diff = daysBetween(now, new Date(year, month - 1, day));
    if (diff >= -window.before && diff <= window.after) return true;
  }
  return false;
}

/** Which festival, if any, today falls in. */
export function currentSeason(now: Date = new Date()): Season | null {
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (inTableWindow(now, DIWALI, DIWALI_WINDOW)) return SEASONS.diwali;
  if (inTableWindow(now, HOLI, HOLI_WINDOW)) return SEASONS.holi;

  // Fixed dates. Halloween runs the last week of October; Christmas the week
  // around the day itself; New Year straddles the year boundary, which is why
  // it is two checks.
  if (month === 10 && day >= 25) return SEASONS.halloween;
  if (month === 12 && day >= 18 && day <= 26) return SEASONS.christmas;
  if ((month === 12 && day >= 29) || (month === 1 && day <= 2)) return SEASONS.newyear;

  return null;
}

// ── Preferences ───────────────────────────────────────────────────────────
// All three keys are read through try/catch: a webview with site data blocked
// throws on access, and a festival is not worth a blank screen.

const ENABLED_KEY = 'dw.seasonal';
const PINNED_KEY = 'dw.seasonalPinned';
const ANSWER_PREFIX = 'dw.seasonalAnswer.';

/** Seasonal decoration on at all. Default on; Settings can kill it. */
export function seasonalEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) !== '0'; } catch { return true; }
}

export function setSeasonalEnabled(on: boolean): void {
  try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/** A theme the user picked by hand, which outranks the calendar. */
export function pinnedSeason(): Season | null {
  try {
    const id = localStorage.getItem(PINNED_KEY);
    return id ? SEASONS[id] ?? null : null;
  } catch { return null; }
}

export function setPinnedSeason(id: string | null): void {
  try {
    if (id) localStorage.setItem(PINNED_KEY, id);
    else localStorage.removeItem(PINNED_KEY);
  } catch { /* ignore */ }
}

/** What the app should be wearing right now, pin first, then the calendar. */
export function activeSeason(now: Date = new Date()): Season | null {
  if (!seasonalEnabled()) return null;
  return pinnedSeason() ?? currentSeason(now);
}

/** Whether the "keep this theme?" offer has already been answered this year.
 *  Keyed by year so the same festival asks again next time round. */
export function offerAnswered(season: Season, now: Date = new Date()): boolean {
  try { return !!localStorage.getItem(ANSWER_PREFIX + season.id + '.' + now.getFullYear()); }
  catch { return true; }
}

export function recordOfferAnswer(season: Season, answer: 'kept' | 'declined', now: Date = new Date()): void {
  try { localStorage.setItem(ANSWER_PREFIX + season.id + '.' + now.getFullYear(), answer); }
  catch { /* ignore */ }
}
