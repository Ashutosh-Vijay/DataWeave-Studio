import { describe, it, expect } from 'vitest';
import {
  dayKey,
  solvedPerDay,
  recentDays,
  activitySummary,
  goalStreak,
  shouldNudge,
  trimLog,
  type ActivityEvent,
} from '../practiceStats';

/**
 * These drive a chart and a reminder, so the two ways they can be wrong are
 * flattering you (counting the same question twice) and nagging you (a streak
 * that resets at midnight, a nudge that fires on every window focus).
 */

/** Local-time event, so the tests mean the same thing in every timezone. */
const at = (y: number, m: number, d: number, hh = 12, id = 'q', solved = true): ActivityEvent => ({
  t: new Date(y, m - 1, d, hh).getTime(),
  id,
  solved,
});
const TODAY = new Date(2026, 8, 23, 21); // 23 Sep 2026, 9pm local

describe('dayKey', () => {
  it('uses the local calendar day, not UTC', () => {
    // 9pm in a +05:30 timezone is already tomorrow in UTC; the person is still
    // having Wednesday, and their practice belongs on Wednesday.
    expect(dayKey(new Date(2026, 8, 23, 21))).toBe('2026-09-23');
    expect(dayKey(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
  });
});

describe('solvedPerDay', () => {
  it('counts a question once a day however many times you submit it', () => {
    const events = [at(2026, 9, 23, 9, 'a'), at(2026, 9, 23, 10, 'a'), at(2026, 9, 23, 11, 'b')];
    expect(solvedPerDay(events)['2026-09-23']).toBe(2);
  });

  it('ignores failed submissions', () => {
    const events = [at(2026, 9, 23, 9, 'a', false), at(2026, 9, 23, 10, 'b', true)];
    expect(solvedPerDay(events)['2026-09-23']).toBe(1);
  });

  it('leaves a day with no practice absent rather than zero', () => {
    expect(solvedPerDay([at(2026, 9, 23)])['2026-09-22']).toBeUndefined();
  });
});

describe('recentDays', () => {
  it('returns the window oldest-first and zero-fills the quiet days', () => {
    const rows = recentDays([at(2026, 9, 23, 12, 'a'), at(2026, 9, 21, 12, 'b')], 4, TODAY);
    expect(rows.map((r) => r.day)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
    expect(rows.map((r) => r.count)).toEqual([0, 1, 0, 1]);
  });

  it('ends on today, so the chart is never stale', () => {
    expect(recentDays([], 3, TODAY).at(-1)?.day).toBe('2026-09-23');
  });
});

describe('activitySummary', () => {
  const events = [
    at(2026, 9, 23, 9, 'a'), at(2026, 9, 23, 10, 'b'),  // today: 2
    at(2026, 9, 22, 9, 'c'),                             // yesterday: 1
    at(2026, 9, 2, 9, 'd'),                              // earlier this month
    at(2026, 3, 2, 9, 'e'),                              // earlier this year
    at(2025, 12, 2, 9, 'f'),                             // last year
  ];

  it('counts today, yesterday, the month and the year', () => {
    expect(activitySummary(events, TODAY)).toEqual({ today: 2, yesterday: 1, month: 4, year: 5 });
  });

  it('uses calendar boundaries, not rolling windows', () => {
    // 1 Jan sees nothing from December, however recent.
    const newYear = new Date(2026, 0, 1, 10);
    expect(activitySummary([at(2025, 12, 31, 23, 'z')], newYear)).toEqual({
      today: 0, yesterday: 1, month: 0, year: 0,
    });
  });
});

describe('goalStreak', () => {
  const daily = (days: number[], id = 'q') =>
    days.flatMap((d, i) => Array.from({ length: d }, (_, n) => at(2026, 9, 23 - i, 12, `${id}${i}-${n}`)));

  it('counts consecutive days that met the goal', () => {
    expect(goalStreak(daily([2, 2, 2]), 2, TODAY)).toBe(3);
  });

  it('does not break the streak just because today is not done yet', () => {
    // The day is still running. A counter that resets at midnight and only
    // returns after you practise would spend most of its life saying you failed.
    expect(goalStreak(daily([0, 2, 2]), 2, TODAY)).toBe(2);
  });

  it('breaks on a completed day that missed', () => {
    expect(goalStreak(daily([2, 1, 2]), 2, TODAY)).toBe(1);
  });

  it('is zero without a goal', () => {
    expect(goalStreak(daily([5, 5]), 0, TODAY)).toBe(0);
  });
});

describe('shouldNudge', () => {
  it('fires when the day is short of the goal', () => {
    expect(shouldNudge([at(2026, 9, 23)], 3, null, TODAY)).toBe(true);
  });

  it('stays quiet once the goal is met', () => {
    const three = [at(2026, 9, 23, 9, 'a'), at(2026, 9, 23, 10, 'b'), at(2026, 9, 23, 11, 'c')];
    expect(shouldNudge(three, 3, null, TODAY)).toBe(false);
  });

  it('only fires once a day, however often the app is opened', () => {
    expect(shouldNudge([], 3, '2026-09-23', TODAY)).toBe(false);
    expect(shouldNudge([], 3, '2026-09-22', TODAY)).toBe(true);
  });

  it('stays quiet when no goal is set', () => {
    expect(shouldNudge([], 0, null, TODAY)).toBe(false);
  });
});

describe('trimLog', () => {
  it('keeps the most recent entries and drops the oldest', () => {
    const many = Array.from({ length: 10 }, (_, i) => at(2026, 9, 1, 12, `q${i}`));
    const kept = trimLog(many, 4);
    expect(kept).toHaveLength(4);
    expect(kept[0].id).toBe('q6');
    expect(kept.at(-1)?.id).toBe('q9');
  });

  it('leaves a short log alone', () => {
    const few = [at(2026, 9, 1)];
    expect(trimLog(few, 4)).toBe(few);
  });
});
