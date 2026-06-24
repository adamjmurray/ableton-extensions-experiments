import type { NoteDescription } from "@ableton-extensions/sdk";
import type { ClipBounds, Note } from "./transforms.js";

// Minimal shape for the subset of MidiClip fields clipBoundsFor reads —
// lets tests pass plain objects without mocking the whole SDK class.
export type ClipBoundsInput = {
  looping: unknown;
  loopStart: unknown;
  loopEnd: unknown;
  startMarker: unknown;
};

// Same "looping ⇒ min(loopStart, startMarker)" rule the notation extension
// uses (see CLAUDE.md), because the alpha SDK reports endMarker at the
// absolute clip end rather than the playback end, so loopEnd is the
// effective end regardless of whether the clip is looping.
export function clipBoundsFor(clip: ClipBoundsInput): ClipBounds {
  const looping = Boolean(clip.looping);
  const loopStart = Number(clip.loopStart);
  const loopEnd = Number(clip.loopEnd);
  const startMarker = Number(clip.startMarker);
  return {
    start: looping ? Math.min(loopStart, startMarker) : startMarker,
    end: loopEnd,
  };
}

// SDK properties may return BigInt; coerce to Number/skip-when-absent so
// downstream code can treat every note field as a plain number.
export function coerceNote(n: NoteDescription): Note {
  const out: Note = {
    pitch: Number(n.pitch),
    startTime: Number(n.startTime),
    duration: Number(n.duration),
  };
  if (n.velocity !== undefined) out.velocity = Number(n.velocity);
  if (n.probability !== undefined) out.probability = Number(n.probability);
  return out;
}

// Half-open overlap: a clip at [clipStart, clipEnd) overlaps a selection
// at [rangeStart, rangeEnd) iff clipStart < rangeEnd && clipEnd > rangeStart.
// Exposed so it can be unit-tested independently of the SDK-dependent
// collectMidiClipsFromArg caller.
export function clipOverlapsRange(
  clipStart: number,
  clipEnd: number,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  return clipStart < rangeEnd && clipEnd > rangeStart;
}
