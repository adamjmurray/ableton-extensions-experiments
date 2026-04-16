import { describe, it, expect, beforeEach } from "vitest";
import Note from "../../src/Note.js";
import SwapTransformer from "../../src/transformers/SwapTransformer.js";
import { makeNotes, cloneAll } from "../helpers.js";

describe("SwapTransformer", () => {
  let swapTransformer: SwapTransformer;
  let notes: Note[];

  beforeEach(() => {
    swapTransformer = new SwapTransformer();
  });

  describe("rotate(amount)", () => {
    beforeEach(() => {
      notes = makeNotes(1, 2, 3, 4);
      swapTransformer.notes = notes;
    });

    it("rotates forward through the note list when given a positive percentage value", () => {
      const expected = cloneAll(notes.slice(-1).concat(notes.slice(0, -1)));
      expected.forEach((note, index) => (note.start = notes[index]!.start));
      expect(swapTransformer.rotate(1 / notes.length)).toEqual(expected);
    });

    it("rotates backwards through the note list when given a negative percentage value", () => {
      const expected = cloneAll(notes.slice(1).concat(notes.slice(0, 1)));
      expected.forEach((note, index) => (note.start = notes[index]!.start));
      expect(swapTransformer.rotate(-1 / notes.length)).toEqual(expected);
    });

    it("is idempotent", () => {
      const expected = cloneAll(notes.slice(-1).concat(notes.slice(0, -1)));
      expected.forEach((note, index) => (note.start = notes[index]!.start));
      const actual1 = swapTransformer.rotate(1 / notes.length);
      expect(actual1).toEqual(expected);
      const actual2 = swapTransformer.rotate(1 / notes.length);
      expect(actual2).toEqual(expected);
    });

    it("can rotate more than one position", () => {
      const expected = cloneAll(notes.slice(-3).concat(notes.slice(0, -3)));
      expected.forEach((note, index) => (note.start = notes[index]!.start));
      const actual = swapTransformer.rotate(3 / notes.length);
      expect(actual).toEqual(expected);
    });

    it("can rotate with a value > notes.length and wraps around", () => {
      const expected = cloneAll(notes.slice(-3).concat(notes.slice(0, -3)));
      expected.forEach((note, index) => (note.start = notes[index]!.start));
      const actual = swapTransformer.rotate(1 + 3 / notes.length);
      expect(actual).toEqual(expected);
    });

    it("can rotate with a value < -notes.length and wraps around", () => {
      const expected = cloneAll(notes.slice(3).concat(notes.slice(0, 3)));
      expected.forEach((note, index) => (note.start = notes[index]!.start));
      const actual = swapTransformer.rotate(-1 - 3 / notes.length);
      expect(actual).toEqual(expected);
    });
  });
});
