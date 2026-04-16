import { clamp, fuzzyEquals } from "./utils.js";

export type NoteProperty =
  | "pitch"
  | "start"
  | "duration"
  | "velocity"
  | "velrange"
  | "release"
  | "probability";

export interface NoteOptions {
  id?: number | null;
  pitch?: number;
  start?: number;
  duration?: number;
  velocity?: number;
  velrange?: number;
  release?: number;
  probability?: number;
  muted?: boolean;
  deleted?: boolean;
}

export interface LiveAPINote {
  note_id: number | null;
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  velocity_deviation: number;
  release_velocity: number;
  probability: number;
  mute: number;
}

export default class Note {
  static readonly MIN_DURATION = 1 / 1024;

  id: number | null;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
  velrange: number;
  release: number;
  probability: number;
  muted: boolean;
  deleted: boolean;

  constructor(options: NoteOptions = {}) {
    this.id = options.id ?? null;
    this.pitch = options.pitch ?? 60;
    this.start = options.start ?? 0;
    this.duration = options.duration ?? 1;
    this.velocity = options.velocity ?? 100;
    this.velrange = options.velrange ?? 0;
    this.release = options.release ?? 100;
    this.probability = options.probability ?? 1;
    this.muted = options.muted ?? false;
    this.deleted = options.deleted ?? false;
  }

  get end(): number {
    return this.start + this.duration;
  }

  get(property: NoteProperty): number {
    return this[property];
  }

  set(property: NoteProperty, value: number): void {
    this[property] = value;
  }

  toJSON(): Required<NoteOptions> {
    return {
      id: this.id,
      pitch: this.pitch,
      start: this.start,
      duration: this.duration,
      velocity: this.velocity,
      velrange: this.velrange,
      release: this.release,
      probability: this.probability,
      muted: this.muted,
      deleted: this.deleted,
    };
  }

  toString(): string {
    return (
      `<Note id=${this.id} pitch=${Math.round(this.pitch)} ` +
      `start=${this.start.toFixed(3)} end=${this.end.toFixed(3)} duration=${this.duration.toFixed(3)} ` +
      `velocity=${Math.round(this.velocity)} velrange=${Math.round(this.velrange)} release=${Math.round(this.release)} ` +
      `probability=${this.probability.toFixed(3)} muted=${this.muted} deleted=${this.deleted}>`
    );
  }

  static fromLiveAPI(data: LiveAPINote): Note {
    return new Note({
      id: data.note_id,
      pitch: data.pitch,
      start: data.start_time,
      duration: data.duration,
      velocity: data.velocity,
      velrange: data.velocity_deviation,
      release: data.release_velocity,
      probability: data.probability,
      muted: !!data.mute,
    });
  }

  static listFromLiveAPI(dictionary: string): Note[] {
    const notes = JSON.parse(dictionary).notes.map(
      (n: LiveAPINote) => Note.fromLiveAPI(n),
    );
    notes.sort(
      (n1: Note, n2: Note) => n1.start - n2.start || n1.pitch - n2.pitch,
    );
    return notes;
  }

  toLiveAPI(deletionTime = 0): LiveAPINote {
    if (this.deleted || this.duration < Note.MIN_DURATION) {
      return {
        note_id: this.id,
        pitch: 0,
        start_time: deletionTime - Number(this.id) * 0.001,
        duration: 0.0009,
        velocity: 1,
        velocity_deviation: 0,
        release_velocity: 0,
        probability: 0,
        mute: 1,
      };
    } else {
      return {
        note_id: this.id,
        pitch: clamp(Math.round(this.pitch), 0, 127),
        start_time: this.start,
        duration: this.duration,
        velocity: clamp(this.velocity, 1, 127),
        velocity_deviation: clamp(this.velrange, -127, 127),
        release_velocity: clamp(this.release, 0, 127),
        probability: clamp(this.probability, 0, 1),
        mute: this.muted ? 1 : 0,
      };
    }
  }

  equals(note: Note): boolean {
    return (
      this.id === note.id &&
      this.pitch === note.pitch &&
      fuzzyEquals(this.start, note.start) &&
      fuzzyEquals(this.duration, note.duration) &&
      this.velocity === note.velocity &&
      this.velrange === note.velrange &&
      this.release === note.release &&
      fuzzyEquals(this.probability, note.probability) &&
      this.muted === note.muted &&
      this.deleted === note.deleted
    );
  }

  clone(): Note {
    return new Note(this.toJSON());
  }
}
