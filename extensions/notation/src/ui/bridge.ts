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
    trackIndex?: number;
    // Sequential 1-based index assigned at dialog-open time, counting only
    // clips with no name. Used so the "(unnamed #N)" fallback label stays
    // stable across sort-mode changes (AJM-189).
    unnamedIndex?: number;
    startMarker: number;
    endMarker: number;
    looping: boolean;
    loopStart: number;
    loopEnd: number;
    arrangementStartTime?: number;
  };
  // True when the clip's track has a drum rack (or contains one in a nested
  // instrument rack). Drum-rack clips render with x noteheads to make them
  // visually distinct from pitched parts.
  isDrumRack?: boolean;
}

export interface NotationData {
  clips: ClipData[];
  tempo: number;
  rootNote: number;
  scaleName: string;
  timeSignature: { numerator: number; denominator: number };
  emptyStateMessage?: string;
  // Set by the extension host when a previous export failed. Surfaced as a
  // dismissable banner below the toolbar so the user can see what went wrong
  // on the next dialog iteration.
  errorMessage?: string;
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
  const raw = window.__NOTATION_DATA__;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through to scaffold
    }
  }
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
