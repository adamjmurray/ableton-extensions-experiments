import { describe, expect, it } from "vitest";
import type { MidiClip } from "@ableton/extensions-sdk";
import {
  beatsPerMeasure,
  buildFlattenedClipInfo,
  buildRangeClipInfo,
  computeArrangementRange,
  findOverlap,
  nameSuggestsDrums,
  readMidiClip,
  shiftClipNotes,
  type ClipInfo,
} from "./clip-utils.js";

function makeClipInfo(
  notes: ClipInfo["notes"],
  overrides: Partial<ClipInfo["clip"]> = {},
): ClipInfo {
  return {
    notes,
    clip: {
      name: "",
      trackName: "",
      startMarker: 0,
      endMarker: 16,
      looping: false,
      loopStart: 0,
      loopEnd: 16,
      ...overrides,
    },
  };
}

describe("beatsPerMeasure", () => {
  it("returns 4 for 4/4", () => {
    expect(beatsPerMeasure({ numerator: 4, denominator: 4 })).toBe(4);
  });

  it("returns 3 for 3/4", () => {
    expect(beatsPerMeasure({ numerator: 3, denominator: 4 })).toBe(3);
  });

  it("returns 3 for 6/8", () => {
    expect(beatsPerMeasure({ numerator: 6, denominator: 8 })).toBe(3);
  });

  it("returns 1.5 for 3/8", () => {
    expect(beatsPerMeasure({ numerator: 3, denominator: 8 })).toBe(1.5);
  });

  it("returns 7 for 7/4", () => {
    expect(beatsPerMeasure({ numerator: 7, denominator: 4 })).toBe(7);
  });
});

describe("nameSuggestsDrums", () => {
  it.each([
    ["Drums", true],
    ["DRUMS", true],
    ["drums 1", true],
    ["808 Kit", true],
    ["Acoustic kit", true],
    ["Bass", false],
    ["Piano", false],
    ["", false],
    ["Lead Synth", false],
  ])("nameSuggestsDrums(%j) -> %s", (name, expected) => {
    expect(nameSuggestsDrums(name)).toBe(expected);
  });
});

describe("shiftClipNotes", () => {
  const info = makeClipInfo([
    { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
    { pitch: 62, startTime: 4, duration: 1, velocity: 100 },
    { pitch: 64, startTime: 8, duration: 1, velocity: 100 },
    { pitch: 65, startTime: 12, duration: 1, velocity: 100 },
  ]);

  it("drops notes before filterStart and at/after renderEnd", () => {
    const shifted = shiftClipNotes(info, 4, 12, 0);
    expect(shifted.map((n) => n.startTime)).toEqual([4, 8]);
  });

  it("translates surviving notes by shift", () => {
    const shifted = shiftClipNotes(info, 4, 12, 10);
    expect(shifted.map((n) => n.startTime)).toEqual([14, 18]);
  });

  it("returns empty when filter window excludes all notes", () => {
    expect(shiftClipNotes(info, 100, 200, 0)).toEqual([]);
  });

  it("preserves note fields other than startTime", () => {
    const [n] = shiftClipNotes(info, 0, 2, 5);
    expect(n).toEqual({ pitch: 60, startTime: 5, duration: 1, velocity: 100 });
  });

  it("treats filterStart as inclusive and renderEnd as exclusive", () => {
    const edge = makeClipInfo([
      { pitch: 60, startTime: 4, duration: 1, velocity: 100 },
      { pitch: 62, startTime: 12, duration: 1, velocity: 100 },
    ]);
    const shifted = shiftClipNotes(edge, 4, 12, 0);
    expect(shifted.map((n) => n.startTime)).toEqual([4]);
  });
});

describe("buildFlattenedClipInfo", () => {
  it("wraps notes in a synthetic envelope covering the whole range", () => {
    const notes = [{ pitch: 60, startTime: 0, duration: 1, velocity: 100 }];
    const info = buildFlattenedClipInfo("Drums", false, notes, 32);
    expect(info).toEqual({
      notes,
      clip: {
        name: "",
        trackName: "Drums",
        startMarker: 0,
        endMarker: 32,
        looping: false,
        loopStart: 0,
        loopEnd: 32,
      },
    });
  });

  it("sets isDrumRack when requested", () => {
    const info = buildFlattenedClipInfo("Drums", true, [], 16);
    expect(info.isDrumRack).toBe(true);
  });

  it("omits isDrumRack when false", () => {
    const info = buildFlattenedClipInfo("Piano", false, [], 16);
    expect(info.isDrumRack).toBeUndefined();
  });
});

describe("buildRangeClipInfo", () => {
  it("sets startMarker to leadingOffset so sub-bar offsets render as leading rest", () => {
    const info = buildRangeClipInfo("Lead", 2, false, [], 1.5, 16);
    expect(info.clip.startMarker).toBe(1.5);
    expect(info.clip.endMarker).toBe(16);
    expect(info.clip.loopEnd).toBe(16);
    expect(info.clip.trackIndex).toBe(2);
  });

  it("omits trackIndex when undefined", () => {
    const info = buildRangeClipInfo("Lead", undefined, false, [], 0, 16);
    expect(info.clip.trackIndex).toBeUndefined();
  });

  it("sets isDrumRack when requested", () => {
    const info = buildRangeClipInfo("Drums", 0, true, [], 0, 16);
    expect(info.isDrumRack).toBe(true);
  });
});

describe("readMidiClip", () => {
  // Duck-typed stand-in; readMidiClip coerces everything with Number()/String()/Boolean()
  // so any object with the right property names works.
  function fakeClip(overrides: Partial<Record<string, unknown>> = {}): MidiClip<any> {
    return {
      name: "Clip A",
      startMarker: 0,
      endMarker: 8,
      looping: false,
      loopStart: 0,
      loopEnd: 8,
      notes: [
        { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      ],
      ...overrides,
    } as unknown as MidiClip<any>;
  }

  it("extracts notes and clip envelope", () => {
    const info = readMidiClip(fakeClip(), "Piano", false);
    expect(info).toEqual({
      notes: [{ pitch: 60, startTime: 0, duration: 1, velocity: 100 }],
      clip: {
        name: "Clip A",
        trackName: "Piano",
        startMarker: 0,
        endMarker: 8,
        looping: false,
        loopStart: 0,
        loopEnd: 8,
      },
    });
  });

  it("coerces BigInt property values with Number()", () => {
    const info = readMidiClip(
      fakeClip({
        startMarker: 2n,
        endMarker: 16n,
        loopStart: 0n,
        loopEnd: 16n,
        notes: [{ pitch: 60n, startTime: 1n, duration: 2n, velocity: 90n }],
      }),
      "Piano",
      false,
    );
    expect(info.clip.startMarker).toBe(2);
    expect(info.clip.endMarker).toBe(16);
    expect(info.notes[0]).toEqual({ pitch: 60, startTime: 1, duration: 2, velocity: 90 });
  });

  it("defaults velocity to 64 when missing", () => {
    const info = readMidiClip(
      fakeClip({ notes: [{ pitch: 60, startTime: 0, duration: 1 }] }),
      "Piano",
      false,
    );
    expect(info.notes[0]!.velocity).toBe(64);
  });

  it("sets isDrumRack only when the flag is true", () => {
    expect(readMidiClip(fakeClip(), "Piano", false).isDrumRack).toBeUndefined();
    expect(readMidiClip(fakeClip(), "Drums", true).isDrumRack).toBe(true);
  });

  it("includes arrangementStartTime only when provided", () => {
    expect(readMidiClip(fakeClip(), "P", false).clip.arrangementStartTime).toBeUndefined();
    expect(readMidiClip(fakeClip(), "P", false, 12).clip.arrangementStartTime).toBe(12);
  });

  it("includes trackIndex only when provided", () => {
    expect(readMidiClip(fakeClip(), "P", false).clip.trackIndex).toBeUndefined();
    expect(readMidiClip(fakeClip(), "P", false, undefined, 3).clip.trackIndex).toBe(3);
  });

  it("coerces non-string name to string", () => {
    const info = readMidiClip(fakeClip({ name: 42 }), "Piano", false);
    expect(info.clip.name).toBe("42");
  });
});

describe("findOverlap", () => {
  it("returns undefined when placed list is empty", () => {
    expect(findOverlap([], 0, 4)).toBeUndefined();
  });

  it("finds a range that strictly contains the new range", () => {
    expect(findOverlap([{ start: 0, end: 8 }], 2, 4)).toEqual({ start: 0, end: 8 });
  });

  it("finds a range the new range strictly contains", () => {
    expect(findOverlap([{ start: 4, end: 6 }], 0, 16)).toEqual({ start: 4, end: 6 });
  });

  it("treats adjacent ranges (end == otherStart) as non-overlapping", () => {
    expect(findOverlap([{ start: 0, end: 4 }], 4, 8)).toBeUndefined();
    expect(findOverlap([{ start: 4, end: 8 }], 0, 4)).toBeUndefined();
  });

  it("detects partial overlap on the left edge", () => {
    expect(findOverlap([{ start: 2, end: 6 }], 0, 4)).toEqual({ start: 2, end: 6 });
  });

  it("detects partial overlap on the right edge", () => {
    expect(findOverlap([{ start: 0, end: 4 }], 2, 8)).toEqual({ start: 0, end: 4 });
  });

  it("returns the first match when multiple ranges overlap", () => {
    const overlap = findOverlap(
      [
        { start: 0, end: 2 },
        { start: 4, end: 10 },
        { start: 8, end: 12 },
      ],
      6,
      11,
    );
    expect(overlap).toEqual({ start: 4, end: 10 });
  });
});

describe("computeArrangementRange", () => {
  it("range aligned to a barline has zero leading offset", () => {
    expect(computeArrangementRange(8, 16, 4)).toEqual({
      anchor: 8,
      leadingOffset: 0,
      renderLength: 8,
    });
  });

  it("range starting mid-bar floors anchor to previous barline", () => {
    expect(computeArrangementRange(5, 13, 4)).toEqual({
      anchor: 4,
      leadingOffset: 1,
      renderLength: 9,
    });
  });

  it("range starting at 0 keeps anchor at 0", () => {
    expect(computeArrangementRange(0, 4, 4)).toEqual({
      anchor: 0,
      leadingOffset: 0,
      renderLength: 4,
    });
  });

  it("honors non-4 beatsPerMeasure (3/4)", () => {
    expect(computeArrangementRange(7, 13, 3)).toEqual({
      anchor: 6,
      leadingOffset: 1,
      renderLength: 7,
    });
  });

  it("sub-bar ranges entirely within one bar still produce a valid renderLength", () => {
    expect(computeArrangementRange(5, 6, 4)).toEqual({
      anchor: 4,
      leadingOffset: 1,
      renderLength: 2,
    });
  });
});
