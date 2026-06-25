import { type Device, DrumChain, DrumRack, RackDevice, Simpler } from "@ableton-extensions/sdk";

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
export function findDrumRack(devices: Device<"1.0.0">[]): DrumRack<"1.0.0"> | null {
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

// All DrumChains of a Drum Rack. Pads of any kind — empty, Simpler, Drum
// Sampler, nested rack — are included. Used by commands that operate on the
// DrumChain itself (e.g. receivingNote remapping).
export function drumChains(rack: DrumRack<"1.0.0">): DrumChain<"1.0.0">[] {
  return rack.chains.filter((c): c is DrumChain<"1.0.0"> => c instanceof DrumChain);
}

// Simpler pads with loaded samples. Used by commands that need to mutate
// Simpler parameters (pitch shift, panning). Pads that aren't Simplers, or
// Simplers without a sample, are skipped.
export function drumPads(rack: DrumRack<"1.0.0">): DrumPad[] {
  const pads: DrumPad[] = [];
  for (const chain of drumChains(rack)) {
    const simpler = chain.devices.find((d): d is Simpler<"1.0.0"> => d instanceof Simpler);
    if (!simpler) continue;
    const path = simpler.sample?.filePath;
    if (!path) continue;
    pads.push({ simpler, path: String(path) });
  }
  return pads;
}
