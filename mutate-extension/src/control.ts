import type { Rng } from "./rng.js";

export type ControlRange = { offset: number; range: number };

// Output = base + offset + (uniform in [-1, 1]) * range
export function applyRange(base: number, ctrl: ControlRange, rng: Rng): number {
  return base + ctrl.offset + (rng() * 2 - 1) * ctrl.range;
}
