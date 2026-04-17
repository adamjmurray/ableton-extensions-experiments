import { describe, expect, test } from "vitest";
import { notesToMusicXML } from "../src/ui/musicxml.js";
import type { ClipData, NoteData } from "../src/ui/bridge.js";

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
