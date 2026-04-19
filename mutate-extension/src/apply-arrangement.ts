import type { ExtensionContext, NoteDescription } from "@ableton/extensions-sdk";
import { applyClipMetadata, computeSourceOutputs, nextMutateLaneIndex } from "./apply.js";
import type { ArrangementSource } from "./apply-types.js";
import { deriveSeed } from "./rng.js";
import type { MutateControls, VariationMode } from "./variations.js";

export async function applyArrangement(
  context: ExtensionContext<"0.0.5">,
  source: ArrangementSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  mutateSource: boolean,
  variationMode: VariationMode,
): Promise<void> {
  const outputs = computeSourceOutputs(
    source.notes,
    controls,
    source.bounds,
    mutateSource,
    variations,
    variationMode,
    baseSeed,
    (i) => deriveSeed(baseSeed, i),
  );

  const baseIndex = nextMutateLaneIndex(source.track);

  // Phase 1: create all take lanes in parallel. In-place notes are written in
  // the final phase so they group with the variation-notes writes.
  const lanes = await context.withinTransaction(() =>
    Promise.all(Array.from({ length: variations }, () => source.track.createTakeLane())),
  );

  // Phase 2: set lane names + create clips.
  const createdClips = await context.withinTransaction(() => {
    lanes.forEach((lane, i) => {
      lane.name = `Mutate ${baseIndex + i}`;
    });
    return Promise.all(lanes.map((lane) => lane.createMidiClip(source.startTime, source.duration)));
  });

  // Phase 3: in-place notes + set notes + metadata.
  context.withinTransaction(() => {
    if (outputs.inPlace) {
      source.clip.notes = outputs.inPlace as NoteDescription[];
    }
    createdClips.forEach((clip, i) => {
      clip.notes = outputs.variations[i] as NoteDescription[];
      applyClipMetadata(clip, source.clip, i + 1);
    });
  });
}
