import { describe, it, expect } from 'vitest';
import { HackathonPlanner } from '../../cli/planner.js';
import type { HackathonContext } from '../../cli/hackathon-context.js';

function makeCtx(overrides: Partial<HackathonContext> = {}): HackathonContext {
  return {
    title: 'Test Hackathon',
    organizer: 'TestOrg',
    projectName: 'test-project',
    deadline: '',
    hoursRemaining: 5,
    hoursRemainingKnown: true,
    teamSize: 1,
    teamSizeFixed: true,
    preferredStack: [],
    stackDetected: false,
    sponsorPrizes: [],
    judgingCriteria: [],
    requiredAPIs: [],
    restrictions: [],
    hasExistingRepo: false,
    source: 'https://test.devpost.com',
    ...overrides,
  };
}

describe('buildTimeline', () => {
  it('formats 2h timeline correctly', () => {
    const planner = new HackathonPlanner(makeCtx({ hoursRemaining: 2 }));
    const plan = planner.plan();
    for (const t of plan.timeline) {
      // Should not contain "0:NN" format (which is MM:SS, invalid for hours)
      expect(t).not.toMatch(/0:\d{2,}/);
      // Should use Xm or Xh Ym format
      expect(t).toMatch(/\d+[mh]/);
    }
  });

  it('formats 5h timeline correctly', () => {
    const planner = new HackathonPlanner(makeCtx({ hoursRemaining: 5 }));
    const plan = planner.plan();
    for (const t of plan.timeline) {
      expect(t).not.toMatch(/0:\d{2,}/);
      expect(t).toMatch(/\d+[mh]/);
    }
  });

  it('formats 11h timeline correctly', () => {
    const planner = new HackathonPlanner(makeCtx({ hoursRemaining: 11 }));
    const plan = planner.plan();
    for (const t of plan.timeline) {
      expect(t).not.toMatch(/0:\d{2,}/);
    }
    // 11h > 8h, so uses Phase format
    expect(plan.timeline[0]).toMatch(/^Phase 1/);
  });

  it('formats 24h timeline correctly', () => {
    const planner = new HackathonPlanner(makeCtx({ hoursRemaining: 24 }));
    const plan = planner.plan();
    for (const t of plan.timeline) {
      expect(t).not.toMatch(/0:\d{2,}/);
    }
    expect(plan.timeline[0]).toMatch(/^Phase 1/);
    expect(plan.timeline[1]).toMatch(/^Phase 2/);
    expect(plan.timeline[2]).toMatch(/^Phase 3/);
  });

  it('formats 48h timeline correctly', () => {
    const planner = new HackathonPlanner(makeCtx({ hoursRemaining: 48 }));
    const plan = planner.plan();
    for (const t of plan.timeline) {
      expect(t).not.toMatch(/0:\d{2,}/);
    }
    expect(plan.timeline[0]).toMatch(/^Phase 1/);
  });

  it('formats 1h timeline correctly', () => {
    const planner = new HackathonPlanner(makeCtx({ hoursRemaining: 1 }));
    const plan = planner.plan();
    for (const t of plan.timeline) {
      expect(t).not.toMatch(/0:\d{2,}/);
      expect(t).toMatch(/\d+[mh]/);
    }
  });
});
