import { describe, expect, test } from "vitest";
import { deriveSeed2D, mulberry32 } from "./rng.js";
import type { ClipBounds, Note } from "./transforms.js";
import { generateVariations, type MutateControls, ZERO_CONTROLS } from "./variations.js";

function note(pitch: number, startTime = 0, duration = 1, velocity = 80): Note {
  return { pitch, startTime, duration, velocity };
}

const BOUNDS: ClipBounds = { start: 0, end: 4 };

const ACTIVE: MutateControls = {
  velocity: { offset: 0, range: 10 },
  start: { offset: 0, range: 0.1 },
  duration: { offset: 0, range: 0.1 },
  probability: { offset: 0, range: 0.1 },
  drop: { offset: 0, range: 0 },
  swap: { offset: 0, range: 0 },
};

describe("generateVariations", () => {
  test("ZERO_CONTROLS leaves notes structurally unchanged", () => {
    const source = [note(60), note(62, 1), note(64, 2)];
    const variations = generateVariations(source, ZERO_CONTROLS, 3, 42, BOUNDS);
    expect(variations).toHaveLength(3);
    for (const v of variations) {
      expect(v.map((n) => n.pitch)).toEqual([60, 62, 64]);
      expect(v.map((n) => n.startTime)).toEqual([0, 1, 2]);
      expect(v.map((n) => n.duration)).toEqual([1, 1, 1]);
    }
  });

  test("same inputs produce identical output (determinism)", () => {
    const source = [note(60), note(62, 1), note(64, 2), note(65, 3)];
    const a = generateVariations(source, ACTIVE, 4, 12345, BOUNDS);
    const b = generateVariations(source, ACTIVE, 4, 12345, BOUNDS);
    expect(a).toEqual(b);
  });

  test("different variation indices produce different outputs", () => {
    const source = Array.from({ length: 8 }, (_, i) => note(60 + i, i * 0.25));
    const [v0, v1, v2] = generateVariations(source, ACTIVE, 3, 99, BOUNDS);
    expect(v0).not.toEqual(v1);
    expect(v1).not.toEqual(v2);
    expect(v0).not.toEqual(v2);
  });

  test("drop runs first — drop = {1, 0} short-circuits the chain to []", () => {
    const source = [note(60), note(62, 1)];
    const controls: MutateControls = {
      ...ZERO_CONTROLS,
      drop: { offset: 1, range: 0 },
      velocity: { offset: 100, range: 0 },
    };
    const [v] = generateVariations(source, controls, 1, 7, BOUNDS);
    expect(v).toEqual([]);
  });

  test("count = 0 produces empty array", () => {
    const source = [note(60)];
    expect(generateVariations(source, ACTIVE, 0, 1, BOUNDS)).toEqual([]);
  });

  test("source is not mutated", () => {
    const source = [note(60), note(62, 1)];
    const snapshot = source.map((n) => ({ ...n }));
    generateVariations(source, ACTIVE, 3, 1, BOUNDS);
    expect(source).toEqual(snapshot);
  });

  // Scene-mode seed derivation: deriveSeed2D uses different mixing constants
  // per axis so (t, v) pairs can't collide via XOR commutativity.
  test("scene-mode 2D seed derivation produces distinct streams", () => {
    const baseSeed = 42;
    const firstDraws = new Map<string, number>();
    for (let t = 0; t < 5; t++) {
      for (let v = 0; v < 5; v++) {
        const seed = deriveSeed2D(baseSeed, t, v);
        firstDraws.set(`${t},${v}`, mulberry32(seed)());
      }
    }
    const values = Array.from(firstDraws.values());
    expect(new Set(values).size).toBe(values.length);
  });
});
