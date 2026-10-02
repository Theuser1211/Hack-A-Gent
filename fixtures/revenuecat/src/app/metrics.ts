import type { FocusSession } from './data.js';

export interface DayBucket {
  date: string;
  label: string;
  minutes: number;
  count: number;
}

export interface FocusMetrics {
  todayMinutes: number;
  todayCount: number;
  weekMinutes: number;
  weekCount: number;
  avgSessionMin: number;
  streakDays: number;
  topDay: DayBucket | null;
  byDay: DayBucket[];
  insights: string[];
}

function startOfDay(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

export function computeMetrics(sessions: FocusSession[], now = new Date()): FocusMetrics {
  const todayStart = startOfDay(now);
  const weekStart = startOfDay(new Date(now.getTime() - 6 * 86400000));

  const inDay = (ts: number, start: number) => ts >= start && ts < start + 86400000;

  const today = sessions.filter((s) => inDay(Date.parse(s.startedAt), todayStart));
  const week = sessions.filter((s) => Date.parse(s.startedAt) >= weekStart);

  const byDay: DayBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86400000);
    const start = startOfDay(day);
    const daySessions = sessions.filter((s) => inDay(Date.parse(s.startedAt), start));
    byDay.push({
      date: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString(undefined, { weekday: 'short' }),
      minutes: Math.round(daySessions.reduce((a, s) => a + s.durationSec, 0) / 60),
      count: daySessions.length,
    });
  }

  const topDay = byDay.reduce<DayBucket | null>(
    (best, d) => (best === null || d.minutes > best.minutes ? d : best),
    null,
  );

  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const start = startOfDay(new Date(now.getTime() - i * 86400000));
    const has = sessions.some((s) => inDay(Date.parse(s.startedAt), start));
    if (has) streak++;
    else if (i === 0) continue; // today can be in progress
    else break;
  }

  const avg = week.length ? week.reduce((a, s) => a + s.durationSec, 0) / week.length / 60 : 0;
  const tags = new Map<string, number>();
  for (const s of week) tags.set(s.tag, (tags.get(s.tag) ?? 0) + 1);

  const insights: string[] = [];
  if (streak >= 3) insights.push(`You're on a ${streak}-day focus streak.`);
  if (topDay && topDay.minutes > 0) insights.push(`Your most productive day was ${topDay.label} (${topDay.minutes} min).`);
  const bestTag = [...tags.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bestTag && bestTag[1] >= 2) insights.push(`"${bestTag[0]}" shows up most often in your sessions.`);
  insights.push(
    avg > 30 ? 'Your average session runs longer than 30 minutes — great depth.' : 'Try one deep-work block tomorrow to build momentum.',
  );

  return {
    todayMinutes: Math.round(today.reduce((a, s) => a + s.durationSec, 0) / 60),
    todayCount: today.length,
    weekMinutes: Math.round(week.reduce((a, s) => a + s.durationSec, 0) / 60),
    weekCount: week.length,
    avgSessionMin: Math.round(avg),
    streakDays: streak,
    topDay,
    byDay,
    insights,
  };
}
