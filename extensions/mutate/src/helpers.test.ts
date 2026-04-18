import { describe, expect, test } from "vitest";
import { clipBoundsFor, clipOverlapsRange, coerceNote } from "./helpers.js";
import type { NoteDescription } from "@ableton/extensions-sdk";

describe("clipBoundsFor", () => {
  test("non-looping clip: start = startMarker, end = loopEnd", () => {
    expect(
      clipBoundsFor({ looping: false, loopStart: 0, loopEnd: 8, startMarker: 2 }),
    ).toEqual({ start: 2, end: 8 });
  });

  test("looping clip with loopStart <= startMarker: start = loopStart", () => {
    // Looping clips replay the loop region; its start dominates when the
    // loop begins before the startMarker.
    expect(
      clipBoundsFor({ looping: true, loopStart: 1, loopEnd: 5, startMarker: 3 }),
    ).toEqual({ start: 1, end: 5 });
  });

  test("looping clip with startMarker < loopStart: start = startMarker", () => {
    // Intro region (startMarker before loop) plays once before the loop begins.
    expect(
      clipBoundsFor({ looping: true, loopStart: 4, loopEnd: 8, startMarker: 2 }),
    ).toEqual({ start: 2, end: 8 });
  });

  test("coerces BigInt-like inputs via Number()", () => {
    expect(
      clipBoundsFor({
        looping: true,
        loopStart: BigInt(0),
        loopEnd: BigInt(4),
        startMarker: BigInt(1),
      }),
    ).toEqual({ start: 0, end: 4 });
  });

  test("truthy non-boolean `looping` values are treated as looping", () => {
    expect(
      clipBoundsFor({ looping: 1, loopStart: 0, loopEnd: 4, startMarker: 2 }),
    ).toEqual({ start: 0, end: 4 });
  });
});

describe("coerceNote", () => {
  test("copies pitch, startTime, duration when velocity/probability absent", () => {
    const n: NoteDescription = { pitch: 60, startTime: 1, duration: 0.5 };
    expect(coerceNote(n)).toEqual({ pitch: 60, startTime: 1, duration: 0.5 });
  });

  test("includes velocity when present", () => {
    const n: NoteDescription = { pitch: 60, startTime: 0, duration: 1, velocity: 80 };
    expect(coerceNote(n)).toEqual({ pitch: 60, startTime: 0, duration: 1, velocity: 80 });
  });

  test("includes probability when present", () => {
    const n: NoteDescription = { pitch: 60, startTime: 0, duration: 1, probability: 0.5 };
    expect(coerceNote(n)).toEqual({ pitch: 60, startTime: 0, duration: 1, probability: 0.5 });
  });

  test("coerces BigInt fields to Number", () => {
    // The alpha SDK occasionally hands back BigInt for pitch/velocity; we
    // need everything downstream to be plain numbers so clip.notes = […]
    // round-trips and arithmetic doesn't throw TypeError.
    const n = {
      pitch: BigInt(60),
      startTime: BigInt(0),
      duration: BigInt(1),
      velocity: BigInt(100),
    } as unknown as NoteDescription;
    const out = coerceNote(n);
    expect(typeof out.pitch).toBe("number");
    expect(typeof out.velocity).toBe("number");
    expect(out).toEqual({ pitch: 60, startTime: 0, duration: 1, velocity: 100 });
  });

  test("omits undefined velocity/probability rather than writing undefined", () => {
    const out = coerceNote({ pitch: 60, startTime: 0, duration: 1 });
    expect("velocity" in out).toBe(false);
    expect("probability" in out).toBe(false);
  });
});

describe("clipOverlapsRange", () => {
  // Half-open intervals: clipStart < rangeEnd && clipEnd > rangeStart.
  // Touching endpoints do NOT overlap — a clip ending at rangeStart or
  // starting at rangeEnd is considered outside the selection.

  test("clip fully inside the range overlaps", () => {
    expect(clipOverlapsRange(2, 4, 0, 8)).toBe(true);
  });

  test("range fully inside the clip overlaps", () => {
    expect(clipOverlapsRange(0, 16, 4, 8)).toBe(true);
  });

  test("partial overlap at the left edge", () => {
    expect(clipOverlapsRange(2, 6, 4, 8)).toBe(true);
  });

  test("partial overlap at the right edge", () => {
    expect(clipOverlapsRange(6, 12, 4, 8)).toBe(true);
  });

  test("clip ending exactly at range start does NOT overlap", () => {
    expect(clipOverlapsRange(0, 4, 4, 8)).toBe(false);
  });

  test("clip starting exactly at range end does NOT overlap", () => {
    expect(clipOverlapsRange(8, 12, 4, 8)).toBe(false);
  });

  test("clip entirely before the range does not overlap", () => {
    expect(clipOverlapsRange(0, 2, 4, 8)).toBe(false);
  });

  test("clip entirely after the range does not overlap", () => {
    expect(clipOverlapsRange(10, 12, 4, 8)).toBe(false);
  });

  test("zero-length range inside a clip is still considered overlapping", () => {
    // Degenerate selection (start == end) passing through a clip: the
    // predicate returns true because both half-open checks pass. Callers
    // that want to exclude degenerate ranges (e.g. Live's single-clip
    // right-clicks, which arrive as start == end) must handle that case
    // upstream — the predicate doesn't special-case it.
    expect(clipOverlapsRange(0, 8, 4, 4)).toBe(true);
  });
});
