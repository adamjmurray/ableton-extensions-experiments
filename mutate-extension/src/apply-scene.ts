import type { ExtensionContext, NoteDescription } from "@ableton-extensions/sdk";
import { applyClipMetadata, computeSourceOutputs } from "./apply.js";
import type { FillMode, SceneSource, SceneSourceClip } from "./apply-types.js";
import { deriveSeed2D } from "./rng.js";
import type { Note } from "./transforms.js";
import type { MutateControls, VariationMode } from "./variations.js";

export async function applyScene(
  context: ExtensionContext<"1.0.0">,
  source: SceneSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  fillMode: FillMode,
  mutateSource: boolean,
  variationMode: VariationMode,
): Promise<void> {
  const song = context.application.song;
  const maxTargetSceneIndex = source.sceneIndex + variations;

  // One independent chain per source clip.
  const outputsBySource = source.sources.map((src) =>
    computeSourceOutputs(
      src.notes,
      controls,
      src.bounds,
      mutateSource,
      variations,
      variationMode,
      deriveSeed2D(baseSeed, src.trackIndex, 0),
      (i) => deriveSeed2D(baseSeed, src.trackIndex, i),
    ),
  );

  // Phase 1: create missing scenes. In-place notes are written in the final
  // phase so they group with the variation-notes writes.
  await context.withinTransaction(() => {
    const scenePromises: Promise<unknown>[] = [];
    for (let idx = song.scenes.length; idx <= maxTargetSceneIndex; idx++) {
      scenePromises.push(song.createScene(idx));
    }
    return Promise.all(scenePromises);
  });

  type Target = {
    slot: (typeof source.sources)[number]["track"]["clipSlots"][number];
    src: SceneSourceClip;
    notes: Note[];
    varIndex: number;
  };
  const targets: Target[] = [];
  const occupiedToDelete: Target[] = [];
  for (let vi = 0; vi < variations; vi++) {
    const targetSceneIndex = source.sceneIndex + 1 + vi;
    source.sources.forEach((src, si) => {
      const slot = src.track.clipSlots[targetSceneIndex];
      if (!slot) return;
      const t: Target = { slot, src, notes: outputsBySource[si]!.variations[vi]!, varIndex: vi };
      const occupied = slot.clip !== null;
      if (occupied && fillMode === "skip") return;
      if (occupied) occupiedToDelete.push(t);
      targets.push(t);
    });
  }

  if (occupiedToDelete.length > 0) {
    await context.withinTransaction(() =>
      Promise.all(occupiedToDelete.map((t) => t.slot.deleteClip())),
    );
  }

  const created = await context.withinTransaction(() =>
    Promise.all(targets.map((t) => t.slot.createMidiClip(t.src.duration))),
  );

  context.withinTransaction(() => {
    source.sources.forEach((src, si) => {
      const inPlace = outputsBySource[si]!.inPlace;
      if (inPlace) src.clip.notes = inPlace as NoteDescription[];
    });
    created.forEach((clip, i) => {
      const t = targets[i]!;
      clip.notes = t.notes as NoteDescription[];
      applyClipMetadata(clip, t.src.clip, t.varIndex + 1);
    });
  });
}
