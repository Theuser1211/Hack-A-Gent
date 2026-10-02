/**
 * Deterministic pseudo-random helpers for the ideation module.
 *
 * Hack-A-Gent keeps generation deterministic (same inputs → same ideas and
 * names) so the CLI remains reproducible without an LLM. These helpers are
 * self-contained and deliberately do NOT depend on the benchmarks' RNG kernel.
 */

/** FNV-1a style string hash → unsigned 32-bit seed. */
export function hashSeed(parts: Array<string | number | null | undefined>): number {
  let h = 2166136261;
  for (const part of parts) {
    const s = String(part ?? '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // Mix between parts so ["ab","c"] != ["a","bc"].
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  }
  return h >>> 0;
}

/** Mulberry32 — tiny, fast, good-enough seeded PRNG returning [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic integer in [min, max] (inclusive) from a seed. */
export function seededInt(seed: number, min: number, max: number): number {
  if (max < min) [min, max] = [max, min];
  return min + Math.floor(mulberry32(seed)() * (max - min + 1));
}

/** Deterministic pick from a list. */
export function seededPick<T>(items: readonly T[], seed: number): T {
  return items[seededInt(seed, 0, items.length - 1)]!;
}

/** Deterministic Fisher–Yates shuffle (returns a new array). */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}


