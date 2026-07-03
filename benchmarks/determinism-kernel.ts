export interface RNG {
  next(): number;
  nextInt(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  seed: number;
}

const MAX_INT32 = 0x7fffffff;

function createLcg(seed: number): RNG {
  let s = seed | 0;
  if (s === 0) s = 1;
  return {
    seed,
    next(): number {
      s = (s * 1664525 + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    },
    nextInt(min: number, max: number): number {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      return items[this.nextInt(0, items.length - 1)]!;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i--) {
        const j = this.nextInt(0, i);
        const tmp = result[i]!;
        result[i] = result[j]!;
        result[j] = tmp;
      }
      return result;
    },
  };
}

let _globalRng: RNG | null = null;

export function getSeededRandom(seed: number): RNG {
  return createLcg(seed);
}

export function initializeGlobalRNG(seed: number): RNG {
  _globalRng = createLcg(seed);
  return _globalRng;
}

export function resetGlobalRNG(): void {
  _globalRng = null;
}

export function getGlobalRNG(): RNG {
  if (!_globalRng) {
    throw new Error('Global RNG not initialized. Call initializeGlobalRNG(seed) first.');
  }
  return _globalRng;
}

export function deterministicSort<T>(items: T[], keyFn: (item: T) => string | number): T[] {
  return [...items].sort((a, b) => {
    const ka = keyFn(a);
    const kb = keyFn(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
}

export function deterministicShuffle<T>(items: readonly T[], rng: RNG): T[] {
  return rng.shuffle(items);
}

export function createDeterministicUuid(seed: number, counter: number): string {
  const rng = createLcg(seed + counter * 7919);
  const hex = () => rng.nextInt(0, 15).toString(16);
  const segment = (len: number) => Array.from({ length: len }, hex).join('');
  return `${segment(8)}-${segment(4)}-4${segment(3)}-${['8', '9', 'a', 'b'][rng.nextInt(0, 3)]}${segment(3)}-${segment(12)}`;
}

export function deterministicNow(seed: number): string {
  const base = new Date('2026-01-01T00:00:00.000Z');
  const offset = (seed % 365) * 86400000 + (seed % 86400) * 1000;
  return new Date(base.getTime() + offset).toISOString();
}
