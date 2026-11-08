/**
 * Seeded pseudo-random numbers (mulberry32).
 *
 * Every random decision inside the engine goes through this module so that the
 * same scenario + config + seed always produces the same simulation.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Returns a shuffled copy (Fisher-Yates); the input is left untouched. */
  shuffle<T>(items: readonly T[]): T[];
}

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0;
  return Math.trunc(seed) >>> 0;
}

/** FNV-1a hash of a string, as an unsigned 32-bit integer. */
function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Derives an independent seed for a named sub-stream, so that adding or
 * reordering one actor does not shift the random draws of the others.
 */
export function deriveSeed(seed: number, label: string): number {
  return hashString(`${normalizeSeed(seed)}:${label}`);
}

export function createRng(seed: number): Rng {
  let state = normalizeSeed(seed);

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    const low = Math.ceil(Math.min(min, max));
    const high = Math.floor(Math.max(min, max));
    return low + Math.floor(next() * (high - low + 1));
  };

  return {
    next,
    int,
    chance: (probability) => next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new Error("Cannot pick from an empty list");
      return items[int(0, items.length - 1)];
    },
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}
