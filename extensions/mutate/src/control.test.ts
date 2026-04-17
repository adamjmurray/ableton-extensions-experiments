import { describe, expect, test } from "vitest";
import { applyRange, type ControlRange } from "./control.js";
import { mulberry32 } from "./rng.js";

function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("applyRange", () => {
  test("is deterministic for a seeded rng", () => {
    const ctrl: ControlRange = { offset: 5, range: 10 };
    const a = applyRange(100, ctrl, mulberry32(1));
    const b = applyRange(100, ctrl, mulberry32(1));
    expect(a).toBe(b);
  });

  test("output stays within [base + offset - range, base + offset + range]", () => {
    const base = 64;
    const ctrl: ControlRange = { offset: 3, range: 12 };
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = applyRange(base, ctrl, rng);
      expect(v).toBeGreaterThanOrEqual(base + ctrl.offset - ctrl.range);
      expect(v).toBeLessThanOrEqual(base + ctrl.offset + ctrl.range);
    }
  });

  test("offset-only (range = 0) ignores rng and returns base + offset", () => {
    const ctrl: ControlRange = { offset: 7, range: 0 };
    const rng = seqRng([0, 0.25, 0.5, 0.75, 0.999]);
    for (let i = 0; i < 5; i++) {
      expect(applyRange(50, ctrl, rng)).toBe(57);
    }
  });

  test("range-only (offset = 0) stays within [base - range, base + range]", () => {
    const base = 0;
    const ctrl: ControlRange = { offset: 0, range: 8 };
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = applyRange(base, ctrl, rng);
      expect(v).toBeGreaterThanOrEqual(-8);
      expect(v).toBeLessThanOrEqual(8);
    }
  });

  test("rng = 0 hits lower bound, rng ≈ 1 hits upper bound", () => {
    const ctrl: ControlRange = { offset: 0, range: 10 };
    expect(applyRange(0, ctrl, () => 0)).toBe(-10);
    expect(applyRange(0, ctrl, () => 0.5)).toBe(0);
  });
});
