import { describe, it, expect, beforeEach } from "vitest";
import Note from "../../src/Note.js";
import SplitTransformer, { MAX_NOTES } from "../../src/transformers/SplitTransformer.js";

describe("SplitTransformer", () => {
  let splitTransformer: SplitTransformer;

  beforeEach(() => {
    splitTransformer = new SplitTransformer();
  });

  describe("split()", () => {
    describe('"note" type', () => {
      it("splits the note into the given number of notes", () => {
        splitTransformer.gate = 1;
        splitTransformer.setSplitType("note", 2);
        splitTransformer.notes = [new Note({ start: 0, duration: 1 })];
        const expected = [
          new Note({ start: 0, duration: 0.5 }),
          new Note({ start: 0.5, duration: 0.5 }),
        ];
        expect(splitTransformer.split()).toEqual(expected);
      });

      it("splits the note into the given number of notes with minimal round-off error", () => {
        splitTransformer.gate = 1;
        splitTransformer.setSplitType("note", 11);
        splitTransformer.notes = [new Note({ start: 0, duration: 3 })];
        const expected = new Array(11)
          .fill(0)
          .map((_, index) => new Note({ start: (3 / 11) * index, duration: 3 / 11 }));
        expect(splitTransformer.split()).toEqual(expected);
      });

      it("doesn't split into more than MAX_NOTES", () => {
        splitTransformer.gate = 1;
        splitTransformer.setSplitType("note", MAX_NOTES + 1);
        splitTransformer.notes = [new Note({ start: 0, duration: 1 })];
        expect(splitTransformer.split().length).toBe(MAX_NOTES);
      });
    });
  });
});
