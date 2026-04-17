// Drum-rack detection and track walking. These helpers lean on SDK class
// `instanceof` checks and can't be unit-tested without the TestHarness, so
// they live together in one SDK-coupled module.

import {
  DataModelObject,
  Device,
  DrumChain,
  MidiTrack,
  RackDevice,
} from "@ableton/extensions-sdk";
import { nameSuggestsDrums } from "./clip-utils.js";

// Walk up an object's parent chain until a MidiTrack is found. Returns the
// MidiTrack or null if the chain terminates first.
export function findMidiTrack(obj: DataModelObject<"0.0.5"> | null): MidiTrack<"0.0.5"> | null {
  let current: DataModelObject<"0.0.5"> | null = obj;
  while (current && !(current instanceof MidiTrack)) {
    current = current.parent as DataModelObject<"0.0.5"> | null;
  }
  return current;
}

// Structural check for a top-level Drum Rack on a track: walk the track's
// devices and look for a RackDevice whose chains are DrumChains. Works when
// Drum Rack sits directly on the track.
//
// Known alpha-SDK bug: once a Drum Rack is wrapped inside an Instrument Rack,
// the host no longer tags its pad chains as DrumChain (verified by probing
// `dataModelInstance.getObjectIsOfClass` directly — nothing returns a drum
// tag), and the nested Drum Rack's `.chains` returns empty. Recursing into
// nested racks doesn't help: Instrument Rack → Instrument Rack nesting also
// yields empty `.chains`, so a 0-chain fallback false-positives. Until the
// SDK classifies nested drum-rack chains correctly, we only auto-detect the
// top-level case here and fall back to name heuristics in the caller.
export function hasTopLevelDrumRack(devices: Device<"0.0.5">[]): boolean {
  for (const d of devices) {
    if (!(d instanceof RackDevice)) continue;
    for (const chain of d.chains) {
      if (chain instanceof DrumChain) return true;
    }
  }
  return false;
}

// Combined structural + name-heuristic drum-track classifier. Returns true
// when a track either contains a top-level Drum Rack, is named like a drum
// track, or holds a rack whose name suggests drums. See nameSuggestsDrums
// (clip-utils.ts) for the token list.
export function isDrumRackTrack(track: MidiTrack<"0.0.5"> | null): boolean {
  if (!track) return false;
  if (hasTopLevelDrumRack(track.devices)) return true;
  if (nameSuggestsDrums(String(track.name))) return true;
  const firstRack = track.devices.find((d): d is RackDevice<"0.0.5"> => d instanceof RackDevice);
  if (firstRack && nameSuggestsDrums(String(firstRack.name))) return true;
  return false;
}
