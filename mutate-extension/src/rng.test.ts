import { describe, expect, test } from "vitest";
import { deriveSeed, mulberry32 } from "./rng.js";

function take(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => rng());
}

describe("mulberry32", () => {
  test("same seed produces the same sequence", () => {
    expect(take(mulberry32(42), 10)).toEqual(take(mulberry32(42), 10));
  });

  test("every draw is in [0, 1)", () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  test("different seeds diverge at the first draw", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  test("handles seed = 0", () => {
    const rng = mulberry32(0);
    const x = rng();
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
  });
});

describe("deriveSeed", () => {
  test("same (base, index) yields the same seed", () => {
    expect(deriveSeed(100, 3)).toBe(deriveSeed(100, 3));
  });

  test("different indices yield different seeds", () => {
    const a = deriveSeed(100, 0);
    const b = deriveSeed(100, 1);
    const c = deriveSeed(100, 2);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  test("derived seeds produce distinct RNG streams", () => {
    const first = (i: number) => mulberry32(deriveSeed(7, i))();
    const values = [first(0), first(1), first(2), first(3)];
    expect(new Set(values).size).toBe(4);
  });

  test("index 0 yields a well-defined 32-bit seed", () => {
    const s = deriveSeed(999, 0);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});
