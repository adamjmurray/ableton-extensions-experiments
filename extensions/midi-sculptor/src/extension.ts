import {
  initialize,
  MidiClip,
  type ActivationContext,
  type Handle,
} from "@ableton/extensions-sdk";

import Note from "./Note.js";
import SlideTransformer, { ANCHOR, type AnchorType } from "./transformers/SlideTransformer.js";
import SwapTransformer from "./transformers/SwapTransformer.js";
import SetTransformer from "./transformers/SetTransformer.js";
import SplitTransformer from "./transformers/SplitTransformer.js";
import type { NoteProperty } from "./Note.js";
import sculptorInterface from "./interface.html";

interface SlideAction {
  tool: "slide";
  operation: "shift" | "spread" | "random";
  property: string;
  amount: number | [number, number];
  range: number;
  edgeBehavior: string;
  anchor: string;
  strumTension: number;
  strumUnlockEnd: boolean;
}

interface SwapAction {
  tool: "swap";
  operation: "rotate" | "pairs" | "reverse" | "zip" | "unzip" | "random";
  amount?: number | [number, number];
  targets: Record<string, boolean>;
}

interface SetAction {
  tool: "set";
  operation: "all" | "random";
  property: string;
  value: string | number;
  amount?: [number, number];
}

interface SplitAction {
  tool: "split";
  operation: "split" | "tilt";
  splitType: string;
  amount1: number;
  amount2: number;
  gate: number;
  envelope: string;
  tiltAmount?: number;
}

interface CancelAction {
  cancelled: true;
}

type SculptorAction = SlideAction | SwapAction | SetAction | SplitAction | CancelAction;

function notesFromClip(clip: MidiClip<"0.0.5">): Note[] {
  // Get all notes from the clip by selecting all and reading them
  const sdkNotes = clip.getNotes();
  return sdkNotes.map(
    (n: any, i: number) =>
      new Note({
        id: i,
        pitch: n.pitch,
        start: n.startTime,
        duration: n.duration,
        velocity: n.velocity,
        velrange: n.velocityDeviation ?? 0,
        release: n.releaseVelocity ?? 0,
        probability: n.probability ?? 1,
        muted: n.muted ?? false,
      }),
  );
}

function applyNotesToClip(clip: MidiClip<"0.0.5">, notes: Note[]): void {
  clip.removeAllNotes();
  const sdkNotes = notes
    .filter((n) => !n.deleted && n.duration >= Note.MIN_DURATION)
    .map((n) => ({
      pitch: Math.round(Math.max(0, Math.min(127, n.pitch))),
      startTime: n.start,
      duration: n.duration,
      velocity: Math.max(1, Math.min(127, n.velocity)),
      velocityDeviation: Math.max(-127, Math.min(127, n.velrange)),
      releaseVelocity: Math.max(0, Math.min(127, n.release)),
      probability: Math.max(0, Math.min(1, n.probability)),
      muted: n.muted,
    }));
  clip.addNotes(sdkNotes);
}

function configureStrumTension(transformer: SlideTransformer, amount: number): void {
  if (amount < 0) {
    transformer.tension = amount / 2 + 1;
  } else {
    transformer.tension = amount + 1;
  }
}

function processSlide(action: SlideAction, notes: Note[], clipInfo: { start: number; end: number; length: number }): Note[] | undefined {
  const transformer = new SlideTransformer();
  transformer.notes = notes;
  transformer.clip = clipInfo;
  transformer.setRange(action.property as any, action.range);
  transformer.edgeBehavior = action.edgeBehavior;
  transformer.spreadAnchor = action.anchor as AnchorType;
  configureStrumTension(transformer, action.strumTension);
  transformer.strumUnlockEnd = action.strumUnlockEnd;

  const prop = action.property;

  if (action.operation === "shift") {
    const amount = action.amount as number;
    if (prop === "strum") {
      return transformer.strum("start", amount);
    }
    return transformer.shift(prop as NoteProperty, amount);
  } else if (action.operation === "spread") {
    const amount = action.amount as number;
    if (prop === "strum") {
      return transformer.strum("duration", amount);
    }
    return transformer.spread(prop as NoteProperty, amount);
  } else if (action.operation === "random") {
    const [x, y] = action.amount as [number, number];
    return transformer.randomize2D(prop as NoteProperty, x, y);
  }
}

function processSwap(action: SwapAction, notes: Note[]): Note[] | undefined {
  const transformer = new SwapTransformer();
  transformer.notes = notes;

  // Configure targets
  for (const [target, enabled] of Object.entries(action.targets)) {
    transformer.target(target, enabled);
  }

  switch (action.operation) {
    case "rotate":
      return transformer.rotate(action.amount as number);
    case "pairs":
      return transformer.swapPairs();
    case "reverse":
      return transformer.reverse();
    case "zip":
      return transformer.zip();
    case "unzip":
      return transformer.unzip();
    case "random": {
      const [x, y] = action.amount as [number, number];
      return transformer.randomize2D(x, y);
    }
  }
}

function processSet(action: SetAction, notes: Note[]): Note[] | undefined {
  const transformer = new SetTransformer();
  transformer.notes = notes;
  transformer.property = action.property;
  transformer.value = action.value;

  if (action.operation === "all") {
    return transformer.setAll();
  } else if (action.operation === "random" && action.amount) {
    const [x, y] = action.amount;
    return transformer.randomize2D(x, y);
  }
}

function processSplit(action: SplitAction, notes: Note[]): Note[] | undefined {
  const transformer = new SplitTransformer();
  transformer.notes = notes;
  transformer.setSplitType(action.splitType, action.amount1, action.amount2);
  transformer.gate = action.gate;
  transformer.envelope = action.envelope;

  if (action.operation === "split") {
    return transformer.split();
  } else if (action.operation === "tilt") {
    return transformer.splitTilt(action.tiltAmount ?? 0);
  }
}

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "0.0.5");

  console.log("MIDI Sculptor activated!");

  context.commands.registerCommand(
    "midi-sculptor.open",
    (arg: unknown) =>
      void (async (handle: Handle) => {
        const clip = context.objects.getObjectFromHandle(handle, MidiClip);
        const notes = notesFromClip(clip);

        if (notes.length === 0) {
          console.log("MIDI Sculptor: No notes in clip.");
          return;
        }

        const clipInfo = {
          start: clip.loopStart,
          end: clip.loopEnd,
          length: clip.loopEnd - clip.loopStart,
        };

        const dialog = context.createModalDialog();
        try {
          // Inject note and clip data into the webview HTML
          const notesJson = JSON.stringify(
            notes.map((n) => ({
              pitch: n.pitch,
              velocity: n.velocity,
              start: n.start,
              duration: n.duration,
            })),
          );
          const clipJson = JSON.stringify(clipInfo);
          const html = sculptorInterface
            .replace(
              "</head>",
              `<script>window.__SCULPTOR_NOTES__='${notesJson.replace(/'/g, "\\'")}';window.__SCULPTOR_CLIP__='${clipJson.replace(/'/g, "\\'")}';</script></head>`,
            );

          const result = await dialog.show(
            `data:text/html,${encodeURIComponent(html)}`,
            580,
            560,
          );
          const action: SculptorAction = JSON.parse(result);

          if ("cancelled" in action) return;

          let transformedNotes: Note[] | undefined;

          switch (action.tool) {
            case "slide":
              transformedNotes = processSlide(action, notes, clipInfo);
              break;
            case "swap":
              transformedNotes = processSwap(action, notes);
              break;
            case "set":
              transformedNotes = processSet(action, notes);
              break;
            case "split":
              transformedNotes = processSplit(action, notes);
              break;
          }

          if (transformedNotes) {
            context.withinTransaction(() => {
              applyNotesToClip(clip, transformedNotes);
            });
          }
        } catch (e) {
          console.error("MIDI Sculptor dialog error:", e);
        }
      })(arg as Handle),
  );

  context.ui.registerContextMenuAction("MidiClip", "MIDI Sculptor", "midi-sculptor.open");
}
