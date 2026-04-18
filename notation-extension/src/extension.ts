import { type ActivationContext, initialize } from "@ableton/extensions-sdk";
import type { ClipInfo } from "./clip-utils.js";
import {
  type HandlerDeps,
  handleShowArrangementRange,
  handleShowArrangementSelection,
  handleShowScene,
  handleShowSelection,
  handleShowTrackArrangement,
  handleShowTrackSession,
} from "./command-handlers.js";
import { showNotationDialog as runNotationDialog } from "./dialog.js";

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
      console.log("Notation: Could not read scene time signature, defaulting to 4/4:", e);
    }

    return { tempo, rootNote, scaleName, timeSignature: { numerator, denominator } };
  }

  function showNotationDialog(clips: ClipInfo[], emptyStateMessage?: string) {
    return runNotationDialog({ context, getMetadata: getSongMetadata }, clips, emptyStateMessage);
  }

  const deps: HandlerDeps = { context, getSongMetadata, showNotationDialog };

  context.commands.registerCommand(
    "notation.showSelection",
    (arg: unknown) =>
      void handleShowSelection(arg as Parameters<typeof handleShowSelection>[0], deps),
  );
  context.commands.registerCommand(
    "notation.showScene",
    (arg: unknown) => void handleShowScene(arg as Parameters<typeof handleShowScene>[0], deps),
  );
  context.commands.registerCommand(
    "notation.showArrangementSelection",
    (arg: unknown) =>
      void handleShowArrangementSelection(
        arg as Parameters<typeof handleShowArrangementSelection>[0],
        deps,
      ),
  );
  context.commands.registerCommand(
    "notation.showArrangementRange",
    (arg: unknown) =>
      void handleShowArrangementRange(
        arg as Parameters<typeof handleShowArrangementRange>[0],
        deps,
      ),
  );
  context.commands.registerCommand(
    "notation.showTrackSession",
    (arg: unknown) =>
      void handleShowTrackSession(arg as Parameters<typeof handleShowTrackSession>[0], deps),
  );
  context.commands.registerCommand(
    "notation.showTrackArrangement",
    (arg: unknown) =>
      void handleShowTrackArrangement(
        arg as Parameters<typeof handleShowTrackArrangement>[0],
        deps,
      ),
  );

  context.ui.registerContextMenuAction(
    "ClipSlotSelection",
    "Render Clip(s)",
    "notation.showSelection",
  );
  context.ui.registerContextMenuAction("Scene", "Render Scene", "notation.showScene");
  context.ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Render Clip(s)",
    "notation.showArrangementSelection",
  );
  context.ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Render Range",
    "notation.showArrangementRange",
  );
  context.ui.registerContextMenuAction(
    "MidiTrack",
    "Render Track (Session)",
    "notation.showTrackSession",
  );
  context.ui.registerContextMenuAction(
    "MidiTrack",
    "Render Track (Arrangement)",
    "notation.showTrackArrangement",
  );
}
