import {
  initialize,
  MidiClip,
  type ActivationContext,
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

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "0.0.5");

  console.log("Notation activated!");

  context.commands.registerCommand(
    "notation.show",
    (arg: unknown) =>
      void (async (handle: Handle) => {
        const clip = context.objects.getObjectFromHandle(handle, MidiClip);
        const notes = clip.notes;

        if (notes.length === 0) {
          console.log("Notation: No notes in clip.");
          return;
        }

        // Gather song metadata (coerce to primitives — SDK may return BigInt)
        const song = context.application.song;
        const tempo = Number(song.tempo);
        const rootNote = Number(song.rootNote);
        const scaleName = String(song.scaleName);

        // Try to get time signature from first scene, default to 4/4
        let numerator = 4;
        let denominator = 4;
        try {
          const scenes = song.scenes;
          if (scenes.length > 0) {
            const scene = scenes[0];
            numerator = Number(scene.signatureNumerator);
            denominator = Number(scene.signatureDenominator);
          }
        } catch (e) {
          console.log("Notation: Could not read scene time signature, defaulting to 4/4");
        }

        const clipInfo = {
          start: Number(clip.loopStart),
          end: Number(clip.loopEnd),
          name: String(clip.name),
        };

        const payload = JSON.stringify({
          notes: notes.map((n) => ({
            pitch: Number(n.pitch),
            startTime: Number(n.startTime),
            duration: Number(n.duration),
            velocity: Number(n.velocity ?? 64),
          })),
          clip: clipInfo,
          tempo,
          rootNote,
          scaleName,
          timeSignature: { numerator, denominator },
        });

        // Build the dialog HTML once — reused across the export loop
        const html = notationInterface.replace(
          "</head>",
          `<script>window.__NOTATION_DATA__='${payload.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}';</script></head>`,
        );
        const dataUrl = `data:text/html,${encodeURIComponent(html)}`;

        // Determine export directory
        const exportDir = path.join(
          context.environment.tempDirectory || os.tmpdir(),
          "notation-exports",
        );
        fs.mkdirSync(exportDir, { recursive: true });

        // Dialog loop: show dialog, handle exports, re-show until user closes
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
              // Loop continues — dialog will re-open
            }
          } catch (e) {
            console.error("Notation dialog error:", e);
            break;
          }
        }
      })(arg as Handle),
  );

  context.ui.registerContextMenuAction("MidiClip", "Show Notation", "notation.show");
}
