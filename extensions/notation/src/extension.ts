import {
  initialize,
  MidiClip,
  Scene,
  type ActivationContext,
  type Handle,
} from "@ableton/extensions-sdk";

import notationInterface from "./notation.html";

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

        const dialog = context.createModalDialog();
        try {
          const html = notationInterface.replace(
            "</head>",
            `<script>window.__NOTATION_DATA__='${payload.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}';</script></head>`,
          );

          await dialog.show(
            `data:text/html,${encodeURIComponent(html)}`,
            900,
            650,
          );
        } catch (e) {
          console.error("Notation dialog error:", e);
        }
      })(arg as Handle),
  );

  context.ui.registerContextMenuAction("MidiClip", "Show Notation", "notation.show");
}
