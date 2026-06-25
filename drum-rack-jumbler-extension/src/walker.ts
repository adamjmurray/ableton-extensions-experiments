import {
  type Device,
  DrumChain,
  DrumRack,
  type MidiTrack,
  RackDevice,
  Simpler,
} from "@ableton-extensions/sdk";

export type DrumPad = {
  simpler: Simpler<"1.0.0">;
  path: string;
};

// First Drum Rack anywhere in a device tree, whether it sits directly on the
// track or is nested inside an Instrument Rack (or another Drum Rack). The
// beta SDK classifies nested drum racks correctly — `instanceof DrumRack`
// holds and `chains` is populated even when wrapped — so we recurse into every
// rack's chains. (The alpha mis-classified nested racks, which forced an
// earlier top-level-only workaround; verified fixed under 1.0.0-beta.0.)
function findDrumRack(devices: Device<"1.0.0">[]): DrumRack<"1.0.0"> | null {
  for (const device of devices) {
    if (device instanceof DrumRack) return device;
    if (device instanceof RackDevice) {
      for (const chain of device.chains) {
        const found = findDrumRack(chain.devices);
        if (found) return found;
      }
    }
  }
  return null;
}

// All DrumChains of the first Drum Rack on `track` (top-level or nested). Pads
// of any kind — empty, Simpler, Drum Sampler, nested rack — are included. Used
// by commands that operate on the DrumChain itself (e.g. receivingNote
// remapping).
export function findDrumChains(track: MidiTrack<"1.0.0">): DrumChain<"1.0.0">[] | null {
  const drumRack = findDrumRack(track.devices);
  if (!drumRack) return null;
  return drumRack.chains.filter((c): c is DrumChain<"1.0.0"> => c instanceof DrumChain);
}

// Simpler pads with loaded samples. Used by commands that need to mutate
// Simpler parameters (pitch shift, panning). Pads that aren't Simplers, or
// Simplers without a sample, are skipped.
export function findDrumPads(track: MidiTrack<"1.0.0">): { pads: DrumPad[] } | null {
  const drumChains = findDrumChains(track);
  if (!drumChains) return null;
  const pads: DrumPad[] = [];
  for (const chain of drumChains) {
    const simpler = chain.devices.find((d): d is Simpler<"1.0.0"> => d instanceof Simpler);
    if (!simpler) continue;
    const path = simpler.sample?.filePath;
    if (!path) continue;
    pads.push({ simpler, path: String(path) });
  }
  return { pads };
}
