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
} from "@ableton/extensions-sdk";

import stubInterface from "./stub.html";
import {
  deleteTenPercent,
  randomizeVelocity,
  shuffleDrums,
  swapNotes,
  type Note,
} from "./mutations.js";

type DialogMode = "clip" | "scene" | "range" | "drums";

type MutationFn = (notes: Note[]) => Note[];

interface CloseAction {
  action: "close";
}

type DialogResult = CloseAction;

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "0.0.5");

  console.log("Mutate activated!");

  async function openDialog(mode: DialogMode) {
    const payload = JSON.stringify({ mode });
    const html = stubInterface.replace(
      "</head>",
      `<script>window.__MUTATE_DATA__='${payload.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}';</script></head>`,
    );
    const dataUrl = `data:text/html,${encodeURIComponent(html)}`;
    try {
      const dialog = context.createModalDialog();
      const resultStr = await dialog.show(dataUrl, 480, 240);
      const result: DialogResult = JSON.parse(resultStr);
      if (result.action !== "close") {
        console.log(`Mutate: unexpected dialog result for ${mode}:`, resultStr);
      }
    } catch (e) {
      console.error(`Mutate dialog error (${mode}):`, e);
    }
  }

  function readClipNotes(clip: MidiClip<"0.0.5">): Note[] {
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

  function applyToClipSlotSelection(
    selection: ClipSlotSelection,
    fn: MutationFn,
    label: string,
  ) {
    let touched = 0;
    for (const handle of selection.selected_clip_slots) {
      const slot = context.objects.getObjectFromHandle(handle, ClipSlot);
      const clip = slot.clip;
      if (clip instanceof MidiClip) {
        applyToClip(clip, fn, label);
        touched++;
      }
    }
    console.log(`Mutate: ${label} — applied to ${touched} clip(s) in selection`);
  }

  function applyToArrangementRange(
    selection: ArrangementSelection,
    fn: MutationFn,
    label: string,
  ) {
    const start = Number(selection.time_selection_start);
    const end = Number(selection.time_selection_end);
    const tracks = selection.selected_lanes
      .map((handle) => context.objects.getObjectFromHandle(handle, DataModelObject))
      .filter((obj): obj is MidiTrack<"0.0.5"> => obj instanceof MidiTrack);

    let touched = 0;
    for (const track of tracks) {
      for (const clip of track.arrangementClips) {
        if (!(clip instanceof MidiClip)) continue;
        const clipStart = Number(clip.startTime);
        const clipEnd = Number(clip.endTime);
        if (clipStart < end && clipEnd > start) {
          applyToClip(clip, fn, label);
          touched++;
        }
      }
    }
    console.log(`Mutate: ${label} — applied to ${touched} arrangement clip(s) in range`);
  }

  // -------------------------------------------------------------------
  // MidiClip scope — only the dialog mode lives here. Quick actions
  // operate via ClipSlotSelection so a single right-clicked clip and a
  // multi-clip selection take the same handler path.
  // -------------------------------------------------------------------

  context.commands.registerCommand(
    "mutate.clipDialog",
    (arg: unknown) =>
      void (async (_handle: Handle) => {
        await openDialog("clip");
      })(arg as Handle),
  );

  // -------------------------------------------------------------------
  // ClipSlotSelection scope (Session, one or more clip slots)
  // -------------------------------------------------------------------

  context.commands.registerCommand(
    "mutate.selectionRandomizeVelocity",
    (arg: unknown) =>
      applyToClipSlotSelection(arg as ClipSlotSelection, randomizeVelocity, "Randomize Velocity"),
  );

  context.commands.registerCommand(
    "mutate.selectionSwapNotes",
    (arg: unknown) =>
      applyToClipSlotSelection(arg as ClipSlotSelection, swapNotes, "Swap Notes"),
  );

  context.commands.registerCommand(
    "mutate.selectionDeleteTenPercent",
    (arg: unknown) =>
      applyToClipSlotSelection(arg as ClipSlotSelection, deleteTenPercent, "Delete 10%"),
  );

  // -------------------------------------------------------------------
  // Scene scope
  // -------------------------------------------------------------------

  context.commands.registerCommand(
    "mutate.sceneDialog",
    (arg: unknown) =>
      void (async (_handle: Handle) => {
        await openDialog("scene");
      })(arg as Handle),
  );

  // -------------------------------------------------------------------
  // MidiTrack.ArrangementSelection scope
  // -------------------------------------------------------------------

  context.commands.registerCommand(
    "mutate.rangeDialog",
    (arg: unknown) =>
      void (async (_selection: ArrangementSelection) => {
        await openDialog("range");
      })(arg as ArrangementSelection),
  );

  context.commands.registerCommand(
    "mutate.rangeRandomizeVelocity",
    (arg: unknown) =>
      applyToArrangementRange(arg as ArrangementSelection, randomizeVelocity, "Randomize Velocity"),
  );

  context.commands.registerCommand(
    "mutate.rangeSwapNotes",
    (arg: unknown) =>
      applyToArrangementRange(arg as ArrangementSelection, swapNotes, "Swap Notes"),
  );

  context.commands.registerCommand(
    "mutate.rangeDeleteTenPercent",
    (arg: unknown) =>
      applyToArrangementRange(arg as ArrangementSelection, deleteTenPercent, "Delete 10%"),
  );

  // -------------------------------------------------------------------
  // MidiTrack scope
  // -------------------------------------------------------------------

  context.commands.registerCommand(
    "mutate.drumsDialog",
    (arg: unknown) =>
      void (async (_handle: Handle) => {
        await openDialog("drums");
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

  context.ui.registerContextMenuAction("MidiClip", "Clip...", "mutate.clipDialog");

  context.ui.registerContextMenuAction("ClipSlotSelection", "Randomize Velocity", "mutate.selectionRandomizeVelocity");
  context.ui.registerContextMenuAction("ClipSlotSelection", "Swap Notes", "mutate.selectionSwapNotes");
  context.ui.registerContextMenuAction("ClipSlotSelection", "Delete 10%", "mutate.selectionDeleteTenPercent");

  context.ui.registerContextMenuAction("Scene", "Scene...", "mutate.sceneDialog");

  context.ui.registerContextMenuAction("MidiTrack.ArrangementSelection", "Range...", "mutate.rangeDialog");
  context.ui.registerContextMenuAction("MidiTrack.ArrangementSelection", "Randomize Velocity", "mutate.rangeRandomizeVelocity");
  context.ui.registerContextMenuAction("MidiTrack.ArrangementSelection", "Swap Notes", "mutate.rangeSwapNotes");
  context.ui.registerContextMenuAction("MidiTrack.ArrangementSelection", "Delete 10%", "mutate.rangeDeleteTenPercent");

  context.ui.registerContextMenuAction("MidiTrack", "Drums...", "mutate.drumsDialog");
  context.ui.registerContextMenuAction("MidiTrack", "Shuffle Drums", "mutate.shuffleDrums");
}
