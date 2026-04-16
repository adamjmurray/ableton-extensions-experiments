import Note from "../Note.js";
import { clamp, mod, reflectedMod } from "../utils.js";

interface ClipInfo {
  start: number;
  end: number;
  length: number;
}

type EdgeBehaviorFn = (notes: Note[], clip?: ClipInfo) => Note[];

type PropertyBehaviors = Record<string, EdgeBehaviorFn>;

const behaviors: Record<string, PropertyBehaviors> = {
  clamp: {
    pitch: (notes) => notes,
    velocity: (notes) => notes,
    start: (notes, clip) => {
      if (clip) {
        const maxStart = clip.end - Note.MIN_DURATION;
        notes.forEach((note) => (note.start = clamp(note.start, clip.start, maxStart)));
      }
      return notes;
    },
    duration: (notes, clip) => {
      if (clip) {
        notes.forEach(
          (note) =>
            (note.duration = clamp(note.duration, Note.MIN_DURATION, clip.length - note.start)),
        );
      }
      return notes;
    },
    velrange: (notes) => notes,
    release: (notes) => notes,
    probability: (notes) => notes,
    strumStart: (notes, clip) => {
      if (clip) {
        notes.forEach((note) => {
          const oldStart = note.start;
          note.start = clamp(
            note.start,
            clip.start,
            note.start + note.duration - Note.MIN_DURATION,
          );
          note.duration -= note.start - oldStart;
        });
      }
      return notes;
    },
    strumEnd: (notes, clip) => {
      if (clip) {
        notes.forEach(
          (note) =>
            (note.duration = clamp(note.duration, Note.MIN_DURATION, clip.end - note.start)),
        );
      }
      return notes;
    },
  },

  rotate: {
    pitch: (notes) => {
      notes.forEach((note) => (note.pitch = mod(note.pitch, 128)));
      return notes;
    },
    velocity: (notes) => {
      notes.forEach((note) => (note.velocity = mod(note.velocity, 128)));
      return notes;
    },
    start: (notes, clip) => {
      if (clip) {
        notes.forEach((note) => {
          const relativeStart = note.start - clip.start;
          note.start = mod(relativeStart, clip.length) + clip.start;
        });
      }
      return notes;
    },
    duration: (notes, clip) => {
      if (clip) {
        notes.forEach((note) => {
          note.duration = mod(note.duration, clip.length);
          note.duration = Math.max(note.duration, Note.MIN_DURATION);
        });
      }
      return notes;
    },
    velrange: (notes) => {
      notes.forEach((note) => (note.velrange = mod(note.velrange + 127, 255) - 127));
      return notes;
    },
    release: (notes) => {
      notes.forEach((note) => (note.release = mod(note.release, 128)));
      return notes;
    },
    probability: (notes) => {
      notes.forEach((note) => (note.probability = mod(note.probability, 1.0)));
      return notes;
    },
    strumStart: (notes, clip) => {
      if (clip) {
        notes.forEach((note) => {
          const oldStart = note.start;
          const relativeStart = note.start - clip.start;
          const noteEnd = note.start + note.duration;
          note.start = mod(relativeStart, noteEnd - clip.start) + clip.start;
          note.start = Math.min(note.start, noteEnd - Note.MIN_DURATION);
          note.duration -= note.start - oldStart;
        });
      }
      return notes;
    },
    strumEnd: (notes, clip) => {
      if (clip) {
        notes.forEach((note) => {
          note.duration = mod(note.duration, clip.end - note.start);
          note.duration = Math.max(note.duration, Note.MIN_DURATION);
        });
      }
      return notes;
    },
  },

  reflect: {
    pitch: (notes) => {
      notes.forEach((note) => (note.pitch = reflectedMod(note.pitch, 127)));
      return notes;
    },
    velocity: (notes) => {
      notes.forEach((note) => (note.velocity = reflectedMod(note.velocity, 127)));
      return notes;
    },
    start: (notes, clip) => {
      if (clip) {
        notes.forEach((note) => {
          const relativeStart = note.start - clip.start;
          note.start = reflectedMod(relativeStart, clip.length) + clip.start;
          note.start = Math.min(note.start, clip.end - Note.MIN_DURATION);
        });
      }
      return notes;
    },
    duration: (notes, clip) => {
      if (clip) {
        notes.forEach((note) => {
          note.duration = reflectedMod(note.duration, clip.length);
          note.duration = Math.max(note.duration, Note.MIN_DURATION);
        });
      }
      return notes;
    },
    velrange: (notes) => {
      notes.forEach((note) => (note.velrange = reflectedMod(note.velrange + 127, 254) - 127));
      return notes;
    },
    release: (notes) => {
      notes.forEach((note) => (note.release = reflectedMod(note.release, 127)));
      return notes;
    },
    probability: (notes) => {
      notes.forEach((note) => (note.probability = reflectedMod(note.probability, 1.0)));
      return notes;
    },
    strumStart: (notes, clip) => {
      if (clip) {
        notes.forEach((note) => {
          const oldStart = note.start;
          const relativeStart = note.start - clip.start;
          const noteEnd = note.start + note.duration;
          note.start = reflectedMod(relativeStart, noteEnd - clip.start) + clip.start;
          note.start = Math.min(note.start, noteEnd - Note.MIN_DURATION);
          note.duration -= note.start - oldStart;
        });
      }
      return notes;
    },
    strumEnd: (notes, clip) => {
      if (clip) {
        notes.forEach((note) => {
          note.duration = reflectedMod(note.duration, clip.end - note.start);
          note.duration = Math.max(note.duration, Note.MIN_DURATION);
        });
      }
      return notes;
    },
  },

  remove: {
    pitch: (notes) => {
      for (const note of notes) {
        note.deleted = note.pitch < 0 || note.pitch > 127;
      }
      return notes;
    },
    velocity: (notes) => {
      for (const note of notes) {
        note.deleted = note.velocity < 0;
      }
      return notes;
    },
    start: (notes) => notes,
    duration: (notes) => {
      for (const note of notes) {
        note.deleted = note.duration < Note.MIN_DURATION;
      }
      return notes;
    },
    velrange: (notes) => notes,
    release: (notes) => notes,
    probability: (notes) => {
      for (const note of notes) {
        note.deleted = note.probability < 0;
      }
      return notes;
    },
    strumStart: (notes) => {
      for (const note of notes) {
        note.deleted = note.duration < Note.MIN_DURATION;
      }
      return notes;
    },
    strumEnd: (notes) => {
      for (const note of notes) {
        note.deleted = note.duration < Note.MIN_DURATION;
      }
      return notes;
    },
  },
};

export function applyEdgeBehavior(
  behavior: string,
  property: string,
  notes: Note[],
  clip?: ClipInfo,
): Note[] | undefined {
  return behaviors[behavior]?.[property]?.(notes, clip);
}
