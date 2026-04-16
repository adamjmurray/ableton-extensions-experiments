import Note, { type NoteProperty } from "../Note.js";
import Transformer from "./Transformer.js";
import { applyEdgeBehavior } from "./EdgeBehavior.js";

export const ANCHOR = Object.freeze({
  MIN: "min" as const,
  MIDPOINT: "mid" as const,
  MAX: "max" as const,
});

export type AnchorType = (typeof ANCHOR)[keyof typeof ANCHOR];

class SlidablePropertyMetadata {
  range: number;
  min = 0;
  midpoint = 0;
  max = 0;

  constructor(defaultRange: number) {
    this.range = defaultRange;
  }
}

type SlidableProperty =
  | "start"
  | "pitch"
  | "velocity"
  | "duration"
  | "strum"
  | "velrange"
  | "release"
  | "probability";

class SlidablePropertiesMetadata {
  start = new SlidablePropertyMetadata(1);
  pitch = new SlidablePropertyMetadata(12);
  velocity = new SlidablePropertyMetadata(64);
  duration = new SlidablePropertyMetadata(1);
  strum = new SlidablePropertyMetadata(1);
  velrange = new SlidablePropertyMetadata(64);
  release = new SlidablePropertyMetadata(64);
  probability = new SlidablePropertyMetadata(0.5);
}

export default class SlideTransformer extends Transformer {
  metadata: SlidablePropertiesMetadata;
  edgeBehavior: string;
  spreadAnchor: AnchorType;
  tension: number;
  strumUnlockEnd: boolean;
  private _strumIndexForPitch: Record<number, number> | null;

  constructor() {
    super();
    this.metadata = new SlidablePropertiesMetadata();
    this.edgeBehavior = "clamp";
    this.spreadAnchor = ANCHOR.MIDPOINT;
    this.tension = 1;
    this.strumUnlockEnd = false;
    this._strumIndexForPitch = null;
  }

  set notes(notes: Note[]) {
    super.setNotes(notes);

    for (const property of [
      "start",
      "pitch",
      "velocity",
      "duration",
      "velrange",
      "release",
      "probability",
    ] as NoteProperty[]) {
      const values = notes.map((note) => note.get(property));
      const min = Math.min.apply(null, values);
      const max = Math.max.apply(null, values);
      const midpoint = (max + min) / 2;
      const propertyMetadata = this.metadata[property as keyof SlidablePropertiesMetadata];
      propertyMetadata.min = min;
      propertyMetadata.midpoint = midpoint;
      propertyMetadata.max = max;
    }

    this._strumIndexForPitch = null;
  }

  get strumIndexForPitch(): Record<number, number> {
    if (!this._strumIndexForPitch) {
      const pitches: number[] = [];
      for (const note of this.oldNotes) {
        if (pitches.indexOf(note.pitch) < 0) {
          pitches.push(note.pitch);
        }
      }
      const sortedPitches = pitches.sort((a, b) => a - b);
      const indexForPitch: Record<number, number> = {};
      sortedPitches.forEach((pitch, index) => (indexForPitch[pitch] = index));
      this._strumIndexForPitch = indexForPitch;
    }
    return this._strumIndexForPitch;
  }

  setRange(property: SlidableProperty, amount: number): void {
    this.metadata[property].range = amount;
  }

  transform(
    property: NoteProperty,
    mapValue: (value: number, index: number) => number,
  ): Note[] | undefined {
    this.newNotes.forEach((newNote, index) => {
      const oldNote = this.oldNotes[index]!;
      newNote.set(property, mapValue(oldNote.get(property), index));
    });
    return applyEdgeBehavior(this.edgeBehavior, property, this.newNotes, this.clip);
  }

  shift(property: NoteProperty, amount: number): Note[] | undefined {
    amount *= this.metadata[property as SlidableProperty].range;
    return this.transform(property, (value) => value + amount);
  }

  spread(property: NoteProperty, amount: number): Note[] | undefined {
    const { max, min, midpoint, range } = this.metadata[property as SlidableProperty];
    let spreadPoint: number;
    let largestDelta = 0;

    switch (this.spreadAnchor) {
      case ANCHOR.MIN:
        spreadPoint = min;
        largestDelta = max - min;
        break;
      case ANCHOR.MIDPOINT:
        spreadPoint = midpoint;
        largestDelta = midpoint - min;
        break;
      case ANCHOR.MAX:
        spreadPoint = max;
        largestDelta = max - min;
        break;
    }

    if (largestDelta === 0) return this.newNotes;

    return this.transform(
      property,
      (value) => value + (amount * range * (value - spreadPoint)) / largestDelta,
    );
  }

  strum(property: string, amount: number): Note[] | undefined {
    const { range } = this.metadata.strum;
    const indexForPitch = this.strumIndexForPitch;
    const total = Object.keys(indexForPitch).length - 1;
    const unlockEnd = this.strumUnlockEnd;

    this.newNotes.forEach((newNote, noteIndex) => {
      const oldNote = this.oldNotes[noteIndex]!;
      const index = indexForPitch[oldNote.pitch]!;
      let shift = 0;
      switch (this.spreadAnchor) {
        case ANCHOR.MIN:
          shift = Math.pow(index / total, this.tension) * range * amount;
          break;
        case ANCHOR.MIDPOINT:
          shift = (Math.pow(index / total, this.tension) - 1 / 2) * range * amount;
          break;
        case ANCHOR.MAX:
          shift = Math.pow((total - index) / total, this.tension) * range * amount;
          break;
      }
      (newNote as Record<string, unknown>)[property] =
        (oldNote as Record<string, unknown>)[property] as number + shift;
      if (property === "start" && !unlockEnd) {
        newNote.duration = oldNote.duration - shift;
      }
    });

    if (property === "start") {
      if (unlockEnd) {
        return applyEdgeBehavior(this.edgeBehavior, "start", this.newNotes, this.clip);
      } else {
        return applyEdgeBehavior(this.edgeBehavior, "strumStart", this.newNotes, this.clip);
      }
    } else {
      return applyEdgeBehavior(this.edgeBehavior, "strumEnd", this.newNotes, this.clip);
    }
  }

  randomize2D(property: NoteProperty, amountX: number, amountY: number): Note[] | undefined {
    const range = this.metadata[property as SlidableProperty].range;
    amountX *= range / 2;
    amountY *= range / 2;
    return this.transform(
      property,
      (value, index) =>
        value + this.bipolarRandom1[index]! * amountX + this.bipolarRandom2[index]! * amountY,
    );
  }
}
