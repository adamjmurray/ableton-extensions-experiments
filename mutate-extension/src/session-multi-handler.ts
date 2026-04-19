import { ClipSlot, type MidiClip, MidiTrack } from "@ableton/extensions-sdk";
import {
  applySessionMulti,
  type SessionMultiSource,
  type SessionMultiSourceClip,
} from "./apply.js";
import type { DialogDeps } from "./dialog-handlers.js";
import { clipBoundsFor, coerceNote } from "./helpers.js";
import type { DialogResult, PreviewClip, SessionMultiPayload } from "./ui/bridge.js";

// Multi-clip Session selection: shared controls, one in-place mutation per
// selected clip. No variations (see SessionMultiApp for why).
export async function handleSessionMultiClip(
  clips: MidiClip<"0.0.5">[],
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
    const notes = clip.notes.map(coerceNote);
    const bounds = clipBoundsFor(clip);
    sourceClips.push({ track, clip, notes, bounds });
    const slotIndex = track.clipSlots.findIndex((s) => s.handle.id === slot.handle.id);
    const slotsBelow =
      slotIndex >= 0 ? track.clipSlots.slice(slotIndex + 1).map((s) => s.clip !== null) : [];
    preview.push({
      trackName: String(track.name),
      clipName: String(clip.name),
      sourceNotes: notes,
      bounds,
      availableSlotsBelow: slotsBelow.length,
      slotsBelowOccupied: slotsBelow,
    });
  }

  if (sourceClips.length === 0) return;

  const payload: SessionMultiPayload = { mode: "sessionMulti", preview };

  let result: DialogResult;
  try {
    result = await showMutateDialog(payload);
  } catch (e) {
    console.error("Mutate: session-multi dialog failed to show:", e);
    return;
  }
  if (result.action !== "apply") return;

  const source: SessionMultiSource = { kind: "sessionMulti", sources: sourceClips };
  try {
    await applySessionMulti(context, source, result.controls, result.baseSeed);
  } catch (e) {
    console.error("Mutate: applySessionMulti failed:", e);
  }
}
