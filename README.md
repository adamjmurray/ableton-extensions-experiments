# Ableton Live Extensions

A collection of [Ableton Live](https://www.ableton.com/) extensions built with the
(beta) [Extensions SDK](https://ableton.github.io/extensions-sdk). Each extension is a
self-contained project in its own `*-extension/` directory. The SDK itself is not
included in this repo — Ableton's license forbids redistributing it, so you obtain it
from Ableton and place it in a gitignored `extensions-sdk/` directory (see
[DEVELOPERS.md](DEVELOPERS.md)).

Extensions are distributed as `.ablx` files — open one in Live (Settings → Extensions)
to install it. The SDK is currently in beta, so building and running these requires
Developer Mode and a recent Live beta build. See [DEVELOPERS.md](DEVELOPERS.md) for the
build/run/package workflow, or [AGENTS.md](AGENTS.md) for deeper SDK and architecture
notes.

## Notation

Render MIDI clips as sheet music notation. Right-click a clip, clip slot, scene, track,
or arrangement selection and choose a "Render…" action; a dialog shows the engraved
score with controls for quantization, time signature, and legato, and saves to PNG, SVG,
or MusicXML. Multi-clip selections render each clip on its own staff.

→ [notation-extension/README.md](notation-extension/README.md)

## Mutate

Generate randomized variations of MIDI clips. Right-click clips, a scene, a track, or an
arrangement range to open a dialog that generates a set of mutations (velocity, timing,
duration, probability, note drops/swaps) and writes the ones you apply to new take lanes,
leaving the originals untouched. Also includes quick one-shot actions (Randomize
Velocity, Swap Notes, Delete Notes).

→ [mutate-extension/README.md](mutate-extension/README.md)

## Drum Rack Jumbler

Shuffle and tweak a track's top-level Drum Rack from the right-click menu: swap pad
mappings (a derangement, so no pad keeps its own note), randomize or center pad panning,
pitch-shift the pads' Simplers (±1 / ±12 / ±24 semitones), and reset pitch shifts.

→ [drum-rack-jumbler-extension/README.md](drum-rack-jumbler-extension/README.md)
