import {
  initialize,
  ClipSlot,
  MidiClip,
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
    startMarker: number;
    endMarker: number;
    looping: boolean;
    loopStart: number;
    loopEnd: number;
  };
}

function readMidiClip(clip: MidiClip<any>): ClipInfo {
  return {
    notes: clip.notes.map((n) => ({
      pitch: Number(n.pitch),
      startTime: Number(n.startTime),
      duration: Number(n.duration),
      velocity: Number(n.velocity ?? 64),
    })),
    clip: {
      name: String(clip.name),
      startMarker: Number(clip.startMarker),
      endMarker: Number(clip.endMarker),
      looping: Boolean(clip.looping),
      loopStart: Number(clip.loopStart),
      loopEnd: Number(clip.loopEnd),
    },
  };
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
      const scenes = song.scenes;
      if (scenes.length > 0) {
        const scene = scenes[0];
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

  async function showNotationDialog(clips: ClipInfo[]) {
    const metadata = getSongMetadata();

    const payload = JSON.stringify({
      clips,
      ...metadata,
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

    const defaultName = clips.length === 1 ? clips[0].clip.name || "notation" : "score";

    while (true) {
      try {
        const dialog = context.createModalDialog();
        const resultStr = await dialog.show(dataUrl, 900, 650);
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
        const clipData = readMidiClip(clip);

        if (clipData.notes.length === 0) {
          console.log("Notation: No notes in clip.");
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

        for (const handle of selection.selected_clip_slots) {
          const slot = context.objects.getObjectFromHandle(handle, ClipSlot);
          const clip = slot.clip;
          if (clip && clip instanceof MidiClip) {
            const clipData = readMidiClip(clip);
            if (clipData.notes.length > 0) {
              clips.push(clipData);
            }
          }
        }

        if (clips.length === 0) {
          console.log("Notation: No MIDI clips with notes in selection.");
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
        for (const track of context.application.song.tracks) {
          const slot = track.clipSlots[sceneIndex];
          const clip = slot?.clip;
          if (clip && clip instanceof MidiClip) {
            const clipData = readMidiClip(clip);
            if (clipData.notes.length > 0) {
              clips.push(clipData);
            }
          }
        }

        if (clips.length === 0) {
          console.log("Notation: No MIDI clips with notes in scene.");
          return;
        }

        await showNotationDialog(clips);
      })(arg as Handle),
  );

  // Arrangement time selection (AJM-173 — stub)
  context.commands.registerCommand(
    "notation.showArrangementSelection",
    (arg: unknown) => {
      const selection = arg as ArrangementSelection;
      console.log("Notation: Arrangement selection not yet implemented.", {
        start: selection.time_selection_start,
        end: selection.time_selection_end,
        laneCount: selection.selected_lanes.length,
      });
    },
  );

  context.ui.registerContextMenuAction("MidiClip", "Generate for Clip", "notation.showClip");
  context.ui.registerContextMenuAction("ClipSlotSelection", "Generate for Selection", "notation.showSelection");
  context.ui.registerContextMenuAction("Scene", "Generate for Scene", "notation.showScene");
  context.ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Generate for Selection",
    "notation.showArrangementSelection",
  );
}
