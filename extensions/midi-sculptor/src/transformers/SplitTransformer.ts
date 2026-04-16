import Note from "../Note.js";
import Transformer from "./Transformer.js";

const MAX_NOTES = 1000;

const truncated = (notes: Note[]): Note[] => {
  console.log(`Reached maximum of ${MAX_NOTES} notes. Some notes were not created.`);
  return notes;
};

const splitInTime = (oldNote: Note, timeBetweenNotes: number, maxNotes: number): Note[] => {
  const notes: Note[] = [];
  for (let t = 0; t < oldNote.duration; t += timeBetweenNotes) {
    if (notes.length >= maxNotes) return truncated(notes);
    const note = oldNote.clone();
    note.start = oldNote.start + t;

    if (t + timeBetweenNotes >= oldNote.duration) {
      note.duration = oldNote.duration - t;
    } else {
      note.duration = timeBetweenNotes;
    }

    notes.push(note);
  }
  return notes;
};

const splitInto = (oldNote: Note, numberOfNotes: number, maxNotes: number): Note[] => {
  const notes: Note[] = [];
  const duration = oldNote.duration / numberOfNotes;

  for (let i = 0; i < numberOfNotes; i++) {
    if (notes.length >= maxNotes) return truncated(notes);
    const note = oldNote.clone();
    note.start = i * duration;
    note.duration = duration;
    notes.push(note);
  }

  return notes;
};

const splitEuclid = (
  oldNote: Note,
  pulses: number,
  total: number,
  maxNotes: number,
): Note[] => {
  const notes: Note[] = [];
  const segmentDuration = oldNote.duration / total;
  let note = oldNote.clone();
  let numSegments = 0;

  let pulseCount = pulses;
  let nextPulse = Math.floor((--pulseCount / pulses) * total);

  for (let i = total; i >= 0; i--) {
    if (notes.length >= maxNotes) return truncated(notes);

    if (i > nextPulse) {
      numSegments++;
    } else {
      note.duration = numSegments * segmentDuration;
      notes.push(note);
      note = oldNote.clone();
      note.start = note.start + (total - i) * segmentDuration;
      numSegments = 1;
      pulseCount--;
      nextPulse = Math.floor((pulseCount / pulses) * total);
    }
  }

  return notes;
};

const splitHalves = (
  oldNote: Note,
  notesPerDivision: number,
  divisions: number,
  maxNotes: number,
): Note[] => {
  const notes: Note[] = [];
  const reversed = divisions < 0;
  let start = oldNote.start + (reversed ? oldNote.duration : 0);
  divisions = Math.abs(divisions);

  for (let d = 0; d < divisions; d++) {
    let divisionDuration = oldNote.duration / Math.pow(2, d + 1);
    let numNotes = notesPerDivision;

    if (d === divisions - 1) {
      divisionDuration *= 2;
      numNotes *= 2;
    }

    const duration = divisionDuration / numNotes;
    if (reversed) start -= divisionDuration;

    for (let n = 0; n < numNotes; n++) {
      if (notes.length >= maxNotes) return truncated(notes);
      const note = oldNote.clone();
      note.duration = duration;
      note.start = start + duration * n;
      notes.push(note);
    }

    if (!reversed) start += divisionDuration;
  }

  return notes;
};

const applyGateAndEnvelope = (notes: Note[], gate: number, envelope: string): void => {
  const length = notes.length;
  if (!length) return;
  const deltaFromMax = 127 - notes[0]!.velocity;
  notes.forEach((note, index) => {
    note.duration *= gate;

    switch (envelope) {
      case "fade-out":
        note.velocity *= (length - index) / length;
        break;
      case "fade-in":
        note.velocity *= (index + 1) / length;
        break;
      case "ramp-down":
        note.velocity += (deltaFromMax * (length - index)) / length;
        break;
      case "ramp-up":
        note.velocity += (deltaFromMax * (index + 1)) / length;
    }
  });
};

export { MAX_NOTES };

export default class SplitTransformer extends Transformer {
  previousSplitNotes: Note[];
  previousOldNotes: Note[];
  splitType: string;
  time: number;
  number: number;
  euclid: [number, number];
  halves: [number, number];
  start: number;
  end: number;
  gate: number;
  envelope: string;

  constructor() {
    super();
    this.previousSplitNotes = [];
    this.previousOldNotes = [];
    this.splitType = "note";
    this.time = 1;
    this.number = 2;
    this.euclid = [1, 1];
    this.halves = [1, 4];
    this.start = 0;
    this.end = 1;
    this.gate = 1;
    this.envelope = "none";
  }

  set notes(notes: Note[]) {
    super.setNotes(notes);
    this.newNotes = [];
  }

  setSplitType(type: string, amount1: number, amount2 = 1): void {
    this.splitType = type;

    if (type === "time") {
      this.time = amount1;
    } else if (type === "note") {
      this.number = amount1;
    } else if (type === "euclid") {
      this.euclid = [amount1, amount2];
    } else if (type === "halves") {
      this.halves = [amount1, amount2];
    }
  }

  isResplit(): boolean {
    const { oldNotes, previousSplitNotes } = this;
    return (
      oldNotes.length === previousSplitNotes.length &&
      !oldNotes.find((note, index) => !note.equals(previousSplitNotes[index]!))
    );
  }

  splitWith(splitter: (note: Note, maxNotes: number) => Note[]): Note[] {
    const { oldNotes, gate, envelope, previousOldNotes } = this;
    const notesToSplit = this.isResplit() ? previousOldNotes : oldNotes;

    let notes: Note[] = [];
    let maxNotes = MAX_NOTES;

    for (const note of notesToSplit) {
      const splitNotes = splitter(note, maxNotes);
      applyGateAndEnvelope(splitNotes, gate, envelope);
      notes = notes.concat(splitNotes);
      if (notes.length >= MAX_NOTES) break;
      maxNotes = MAX_NOTES - notes.length;
    }

    this.previousOldNotes = notesToSplit;
    this.previousSplitNotes = notes;
    return notes;
  }

  split(): Note[] {
    const {
      splitType,
      time,
      number,
      euclid: [pulses, total],
      halves: [notesBeforeDivision, divisions],
    } = this;

    switch (splitType) {
      case "time":
        return this.splitWith((note, maxNotes) => splitInTime(note, time, maxNotes));
      case "note":
        return this.splitWith((note, maxNotes) => splitInto(note, number, maxNotes));
      case "euclid":
        return this.splitWith((note, maxNotes) => splitEuclid(note, pulses, total, maxNotes));
      case "halves":
        return this.splitWith((note, maxNotes) =>
          splitHalves(note, notesBeforeDivision, divisions, maxNotes),
        );
      default:
        return this.oldNotes.map((note) => note.clone());
    }
  }

  splitTilt(amount: number): Note[] {
    if (!this.newNotes.length) {
      const notes = this.split().map((note) => note.clone());
      this.oldNotes = notes;
      this.newNotes = notes.map((note) => note.clone());
      this.previousSplitNotes = this.newNotes;

      this.start = Math.min(...notes.map((note) => note.start));
      this.end = Math.max(...notes.map((note) => note.start + note.duration));
    }

    const { oldNotes, newNotes, start, end } = this;
    if (amount === 0) return newNotes;
    let power: number;

    if (amount < 0) {
      power = 1 - amount * 2;
    } else {
      power = 1 / (1 + amount * 2);
    }

    const totalDuration = end - start;
    oldNotes.forEach((note, index) => {
      const normalizedStart = (note.start - start) / totalDuration;
      const mapped = Math.pow(normalizedStart, power);
      newNotes[index]!.start = mapped * totalDuration + start;
    });
    return newNotes;
  }
}
