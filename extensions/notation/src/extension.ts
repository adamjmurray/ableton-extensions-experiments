import {
  initialize,
  ClipSlot,
  DataModelObject,
  Device,
  DrumChain,
  MidiClip,
  MidiTrack,
  RackDevice,
  Scene,
  type ActivationContext,
  type ArrangementSelection,
  type ClipSlotSelection,
  type Handle,
} from "@ableton/extensions-sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { exec } from "node:child_process";

import notationInterface from "./notation.html";
import { getClipRenderRegion } from "./ui/musicxml.js";
import {
  beatsPerMeasure,
  buildFlattenedClipInfo,
  buildRangeClipInfo,
  nameSuggestsDrums,
  readMidiClip,
  shiftClipNotes,
  type ClipInfo,
} from "./clip-utils.js";

interface ExportAction {
  action: "export";
  data: string;
  filename: string;
  encoding: "utf8" | "base64";
}

interface CloseAction {
  action: "close";
}

type DialogResult = ExportAction | CloseAction;

function openFile(filePath: string) {
  const platform = os.platform();
  const cmd = platform === "win32" ? "start" : "open";
  exec(`${cmd} "${filePath}"`, (err) => {
    if (err) console.error("Notation: Failed to open file:", err);
  });
}

function findMidiTrack(obj: DataModelObject<"0.0.5"> | null): MidiTrack<"0.0.5"> | null {
  let current: DataModelObject<"0.0.5"> | null = obj;
  while (current && !(current instanceof MidiTrack)) {
    current = current.parent as DataModelObject<"0.0.5"> | null;
  }
  return current;
}

// Structural check for a top-level Drum Rack on a track: walk the track's
// devices and look for a RackDevice whose chains are DrumChains. Works when
// Drum Rack sits directly on the track.
//
// Known alpha-SDK bug: once a Drum Rack is wrapped inside an Instrument Rack,
// the host no longer tags its pad chains as DrumChain (verified by probing
// `dataModelInstance.getObjectIsOfClass` directly — nothing returns a drum
// tag), and the nested Drum Rack's `.chains` returns empty. Recursing into
// nested racks doesn't help: Instrument Rack → Instrument Rack nesting also
// yields empty `.chains`, so a 0-chain fallback false-positives. Until the
// SDK classifies nested drum-rack chains correctly, we only auto-detect the
// top-level case here and fall back to name heuristics in the caller.
function hasTopLevelDrumRack(devices: Device<"0.0.5">[]): boolean {
  for (const d of devices) {
    if (!(d instanceof RackDevice)) continue;
    for (const chain of d.chains) {
      if (chain instanceof DrumChain) return true;
    }
  }
  return false;
}

// Name-based fallback for wrapped drum racks lives in clip-utils.ts. If the
// track or its first rack device is named like a drum track ("Drums", "Kit"),
// assume drums. Matches the common naming convention ("Drums 1", "808 Kit",
// etc.) and covers the wrapped-in-instrument-rack case the SDK can't surface
// structurally.

function isDrumRackTrack(track: MidiTrack<"0.0.5"> | null): boolean {
  if (!track) return false;
  if (hasTopLevelDrumRack(track.devices)) return true;
  if (nameSuggestsDrums(String(track.name))) return true;
  const firstRack = track.devices.find((d): d is RackDevice<"0.0.5"> => d instanceof RackDevice);
  if (firstRack && nameSuggestsDrums(String(firstRack.name))) return true;
  return false;
}

// Flatten a contiguous range of a track's clipSlots into one ClipInfo.
// `sceneBarCounts[i]` is the bar width allotted to scene `(sceneStart + i)` —
// callers compute these widths so that scenes can align across multiple
// tracks (per-scene width = max barCount across participating tracks). A clip
// shorter than its scene width gets implicit trailing rest from the synthetic
// loopEnd envelope.
function flattenTrackSlots(
  track: MidiTrack<"0.0.5">,
  trackName: string,
  isDrum: boolean,
  bpm: number,
  sceneStart: number,
  sceneBarCounts: number[],
): ClipInfo {
  const notes: ClipInfo["notes"] = [];
  let offset = 0;
  for (let i = 0; i < sceneBarCounts.length; i++) {
    const sceneWidth = sceneBarCounts[i]! * bpm;
    const slot = track.clipSlots[sceneStart + i];
    const clip = slot?.clip;
    if (clip && clip instanceof MidiClip) {
      const info = readMidiClip(clip, trackName, isDrum);
      const region = getClipRenderRegion(info.clip, bpm);
      notes.push(...shiftClipNotes(info, region.filterStart, region.renderEnd, offset - region.renderStart));
    }
    offset += sceneWidth;
  }
  return buildFlattenedClipInfo(trackName, isDrum, notes, offset);
}

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "0.0.5");

  console.log("Notation activated!");

  function getSongMetadata() {
    const song = context.application.song;
    const tempo = Number(song.tempo);
    const rootNote = Number(song.rootNote);
    const scaleName = String(song.scaleName);

    let numerator = 4;
    let denominator = 4;
    try {
      const scene = song.scenes[0];
      if (scene) {
        const num = Number(scene.signatureNumerator);
        const den = Number(scene.signatureDenominator);
        if (num > 0 && den > 0) {
          numerator = num;
          denominator = den;
        }
      }
    } catch (e) {
      console.log("Notation: Could not read scene time signature, defaulting to 4/4");
    }

    return { tempo, rootNote, scaleName, timeSignature: { numerator, denominator } };
  }

  async function showNotationDialog(clips: ClipInfo[], emptyStateMessage?: string) {
    const metadata = getSongMetadata();

    const payload = JSON.stringify({
      clips,
      ...metadata,
      ...(emptyStateMessage ? { emptyStateMessage } : {}),
    });

    // Escape sequences that would prematurely terminate the <script> block or
    // break HTML/JS parsing if they appear inside clip/track/scale names.
    // JSON.stringify does not escape `<`, `>`, or U+2028/U+2029.
    const safePayload = payload
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    const html = notationInterface.replace(
      "</head>",
      `<script>window.__NOTATION_DATA__='${safePayload}';</script></head>`,
    );
    const dataUrl = `data:text/html,${encodeURIComponent(html)}`;

    const exportDir = path.join(
      context.environment.tempDirectory || os.tmpdir(),
      "notation-exports",
    );
    fs.mkdirSync(exportDir, { recursive: true });

    while (true) {
      try {
        const dialog = context.createModalDialog();
        const resultStr = await dialog.show(dataUrl, 1200, 800);
        const result: DialogResult = JSON.parse(resultStr);

        if (result.action === "close") {
          break;
        }

        if (result.action === "export") {
          const filePath = path.join(exportDir, result.filename);
          if (result.encoding === "base64") {
            fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
          } else {
            fs.writeFileSync(filePath, result.data, "utf-8");
          }
          console.log(`Notation: Exported to ${filePath}`);
          openFile(filePath);
        }
      } catch (e) {
        console.error("Notation dialog error:", e);
        break;
      }
    }
  }

  // Single clip: right-click a MIDI clip (Session or Arrangement)
  context.commands.registerCommand(
    "notation.showClip",
    (arg: unknown) =>
      void (async (handle: Handle) => {
        const clip = context.objects.getObjectFromHandle(handle, MidiClip);
        const track = findMidiTrack(clip);
        const trackName = String(track?.name ?? "");
        const clipData = readMidiClip(clip, trackName, isDrumRackTrack(track));

        if (clipData.notes.length === 0) {
          await showNotationDialog([], "No notes in this clip.");
          return;
        }

        await showNotationDialog([clipData]);
      })(arg as Handle),
  );

  // Session clip slot selection (one or more clip slots)
  context.commands.registerCommand(
    "notation.showSelection",
    (arg: unknown) =>
      void (async (selection: ClipSlotSelection) => {
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
        // so scene boundaries align across all parts.
        const rangeLen = maxScene - minScene + 1;
        const sceneBarCounts: number[] = new Array(rangeLen).fill(1);
        let lastSceneWithAnyClip = -1;
        for (let i = 0; i < rangeLen; i++) {
          const sceneIdx = minScene + i;
          let widest = 1;
          let hasClip = false;
          for (const { track } of selectedTracks.values()) {
            const clip = track.clipSlots[sceneIdx]?.clip;
            if (clip && clip instanceof MidiClip) {
              hasClip = true;
              const region = getClipRenderRegion(
                {
                  startMarker: Number(clip.startMarker),
                  loopStart: Number(clip.loopStart),
                  loopEnd: Number(clip.loopEnd),
                  looping: Boolean(clip.looping),
                },
                bpm,
              );
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
        for (const { track, trackName, isDrum } of orderedTracks) {
          const flattened = flattenTrackSlots(track, trackName, isDrum, bpm, minScene, trimmedBarCounts);
          if (flattened.notes.length > 0) clips.push(flattened);
        }

        if (clips.length === 0) {
          await showNotationDialog([], "No notes in the selected clip(s).");
          return;
        }

        await showNotationDialog(clips);
      })(arg as ClipSlotSelection),
  );

  // Scene: all MIDI clips in the scene's row
  context.commands.registerCommand(
    "notation.showScene",
    (arg: unknown) =>
      void (async (handle: Handle) => {
        const scene = context.objects.getObjectFromHandle(handle, Scene);
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
            const clipData = readMidiClip(clip, String(track.name), isDrumRackTrack(midiTrack), undefined, trackIndex);
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
      })(arg as Handle),
  );

  // Arrangement time selection: MIDI clips on selected tracks that overlap the range
  context.commands.registerCommand(
    "notation.showArrangementSelection",
    (arg: unknown) =>
      void (async (selection: ArrangementSelection) => {
        const tracks = selection.selected_lanes
          .map((handle) => context.objects.getObjectFromHandle(handle, DataModelObject))
          .filter((obj): obj is MidiTrack<"0.0.5"> => obj instanceof MidiTrack);

        if (tracks.length === 0) {
          await showNotationDialog([], "No MIDI tracks in the selection.");
          return;
        }

        const start = Number(selection.time_selection_start);
        const end = Number(selection.time_selection_end);
        const clips: ClipInfo[] = [];
        const songTracks = context.application.song.tracks;
        for (const track of tracks) {
          const isDrum = isDrumRackTrack(track);
          const trackIndex = songTracks.findIndex((t) => t.handle.id === track.handle.id);
          for (const clip of track.arrangementClips) {
            if (!(clip instanceof MidiClip)) continue;
            const clipStart = Number(clip.startTime);
            const clipEnd = Number(clip.endTime);
            if (clipStart < end && clipEnd > start) {
              const clipData = readMidiClip(clip, String(track.name), isDrum, clipStart, trackIndex >= 0 ? trackIndex : undefined);
              if (clipData.notes.length > 0) {
                clips.push(clipData);
              }
            }
          }
        }

        if (clips.length === 0) {
          await showNotationDialog([], "No notes in the selected time range.");
          return;
        }

        await showNotationDialog(clips);
      })(arg as ArrangementSelection),
  );

  // Arrangement time selection, range mode: render only the notes inside
  // [time_selection_start, time_selection_end). All clips on a track are
  // flattened onto one staff; each selected track is one part. Anchors at
  // the bar boundary at or before the selection start so the first rendered
  // measure aligns to the arrangement bar grid.
  context.commands.registerCommand(
    "notation.showArrangementRange",
    (arg: unknown) =>
      void (async (selection: ArrangementSelection) => {
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
        const anchor = Math.floor(rangeStart / bpm) * bpm;
        const leadingOffset = rangeStart - anchor;
        const renderLength = rangeEnd - anchor;

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
      })(arg as ArrangementSelection),
  );

  // Track (session): flatten all MIDI clips in the track's clipSlots into
  // one continuous staff. Empty slots become one bar of rest; trailing
  // empty slots are trimmed.
  context.commands.registerCommand(
    "notation.showTrackSession",
    (arg: unknown) =>
      void (async (handle: Handle) => {
        const track = context.objects.getObjectFromHandle(handle, MidiTrack);
        const trackName = String(track.name);
        const isDrum = isDrumRackTrack(track);
        const bpm = beatsPerMeasure(getSongMetadata().timeSignature);

        const slots = track.clipSlots;
        const sceneBarCounts: number[] = [];
        let lastNonEmpty = -1;
        for (let i = 0; i < slots.length; i++) {
          const clip = slots[i]?.clip;
          if (clip && clip instanceof MidiClip) {
            const region = getClipRenderRegion(
              {
                startMarker: Number(clip.startMarker),
                loopStart: Number(clip.loopStart),
                loopEnd: Number(clip.loopEnd),
                looping: Boolean(clip.looping),
              },
              bpm,
            );
            sceneBarCounts.push(region.barCount);
            lastNonEmpty = i;
          } else {
            sceneBarCounts.push(1);
          }
        }

        if (lastNonEmpty < 0) {
          await showNotationDialog([], "No MIDI clips on this track.");
          return;
        }

        const flattened = flattenTrackSlots(
          track,
          trackName,
          isDrum,
          bpm,
          0,
          sceneBarCounts.slice(0, lastNonEmpty + 1),
        );
        if (flattened.notes.length === 0) {
          await showNotationDialog([], "No notes on this track's session clips.");
          return;
        }

        await showNotationDialog([flattened]);
      })(arg as Handle),
  );

  // Track (arrangement): flatten all MIDI arrangement clips on the track
  // onto one staff aligned to the arrangement bar grid. Gaps between
  // clips become rest measures. Overlapping clips (unusual) merge with
  // a console warning.
  context.commands.registerCommand(
    "notation.showTrackArrangement",
    (arg: unknown) =>
      void (async (handle: Handle) => {
        const track = context.objects.getObjectFromHandle(handle, MidiTrack);
        const trackName = String(track.name);
        const isDrum = isDrumRackTrack(track);
        const bpm = beatsPerMeasure(getSongMetadata().timeSignature);

        type Clip = { info: ClipInfo; arrangementStart: number; filterStart: number; renderEnd: number };
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

          const overlap = placedRanges.find((r) => r.start < flatEnd && r.end > flatStart);
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
      })(arg as Handle),
  );

  context.ui.registerContextMenuAction("MidiClip", "Render Clip", "notation.showClip");
  context.ui.registerContextMenuAction("ClipSlotSelection", "Render Selection", "notation.showSelection");
  context.ui.registerContextMenuAction("Scene", "Render Scene", "notation.showScene");
  context.ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Render Clips",
    "notation.showArrangementSelection",
  );
  context.ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Render Range",
    "notation.showArrangementRange",
  );
  context.ui.registerContextMenuAction("MidiTrack", "Render Track (Session)", "notation.showTrackSession");
  context.ui.registerContextMenuAction("MidiTrack", "Render Track (Arrangement)", "notation.showTrackArrangement");
}
