import { hashSeed, mulberry32, seededPick } from './rng.js';
import { GENERIC_NAME_TOKENS, type NameBrainstormResult, type NameCandidate, type NameOrigin } from './types.js';

export const NAME_CANDIDATE_COUNT = 30;
export const NAME_MIN_LENGTH = 5;
export const NAME_MAX_LENGTH = 11;

/**
 * Startup-sounding word parts. These are deliberately NOT the "VisionForge /
 * PulseAI" prefix+suffix style — they read like the short, invented,
 * brandable names you see on Product Hunt and YC batch lists.
 */
const STEMS = [
  'Ar', 'Bel', 'Cov', 'Dex', 'Evo', 'Fal', 'Gem', 'Hal', 'Imb', 'Jun',
  'Kev', 'Lum', 'Mir', 'Nim', 'Ova', 'Per', 'Qui', 'Rav', 'Sol', 'Tem',
  'Umb', 'Vel', 'Wes', 'Xyl', 'Yor', 'Zor',
] as const;

const TAILS = [
  'ra', 'ri', 'ro', 'lu', 'na', 've', 'on', 'an', 'en', 'or',
  'is', 'us', 'ex', 'ix', 'yx', 'a', 'o',
] as const;

const CONCEPT_NOUNS = [
  'Loom', 'Nimbus', 'Cinder', 'Kestrel', 'Halcyon', 'Forge', 'Harbor', 'Vega',
  'Cascade', 'Vertex', 'Drift', 'Ember', 'Flux', 'Grove', 'Haven', 'Iris',
  'Keel', 'Lattice', 'Monolith', 'Nova', 'Oasis', 'Pinnacle', 'Ridge', 'Summit',
  'Tide', 'Vale', 'Zenith', 'Aperture', 'Bastion', 'Cipher', 'Dynamo', 'Echelon',
  'Facet', 'Helix', 'Jetty', 'Kernel', 'Lumen', 'Nexus', 'Opus', 'Pivot',
  'Reverb', 'Sierra', 'Tandem', 'Umbra', 'Vantage', 'Zephyr', 'Morrow', 'Quarry',
  'Astra', 'Orbit',
] as const;

const VERBS = [
  'Reach', 'Gather', 'Focus', 'Launch', 'Track', 'Share', 'Learn', 'Build',
  'Calm', 'Move', 'Plan', 'Sort', 'Find', 'Save', 'Join', 'Read', 'Grow',
  'Shift', 'Spark', 'Merge', 'Seek', 'Watch', 'Shape', 'Send',
] as const;

const SUFFIXES = [
  'ly', 'sync', 'deck', 'works', 'house', 'line', 'wise', 'cast',
  'shift', 'wave', 'bloom', 'link', 'board', 'fleet', 'base',
] as const;

/**
 * 30-name brainstorm: generate → reject generic → score → rank → winner.
 *
 * Deterministic: same (competitionName, theme, seed) always produce the same
 * candidate list and winner.
 */
export function brainstormNames(competitionName?: string, theme?: string, seed = 0): NameBrainstormResult {
  const rngSeed = hashSeed([competitionName ?? 'hackathon', theme ?? '', seed, 'names']);
  const rand = mulberry32(rngSeed);

  const candidates: NameCandidate[] = [];
  const rejected: NameBrainstormResult['rejected'] = [];

  let attempts = 0;
  while (candidates.length < NAME_CANDIDATE_COUNT && attempts < 400) {
    attempts++;
    const raw = makeCandidate(rand);
    const { name, origin } = raw;
    const rejection = rejectionReason(name);
    if (rejection) {
      rejected.push({ name, reason: rejection });
      continue;
    }
    candidates.push({ name, origin, score: scoreName(name, origin), rejected: false });
  }

  candidates.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name));

  const winnerName = candidates[0]?.name ?? fallbackName(competitionName, theme);
  const displayName = winnerName.charAt(0).toUpperCase() + winnerName.slice(1);
  const slug = displayName.toLowerCase();

  return {
    candidates,
    rejected,
    winner: { displayName, slug, folderName: slug },
  };
}

/** Convenience accessor used by the strategy layer and improvement pass. */
export function pickName(competitionName?: string, theme?: string, seed = 0): NameBrainstormResult['winner'] {
  return brainstormNames(competitionName, theme, seed).winner;
}

// ---------------------------------------------------------------------------
// Candidate construction
// ---------------------------------------------------------------------------

function makeCandidate(rand: () => number): { name: string; origin: NameOrigin } {
  const roll = rand() * 100;
  if (roll < 30) {
    return { name: seededPick(CONCEPT_NOUNS, nextSeed(rand)), origin: 'noun' };
  }
  if (roll < 45) {
    const verb = seededPick(VERBS, nextSeed(rand));
    return { name: verb + seededPick(SUFFIXES.slice(0, 1), nextSeed(rand)), origin: 'verb' };
  }
  if (roll < 75) {
    return { name: seededPick(STEMS, nextSeed(rand)) + seededPick(TAILS, nextSeed(rand)), origin: 'syllable' };
  }
  return { name: seededPick(CONCEPT_NOUNS, nextSeed(rand)) + seededPick(SUFFIXES, nextSeed(rand)), origin: 'blend' };
}

function nextSeed(rand: () => number): number {
  return Math.floor(rand() * 1_000_000_000);
}

// ---------------------------------------------------------------------------
// Generic-name rejection
// ---------------------------------------------------------------------------

function rejectionReason(name: string): string | null {
  const lower = name.toLowerCase();

  if (GENERIC_NAME_TOKENS.includes(lower as (typeof GENERIC_NAME_TOKENS)[number])) {
    return 'generic token';
  }
  if (/(^smart|^my|^ai|^chat|^easy|^super)/.test(lower)) {
    return 'generic prefix';
  }
  if (/(app|assistant|platform|tool|smart|hub|cloud|tech|bot|mate|io|ai|labs|360|online|finder|tracker|manager)$/.test(lower)) {
    return 'generic suffix';
  }
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    return `length ${name.length} outside ${NAME_MIN_LENGTH}-${NAME_MAX_LENGTH}`;
  }
  if (!/[aeiou]/i.test(name)) {
    return 'unpronounceable (no vowel)';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Brandability scoring
// ---------------------------------------------------------------------------

function scoreName(name: string, origin: NameOrigin): number {
  let score = 0;

  if (name.length >= 5 && name.length <= 8) score += 3;
  else if (name.length <= 10) score += 1;

  const vowels = (name.match(/[aeiou]/gi) ?? []).length;
  const ratio = vowels / name.length;
  if (ratio >= 0.3 && ratio <= 0.55) score += 2;

  // Origin brandability: real-word concepts and verbs feel most "startup".
  if (origin === 'noun' || origin === 'verb') score += 3;
  else if (origin === 'blend') score += 2;
  else score += 1;

  const distinct = new Set(name.toLowerCase()).size;
  if (distinct / name.length >= 0.7) score += 2;

  // Two syllables reads better than four.
  const syllables = (name.match(/[aeiou]+/gi) ?? []).length;
  if (syllables >= 1 && syllables <= 3) score += 1;

  return score;
}

function fallbackName(competitionName?: string, theme?: string): string {
  const base = (theme ?? competitionName ?? 'project').replace(/[^a-zA-Z]/g, '').slice(0, 5);
  const stem = (base || 'Lume').charAt(0).toUpperCase() + (base || 'Lume').slice(1).toLowerCase();
  return `${stem}ra`;
}
