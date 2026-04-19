// Sanity checks via the SDK's TestHarness, mirroring the notation
// extension's shallow smoke test. Deliberately narrow: enough to catch
// gross regressions in the menu wiring when we bump the SDK. The
// per-module behavior (transforms, variations, rng, apply, helpers)
// is covered by its own unit tests.
//
// `./mutate-dialog.html` is a build-time virtual produced by esbuild's
// ui-html plugin, so we stub it out here so activate() can import it
// when vitest runs outside the esbuild pipeline.

import { TestHarness } from "@ableton/extensions-sdk/testing";
import { describe, expect, it, vi } from "vitest";

vi.mock("./mutate-dialog.html", () => ({ default: "<!doctype html></head>" }));

import { activate } from "./extension.js";

describe("activate", () => {
  it("registers every expected context menu action", async () => {
    const harness = new TestHarness({ liveSet: { tempo: 120 } });
    await harness.activateExtension(activate);

    const titlesByScope = (scope: string) =>
      harness.actions
        .getContextMenuActions(scope)
        .map((a) => a.title)
        .sort();

    expect(titlesByScope("MidiClip")).toEqual([]);
    expect(titlesByScope("Scene")).toEqual(["Scene..."]);
    expect(titlesByScope("ClipSlotSelection")).toEqual([
      "Clip(s)...",
      "Delete Notes (10% chance per note)",
      "Randomize Velocity (±15)",
      "Swap Notes (25% chance per note)",
    ]);
    expect(titlesByScope("MidiTrack.ArrangementSelection")).toEqual([
      "Clip(s)...",
      "Delete Notes (10% chance per note)",
      "Randomize Velocity (±15)",
      "Swap Notes (25% chance per note)",
    ]);
    expect(titlesByScope("MidiTrack")).toEqual(["Track (Arrangement)", "Track (Session)"]);
  });
});
