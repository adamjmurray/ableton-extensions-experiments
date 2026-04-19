import {
  type ActivationContext,
  type Handle,
  initialize,
  MidiTrack,
} from "@ableton/extensions-sdk";
import { derange } from "./derange.js";
import { mulberry32 } from "./rng.js";
import { findTopLevelDrumPads } from "./walker.js";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "0.0.5");

  console.log("Drum Shuffle activated!");

  context.commands.registerCommand("drumShuffle.shuffle", async (arg: unknown) => {
    const track = context.objects.getObjectFromHandle(arg as Handle, MidiTrack);
    const result = findTopLevelDrumPads(track);
    if (!result) {
      console.log("Swap Simplers in Drum Rack: no top-level drum rack on this track");
      return;
    }
    if (result.pads.length < 2) {
      console.log("Swap Simplers in Drum Rack: need at least 2 pads with samples to swap");
      return;
    }
    const rng = mulberry32(Date.now() >>> 0);
    const shuffledPaths = derange(
      result.pads.map((p) => p.path),
      rng,
    );
    await context.withinTransaction(async () => {
      await Promise.all(result.pads.map((pad, i) => pad.simpler.replaceSample(shuffledPaths[i]!)));
    });
  });

  context.ui.registerContextMenuAction("MidiTrack", "Swap Simplers in Drum Rack", "drumShuffle.shuffle");
}
