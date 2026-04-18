import { describe, expect, test } from "vitest";
import {
  dropNotes,
  swapNotes,
  transformDuration,
  transformProbability,
  transformStart,
  transformVelocity,
  type ClipBounds,
  type Note,
} from "./transforms.js";
import { mulberry32 } from "./rng.js";

function note(
  pitch: number,
  startTime = 0,
  duration = 1,
  velocity?: number,
  probability?: number,
): Note {
  const n: Note = { pitch, startTime, duration };
  if (velocity !== undefined) n.velocity = velocity;
  if (probability !== undefined) n.probability = probability;
  return n;
}

const ZERO = { offset: 0, range: 0 };

describe("transformVelocity", () => {
  test("no-op when ctrl = {0, 0} preserves velocity", () => {
    const out = transformVelocity([note(60, 0, 1, 80)], ZERO, () => 0.123);
    expect(out[0]!.velocity).toBe(80);
  });

  test("missing velocity defaults to 100", () => {
    const out = transformVelocity([note(60)], ZERO, () => 0.5);
    expect(out[0]!.velocity).toBe(100);
  });

  test("clamps to [1, 127] across many draws with large range", () => {
    const input = Array.from({ length: 50 }, () => note(60, 0, 1, 64));
    const rng = mulberry32(7);
    const out = transformVelocity(input, { offset: 50, range: 200 }, rng);
    for (const n of out) {
      expect(n.velocity!).toBeGreaterThanOrEqual(1);
      expect(n.velocity!).toBeLessThanOrEqual(127);
    }
  });

  test("preserves pitch/startTime/duration", () => {
    const input = [note(60, 2, 0.5, 70), note(72, 3, 0.25, 90)];
    const out = transformVelocity(input, { offset: 10, range: 5 }, mulberry32(1));
    expect(out.map((n) => n.pitch)).toEqual([60, 72]);
    expect(out.map((n) => n.startTime)).toEqual([2, 3]);
    expect(out.map((n) => n.duration)).toEqual([0.5, 0.25]);
  });

  test("velocity is integer-valued", () => {
    const out = transformVelocity(
      Array.from({ length: 20 }, () => note(60, 0, 1, 64)),
      { offset: 3, range: 7 },
      mulberry32(2),
    );
    for (const n of out) {
      expect(Number.isInteger(n.velocity!)).toBe(true);
    }
  });
});

describe("transformStart", () => {
  const bounds: ClipBounds = { start: 0, end: 8 };

  test("no-op when ctrl = {0, 0} preserves startTime", () => {
    const out = transformStart([note(60, 2.5, 1)], ZERO, () => 0.7, bounds);
    expect(out[0]!.startTime).toBe(2.5);
  });

  test("clamps startTime into [bounds.start, bounds.end] across many draws", () => {
    const input = Array.from({ length: 100 }, (_, i) => note(60, i * 0.1, 1));
    const rng = mulberry32(42);
    const out = transformStart(input, { offset: 5, range: 20 }, rng, bounds);
    for (const n of out) {
      expect(n.startTime).toBeGreaterThanOrEqual(bounds.start);
      expect(n.startTime).toBeLessThanOrEqual(bounds.end);
    }
  });

  test("leaves duration unchanged (coexist semantics)", () => {
    const input = [note(60, 1, 0.5), note(62, 2, 0.25)];
    const out = transformStart(input, { offset: 0.5, range: 2 }, mulberry32(9), bounds);
    expect(out.map((n) => n.duration)).toEqual([0.5, 0.25]);
  });

  test("preserves pitch/duration/velocity", () => {
    const input = [note(60, 1, 0.5, 80), note(72, 3, 1, 90)];
    const out = transformStart(input, { offset: 0, range: 0.5 }, mulberry32(3), bounds);
    expect(out.map((n) => n.pitch)).toEqual([60, 72]);
    expect(out.map((n) => n.velocity)).toEqual([80, 90]);
  });
});

describe("transformDuration", () => {
  const bounds: ClipBounds = { start: 0, end: 8 };

  test("no-op when ctrl = {0, 0} preserves duration", () => {
    const out = transformDuration([note(60, 2, 0.5)], ZERO, () => 0.3, bounds);
    expect(out[0]!.duration).toBe(0.5);
  });

  test("duration stays > 0 across many draws with large negative offset", () => {
    const input = Array.from({ length: 50 }, () => note(60, 0, 1));
    const rng = mulberry32(11);
    const out = transformDuration(input, { offset: -100, range: 50 }, rng, bounds);
    for (const n of out) {
      expect(n.duration).toBeGreaterThan(0);
    }
  });

  test("startTime + duration ≤ bounds.end across many draws", () => {
    const input = Array.from({ length: 100 }, (_, i) => note(60, i % 8, 1));
    const rng = mulberry32(17);
    const out = transformDuration(input, { offset: 10, range: 20 }, rng, bounds);
    for (const n of out) {
      expect(n.startTime + n.duration).toBeLessThanOrEqual(bounds.end + 1e-9);
    }
  });

  test("note starting at bounds.end clamps to minimum duration", () => {
    const out = transformDuration(
      [note(60, bounds.end, 1)],
      { offset: 5, range: 5 },
      mulberry32(5),
      bounds,
    );
    expect(out[0]!.duration).toBeGreaterThan(0);
    expect(out[0]!.duration).toBeLessThanOrEqual(1 / 128);
  });

  test("preserves pitch/startTime/velocity", () => {
    const input = [note(60, 1, 0.5, 80), note(72, 3, 1, 90)];
    const out = transformDuration(input, { offset: 0, range: 0.3 }, mulberry32(4), bounds);
    expect(out.map((n) => n.pitch)).toEqual([60, 72]);
    expect(out.map((n) => n.startTime)).toEqual([1, 3]);
    expect(out.map((n) => n.velocity)).toEqual([80, 90]);
  });
});

describe("transformProbability", () => {
  test("no-op when ctrl = {0, 0} on a note without probability → writes 1.0", () => {
    const out = transformProbability([note(60)], ZERO, () => 0.2);
    expect(out[0]!.probability).toBe(1.0);
  });

  test("no-op when ctrl = {0, 0} on a note with probability 0.5 → writes 0.5", () => {
    const out = transformProbability([note(60, 0, 1, 80, 0.5)], ZERO, () => 0.9);
    expect(out[0]!.probability).toBe(0.5);
  });

  test("clamps to [0, 1] across many draws with large range", () => {
    const input = Array.from({ length: 100 }, () => note(60, 0, 1, 80, 0.5));
    const rng = mulberry32(31);
    const out = transformProbability(input, { offset: 0.3, range: 5 }, rng);
    for (const n of out) {
      expect(n.probability!).toBeGreaterThanOrEqual(0);
      expect(n.probability!).toBeLessThanOrEqual(1);
    }
  });

  test("positive offset raises probability (symmetric applyRange)", () => {
    const out = transformProbability([note(60, 0, 1, 80, 0.2)], { offset: 0.5, range: 0 }, () => 0);
    expect(out[0]!.probability).toBeCloseTo(0.7);
  });

  test("negative offset lowers probability", () => {
    const out = transformProbability(
      [note(60, 0, 1, 80, 0.8)],
      { offset: -0.5, range: 0 },
      () => 0,
    );
    expect(out[0]!.probability).toBeCloseTo(0.3);
  });

  test("preserves pitch/startTime/duration/velocity", () => {
    const input = [note(60, 1, 0.5, 80, 0.4), note(72, 2, 1, 90, 0.9)];
    const out = transformProbability(input, { offset: 0, range: 0.2 }, mulberry32(13));
    expect(out.map((n) => n.pitch)).toEqual([60, 72]);
    expect(out.map((n) => n.startTime)).toEqual([1, 2]);
    expect(out.map((n) => n.duration)).toEqual([0.5, 1]);
    expect(out.map((n) => n.velocity)).toEqual([80, 90]);
  });
});

describe("dropNotes", () => {
  test("ctrl = {0, 0} keeps all notes", () => {
    const input = Array.from({ length: 10 }, (_, i) => note(60 + i));
    expect(dropNotes(input, ZERO, mulberry32(1))).toHaveLength(10);
  });

  test("ctrl = {1, 0} drops all notes", () => {
    const input = Array.from({ length: 10 }, (_, i) => note(60 + i));
    expect(dropNotes(input, { offset: 1, range: 0 }, mulberry32(1))).toHaveLength(0);
  });

  test("ctrl = {0.5, 0} over 1000 notes drops roughly half", () => {
    const input = Array.from({ length: 1000 }, (_, i) => note(60 + (i % 12)));
    const out = dropNotes(input, { offset: 0.5, range: 0 }, mulberry32(42));
    expect(out.length).toBeGreaterThan(350);
    expect(out.length).toBeLessThan(650);
  });

  test("preserves data of surviving notes", () => {
    const input = [note(60, 0, 1, 80, 0.5), note(62, 1, 0.25, 100, 0.9), note(64, 2, 2, 64, 0.3)];
    const out = dropNotes(input, { offset: 0.5, range: 0.5 }, mulberry32(3));
    for (const n of out) {
      const original = input.find((o) => o.pitch === n.pitch)!;
      expect(n).toEqual(original);
    }
  });

  test("deterministic with same seed", () => {
    const input = Array.from({ length: 100 }, (_, i) => note(60 + (i % 12)));
    const a = dropNotes(input, { offset: 0.4, range: 0.2 }, mulberry32(99));
    const b = dropNotes(input, { offset: 0.4, range: 0.2 }, mulberry32(99));
    expect(a).toEqual(b);
  });

  test("empty input returns empty", () => {
    expect(dropNotes([], { offset: 0.5, range: 0 }, mulberry32(1))).toEqual([]);
  });
});

describe("swapNotes", () => {
  test("ctrl = {0, 0} leaves all pitches unchanged", () => {
    const input = [note(60), note(62), note(64), note(65)];
    const out = swapNotes(input, ZERO, mulberry32(1));
    expect(out.map((n) => n.pitch)).toEqual([60, 62, 64, 65]);
  });

  test("ctrl = {1, 0} over 20 notes permutes pitches but preserves multiset", () => {
    const input = Array.from({ length: 20 }, (_, i) => note(60 + i));
    const out = swapNotes(input, { offset: 1, range: 0 }, mulberry32(7));
    const before = input.map((n) => n.pitch).sort((a, b) => a - b);
    const after = out.map((n) => n.pitch).sort((a, b) => a - b);
    expect(after).toEqual(before);
    expect(out.map((n) => n.pitch)).not.toEqual(input.map((n) => n.pitch));
  });

  test("odd-length input preserves pitch multiset", () => {
    const input = [note(60), note(62), note(64)];
    const out = swapNotes(input, { offset: 1, range: 0 }, mulberry32(5));
    expect(out.map((n) => n.pitch).sort((a, b) => a - b)).toEqual([60, 62, 64]);
  });

  test("only pitch is exchanged — other fields stay with original index", () => {
    const input = [
      note(60, 0, 1, 80, 0.4),
      note(62, 1, 2, 90, 0.5),
      note(64, 2, 3, 100, 0.6),
      note(65, 3, 4, 110, 0.7),
    ];
    const out = swapNotes(input, { offset: 1, range: 0 }, mulberry32(11));
    for (let i = 0; i < out.length; i++) {
      expect(out[i]!.startTime).toBe(input[i]!.startTime);
      expect(out[i]!.duration).toBe(input[i]!.duration);
      expect(out[i]!.velocity).toBe(input[i]!.velocity);
      expect(out[i]!.probability).toBe(input[i]!.probability);
    }
  });

  test("deterministic with same seed", () => {
    const input = Array.from({ length: 16 }, (_, i) => note(60 + i));
    const a = swapNotes(input, { offset: 0.6, range: 0.3 }, mulberry32(21));
    const b = swapNotes(input, { offset: 0.6, range: 0.3 }, mulberry32(21));
    expect(a).toEqual(b);
  });

  test("empty input returns empty", () => {
    expect(swapNotes([], { offset: 1, range: 0 }, mulberry32(1))).toEqual([]);
  });
});
