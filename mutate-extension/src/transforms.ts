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

// Drops exactly floor(amount * notes.length) notes, chosen uniformly at random.
// Surviving notes keep their original order.
export function dropNotes(notes: Note[], amount: number, rng: Rng): Note[] {
  const frac = clamp(amount, 0, 1);
  const dropCount = Math.floor(frac * notes.length);
  if (dropCount <= 0) return notes.slice();
  if (dropCount >= notes.length) return [];
  const indices = notes.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  const dropSet = new Set(indices.slice(0, dropCount));
  return notes.filter((_, i) => !dropSet.has(i));
}

// Per-note probability roll: each note independently drops with probability `chance`.
// Used by the quick-action context menu items, where the count is not exact.
export function dropNotesByChance(notes: Note[], chance: number, rng: Rng): Note[] {
  const p = clamp(chance, 0, 1);
  return notes.filter(() => rng() >= p);
}

// Per-pair probability roll: random shuffle into pairs, then each pair independently
// swaps pitches with probability `chance`. Odd-count input leaves the final index unpaired.
export function swapNotesByChance(notes: Note[], chance: number, rng: Rng): Note[] {
  const out = notes.map((n) => ({ ...n }));
  const p = clamp(chance, 0, 1);
  const indices = out.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  for (let i = 0; i + 1 < indices.length; i += 2) {
    if (rng() < p) {
      const a = indices[i]!;
      const b = indices[i + 1]!;
      const tmpPitch = out[a]!.pitch;
      out[a]!.pitch = out[b]!.pitch;
      out[b]!.pitch = tmpPitch;
    }
  }
  return out;
}

// Shuffles indices into adjacent pairs, then swaps pitches on exactly
// floor(amount * pairCount) pairs. Odd-count input leaves the final index unpaired.
export function swapNotes(notes: Note[], amount: number, rng: Rng): Note[] {
  const out = notes.map((n) => ({ ...n }));
  const frac = clamp(amount, 0, 1);
  const pairCount = Math.floor(out.length / 2);
  const swapCount = Math.floor(frac * pairCount);
  if (swapCount <= 0) return out;
  const indices = out.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  for (let i = 0; i < swapCount; i++) {
    const a = indices[i * 2]!;
    const b = indices[i * 2 + 1]!;
    const tmpPitch = out[a]!.pitch;
    out[a]!.pitch = out[b]!.pitch;
    out[b]!.pitch = tmpPitch;
  }
  return out;
}
