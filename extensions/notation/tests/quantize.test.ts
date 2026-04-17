import { describe, expect, test } from "vitest";
import { quantizeNotes } from "../src/ui/quantize.js";
import type { NoteData } from "../src/ui/bridge.js";

function note(startTime: number, duration: number, pitch = 60, velocity = 100): NoteData {
  return { pitch, startTime, duration, velocity };
}

describe("quantizeNotes", () => {
  test("16th grid snaps startTime to 0.25 multiples", () => {
    const [n] = quantizeNotes([note(0.13, 0.27)], "16th");
    expect(n?.startTime).toBe(0.25);
  });

  test("16th grid snaps duration to 0.25 multiples", () => {
    const [n] = quantizeNotes([note(0, 0.27)], "16th");
    expect(n?.duration).toBe(0.25);
  });

  test("16th grid enforces duration minimum of 0.25", () => {
    const [n] = quantizeNotes([note(0, 0.05)], "16th");
    expect(n?.duration).toBe(0.25);
  });

  test("32nd grid snaps to 0.125", () => {
    const [n] = quantizeNotes([note(0.1, 0.1)], "32nd");
    expect(n?.startTime).toBe(0.125);
    expect(n?.duration).toBe(0.125);
  });

  test("16th-triplet picks the closer of straight 16th or triplet 16th per value", () => {
    const [straight] = quantizeNotes([note(0.25, 0.25)], "16th-triplet");
    expect(straight?.startTime).toBe(0.25);
    expect(straight?.duration).toBe(0.25);

    const [triplet] = quantizeNotes([note(1 / 6, 1 / 6)], "16th-triplet");
    expect(triplet?.startTime).toBeCloseTo(1 / 6, 10);
    expect(triplet?.duration).toBeCloseTo(1 / 6, 10);
  });

  test("16th-triplet enforces duration minimum of 1/6 (the smaller grid)", () => {
    const [n] = quantizeNotes([note(0, 0.01)], "16th-triplet");
    expect(n?.duration).toBeCloseTo(1 / 6, 10);
  });

  test("preserves pitch and velocity", () => {
    const [n] = quantizeNotes([note(0.1, 0.2, 72, 80)], "16th");
    expect(n?.pitch).toBe(72);
    expect(n?.velocity).toBe(80);
  });

  test("handles empty input", () => {
    expect(quantizeNotes([], "16th")).toEqual([]);
  });
});
