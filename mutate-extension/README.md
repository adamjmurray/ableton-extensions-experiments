# Mutate

Generate randomized variations of MIDI clips in Ableton Live.

Right-click MIDI clips, a scene, or a track and pick a Mutate action. A dialog opens
showing a set of variations generated from the source notes; adjust the controls and
apply the ones you want. Applied variations are written to new take lanes ("Mutate 1",
"Mutate 2", …) as clips named `<source name> var. N`, so the source clip is never
modified.

## Context menu actions

| Right-click on… | Action |
| --- | --- |
| Clip slot selection (Session) | Clip(s)… |
| Scene | Scene… |
| MIDI track | Track (Session) |
| MIDI track | Track (Arrangement) |
| Arrangement time selection | Clip(s)… |

Each opens the mutation dialog scoped to the selected clips.

## Quick actions

One-shot mutations that apply immediately without a dialog, available on clip selections
and arrangement time selections:

- **Randomize Velocity (±15)**
- **Swap Notes (25% chance per note)**
- **Delete Notes (10% chance per note)**

## Mutations

The dialog combines randomized transforms over the notes:

- **Velocity** — jitter velocity within a range
- **Timing** — shift note start times
- **Duration** — stretch or shrink note lengths
- **Probability** — randomize per-note probability
- **Drop / swap notes** — remove or exchange notes by chance

Variations are generated **independent** (each rolled fresh from the source) or
**cumulative** (each builds on the previous).
