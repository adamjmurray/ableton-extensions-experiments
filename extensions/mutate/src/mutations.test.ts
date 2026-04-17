import { describe, expect, test, vi } from "vitest";
import {
  deleteTenPercent,
  randomizeVelocity,
  shuffleDrums,
  swapNotes,
  type Note,
} from "./mutations.js";

function note(pitch: number, startTime = 0, duration = 1, velocity = 100): Note {
  return { pitch, startTime, duration, velocity };
}

function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("randomizeVelocity", () => {
  test("returns a new array, preserves pitch/startTime/duration", () => {
    const input = [note(60, 0, 1, 50), note(62, 1, 1, 50)];
    const out = randomizeVelocity(input, () => 0.5);
    expect(out).not.toBe(input);
    expect(out[0]).not.toBe(input[0]);
    expect(out.map((n) => n.pitch)).toEqual([60, 62]);
    expect(out.map((n) => n.startTime)).toEqual([0, 1]);
    expect(out.map((n) => n.duration)).toEqual([1, 1]);
  });

  test("velocities fall in [32, 120]", () => {
    const input = Array.from({ length: 50 }, (_, i) => note(60 + (i % 12)));
    const rng = seqRng([0, 1, 0.25, 0.5, 0.75, 0.99]);
    for (const n of randomizeVelocity(input, rng)) {
      expect(n.velocity!).toBeGreaterThanOrEqual(32);
      expect(n.velocity!).toBeLessThanOrEqual(120);
    }
  });
});

describe("swapNotes", () => {
  test("swaps pitches of adjacent pairs", () => {
    const out = swapNotes([note(60), note(62), note(64), note(65)]);
    expect(out.map((n) => n.pitch)).toEqual([62, 60, 65, 64]);
  });

  test("leaves the trailing note untouched on odd-length input", () => {
    const out = swapNotes([note(60), note(62), note(64)]);
    expect(out.map((n) => n.pitch)).toEqual([62, 60, 64]);
  });

  test("returns a new array", () => {
    const input = [note(60), note(62)];
    const out = swapNotes(input);
    expect(out).not.toBe(input);
    expect(input.map((n) => n.pitch)).toEqual([60, 62]);
  });
});

describe("deleteTenPercent", () => {
  test("removes ceil(n * 0.1) notes", () => {
    const input = Array.from({ length: 20 }, (_, i) => note(60 + i));
    const out = deleteTenPercent(input, seqRng([0.05, 0.55]));
    expect(out).toHaveLength(18);
  });

  test("removes at least one note from a non-empty input", () => {
    const out = deleteTenPercent([note(60), note(62), note(64)], seqRng([0]));
    expect(out).toHaveLength(2);
  });

  test("returns empty array on empty input", () => {
    expect(deleteTenPercent([])).toEqual([]);
  });
});

describe("shuffleDrums", () => {
  test("returns a structural copy unchanged (placeholder)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = [note(36), note(38), note(42)];
    const out = shuffleDrums(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
