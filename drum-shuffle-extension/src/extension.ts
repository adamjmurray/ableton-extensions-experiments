import { type ActivationContext, initialize } from "@ableton/extensions-sdk";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "0.0.5");

  console.log("Drum Shuffle activated!");

  context.commands.registerCommand("drumShuffle.shuffle", (_arg: unknown) => {
    console.log("Shuffle Drums triggered");
  });

  context.ui.registerContextMenuAction("MidiTrack", "Shuffle Drums", "drumShuffle.shuffle");
}
