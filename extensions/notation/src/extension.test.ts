// Sanity checks via the SDK's TestHarness. The framework is marked
// "proof-of-concept" in the docs, so these stay deliberately shallow:
// just enough coverage to catch gross regressions in the menu wiring
// and command dispatch when we upgrade the SDK. Full behavior is
// already covered by the pure-module tests.
//
// We mock ./dialog.js so the real activate() doesn't try to import
// ./notation.html — that module only exists as a build-time virtual
// produced by esbuild's ui-html plugin.

import { describe, expect, it, vi } from "vitest";
import { TestHarness } from "@ableton/extensions-sdk/testing";

vi.mock("./dialog.js", () => ({
  showNotationDialog: vi.fn(async () => {}),
}));

import { showNotationDialog as mockedShowDialog } from "./dialog.js";
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

    expect(titlesByScope("ClipSlotSelection")).toEqual(["Render Clip(s)"]);
    expect(titlesByScope("Scene")).toEqual(["Render Scene"]);
    expect(titlesByScope("MidiTrack.ArrangementSelection")).toEqual([
      "Render Clip(s)",
      "Render Range",
    ]);
    expect(titlesByScope("MidiTrack")).toEqual([
      "Render Track (Arrangement)",
      "Render Track (Session)",
    ]);
  });

  it("routes a MidiTrack 'Render Track (Arrangement)' right-click into the dialog with the empty-state message", async () => {
    // A MIDI track with no clips should surface the "no clips" empty state.
    // We assert via the mocked dialog so the test stays independent of
    // OSMD/webview plumbing. Full rendering is covered by the pure-module
    // tests in musicxml.test.ts.
    vi.mocked(mockedShowDialog).mockClear();
    const harness = new TestHarness({
      liveSet: { tracks: [{ type: "midi", name: "Lead" }] },
    });
    await harness.activateExtension(activate);

    const track = harness.liveSet.song.tracks[0];
    expect(track).toBeDefined();
    harness.actions.rightClickAndSelect(track!.handle, "Render Track (Arrangement)");

    // Command handlers run through an async IIFE; let the microtask queue drain.
    await new Promise((r) => setTimeout(r, 0));

    expect(mockedShowDialog).toHaveBeenCalledTimes(1);
    const [, clips, emptyMessage] = vi.mocked(mockedShowDialog).mock.calls[0]!;
    expect(clips).toEqual([]);
    expect(emptyMessage).toBe("No MIDI clips on this track.");
  });
});
