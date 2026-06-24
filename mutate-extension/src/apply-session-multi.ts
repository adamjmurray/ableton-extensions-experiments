import type { ExtensionContext, NoteDescription } from "@ableton-extensions/sdk";
import { applyClipMetadata, computeSourceOutputs } from "./apply.js";
import type { FillMode, SessionMultiSource, SessionMultiSourceClip } from "./apply-types.js";
import { deriveSeed2D } from "./rng.js";
import type { Note } from "./transforms.js";
import type { MutateControls, VariationMode } from "./variations.js";

// Multi-clip Session selection. Each source clip mutates independently under
// shared controls; variations (when requested) fan down into the slots
// immediately below the source on its own track. Caller must guarantee at
// most one source per track so the per-track fan-down has unambiguous
// ownership of the destination slots.
export async function applySessionMulti(
  context: ExtensionContext<"1.0.0">,
  source: SessionMultiSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  fillMode: FillMode,
  mutateSource: boolean,
  variationMode: VariationMode,
): Promise<void> {
  const song = context.application.song;

  const outputsBySource = source.sources.map((src, i) =>
    computeSourceOutputs(
      src.notes,
      controls,
      src.bounds,
      mutateSource,
      variations,
      variationMode,
      deriveSeed2D(baseSeed, i, 0),
      (k) => deriveSeed2D(baseSeed, i, k),
    ),
  );

  if (variations === 0) {
    if (!mutateSource) return;
    context.withinTransaction(() => {
      source.sources.forEach((src, i) => {
        const inPlace = outputsBySource[i]!.inPlace;
        if (inPlace) src.clip.notes = inPlace as NoteDescription[];
      });
    });
    return;
  }

  const requiredScenes = Math.max(...source.sources.map((s) => s.slotIndex + 1 + variations));
  await context.withinTransaction(() => {
    const scenePromises: Promise<unknown>[] = [];
    for (let idx = song.scenes.length; idx < requiredScenes; idx++) {
      scenePromises.push(song.createScene(idx));
    }
    return Promise.all(scenePromises);
  });

  type Target = {
    slot: (typeof source.sources)[number]["track"]["clipSlots"][number];
    src: SessionMultiSourceClip;
    notes: Note[];
    varIndex: number;
  };
  const targets: Target[] = [];
  const occupiedToDelete: Target[] = [];
  source.sources.forEach((src, si) => {
    for (let vi = 0; vi < variations; vi++) {
      const slot = src.track.clipSlots[src.slotIndex + 1 + vi];
      if (!slot) continue;
      const t: Target = {
        slot,
        src,
        notes: outputsBySource[si]!.variations[vi]!,
        varIndex: vi,
      };
      const occupied = slot.clip !== null;
      if (occupied && fillMode === "skip") continue;
      if (occupied) occupiedToDelete.push(t);
      targets.push(t);
    }
  });

  if (occupiedToDelete.length > 0) {
    await context.withinTransaction(() =>
      Promise.all(occupiedToDelete.map((t) => t.slot.deleteClip())),
    );
  }

  const created = await context.withinTransaction(() =>
    Promise.all(targets.map((t) => t.slot.createMidiClip(t.src.duration))),
  );

  context.withinTransaction(() => {
    source.sources.forEach((src, i) => {
      const inPlace = outputsBySource[i]!.inPlace;
      if (inPlace) src.clip.notes = inPlace as NoteDescription[];
    });
    created.forEach((clip, i) => {
      const t = targets[i]!;
      clip.notes = t.notes as NoteDescription[];
      applyClipMetadata(clip, t.src.clip, t.varIndex + 1);
    });
  });
}
