import { DrumChain, type MidiTrack, RackDevice, Simpler } from "@ableton/extensions-sdk";

export type DrumPad = {
  simpler: Simpler<"0.0.5">;
  path: string;
};

// Find the first top-level Drum Rack on `track` and collect its pads' sample
// paths. A "valid pad" is a DrumChain whose first top-level Simpler has a
// non-null sample with a filePath; pads without that (empty, Drum Sampler,
// nested racks, etc.) are skipped.
//
// Does NOT recurse into nested RackDevices. The alpha SDK mis-classifies
// Drum Rack chains once wrapped in an Instrument Rack (see
// notation-extension/src/drum-rack.ts for details), so recursing would
// return misleading results. Top-level only by design.
//
// Returns null if no RackDevice on the track contains any DrumChain.
export function findTopLevelDrumPads(track: MidiTrack<"0.0.5">): { pads: DrumPad[] } | null {
  for (const device of track.devices) {
    if (!(device instanceof RackDevice)) continue;
    const drumChains = device.chains.filter((c): c is DrumChain<"0.0.5"> => c instanceof DrumChain);
    if (drumChains.length === 0) continue;
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
  return null;
}
