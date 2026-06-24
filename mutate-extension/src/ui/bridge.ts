import type { FillMode } from "../apply.js";
import type { ClipBounds, Note } from "../transforms.js";
import type { MutateControls, VariationMode } from "../variations.js";

export const MAX_VARIATIONS = 32;

export type ApplyMessage = {
  action: "apply";
  controls: MutateControls;
  variations: number;
  baseSeed: number;
  fillMode: FillMode;
  mutateSource: boolean;
  variationMode: VariationMode;
};

export type CloseMessage = { action: "close" };

export type DialogResult = ApplyMessage | CloseMessage;

// Per-clip data the preview panel needs to render + compute mutations.
// Session-context clips also carry slot-conflict info for variation status badges.
export type PreviewClip = {
  trackName: string;
  clipName: string;
  sourceNotes: Note[];
  bounds: ClipBounds;
  // Session-context only. length = number of existing scenes below this clip.
  // Each entry tells whether that slot currently holds a clip.
  slotsBelowOccupied?: boolean[];
  availableSlotsBelow?: number;
  // Per-clip seed axis, matching what the apply code uses so the preview is
  // byte-for-byte the same as the actual mutation. Omit for single-clip modes
  // (apply uses 1D deriveSeed). For multi-clip modes, this must equal the
  // value the apply path passes as the first axis of deriveSeed2D.
  seedAxis?: number;
};

export type ClipModeSessionPayload = {
  mode: "clip";
  branch: "session";
  preview: PreviewClip; // always exactly one
};

export type ClipModeArrangementPayload = {
  mode: "clip";
  branch: "arrangement";
  preview: PreviewClip;
};

export type ClipModePayload = ClipModeSessionPayload | ClipModeArrangementPayload;

export type SceneModePayload = {
  mode: "scene";
  sceneIndex: number;
  sceneName: string;
  preview: PreviewClip[]; // one per MIDI clip in the scene
};

export type RangeModePayload = {
  mode: "range";
  timeStart: number;
  timeEnd: number;
  preview: PreviewClip[]; // sorted by (trackIndex, startTime)
  // Overrides the default "Range X – Y" toolbar subtitle. Used by the
  // whole-track entry point so the user sees "Track: <name>" instead.
  scopeLabel?: string;
};

export type SessionMultiPayload = {
  mode: "sessionMulti";
  preview: PreviewClip[];
  // True when the selection has more than one clip on at least one track.
  // In that case variations are disabled (per-track fan-down would have to
  // pick which source clip "owns" the slots below).
  multiplePerTrack?: boolean;
};

export type DialogPayload =
  | ClipModePayload
  | SceneModePayload
  | RangeModePayload
  | SessionMultiPayload;

declare global {
  interface Window {
    __MUTATE_DATA__?: string;
    webkit?: { messageHandlers?: { live?: { postMessage(message: unknown): void } } };
    chrome?: { webview?: { postMessage(message: unknown): void } };
  }
}

const FALLBACK_PAYLOAD: ClipModePayload = {
  mode: "clip",
  branch: "session",
  preview: {
    trackName: "",
    clipName: "",
    sourceNotes: [],
    bounds: { start: 0, end: 4 },
    availableSlotsBelow: 0,
    slotsBelowOccupied: [],
  },
};

export function getMutateData(): DialogPayload {
  try {
    const parsed = JSON.parse(window.__MUTATE_DATA__ || "{}") as DialogPayload;
    if (
      parsed &&
      (parsed.mode === "clip" ||
        parsed.mode === "scene" ||
        parsed.mode === "range" ||
        parsed.mode === "sessionMulti")
    ) {
      return parsed;
    }
    return FALLBACK_PAYLOAD;
  } catch {
    return FALLBACK_PAYLOAD;
  }
}

function send(message: unknown) {
  if (window.webkit?.messageHandlers?.live) {
    window.webkit.messageHandlers.live.postMessage(message);
  } else if (window.chrome?.webview) {
    window.chrome.webview.postMessage(message);
  }
}

export function closeDialog(): void {
  send({
    method: "close_and_send",
    params: [JSON.stringify({ action: "close" } satisfies CloseMessage)],
  });
}

export function applyMutations(msg: ApplyMessage): void {
  send({ method: "close_and_send", params: [JSON.stringify(msg)] });
}
