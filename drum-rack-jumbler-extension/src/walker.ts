import { DrumChain, type MidiTrack, RackDevice, Simpler } from "@ableton/extensions-sdk";

export type DrumPad = {
  simpler: Simpler<"0.0.5">;
  path: string;
};

// All DrumChains of the first top-level Drum Rack on `track`. Pads of any
// kind — empty, Simpler, Drum Sampler, nested rack — are included. Used by
// commands that operate on the DrumChain itself (e.g. receivingNote
// remapping).
//
// Does NOT recurse into nested RackDevices. The alpha SDK mis-classifies
// Drum Rack chains once wrapped in an Instrument Rack (see
// notation-extension/src/drum-rack.ts for details), so recursing would
// return misleading results. Top-level only by design.
export function findTopLevelDrumChains(track: MidiTrack<"0.0.5">): DrumChain<"0.0.5">[] | null {
  for (const device of track.devices) {
    if (!(device instanceof RackDevice)) continue;
    const drumChains = device.chains.filter((c): c is DrumChain<"0.0.5"> => c instanceof DrumChain);
    if (drumChains.length === 0) continue;
    return drumChains;
  }
  return null;
}

// Simpler pads with loaded samples. Used by commands that need to mutate
// Simpler parameters (pitch shift, panning). Pads that aren't Simplers, or
// Simplers without a sample, are skipped.
export function findTopLevelDrumPads(track: MidiTrack<"0.0.5">): { pads: DrumPad[] } | null {
  const drumChains = findTopLevelDrumChains(track);
  if (!drumChains) return null;
  const pads: DrumPad[] = [];
  for (const chain of drumChains) {
    const simpler = chain.devices.find((d): d is Simpler<"0.0.5"> => d instanceof Simpler);
    if (!simpler) continue;
    const path = simpler.sample?.filePath;
    if (!path) continue;
    pads.push({ simpler, path: String(path) });
  }
  return { pads };
}
