import { describe, expect, test } from "vitest";
import type { NoteData } from "./bridge.js";
import { quantizeNotes } from "./quantize.js";

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

  test("preserves array length and per-note order", () => {
    const notes = [note(0.1, 0.3, 60), note(0.4, 0.1, 64), note(0.9, 0.2, 67)];
    const result = quantizeNotes(notes, "16th");
    expect(result).toHaveLength(3);
    expect(result.map((n) => n.pitch)).toEqual([60, 64, 67]);
  });

  test("does not mutate input notes", () => {
    const input = [note(0.13, 0.27)];
    const snapshot = JSON.stringify(input);
    quantizeNotes(input, "16th");
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  test("16th-triplet chooses closer grid per-value, not per-note", () => {
    // startTime near 1/6 (triplet), duration near 0.25 (straight)
    const [n] = quantizeNotes([note(1 / 6 + 0.01, 0.24)], "16th-triplet");
    expect(n?.startTime).toBeCloseTo(1 / 6, 10);
    expect(n?.duration).toBe(0.25);
  });

  test("startTime 0 maps to 0 on all grids", () => {
    for (const grid of ["16th", "16th-triplet", "32nd"] as const) {
      const [n] = quantizeNotes([note(0, 0.5)], grid);
      expect(n?.startTime).toBe(0);
    }
  });

  test("snaps values well past 1 beat on 16th grid", () => {
    const [n] = quantizeNotes([note(3.37, 1.13)], "16th");
    expect(n?.startTime).toBe(3.25);
    expect(n?.duration).toBe(1.25);
  });
});
