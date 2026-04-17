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

// Two-dimensional variant for scene-mode (per-track × per-variation). Uses a
// different mixing constant for each axis so collisions like (3, 0) vs (0, 3)
// can't happen — `deriveSeed` chained twice would collide because XOR is
// commutative and both calls share one constant.
export function deriveSeed2D(baseSeed: number, a: number, b: number): number {
  const x = (baseSeed >>> 0) ^ Math.imul(a >>> 0, 0x9e3779b9);
  return (x ^ Math.imul(b >>> 0, 0x85ebca6b)) >>> 0;
}
