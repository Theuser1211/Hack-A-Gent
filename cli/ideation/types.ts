/**
 * Types for the startup-quality ideation + naming engines.
 *
 * The mission of this module is to replace single generic idea/name generation
 * with:
 *   20 ideas → self-rank → expand top 5 → select winner → explain why it wins
 *   30 names  → reject generic → rank → pick the most brandable
 */

/** A raw brainstormed concept before scoring/expansion. */
export interface IdeaDraft {
  id: string;
  title: string;
  domain: string;
  user: string;
  line: string;
}

/** A fully evaluated concept. */
export interface ScoredIdea extends IdeaDraft {
  oneLiner: string;
  novelty: number; // 1-10
  feasibility: number; // 1-10
  sponsorFit: number; // 1-10
  technicalDepth: number; // 1-10
  demoAppeal: number; // 1-10
  totalScore: number; // 0-100, weighted against judging criteria
  concept: string;
  keyFeatures: string[];
  wowMoment: string;
  whyItWins: string;
  /** Startup-quality brand name picked for this concept. */
  brandName: string;
}

export interface IdeationResult {
  /** The full 20-concept brainstorm. */
  generated: ScoredIdea[];
  /** Ranked ids, best first. */
  rankedIds: string[];
  /** Top 5, expanded with concept/features/wow/why. */
  shortlist: ScoredIdea[];
  winner: ScoredIdea;
  /** Why the winner beats the field. */
  rationale: string;
}

export type NameOrigin = 'noun' | 'verb' | 'blend' | 'syllable';

export interface NameCandidate {
  name: string;
  origin: NameOrigin;
  score: number;
  rejected: boolean;
  reason?: string;
}

export interface NameBrainstormResult {
  /** Ranked candidates that passed the generic-name filter, best first. */
  candidates: NameCandidate[];
  /** Candidates that were rejected as generic, with the reason. */
  rejected: Array<{ name: string; reason: string }>;
  winner: { displayName: string; slug: string; folderName: string };
}

/** Generic tokens that must never appear in a startup brand name. */
export const GENERIC_NAME_TOKENS = [
  'app', 'apps', 'assistant', 'platform', 'tool', 'tools', 'smart', 'hub',
  'cloud', 'tech', 'bot', 'mate', 'pro', 'plus', 'wizard', 'genius', 'buddy',
  'solutions', 'systems', 'labs', 'online', 'finder', 'tracker', 'manager',
  'maker', 'generator', 'dashboard', 'suite', 'assist', 'ai', 'io', '360', 'box', 'kit',
] as const;
