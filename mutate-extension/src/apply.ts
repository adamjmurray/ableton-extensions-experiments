import type { MidiClip, MidiTrack } from "@ableton/extensions-sdk";
import type { ClipBounds, Note } from "./transforms.js";
import { generateVariations, type MutateControls, type VariationMode } from "./variations.js";

// Scans existing take lane names on a track for the highest "Mutate N"
// suffix so that successive invocations produce distinct labels
// ("Mutate 1", "Mutate 2", then "Mutate 3", "Mutate 4", …) instead of
// stacking duplicates.
export function nextMutateLaneIndex(track: MidiTrack<"0.0.5">): number {
  let max = 0;
  for (const lane of track.takeLanes) {
    const match = /^Mutate (\d+)$/.exec(String(lane.name));
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

// Copies preservable metadata from the source clip to a newly created
// variation clip: name (suffixed " var. N") and color. Start/end markers
// and loop settings are NOT preserved — the alpha SDK exposes no setters
// for MidiClip.startMarker/endMarker/looping/loopStart/loopEnd, and
// createMidiClip takes only a length.
export function applyClipMetadata(
  created: MidiClip<"0.0.5">,
  source: MidiClip<"0.0.5">,
  variationNumber: number,
): void {
  created.name = `${String(source.name)} var. ${variationNumber}`;
  created.color = Number(source.color);
}

// Seed-indexing convention: index 0 is reserved for the in-place mutation so
// that toggling mutateSource on/off doesn't re-roll the user-visible Var
// thumbnails. Variation i (0-based in UI) uses seed index i + 1.
function mutateOneShot(
  notes: Note[],
  controls: MutateControls,
  seed: number,
  bounds: ClipBounds,
): Note[] {
  const [result] = generateVariations(notes, controls, 1, seed, bounds);
  return result!;
}

// Produces the ordered outputs for one source clip.
//   inPlace: notes for the in-place rewrite (null when mutateSource is off)
//   variations: notes for each variation slot, in order
//
// Independent mode calls seedForIndex(0) for the in-place mutation and
// seedForIndex(vi + 1) for each variation — preserving the legacy seed layout
// so swapping between independent and "mutateSource" on/off doesn't re-roll
// the variation thumbnails.
// Cumulative mode chains outputs instead: the chain has length
// (mutateSource ? 1 : 0) + variations, seeded from chainBaseSeed. The first
// step becomes the in-place result (if enabled) and each subsequent step
// mutates the previous output.
export function computeSourceOutputs(
  notes: Note[],
  controls: MutateControls,
  bounds: ClipBounds,
  mutateSource: boolean,
  variations: number,
  mode: VariationMode,
  chainBaseSeed: number,
  seedForIndex: (seedIndex: number) => number,
): { inPlace: Note[] | null; variations: Note[][] } {
  if (mode === "cumulative") {
    const total = (mutateSource ? 1 : 0) + variations;
    const chain = generateVariations(notes, controls, total, chainBaseSeed, bounds, "cumulative");
    if (mutateSource) {
      return { inPlace: chain[0] ?? null, variations: chain.slice(1) };
    }
    return { inPlace: null, variations: chain };
  }
  const inPlace = mutateSource ? mutateOneShot(notes, controls, seedForIndex(0), bounds) : null;
  const out: Note[][] = [];
  for (let vi = 0; vi < variations; vi++) {
    out.push(mutateOneShot(notes, controls, seedForIndex(vi + 1), bounds));
  }
  return { inPlace, variations: out };
}

export { applyArrangement } from "./apply-arrangement.js";
export { applyRange } from "./apply-range.js";
export { applyScene } from "./apply-scene.js";
// Per-mode apply implementations live in sibling files to keep this module
// focused on shared helpers. Re-export for existing callers.
export { applySession } from "./apply-session.js";
export { applySessionMulti } from "./apply-session-multi.js";
export type {
  ApplySource,
  ArrangementSource,
  FillMode,
  RangeSource,
  RangeSourceClip,
  SceneSource,
  SceneSourceClip,
  SessionMultiSource,
  SessionMultiSourceClip,
  SessionSource,
} from "./apply-types.js";
