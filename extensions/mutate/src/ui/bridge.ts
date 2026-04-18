import type { ClipBounds, Note } from "../transforms.js";
import type { MutateControls } from "../variations.js";
import type { FillMode } from "../apply.js";

export type ApplyMessage = {
  action: "apply";
  controls: MutateControls;
  variations: number;
  baseSeed: number;
  fillMode: FillMode;
  mutateSource: boolean;
};

export type CloseMessage = { action: "close" };

export type DialogResult = ApplyMessage | CloseMessage;

export type ClipModeSessionPayload = {
  mode: "clip";
  branch: "session";
  sourceNotes: Note[];
  bounds: ClipBounds;
  sourceClipName: string;
  trackName: string;
  availableSlotsBelow: number;
  slotsBelowOccupied: boolean[];
};

export type ClipModeArrangementPayload = {
  mode: "clip";
  branch: "arrangement";
  sourceNotes: Note[];
  bounds: ClipBounds;
  sourceClipName: string;
  trackName: string;
};

export type ClipModePayload = ClipModeSessionPayload | ClipModeArrangementPayload;

export type SceneSourceSummary = {
  trackIndex: number;
  trackName: string;
  clipName: string;
  noteCount: number;
  // length = totalScenesInSong - sceneIndex - 1 (i.e. existing scenes below source)
  slotsBelowOccupied: boolean[];
};

export type SceneModePayload = {
  mode: "scene";
  sceneIndex: number;
  sceneName: string;
  totalScenesInSong: number;
  sources: SceneSourceSummary[];
};

export type DialogPayload = ClipModePayload | SceneModePayload;

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
  sourceNotes: [],
  bounds: { start: 0, end: 4 },
  sourceClipName: "",
  trackName: "",
  availableSlotsBelow: 0,
  slotsBelowOccupied: [],
};

export function getMutateData(): DialogPayload {
  try {
    const parsed = JSON.parse(window.__MUTATE_DATA__ || "{}") as DialogPayload;
    if (parsed && (parsed.mode === "clip" || parsed.mode === "scene")) return parsed;
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
  send({ name: "close_and_send", args: [JSON.stringify({ action: "close" } satisfies CloseMessage)] });
}

export function applyMutations(msg: ApplyMessage): void {
  send({ name: "close_and_send", args: [JSON.stringify(msg)] });
}
