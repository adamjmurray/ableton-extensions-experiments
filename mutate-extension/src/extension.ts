import {
  type ActivationContext,
  type ArrangementSelection,
  ClipSlot,
  type ClipSlotSelection,
  DataModelObject,
  type Handle,
  initialize,
  MidiClip,
  MidiTrack,
  TakeLane,
} from "@ableton/extensions-sdk";
import type { ArrangementSource, SessionSource } from "./apply.js";
import {
  type DialogDeps,
  handleClipDialog,
  handleRangeDialog,
  handleSceneDialog,
} from "./dialog-handlers.js";
import { clipBoundsFor, clipOverlapsRange, coerceNote } from "./helpers.js";
import mutateDialogHtml from "./mutate-dialog.html";
import { mulberry32, type Rng } from "./rng.js";
import { dropNotes, type Note, swapNotes, transformVelocity } from "./transforms.js";
import type { DialogPayload, DialogResult } from "./ui/bridge.js";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "0.0.5");

  console.log("Mutate activated!");

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
    const html = mutateDialogHtml.replace(
      "</head>",
      `<script>window.__MUTATE_DATA__='${escapePayload(JSON.stringify(payload))}';</script></head>`,
    );
    const dataUrl = `data:text/html,${encodeURIComponent(html)}`;
    const dialog = context.createModalDialog();
    const resultStr = await dialog.show(dataUrl, 1200, 800);
    return JSON.parse(resultStr) as DialogResult;
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
          if (clipOverlapsRange(Number(clip.startTime), Number(clip.endTime), start, end)) {
            clips.push(clip);
          }
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
    transform: (notes: Note[], rng: Rng) => Note[],
  ) {
    const clips = collectMidiClipsFromArg(arg);
    if (clips.length === 0) {
      console.log(`Mutate: ${label} — no MIDI clips in selection`);
      return;
    }
    const rng = mulberry32(Date.now() >>> 0);
    context.withinTransaction(() => {
      for (const clip of clips) {
        clip.notes = transform(clip.notes as Note[], rng);
      }
    });
    console.log(`Mutate: ${label} — applied to ${clips.length} clip(s)`);
  }

  const deps: DialogDeps = {
    context,
    showMutateDialog,
    collectMidiClipsFromArg,
    describeSessionSource,
    describeArrangementSource,
  };

  // -------------------------------------------------------------------
  // Dialog commands (MidiClip / Scene / MidiTrack.ArrangementSelection / MidiTrack)
  // -------------------------------------------------------------------

  context.commands.registerCommand(
    "mutate.clipDialog",
    (arg: unknown) => void handleClipDialog(arg, deps),
  );

  context.commands.registerCommand(
    "mutate.sceneDialog",
    (arg: unknown) => void handleSceneDialog(arg, deps),
  );

  context.commands.registerCommand(
    "mutate.rangeDialog",
    (arg: unknown) => void handleRangeDialog(arg, deps),
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
  // Context menu wiring
  // -------------------------------------------------------------------

  // MidiClip scope fires for a right-click on a clip in either Session or
  // Arrangement view; ClipSlotSelection would only fire in Session. Using
  // MidiClip here is what unlocks arrangement-clip mutation.
  context.ui.registerContextMenuAction("MidiClip", "Clip...", "mutate.clipDialog");
  context.ui.registerContextMenuAction("Scene", "Scene...", "mutate.sceneDialog");
  context.ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Range...",
    "mutate.rangeDialog",
  );

  // ClipSlotSelection covers the single-clip case too (Live always wraps a
  // right-clicked clip in a selection of size 1), so registering on MidiClip
  // would just duplicate the menu entry.
  for (const scope of ["ClipSlotSelection", "MidiTrack.ArrangementSelection"] as const) {
    context.ui.registerContextMenuAction(
      scope,
      "Randomize Velocity",
      "mutate.quick.randomizeVelocity",
    );
    context.ui.registerContextMenuAction(scope, "Swap Notes", "mutate.quick.swapNotes");
    context.ui.registerContextMenuAction(scope, "Delete 10%", "mutate.quick.deleteTenPercent");
  }
}
