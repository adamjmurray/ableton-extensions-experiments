import { initialize, type ActivationContext } from "@ableton/extensions-sdk";
import modalInterface from "./interface.html";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "0.0.5");

  console.log("my-extension activated!");

  context.commands.registerCommand("my-extension.showDialog", () => {
    const dialog = context.createModalDialog();

    dialog
      .show(`data:text/html,${encodeURIComponent(modalInterface)}`, 480, 200)
      .then((v) => {
        const result = JSON.parse(v);
        if (result.message) {
          console.log(`Dialog result: ${result.message}`);
        }
      });
  });

  for (const scope of ["AudioTrack", "MidiTrack", "AudioClip", "MidiClip", "ClipSlot", "Scene"]) {
    context.ui.registerContextMenuAction(
      scope,
      "Show My Dialog",
      "my-extension.showDialog",
    );
  }
}
