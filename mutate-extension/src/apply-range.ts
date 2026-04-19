import type { ExtensionContext, MidiTrack, NoteDescription } from "@ableton/extensions-sdk";
import { applyClipMetadata, computeSourceOutputs, nextMutateLaneIndex } from "./apply.js";
import type { RangeSource, RangeSourceClip } from "./apply-types.js";
import { deriveSeed2D } from "./rng.js";
import type { MutateControls, VariationMode } from "./variations.js";

export async function applyRange(
  context: ExtensionContext<"0.0.5">,
  source: RangeSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  mutateSource: boolean,
  variationMode: VariationMode,
): Promise<void> {
  // Group source clips by trackIndex so we can create N take lanes per track
  // and put one varied clip per source on each lane.
  const byTrack = new Map<
    number,
    { track: MidiTrack<"0.0.5">; entries: Array<{ sourceIndex: number; src: RangeSourceClip }> }
  >();
  source.clips.forEach((src, sourceIndex) => {
    const existing = byTrack.get(src.trackIndex);
    if (existing) {
      existing.entries.push({ sourceIndex, src });
    } else {
      byTrack.set(src.trackIndex, { track: src.track, entries: [{ sourceIndex, src }] });
    }
  });

  // One independent chain per source clip, keyed by its flat sourceIndex.
  const outputsBySourceIndex = source.clips.map((src, sourceIndex) =>
    computeSourceOutputs(
      src.notes,
      controls,
      src.bounds,
      mutateSource,
      variations,
      variationMode,
      deriveSeed2D(baseSeed, sourceIndex, 0),
      (i) => deriveSeed2D(baseSeed, sourceIndex, i),
    ),
  );

  // Plan lane assignments: one lane per (track, variation) pair.
  type LanePlan = {
    track: MidiTrack<"0.0.5">;
    name: string;
    vi: number;
    entries: Array<{ sourceIndex: number; src: RangeSourceClip }>;
  };
  const lanePlans: LanePlan[] = [];
  for (const { track, entries } of byTrack.values()) {
    const baseIndex = nextMutateLaneIndex(track);
    for (let vi = 0; vi < variations; vi++) {
      lanePlans.push({ track, name: `Mutate ${baseIndex + vi}`, vi, entries });
    }
  }

  // Phase 1: create all take lanes in parallel. In-place notes are written in
  // the final phase so they group with the variation-notes writes.
  const lanes = await context.withinTransaction(() =>
    Promise.all(lanePlans.map((p) => p.track.createTakeLane())),
  );

  // Phase 2: set lane names + create all clips in parallel.
  type ClipPlan = {
    laneIdx: number;
    sourceIndex: number;
    src: RangeSourceClip;
    vi: number;
  };
  const clipPlans: ClipPlan[] = [];
  lanePlans.forEach((p, laneIdx) => {
    for (const { sourceIndex, src } of p.entries) {
      clipPlans.push({ laneIdx, sourceIndex, src, vi: p.vi });
    }
  });

  const createdClips = await context.withinTransaction(() => {
    lanes.forEach((lane, i) => {
      lane.name = lanePlans[i]!.name;
    });
    return Promise.all(
      clipPlans.map((cp) => lanes[cp.laneIdx]!.createMidiClip(cp.src.startTime, cp.src.duration)),
    );
  });

  // Phase 3: in-place notes + set notes + metadata on created clips.
  context.withinTransaction(() => {
    source.clips.forEach((src, sourceIndex) => {
      const inPlace = outputsBySourceIndex[sourceIndex]!.inPlace;
      if (inPlace) src.clip.notes = inPlace as NoteDescription[];
    });
    createdClips.forEach((clip, i) => {
      const cp = clipPlans[i]!;
      const notes = outputsBySourceIndex[cp.sourceIndex]!.variations[cp.vi]!;
      clip.notes = notes as NoteDescription[];
      applyClipMetadata(clip, cp.src.clip, cp.vi + 1);
    });
  });
}
