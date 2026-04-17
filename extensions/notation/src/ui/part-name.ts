// Pure helpers for part-name display. Extracted so they can be unit-tested
// without importing app.tsx (which pulls in preact + OSMD).

import type { NotationData } from "./bridge.js";

// Compose the full part-name label shown on each staff and reused as the
// tooltip for truncated OSMD labels.
//
//   ([TrackName], ClipLabel) → "[TrackName] ClipLabel"
//   ([TrackName], "")        → "[TrackName]"
//   ("", ClipLabel)          → "ClipLabel"
//   ("", "")                 → "Part <index+1>"
//
// Whitespace-only track/label strings are treated as empty. `index` is a
// 0-based clip position; the "Part N" fallback is 1-based for display.
export function buildFullPartName(trackName: string, label: string, index: number): string {
  const t = (trackName ?? "").trim();
  const c = label.trim();
  if (t && c) return `[${t}] ${c}`;
  if (t) return `[${t}]`;
  if (c) return c;
  return `Part ${index + 1}`;
}

// Assign a stable 1-based index to each clip that will display the
// "(unnamed #N)" fallback label — i.e. clips with no clip name AND no track
// name. This matches the gating in notesToMusicXML so the numbering here and
// downstream stays consistent. Mutates the input in place so the tag rides on
// every derived view of the clip (quantized, sorted, etc.).
// AJM-189: keeps the label stable across sort-mode changes.
export function assignUnnamedIndices(data: NotationData): NotationData {
  let seq = 0;
  for (const c of data.clips) {
    const hasName = (c.clip.name ?? "").trim() !== "";
    const hasTrackName = (c.clip.trackName ?? "").trim() !== "";
    if (!hasName && !hasTrackName) c.clip.unnamedIndex = ++seq;
  }
  return data;
}
