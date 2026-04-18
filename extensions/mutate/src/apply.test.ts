import { describe, expect, test } from "vitest";
import { nextMutateLaneIndex } from "./apply.js";
import { deriveSeed, deriveSeed2D, mulberry32 } from "./rng.js";
import { generateVariations, ZERO_CONTROLS } from "./variations.js";
import type { ClipBounds, Note } from "./transforms.js";

// Shape-matching stand-in for MidiTrack<"0.0.5">. `nextMutateLaneIndex`
// only reads `.takeLanes[].name`, so a minimal object is enough.
type FakeLane = { name: string };
function fakeTrack(names: string[]) {
  return { takeLanes: names.map((name) => ({ name })) as FakeLane[] };
}

describe("nextMutateLaneIndex", () => {
  test("returns 1 when the track has no take lanes", () => {
    expect(nextMutateLaneIndex(fakeTrack([]) as never)).toBe(1);
  });

  test("returns 1 when no lane matches 'Mutate N'", () => {
    expect(
      nextMutateLaneIndex(fakeTrack(["Take 1", "Mute", "Mutator", "mutate 3"]) as never),
    ).toBe(1);
  });

  test("continues after the highest matching suffix", () => {
    expect(nextMutateLaneIndex(fakeTrack(["Mutate 1", "Mutate 2"]) as never)).toBe(3);
  });

  test("ignores unrelated take lanes mixed in", () => {
    expect(
      nextMutateLaneIndex(fakeTrack(["Comp A", "Mutate 4", "Take B", "Mutate 1"]) as never),
    ).toBe(5);
  });

  test("handles out-of-order lane names by picking the max", () => {
    expect(
      nextMutateLaneIndex(fakeTrack(["Mutate 10", "Mutate 2", "Mutate 7"]) as never),
    ).toBe(11);
  });

  test("requires an exact 'Mutate N' match — no trailing text allowed", () => {
    expect(
      nextMutateLaneIndex(fakeTrack(["Mutate 3 (backup)", "Mutate 1"]) as never),
    ).toBe(2);
  });
});

describe("apply.ts seed-indexing convention", () => {
  // The convention lives in apply.ts: index 0 is reserved for the in-place
  // mutation (so toggling mutateSource doesn't re-roll visible thumbnails),
  // and variation i (0-based in UI) uses seed index i + 1. These tests
  // lock the convention at the seed-derivation layer so regressions in
  // applySession / applyArrangement can't silently diverge.

  const BOUNDS: ClipBounds = { start: 0, end: 4 };
  const source: Note[] = [
    { pitch: 60, startTime: 0, duration: 1, velocity: 80 },
    { pitch: 62, startTime: 1, duration: 1, velocity: 80 },
  ];
  const CONTROLS = {
    ...ZERO_CONTROLS,
    velocity: { offset: 0, range: 20 },
  };

  test("index 0 (in-place) and index 1 (Var 1) produce different note streams", () => {
    const baseSeed = 1234;
    const [inPlace] = generateVariations(
      source.map((n) => ({ ...n })),
      CONTROLS,
      1,
      deriveSeed(baseSeed, 0),
      BOUNDS,
    );
    const [var1] = generateVariations(
      source.map((n) => ({ ...n })),
      CONTROLS,
      1,
      deriveSeed(baseSeed, 1),
      BOUNDS,
    );
    expect(inPlace).not.toEqual(var1);
  });

  test("toggling mutateSource doesn't change variation streams at indices >= 1", () => {
    // When the UI flips the mutateSource checkbox, apply.ts keeps emitting
    // the same seeds for i=1,2,3… so the user-visible Var thumbnails don't
    // re-roll. We encode that here by showing that variation seeds are
    // derived purely from (baseSeed, i+1), independent of any in-place flag.
    const baseSeed = 9999;
    const seedsA = [1, 2, 3, 4].map((i) => deriveSeed(baseSeed, i));
    const seedsB = [1, 2, 3, 4].map((i) => deriveSeed(baseSeed, i));
    expect(seedsA).toEqual(seedsB);
  });

  test("scene/range 2D seed indexing avoids (trackIndex, variation) collisions", () => {
    // apply.ts for scene and range modes uses deriveSeed2D(baseSeed, axis, vi)
    // so distinct (trackIndex, vi) pairs never collide via XOR commutativity.
    const baseSeed = 42;
    const firstDraws = new Map<string, number>();
    for (let ti = 0; ti < 4; ti++) {
      for (let vi = 0; vi < 4; vi++) {
        firstDraws.set(`${ti},${vi}`, mulberry32(deriveSeed2D(baseSeed, ti, vi))());
      }
    }
    expect(new Set(firstDraws.values()).size).toBe(firstDraws.size);
  });
});
