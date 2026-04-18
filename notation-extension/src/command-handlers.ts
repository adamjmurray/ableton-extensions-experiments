import {
  type ArrangementSelection,
  ClipSlot,
  type ClipSlotSelection,
  DataModelObject,
  type ExtensionContext,
  type Handle,
  MidiClip,
  MidiTrack,
  Scene,
} from "@ableton/extensions-sdk";
import {
  beatsPerMeasure,
  buildFlattenedClipInfo,
  buildRangeClipInfo,
  type ClipInfo,
  computeArrangementRange,
  findOverlap,
  readMidiClip,
  shiftClipNotes,
} from "./clip-utils.js";
import { findMidiTrack, isDrumRackTrack } from "./drum-rack.js";
import { getClipRenderRegion } from "./ui/musicxml.js";

export type SongMetadata = {
  tempo: number;
  rootNote: number;
  scaleName: string;
  timeSignature: { numerator: number; denominator: number };
};

export type HandlerDeps = {
  context: ExtensionContext<"0.0.5">;
  getSongMetadata: () => SongMetadata;
  showNotationDialog: (clips: ClipInfo[], emptyStateMessage?: string) => Promise<void>;
};

// `sceneBarCounts[i]` is the bar width allotted to scene `(sceneStart + i)` —
// callers compute these widths so that scenes can align across multiple
// tracks (per-scene width = max barCount across participating tracks). A clip
// shorter than its scene width gets implicit trailing rest from the synthetic
// loopEnd envelope.
//
// `slotClips[i]` is the pre-read ClipInfo + region for scene `(sceneStart + i)`,
// or null for empty slots. Passed in so callers that already walked the slots
// to compute bar widths don't pay a second read+region pass per clip.
type SlotClip = { info: ClipInfo; region: ReturnType<typeof getClipRenderRegion> };

function flattenTrackSlots(
  trackName: string,
  isDrum: boolean,
  bpm: number,
  sceneBarCounts: number[],
  slotClips: (SlotClip | null)[],
): ClipInfo {
  const notes: ClipInfo["notes"] = [];
  let offset = 0;
  for (let i = 0; i < sceneBarCounts.length; i++) {
    const sceneWidth = sceneBarCounts[i]! * bpm;
    const sc = slotClips[i];
    if (sc) {
      notes.push(
        ...shiftClipNotes(
          sc.info,
          sc.region.filterStart,
          sc.region.renderEnd,
          offset - sc.region.renderStart,
        ),
      );
    }
    offset += sceneWidth;
  }
  return buildFlattenedClipInfo(trackName, isDrum, notes, offset);
}

export async function handleShowSelection(
  selection: ClipSlotSelection,
  deps: HandlerDeps,
): Promise<void> {
  const { context, getSongMetadata, showNotationDialog } = deps;
  const songTracks = context.application.song.tracks;
  const bpm = beatsPerMeasure(getSongMetadata().timeSignature);

  type SelectedTrack = {
    trackIdx: number;
    track: MidiTrack<"0.0.5">;
    trackName: string;
    isDrum: boolean;
  };
  const selectedTracks = new Map<number, SelectedTrack>();
  let minScene = Infinity;
  let maxScene = -Infinity;

  for (const handle of selection.selected_clip_slots) {
    const slot = context.objects.getObjectFromHandle(handle, ClipSlot);
    const track = findMidiTrack(slot);
    if (!track) continue;
    const trackIdx = songTracks.findIndex((t) => t.handle.id === track.handle.id);
    if (trackIdx < 0) continue;
    const sceneIdx = track.clipSlots.findIndex((s) => s.handle.id === slot.handle.id);
    if (sceneIdx < 0) continue;

    if (!selectedTracks.has(trackIdx)) {
      selectedTracks.set(trackIdx, {
        trackIdx,
        track,
        trackName: String(track.name),
        isDrum: isDrumRackTrack(track),
      });
    }
    if (sceneIdx < minScene) minScene = sceneIdx;
    if (sceneIdx > maxScene) maxScene = sceneIdx;
  }

  if (selectedTracks.size === 0 || maxScene < minScene) {
    await showNotationDialog([], "No notes in the selected clip(s).");
    return;
  }

  // Per-scene width = max bar count across participating tracks; empty
  // everywhere ⇒ 1 bar of rest. Computed across the union scene range
  // so scene boundaries align across all parts. Each clip is read and
  // its region computed exactly once here; the per-track SlotClip array
  // is reused when flattening below.
  const rangeLen = maxScene - minScene + 1;
  const sceneBarCounts: number[] = new Array(rangeLen).fill(1);
  const perTrackSlots = new Map<number, (SlotClip | null)[]>();
  for (const { trackIdx } of selectedTracks.values()) {
    perTrackSlots.set(trackIdx, new Array(rangeLen).fill(null));
  }
  let lastSceneWithAnyClip = -1;
  for (let i = 0; i < rangeLen; i++) {
    const sceneIdx = minScene + i;
    let widest = 1;
    let hasClip = false;
    for (const { trackIdx, track, trackName, isDrum } of selectedTracks.values()) {
      const clip = track.clipSlots[sceneIdx]?.clip;
      if (clip && clip instanceof MidiClip) {
        hasClip = true;
        const info = readMidiClip(clip, trackName, isDrum);
        const region = getClipRenderRegion(info.clip, bpm);
        perTrackSlots.get(trackIdx)![i] = { info, region };
        if (region.barCount > widest) widest = region.barCount;
      }
    }
    sceneBarCounts[i] = widest;
    if (hasClip) lastSceneWithAnyClip = i;
  }

  if (lastSceneWithAnyClip < 0) {
    await showNotationDialog([], "No notes in the selected clip(s).");
    return;
  }

  const trimmedBarCounts = sceneBarCounts.slice(0, lastSceneWithAnyClip + 1);
  const orderedTracks = [...selectedTracks.values()].sort((a, b) => a.trackIdx - b.trackIdx);
  const clips: ClipInfo[] = [];
  for (const { trackIdx, trackName, isDrum } of orderedTracks) {
    const slots = perTrackSlots.get(trackIdx)!.slice(0, lastSceneWithAnyClip + 1);
    const flattened = flattenTrackSlots(trackName, isDrum, bpm, trimmedBarCounts, slots);
    if (flattened.notes.length > 0) clips.push(flattened);
  }

  if (clips.length === 0) {
    await showNotationDialog([], "No notes in the selected clip(s).");
    return;
  }

  await showNotationDialog(clips);
}

export async function handleShowScene(sceneHandle: Handle, deps: HandlerDeps): Promise<void> {
  const { context, showNotationDialog } = deps;
  const scene = context.objects.getObjectFromHandle(sceneHandle, Scene);
  const scenes = context.application.song.scenes;
  const sceneIndex = scenes.findIndex((s) => s.handle.id === scene.handle.id);
  if (sceneIndex < 0) {
    console.log("Notation: Could not find scene index.");
    return;
  }

  const clips: ClipInfo[] = [];
  const songTracks = context.application.song.tracks;
  for (let trackIndex = 0; trackIndex < songTracks.length; trackIndex++) {
    const track = songTracks[trackIndex]!;
    const slot = track.clipSlots[sceneIndex];
    const clip = slot?.clip;
    if (clip && clip instanceof MidiClip) {
      const midiTrack = track instanceof MidiTrack ? track : null;
      const clipData = readMidiClip(
        clip,
        String(track.name),
        isDrumRackTrack(midiTrack),
        undefined,
        trackIndex,
      );
      if (clipData.notes.length > 0) {
        clips.push(clipData);
      }
    }
  }

  if (clips.length === 0) {
    await showNotationDialog([], "No notes in this scene.");
    return;
  }

  await showNotationDialog(clips);
}

export async function handleShowArrangementSelection(
  selection: ArrangementSelection,
  deps: HandlerDeps,
): Promise<void> {
  const { context, getSongMetadata, showNotationDialog } = deps;
  const tracks = selection.selected_lanes
    .map((handle) => context.objects.getObjectFromHandle(handle, DataModelObject))
    .filter((obj): obj is MidiTrack<"0.0.5"> => obj instanceof MidiTrack);

  if (tracks.length === 0) {
    await showNotationDialog([], "No MIDI tracks in the selection.");
    return;
  }

  const start = Number(selection.time_selection_start);
  const end = Number(selection.time_selection_end);
  const bpm = beatsPerMeasure(getSongMetadata().timeSignature);

  type TrackClip = {
    info: ClipInfo;
    arrangementStart: number;
    filterStart: number;
    renderEnd: number;
  };
  type PerTrack = { trackName: string; isDrum: boolean; clips: TrackClip[] };

  const perTrack: PerTrack[] = [];
  let minArrangementStart = Infinity;
  for (const track of tracks) {
    const trackName = String(track.name);
    const isDrum = isDrumRackTrack(track);
    const trackClips: TrackClip[] = [];
    for (const clip of track.arrangementClips) {
      if (!(clip instanceof MidiClip)) continue;
      const clipStart = Number(clip.startTime);
      const clipEnd = Number(clip.endTime);
      if (!(clipStart < end && clipEnd > start)) continue;
      const info = readMidiClip(clip, trackName, isDrum);
      const region = getClipRenderRegion(info.clip, bpm);
      trackClips.push({
        info,
        arrangementStart: clipStart,
        filterStart: region.filterStart,
        renderEnd: region.renderEnd,
      });
      if (clipStart < minArrangementStart) minArrangementStart = clipStart;
    }
    if (trackClips.length > 0) {
      trackClips.sort((a, b) => a.arrangementStart - b.arrangementStart);
      perTrack.push({ trackName, isDrum, clips: trackClips });
    }
  }

  if (perTrack.length === 0) {
    await showNotationDialog([], "No notes in the selected time range.");
    return;
  }

  const anchor = Math.floor(minArrangementStart / bpm) * bpm;

  type FlattenedTrack = {
    trackName: string;
    isDrum: boolean;
    notes: ClipInfo["notes"];
    end: number;
  };
  const flattenedTracks: FlattenedTrack[] = [];
  let maxEnd = 0;
  for (const { trackName, isDrum, clips: trackClips } of perTrack) {
    const placedRanges: { start: number; end: number }[] = [];
    const notes: ClipInfo["notes"] = [];
    let trackEnd = 0;
    for (const c of trackClips) {
      const shift = c.arrangementStart - c.info.clip.startMarker - anchor;
      const flatStart = c.filterStart + shift;
      const flatEnd = c.renderEnd + shift;
      const overlap = findOverlap(placedRanges, flatStart, flatEnd);
      if (overlap) {
        console.warn(
          `Notation: overlapping arrangement clips on track "${trackName}" merged into single voice (ranges ${overlap.start.toFixed(2)}-${overlap.end.toFixed(2)} and ${flatStart.toFixed(2)}-${flatEnd.toFixed(2)} in beats).`,
        );
      }
      placedRanges.push({ start: flatStart, end: flatEnd });
      notes.push(...shiftClipNotes(c.info, c.filterStart, c.renderEnd, shift));
      if (flatEnd > trackEnd) trackEnd = flatEnd;
    }
    if (notes.length === 0) continue;
    flattenedTracks.push({ trackName, isDrum, notes, end: trackEnd });
    if (trackEnd > maxEnd) maxEnd = trackEnd;
  }

  if (flattenedTracks.length === 0) {
    await showNotationDialog([], "No notes in the selected time range.");
    return;
  }

  const clips: ClipInfo[] = flattenedTracks.map((t) =>
    buildFlattenedClipInfo(t.trackName, t.isDrum, t.notes, maxEnd),
  );

  await showNotationDialog(clips);
}

export async function handleShowArrangementRange(
  selection: ArrangementSelection,
  deps: HandlerDeps,
): Promise<void> {
  const { context, getSongMetadata, showNotationDialog } = deps;
  const tracks = selection.selected_lanes
    .map((handle) => context.objects.getObjectFromHandle(handle, DataModelObject))
    .filter((obj): obj is MidiTrack<"0.0.5"> => obj instanceof MidiTrack);

  if (tracks.length === 0) {
    await showNotationDialog([], "No MIDI tracks in the selection.");
    return;
  }

  const rangeStart = Number(selection.time_selection_start);
  const rangeEnd = Number(selection.time_selection_end);
  const bpm = beatsPerMeasure(getSongMetadata().timeSignature);
  const { anchor, leadingOffset, renderLength } = computeArrangementRange(
    rangeStart,
    rangeEnd,
    bpm,
  );

  const clips: ClipInfo[] = [];
  const songTracks = context.application.song.tracks;

  for (const track of tracks) {
    const isDrum = isDrumRackTrack(track);
    const trackIndex = songTracks.findIndex((t) => t.handle.id === track.handle.id);
    const notes: ClipInfo["notes"] = [];

    for (const clip of track.arrangementClips) {
      if (!(clip instanceof MidiClip)) continue;
      const clipStart = Number(clip.startTime);
      const clipEnd = Number(clip.endTime);
      if (!(clipStart < rangeEnd && clipEnd > rangeStart)) continue;

      const startMarker = Number(clip.startMarker);
      for (const n of clip.notes) {
        const localStart = Number(n.startTime);
        const duration = Number(n.duration);
        const arrStart = clipStart + localStart - startMarker;
        if (arrStart < rangeStart || arrStart >= rangeEnd) continue;
        const truncated = Math.min(duration, rangeEnd - arrStart);
        notes.push({
          pitch: Number(n.pitch),
          startTime: arrStart - anchor,
          duration: truncated,
          velocity: Number(n.velocity ?? 64),
        });
      }
    }

    if (notes.length === 0) continue;

    clips.push(
      buildRangeClipInfo(
        String(track.name),
        trackIndex >= 0 ? trackIndex : undefined,
        isDrum,
        notes,
        leadingOffset,
        renderLength,
      ),
    );
  }

  if (clips.length === 0) {
    await showNotationDialog([], "No notes in the selected time range.");
    return;
  }

  await showNotationDialog(clips);
}

export async function handleShowTrackSession(
  trackHandle: Handle,
  deps: HandlerDeps,
): Promise<void> {
  const { context, getSongMetadata, showNotationDialog } = deps;
  const track = context.objects.getObjectFromHandle(trackHandle, MidiTrack);
  const trackName = String(track.name);
  const isDrum = isDrumRackTrack(track);
  const bpm = beatsPerMeasure(getSongMetadata().timeSignature);

  const slots = track.clipSlots;
  const sceneBarCounts: number[] = [];
  const slotClips: (SlotClip | null)[] = [];
  let lastNonEmpty = -1;
  for (let i = 0; i < slots.length; i++) {
    const clip = slots[i]?.clip;
    if (clip && clip instanceof MidiClip) {
      const info = readMidiClip(clip, trackName, isDrum);
      const region = getClipRenderRegion(info.clip, bpm);
      sceneBarCounts.push(region.barCount);
      slotClips.push({ info, region });
      lastNonEmpty = i;
    } else {
      sceneBarCounts.push(1);
      slotClips.push(null);
    }
  }

  if (lastNonEmpty < 0) {
    await showNotationDialog([], "No MIDI clips on this track.");
    return;
  }

  const flattened = flattenTrackSlots(
    trackName,
    isDrum,
    bpm,
    sceneBarCounts.slice(0, lastNonEmpty + 1),
    slotClips.slice(0, lastNonEmpty + 1),
  );
  if (flattened.notes.length === 0) {
    await showNotationDialog([], "No notes on this track's session clips.");
    return;
  }

  await showNotationDialog([flattened]);
}

export async function handleShowTrackArrangement(
  trackHandle: Handle,
  deps: HandlerDeps,
): Promise<void> {
  const { context, getSongMetadata, showNotationDialog } = deps;
  const track = context.objects.getObjectFromHandle(trackHandle, MidiTrack);
  const trackName = String(track.name);
  const isDrum = isDrumRackTrack(track);
  const bpm = beatsPerMeasure(getSongMetadata().timeSignature);

  type Clip = {
    info: ClipInfo;
    arrangementStart: number;
    filterStart: number;
    renderEnd: number;
  };
  const clips: Clip[] = [];
  for (const clip of track.arrangementClips) {
    if (!(clip instanceof MidiClip)) continue;
    const arrangementStart = Number(clip.startTime);
    const info = readMidiClip(clip, trackName, isDrum);
    const region = getClipRenderRegion(info.clip, bpm);
    clips.push({
      info,
      arrangementStart,
      filterStart: region.filterStart,
      renderEnd: region.renderEnd,
    });
  }

  if (clips.length === 0) {
    await showNotationDialog([], "No MIDI clips on this track.");
    return;
  }

  clips.sort((a, b) => a.arrangementStart - b.arrangementStart);

  // Overlap detection against previously-placed flattened ranges.
  // Anchor at arrangement time 0 so the output begins at bar 1 of the
  // arrangement timeline; leading arrangement space renders as rest
  // measures before the first clip.
  const placedRanges: { start: number; end: number }[] = [];
  const notes: ClipInfo["notes"] = [];
  let totalLength = 0;

  for (const c of clips) {
    const shift = c.arrangementStart - c.info.clip.startMarker;
    const flatStart = c.filterStart + shift;
    const flatEnd = c.renderEnd + shift;

    const overlap = findOverlap(placedRanges, flatStart, flatEnd);
    if (overlap) {
      console.warn(
        `Notation: overlapping arrangement clips on track "${trackName}" merged into single voice (ranges ${overlap.start.toFixed(2)}-${overlap.end.toFixed(2)} and ${flatStart.toFixed(2)}-${flatEnd.toFixed(2)} in beats).`,
      );
    }
    placedRanges.push({ start: flatStart, end: flatEnd });

    notes.push(...shiftClipNotes(c.info, c.filterStart, c.renderEnd, shift));
    totalLength = Math.max(totalLength, flatEnd);
  }

  const flattened = buildFlattenedClipInfo(trackName, isDrum, notes, totalLength);
  if (flattened.notes.length === 0) {
    await showNotationDialog([], "No notes on this track's arrangement clips.");
    return;
  }

  await showNotationDialog([flattened]);
}
