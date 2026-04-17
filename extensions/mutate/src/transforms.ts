import { applyRange, type ControlRange } from "./control.js";
import type { Rng } from "./rng.js";

export type Note = {
  pitch: number;
  startTime: number;
  duration: number;
  velocity?: number;
  probability?: number;
};

export type ClipBounds = { start: number; end: number };

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

// 1/128 beat — shorter than any musically meaningful value, avoids zero-length degeneracies.
const MIN_DURATION = 1 / 128;

export function transformVelocity(notes: Note[], ctrl: ControlRange, rng: Rng): Note[] {
  return notes.map((n) => ({
    ...n,
    velocity: Math.round(clamp(applyRange(n.velocity ?? 100, ctrl, rng), 1, 127)),
  }));
}

export function transformStart(
  notes: Note[],
  ctrl: ControlRange,
  rng: Rng,
  bounds: ClipBounds,
): Note[] {
  return notes.map((n) => ({
    ...n,
    startTime: clamp(applyRange(n.startTime, ctrl, rng), bounds.start, bounds.end),
  }));
}

export function transformDuration(
  notes: Note[],
  ctrl: ControlRange,
  rng: Rng,
  bounds: ClipBounds,
): Note[] {
  return notes.map((n) => {
    const maxDuration = Math.max(MIN_DURATION, bounds.end - n.startTime);
    return {
      ...n,
      duration: clamp(applyRange(n.duration, ctrl, rng), MIN_DURATION, maxDuration),
    };
  });
}

export function transformProbability(notes: Note[], ctrl: ControlRange, rng: Rng): Note[] {
  return notes.map((n) => ({
    ...n,
    probability: clamp(applyRange(n.probability ?? 1.0, ctrl, rng), 0, 1),
  }));
}
