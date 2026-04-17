# Notation

Render MIDI clips in Ableton Live as sheet music notation.

Right-click a clip, clip slot, scene, track, or arrangement selection and pick a
"Render…" action. A modal dialog opens showing the notation, with a toolbar for
quantization, time signature, and export.

## Context menu actions

| Right-click on… | Action | What it does |
| --- | --- | --- |
| Clip slot selection (Session) | Render Clip(s) | Each selected clip on its own staff in a score. Right-clicking a single clip slot counts as a selection of one. |
| Scene | Render Scene | All MIDI clips in that scene row, one staff per track. |
| MIDI track | Render Track (Session) | All clip slots on the track flattened onto one staff; empty slots become bar rests. |
| MIDI track | Render Track (Arrangement) | All arrangement clips on the track flattened onto one staff, aligned to the bar grid; gaps become rest measures. |
| Arrangement time selection | Render Clip(s) | MIDI clips that overlap the selected range, each on its own staff. |
| Arrangement time selection | Render Range | The selected time range flattened onto one staff per track. |

Session View and Arrangement View are exposed as separate "Render Track" items
because the SDK does not currently report which view the user right-clicked
from.

## Toolbar

- **Quantization** — `16th`, `16th triplet`, `32nd`. Notes snap to the chosen
  grid before being notated.
- **Time signature** — defaults to the first scene's time signature (or 4/4 if
  unavailable). Adjustable in the dialog.
- **Legato** — extends note durations to fill the gap to the next note so
  phrases read as connected.
- **Tempo** — toggle a tempo marking at the top of the score.
- **Drum heads** — render clips on drum-rack tracks with x noteheads.
- **Sort** — `Pitch` (treble above bass, then high to low), `Track` (track
  order), `Native` (preserve selection order).
- **View** — toggle between rendered notation and the raw MusicXML source.
- **Export** — SVG, PNG, or MusicXML. Files are written to a temp directory and
  opened with the system default application.

## Installation

1. Enable Developer Mode in Live's Extensions settings.
2. Extract the extension zip into Live's extensions folder (or run
   `npm run dev -- extensions/notation` from the SDK repo root during
   development).
3. Restart Live. The "Render…" actions appear in the relevant right-click menus.

## Known limitations

- **Export flow** — the embedded webview (WKWebView / WebView2) does not
  support `download` attributes or `navigator.clipboard`. Exports go through
  the extension host: files land in a temp directory and open in your system's
  default viewer. Cmd+C inside the dialog does not copy the notation.
- **Time signature** — sourced from the first scene's signature. Mid-song
  signature changes are not followed; the displayed signature is a single value
  and is adjustable in the toolbar.
- **Drum racks must be top-level** — when a drum rack is wrapped inside an
  instrument rack, the SDK stops tagging its pad chains as drum chains, so
  classification falls back to a track/rack name heuristic matching "drums"
  or "kit" (case-insensitive).
- **Clip end** — the alpha SDK reports `clip.endMarker` at the absolute clip
  end rather than the playback end, so the renderer uses `clip.loopEnd` as the
  effective end regardless of whether the clip is looping.
- **One-way dialog** — the dialog is opened with the clip data and returns a
  single result on close. Changes made to clips in Live while the dialog is
  open are not reflected; close and re-open to refresh.

## Dependencies

Notation rendering is provided by [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/).
A few `npm audit` advisories surface against `tar`/`node-gyp`/`gl`, all pulled
in as optional transitive build dependencies of OSMD. They are not bundled into
the shipped extension.

## License

The extension is MIT-licensed — see [LICENSE](LICENSE). It bundles third-party
libraries (preact, opensheetmusicdisplay, and its transitive dependencies
vexflow, jszip, loglevel, typescript-collections); their notices are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
