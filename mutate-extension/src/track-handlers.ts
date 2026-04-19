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
  RangeClipSummary,
  RangeModePayload,
  SessionMultiPayload,
  SessionMultiSourceSummary,
} from "./ui/bridge.js";

// "Mutate: Track (Session)" — reuses the SessionMulti flow: shared controls,
// independent seeds per clip, in-place only. Empty clip slots are ignored.
export async function handleTrackSessionDialog(arg: unknown, deps: DialogDeps): Promise<void> {
  const { context, showMutateDialog } = deps;
  const track = context.objects.getObjectFromHandle(arg as Handle, MidiTrack);
  const trackName = String(track.name);

  const sourceClips: SessionMultiSourceClip[] = [];
  const summaries: SessionMultiSourceSummary[] = [];
  for (const slot of track.clipSlots) {
    const clip = slot.clip;
    if (!(clip instanceof MidiClip)) continue;
    sourceClips.push({
      track,
      clip,
      notes: clip.notes.map(coerceNote),
      bounds: clipBoundsFor(clip),
    });
    summaries.push({
      trackName,
      clipName: String(clip.name),
      noteCount: clip.notes.length,
    });
  }

  if (sourceClips.length === 0) return;

  const payload: SessionMultiPayload = { mode: "sessionMulti", sources: summaries };
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
    await applySessionMulti(context, source, result.controls, result.baseSeed);
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
  const trackName = String(track.name);
  const clipSummaries: RangeClipSummary[] = clips
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((c) => ({
      trackName,
      clipName: String(c.clip.name),
      noteCount: c.notes.length,
    }));

  const payload: RangeModePayload = {
    mode: "range",
    timeStart,
    timeEnd,
    clips: clipSummaries,
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
