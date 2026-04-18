import {
  type ArrangementSelection,
  DataModelObject,
  type ExtensionContext,
  type Handle,
  MidiClip,
  MidiTrack,
  Scene,
} from "@ableton/extensions-sdk";
import {
  type ArrangementSource,
  applyArrangement,
  applyRange,
  applyScene,
  applySession,
  type RangeSource,
  type RangeSourceClip,
  type SceneSource,
  type SceneSourceClip,
  type SessionSource,
} from "./apply.js";
import { clipBoundsFor, clipOverlapsRange, coerceNote } from "./helpers.js";
import { handleSessionMultiClip } from "./session-multi-handler.js";
import type {
  ClipModeArrangementPayload,
  ClipModeSessionPayload,
  DialogPayload,
  DialogResult,
  RangeModePayload,
  RangeTrackSummary,
  SceneModePayload,
  SceneSourceSummary,
} from "./ui/bridge.js";

export type DialogDeps = {
  context: ExtensionContext<"0.0.5">;
  showMutateDialog: (payload: DialogPayload) => Promise<DialogResult>;
  collectMidiClipsFromArg: (arg: unknown) => MidiClip<"0.0.5">[];
  describeSessionSource: (clip: MidiClip<"0.0.5">) => SessionSource | null;
  describeArrangementSource: (clip: MidiClip<"0.0.5">) => ArrangementSource | null;
};

async function openArrangementClipDialog(clip: MidiClip<"0.0.5">, deps: DialogDeps): Promise<void> {
  const { context, showMutateDialog, describeArrangementSource } = deps;
  const source = describeArrangementSource(clip);
  if (!source) {
    console.log("Mutate: could not resolve arrangement source for clip");
    return;
  }
  const payload: ClipModeArrangementPayload = {
    mode: "clip",
    branch: "arrangement",
    sourceNotes: source.notes,
    bounds: source.bounds,
    sourceClipName: String(clip.name),
    trackName: String(source.track.name),
  };

  let result: DialogResult;
  try {
    result = await showMutateDialog(payload);
  } catch (e) {
    console.error("Mutate: arrangement-clip dialog failed to show:", e);
    return;
  }
  if (result.action !== "apply") return;

  try {
    await applyArrangement(
      context,
      source,
      result.controls,
      result.variations,
      result.baseSeed,
      result.mutateSource,
    );
    const sourceWrite = result.mutateSource ? ` + in-place` : "";
    console.log(
      `Mutate: wrote ${result.variations} take lane(s)${sourceWrite} for "${payload.sourceClipName}"`,
    );
  } catch (e) {
    console.error("Mutate: applyArrangement failed:", e);
  }
}

export async function handleClipDialog(arg: unknown, deps: DialogDeps): Promise<void> {
  const { context, showMutateDialog, collectMidiClipsFromArg, describeSessionSource } = deps;
  const clips = collectMidiClipsFromArg(arg);
  if (clips.length === 0) {
    console.log("Mutate: Clip(s)... — no MIDI clips in selection");
    return;
  }
  if (clips.length !== 1) {
    await handleSessionMultiClip(clips, deps);
    return;
  }
  const sourceClip = clips[0]!;
  const session = describeSessionSource(sourceClip);
  if (!session) {
    console.log("Mutate: clip is not in a session clip slot");
    return;
  }

  const slotsBelow = session.track.clipSlots.slice(session.slotIndex + 1);
  const payload: ClipModeSessionPayload = {
    mode: "clip",
    branch: "session",
    sourceNotes: session.notes,
    bounds: session.bounds,
    sourceClipName: String(sourceClip.name),
    trackName: String(session.track.name),
    availableSlotsBelow: slotsBelow.length,
    slotsBelowOccupied: slotsBelow.map((s) => s.clip !== null),
  };

  let result: DialogResult;
  try {
    result = await showMutateDialog(payload);
  } catch (e) {
    console.error("Mutate: clip dialog failed to show:", e);
    return;
  }
  if (result.action !== "apply") return;

  try {
    await applySession(
      context,
      session,
      result.controls,
      result.variations,
      result.baseSeed,
      result.fillMode,
      result.mutateSource,
    );
    const sourceWrite = result.mutateSource ? ` + in-place` : "";
    console.log(
      `Mutate: wrote ${result.variations} slot(s)${sourceWrite} for "${payload.sourceClipName}"`,
    );
  } catch (e) {
    console.error("Mutate: applySession failed:", e);
  }
}

export async function handleSceneDialog(arg: unknown, deps: DialogDeps): Promise<void> {
  const { context, showMutateDialog } = deps;
  const scene = context.objects.getObjectFromHandle(arg as Handle, Scene);
  const song = context.application.song;
  const scenes = song.scenes;
  const sceneIndex = scenes.findIndex((s) => s.handle.id === scene.handle.id);
  if (sceneIndex < 0) {
    console.log("Mutate: could not find scene index");
    return;
  }

  const tracks = song.tracks;
  const totalScenes = scenes.length;

  const snapshot: SceneSourceClip[] = [];
  const summaries: SceneSourceSummary[] = [];
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti]!;
    if (!(track instanceof MidiTrack)) continue;
    const slot = track.clipSlots[sceneIndex];
    const clip = slot?.clip;
    if (!(clip instanceof MidiClip)) continue;

    snapshot.push({
      trackIndex: ti,
      track,
      clip,
      notes: clip.notes.map(coerceNote),
      bounds: clipBoundsFor(clip),
      duration: Number(clip.loopEnd),
    });

    const slotsBelow: boolean[] = [];
    for (let si = sceneIndex + 1; si < totalScenes; si++) {
      slotsBelow.push(track.clipSlots[si]?.clip != null);
    }
    summaries.push({
      trackIndex: ti,
      trackName: String(track.name),
      clipName: String(clip.name),
      noteCount: clip.notes.length,
      slotsBelowOccupied: slotsBelow,
    });
  }

  if (snapshot.length === 0) {
    console.log(`Mutate: scene "${scene.name}" has no MIDI clips`);
    return;
  }

  const payload: SceneModePayload = {
    mode: "scene",
    sceneIndex,
    sceneName: String(scene.name),
    totalScenesInSong: totalScenes,
    sources: summaries,
  };

  let result: DialogResult;
  try {
    result = await showMutateDialog(payload);
  } catch (e) {
    console.error("Mutate: scene dialog failed to show:", e);
    return;
  }
  if (result.action !== "apply") return;

  const sceneSource: SceneSource = { kind: "scene", sceneIndex, sources: snapshot };
  try {
    await applyScene(
      context,
      sceneSource,
      result.controls,
      result.variations,
      result.baseSeed,
      result.fillMode,
      result.mutateSource,
    );
    const inPlaceCount = result.mutateSource ? snapshot.length : 0;
    const newCount = result.variations * snapshot.length;
    console.log(
      `Mutate: scene "${scene.name}" — wrote ${inPlaceCount} in-place + ${newCount} new clip(s)`,
    );
  } catch (e) {
    console.error("Mutate: applyScene failed:", e);
  }
}

// Fires for a right-click anywhere in MidiTrack.ArrangementSelection: either
// a drag-selected time range OR a single-clip right-click (Live treats the
// single clip as a degenerate range). Single-clip goes through the piano-roll
// preview dialog; multi-clip (or multi-track) goes through the range-mode
// indicator-grid dialog.
export async function handleRangeDialog(arg: unknown, deps: DialogDeps): Promise<void> {
  const { context, showMutateDialog } = deps;
  if (!arg || typeof arg !== "object") {
    console.log("Mutate: Clip(s)... — unexpected command arg");
    return;
  }
  if (!("selected_lanes" in arg && "time_selection_start" in arg)) {
    console.log("Mutate: Clip(s)... — arg is not an ArrangementSelection");
    return;
  }
  const selection = arg as ArrangementSelection;
  const timeStart = Number(selection.time_selection_start);
  const timeEnd = Number(selection.time_selection_end);

  // Collect MIDI clips overlapping the range, keeping the track association.
  const rangeClips: RangeSourceClip[] = [];
  for (const h of selection.selected_lanes) {
    const obj = context.objects.getObjectFromHandle(h, DataModelObject);
    if (!(obj instanceof MidiTrack)) continue;
    const trackIndex = context.application.song.tracks.findIndex(
      (t) => t.handle.id === obj.handle.id,
    );
    if (trackIndex < 0) continue;
    for (const clip of obj.arrangementClips) {
      if (!(clip instanceof MidiClip)) continue;
      const cs = Number(clip.startTime);
      const ce = Number(clip.endTime);
      if (clipOverlapsRange(cs, ce, timeStart, timeEnd)) {
        rangeClips.push({
          trackIndex,
          track: obj,
          clip,
          startTime: cs,
          duration: ce - cs,
          notes: clip.notes.map(coerceNote),
          bounds: clipBoundsFor(clip),
        });
      }
    }
  }

  if (rangeClips.length === 0) {
    console.log("Mutate: Clip(s)... — no MIDI clips in selection");
    return;
  }
  if (rangeClips.length === 1) {
    await openArrangementClipDialog(rangeClips[0]!.clip, deps);
    return;
  }

  // Multi-clip: build the range-mode payload grouped by track for the UI summary.
  const byTrack = new Map<number, { trackName: string; clipCount: number }>();
  for (const rc of rangeClips) {
    const existing = byTrack.get(rc.trackIndex);
    if (existing) {
      existing.clipCount += 1;
    } else {
      byTrack.set(rc.trackIndex, { trackName: String(rc.track.name), clipCount: 1 });
    }
  }
  const trackSummaries: RangeTrackSummary[] = Array.from(byTrack.entries())
    .sort(([a], [b]) => a - b)
    .map(([trackIndex, { trackName, clipCount }]) => ({ trackIndex, trackName, clipCount }));

  const payload: RangeModePayload = {
    mode: "range",
    timeStart,
    timeEnd,
    totalClipCount: rangeClips.length,
    tracks: trackSummaries,
  };

  let result: DialogResult;
  try {
    result = await showMutateDialog(payload);
  } catch (e) {
    console.error("Mutate: range dialog failed to show:", e);
    return;
  }
  if (result.action !== "apply") return;

  const source: RangeSource = {
    kind: "range",
    timeStart,
    timeEnd,
    clips: rangeClips,
  };
  try {
    await applyRange(
      context,
      source,
      result.controls,
      result.variations,
      result.baseSeed,
      result.mutateSource,
    );
    const inPlace = result.mutateSource ? rangeClips.length : 0;
    const newClips = result.variations * rangeClips.length;
    console.log(
      `Mutate: Clip(s) — wrote ${inPlace} in-place + ${newClips} new clip(s) across ${trackSummaries.length} track(s)`,
    );
  } catch (e) {
    console.error("Mutate: applyRange failed:", e);
  }
}
