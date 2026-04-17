import {
  initialize,
  ClipSlot,
  DataModelObject,
  MidiClip,
  MidiTrack,
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
import { generateVariations } from "./variations.js";
import { applySession, type SessionSource } from "./apply.js";
import type { DialogPayload, DialogResult as ClipDialogResult } from "./ui/bridge.js";

type StubDialogMode = "scene" | "range" | "drums";

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

  async function showMutateClipDialog(payload: DialogPayload): Promise<ClipDialogResult> {
    const html = mutateClipModeHtml.replace(
      "</head>",
      `<script>window.__MUTATE_DATA__='${escapePayload(JSON.stringify(payload))}';</script></head>`,
    );
    const dataUrl = `data:text/html,${encodeURIComponent(html)}`;
    const dialog = context.createModalDialog();
    const resultStr = await dialog.show(dataUrl, 1200, 800);
    return JSON.parse(resultStr) as ClipDialogResult;
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

    const looping = Boolean(clip.looping);
    const loopStart = Number(clip.loopStart);
    const loopEnd = Number(clip.loopEnd);
    const startMarker = Number(clip.startMarker);
    const bounds: ClipBounds = {
      start: looping ? Math.min(loopStart, startMarker) : startMarker,
      end: loopEnd,
    };

    return {
      kind: "session",
      track,
      slotIndex: track.clipSlots.indexOf(slot),
      duration: loopEnd,
      notes: clip.notes.map(coerceNote),
      bounds,
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
      const source = describeSessionSource(sourceClip);
      if (!source) {
        console.log("Mutate: arrangement-view clips not yet supported for Clip(s)...");
        return;
      }

      const slotsBelow = source.track.clipSlots.slice(source.slotIndex + 1);
      const payload: DialogPayload = {
        sourceNotes: source.notes,
        bounds: source.bounds,
        sourceClipName: String(sourceClip.name),
        trackName: String(source.track.name),
        availableSlotsBelow: slotsBelow.length,
        slotsBelowOccupied: slotsBelow.map((s) => s.clip !== null),
      };

      let result: ClipDialogResult;
      try {
        result = await showMutateClipDialog(payload);
      } catch (e) {
        console.error("Mutate: clip dialog failed to show:", e);
        return;
      }
      if (result.action !== "apply") return;

      const variations = generateVariations(
        source.notes,
        result.controls,
        result.variations,
        result.baseSeed,
        source.bounds,
      );
      try {
        await applySession(context, source, variations, result.fillMode);
        console.log(
          `Mutate: wrote ${variations.length} variation(s) below "${payload.sourceClipName}"`,
        );
      } catch (e) {
        console.error("Mutate: applySession failed:", e);
      }
    })(),
  );

  context.commands.registerCommand(
    "mutate.sceneDialog",
    (arg: unknown) =>
      void (async (_handle: Handle) => {
        await openStubDialog("scene");
      })(arg as Handle),
  );

  context.commands.registerCommand(
    "mutate.rangeDialog",
    (arg: unknown) =>
      void (async (_selection: ArrangementSelection) => {
        await openStubDialog("range");
      })(arg as ArrangementSelection),
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

  context.ui.registerContextMenuAction("ClipSlotSelection", "Clip(s)...", "mutate.clipDialog");
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
