import { describe, it, expect } from "vitest";
import Note from "../src/Note.js";
import SlideTransformer from "../src/transformers/SlideTransformer.js";
import type { NoteProperty, NoteOptions } from "../src/Note.js";

export function makeNotes(...values: number[]): Note[] {
  return values.map(
    (val) => new Note({ start: val, pitch: val, velocity: val, duration: val }),
  );
}

export function cloneAll(notes: Note[]): Note[] {
  return notes.map((n) => n.clone());
}

export const defaultClip = Object.freeze({ start: 0, end: 16, length: 16 });

interface SlideTestParams {
  operation?: string;
  noteProperty?: string;
  notes?: Note[];
  input?: number[];
  range?: number;
  amount?: number;
  edgeBehavior?: string;
  anchor?: string;
  unlockEnd?: boolean;
  tension?: number;
  clip?: { start: number; end: number; length?: number };
  expected?: any[];
  description?: string;
  skip?: boolean;
  only?: boolean;
}

function describeSlideTransformerTest(test: SlideTestParams): string {
  const { description, range, amount, edgeBehavior, anchor, unlockEnd, tension, clip } = test;
  const baseDescription = description || `${test.operation}s the ${test.noteProperty} as expected`;
  return `${baseDescription} for ${Object.entries({ range, amount, edgeBehavior, anchor, unlockEnd, tension, clip })
    .filter(([_, value]) => value != null)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join(", ")}`;
}

function setupSlideTransformer(test: SlideTestParams): SlideTransformer {
  const { notes, input, noteProperty, range, edgeBehavior, anchor, unlockEnd, tension, clip } =
    test;
  const slideTransformer = new SlideTransformer();
  slideTransformer.notes =
    notes || input!.map((value) => new Note({ [noteProperty!]: value } as NoteOptions));
  slideTransformer.setRange(noteProperty as any, range!);
  if (edgeBehavior) {
    slideTransformer.edgeBehavior = edgeBehavior;
  }
  if (anchor) {
    slideTransformer.spreadAnchor = anchor as any;
  }
  if (unlockEnd) {
    slideTransformer.strumUnlockEnd = unlockEnd;
  }
  if (tension) {
    slideTransformer.tension = tension;
  }
  const c = clip ? { ...clip, length: clip.length ?? clip.end - clip.start } : { ...defaultClip };
  slideTransformer.clip = c;
  return slideTransformer;
}

export function runSlideTransformerTests(
  operation: string,
  testCases: Record<string, SlideTestParams[]>,
): void {
  Object.entries(testCases).forEach(([noteProperty, tests]) => {
    describe(`${operation}('${noteProperty}', amount)`, () => {
      it("is idempotent", () => {
        const test: SlideTestParams = { operation, noteProperty, ...tests[0]! };
        const slideTransformer = setupSlideTransformer(test);
        const inputNotes = test.input!.map(
          (value) => new Note({ [noteProperty]: value } as NoteOptions),
        );

        const actualNotes1 = (slideTransformer as any)
          [operation](noteProperty, test.amount)
          .map((note: Note) => note.clone());
        const actualNotes2 = (slideTransformer as any)[operation](noteProperty, test.amount);

        expect(actualNotes1).not.toEqual(inputNotes);
        expect(actualNotes1).toEqual(actualNotes2);
      });

      tests.forEach((testParams) => {
        const test: SlideTestParams = { operation, noteProperty, ...testParams };
        const runTest = testParams.skip ? it.skip : testParams.only ? it.only : it;

        runTest(describeSlideTransformerTest(test), () => {
          const slideTransformer = setupSlideTransformer(test);
          const expectedNotes = test.expected!.map((value: any) => {
            return new Note(value instanceof Object ? value : ({ [noteProperty]: value } as NoteOptions));
          });
          const actualNotes = (slideTransformer as any)[operation](noteProperty, test.amount);
          expect(actualNotes).toEqual(expectedNotes);
        });
      });
    });
  });
}

export function runStrumTests(testCases: Record<string, SlideTestParams[]>): void {
  const operation = "strum";

  Object.entries(testCases).forEach(([noteProperty, tests]) => {
    describe(`${operation}('${noteProperty}', amount)`, () => {
      it("is idempotent", () => {
        const notes = (tests[0]! as any).notes.map(
          (noteParams: NoteOptions) => new Note(noteParams),
        );
        const test: SlideTestParams = { operation, ...tests[0]!, notes };
        const slideTransformer = setupSlideTransformer({ ...test, noteProperty: "strum" });

        const actualNotes1 = slideTransformer
          .strum(noteProperty, test.amount!)!
          .map((note) => note.clone());
        const actualNotes2 = slideTransformer.strum(noteProperty, test.amount!);

        expect(actualNotes1).not.toEqual(tests);
        expect(actualNotes1).toEqual(actualNotes2);
      });

      tests.forEach((testParams) => {
        const notes = (testParams as any).notes.map(
          (noteParams: NoteOptions) => new Note(noteParams),
        );
        const test: SlideTestParams = { operation, noteProperty, ...testParams, notes };
        const runTest = testParams.skip ? it.skip : testParams.only ? it.only : it;

        runTest(describeSlideTransformerTest(test), () => {
          const slideTransformer = setupSlideTransformer({ ...test, noteProperty: "strum" });
          const expectedNotes = test.expected!.map((value: any, index: number) => {
            if (value instanceof Object) {
              return new Note({
                ...notes[index]?.toJSON(),
                ...value,
              });
            } else {
              return new Note({
                ...notes[index]?.toJSON(),
                [noteProperty]: value,
              });
            }
          });
          const actualNotes = slideTransformer.strum(noteProperty, test.amount!);
          expect(actualNotes).toEqual(expectedNotes);
        });
      });
    });
  });
}
