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

export interface ClipData {
  notes: NoteData[];
  clip: {
    name: string;
    trackName: string;
    startMarker: number;
    endMarker: number;
    looping: boolean;
    loopStart: number;
    loopEnd: number;
  };
}

export interface NotationData {
  clips: ClipData[];
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
  const message = { name: "close_and_send", args: [JSON.stringify({ action: "close" })] };
  doSendMessage(message);
}

export function exportFile(data: string, filename: string, encoding: "utf8" | "base64" = "utf8") {
  const message = { name: "close_and_send", args: [JSON.stringify({ action: "export", data, filename, encoding })] };
  doSendMessage(message);
}

export function getNotationData(): NotationData {
  try {
    return JSON.parse(window.__NOTATION_DATA__ || "{}");
  } catch {
    return {
      clips: [{
        notes: [],
        clip: {
          name: "",
          trackName: "",
          startMarker: 0,
          endMarker: 16,
          looping: false,
          loopStart: 0,
          loopEnd: 16,
        },
      }],
      tempo: 120,
      rootNote: 0,
      scaleName: "Major",
      timeSignature: { numerator: 4, denominator: 4 },
    };
  }
}
