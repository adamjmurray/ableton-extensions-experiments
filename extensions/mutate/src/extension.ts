import {
  initialize,
  ClipSlot,
  DataModelObject,
  MidiClip,
  MidiTrack,
  Scene,
  TakeLane,
  type ActivationContext,
  type ArrangementSelection,
  type ClipSlotSelection,
  type Handle,
  type NoteDescription,
} from "@ableton/extensions-sdk";

import stubInterface from "./stub.html";
import mutateClipModeHtml from "./mutate-clip-mode.html";
import { shuffleDrums, type Note as ScaffoldNote } from "./mutations.js";
import { dropNotes, swapNotes, transformVelocity, type ClipBounds, type Note } from "./transforms.js";
import { mulberry32, type Rng } from "./rng.js";
import {
  applyArrangement,
  applyRange,
  applyScene,
  applySession,
  type ArrangementSource,
  type RangeSource,
  type RangeSourceClip,
  type SceneSource,
  type SceneSourceClip,
  type SessionSource,
} from "./apply.js";
import type {
  ClipModeArrangementPayload,
  ClipModeSessionPayload,
  DialogPayload,
  DialogResult,
  RangeModePayload,
  RangeTrackSummary,
  SceneModePayload,
  SceneSourceSummary,
} from "./ui/bridge.js";

type StubDialogMode = "drums";

type MutationFn = (notes: ScaffoldNote[]) => ScaffoldNote[];

interface CloseAction {
  action: "close";
}

type StubDialogResult = CloseAction;

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "0.0.5");

  console.log("Mutate activated!");

  async function openStubDialog(mode: StubDialogMode) {
    const payload = JSON.stringify({ mode });
    const html = stubInterface.replace(
      "</head>",
      `<script>window.__MUTATE_DATA__='${payload.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}';</script></head>`,
    );
    const dataUrl = `data:text/html,${encodeURIComponent(html)}`;
    try {
      const dialog = context.createModalDialog();
      const resultStr = await dialog.show(dataUrl, 480, 240);
      const result: StubDialogResult = JSON.parse(resultStr);
      if (result.action !== "close") {
        console.log(`Mutate: unexpected dialog result for ${mode}:`, resultStr);
      }
    } catch (e) {
      console.error(`Mutate dialog error (${mode}):`, e);
    }
  }

  function escapePayload(payload: string): string {
    return payload
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  async function showMutateDialog(payload: DialogPayload): Promise<DialogResult> {
    const html = mutateClipModeHtml.replace(
      "</head>",
      `<script>window.__MUTATE_DATA__='${escapePayload(JSON.stringify(payload))}';</script></head>`,
    );
    const dataUrl = `data:text/html,${encodeURIComponent(html)}`;
    const dialog = context.createModalDialog();
    const resultStr = await dialog.show(dataUrl, 1200, 800);
    return JSON.parse(resultStr) as DialogResult;
  }

  function clipBoundsFor(clip: MidiClip<"0.0.5">): ClipBounds {
    const looping = Boolean(clip.looping);
    const loopStart = Number(clip.loopStart);
    const loopEnd = Number(clip.loopEnd);
    const startMarker = Number(clip.startMarker);
    return {
      start: looping ? Math.min(loopStart, startMarker) : startMarker,
      end: loopEnd,
    };
  }

  function coerceNote(n: NoteDescription): Note {
    const out: Note = {
      pitch: Number(n.pitch),
      startTime: Number(n.startTime),
      duration: Number(n.duration),
    };
    if (n.velocity !== undefined) out.velocity = Number(n.velocity);
    if (n.probability !== undefined) out.probability = Number(n.probability);
    return out;
  }

  function describeSessionSource(clip: MidiClip<"0.0.5">): SessionSource | null {
    const slot = clip.parent;
    if (!(slot instanceof ClipSlot)) return null;
    const track = slot.parent;
    if (!(track instanceof MidiTrack)) return null;
    return {
      kind: "session",
      track,
      slotIndex: track.clipSlots.indexOf(slot),
      clip,
      duration: Number(clip.loopEnd),
      notes: clip.notes.map(coerceNote),
      bounds: clipBoundsFor(clip),
    };
  }

  // Walks up from a clip that lives in the arrangement. Parent is either the
  // MidiTrack directly, or a TakeLane whose parent is the MidiTrack.
  // Not yet wired to a command — AJM-197 arrangement branch and AJM-205 range
  // mode will consume this.
  function describeArrangementSource(clip: MidiClip<"0.0.5">): ArrangementSource | null {
    let parent = clip.parent;
    if (parent instanceof TakeLane) parent = parent.parent;
    if (!(parent instanceof MidiTrack)) return null;
    const startTime = Number(clip.startTime);
    const endTime = Number(clip.endTime);
    return {
      kind: "arrangement",
      track: parent,
      clip,
      startTime,
      duration: endTime - startTime,
      notes: clip.notes.map(coerceNote),
      bounds: clipBoundsFor(clip),
    };
  }


  function readClipNotes(clip: MidiClip<"0.0.5">): ScaffoldNote[] {
    return clip.notes.map((n) => ({
      pitch: Number(n.pitch),
      startTime: Number(n.startTime),
      duration: Number(n.duration),
      velocity: Number(n.velocity ?? 64),
    }));
  }

  function applyToClip(clip: MidiClip<"0.0.5">, fn: MutationFn, label: string) {
    const before = readClipNotes(clip);
    const after = fn(before);
    clip.notes = after;
    console.log(
      `Mutate: ${label} on clip "${String(clip.name)}" — ${before.length} → ${after.length} notes`,
    );
  }

  function collectMidiClipsFromArg(arg: unknown): MidiClip<"0.0.5">[] {
    if (!arg || typeof arg !== "object") return [];

    if ("selected_clip_slots" in arg) {
      const sel = arg as ClipSlotSelection;
      const clips: MidiClip<"0.0.5">[] = [];
      for (const handle of sel.selected_clip_slots) {
        const slot = context.objects.getObjectFromHandle(handle, ClipSlot);
        if (slot.clip instanceof MidiClip) clips.push(slot.clip);
      }
      return clips;
    }

    if ("selected_lanes" in arg && "time_selection_start" in arg) {
      const sel = arg as ArrangementSelection;
      const start = Number(sel.time_selection_start);
      const end = Number(sel.time_selection_end);
      const clips: MidiClip<"0.0.5">[] = [];
      for (const h of sel.selected_lanes) {
        const obj = context.objects.getObjectFromHandle(h, DataModelObject);
        if (!(obj instanceof MidiTrack)) continue;
        for (const clip of obj.arrangementClips) {
          if (!(clip instanceof MidiClip)) continue;
          if (Number(clip.startTime) < end && Number(clip.endTime) > start) clips.push(clip);
        }
      }
      return clips;
    }

    if ("id" in arg) {
      return [context.objects.getObjectFromHandle(arg as Handle, MidiClip)];
    }

    return [];
  }

  function runQuickAction(
    arg: unknown,
    label: string,
    transform: (notes: ScaffoldNote[], rng: Rng) => ScaffoldNote[],
  ) {
    const clips = collectMidiClipsFromArg(arg);
    if (clips.length === 0) {
      console.log(`Mutate: ${label} — no MIDI clips in selection`);
      return;
    }
    const rng = mulberry32(Date.now() >>> 0);
    context.withinTransaction(() => {
      for (const clip of clips) {
        clip.notes = transform(clip.notes as ScaffoldNote[], rng);
      }
    });
    console.log(`Mutate: ${label} — applied to ${clips.length} clip(s)`);
  }

  // -------------------------------------------------------------------
  // Dialog commands (MidiClip / Scene / MidiTrack.ArrangementSelection / MidiTrack)
  // -------------------------------------------------------------------

  async function openArrangementClipDialog(clip: MidiClip<"0.0.5">) {
    const source = describeArrangementSource(clip);
    if (!source) {
      console.log("Mutate: could not resolve arrangement source for clip");
      return;
    }
    const payload: ClipModeArrangementPayload = {
      mode: "clip",
      branch: "arrangement",
      sourceNotes: source.notes,
      bounds: source.bounds,
      sourceClipName: String(clip.name),
      trackName: String(source.track.name),
    };

    let result: DialogResult;
    try {
      result = await showMutateDialog(payload);
    } catch (e) {
      console.error("Mutate: arrangement-clip dialog failed to show:", e);
      return;
    }
    if (result.action !== "apply") return;

    try {
      await applyArrangement(
        context,
        source,
        result.controls,
        result.variations,
        result.baseSeed,
        result.mutateSource,
      );
      const sourceWrite = result.mutateSource ? ` + in-place` : "";
      console.log(
        `Mutate: wrote ${result.variations} take lane(s)${sourceWrite} for "${payload.sourceClipName}"`,
      );
    } catch (e) {
      console.error("Mutate: applyArrangement failed:", e);
    }
  }

  context.commands.registerCommand("mutate.clipDialog", (arg: unknown) =>
    void (async () => {
      const clips = collectMidiClipsFromArg(arg);
      if (clips.length === 0) {
        console.log("Mutate: Clip(s)... — no MIDI clips in selection");
        return;
      }
      if (clips.length !== 1) {
        console.log(
          `Mutate: Clip(s)... needs exactly one MIDI clip (got ${clips.length}); multi-clip mode TBD`,
        );
        return;
      }
      const sourceClip = clips[0]!;
      const session = describeSessionSource(sourceClip);
      if (!session) {
        console.log("Mutate: clip is not in a session clip slot");
        return;
      }

      const slotsBelow = session.track.clipSlots.slice(session.slotIndex + 1);
      const payload: ClipModeSessionPayload = {
        mode: "clip",
        branch: "session",
        sourceNotes: session.notes,
        bounds: session.bounds,
        sourceClipName: String(sourceClip.name),
        trackName: String(session.track.name),
        availableSlotsBelow: slotsBelow.length,
        slotsBelowOccupied: slotsBelow.map((s) => s.clip !== null),
      };

      let result: DialogResult;
      try {
        result = await showMutateDialog(payload);
      } catch (e) {
        console.error("Mutate: clip dialog failed to show:", e);
        return;
      }
      if (result.action !== "apply") return;

      try {
        await applySession(
          context,
          session,
          result.controls,
          result.variations,
          result.baseSeed,
          result.fillMode,
          result.mutateSource,
        );
        const sourceWrite = result.mutateSource ? ` + in-place` : "";
        console.log(
          `Mutate: wrote ${result.variations} slot(s)${sourceWrite} for "${payload.sourceClipName}"`,
        );
      } catch (e) {
        console.error("Mutate: applySession failed:", e);
      }
    })(),
  );

  context.commands.registerCommand("mutate.sceneDialog", (arg: unknown) =>
    void (async () => {
      const scene = context.objects.getObjectFromHandle(arg as Handle, Scene);
      const song = context.application.song;
      const scenes = song.scenes;
      const sceneIndex = scenes.findIndex((s) => s.handle.id === scene.handle.id);
      if (sceneIndex < 0) {
        console.log("Mutate: could not find scene index");
        return;
      }

      const tracks = song.tracks;
      const totalScenes = scenes.length;

      const snapshot: SceneSourceClip[] = [];
      const summaries: SceneSourceSummary[] = [];
      for (let ti = 0; ti < tracks.length; ti++) {
        const track = tracks[ti]!;
        if (!(track instanceof MidiTrack)) continue;
        const slot = track.clipSlots[sceneIndex];
        const clip = slot?.clip;
        if (!(clip instanceof MidiClip)) continue;

        snapshot.push({
          trackIndex: ti,
          track,
          clip,
          notes: clip.notes.map(coerceNote),
          bounds: clipBoundsFor(clip),
          duration: Number(clip.loopEnd),
        });

        const slotsBelow: boolean[] = [];
        for (let si = sceneIndex + 1; si < totalScenes; si++) {
          slotsBelow.push(track.clipSlots[si]?.clip != null);
        }
        summaries.push({
          trackIndex: ti,
          trackName: String(track.name),
          clipName: String(clip.name),
          noteCount: clip.notes.length,
          slotsBelowOccupied: slotsBelow,
        });
      }

      if (snapshot.length === 0) {
        console.log(`Mutate: scene "${scene.name}" has no MIDI clips`);
        return;
      }

      const payload: SceneModePayload = {
        mode: "scene",
        sceneIndex,
        sceneName: String(scene.name),
        totalScenesInSong: totalScenes,
        sources: summaries,
      };

      let result: DialogResult;
      try {
        result = await showMutateDialog(payload);
      } catch (e) {
        console.error("Mutate: scene dialog failed to show:", e);
        return;
      }
      if (result.action !== "apply") return;

      const sceneSource: SceneSource = { kind: "scene", sceneIndex, sources: snapshot };
      try {
        await applyScene(
          context,
          sceneSource,
          result.controls,
          result.variations,
          result.baseSeed,
          result.fillMode,
          result.mutateSource,
        );
        const inPlaceCount = result.mutateSource ? snapshot.length : 0;
        const newCount = result.variations * snapshot.length;
        console.log(
          `Mutate: scene "${scene.name}" — wrote ${inPlaceCount} in-place + ${newCount} new clip(s)`,
        );
      } catch (e) {
        console.error("Mutate: applyScene failed:", e);
      }
    })(),
  );

  // Fires for a right-click anywhere in MidiTrack.ArrangementSelection: either
  // a drag-selected time range OR a single-clip right-click (Live treats the
  // single clip as a degenerate range). Single-clip goes through the piano-roll
  // preview dialog; multi-clip (or multi-track) goes through the range-mode
  // indicator-grid dialog.
  context.commands.registerCommand("mutate.rangeDialog", (arg: unknown) =>
    void (async () => {
      if (!arg || typeof arg !== "object") {
        console.log("Mutate: Range... — unexpected command arg");
        return;
      }
      if (!("selected_lanes" in arg && "time_selection_start" in arg)) {
        console.log("Mutate: Range... — arg is not an ArrangementSelection");
        return;
      }
      const selection = arg as ArrangementSelection;
      const timeStart = Number(selection.time_selection_start);
      const timeEnd = Number(selection.time_selection_end);

      // Collect MIDI clips overlapping the range, keeping the track association.
      const rangeClips: RangeSourceClip[] = [];
      for (const h of selection.selected_lanes) {
        const obj = context.objects.getObjectFromHandle(h, DataModelObject);
        if (!(obj instanceof MidiTrack)) continue;
        const trackIndex = context.application.song.tracks.findIndex(
          (t) => t.handle.id === obj.handle.id,
        );
        if (trackIndex < 0) continue;
        for (const clip of obj.arrangementClips) {
          if (!(clip instanceof MidiClip)) continue;
          const cs = Number(clip.startTime);
          const ce = Number(clip.endTime);
          if (cs < timeEnd && ce > timeStart) {
            rangeClips.push({
              trackIndex,
              track: obj,
              clip,
              startTime: cs,
              duration: ce - cs,
              notes: clip.notes.map(coerceNote),
              bounds: clipBoundsFor(clip),
            });
          }
        }
      }

      if (rangeClips.length === 0) {
        console.log("Mutate: Range... — no MIDI clips in selection");
        return;
      }
      if (rangeClips.length === 1) {
        await openArrangementClipDialog(rangeClips[0]!.clip);
        return;
      }

      // Multi-clip: build the range-mode payload grouped by track for the UI summary.
      const byTrack = new Map<number, { trackName: string; clipCount: number }>();
      for (const rc of rangeClips) {
        const existing = byTrack.get(rc.trackIndex);
        if (existing) {
          existing.clipCount += 1;
        } else {
          byTrack.set(rc.trackIndex, { trackName: String(rc.track.name), clipCount: 1 });
        }
      }
      const trackSummaries: RangeTrackSummary[] = Array.from(byTrack.entries())
        .sort(([a], [b]) => a - b)
        .map(([trackIndex, { trackName, clipCount }]) => ({ trackIndex, trackName, clipCount }));

      const payload: RangeModePayload = {
        mode: "range",
        timeStart,
        timeEnd,
        totalClipCount: rangeClips.length,
        tracks: trackSummaries,
      };

      let result: DialogResult;
      try {
        result = await showMutateDialog(payload);
      } catch (e) {
        console.error("Mutate: range dialog failed to show:", e);
        return;
      }
      if (result.action !== "apply") return;

      const source: RangeSource = {
        kind: "range",
        timeStart,
        timeEnd,
        clips: rangeClips,
      };
      try {
        await applyRange(
          context,
          source,
          result.controls,
          result.variations,
          result.baseSeed,
          result.mutateSource,
        );
        const inPlace = result.mutateSource ? rangeClips.length : 0;
        const newClips = result.variations * rangeClips.length;
        console.log(
          `Mutate: Range — wrote ${inPlace} in-place + ${newClips} new clip(s) across ${trackSummaries.length} track(s)`,
        );
      } catch (e) {
        console.error("Mutate: applyRange failed:", e);
      }
    })(),
  );

  // -------------------------------------------------------------------
  // Quick actions — registered on MidiClip, ClipSlotSelection, and
  // MidiTrack.ArrangementSelection. One command id per action works on
  // all three scopes via collectMidiClipsFromArg's duck-typing.
  // -------------------------------------------------------------------

  context.commands.registerCommand("mutate.quick.randomizeVelocity", (arg: unknown) =>
    runQuickAction(arg, "Randomize Velocity", (notes, rng) =>
      transformVelocity(notes, { offset: 0, range: 15 }, rng),
    ),
  );

  context.commands.registerCommand("mutate.quick.swapNotes", (arg: unknown) =>
    runQuickAction(arg, "Swap Notes", (notes, rng) =>
      swapNotes(notes, { offset: 0.25, range: 0 }, rng),
    ),
  );

  context.commands.registerCommand("mutate.quick.deleteTenPercent", (arg: unknown) =>
    runQuickAction(arg, "Delete 10%", (notes, rng) =>
      dropNotes(notes, { offset: 0.1, range: 0 }, rng),
    ),
  );

  // -------------------------------------------------------------------
  // MidiTrack scope
  // -------------------------------------------------------------------

  context.commands.registerCommand(
    "mutate.drumsDialog",
    (arg: unknown) =>
      void (async (_handle: Handle) => {
        await openStubDialog("drums");
      })(arg as Handle),
  );

  context.commands.registerCommand(
    "mutate.shuffleDrums",
    (arg: unknown) => {
      const track = context.objects.getObjectFromHandle(arg as Handle, MidiTrack);
      // Apply per session clip on the track. Real shuffleDrums is still a stub
      // (see mutations.ts) — this just exercises the wiring.
      let touched = 0;
      for (const slot of track.clipSlots) {
        const clip = slot.clip;
        if (clip instanceof MidiClip) {
          applyToClip(clip, shuffleDrums, "Shuffle Drums");
          touched++;
        }
      }
      console.log(`Mutate: Shuffle Drums — applied to ${touched} clip(s) on track`);
    },
  );

  // -------------------------------------------------------------------
  // Context menu wiring
  // -------------------------------------------------------------------

  // MidiClip scope fires for a right-click on a clip in either Session or
  // Arrangement view; ClipSlotSelection would only fire in Session. Using
  // MidiClip here is what unlocks arrangement-clip mutation.
  context.ui.registerContextMenuAction("MidiClip", "Clip...", "mutate.clipDialog");
  context.ui.registerContextMenuAction("Scene", "Scene...", "mutate.sceneDialog");
  context.ui.registerContextMenuAction("MidiTrack.ArrangementSelection", "Range...", "mutate.rangeDialog");

  // ClipSlotSelection covers the single-clip case too (Live always wraps a
  // right-clicked clip in a selection of size 1), so registering on MidiClip
  // would just duplicate the menu entry.
  for (const scope of [
    "ClipSlotSelection",
    "MidiTrack.ArrangementSelection",
  ] as const) {
    context.ui.registerContextMenuAction(scope, "Randomize Velocity", "mutate.quick.randomizeVelocity");
    context.ui.registerContextMenuAction(scope, "Swap Notes", "mutate.quick.swapNotes");
    context.ui.registerContextMenuAction(scope, "Delete 10%", "mutate.quick.deleteTenPercent");
  }

  context.ui.registerContextMenuAction("MidiTrack", "Drums...", "mutate.drumsDialog");
  context.ui.registerContextMenuAction("MidiTrack", "Shuffle Drums", "mutate.shuffleDrums");
}
