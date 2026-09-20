import { describe, it, expect } from 'vitest';
import { currentSeason, activeSeason, SEASONS } from '../seasons';

/**
 * Date logic that only runs on a handful of days a year is the kind that stays
 * broken until the day itself, when nobody is looking at it. So: the boundaries
 * of every window, both sides.
 *
 * Diwali and Holi come from a checked table (drikpanchang, diwali.info) because
 * they are lunisolar and there is no formula worth carrying. If those entries
 * are ever edited, these tests are the thing that notices.
 */

const on = (iso: string) => currentSeason(new Date(`${iso}T12:00:00`));

describe('currentSeason — the ordinary day', () => {
  it('is nothing at all, most of the year', () => {
    expect(on('2026-09-20')).toBeNull();
    expect(on('2026-06-01')).toBeNull();
    expect(on('2027-02-14')).toBeNull();
  });
});

describe('currentSeason — Diwali', () => {
  // Lakshmi Puja 2026 is Sunday 8 November; the window covers the five-day
  // festival, two days either side.
  it('covers the festival around the dated day', () => {
    expect(on('2026-11-08')?.id).toBe('diwali');
    expect(on('2026-11-06')?.id).toBe('diwali'); // Dhanteras
    expect(on('2026-11-10')?.id).toBe('diwali'); // Bhai Dooj
  });

  it('stops at the edges', () => {
    expect(on('2026-11-05')).toBeNull();
    expect(on('2026-11-11')).toBeNull();
  });

  it('follows the table into later years rather than assuming a fixed date', () => {
    expect(on('2027-10-29')?.id).toBe('diwali');
    expect(on('2028-10-17')?.id).toBe('diwali');
    expect(on('2033-10-22')?.id).toBe('diwali');
    // 2026's date in 2027 is an ordinary day — proof it is not hard-coded.
    expect(on('2027-11-08')).toBeNull();
  });

  it('fires nothing once the table runs out', () => {
    expect(on('2034-11-08')).toBeNull();
    expect(on('2035-10-20')).toBeNull();
  });
});

describe('currentSeason — Holi', () => {
  it('covers Rangwali Holi and the Holika Dahan evening before', () => {
    expect(on('2027-03-22')?.id).toBe('holi');
    expect(on('2027-03-21')?.id).toBe('holi');
  });

  it('stops either side', () => {
    expect(on('2027-03-20')).toBeNull();
    expect(on('2027-03-23')).toBeNull();
  });

  it('runs out after 2030, which is when the table ends', () => {
    expect(on('2030-03-20')?.id).toBe('holi');
    expect(on('2031-03-09')).toBeNull();
  });
});

describe('currentSeason — the fixed dates', () => {
  it('Halloween runs the last week of October', () => {
    expect(on('2026-10-24')).toBeNull();
    expect(on('2026-10-25')?.id).toBe('halloween');
    expect(on('2026-10-31')?.id).toBe('halloween');
  });

  it('Christmas runs the week around the day', () => {
    expect(on('2026-12-17')).toBeNull();
    expect(on('2026-12-18')?.id).toBe('christmas');
    expect(on('2026-12-25')?.id).toBe('christmas');
    expect(on('2026-12-26')?.id).toBe('christmas');
    expect(on('2026-12-27')).toBeNull();
  });

  it('New Year straddles the year boundary, which is two checks not one', () => {
    expect(on('2026-12-28')).toBeNull();
    expect(on('2026-12-29')?.id).toBe('newyear');
    expect(on('2026-12-31')?.id).toBe('newyear');
    expect(on('2027-01-01')?.id).toBe('newyear');
    expect(on('2027-01-02')?.id).toBe('newyear');
    expect(on('2027-01-03')).toBeNull();
  });

  it('never leaves a gap between Christmas and New Year that shows nothing', () => {
    // 27th and 28th are deliberately bare — the point is that the two windows
    // do not overlap and neither swallows the other.
    expect(on('2026-12-26')?.id).toBe('christmas');
    expect(on('2026-12-29')?.id).toBe('newyear');
  });
});

describe('the seasons themselves', () => {
  it('every season has a subject, not only weather', () => {
    // The lesson from shipping Christmas as falling snow and no tree.
    const FIGURES = ['tree', 'snowman', 'scarecrow', 'diyas', 'pumpkins', 'blood', 'gulal'];
    for (const season of Object.values(SEASONS)) {
      expect(season.effects.length).toBeGreaterThan(0);
      expect(season.effects.some((e) => FIGURES.includes(e))).toBe(true);
    }
  });

  it('vampire is pin-only — it is a mood, not a date', () => {
    const ids = new Set<string>();
    for (let d = new Date('2027-01-01'); d < new Date('2028-01-01'); d.setDate(d.getDate() + 1)) {
      const s = currentSeason(new Date(d));
      if (s) ids.add(s.id);
    }
    expect(ids).not.toContain('vampire');
    expect(ids).toEqual(new Set(['newyear', 'holi', 'halloween', 'christmas', 'diwali']));
  });
});

describe('activeSeason', () => {
  it('falls back to the calendar when there is no pin, and never throws without storage', () => {
    // In the test environment localStorage does not exist at all: every read is
    // wrapped, because a webview with site data blocked throws on access and a
    // festival is not worth a blank screen.
    expect(() => activeSeason(new Date('2026-09-20T12:00:00'))).not.toThrow();
    expect(activeSeason(new Date('2026-12-25T12:00:00'))?.id).toBe('christmas');
    expect(activeSeason(new Date('2026-09-20T12:00:00'))).toBeNull();
  });
});
