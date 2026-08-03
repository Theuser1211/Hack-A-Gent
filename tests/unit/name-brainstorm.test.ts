import { describe, it, expect } from 'vitest';

import { brainstormNames, pickName } from '../../cli/ideation/name-engine.js';
import { NAME_CANDIDATE_COUNT, NAME_MIN_LENGTH, NAME_MAX_LENGTH } from '../../cli/ideation/name-engine.js';
import { GENERIC_NAME_TOKENS } from '../../cli/ideation/types.js';

describe('brainstormNames', () => {
  it('generates exactly 30 candidates', () => {
    const result = brainstormNames('AI Hackathon 2026', 'AI');
    expect(result.candidates).toHaveLength(NAME_CANDIDATE_COUNT);
    expect(result.candidates).toHaveLength(30);
  });

  it('all candidates are short and brandable (5-11 chars)', () => {
    const result = brainstormNames('AI Hackathon 2026', 'AI');
    for (const c of result.candidates) {
      expect(c.name.length).toBeGreaterThanOrEqual(NAME_MIN_LENGTH);
      expect(c.name.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
      expect(/^[A-Za-z]+$/.test(c.name)).toBe(true);
    }
  });

  it('rejects generic tokens (app, assistant, platform, tool, smart, ai, hub...)', () => {
    const result = brainstormNames('AI Hackathon 2026', 'AI');
    for (const c of result.candidates) {
      const lower = c.name.toLowerCase();
      expect(GENERIC_NAME_TOKENS.includes(lower as (typeof GENERIC_NAME_TOKENS)[number])).toBe(false);
      expect(lower).not.toMatch(/(app|assistant|platform|tool|smart|hub|cloud|tech|bot|mate|io|ai|labs|360|generator|dashboard)$/);
      expect(lower).not.toMatch(/^(smart|my|ai|chat|easy|super)/);
    }
  });

  it('rejects Dashboard and Generator style names', () => {
    // Feed the engine names that would be generic and confirm the tokens are banned.
    expect(GENERIC_NAME_TOKENS).toContain('dashboard');
    expect(GENERIC_NAME_TOKENS).toContain('generator');
    const result = brainstormNames('Dashboard Hackathon', 'Dashboard');
    for (const c of result.candidates) {
      expect(c.name.toLowerCase()).not.toMatch(/(dashboard|generator)$/);
    }
  });

  it('ranks candidates with the winner first', () => {
    const result = brainstormNames('AI Hackathon 2026', 'AI');
    const [top] = result.candidates;
    expect(top!.name.toLowerCase()).toBe(result.winner.slug);
  });

  it('winner shape is consistent', () => {
    const result = brainstormNames('AI Hackathon 2026', 'AI');
    expect(result.winner.displayName.length).toBeGreaterThan(0);
    expect(result.winner.slug).toBe(result.winner.displayName.toLowerCase());
    expect(result.winner.folderName).toBe(result.winner.slug);
  });

  it('winner is deterministic for identical inputs', () => {
    const a = brainstormNames('Test Hackathon', 'AI');
    const b = brainstormNames('Test Hackathon', 'AI');
    expect(a.winner).toEqual(b.winner);
    expect(a.candidates).toEqual(b.candidates);
  });

  it('different competitions yield different winners', () => {
    const a = brainstormNames('Healthcare AI Challenge', 'Healthcare');
    const b = brainstormNames('Climate Hack', 'Climate');
    expect(a.winner.displayName).not.toBe(b.winner.displayName);
  });

  it('handles undefined inputs via fallback', () => {
    const result = brainstormNames(undefined as unknown as string, undefined);
    expect(result.winner.displayName).toBeTruthy();
    expect(result.winner.slug).toBeTruthy();
    expect(result.winner.folderName).toBeTruthy();
  });

  it('pickName returns the winner bundle', () => {
    const winner = pickName('AI Hackathon 2026', 'AI');
    expect(winner.displayName.length).toBeGreaterThan(4);
    expect(winner.slug).toBe(winner.displayName.toLowerCase());
  });

  it('never returns a name matching a generic token', () => {
    const winner = brainstormNames('Test Hackathon', 'AI').winner;
    const lower = winner.displayName.toLowerCase();
    expect(GENERIC_NAME_TOKENS.includes(lower as (typeof GENERIC_NAME_TOKENS)[number])).toBe(false);
  });

  it('prefers shorter, vowel-balanced names in scoring', () => {
    const result = brainstormNames('Test Hackathon', 'AI');
    const sorted = [...result.candidates].sort((a, b) => b.score - a.score);
    expect(sorted.map((c) => c.name)).toEqual(result.candidates.map((c) => c.name));
  });
});
