import type { ClipBounds, Note } from "../transforms.js";
import type { MutateControls } from "../variations.js";
import type { FillMode } from "../apply.js";

export type ApplyMessage = {
  action: "apply";
  controls: MutateControls;
  variations: number;
  baseSeed: number;
  fillMode: FillMode;
};

export type CloseMessage = { action: "close" };

export type DialogResult = ApplyMessage | CloseMessage;

export type DialogPayload = {
  sourceNotes: Note[];
  bounds: ClipBounds;
  sourceClipName: string;
  trackName: string;
  availableSlotsBelow: number;
  slotsBelowOccupied: boolean[];
};

declare global {
  interface Window {
    __MUTATE_DATA__?: string;
    webkit?: { messageHandlers?: { live?: { postMessage(message: unknown): void } } };
    chrome?: { webview?: { postMessage(message: unknown): void } };
  }
}

export function getMutateData(): DialogPayload {
  try {
    return JSON.parse(window.__MUTATE_DATA__ || "{}");
  } catch {
    return {
      sourceNotes: [],
      bounds: { start: 0, end: 4 },
      sourceClipName: "",
      trackName: "",
      availableSlotsBelow: 0,
      slotsBelowOccupied: [],
    };
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
