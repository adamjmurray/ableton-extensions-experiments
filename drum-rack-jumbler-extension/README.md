# Drum Rack Jumbler

Shuffle and tweak a track's Drum Rack in Ableton Live from the right-click menu.

Right-click a Drum Rack device, then pick an action. The Drum Rack can sit directly on a
track or be nested inside an Instrument Rack (or another rack) — the menu appears wherever
the Drum Rack lives. Each action runs in a single undo step.

## Context menu actions

- **Swap Drum Pads** — reassign each pad's note as a derangement (no pad keeps its own
  note), rearranging the kit without losing any pads. Needs at least two pads.
- **Randomize Panning** — set each pad's pan to a random position.
- **Center All Panning** — reset every pad's pan to center.
- **Pitch Shift Simplers (±1 / ±12 / ±24 semitones)** — randomly transpose each pad's
  Simpler within the chosen range.
- **Reset Simpler Pitch Shifts** — clear the Transpose/Detune offsets on every pad's
  Simpler.

Each action is registered only on the Drum Rack device (`DrumRack`) scope, which hands the
rack to the handler directly — so the menu items appear only on Drum Racks, never on
non-drum tracks.
