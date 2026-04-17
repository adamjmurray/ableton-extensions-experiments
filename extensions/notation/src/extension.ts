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

interface ClipInfo {
  notes: { pitch: number; startTime: number; duration: number; velocity: number }[];
  clip: {
    name: string;
    trackName: string;
    trackIndex?: number;
    startMarker: number;
    endMarker: number;
    looping: boolean;
    loopStart: number;
    loopEnd: number;
    arrangementStartTime?: number;
  };
  isDrumRack?: boolean;
}

function findMidiTrack(obj: DataModelObject<"0.0.5"> | null): MidiTrack<"0.0.5"> | null {
  let current: DataModelObject<"0.0.5"> | null = obj;
  while (current && !(current instanceof MidiTrack)) {
    current = current.parent as DataModelObject<"0.0.5"> | null;
  }
  return current;
}

// Recursively check whether the device tree contains any drum-rack chain.
// Handles the common Instrument Rack → Drum Rack nesting case.
function hasDrumChain(devices: Device<"0.0.5">[]): boolean {
  for (const d of devices) {
    if (!(d instanceof RackDevice)) continue;
    for (const chain of d.chains) {
      if (chain instanceof DrumChain) return true;
      if (hasDrumChain(chain.devices)) return true;
    }
  }
  return false;
}

function isDrumRackTrack(track: MidiTrack<"0.0.5"> | null): boolean {
  return track ? hasDrumChain(track.devices) : false;
}

function beatsPerMeasure(ts: { numerator: number; denominator: number }): number {
  return ts.numerator * (4 / ts.denominator);
}

// Shift and filter a clip's notes into the flattened-track timeline.
// Notes outside [filterStart, renderEnd] are dropped; the rest are
// translated by `shift` so that clip-local time t becomes t + shift.
function shiftClipNotes(
  info: ClipInfo,
  filterStart: number,
  renderEnd: number,
  shift: number,
): ClipInfo["notes"] {
  return info.notes
    .filter((n) => n.startTime >= filterStart && n.startTime < renderEnd)
    .map((n) => ({ ...n, startTime: n.startTime + shift }));
}

// Synthetic single-clip envelope used by "Render Track" handlers. Empty
// `name` triggers a bare `[TrackName]` part name via buildPartName
// (musicxml.ts); startMarker=0/loopEnd=totalLength makes the standalone
// renderer cover the whole flattened timeline.
function buildFlattenedClipInfo(
  trackName: string,
  isDrumRack: boolean,
  notes: ClipInfo["notes"],
  totalLength: number,
): ClipInfo {
  const info: ClipInfo = {
    notes,
    clip: {
      name: "",
      trackName,
      startMarker: 0,
      endMarker: totalLength,
      looping: false,
      loopStart: 0,
      loopEnd: totalLength,
    },
  };
  if (isDrumRack) info.isDrumRack = true;
  return info;
}

function readMidiClip(
  clip: MidiClip<any>,
  trackName: string,
  isDrumRack: boolean,
  arrangementStartTime?: number,
  trackIndex?: number,
): ClipInfo {
  const info: ClipInfo = {
    notes: clip.notes.map((n) => ({
      pitch: Number(n.pitch),
      startTime: Number(n.startTime),
      duration: Number(n.duration),
      velocity: Number(n.velocity ?? 64),
    })),
    clip: {
      name: String(clip.name),
      trackName,
      startMarker: Number(clip.startMarker),
      endMarker: Number(clip.endMarker),
      looping: Boolean(clip.looping),
      loopStart: Number(clip.loopStart),
      loopEnd: Number(clip.loopEnd),
      ...(arrangementStartTime !== undefined ? { arrangementStartTime } : {}),
      ...(trackIndex !== undefined ? { trackIndex } : {}),
    },
  };
  if (isDrumRack) info.isDrumRack = true;
  return info;
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

    const html = notationInterface.replace(
      "</head>",
      `<script>window.__NOTATION_DATA__='${payload.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}';</script></head>`,
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
        const clips: ClipInfo[] = [];
        const songTracks = context.application.song.tracks;

        for (const handle of selection.selected_clip_slots) {
          const slot = context.objects.getObjectFromHandle(handle, ClipSlot);
          const clip = slot.clip;
          if (clip && clip instanceof MidiClip) {
            const track = findMidiTrack(slot);
            const trackName = String(track?.name ?? "");
            const trackIndex = track ? songTracks.findIndex((t) => t.handle.id === track.handle.id) : -1;
            const clipData = readMidiClip(clip, trackName, isDrumRackTrack(track), undefined, trackIndex >= 0 ? trackIndex : undefined);
            if (clipData.notes.length > 0) {
              clips.push(clipData);
            }
          }
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

        type Entry = { kind: "clip"; info: ClipInfo; shift: number; filterStart: number; renderEnd: number } | { kind: "empty" };
        const entries: Entry[] = [];
        let lastNonEmpty = -1;
        let offset = 0;

        const slots = track.clipSlots;
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          const clip = slot?.clip;
          if (clip && clip instanceof MidiClip) {
            const info = readMidiClip(clip, trackName, isDrum);
            const region = getClipRenderRegion(info.clip, bpm);
            entries.push({
              kind: "clip",
              info,
              shift: offset - region.renderStart,
              filterStart: region.filterStart,
              renderEnd: region.renderEnd,
            });
            offset += region.barCount * bpm;
            lastNonEmpty = i;
          } else {
            entries.push({ kind: "empty" });
            offset += bpm;
          }
        }

        if (lastNonEmpty < 0) {
          await showNotationDialog([], "No MIDI clips on this track.");
          return;
        }

        // Trim trailing empty slots and recompute total length.
        const trimmed = entries.slice(0, lastNonEmpty + 1);
        let totalLength = 0;
        const notes: ClipInfo["notes"] = [];
        for (const e of trimmed) {
          if (e.kind === "clip") {
            const region = getClipRenderRegion(e.info.clip, bpm);
            notes.push(...shiftClipNotes(e.info, e.filterStart, e.renderEnd, e.shift));
            totalLength += region.barCount * bpm;
          } else {
            totalLength += bpm;
          }
        }

        const flattened = buildFlattenedClipInfo(trackName, isDrum, notes, totalLength);
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
    "Render Selection",
    "notation.showArrangementSelection",
  );
  context.ui.registerContextMenuAction("MidiTrack", "Render Track (Session)", "notation.showTrackSession");
  context.ui.registerContextMenuAction("MidiTrack", "Render Track (Arrangement)", "notation.showTrackArrangement");
}
