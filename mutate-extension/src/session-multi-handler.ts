import { ClipSlot, type MidiClip, MidiTrack } from "@ableton-extensions/sdk";
import {
  applySessionMulti,
  type SessionMultiSource,
  type SessionMultiSourceClip,
} from "./apply.js";
import type { DialogDeps } from "./dialog-handlers.js";
import { clipBoundsFor, coerceNote } from "./helpers.js";
import type { DialogResult, PreviewClip, SessionMultiPayload } from "./ui/bridge.js";

// Multi-clip Session selection. Variations are supported when each track
// contributes at most one selected clip — each clip then fans down into the
// slots immediately below it on its own track, so per-track ownership of the
// destination slots is unambiguous. If any track has more than one selected
// clip, variations are disabled and we mutate in place only.
export async function handleSessionMultiClip(
  clips: MidiClip<"1.0.0">[],
  deps: DialogDeps,
): Promise<void> {
  const { context, showMutateDialog } = deps;

  const sourceClips: SessionMultiSourceClip[] = [];
  const preview: PreviewClip[] = [];
  for (const clip of clips) {
    const slot = clip.parent;
    if (!(slot instanceof ClipSlot)) continue;
    const track = slot.parent;
    if (!(track instanceof MidiTrack)) continue;
    const slotIndex = track.clipSlots.findIndex((s) => s.handle.id === slot.handle.id);
    if (slotIndex < 0) continue;
    const notes = clip.notes.map(coerceNote);
    const bounds = clipBoundsFor(clip);
    sourceClips.push({
      track,
      slotIndex,
      clip,
      notes,
      bounds,
      duration: Number(clip.loopEnd),
    });
    const slotsBelow = track.clipSlots.slice(slotIndex + 1).map((s) => s.clip !== null);
    preview.push({
      trackName: String(track.name),
      clipName: String(clip.name),
      sourceNotes: notes,
      bounds,
      availableSlotsBelow: slotsBelow.length,
      slotsBelowOccupied: slotsBelow,
      seedAxis: sourceClips.length - 1, // applySessionMulti uses deriveSeed2D(baseSeed, i, ...)
    });
  }

  if (sourceClips.length === 0) return;

  const trackIds = sourceClips.map((s) => s.track.handle.id);
  const multiplePerTrack = new Set(trackIds).size !== trackIds.length;

  const payload: SessionMultiPayload = multiplePerTrack
    ? { mode: "sessionMulti", preview, multiplePerTrack: true }
    : { mode: "sessionMulti", preview };

  let result: DialogResult;
  try {
    result = await showMutateDialog(payload);
  } catch (e) {
    console.error("Mutate: session-multi dialog failed to show:", e);
    return;
  }
  if (result.action !== "apply") return;

  const source: SessionMultiSource = { kind: "sessionMulti", sources: sourceClips };
  const variations = multiplePerTrack ? 0 : result.variations;
  try {
    await applySessionMulti(
      context,
      source,
      result.controls,
      variations,
      result.baseSeed,
      result.fillMode,
      result.mutateSource,
      result.variationMode,
    );
  } catch (e) {
    console.error("Mutate: applySessionMulti failed:", e);
  }
}
