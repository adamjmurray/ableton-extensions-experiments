import type { MidiClip, MidiTrack } from "@ableton/extensions-sdk";
import type { ClipBounds, Note } from "./transforms.js";

export type SessionSource = {
  kind: "session";
  track: MidiTrack<"0.0.5">;
  slotIndex: number;
  clip: MidiClip<"0.0.5">;
  duration: number;
  notes: Note[];
  bounds: ClipBounds;
};

export type SceneSourceClip = {
  trackIndex: number;
  track: MidiTrack<"0.0.5">;
  clip: MidiClip<"0.0.5">;
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
  track: MidiTrack<"0.0.5">;
  clip: MidiClip<"0.0.5">;
  startTime: number;
  duration: number;
  notes: Note[];
  bounds: ClipBounds;
};

export type RangeSourceClip = {
  trackIndex: number;
  track: MidiTrack<"0.0.5">;
  clip: MidiClip<"0.0.5">;
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
  track: MidiTrack<"0.0.5">;
  slotIndex: number;
  clip: MidiClip<"0.0.5">;
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
