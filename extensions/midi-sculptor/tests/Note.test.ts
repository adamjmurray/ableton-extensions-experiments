import { describe, it, expect } from "vitest";
import Note from "../src/Note.js";

describe("Note", () => {
  describe(".fromLiveAPI(apiData)", () => {
    it("parses the Live API data into a Note object", () => {
      const apiData = {
        note_id: 38,
        pitch: 84,
        start_time: 8,
        duration: 1.5,
        velocity: 78,
        mute: 1,
        probability: 0.5,
        velocity_deviation: -37,
        release_velocity: 41,
      };
      const note = Note.fromLiveAPI(apiData);

      expect(note.id).toBe(38);
      expect(note.pitch).toBe(84);
      expect(note.start).toBe(8);
      expect(note.duration).toBe(1.5);
      expect(note.velocity).toBe(78);
      expect(note.muted).toBe(true);
      expect(note.probability).toBe(0.5);
      expect(note.velrange).toBe(-37);
      expect(note.release).toBe(41);

      expect(note).toEqual(
        new Note({
          id: 38,
          pitch: 84,
          start: 8,
          duration: 1.5,
          velocity: 78,
          muted: true,
          probability: 0.5,
          velrange: -37,
          release: 41,
        }),
      );
    });
  });

  describe("toLiveAPI()", () => {
    it("serializes the Note into data for the Live API", () => {
      const note = new Note({
        id: 2,
        pitch: 65,
        start: 1.5,
        duration: 0.5,
        velocity: 99,
        muted: false,
        probability: 0.9,
        velrange: 10,
        release: 0,
      });
      expect(note.toLiveAPI()).toEqual({
        note_id: 2,
        pitch: 65,
        start_time: 1.5,
        duration: 0.5,
        velocity: 99,
        mute: 0,
        probability: 0.9,
        velocity_deviation: 10,
        release_velocity: 0,
      });
    });
  });

  describe("clone()", () => {
    it("creates an independent copy", () => {
      const note = new Note({ pitch: 60, start: 1, velocity: 100 });
      const clone = note.clone();
      clone.pitch = 72;
      expect(note.pitch).toBe(60);
      expect(clone.pitch).toBe(72);
    });
  });

  describe("equals()", () => {
    it("returns true for equal notes", () => {
      const a = new Note({ id: 1, pitch: 60, start: 1, duration: 0.5 });
      const b = new Note({ id: 1, pitch: 60, start: 1, duration: 0.5 });
      expect(a.equals(b)).toBe(true);
    });

    it("returns false for different notes", () => {
      const a = new Note({ pitch: 60 });
      const b = new Note({ pitch: 72 });
      expect(a.equals(b)).toBe(false);
    });
  });

  describe("soft deletion via toLiveAPI()", () => {
    it("produces muted, hidden note data for deleted notes", () => {
      const note = new Note({ id: 5, pitch: 60, start: 2, deleted: true });
      const result = note.toLiveAPI(-1);
      expect(result.mute).toBe(1);
      expect(result.pitch).toBe(0);
      expect(result.velocity).toBe(1);
      expect(result.duration).toBe(0.0009);
    });

    it("produces muted, hidden note data for notes shorter than MIN_DURATION", () => {
      const note = new Note({ id: 3, pitch: 60, start: 2, duration: 0.0001 });
      const result = note.toLiveAPI(-1);
      expect(result.mute).toBe(1);
      expect(result.pitch).toBe(0);
    });
  });
});
