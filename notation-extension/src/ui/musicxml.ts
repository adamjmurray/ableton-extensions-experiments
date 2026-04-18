import type { ClipData, NoteData } from "./bridge.js";
import { buildFullPartName, truncatePartName } from "./part-name.js";
import { avgPitch, detectClef, getKeySignature, midiToPitch } from "./pitch-spelling.js";

// MusicXML <divisions> value — how many units one quarter note is split into.
// LCM(8, 6) = 24 is the smallest value that keeps both 32nd notes (3 units)
// and triplet 16ths (4 units) integer-valued, so we never lose precision when
// converting quantized beat positions to MusicXML durations.
const DIVISIONS = 24;

export type SortMode = "pitch" | "track" | "native";

// Reorder clips for score layout. Returns a new array; input is not mutated.
//   - "pitch": treble (avg >= 60) above bass, then avg pitch DESC within tier.
//   - "track": ascending trackIndex; clips without trackIndex sink to the end.
//   - "native": input order preserved.
// All modes are stable: clips that tie on the primary key keep their
// original relative order.
export function sortClipsForScore(clips: ClipData[], mode: SortMode): ClipData[] {
  if (mode === "native" || clips.length < 2) return clips.slice();

  const decorated = clips.map((clip, i) => ({
    clip,
    i,
    avg: avgPitch(clip.notes),
    trackIndex: clip.clip.trackIndex,
  }));

  if (mode === "pitch") {
    decorated.sort((a, b) => {
      const aTier = a.avg >= 60 ? 0 : 1;
      const bTier = b.avg >= 60 ? 0 : 1;
      if (aTier !== bTier) return aTier - bTier;
      if (a.avg !== b.avg) return b.avg - a.avg;
      return a.i - b.i;
    });
  } else {
    decorated.sort((a, b) => {
      const aKey = a.trackIndex ?? Number.POSITIVE_INFINITY;
      const bKey = b.trackIndex ?? Number.POSITIVE_INFINITY;
      if (aKey !== bKey) return aKey - bKey;
      return a.i - b.i;
    });
  }

  return decorated.map((d) => d.clip);
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
  pitch: number;
  startDiv: number;
  durationDiv: number;
  velocity: number;
  tiedFrom: boolean;
  tiedTo: boolean;
  voice: number;
}

interface AbsNote {
  pitch: number;
  startDiv: number;
  durationDiv: number;
  velocity: number;
  voice: number;
}

/**
 * Assign each note a 1-indexed voice number so overlapping notes engrave as
 * independent rhythmic lines on the same staff. Mutates each note's `.voice`
 * field in place.
 *
 * Notes are processed in a deterministic order — by start position first,
 * then longest-duration first, then highest-pitch first — so the primary
 * melodic line (typically sustained/topmost notes) claims voice 1 and
 * flourishes spill into voice 2+.
 *
 * Assignment rules, checked in order for each note:
 *   1. If some voice's most recent note has the exact same start and duration,
 *      reuse that voice. This keeps true chords (stacked same-length notes at
 *      the same onset) in one voice so MusicXML emits them with `<chord/>`
 *      rather than splitting them across multiple voices.
 *   2. Otherwise, reuse the lowest-numbered voice whose last note has already
 *      ended (startDiv >= voiceMaxEnd[v]).
 *   3. Otherwise, open a new voice.
 *
 * @param notes absolute-positioned notes for one part; `voice` will be set on each.
 */
function assignVoices(notes: AbsNote[]): void {
  const order = notes
    .slice()
    .sort((a, b) => a.startDiv - b.startDiv || b.durationDiv - a.durationDiv || b.pitch - a.pitch);

  const voiceMaxEnd: number[] = [];
  const lastInVoice: AbsNote[] = [];

  for (const n of order) {
    let assigned = -1;

    for (let v = 0; v < lastInVoice.length; v++) {
      const last = lastInVoice[v]!;
      if (last.startDiv === n.startDiv && last.durationDiv === n.durationDiv) {
        assigned = v;
        break;
      }
    }

    if (assigned === -1) {
      for (let v = 0; v < voiceMaxEnd.length; v++) {
        if (n.startDiv >= voiceMaxEnd[v]!) {
          assigned = v;
          break;
        }
      }
    }

    if (assigned === -1) {
      assigned = voiceMaxEnd.length;
      voiceMaxEnd.push(0);
    }

    n.voice = assigned + 1;
    lastInVoice[assigned] = n;
    const end = n.startDiv + n.durationDiv;
    if (end > (voiceMaxEnd[assigned] ?? 0)) voiceMaxEnd[assigned] = end;
  }
}

function buildAttributesBlock(
  clef: { sign: string; line: number },
  fifths: number,
  mode: string,
  timeSignature: { numerator: number; denominator: number },
): string {
  let xml = `      <attributes>\n`;
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
  return xml;
}

function renderWholeRestMeasure(
  measureNumber: number,
  measureDivisions: number,
  header: string,
): string {
  let xml = `    <measure number="${measureNumber}">\n`;
  xml += header;
  xml += `      <note>\n`;
  xml += `        <rest measure="yes"/>\n`;
  xml += `        <duration>${measureDivisions}</duration>\n`;
  xml += `        <voice>1</voice>\n`;
  xml += `      </note>\n`;
  xml += `    </measure>\n`;
  return xml;
}

/**
 * Emit the `<measure>` elements for one part (one clip's staff).
 *
 * Walks the clip's notes measure-by-measure, splitting voices, ties, tuplets,
 * and rests. Time is carried in MusicXML divisions (see `DIVISIONS`) so
 * quantized beat positions map to integer durations.
 *
 * The emitted measure list is structured as:
 *   [leadingMeasures × whole-rest] + [numMeasures × content] + [trailingMeasures × whole-rest]
 * Leading/trailing rests appear in multi-clip arrangement alignment, where
 * this part has to pad so its content measures sit on the shared bar grid.
 *
 * @param notes            clip-local quantized notes (beats from clip start).
 * @param timeSignature    score time signature; drives measure length.
 * @param fifths           key signature fifths count (from `getKeySignature`).
 * @param mode             "major" | "minor" — emitted into `<key><mode>`.
 * @param renderStart      clip-local beat at which emission begins; notes before this
 *                         time are placed using `filterStartDiv` as leading rest.
 * @param filterStartDiv   divisions from `renderStart` to the first sounding position;
 *                         notes before it render as leading rest inside measure 1.
 * @param renderLengthDiv  total divisions covered by the content measures.
 * @param numMeasures      how many content measures to emit.
 * @param legato           extend note durations to fill gaps to the next onset.
 * @param tempoDirection   pre-built `<direction>` string for tempo; empty when no tempo.
 * @param leadingMeasures  whole-rest measures emitted *before* the content.
 * @param trailingMeasures whole-rest measures emitted *after* the content.
 * @param isDrumRack       when true, render notes with x noteheads (drum convention).
 * @returns one string per measure, ready to join.
 */
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
  leadingMeasures: number,
  trailingMeasures: number,
  isDrumRack: boolean,
): string[] {
  const clef = detectClef(notes);
  const beatsPerMeasure = timeSignature.numerator * (4 / timeSignature.denominator);
  const measureDivisions = beatsPerMeasure * DIVISIONS;

  const attributesBlock = buildAttributesBlock(clef, fifths, mode, timeSignature);
  const firstMeasureHeader = attributesBlock + tempoDirection;

  const absNotes: AbsNote[] = notes
    .map((n) => ({
      pitch: n.pitch,
      startDiv: Math.round((n.startTime - renderStart) * DIVISIONS),
      durationDiv: Math.max(1, Math.round(n.duration * DIVISIONS)),
      velocity: n.velocity,
      voice: 1,
    }))
    .filter((n) => n.startDiv >= filterStartDiv && n.startDiv < renderLengthDiv)
    .sort((a, b) => a.startDiv - b.startDiv || a.pitch - b.pitch);

  if (legato) {
    for (let i = 0; i < absNotes.length; i++) {
      const note = absNotes[i]!;
      const startDiv = note.startDiv;
      const barEnd = (Math.floor(startDiv / measureDivisions) + 1) * measureDivisions;
      const nextStart = absNotes.find((_n, j) => j > i && _n.startDiv > startDiv)?.startDiv;
      const limit = nextStart !== undefined ? Math.min(nextStart, barEnd) : barEnd;
      note.durationDiv = limit - startDiv;
    }
  }

  assignVoices(absNotes);

  const measures: string[] = [];
  let measureNumber = 1;

  for (let k = 0; k < leadingMeasures; k++) {
    const header = k === 0 ? firstMeasureHeader : "";
    measures.push(renderWholeRestMeasure(measureNumber, measureDivisions, header));
    measureNumber++;
  }

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
          pitch: n.pitch,
          startDiv: effectiveStart - mStart,
          durationDiv: effectiveEnd - effectiveStart,
          velocity: n.velocity,
          tiedFrom: n.startDiv < mStart,
          tiedTo: noteEnd > mEnd,
          voice: n.voice,
        });
      }
    }

    let xml = `    <measure number="${measureNumber}">\n`;

    if (m === 0 && leadingMeasures === 0) {
      xml += firstMeasureHeader;
    }

    const voiceNumbers = [...new Set(events.map((e) => e.voice))].sort((a, b) => a - b);
    if (voiceNumbers.length === 0) voiceNumbers.push(1);

    for (let vi = 0; vi < voiceNumbers.length; vi++) {
      const voice = voiceNumbers[vi]!;
      const voiceEvents = events
        .filter((e) => e.voice === voice)
        .sort((a, b) => a.startDiv - b.startDiv || a.pitch - b.pitch);

      xml += renderVoiceElements(voiceEvents, voice, measureDivisions, fifths, isDrumRack);

      if (vi < voiceNumbers.length - 1) {
        xml += `      <backup>\n        <duration>${measureDivisions}</duration>\n      </backup>\n`;
      }
    }

    xml += `    </measure>\n`;
    measures.push(xml);
    measureNumber++;
  }

  for (let k = 0; k < trailingMeasures; k++) {
    measures.push(renderWholeRestMeasure(measureNumber, measureDivisions, ""));
    measureNumber++;
  }

  return measures;
}

// The clip render region used by standalone rendering and by callers that
// flatten a track's clips into one synthetic part (see the "Render Track"
// handlers in extension.ts). The alpha SDK currently reports endMarker at
// the absolute clip end rather than the playback end, so we always use
// loopEnd as the effective end. The filter anchor is startMarker (or
// min(loopStart, startMarker) for loops, since the loop region plays
// even if it precedes startMarker). When that anchor is mid-measure,
// the render anchor rounds back to the previous bar boundary so bar
// lines align to the song's musical grid; the gap becomes leading rests.
export function getClipRenderRegion(
  clip: Pick<ClipData["clip"], "startMarker" | "loopStart" | "loopEnd" | "looping">,
  beatsPerMeasure: number,
): { filterStart: number; renderEnd: number; renderStart: number; barCount: number } {
  const filterStart = clip.looping ? Math.min(clip.loopStart, clip.startMarker) : clip.startMarker;
  const renderEnd = clip.loopEnd;
  const renderStart = Math.floor(filterStart / beatsPerMeasure) * beatsPerMeasure;
  const barCount = Math.max(1, Math.ceil((renderEnd - renderStart) / beatsPerMeasure));
  return { filterStart, renderEnd, renderStart, barCount };
}

/**
 * Convert one or more MIDI clips into a single MusicXML partwise score.
 *
 * Each clip becomes a `<part>` with its own staff, clef (bass/treble detected
 * by average pitch), and part-name label. The score's key signature is
 * derived from `rootNote` + `scaleName` via `getKeySignature`; when the scale
 * is unrecognized, falls back to 0 fifths with per-note accidentals.
 *
 * Multi-clip alignment: if every clip carries `arrangementStartTime` (set
 * only by the arrangement-selection entry point), parts are anchored to a
 * shared bar grid derived from the earliest clip's first sounding note. Each
 * clip then emits leading rest measures so its content starts at the correct
 * absolute bar. Without `arrangementStartTime`, each clip renders standalone
 * using its own bar floor.
 *
 * @param clips         quantized clips, each with `notes` + `clip` envelope.
 * @param timeSignature score time signature; drives measure length.
 * @param rootNote      MIDI pitch class for the tonic (0=C … 11=B).
 * @param scaleName     Ableton scale name (e.g. "Major", "Dorian").
 * @param legato        when true, extend note durations to the next onset.
 * @param tempo         BPM marking to emit on the first part; omitted when falsy.
 * @returns a complete MusicXML `<score-partwise>` document as a string.
 */
export function notesToMusicXML(
  clips: ClipData[],
  timeSignature: { numerator: number; denominator: number },
  rootNote: number,
  scaleName: string,
  legato?: boolean,
  tempo?: number,
): string {
  const { fifths, mode } = getKeySignature(rootNote, scaleName);
  const beatsPerMeasure = timeSignature.numerator * (4 / timeSignature.denominator);
  const tempoDirection = tempo && tempo > 0 ? buildTempoDirection(tempo) : "";

  // Arrangement-timeline alignment: when every clip carries an
  // arrangementStartTime (set only by the arrangement-selection entry point),
  // anchor all parts to a shared origin — the closest barline at or before
  // the earliest clip's first-sounding-note arrangement position — and pick
  // each clip's renderStart so its first emitted content measure lands on
  // that same arrangement bar grid. AJM-178's in-staff leading-rest machinery
  // then produces any sub-bar offset inside the first rendered measure.
  const align = clips.length > 0 && clips.every((c) => c.clip.arrangementStartTime !== undefined);

  const base = clips.map((c) => {
    const region = getClipRenderRegion(c.clip, beatsPerMeasure);
    const arrangementStart = c.clip.arrangementStartTime ?? 0;
    return {
      clip: c.clip,
      notes: c.notes,
      isDrumRack: c.isDrumRack ?? false,
      filterStart: region.filterStart,
      renderEnd: region.renderEnd,
      standaloneRenderStart: region.renderStart,
      arrangementStart,
      arrangementFilterStart: arrangementStart + region.filterStart - c.clip.startMarker,
    };
  });

  const globalOrigin = align
    ? Math.floor(Math.min(...base.map((r) => r.arrangementFilterStart)) / beatsPerMeasure) *
      beatsPerMeasure
    : 0;

  // Per-clip renderStart: in aligned mode, map the arrangement position of
  // the clip's first emitted content measure back to clip-local time. In
  // standalone mode, keep the clip-local bar floor (AJM-178).
  const withLayout = base.map((r) => {
    const leadingMeasures = align
      ? Math.max(0, Math.floor((r.arrangementFilterStart - globalOrigin) / beatsPerMeasure))
      : 0;
    const renderStart = align
      ? r.clip.startMarker + (globalOrigin + leadingMeasures * beatsPerMeasure - r.arrangementStart)
      : r.standaloneRenderStart;
    const clipMeasureCount = Math.max(1, Math.ceil((r.renderEnd - renderStart) / beatsPerMeasure));
    return { ...r, leadingMeasures, renderStart, clipMeasureCount };
  });

  const totalMeasures = align
    ? withLayout.reduce((m, r) => Math.max(m, r.leadingMeasures + r.clipMeasureCount), 0)
    : 0;

  const renders = withLayout.map((r) => ({
    ...r,
    trailingMeasures: align ? totalMeasures - r.leadingMeasures - r.clipMeasureCount : 0,
  }));

  let unnamedCount = 0;
  const parts = renders.map((r, i) => {
    const id = `P${i + 1}`;
    const clipName = (r.clip.name ?? "").trim();
    // If the track name provides enough identity, skip the "(unnamed #N)"
    // fallback so flattened track renders show a bare "[TrackName]" part
    // name instead of "[TrackName] (unnamed #1)". Prefer the stable
    // `unnamedIndex` assigned at dialog-open time so the number does not
    // shift when sort mode reorders parts (AJM-189).
    const label =
      clipName || (r.clip.trackName ? "" : `(unnamed #${r.clip.unnamedIndex ?? ++unnamedCount})`);
    const name = buildPartName(r.clip.trackName, label, i);

    const clipLength = r.renderEnd - r.renderStart;
    const renderLengthDiv = Math.round(clipLength * DIVISIONS);
    const filterStartDiv = Math.round((r.filterStart - r.renderStart) * DIVISIONS);

    const measures = generatePartMeasures(
      r.notes,
      timeSignature,
      fifths,
      mode,
      r.renderStart,
      filterStartDiv,
      renderLengthDiv,
      r.clipMeasureCount,
      legato ?? false,
      i === 0 ? tempoDirection : "",
      r.leadingMeasures,
      r.trailingMeasures,
      r.isDrumRack,
    );
    return { id, name, measures };
  });

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

function buildPartName(trackName: string | undefined, label: string, index: number): string {
  return truncatePartName(buildFullPartName(trackName ?? "", label, index));
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
  isDrumRack: boolean,
  voice: number,
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

  xml += `        <voice>${voice}</voice>\n`;
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

  if (isDrumRack) {
    xml += `        <notehead>x</notehead>\n`;
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

function renderRestNote(comp: DurationComponent, voice: number): string {
  let xml = `      <note>\n`;
  xml += `        <rest/>\n`;
  xml += `        <duration>${comp.divisions}</duration>\n`;
  xml += `        <voice>${voice}</voice>\n`;
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

interface NoteElement {
  xml: string;
  triplet: boolean;
  divisions: number;
}

// Build the note/rest XML for a single voice within a single measure.
// Returns the concatenated XML; callers emit <backup> between voices.
function renderVoiceElements(
  voiceEvents: MeasureEvent[],
  voice: number,
  measureDivisions: number,
  fifths: number,
  isDrumRack: boolean,
): string {
  const noteElements: NoteElement[] = [];

  let cursor = 0;
  const startPositions = [...new Set(voiceEvents.map((e) => e.startDiv))].sort((a, b) => a - b);

  for (const pos of startPositions) {
    if (pos > cursor) {
      const restComps = decomposeDuration(pos - cursor);
      for (const comp of restComps) {
        noteElements.push({
          xml: renderRestNote(comp, voice),
          triplet: comp.triplet,
          divisions: comp.divisions,
        });
      }
    }

    const chord = voiceEvents.filter((e) => e.startDiv === pos);
    const minDur = Math.min(...chord.map((e) => e.durationDiv));

    // All chord members share the same durationDiv (assignVoices enforces
    // this), so they share the same decomposition. Iterate components outer,
    // chord members inner: every chord tone gets emitted for every component
    // with <chord/> so the tied continuations engrave as chord stacks rather
    // than sequential notes.
    const components = decomposeDuration(chord[0]!.durationDiv);
    for (let c = 0; c < components.length; c++) {
      const comp = components[c]!;
      for (let i = 0; i < chord.length; i++) {
        const ev = chord[i]!;
        const isChordMember = i > 0;
        const tieStop = (ev.tiedFrom && c === 0) || c > 0;
        const tieStart = (ev.tiedTo && c === components.length - 1) || c < components.length - 1;

        noteElements.push({
          xml: renderNote(
            ev.pitch,
            comp,
            fifths,
            isChordMember,
            tieStop,
            tieStart,
            isDrumRack,
            voice,
          ),
          triplet: comp.triplet,
          divisions: isChordMember ? 0 : comp.divisions,
        });
      }
    }

    cursor = pos + minDur;
  }

  if (cursor < measureDivisions) {
    const restComps = decomposeDuration(measureDivisions - cursor);
    for (const comp of restComps) {
      noteElements.push({
        xml: renderRestNote(comp, voice),
        triplet: comp.triplet,
        divisions: comp.divisions,
      });
    }
  }

  const totalDiv = noteElements.reduce((sum, el) => sum + el.divisions, 0);
  if (totalDiv < measureDivisions) {
    const pad = decomposeDuration(measureDivisions - totalDiv);
    for (const comp of pad) {
      noteElements.push({
        xml: renderRestNote(comp, voice),
        triplet: comp.triplet,
        divisions: comp.divisions,
      });
    }
  }

  for (let i = 0; i < noteElements.length; i++) {
    if (!noteElements[i]?.triplet) continue;

    let j = i;
    while (j < noteElements.length && noteElements[j]?.triplet) j++;
    const runLength = j - i;

    for (let g = 0; g < runLength; g += 3) {
      const groupStart = i + g;
      const groupEnd = Math.min(i + g + 2, j - 1);
      const startEl = noteElements[groupStart]!;
      const endEl = noteElements[groupEnd]!;
      startEl.xml = injectTuplet(startEl.xml, "start");
      endEl.xml = injectTuplet(endEl.xml, "stop");
    }

    i = j - 1;
  }

  let xml = "";
  for (const el of noteElements) {
    xml += el.xml;
  }
  return xml;
}

// Inject a <tuplet> element into a rendered <note> XML string.
// If a <notations> block exists, insert inside it; otherwise add one.
function injectTuplet(noteXml: string, type: "start" | "stop"): string {
  const tupletEl =
    type === "start"
      ? `          <tuplet type="start" bracket="yes" number="1"/>\n`
      : `          <tuplet type="stop" number="1"/>\n`;

  if (noteXml.includes("</notations>")) {
    return noteXml.replace("</notations>", `${tupletEl}        </notations>`);
  }
  const notationsBlock = `        <notations>\n${tupletEl}        </notations>\n`;
  return noteXml.replace("      </note>", `${notationsBlock}      </note>`);
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
