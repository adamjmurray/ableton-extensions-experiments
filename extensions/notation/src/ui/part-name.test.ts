import { describe, expect, it } from "vitest";
import {
  assignUnnamedIndices,
  buildFullPartName,
  MAX_PART_NAME_LENGTH,
  truncatePartName,
} from "./part-name.js";
import type { ClipData, NotationData } from "./bridge.js";

function makeClip(overrides: Partial<ClipData["clip"]> = {}): ClipData {
  return {
    notes: [],
    clip: {
      name: "",
      trackName: "",
      startMarker: 0,
      endMarker: 8,
      looping: false,
      loopStart: 0,
      loopEnd: 8,
      ...overrides,
    },
  };
}

function makeData(clips: ClipData[]): NotationData {
  return {
    clips,
    tempo: 120,
    rootNote: 0,
    scaleName: "Major",
    timeSignature: { numerator: 4, denominator: 4 },
  };
}

describe("buildFullPartName", () => {
  it("combines track and label as '[Track] Label' when both are set", () => {
    expect(buildFullPartName("Piano", "Verse", 0)).toBe("[Piano] Verse");
  });

  it("uses bare '[Track]' when label is blank", () => {
    expect(buildFullPartName("Piano", "", 0)).toBe("[Piano]");
  });

  it("returns the label alone when track is blank", () => {
    expect(buildFullPartName("", "Verse", 0)).toBe("Verse");
  });

  it("falls back to 'Part N' (1-based) when both are blank", () => {
    expect(buildFullPartName("", "", 0)).toBe("Part 1");
    expect(buildFullPartName("", "", 3)).toBe("Part 4");
  });

  it("treats whitespace-only inputs as blank", () => {
    expect(buildFullPartName("   ", "  ", 2)).toBe("Part 3");
    expect(buildFullPartName("   ", "Verse", 0)).toBe("Verse");
    expect(buildFullPartName("Piano", "   ", 0)).toBe("[Piano]");
  });

  it("trims surrounding whitespace on the label", () => {
    expect(buildFullPartName("Piano", "  Verse  ", 0)).toBe("[Piano] Verse");
  });

  it("tolerates undefined-coerced track name (Ableton may produce this at runtime)", () => {
    // Matches the `trackName ?? ""` guard; cast-through just to stress the
    // runtime coercion path.
    expect(buildFullPartName(undefined as unknown as string, "Verse", 0)).toBe("Verse");
  });
});

describe("truncatePartName", () => {
  it("returns strings at or below the limit unchanged", () => {
    const short = "x".repeat(MAX_PART_NAME_LENGTH);
    expect(truncatePartName(short)).toBe(short);
    expect(truncatePartName("Piano")).toBe("Piano");
  });

  it("truncates longer strings and appends an ellipsis", () => {
    const long = "x".repeat(MAX_PART_NAME_LENGTH + 10);
    const result = truncatePartName(long);
    expect(result).toHaveLength(MAX_PART_NAME_LENGTH);
    expect(result.endsWith("…")).toBe(true);
  });

  it("two full names with a shared prefix collide on truncation", () => {
    const shared = "[Longer Track Name Here] Verse ";
    const a = shared + "Alpha";
    const b = shared + "Beta";
    // Both exceed the limit; their truncations are identical — which is what
    // forces app.tsx to show both candidates in the tooltip.
    expect(a.length).toBeGreaterThan(MAX_PART_NAME_LENGTH);
    expect(b.length).toBeGreaterThan(MAX_PART_NAME_LENGTH);
    expect(truncatePartName(a)).toBe(truncatePartName(b));
  });
});

describe("assignUnnamedIndices", () => {
  it("assigns 1-based indices only to clips with no name AND no track name", () => {
    const data = makeData([
      makeClip({ name: "Clip A", trackName: "" }),
      makeClip({ name: "", trackName: "" }),
      makeClip({ name: "", trackName: "Piano" }),
      makeClip({ name: "", trackName: "" }),
    ]);
    assignUnnamedIndices(data);
    expect(data.clips.map((c) => c.clip.unnamedIndex)).toEqual([
      undefined,
      1,
      undefined,
      2,
    ]);
  });

  it("treats whitespace-only names and track names as blank", () => {
    const data = makeData([
      makeClip({ name: "   ", trackName: "   " }),
      makeClip({ name: "\t", trackName: "" }),
    ]);
    assignUnnamedIndices(data);
    expect(data.clips.map((c) => c.clip.unnamedIndex)).toEqual([1, 2]);
  });

  it("returns the same NotationData reference it was given (mutates in place)", () => {
    const data = makeData([makeClip({ name: "", trackName: "" })]);
    expect(assignUnnamedIndices(data)).toBe(data);
  });

  it("preserves existing unnamedIndex on named clips (no-op path leaves the property alone)", () => {
    const data = makeData([
      makeClip({ name: "Clip A", trackName: "", unnamedIndex: 99 }),
    ]);
    assignUnnamedIndices(data);
    expect(data.clips[0]!.clip.unnamedIndex).toBe(99);
  });

  it("counts only unnamed clips; named clips don't bump the sequence", () => {
    const data = makeData([
      makeClip({ name: "", trackName: "" }),
      makeClip({ name: "A", trackName: "" }),
      makeClip({ name: "B", trackName: "" }),
      makeClip({ name: "", trackName: "" }),
    ]);
    assignUnnamedIndices(data);
    expect(data.clips.map((c) => c.clip.unnamedIndex)).toEqual([1, undefined, undefined, 2]);
  });

  it("no-ops on an empty clip list", () => {
    const data = makeData([]);
    expect(() => assignUnnamedIndices(data)).not.toThrow();
    expect(data.clips).toEqual([]);
  });
});
