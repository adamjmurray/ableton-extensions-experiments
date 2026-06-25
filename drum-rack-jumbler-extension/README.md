# Drum Rack Jumbler

Shuffle and tweak a track's Drum Rack in Ableton Live from the right-click menu.

Right-click a Drum Rack device, a MIDI track header, or a MIDI clip on a track that
contains a Drum Rack, then pick an action. The Drum Rack can sit directly on the track or
be nested inside an Instrument Rack (or another rack) — it's found at any depth.
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

Each action is registered on the Drum Rack device (`DrumRack`), the track header
(`MidiTrack`), and clips (`MidiClip`). The `DrumRack` scope hands the rack directly; for
the other two the handler walks up to the containing track and finds its Drum Rack.
