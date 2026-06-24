import type { ExtensionContext, NoteDescription } from "@ableton-extensions/sdk";
import { applyClipMetadata, computeSourceOutputs } from "./apply.js";
import type { FillMode, SessionSource } from "./apply-types.js";
import { deriveSeed } from "./rng.js";
import type { Note } from "./transforms.js";
import type { MutateControls, VariationMode } from "./variations.js";

export async function applySession(
  context: ExtensionContext<"1.0.0">,
  source: SessionSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  fillMode: FillMode,
  mutateSource: boolean,
  variationMode: VariationMode,
): Promise<void> {
  const song = context.application.song;
  const requiredScenes = source.slotIndex + 1 + variations;

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

  // Phase 1: create any missing scenes. In-place notes are written in the
  // final phase so they group with the variation-notes writes.
  await context.withinTransaction(() => {
    const scenePromises: Promise<unknown>[] = [];
    for (let idx = song.scenes.length; idx < requiredScenes; idx++) {
      scenePromises.push(song.createScene(idx));
    }
    return Promise.all(scenePromises);
  });

  // Determine target slots now that scenes exist, and split occupied ones.
  type Target = { slot: (typeof source.track.clipSlots)[number]; notes: Note[]; varIndex: number };
  const targets: Target[] = [];
  const occupiedToDelete: Target[] = [];
  for (let i = 0; i < variations; i++) {
    const slot = source.track.clipSlots[source.slotIndex + 1 + i]!;
    const target: Target = { slot, notes: outputs.variations[i]!, varIndex: i };
    const occupied = slot.clip !== null;
    if (occupied && fillMode === "skip") continue;
    if (occupied) occupiedToDelete.push(target);
    targets.push(target);
  }

  // Phase 2: delete occupied slots (if any).
  if (occupiedToDelete.length > 0) {
    await context.withinTransaction(() =>
      Promise.all(occupiedToDelete.map((t) => t.slot.deleteClip())),
    );
  }

  // Phase 3: create all MIDI clips in parallel.
  const created = await context.withinTransaction(() =>
    Promise.all(targets.map((t) => t.slot.createMidiClip(source.duration))),
  );

  // Phase 4: in-place notes + set notes + metadata on all created clips (one undo step).
  context.withinTransaction(() => {
    if (outputs.inPlace) {
      source.clip.notes = outputs.inPlace as NoteDescription[];
    }
    created.forEach((clip, i) => {
      const t = targets[i]!;
      clip.notes = t.notes as NoteDescription[];
      applyClipMetadata(clip, source.clip, t.varIndex + 1);
    });
  });
}
