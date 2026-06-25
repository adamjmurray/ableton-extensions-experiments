// Drum-rack detection and track walking. These helpers lean on SDK class
// `instanceof` checks and can't be unit-tested without the TestHarness, so
// they live together in one SDK-coupled module.

import {
  type DataModelObject,
  type Device,
  DrumRack,
  MidiTrack,
  RackDevice,
} from "@ableton-extensions/sdk";

// Walk up an object's parent chain until a MidiTrack is found. Returns the
// MidiTrack or null if the chain terminates first.
export function findMidiTrack(obj: DataModelObject<"1.0.0"> | null): MidiTrack<"1.0.0"> | null {
  let current: DataModelObject<"1.0.0"> | null = obj;
  while (current && !(current instanceof MidiTrack)) {
    current = current.parent as DataModelObject<"1.0.0"> | null;
  }
  return current as MidiTrack<"1.0.0"> | null;
}

// Structural check for a Drum Rack anywhere in a device tree, whether it sits
// directly on the track or is nested inside an Instrument Rack (or another
// rack). The beta SDK classifies nested drum racks correctly — `instanceof
// DrumRack` holds even when wrapped — so we recurse into every rack's chains.
// (The alpha mis-classified nested racks, which forced an earlier
// top-level-only check plus a track/rack-name heuristic; verified fixed under
// 1.0.0-beta.0, so the heuristic is gone.)
export function hasDrumRack(devices: Device<"1.0.0">[]): boolean {
  for (const d of devices) {
    if (d instanceof DrumRack) return true;
    if (d instanceof RackDevice) {
      for (const chain of d.chains) {
        if (hasDrumRack(chain.devices)) return true;
      }
    }
  }
  return false;
}

// Drum-track classifier: true when the track contains a Drum Rack at any depth.
export function isDrumRackTrack(track: MidiTrack<"1.0.0"> | null): boolean {
  return track ? hasDrumRack(track.devices) : false;
}
