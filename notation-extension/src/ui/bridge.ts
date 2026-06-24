declare global {
  interface Window {
    webkit?: { messageHandlers?: { live?: { postMessage(msg: unknown): void } } };
    chrome?: { webview?: { postMessage(msg: unknown): void } };
    __NOTATION_DATA__?: string;
    __NOTATION_DATA_URL__?: string;
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
    unnamedIndex?: number;
    startMarker: number;
    endMarker: number;
    looping: boolean;
    loopStart: number;
    loopEnd: number;
    arrangementStartTime?: number;
  };
  isDrumRack?: boolean;
}

export interface NotationData {
  clips: ClipData[];
  tempo: number;
  rootNote: number;
  scaleName: string;
  timeSignature: { numerator: number; denominator: number };
  emptyStateMessage?: string;
  lastSavedExportPath?: string;
  lastSavedPngPath?: string;
  lastSavedMusicXmlPath?: string;
  initialUiState?: {
    grid: "16th" | "16th-triplet" | "32nd";
    timeSigNum: number;
    timeSigDen: number;
    legato: boolean;
    showTempo: boolean;
    drumHeads: boolean;
    sortMode: "pitch" | "track" | "native";
  };
}

function doSendMessage(message: unknown) {
  if (window.webkit?.messageHandlers?.live) {
    window.webkit.messageHandlers.live.postMessage(message);
  } else if (window.chrome?.webview) {
    window.chrome.webview.postMessage(message);
  }
}

type DialogAction =
  | { action: "close" }
  | {
      action: "save_png";
      pngDataUrl: string;
      uiState: {
        grid: "16th" | "16th-triplet" | "32nd";
        timeSigNum: number;
        timeSigDen: number;
        legato: boolean;
        showTempo: boolean;
        drumHeads: boolean;
        sortMode: "pitch" | "track" | "native";
      };
    }
  | {
      action: "save_musicxml";
      musicXml: string;
      uiState: {
        grid: "16th" | "16th-triplet" | "32nd";
        timeSigNum: number;
        timeSigDen: number;
        legato: boolean;
        showTempo: boolean;
        drumHeads: boolean;
        sortMode: "pitch" | "track" | "native";
      };
    }
  | {
      action: "save_svg";
      svgString: string;
      uiState: {
        grid: "16th" | "16th-triplet" | "32nd";
        timeSigNum: number;
        timeSigDen: number;
        legato: boolean;
        showTempo: boolean;
        drumHeads: boolean;
        sortMode: "pitch" | "track" | "native";
      };
    };

function sendDialogAction(action: DialogAction) {
  const message = { method: "close_and_send", params: [JSON.stringify(action)] };
  doSendMessage(message);
}

export function closeDialog() {
  sendDialogAction({ action: "close" });
}

export function savePngAndClose(
  pngDataUrl: string,
  uiState: {
    grid: "16th" | "16th-triplet" | "32nd";
    timeSigNum: number;
    timeSigDen: number;
    legato: boolean;
    showTempo: boolean;
    drumHeads: boolean;
    sortMode: "pitch" | "track" | "native";
  },
) {
  sendDialogAction({ action: "save_png", pngDataUrl, uiState });
}

export function saveMusicXmlAndClose(
  musicXml: string,
  uiState: {
    grid: "16th" | "16th-triplet" | "32nd";
    timeSigNum: number;
    timeSigDen: number;
    legato: boolean;
    showTempo: boolean;
    drumHeads: boolean;
    sortMode: "pitch" | "track" | "native";
  },
) {
  sendDialogAction({ action: "save_musicxml", musicXml, uiState });
}

export function saveSvgAndClose(
  svgString: string,
  uiState: {
    grid: "16th" | "16th-triplet" | "32nd";
    timeSigNum: number;
    timeSigDen: number;
    legato: boolean;
    showTempo: boolean;
    drumHeads: boolean;
    sortMode: "pitch" | "track" | "native";
  },
) {
  sendDialogAction({ action: "save_svg", svgString, uiState });
}

export function getNotationData(): NotationData {
  const raw = readNotationPayload();
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through to scaffold
    }
  }
  return {
    clips: [
      {
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
      },
    ],
    tempo: 120,
    rootNote: 0,
    scaleName: "Major",
    timeSignature: { numerator: 4, denominator: 4 },
  };
}

function readNotationPayload(): string | undefined {
  if (typeof window.__NOTATION_DATA__ === "string") {
    return window.__NOTATION_DATA__;
  }

  const payloadUrl = window.__NOTATION_DATA_URL__;
  if (typeof payloadUrl !== "string") {
    return undefined;
  }

  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", payloadUrl, false);
    xhr.send();

    if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
      return xhr.responseText;
    }
  } catch {
    // fall through to scaffold
  }

  return undefined;
}
