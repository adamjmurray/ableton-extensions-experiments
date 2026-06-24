import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getNotationData } from "./bridge.js";

// bridge.ts reads `window.__NOTATION_DATA__` in the webview context. Under
// vitest (node), `window` does not exist, so we install a minimal stand-in
// around each test and tear it down afterwards.
const g = globalThis as unknown as {
  window?: { __NOTATION_DATA__?: string; __NOTATION_DATA_URL__?: string };
  XMLHttpRequest?: new () => {
    status: number;
    responseText: string;
    open: (method: string, url: string, async: boolean) => void;
    send: () => void;
  };
};

describe("getNotationData", () => {
  const originalXMLHttpRequest = g.XMLHttpRequest;

  beforeEach(() => {
    g.window = {};
  });

  afterEach(() => {
    delete g.window;
    g.XMLHttpRequest = originalXMLHttpRequest;
  });

  it("parses a valid JSON payload from window.__NOTATION_DATA__", () => {
    const payload = {
      clips: [
        {
          notes: [{ pitch: 60, startTime: 0, duration: 1, velocity: 100 }],
          clip: {
            name: "Clip",
            trackName: "Piano",
            startMarker: 0,
            endMarker: 8,
            looping: false,
            loopStart: 0,
            loopEnd: 8,
          },
        },
      ],
      tempo: 128,
      rootNote: 2,
      scaleName: "Dorian",
      timeSignature: { numerator: 3, denominator: 4 },
    };
    g.window!.__NOTATION_DATA__ = JSON.stringify(payload);

    expect(getNotationData()).toEqual(payload);
  });

  it("returns the dummy scaffold when window.__NOTATION_DATA__ is missing", () => {
    const data = getNotationData();
    expect(data.clips).toHaveLength(1);
    expect(data.clips[0]?.notes).toEqual([]);
    expect(data.tempo).toBe(120);
    expect(data.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(data.scaleName).toBe("Major");
  });

  it("returns the dummy scaffold when JSON is malformed", () => {
    g.window!.__NOTATION_DATA__ = "{ not json";
    const data = getNotationData();
    expect(data.clips).toHaveLength(1);
    expect(data.clips[0]?.notes).toEqual([]);
    expect(data.tempo).toBe(120);
    expect(data.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(data.scaleName).toBe("Major");
  });

  it("scaffold endMarker and loopEnd default to 16 beats", () => {
    g.window!.__NOTATION_DATA__ = "garbage";
    const data = getNotationData();
    expect(data.clips[0]?.clip.endMarker).toBe(16);
    expect(data.clips[0]?.clip.loopEnd).toBe(16);
  });

  it("passes through emptyStateMessage when present", () => {
    g.window!.__NOTATION_DATA__ = JSON.stringify({
      clips: [],
      tempo: 120,
      rootNote: 0,
      scaleName: "Major",
      timeSignature: { numerator: 4, denominator: 4 },
      emptyStateMessage: "No notes in this clip.",
      lastSavedPngPath: "/tmp/notation-score-20260514-073000.png",
    });
    expect(getNotationData().emptyStateMessage).toBe("No notes in this clip.");
    expect(getNotationData().lastSavedPngPath).toBe("/tmp/notation-score-20260514-073000.png");
  });

  it("loads payload from window.__NOTATION_DATA_URL__ when inline payload is absent", () => {
    const payload = {
      clips: [],
      tempo: 90,
      rootNote: 7,
      scaleName: "Mixolydian",
      timeSignature: { numerator: 7, denominator: 8 },
    };
    const payloadText = JSON.stringify(payload);

    class MockXMLHttpRequest {
      status = 0;
      responseText = "";

      open(_method: string, _url: string, _async: boolean) {}

      send() {
        this.status = 200;
        this.responseText = payloadText;
      }
    }

    g.XMLHttpRequest = MockXMLHttpRequest;
    g.window!.__NOTATION_DATA_URL__ = "file:///tmp/notation-dialog.data.json";

    expect(getNotationData()).toEqual(payload);
  });

  it("returns scaffold when loading payload URL throws", () => {
    class MockXMLHttpRequest {
      status = 0;
      responseText = "";

      open(_method: string, _url: string, _async: boolean) {}

      send() {
        throw new Error("load failed");
      }
    }

    g.XMLHttpRequest = MockXMLHttpRequest;
    g.window!.__NOTATION_DATA_URL__ = "file:///tmp/notation-dialog.data.json";

    const data = getNotationData();
    expect(data.clips).toHaveLength(1);
    expect(data.tempo).toBe(120);
  });
});
