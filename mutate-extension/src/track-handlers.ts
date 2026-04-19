import { type Handle, MidiClip, MidiTrack } from "@ableton/extensions-sdk";
import {
  applyRange,
  applySessionMulti,
  type RangeSource,
  type RangeSourceClip,
  type SessionMultiSource,
  type SessionMultiSourceClip,
} from "./apply.js";
import { type DialogDeps, openArrangementClipDialog } from "./dialog-handlers.js";
import { clipBoundsFor, coerceNote } from "./helpers.js";
import type {
  DialogResult,
  PreviewClip,
  RangeModePayload,
  SessionMultiPayload,
} from "./ui/bridge.js";

// "Mutate: Track (Session)" — reuses the SessionMulti flow: shared controls,
// independent seeds per clip, in-place only. Empty clip slots are ignored.
export async function handleTrackSessionDialog(arg: unknown, deps: DialogDeps): Promise<void> {
  const { context, showMutateDialog } = deps;
  const track = context.objects.getObjectFromHandle(arg as Handle, MidiTrack);
  const trackName = String(track.name);

  const sourceClips: SessionMultiSourceClip[] = [];
  const preview: PreviewClip[] = [];
  const slots = track.clipSlots;
  for (let si = 0; si < slots.length; si++) {
    const slot = slots[si]!;
    const clip = slot.clip;
    if (!(clip instanceof MidiClip)) continue;
    const notes = clip.notes.map(coerceNote);
    const bounds = clipBoundsFor(clip);
    sourceClips.push({
      track,
      slotIndex: si,
      clip,
      notes,
      bounds,
      duration: Number(clip.loopEnd),
    });
    const slotsBelow = slots.slice(si + 1).map((s) => s.clip !== null);
    preview.push({
      trackName,
      clipName: String(clip.name),
      sourceNotes: notes,
      bounds,
      availableSlotsBelow: slotsBelow.length,
      slotsBelowOccupied: slotsBelow,
      seedAxis: sourceClips.length - 1, // applySessionMulti uses deriveSeed2D(baseSeed, i, ...)
    });
  }

  if (sourceClips.length === 0) return;

  // Track (Session) is by definition many clips on one track — variations are
  // disabled, same rationale as multi-clip selections that hit the same track.
  const payload: SessionMultiPayload = { mode: "sessionMulti", preview, multiplePerTrack: true };
  let result: DialogResult;
  try {
    result = await showMutateDialog(payload);
  } catch (e) {
    console.error("Mutate: track-session dialog failed to show:", e);
    return;
  }
  if (result.action !== "apply") return;

  const source: SessionMultiSource = { kind: "sessionMulti", sources: sourceClips };
  try {
    await applySessionMulti(
      context,
      source,
      result.controls,
      0, // Track (Session) never produces variations
      result.baseSeed,
      result.fillMode,
      result.mutateSource,
      result.variationMode,
    );
  } catch (e) {
    console.error("Mutate: applySessionMulti failed:", e);
  }
}

// "Mutate: Track (Arrangement)" — reuses the Range flow: mutate in place
// + optionally fan variations out to new take lanes. Single-clip track
// falls through to the piano-roll preview dialog.
export async function handleTrackArrangementDialog(arg: unknown, deps: DialogDeps): Promise<void> {
  const { context, showMutateDialog } = deps;
  const track = context.objects.getObjectFromHandle(arg as Handle, MidiTrack);
  const trackIndex = context.application.song.tracks.findIndex(
    (t) => t.handle.id === track.handle.id,
  );

  const clips: RangeSourceClip[] = [];
  for (const clip of track.arrangementClips) {
    if (!(clip instanceof MidiClip)) continue;
    const startTime = Number(clip.startTime);
    const endTime = Number(clip.endTime);
    clips.push({
      trackIndex: Math.max(0, trackIndex),
      track,
      clip,
      startTime,
      duration: endTime - startTime,
      notes: clip.notes.map(coerceNote),
      bounds: clipBoundsFor(clip),
    });
  }

  if (clips.length === 0) return;
  if (clips.length === 1) {
    await openArrangementClipDialog(clips[0]!.clip, deps);
    return;
  }

  const timeStart = Math.min(...clips.map((c) => c.startTime));
  const timeEnd = Math.max(...clips.map((c) => c.startTime + c.duration));
  // Sort so preview order matches applyRange's sourceIndex iteration.
  clips.sort((a, b) => a.startTime - b.startTime);
  const trackName = String(track.name);
  const preview: PreviewClip[] = clips.map((c, i) => ({
    trackName,
    clipName: String(c.clip.name),
    sourceNotes: c.notes,
    bounds: c.bounds,
    seedAxis: i,
  }));

  const payload: RangeModePayload = {
    mode: "range",
    timeStart,
    timeEnd,
    preview,
    scopeLabel: `Track: ${track.name}`,
  };
  let result: DialogResult;
  try {
    result = await showMutateDialog(payload);
  } catch (e) {
    console.error("Mutate: track-arrangement dialog failed to show:", e);
    return;
  }
  if (result.action !== "apply") return;

  const source: RangeSource = { kind: "range", timeStart, timeEnd, clips };
  try {
    await applyRange(
      context,
      source,
      result.controls,
      result.variations,
      result.baseSeed,
      result.mutateSource,
      result.variationMode,
    );
  } catch (e) {
    console.error("Mutate: applyRange failed:", e);
  }
}
