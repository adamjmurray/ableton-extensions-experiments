export type Rng = () => number;

// mulberry32 — 32-bit state, ~2^32 period. Yields a double in [0, 1).
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Knuth's multiplicative hash — plain (base + index) would give correlated streams.
export function deriveSeed(baseSeed: number, variationIndex: number): number {
  return ((baseSeed >>> 0) ^ Math.imul(variationIndex >>> 0, 0x9e3779b9)) >>> 0;
}
