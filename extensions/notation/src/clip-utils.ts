// Pure, SDK-free helpers used by extension.ts. Kept in a separate module so
// they can be unit-tested without pulling in extension.ts (which imports the
// virtual `notation.html` module resolved only at build time by esbuild).

import type { MidiClip } from "@ableton/extensions-sdk";

export interface ClipInfo {
  notes: { pitch: number; startTime: number; duration: number; velocity: number }[];
  clip: {
    name: string;
    trackName: string;
    trackIndex?: number;
    startMarker: number;
    endMarker: number;
    looping: boolean;
    loopStart: number;
    loopEnd: number;
    arrangementStartTime?: number;
  };
  isDrumRack?: boolean;
}

const DRUM_NAME_TOKENS = ["drums", "kit"];

export function nameSuggestsDrums(name: string): boolean {
  const lower = name.toLowerCase();
  return DRUM_NAME_TOKENS.some((t) => lower.includes(t));
}

export function beatsPerMeasure(ts: { numerator: number; denominator: number }): number {
  return ts.numerator * (4 / ts.denominator);
}

// Shift and filter a clip's notes into the flattened-track timeline.
// Notes outside [filterStart, renderEnd] are dropped; the rest are
// translated by `shift` so that clip-local time t becomes t + shift.
export function shiftClipNotes(
  info: ClipInfo,
  filterStart: number,
  renderEnd: number,
  shift: number,
): ClipInfo["notes"] {
  return info.notes
    .filter((n) => n.startTime >= filterStart && n.startTime < renderEnd)
    .map((n) => ({ ...n, startTime: n.startTime + shift }));
}

// Synthetic single-clip envelope used by "Render Track" handlers. Empty
// `name` triggers a bare `[TrackName]` part name via buildPartName
// (musicxml.ts); startMarker=0/loopEnd=totalLength makes the standalone
// renderer cover the whole flattened timeline.
export function buildFlattenedClipInfo(
  trackName: string,
  isDrumRack: boolean,
  notes: ClipInfo["notes"],
  totalLength: number,
): ClipInfo {
  const info: ClipInfo = {
    notes,
    clip: {
      name: "",
      trackName,
      startMarker: 0,
      endMarker: totalLength,
      looping: false,
      loopStart: 0,
      loopEnd: totalLength,
    },
  };
  if (isDrumRack) info.isDrumRack = true;
  return info;
}

// Synthetic single-clip envelope for "Render Range". Like
// buildFlattenedClipInfo but with startMarker=leadingOffset so a sub-bar
// range start becomes leading rest inside bar 1. Notes passed in are
// already shifted to anchor-local time (anchor = bar boundary at or
// before time_selection_start).
export function buildRangeClipInfo(
  trackName: string,
  trackIndex: number | undefined,
  isDrumRack: boolean,
  notes: ClipInfo["notes"],
  leadingOffset: number,
  renderLength: number,
): ClipInfo {
  const info: ClipInfo = {
    notes,
    clip: {
      name: "",
      trackName,
      startMarker: leadingOffset,
      endMarker: renderLength,
      looping: false,
      loopStart: 0,
      loopEnd: renderLength,
      ...(trackIndex !== undefined ? { trackIndex } : {}),
    },
  };
  if (isDrumRack) info.isDrumRack = true;
  return info;
}

export function readMidiClip(
  clip: MidiClip<any>,
  trackName: string,
  isDrumRack: boolean,
  arrangementStartTime?: number,
  trackIndex?: number,
): ClipInfo {
  const info: ClipInfo = {
    notes: clip.notes.map((n) => ({
      pitch: Number(n.pitch),
      startTime: Number(n.startTime),
      duration: Number(n.duration),
      velocity: Number(n.velocity ?? 64),
    })),
    clip: {
      name: String(clip.name),
      trackName,
      startMarker: Number(clip.startMarker),
      endMarker: Number(clip.endMarker),
      looping: Boolean(clip.looping),
      loopStart: Number(clip.loopStart),
      loopEnd: Number(clip.loopEnd),
      ...(arrangementStartTime !== undefined ? { arrangementStartTime } : {}),
      ...(trackIndex !== undefined ? { trackIndex } : {}),
    },
  };
  if (isDrumRack) info.isDrumRack = true;
  return info;
}
