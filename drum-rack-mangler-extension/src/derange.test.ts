import { describe, expect, it } from "vitest";
import { derange } from "./derange.js";
import { mulberry32 } from "./rng.js";

describe("derange", () => {
  it("returns empty array for length 0", () => {
    expect(derange<number>([], mulberry32(1))).toEqual([]);
  });

  it("returns copy of single-element array (no derangement possible)", () => {
    const input = ["a"];
    const out = derange(input, mulberry32(1));
    expect(out).toEqual(["a"]);
    expect(out).not.toBe(input);
  });

  it("always swaps for length 2", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(derange(["a", "b"], mulberry32(seed))).toEqual(["b", "a"]);
    }
  });

  it("produces no fixed points across many seeds and sizes", () => {
    for (const size of [3, 5, 10, 16]) {
      const input = Array.from({ length: size }, (_, i) => i);
      for (let seed = 1; seed <= 50; seed++) {
        const out = derange(input, mulberry32(seed));
        expect(out).toHaveLength(size);
        expect([...out].sort((a, b) => a - b)).toEqual(input);
        for (let i = 0; i < size; i++) expect(out[i]).not.toBe(input[i]);
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = derange(input, mulberry32(42));
    const b = derange(input, mulberry32(42));
    expect(a).toEqual(b);
  });

  it("does not mutate the input array", () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    derange(input, mulberry32(7));
    expect(input).toEqual(snapshot);
  });
});
