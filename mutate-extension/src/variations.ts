import type { ControlRange } from "./control.js";
import { deriveSeed, mulberry32, type Rng } from "./rng.js";
import {
  type ClipBounds,
  dropNotes,
  type Note,
  swapNotes,
  transformDuration,
  transformProbability,
  transformStart,
  transformVelocity,
} from "./transforms.js";

export type MutateControls = {
  velocity: ControlRange;
  start: ControlRange;
  duration: ControlRange;
  probability: ControlRange;
  drop: ControlRange;
  swap: ControlRange;
};

export const ZERO_CONTROLS: MutateControls = {
  velocity: { offset: 0, range: 0 },
  start: { offset: 0, range: 0 },
  duration: { offset: 0, range: 0 },
  probability: { offset: 0, range: 0 },
  drop: { offset: 0, range: 0 },
  swap: { offset: 0, range: 0 },
};

export function hasAnyMutation(controls: MutateControls): boolean {
  return Object.values(controls).some((c) => c.offset !== 0 || c.range !== 0);
}

export type VariationMode = "independent" | "cumulative";

// Order: drop → swap → start → duration → velocity → probability.
function mutateOnce(notes: Note[], controls: MutateControls, rng: Rng, bounds: ClipBounds): Note[] {
  notes = dropNotes(notes, controls.drop, rng);
  notes = swapNotes(notes, controls.swap, rng);
  notes = transformStart(notes, controls.start, rng, bounds);
  notes = transformDuration(notes, controls.duration, rng, bounds);
  notes = transformVelocity(notes, controls.velocity, rng);
  notes = transformProbability(notes, controls.probability, rng);
  return notes;
}

// In "independent" mode each variation mutates the original source separately.
// In "cumulative" mode each variation mutates the previous variation's output,
// producing a drifting chain: source → v0 → v1 → … → v{count-1}.
export function generateVariations(
  source: Note[],
  controls: MutateControls,
  count: number,
  baseSeed: number,
  bounds: ClipBounds,
  mode: VariationMode = "independent",
): Note[][] {
  if (mode === "cumulative") {
    const out: Note[][] = [];
    let current = source.map((n) => ({ ...n }));
    for (let i = 0; i < count; i++) {
      current = mutateOnce(current, controls, mulberry32(deriveSeed(baseSeed, i)), bounds);
      out.push(current.map((n) => ({ ...n })));
    }
    return out;
  }
  return Array.from({ length: count }, (_, i) =>
    mutateOnce(
      source.map((n) => ({ ...n })),
      controls,
      mulberry32(deriveSeed(baseSeed, i)),
      bounds,
    ),
  );
}

export function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
}
