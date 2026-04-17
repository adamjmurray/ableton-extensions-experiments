import { describe, expect, test } from "vitest";
import { getClipRenderRegion, notesToMusicXML, sortClipsForScore } from "./musicxml.js";
import type { ClipData, NoteData } from "./bridge.js";

function note(pitch: number, startTime: number, duration: number, velocity = 100): NoteData {
  return { pitch, startTime, duration, velocity };
}

function clip(notes: NoteData[], overrides: Partial<ClipData["clip"]> = {}): ClipData {
  return {
    notes,
    clip: {
      name: "",
      trackName: "",
      startMarker: 0,
      endMarker: 4,
      looping: false,
      loopStart: 0,
      loopEnd: 4,
      ...overrides,
    },
  };
}

const TS_4_4 = { numerator: 4, denominator: 4 };

describe("notesToMusicXML", () => {
  test("emits a well-formed partwise score", () => {
    const xml = notesToMusicXML([clip([note(60, 0, 1)])], TS_4_4, 0, "Major");
    expect(xml).toContain("<?xml");
    expect(xml).toContain("<score-partwise");
    expect(xml).toContain("</score-partwise>");
  });

  test("C major key signature", () => {
    const xml = notesToMusicXML([clip([note(60, 0, 1)])], TS_4_4, 0, "Major");
    expect(xml).toContain("<fifths>0</fifths>");
    expect(xml).toContain("<mode>major</mode>");
  });

  test("A minor key signature", () => {
    const xml = notesToMusicXML([clip([note(69, 0, 1)])], TS_4_4, 9, "Minor");
    expect(xml).toContain("<fifths>0</fifths>");
    expect(xml).toContain("<mode>minor</mode>");
  });

  test("sharp keys render accidentals as sharps", () => {
    // G major: fifths=1. MIDI 66 = F#
    const xml = notesToMusicXML([clip([note(66, 0, 1)])], TS_4_4, 7, "Major");
    expect(xml).toContain("<fifths>1</fifths>");
    expect(xml).toMatch(/<step>F<\/step>\s*<alter>1<\/alter>/);
  });

  test("flat keys render accidentals as flats", () => {
    // F major: fifths=-1. MIDI 70 = Bb
    const xml = notesToMusicXML([clip([note(70, 0, 1)])], TS_4_4, 5, "Major");
    expect(xml).toContain("<fifths>-1</fifths>");
    expect(xml).toMatch(/<step>B<\/step>\s*<alter>-1<\/alter>/);
  });

  // AJM-186: key signature derivation from Live's rootNote + scaleName.
  // Each case asserts the expected <fifths> and <mode> values produced by the
  // SCALE_TABLE lookup in musicxml.ts. Modal scales share their relative
  // major's signature; exotic/unknown scales fall back to 0 fifths + major.
  describe("key signature derivation", () => {
    function keySig(rootNote: number, scaleName: string) {
      const xml = notesToMusicXML([clip([note(60, 0, 1)])], TS_4_4, rootNote, scaleName);
      const fifths = xml.match(/<fifths>(-?\d+)<\/fifths>/)?.[1];
      const mode = xml.match(/<mode>(\w+)<\/mode>/)?.[1];
      return { fifths, mode };
    }

    test("diatonic modes with C-major parent render as 0 fifths", () => {
      expect(keySig(2, "Dorian")).toEqual({ fifths: "0", mode: "minor" });
      expect(keySig(4, "Phrygian")).toEqual({ fifths: "0", mode: "minor" });
      expect(keySig(5, "Lydian")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(7, "Mixolydian")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(11, "Locrian")).toEqual({ fifths: "0", mode: "minor" });
    });

    test("diatonic modes transpose correctly off C", () => {
      // A Dorian → G major (1 sharp)
      expect(keySig(9, "Dorian")).toEqual({ fifths: "1", mode: "minor" });
      // E Dorian → D major (2 sharps)
      expect(keySig(4, "Dorian")).toEqual({ fifths: "2", mode: "minor" });
      // Bb Mixolydian → Eb major (3 flats)
      expect(keySig(10, "Mixolydian")).toEqual({ fifths: "-3", mode: "major" });
      // F# Lydian → enharmonic Db/C# major; table resolves to Db major (-5 flats)
      expect(keySig(6, "Lydian")).toEqual({ fifths: "-5", mode: "major" });
    });

    test("harmonic and melodic minor share natural minor key signature", () => {
      // C harmonic / melodic minor → Eb major (3 flats)
      expect(keySig(0, "Harmonic Minor")).toEqual({ fifths: "-3", mode: "minor" });
      expect(keySig(0, "Melodic Minor")).toEqual({ fifths: "-3", mode: "minor" });
      expect(keySig(0, "Hungarian Minor")).toEqual({ fifths: "-3", mode: "minor" });
    });

    test("pentatonic and blues scales share parent diatonic signature", () => {
      // A minor pentatonic → C major (0 fifths), mode minor
      expect(keySig(9, "Minor Pentatonic")).toEqual({ fifths: "0", mode: "minor" });
      // C major pentatonic → C major (0 fifths)
      expect(keySig(0, "Major Pentatonic")).toEqual({ fifths: "0", mode: "major" });
      // C minor blues → Eb major (3 flats), mode minor
      expect(keySig(0, "Minor Blues")).toEqual({ fifths: "-3", mode: "minor" });
    });

    test("modes of melodic minor approximate to closest diatonic mode", () => {
      // F Lydian Augmented / Dominant → C major (0 fifths)
      expect(keySig(5, "Lydian Augmented")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(5, "Lydian Dominant")).toEqual({ fifths: "0", mode: "major" });
      // B Super Locrian → C major (0 fifths)
      expect(keySig(11, "Super Locrian")).toEqual({ fifths: "0", mode: "minor" });
    });

    test("modes of harmonic minor approximate to closest diatonic mode", () => {
      // D Dorian #4 → C major (0 fifths), shares Dorian's key sig
      expect(keySig(2, "Dorian #4")).toEqual({ fifths: "0", mode: "minor" });
      // E Phrygian Dominant → C major (0 fifths); major 3rd → mode major
      expect(keySig(4, "Phrygian Dominant")).toEqual({ fifths: "0", mode: "major" });
    });

    test("exotic scales fall back to 0 fifths with major mode", () => {
      expect(keySig(0, "Whole Tone")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(2, "Half-whole Dim.")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(2, "Whole-half Dim.")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(4, "8-Tone Spanish")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(0, "Bhairav")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(0, "Hirajoshi")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(0, "In-Sen")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(0, "Iwato")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(0, "Kumoi")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(0, "Pelog Selisir")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(0, "Pelog Tembung")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(0, "Messiaen 3")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(0, "Messiaen 7")).toEqual({ fifths: "0", mode: "major" });
    });

    test("unknown scale names fall back to 0 fifths with major mode", () => {
      expect(keySig(7, "Bebop Dominant")).toEqual({ fifths: "0", mode: "major" });
      expect(keySig(0, "")).toEqual({ fifths: "0", mode: "major" });
    });

    test("scale name matching is case- and whitespace-insensitive", () => {
      expect(keySig(9, "  MINOR  ")).toEqual({ fifths: "0", mode: "minor" });
      expect(keySig(2, "dorian")).toEqual({ fifths: "0", mode: "minor" });
    });
  });

  test("time signature propagates to <time>", () => {
    const xml = notesToMusicXML([clip([note(60, 0, 1)])], { numerator: 3, denominator: 4 }, 0, "Major");
    expect(xml).toContain("<beats>3</beats>");
    expect(xml).toContain("<beat-type>4</beat-type>");
  });

  test("includes tempo direction when tempo > 0", () => {
    const xml = notesToMusicXML([clip([note(60, 0, 1)])], TS_4_4, 0, "Major", false, 120);
    expect(xml).toContain("<metronome");
    expect(xml).toContain("<per-minute>120</per-minute>");
  });

  test("omits tempo direction when tempo is undefined", () => {
    const xml = notesToMusicXML([clip([note(60, 0, 1)])], TS_4_4, 0, "Major");
    expect(xml).not.toContain("<metronome");
  });

  test("uses bass clef when average pitch is below middle C", () => {
    const xml = notesToMusicXML([clip([note(48, 0, 1)])], TS_4_4, 0, "Major");
    expect(xml).toContain("<sign>F</sign>");
    expect(xml).toContain("<line>4</line>");
  });

  test("uses treble clef when average pitch is at or above middle C", () => {
    const xml = notesToMusicXML([clip([note(60, 0, 1)])], TS_4_4, 0, "Major");
    expect(xml).toContain("<sign>G</sign>");
    expect(xml).toContain("<line>2</line>");
  });

  test("multi-clip produces multiple parts with distinct ids", () => {
    const xml = notesToMusicXML(
      [clip([note(60, 0, 1)]), clip([note(48, 0, 1)])],
      TS_4_4,
      0,
      "Major",
    );
    const ids = [...xml.matchAll(/<score-part id="(P\d+)">/g)].map((m) => m[1]);
    expect(ids).toEqual(["P1", "P2"]);
  });

  test("part name combines track name and clip name when both present", () => {
    const xml = notesToMusicXML(
      [clip([note(60, 0, 1)], { name: "Lead", trackName: "Synth" })],
      TS_4_4,
      0,
      "Major",
    );
    expect(xml).toContain("<part-name>[Synth] Lead</part-name>");
  });

  test("part name falls back to unnamed counter when both are blank", () => {
    const xml = notesToMusicXML([clip([note(60, 0, 1)])], TS_4_4, 0, "Major");
    expect(xml).toContain("<part-name>(unnamed 1)</part-name>");
  });

  test("part name is bare [TrackName] when clip name is empty but track name is set", () => {
    const xml = notesToMusicXML(
      [clip([note(60, 0, 1)], { name: "", trackName: "Lead" })],
      TS_4_4,
      0,
      "Major",
    );
    expect(xml).toContain("<part-name>[Lead]</part-name>");
  });

  test("empty clip still renders at least one measure with a whole rest", () => {
    const xml = notesToMusicXML([clip([])], TS_4_4, 0, "Major");
    expect(xml).toContain('<measure number="1">');
    expect(xml).toMatch(/<rest\/>[\s\S]*?<type>whole<\/type>/);
  });

  test("triplet-16th duration produces time-modification 3-in-2", () => {
    const xml = notesToMusicXML([clip([note(60, 0, 1 / 6)])], TS_4_4, 0, "Major");
    expect(xml).toContain("<time-modification>");
    expect(xml).toContain("<actual-notes>3</actual-notes>");
    expect(xml).toContain("<normal-notes>2</normal-notes>");
  });

  test("three consecutive triplets emit tuplet start/stop brackets", () => {
    const xml = notesToMusicXML(
      [clip([
        note(60, 0, 1 / 6),
        note(60, 1 / 6, 1 / 6),
        note(60, 2 / 6, 1 / 6),
      ])],
      TS_4_4,
      0,
      "Major",
    );
    expect(xml).toMatch(/<tuplet type="start"[^/]*\/>/);
    expect(xml).toMatch(/<tuplet type="stop"[^/]*\/>/);
  });

  test("note crossing a bar line is tied", () => {
    // 2-beat note starting at beat 3 of a 4/4 bar crosses into bar 2.
    const xml = notesToMusicXML(
      [clip([note(60, 3, 2)], { loopEnd: 8 })],
      TS_4_4,
      0,
      "Major",
    );
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
    expect(xml).toContain('<tied type="start"');
    expect(xml).toContain('<tied type="stop"');
  });

  test("legato extends note duration to the next onset or bar end", () => {
    // Two notes with a gap; legato should close the gap on the first note.
    const clips = [clip([note(60, 0, 0.25), note(62, 1, 0.25)], { loopEnd: 4 })];
    const legatoXml = notesToMusicXML(clips, TS_4_4, 0, "Major", true);
    const plainXml = notesToMusicXML(clips, TS_4_4, 0, "Major", false);
    // Plain output has <rest> elements (the gap). Legato output should not within the first bar.
    expect(plainXml.match(/<rest\/>/g)?.length ?? 0).toBeGreaterThan(
      legatoXml.match(/<rest\/>/g)?.length ?? 0,
    );
  });

  test("arrangement-aligned multi-clip pads earlier clips with leading rests so bar lines line up", () => {
    // Clip A starts at arrangement beat 0; Clip B starts at arrangement beat 8 (2 bars later).
    // Aligned mode should give B 2 leading whole-rest measures then its content.
    const clipA = clip([note(60, 0, 1)], { arrangementStartTime: 0, loopEnd: 4 });
    const clipB = clip([note(62, 0, 1)], { arrangementStartTime: 8, loopEnd: 4 });
    const xml = notesToMusicXML([clipA, clipB], TS_4_4, 0, "Major");

    const parts = [...xml.matchAll(/<part id="P\d+">([\s\S]*?)<\/part>/g)].map((m) => m[1] ?? "");
    expect(parts).toHaveLength(2);

    // Both parts should span the same total measure count (3).
    const measuresA = [...parts[0]!.matchAll(/<measure number="(\d+)">/g)].map((m) => Number(m[1]));
    const measuresB = [...parts[1]!.matchAll(/<measure number="(\d+)">/g)].map((m) => Number(m[1]));
    expect(measuresA).toEqual([1, 2, 3]);
    expect(measuresB).toEqual([1, 2, 3]);

    // Part B's first two measures should be whole-measure leading rests.
    const firstTwoB = parts[1]!.match(/<measure number="1">[\s\S]*?<\/measure>\s*<measure number="2">[\s\S]*?<\/measure>/)?.[0] ?? "";
    expect(firstTwoB.match(/<rest measure="yes"\/>/g)?.length).toBe(2);

    // Part A's content is in measure 1; measures 2-3 are trailing rests.
    const firstMeasureA = parts[0]!.match(/<measure number="1">[\s\S]*?<\/measure>/)?.[0] ?? "";
    expect(firstMeasureA).toMatch(/<pitch>\s*<step>C<\/step>/);
  });
});

describe("getClipRenderRegion", () => {
  test("unlooped clip: filterStart = startMarker, renderEnd = loopEnd", () => {
    const region = getClipRenderRegion(
      { startMarker: 0, loopStart: 0, loopEnd: 4, looping: false },
      4,
    );
    expect(region).toEqual({ filterStart: 0, renderEnd: 4, renderStart: 0, barCount: 1 });
  });

  test("unlooped clip with mid-bar startMarker: renderStart floors to previous bar", () => {
    // startMarker at beat 2 of a 4/4 bar → renderStart=0, barCount covers [0, loopEnd].
    const region = getClipRenderRegion(
      { startMarker: 2, loopStart: 0, loopEnd: 4, looping: false },
      4,
    );
    expect(region.filterStart).toBe(2);
    expect(region.renderEnd).toBe(4);
    expect(region.renderStart).toBe(0);
    expect(region.barCount).toBe(1);
  });

  test("looped clip with loopStart < startMarker: filterStart = loopStart", () => {
    const region = getClipRenderRegion(
      { startMarker: 4, loopStart: 0, loopEnd: 8, looping: true },
      4,
    );
    // filterStart = min(0, 4) = 0; renderEnd = loopEnd = 8; barCount covers 2 bars.
    expect(region.filterStart).toBe(0);
    expect(region.renderEnd).toBe(8);
    expect(region.renderStart).toBe(0);
    expect(region.barCount).toBe(2);
  });

  test("looped clip with loopStart >= startMarker: filterStart = startMarker", () => {
    const region = getClipRenderRegion(
      { startMarker: 0, loopStart: 2, loopEnd: 6, looping: true },
      4,
    );
    // filterStart = min(2, 0) = 0; renderEnd = 6; renderStart = 0; barCount = ceil(6/4) = 2.
    expect(region.filterStart).toBe(0);
    expect(region.renderEnd).toBe(6);
    expect(region.renderStart).toBe(0);
    expect(region.barCount).toBe(2);
  });

  test("partial-bar clip length rounds up to a whole bar", () => {
    // Length 3.5 beats in 4/4 → 1 bar (ceil).
    const region = getClipRenderRegion(
      { startMarker: 0, loopStart: 0, loopEnd: 3.5, looping: false },
      4,
    );
    expect(region.barCount).toBe(1);
  });

  test("multi-bar clip rounds up partial-bar tail", () => {
    // Length 5.5 beats in 4/4 → 2 bars (ceil).
    const region = getClipRenderRegion(
      { startMarker: 0, loopStart: 0, loopEnd: 5.5, looping: false },
      4,
    );
    expect(region.barCount).toBe(2);
  });

  test("zero-length clip still renders at least 1 bar", () => {
    const region = getClipRenderRegion(
      { startMarker: 0, loopStart: 0, loopEnd: 0, looping: false },
      4,
    );
    expect(region.barCount).toBe(1);
  });

  test("3/4 time signature uses beatsPerMeasure=3", () => {
    // 6 beats of content in 3/4 → 2 bars.
    const region = getClipRenderRegion(
      { startMarker: 0, loopStart: 0, loopEnd: 6, looping: false },
      3,
    );
    expect(region.barCount).toBe(2);
    expect(region.renderStart).toBe(0);
  });
});

describe("sortClipsForScore", () => {
  // Each clip is tagged with a unique name so we can assert order by name
  // rather than by object identity.
  function namedClip(name: string, pitches: number[], trackIndex?: number): ClipData {
    const notes = pitches.map((p, i) => note(p, i, 1));
    const overrides: Partial<ClipData["clip"]> = { name };
    if (trackIndex !== undefined) overrides.trackIndex = trackIndex;
    return clip(notes, overrides);
  }

  function names(result: ClipData[]): string[] {
    return result.map((c) => c.clip.name);
  }

  test("pitch mode puts treble above bass regardless of input order", () => {
    const bass = namedClip("bass", [36, 40, 43]);   // avg 39.67 → F clef
    const lead = namedClip("lead", [72, 74, 76]);   // avg 74 → G clef
    expect(names(sortClipsForScore([bass, lead], "pitch"))).toEqual(["lead", "bass"]);
    expect(names(sortClipsForScore([lead, bass], "pitch"))).toEqual(["lead", "bass"]);
  });

  test("pitch mode sorts descending within the same clef tier", () => {
    const low = namedClip("low", [60, 62, 64]);    // avg 62
    const mid = namedClip("mid", [67, 69, 71]);    // avg 69
    const high = namedClip("high", [79, 81, 83]);  // avg 81
    expect(names(sortClipsForScore([low, high, mid], "pitch"))).toEqual(["high", "mid", "low"]);
  });

  test("pitch mode is stable on ties", () => {
    const a = namedClip("a", [60, 64, 67]); // avg 63.67
    const b = namedClip("b", [60, 64, 67]); // avg 63.67 (same)
    expect(names(sortClipsForScore([a, b], "pitch"))).toEqual(["a", "b"]);
    expect(names(sortClipsForScore([b, a], "pitch"))).toEqual(["b", "a"]);
  });

  test("track mode sorts by trackIndex ascending", () => {
    const t0 = namedClip("first", [60], 0);
    const t2 = namedClip("third", [60], 2);
    const t1 = namedClip("second", [60], 1);
    expect(names(sortClipsForScore([t2, t0, t1], "track"))).toEqual(["first", "second", "third"]);
  });

  test("track mode stable tiebreak preserves arrangement time order within same track", () => {
    // Two clips on track 0, then one on track 1. In "track" mode the two
    // track-0 clips must keep their input order.
    const t0a = namedClip("t0-early", [60], 0);
    const t0b = namedClip("t0-late", [60], 0);
    const t1 = namedClip("t1", [60], 1);
    expect(names(sortClipsForScore([t0a, t0b, t1], "track"))).toEqual(["t0-early", "t0-late", "t1"]);
  });

  test("track mode sinks clips without trackIndex to the end", () => {
    const t1 = namedClip("t1", [60], 1);
    const missing = namedClip("missing", [60]);
    const t0 = namedClip("t0", [60], 0);
    expect(names(sortClipsForScore([missing, t1, t0], "track"))).toEqual(["t0", "t1", "missing"]);
  });

  test("native mode preserves input order", () => {
    const a = namedClip("a", [36], 2);
    const b = namedClip("b", [84], 0);
    const c = namedClip("c", [60], 1);
    expect(names(sortClipsForScore([a, b, c], "native"))).toEqual(["a", "b", "c"]);
  });

  test("returns a new array; input is not mutated", () => {
    const input = [namedClip("bass", [36]), namedClip("lead", [84])];
    const snapshot = input.map((c) => c.clip.name);
    const result = sortClipsForScore(input, "pitch");
    expect(input.map((c) => c.clip.name)).toEqual(snapshot);
    expect(result).not.toBe(input);
  });

  test("single-clip input is returned as a shallow copy in all modes", () => {
    const single = [namedClip("only", [60], 0)];
    for (const mode of ["pitch", "track", "native"] as const) {
      const result = sortClipsForScore(single, mode);
      expect(result).not.toBe(single);
      expect(result).toEqual(single);
    }
  });
});
