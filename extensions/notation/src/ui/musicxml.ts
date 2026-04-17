import type { NoteData, ClipData } from "./bridge.js";

// MusicXML divisions per quarter note.
// LCM(8, 6) = 24 supports 32nd notes (3 divisions) and triplet 16ths (4 divisions).
const DIVISIONS = 24;

function getFifths(rootNote: number, scaleName: string): number {
  const majorFifths = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
  const minorFifths = [-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2];
  const isMinor = scaleName.toLowerCase().includes("minor");
  return isMinor ? minorFifths[rootNote % 12] : majorFifths[rootNote % 12];
}

function midiToPitch(midi: number, fifths: number): { step: string; alter: number; octave: number } {
  const octave = Math.floor(midi / 12) - 1;
  const pc = midi % 12;
  const useFlats = fifths < 0;

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

function detectClef(notes: NoteData[]): { sign: string; line: number } {
  if (notes.length === 0) return { sign: "G", line: 2 };
  const avgPitch = notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length;
  if (avgPitch < 60) return { sign: "F", line: 4 };
  return { sign: "G", line: 2 };
}

// --- Duration decomposition ---

interface DurationComponent {
  divisions: number;
  type: string;
  dots: number;
  triplet: boolean; // needs <time-modification> 3-in-2
}

// Duration table ordered largest to smallest.
// Triplet entries only used when the value exactly matches.
const DURATION_TABLE: DurationComponent[] = [
  { divisions: 144, type: "whole", dots: 1, triplet: false },
  { divisions: 96, type: "whole", dots: 0, triplet: false },
  { divisions: 72, type: "half", dots: 1, triplet: false },
  { divisions: 48, type: "half", dots: 0, triplet: false },
  { divisions: 36, type: "quarter", dots: 1, triplet: false },
  { divisions: 24, type: "quarter", dots: 0, triplet: false },
  { divisions: 18, type: "eighth", dots: 1, triplet: false },
  { divisions: 16, type: "quarter", dots: 0, triplet: true },
  { divisions: 12, type: "eighth", dots: 0, triplet: false },
  { divisions: 9, type: "16th", dots: 1, triplet: false },
  { divisions: 8, type: "eighth", dots: 0, triplet: true },
  { divisions: 6, type: "16th", dots: 0, triplet: false },
  { divisions: 4, type: "16th", dots: 0, triplet: true },
  { divisions: 3, type: "32nd", dots: 0, triplet: false },
];

function decomposeDuration(totalDivisions: number): DurationComponent[] {
  const result: DurationComponent[] = [];
  let remaining = Math.round(totalDivisions);

  while (remaining > 0) {
    let found = false;
    for (const entry of DURATION_TABLE) {
      if (entry.divisions <= remaining) {
        result.push({ ...entry });
        remaining -= entry.divisions;
        found = true;
        break;
      }
    }
    if (!found) {
      // Fallback for very small remainders (1 or 2 divisions)
      result.push({ divisions: remaining, type: "32nd", dots: 0, triplet: false });
      break;
    }
  }

  return result;
}

// --- MusicXML rendering ---

interface MeasureEvent {
  type: "note" | "rest";
  pitch?: number;
  startDiv: number;
  durationDiv: number;
  velocity?: number;
  tiedFrom?: boolean;
  tiedTo?: boolean;
}

function generatePartMeasures(
  notes: NoteData[],
  timeSignature: { numerator: number; denominator: number },
  fifths: number,
  mode: string,
  renderStart: number,
  filterStartDiv: number,
  renderLengthDiv: number,
  numMeasures: number,
  legato: boolean,
  tempoDirection: string,
): string[] {
  const clef = detectClef(notes);
  const beatsPerMeasure = timeSignature.numerator * (4 / timeSignature.denominator);
  const measureDivisions = beatsPerMeasure * DIVISIONS;

  const absNotes = notes
    .map((n) => ({
      pitch: n.pitch,
      startDiv: Math.round((n.startTime - renderStart) * DIVISIONS),
      durationDiv: Math.max(1, Math.round(n.duration * DIVISIONS)),
      velocity: n.velocity,
    }))
    .filter((n) => n.startDiv >= filterStartDiv && n.startDiv < renderLengthDiv)
    .sort((a, b) => a.startDiv - b.startDiv || a.pitch - b.pitch);

  if (legato) {
    for (let i = 0; i < absNotes.length; i++) {
      const startDiv = absNotes[i].startDiv;
      const barEnd = (Math.floor(startDiv / measureDivisions) + 1) * measureDivisions;
      const nextStart = absNotes.find((_n, j) => j > i && _n.startDiv > startDiv)?.startDiv;
      const limit = nextStart !== undefined ? Math.min(nextStart, barEnd) : barEnd;
      absNotes[i].durationDiv = limit - startDiv;
    }
  }

  const measures: string[] = [];

  for (let m = 0; m < numMeasures; m++) {
    const mStart = m * measureDivisions;
    const mEnd = mStart + measureDivisions;

    const events: MeasureEvent[] = [];

    for (const n of absNotes) {
      const noteEnd = n.startDiv + n.durationDiv;

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

    events.sort((a, b) => a.startDiv - b.startDiv || (a.pitch ?? 0) - (b.pitch ?? 0));

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
      xml += tempoDirection;
    }

    // First pass: collect all rendered note elements with triplet flags
    interface NoteElement {
      xml: string;
      triplet: boolean;
      divisions: number;
    }
    const noteElements: NoteElement[] = [];

    let cursor = 0;
    const startPositions = [...new Set(events.map((e) => e.startDiv))].sort((a, b) => a - b);

    for (const pos of startPositions) {
      if (pos > cursor) {
        const restComps = decomposeDuration(pos - cursor);
        for (const comp of restComps) {
          noteElements.push({ xml: renderRestNote(comp), triplet: comp.triplet, divisions: comp.divisions });
        }
      }

      const chord = events.filter((e) => e.startDiv === pos);
      const minDur = Math.min(...chord.map((e) => e.durationDiv));

      for (let i = 0; i < chord.length; i++) {
        const ev = chord[i];
        const components = decomposeDuration(ev.durationDiv);

        for (let c = 0; c < components.length; c++) {
          const comp = components[c];
          const isChordMember = i > 0 && c === 0;
          const tieStop = ev.tiedFrom && c === 0;
          const tieStart = ev.tiedTo && c === components.length - 1;

          noteElements.push({
            xml: renderNote(
              ev.pitch!,
              comp,
              fifths,
              isChordMember,
              tieStop || (c > 0),
              tieStart || (c < components.length - 1),
            ),
            triplet: comp.triplet,
            // Chord members don't advance time
            divisions: isChordMember ? 0 : comp.divisions,
          });
        }
      }

      cursor = pos + minDur;
    }

    if (cursor < measureDivisions) {
      const restComps = decomposeDuration(measureDivisions - cursor);
      for (const comp of restComps) {
        noteElements.push({ xml: renderRestNote(comp), triplet: comp.triplet, divisions: comp.divisions });
      }
    }

    // Verify measure duration adds up (fixes barlines)
    const totalDiv = noteElements.reduce((sum, el) => sum + el.divisions, 0);
    if (totalDiv < measureDivisions) {
      const pad = decomposeDuration(measureDivisions - totalDiv);
      for (const comp of pad) {
        noteElements.push({ xml: renderRestNote(comp), triplet: comp.triplet, divisions: comp.divisions });
      }
    }

    // Second pass: inject tuplet brackets in groups of 3
    for (let i = 0; i < noteElements.length; i++) {
      if (!noteElements[i].triplet) continue;

      // Collect the consecutive triplet run
      let j = i;
      while (j < noteElements.length && noteElements[j].triplet) j++;
      const runLength = j - i;

      // Split into groups of 3
      for (let g = 0; g < runLength; g += 3) {
        const groupStart = i + g;
        const groupEnd = Math.min(i + g + 2, j - 1); // last in this group of 3
        noteElements[groupStart].xml = injectTuplet(noteElements[groupStart].xml, "start");
        noteElements[groupEnd].xml = injectTuplet(noteElements[groupEnd].xml, "stop");
      }

      i = j - 1;
    }

    for (const el of noteElements) {
      xml += el.xml;
    }

    xml += `    </measure>\n`;
    measures.push(xml);
  }

  return measures;
}

export function notesToMusicXML(
  clips: ClipData[],
  timeSignature: { numerator: number; denominator: number },
  rootNote: number,
  scaleName: string,
  legato?: boolean,
  tempo?: number,
): string {
  const fifths = getFifths(rootNote, scaleName);
  const mode = scaleName.toLowerCase().includes("minor") ? "minor" : "major";
  const beatsPerMeasure = timeSignature.numerator * (4 / timeSignature.denominator);

  // Per-clip render window. The alpha SDK currently reports endMarker at
  // the absolute clip end rather than the playback end, so we always use
  // loopEnd as the effective end. The filter anchor is startMarker (or
  // min(loopStart, startMarker) for loops, since the loop region plays
  // even if it precedes startMarker). When that anchor is mid-measure,
  // the render anchor rounds back to the previous bar boundary so bar
  // lines align to the song's musical grid; the gap becomes leading rests.
  const filterStarts = clips.map((c) =>
    c.clip.looping ? Math.min(c.clip.loopStart, c.clip.startMarker) : c.clip.startMarker,
  );
  const renderStarts = filterStarts.map(
    (anchor) => Math.floor(anchor / beatsPerMeasure) * beatsPerMeasure,
  );
  const renderEnds = clips.map((c) => c.clip.loopEnd);

  const tempoDirection = tempo && tempo > 0 ? buildTempoDirection(tempo) : "";

  const parts: { id: string; name: string; measures: string[] }[] = [];
  let unnamedCount = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const id = `P${i + 1}`;
    const clipName = (c.clip.name ?? "").trim();
    const label = clipName || `(unnamed ${++unnamedCount})`;
    const name = buildPartName(c.clip.trackName, label, i);

    const renderStart = renderStarts[i]!;
    const filterStart = filterStarts[i]!;
    const renderEnd = renderEnds[i]!;
    const clipLength = renderEnd - renderStart;
    const numMeasures = Math.max(1, Math.ceil(clipLength / beatsPerMeasure));
    const renderLengthDiv = Math.round(clipLength * DIVISIONS);
    const filterStartDiv = Math.round((filterStart - renderStart) * DIVISIONS);

    const measures = generatePartMeasures(
      c.notes,
      timeSignature,
      fifths,
      mode,
      renderStart,
      filterStartDiv,
      renderLengthDiv,
      numMeasures,
      legato ?? false,
      i === 0 ? tempoDirection : "",
    );
    parts.push({ id, name, measures });
  }

  return buildScore(parts);
}

function buildTempoDirection(tempo: number): string {
  const bpm = Math.round(tempo);
  let xml = `      <direction placement="above">\n`;
  xml += `        <direction-type>\n`;
  xml += `          <metronome parentheses="no">\n`;
  xml += `            <beat-unit>quarter</beat-unit>\n`;
  xml += `            <per-minute>${bpm}</per-minute>\n`;
  xml += `          </metronome>\n`;
  xml += `        </direction-type>\n`;
  xml += `        <sound tempo="${bpm}"/>\n`;
  xml += `      </direction>\n`;
  return xml;
}

const MAX_PART_NAME_LENGTH = 30;

function buildPartName(trackName: string | undefined, label: string, index: number): string {
  const t = (trackName ?? "").trim();
  const c = label.trim();
  let name: string;
  if (t && c) name = `[${t}] ${c}`;
  else if (t) name = `[${t}]`;
  else if (c) name = c;
  else name = `Part ${index + 1}`;

  if (name.length > MAX_PART_NAME_LENGTH) {
    name = name.slice(0, MAX_PART_NAME_LENGTH - 1) + "…";
  }
  return name;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

  if (comp.triplet) {
    xml += `        <time-modification>\n`;
    xml += `          <actual-notes>3</actual-notes>\n`;
    xml += `          <normal-notes>2</normal-notes>\n`;
    xml += `        </time-modification>\n`;
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

function renderRestNote(comp: DurationComponent): string {
  let xml = `      <note>\n`;
  xml += `        <rest/>\n`;
  xml += `        <duration>${comp.divisions}</duration>\n`;
  xml += `        <type>${comp.type}</type>\n`;
  for (let d = 0; d < comp.dots; d++) {
    xml += `        <dot/>\n`;
  }
  if (comp.triplet) {
    xml += `        <time-modification>\n`;
    xml += `          <actual-notes>3</actual-notes>\n`;
    xml += `          <normal-notes>2</normal-notes>\n`;
    xml += `        </time-modification>\n`;
  }
  xml += `      </note>\n`;
  return xml;
}

// Inject a <tuplet> element into a rendered <note> XML string.
// If a <notations> block exists, insert inside it; otherwise add one.
function injectTuplet(noteXml: string, type: "start" | "stop"): string {
  const tupletEl = type === "start"
    ? `          <tuplet type="start" bracket="yes" number="1"/>\n`
    : `          <tuplet type="stop" number="1"/>\n`;

  if (noteXml.includes("</notations>")) {
    return noteXml.replace("</notations>", tupletEl + `        </notations>`);
  }
  const notationsBlock = `        <notations>\n${tupletEl}        </notations>\n`;
  return noteXml.replace("      </note>", notationsBlock + `      </note>`);
}

function buildScore(parts: { id: string; name: string; measures: string[] }[]): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n`;
  xml += `<score-partwise version="4.0">\n`;
  xml += `  <part-list>\n`;
  for (const part of parts) {
    xml += `    <score-part id="${part.id}">\n`;
    xml += `      <part-name>${escapeXml(part.name)}</part-name>\n`;
    xml += `    </score-part>\n`;
  }
  xml += `  </part-list>\n`;
  for (const part of parts) {
    xml += `  <part id="${part.id}">\n`;
    xml += part.measures.join("");
    xml += `  </part>\n`;
  }
  xml += `</score-partwise>\n`;
  return xml;
}
