/**
 * What you have actually done, over time.
 *
 * This is deliberately a different thing from the points and best-times that
 * came out: those compared you to nobody and measured nothing. Your own
 * activity is true data about you, and a goal you set yourself is measured
 * against your own intention rather than a leaderboard. So it is worth keeping
 * — and worth keeping honestly.
 *
 * Pure functions over a plain event log, so the charts and the nudge can be
 * tested without a browser.
 */

/**
 * Where this lives. Declared here rather than in the Practice screen so the
 * app shell can read them for the daily nudge without importing (and therefore
 * eagerly loading) the whole lazy screen.
 */
export const ACTIVITY_KEY = 'dw-practice-activity-v1';
/** Questions a day you asked yourself for. 0 means no goal, and no nudging. */
export const GOAL_KEY = 'dw-practice-goal-v1';
/** The day the nudge last appeared, so it appears at most once a day. */
export const NUDGED_KEY = 'dw-practice-nudged-v1';

/** One submission. `solved` is whether that submission passed every case. */
export interface ActivityEvent {
  /** Epoch milliseconds. */
  t: number;
  id: string;
  solved: boolean;
}

/**
 * Local calendar day as `YYYY-MM-DD`.
 *
 * Local, not UTC: "today" has to mean the day the person is living in, or
 * somebody practising at 9pm in Asia/Kolkata sees their work land on tomorrow.
 */
export function dayKey(t: number | Date): string {
  const d = t instanceof Date ? t : new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `n` days before `from`, as a day key. */
export function dayBefore(from: Date, n: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return dayKey(d);
}

/**
 * Distinct questions solved per day.
 *
 * Distinct on purpose: re-submitting a correct answer four times is one
 * question's worth of practice, and counting it as four would let the chart
 * flatter you. Keyed by day, so a day with no practice is simply absent.
 */
export function solvedPerDay(events: ActivityEvent[]): Record<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.solved) continue;
    const day = dayKey(e.t);
    if (!seen.has(day)) seen.set(day, new Set());
    seen.get(day)!.add(e.id);
  }
  const out: Record<string, number> = {};
  for (const [day, ids] of seen) out[day] = ids.size;
  return out;
}

/** The last `days` days ending today, oldest first, zero-filled. */
export function recentDays(
  events: ActivityEvent[],
  days: number,
  today: Date = new Date(),
): { day: string; count: number }[] {
  const perDay = solvedPerDay(events);
  const out: { day: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayBefore(today, i);
    out.push({ day, count: perDay[day] ?? 0 });
  }
  return out;
}

/** Today, yesterday, this calendar month, this calendar year. */
export function activitySummary(events: ActivityEvent[], today: Date = new Date()) {
  const perDay = solvedPerDay(events);
  const todayKey = dayKey(today);
  const monthPrefix = todayKey.slice(0, 7);
  const yearPrefix = todayKey.slice(0, 4);
  let month = 0;
  let year = 0;
  for (const [day, n] of Object.entries(perDay)) {
    if (day.startsWith(monthPrefix)) month += n;
    if (day.startsWith(yearPrefix)) year += n;
  }
  return {
    today: perDay[todayKey] ?? 0,
    yesterday: perDay[dayBefore(today, 1)] ?? 0,
    month,
    year,
  };
}

/**
 * How many days in a row the goal was met, counting back from today.
 *
 * Today not being done yet does NOT break the streak — the day is still
 * running, and a counter that resets every midnight and only comes back after
 * you practise would spend most of its life telling you that you had failed.
 * It breaks on the first *completed* day that missed.
 */
export function goalStreak(
  events: ActivityEvent[],
  goalPerDay: number,
  today: Date = new Date(),
): number {
  if (goalPerDay <= 0) return 0;
  const perDay = solvedPerDay(events);
  let streak = 0;
  const metToday = (perDay[dayKey(today)] ?? 0) >= goalPerDay;
  if (metToday) streak = 1;
  for (let i = 1; ; i++) {
    if ((perDay[dayBefore(today, i)] ?? 0) >= goalPerDay) streak++;
    else break;
  }
  return streak;
}

/**
 * Should the nudge appear?
 *
 * Only when a goal has been set, the day is short of it, and it has not
 * already been shown today. A reminder that reappears every time the window
 * regains focus is how a helpful nudge turns into something people disable.
 */
export function shouldNudge(
  events: ActivityEvent[],
  goalPerDay: number,
  lastShownDay: string | null,
  today: Date = new Date(),
): boolean {
  if (goalPerDay <= 0) return false;
  if (lastShownDay === dayKey(today)) return false;
  return (solvedPerDay(events)[dayKey(today)] ?? 0) < goalPerDay;
}

/**
 * Keep the log from growing without bound.
 *
 * A submission every few seconds for a year is still only tens of thousands of
 * rows, but localStorage is a small budget shared with everything else in the
 * app, so the oldest are dropped once it gets silly.
 */
export function trimLog(events: ActivityEvent[], max = 4000): ActivityEvent[] {
  return events.length <= max ? events : events.slice(events.length - max);
}

/** Read the log defensively — it is user-editable storage, not our data. */
export function readActivity(): ActivityEvent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** The daily goal, or 0 when there isn't one. */
export function readGoal(): number {
  try {
    return Number(localStorage.getItem(GOAL_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}
