import type { MidiClip, MidiTrack } from "@ableton-extensions/sdk";
import type { ClipBounds, Note } from "./transforms.js";

export type SessionSource = {
  kind: "session";
  track: MidiTrack<"1.0.0">;
  slotIndex: number;
  clip: MidiClip<"1.0.0">;
  duration: number;
  notes: Note[];
  bounds: ClipBounds;
};

export type SceneSourceClip = {
  trackIndex: number;
  track: MidiTrack<"1.0.0">;
  clip: MidiClip<"1.0.0">;
  notes: Note[];
  bounds: ClipBounds;
  duration: number;
};

export type SceneSource = {
  kind: "scene";
  sceneIndex: number;
  sources: SceneSourceClip[];
};

export type ArrangementSource = {
  kind: "arrangement";
  track: MidiTrack<"1.0.0">;
  clip: MidiClip<"1.0.0">;
  startTime: number;
  duration: number;
  notes: Note[];
  bounds: ClipBounds;
};

export type RangeSourceClip = {
  trackIndex: number;
  track: MidiTrack<"1.0.0">;
  clip: MidiClip<"1.0.0">;
  startTime: number;
  duration: number;
  notes: Note[];
  bounds: ClipBounds;
};

export type RangeSource = {
  kind: "range";
  timeStart: number;
  timeEnd: number;
  clips: RangeSourceClip[]; // flat, ordered by (trackIndex, startTime)
};

export type SessionMultiSourceClip = {
  track: MidiTrack<"1.0.0">;
  slotIndex: number;
  clip: MidiClip<"1.0.0">;
  notes: Note[];
  bounds: ClipBounds;
  duration: number;
};

export type SessionMultiSource = {
  kind: "sessionMulti";
  sources: SessionMultiSourceClip[];
};

export type ApplySource =
  | SessionSource
  | SceneSource
  | ArrangementSource
  | RangeSource
  | SessionMultiSource;

export type FillMode = "skip" | "overwrite";
