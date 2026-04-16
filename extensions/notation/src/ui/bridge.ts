// Communication between webview and extension host

declare global {
  interface Window {
    webkit?: { messageHandlers?: { live?: { postMessage(msg: unknown): void } } };
    chrome?: { webview?: { postMessage(msg: unknown): void } };
    __NOTATION_DATA__?: string;
  }
}

export interface NoteData {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
}

export interface NotationData {
  notes: NoteData[];
  clip: { start: number; end: number; name: string };
  tempo: number;
  rootNote: number;
  scaleName: string;
  timeSignature: { numerator: number; denominator: number };
}

function doSendMessage(message: unknown) {
  if (window.webkit?.messageHandlers?.live) {
    window.webkit.messageHandlers.live.postMessage(message);
  } else if (window.chrome?.webview) {
    window.chrome.webview.postMessage(message);
  }
}

export function closeDialog() {
  const message = { name: "close_and_send", args: [JSON.stringify({ closed: true })] };
  doSendMessage(message);
}

export function getNotationData(): NotationData {
  try {
    return JSON.parse(window.__NOTATION_DATA__ || "{}");
  } catch {
    return {
      notes: [],
      clip: { start: 0, end: 16, name: "" },
      tempo: 120,
      rootNote: 0,
      scaleName: "Major",
      timeSignature: { numerator: 4, denominator: 4 },
    };
  }
}
