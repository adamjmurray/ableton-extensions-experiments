# Drum Rack Jumbler

Shuffle and tweak a track's Drum Rack in Ableton Live from the right-click menu.

Right-click a MIDI track header or a MIDI clip on a track whose **top-level** device is a
Drum Rack, then pick an action. (A Drum Rack nested inside another rack is not detected.)
Each action runs in a single undo step.

## Context menu actions

- **Swap Drum Pads** — reassign each pad's note as a derangement (no pad keeps its own
  note), rearranging the kit without losing any pads. Needs at least two pads.
- **Randomize Panning** — set each pad's pan to a random position.
- **Center All Panning** — reset every pad's pan to center.
- **Pitch Shift Simplers (±1 / ±12 / ±24 semitones)** — randomly transpose each pad's
  Simpler within the chosen range.
- **Reset Simpler Pitch Shifts** — clear the Transpose/Detune offsets on every pad's
  Simpler.

Each action is registered on both the track header (`MidiTrack`) and clips (`MidiClip`);
the handler walks up from whatever you click to find the containing track.
