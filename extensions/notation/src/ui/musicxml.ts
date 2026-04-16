import type { NoteData } from "./bridge.js";

// MusicXML divisions per quarter note.
// LCM(8, 6) = 24 supports 32nd notes (3 divisions) and triplet 16ths (4 divisions).
const DIVISIONS = 24;

// Map MIDI root note (0=C) to MusicXML fifths value for major keys
const ROOT_TO_FIFTHS_MAJOR: Record<number, number> = {
  0: 0,   // C
  1: -5,  // Db
  2: 2,   // D
  3: 3,   // Eb
  4: 4,   // E
  5: -1,  // F
  6: 6,   // F#/Gb
  7: 1,   // G
  8: -4,  // Ab
  9: 3,   // A (3 sharps)... wait
};

// Actually let's be more precise. rootNote 0=C, and we need the fifths circle offset.
// For major: C=0, G=1, D=2, A=3, E=4, B=5, F#=6, Gb=-6, Db=-5, Ab=-4, Eb=-3, Bb=-2, F=-1
// For minor: same fifths but mode="minor"
function getFifths(rootNote: number, scaleName: string): number {
  // rootNote: 0=C, 1=C#/Db, 2=D, ..., 11=B
  const majorFifths = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
  const minorFifths = [-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2];

  const isMinor = scaleName.toLowerCase().includes("minor");
  return isMinor ? minorFifths[rootNote % 12] : majorFifths[rootNote % 12];
}

// Convert MIDI pitch to MusicXML pitch components
function midiToPitch(midi: number, fifths: number): { step: string; alter: number; octave: number } {
  const octave = Math.floor(midi / 12) - 1;
  const pc = midi % 12;

  // Choose sharps or flats based on key signature
  const useFlats = fifths < 0;

  // pitch class to step+alter mapping
  const SHARP_MAP: [string, number][] = [
    ["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0],
    ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0],
  ];
  const FLAT_MAP: [string, number][] = [
    ["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0],
    ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0],
  ];

  const [step, alter] = useFlats ? FLAT_MAP[pc] : SHARP_MAP[pc];
  return { step, alter, octave };
}

// Determine the best clef based on the average pitch of the notes
function detectClef(notes: NoteData[]): { sign: string; line: number } {
  if (notes.length === 0) return { sign: "G", line: 2 }; // treble

  const avgPitch = notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length;

  if (avgPitch < 48) return { sign: "F", line: 4 };       // bass clef
  if (avgPitch < 60) return { sign: "F", line: 4 };       // bass clef for middle range
  return { sign: "G", line: 2 };                           // treble clef
}

// Break a duration (in divisions) into tied note components using valid MusicXML durations.
// Returns an array of { divisions, type, dots } objects.
interface DurationComponent {
  divisions: number;
  type: string;
  dots: number;
}

function decomposeDuration(totalDivisions: number): DurationComponent[] {
  // Valid base durations in divisions (from largest to smallest)
  const BASES: { divisions: number; type: string }[] = [
    { divisions: 96, type: "whole" },
    { divisions: 72, type: "half" },     // dotted half
    { divisions: 48, type: "half" },
    { divisions: 36, type: "quarter" },  // dotted quarter
    { divisions: 24, type: "quarter" },
    { divisions: 18, type: "eighth" },   // dotted eighth
    { divisions: 12, type: "eighth" },
    { divisions: 9, type: "16th" },      // dotted 16th
    { divisions: 6, type: "16th" },
    { divisions: 3, type: "32nd" },
  ];

  const result: DurationComponent[] = [];
  let remaining = Math.round(totalDivisions);

  while (remaining > 0) {
    let found = false;
    for (const base of BASES) {
      // Check dotted version first
      const dotted = base.divisions * 3 / 2;
      if (Math.round(dotted) <= remaining && base.divisions !== 72 && base.divisions !== 36 && base.divisions !== 18 && base.divisions !== 9) {
        // Only dot if it's not already a "dotted" entry
        result.push({ divisions: Math.round(dotted), type: base.type, dots: 1 });
        remaining -= Math.round(dotted);
        found = true;
        break;
      }
      if (base.divisions <= remaining) {
        // Check if this is one of our "dotted" entries
        const dots = (base.divisions === 72 || base.divisions === 36 || base.divisions === 18 || base.divisions === 9) ? 1 : 0;
        const actualType = base.divisions === 72 ? "half" : base.divisions === 36 ? "quarter" : base.divisions === 18 ? "eighth" : base.divisions === 9 ? "16th" : base.type;
        result.push({ divisions: base.divisions, type: actualType, dots });
        remaining -= base.divisions;
        found = true;
        break;
      }
    }
    if (!found) {
      // Fallback: use smallest unit
      result.push({ divisions: remaining, type: "32nd", dots: 0 });
      break;
    }
  }

  return result;
}

interface MeasureEvent {
  type: "note" | "rest";
  pitch?: number;
  startDiv: number;  // division offset within measure
  durationDiv: number;
  velocity?: number;
  tiedFrom?: boolean;  // this note is tied from previous
  tiedTo?: boolean;    // this note ties to next
}

export function notesToMusicXML(
  notes: NoteData[],
  timeSignature: { numerator: number; denominator: number },
  rootNote: number,
  scaleName: string,
  clipStart: number,
  clipEnd: number,
): string {
  const fifths = getFifths(rootNote, scaleName);
  const mode = scaleName.toLowerCase().includes("minor") ? "minor" : "major";
  const clef = detectClef(notes);

  // Measure length in beats
  const beatsPerMeasure = timeSignature.numerator * (4 / timeSignature.denominator);
  const measureDivisions = beatsPerMeasure * DIVISIONS;

  // Figure out how many measures we need
  const clipLength = clipEnd - clipStart;
  const numMeasures = Math.max(1, Math.ceil(clipLength / beatsPerMeasure));

  // Convert notes to absolute division positions (relative to clipStart)
  const absNotes = notes
    .map((n) => ({
      pitch: n.pitch,
      startDiv: Math.round((n.startTime - clipStart) * DIVISIONS),
      durationDiv: Math.max(1, Math.round(n.duration * DIVISIONS)),
      velocity: n.velocity,
    }))
    .filter((n) => n.startDiv >= 0 && n.startDiv < numMeasures * measureDivisions)
    .sort((a, b) => a.startDiv - b.startDiv || a.pitch - b.pitch);

  // Build measures — for now we handle monophonic or chord input
  // Group simultaneous notes (chords)
  const measures: string[] = [];

  for (let m = 0; m < numMeasures; m++) {
    const mStart = m * measureDivisions;
    const mEnd = mStart + measureDivisions;

    // Collect all note events that start or continue in this measure
    const events: MeasureEvent[] = [];

    for (const n of absNotes) {
      const noteEnd = n.startDiv + n.durationDiv;

      // Does this note overlap with this measure?
      if (n.startDiv < mEnd && noteEnd > mStart) {
        const effectiveStart = Math.max(n.startDiv, mStart);
        const effectiveEnd = Math.min(noteEnd, mEnd);

        events.push({
          type: "note",
          pitch: n.pitch,
          startDiv: effectiveStart - mStart,
          durationDiv: effectiveEnd - effectiveStart,
          velocity: n.velocity,
          tiedFrom: n.startDiv < mStart,
          tiedTo: noteEnd > mEnd,
        });
      }
    }

    // Sort by start position, then pitch (low to high for chord ordering)
    events.sort((a, b) => a.startDiv - b.startDiv || (a.pitch ?? 0) - (b.pitch ?? 0));

    // Fill gaps with rests and produce XML
    let xml = `    <measure number="${m + 1}">\n`;

    if (m === 0) {
      xml += `      <attributes>\n`;
      xml += `        <divisions>${DIVISIONS}</divisions>\n`;
      xml += `        <key>\n`;
      xml += `          <fifths>${fifths}</fifths>\n`;
      xml += `          <mode>${mode}</mode>\n`;
      xml += `        </key>\n`;
      xml += `        <time>\n`;
      xml += `          <beats>${timeSignature.numerator}</beats>\n`;
      xml += `          <beat-type>${timeSignature.denominator}</beat-type>\n`;
      xml += `        </time>\n`;
      xml += `        <clef>\n`;
      xml += `          <sign>${clef.sign}</sign>\n`;
      xml += `          <line>${clef.line}</line>\n`;
      xml += `        </clef>\n`;
      xml += `      </attributes>\n`;
    }

    // Group events by start position to handle chords
    let cursor = 0;

    // Get unique start positions
    const startPositions = [...new Set(events.map((e) => e.startDiv))].sort((a, b) => a - b);

    for (const pos of startPositions) {
      // Insert rest if there's a gap
      if (pos > cursor) {
        xml += renderRest(pos - cursor);
      }

      const chord = events.filter((e) => e.startDiv === pos);
      // Use the shortest duration in the chord group for forward movement
      const minDur = Math.min(...chord.map((e) => e.durationDiv));

      for (let i = 0; i < chord.length; i++) {
        const ev = chord[i];
        const components = decomposeDuration(ev.durationDiv);

        for (let c = 0; c < components.length; c++) {
          const comp = components[c];
          const isChordMember = i > 0 && c === 0;
          const tieStart = ev.tiedTo && c === components.length - 1;
          const tieStop = ev.tiedFrom && c === 0;
          const tieMiddle = c > 0 || (c < components.length - 1 && components.length > 1);

          xml += renderNote(
            ev.pitch!,
            comp,
            fifths,
            isChordMember,
            tieStop || (c > 0),
            tieStart || (c < components.length - 1),
          );
        }
      }

      cursor = pos + minDur;
    }

    // Fill remaining measure with rest
    if (cursor < measureDivisions) {
      xml += renderRest(measureDivisions - cursor);
    }

    xml += `    </measure>\n`;
    measures.push(xml);
  }

  return buildScore(measures);
}

function renderNote(
  pitch: number,
  comp: DurationComponent,
  fifths: number,
  isChord: boolean,
  tieStop: boolean,
  tieStart: boolean,
): string {
  const p = midiToPitch(pitch, fifths);
  let xml = `      <note>\n`;

  if (isChord) {
    xml += `        <chord/>\n`;
  }

  xml += `        <pitch>\n`;
  xml += `          <step>${p.step}</step>\n`;
  if (p.alter !== 0) {
    xml += `          <alter>${p.alter}</alter>\n`;
  }
  xml += `          <octave>${p.octave}</octave>\n`;
  xml += `        </pitch>\n`;
  xml += `        <duration>${comp.divisions}</duration>\n`;

  if (tieStart || tieStop) {
    if (tieStop) xml += `        <tie type="stop"/>\n`;
    if (tieStart) xml += `        <tie type="start"/>\n`;
  }

  xml += `        <type>${comp.type}</type>\n`;
  for (let d = 0; d < comp.dots; d++) {
    xml += `        <dot/>\n`;
  }

  if (tieStart || tieStop) {
    xml += `        <notations>\n`;
    if (tieStop) xml += `          <tied type="stop"/>\n`;
    if (tieStart) xml += `          <tied type="start"/>\n`;
    xml += `        </notations>\n`;
  }

  xml += `      </note>\n`;
  return xml;
}

function renderRest(durationDiv: number): string {
  const components = decomposeDuration(durationDiv);
  let xml = "";
  for (const comp of components) {
    xml += `      <note>\n`;
    xml += `        <rest/>\n`;
    xml += `        <duration>${comp.divisions}</duration>\n`;
    xml += `        <type>${comp.type}</type>\n`;
    for (let d = 0; d < comp.dots; d++) {
      xml += `        <dot/>\n`;
    }
    xml += `      </note>\n`;
  }
  return xml;
}

function buildScore(measures: string[]): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n`;
  xml += `<score-partwise version="4.0">\n`;
  xml += `  <part-list>\n`;
  xml += `    <score-part id="P1">\n`;
  xml += `      <part-name>Part 1</part-name>\n`;
  xml += `    </score-part>\n`;
  xml += `  </part-list>\n`;
  xml += `  <part id="P1">\n`;
  xml += measures.join("");
  xml += `  </part>\n`;
  xml += `</score-partwise>\n`;
  return xml;
}
