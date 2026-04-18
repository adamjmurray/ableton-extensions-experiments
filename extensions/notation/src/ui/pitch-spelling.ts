import type { NoteData } from "./bridge.js";

// Circle-of-fifths value for each major-key tonic, indexed by pitch class:
// C=0, G=1, D=2, A=3, E=4, B=5, F#=6, F=-1, Bb=-2, Eb=-3, Ab=-4, Db=-5.
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

export type Mode = "major" | "minor";

// offset: semitones from the scale's tonic up to its relative major tonic.
// Scales not listed (symmetric scales, exotic non-diatonic scales, unknown
// custom scales) fall through to <fifths>0</fifths> with per-note accidentals.
// biome-ignore format: hand-aligned columns are easier to scan than the auto-formatted version.
const SCALE_TABLE: Record<string, { offset: number; mode: Mode }> = {
  "major":             { offset: 0,  mode: "major" },
  "minor":             { offset: 3,  mode: "minor" },
  "dorian":            { offset: 10, mode: "minor" },
  "phrygian":          { offset: 8,  mode: "minor" },
  "lydian":            { offset: 7,  mode: "major" },
  "mixolydian":        { offset: 5,  mode: "major" },
  "locrian":           { offset: 1,  mode: "minor" },
  "harmonic minor":    { offset: 3,  mode: "minor" },
  "melodic minor":     { offset: 3,  mode: "minor" },
  "hungarian minor":   { offset: 3,  mode: "minor" },
  "harmonic major":    { offset: 0,  mode: "major" },
  "major pentatonic":  { offset: 0,  mode: "major" },
  "minor pentatonic":  { offset: 3,  mode: "minor" },
  "minor blues":       { offset: 3,  mode: "minor" },
  "lydian augmented":  { offset: 7,  mode: "major" },
  "lydian dominant":   { offset: 7,  mode: "major" },
  "super locrian":     { offset: 1,  mode: "minor" },
  "dorian #4":         { offset: 10, mode: "minor" },
  "phrygian dominant": { offset: 8,  mode: "major" },
};

export function getKeySignature(
  rootNote: number,
  scaleName: string,
): { fifths: number; mode: Mode } {
  const info = SCALE_TABLE[scaleName.trim().toLowerCase()];
  if (!info) return { fifths: 0, mode: "major" };
  const relativeMajorRoot = ((((rootNote % 12) + info.offset) % 12) + 12) % 12;
  return { fifths: MAJOR_FIFTHS[relativeMajorRoot]!, mode: info.mode };
}

export function midiToPitch(
  midi: number,
  fifths: number,
): { step: string; alter: number; octave: number } {
  const octave = Math.floor(midi / 12) - 1;
  const pc = midi % 12;
  const useFlats = fifths < 0;

  // biome-ignore format: 12-column pitch-class grid is more scannable than one-entry-per-line.
  const SHARP_MAP: [string, number][] = [
    ["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0],
    ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0],
  ];
  // biome-ignore format: 12-column pitch-class grid is more scannable than one-entry-per-line.
  const FLAT_MAP: [string, number][] = [
    ["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0],
    ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0],
  ];

  const [step, alter] = (useFlats ? FLAT_MAP[pc] : SHARP_MAP[pc])!;
  return { step, alter, octave };
}

// Empty note lists default to middle C so downstream clef detection picks
// treble. Callers filter empty clips upstream; this is only a safe fallback.
export function avgPitch(notes: NoteData[]): number {
  if (notes.length === 0) return 60;
  return notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length;
}

export function detectClef(notes: NoteData[]): { sign: string; line: number } {
  if (avgPitch(notes) < 60) return { sign: "F", line: 4 };
  return { sign: "G", line: 2 };
}
