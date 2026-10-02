export interface FocusSession {
  id: string;
  startedAt: string;
  durationSec: number;
  tag: string;
}

export interface DaySeed {
  daysAgo: number;
  sessions: Array<{ durationSec: number; tag: string }>;
}

/**
 * Deterministic seed data so the dashboard never looks empty. The dates are
 * computed relative to today so the "last 7 days" charts always have shape.
 */
const SEED: DaySeed[] = [
  { daysAgo: 13, sessions: [{ durationSec: 25 * 60, tag: 'Deep work' }] },
  { daysAgo: 12, sessions: [{ durationSec: 50 * 60, tag: 'Deep work' }, { durationSec: 20 * 60, tag: 'Planning' }] },
  { daysAgo: 11, sessions: [] },
  { daysAgo: 10, sessions: [{ durationSec: 25 * 60, tag: 'Email' }, { durationSec: 45 * 60, tag: 'Deep work' }] },
  { daysAgo: 9, sessions: [{ durationSec: 50 * 60, tag: 'Deep work' }] },
  { daysAgo: 8, sessions: [{ durationSec: 25 * 60, tag: 'Meetings' }, { durationSec: 25 * 60, tag: 'Deep work' }] },
  { daysAgo: 7, sessions: [{ durationSec: 50 * 60, tag: 'Deep work' }, { durationSec: 25 * 60, tag: 'Reading' }] },
  { daysAgo: 6, sessions: [{ durationSec: 25 * 60, tag: 'Email' }] },
  { daysAgo: 5, sessions: [{ durationSec: 25 * 60, tag: 'Deep work' }, { durationSec: 50 * 60, tag: 'Deep work' }] },
  { daysAgo: 4, sessions: [] },
  { daysAgo: 3, sessions: [{ durationSec: 45 * 60, tag: 'Writing' }] },
  { daysAgo: 2, sessions: [{ durationSec: 50 * 60, tag: 'Deep work' }, { durationSec: 25 * 60, tag: 'Email' }] },
  { daysAgo: 1, sessions: [{ durationSec: 25 * 60, tag: 'Planning' }] },
];

let sessionCounter = 0;

export function seededSessions(): FocusSession[] {
  sessionCounter = 0;
  const out: FocusSession[] = [];
  for (const day of SEED) {
    const dayStart = new Date();
    dayStart.setUTCHours(9, 0, 0, 0);
    dayStart.setUTCDate(dayStart.getUTCDate() - day.daysAgo);
    for (const s of day.sessions) {
      out.push({
        id: `sess_seed_${day.daysAgo}_${sessionCounter++}`,
        startedAt: new Date(dayStart.getTime() + sessionCounter * 1000 * 7).toISOString(),
        durationSec: s.durationSec,
        tag: s.tag,
      });
    }
  }
  return out.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}
