import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ClipInfo } from "./clip-utils.js";
import notationInterface from "./notation.html";

export interface DialogHost {
  environment: {
    storageDirectory: string | undefined;
    tempDirectory?: string;
  };
  ui: {
    showModalDialog: (url: string, width: number, height: number) => Promise<string>;
  };
}

export interface DialogDeps {
  context: DialogHost;
  notationInterface?: string;
  reportDialogPath?: (filePath: string) => void;
  getMetadata: () => {
    tempo: number;
    rootNote: number;
    scaleName: string;
    timeSignature: { numerator: number; denominator: number };
  };
}

const DIALOG_WIDTH = 1200;
const DIALOG_HEIGHT = 800;

type Grid = "16th" | "16th-triplet" | "32nd";
type SortMode = "pitch" | "track" | "native";

interface DialogUiState {
  grid: Grid;
  timeSigNum: number;
  timeSigDen: number;
  legato: boolean;
  showTempo: boolean;
  drumHeads: boolean;
  sortMode: SortMode;
}

type DialogResult =
  | { action: "close" }
  | { action: "save_png"; pngDataUrl: string; uiState: DialogUiState }
  | { action: "save_musicxml"; musicXml: string; uiState: DialogUiState }
  | { action: "save_svg"; svgString: string; uiState: DialogUiState };

function isGrid(value: unknown): value is Grid {
  return value === "16th" || value === "16th-triplet" || value === "32nd";
}

function isSortMode(value: unknown): value is SortMode {
  return value === "pitch" || value === "track" || value === "native";
}

interface RawDialogResult {
  action?: unknown;
  pngDataUrl?: unknown;
  musicXml?: unknown;
  svgString?: unknown;
  uiState?: unknown;
}

function isValidUiState(v: unknown): v is DialogUiState {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isGrid(o.grid) &&
    typeof o.timeSigNum === "number" &&
    typeof o.timeSigDen === "number" &&
    typeof o.legato === "boolean" &&
    typeof o.showTempo === "boolean" &&
    typeof o.drumHeads === "boolean" &&
    isSortMode(o.sortMode)
  );
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function parsePngDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const encoded = match[1];
  if (!encoded) return null;
  return Buffer.from(encoded, "base64");
}

async function writePngToStorage(
  storageDirectory: string,
  pngDataUrl: string,
): Promise<string | null> {
  const png = parsePngDataUrl(pngDataUrl);
  if (!png) return null;
  await mkdir(storageDirectory, { recursive: true });
  const filePath = join(storageDirectory, `notation-score-${formatTimestamp(new Date())}.png`);
  await writeFile(filePath, png);
  return filePath;
}

async function writeMusicXmlToStorage(
  storageDirectory: string,
  musicXml: string,
): Promise<string | null> {
  if (!musicXml.trim()) return null;
  await mkdir(storageDirectory, { recursive: true });
  const filePath = join(storageDirectory, `notation-score-${formatTimestamp(new Date())}.musicxml`);
  await writeFile(filePath, musicXml, "utf8");
  return filePath;
}

async function writeSvgToStorage(
  storageDirectory: string,
  svgString: string,
): Promise<string | null> {
  if (!svgString.trim()) return null;
  await mkdir(storageDirectory, { recursive: true });
  const filePath = join(storageDirectory, `notation-score-${formatTimestamp(new Date())}.svg`);
  await writeFile(filePath, svgString, "utf8");
  return filePath;
}

function parseDialogResult(raw: string): DialogResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { action: "close" };
  }
  if (!parsed || typeof parsed !== "object") return { action: "close" };
  const r = parsed as RawDialogResult;
  const action = r.action;
  if (action === "close") return { action: "close" };
  if (!isValidUiState(r.uiState)) return { action: "close" };
  const uiState = r.uiState;
  if (action === "save_png" && typeof r.pngDataUrl === "string") {
    return { action: "save_png", pngDataUrl: r.pngDataUrl, uiState };
  }
  if (action === "save_musicxml" && typeof r.musicXml === "string") {
    return { action: "save_musicxml", musicXml: r.musicXml, uiState };
  }
  if (action === "save_svg" && typeof r.svgString === "string") {
    return { action: "save_svg", svgString: r.svgString, uiState };
  }
  return { action: "close" };
}

export async function showNotationDialog(
  deps: DialogDeps,
  clips: ClipInfo[],
  emptyStateMessage?: string,
): Promise<void> {
  const template = deps.notationInterface ?? notationInterface;
  const tempRoot = deps.context.environment.tempDirectory;
  const pngStorageDirectory = deps.context.environment.storageDirectory;
  if (!tempRoot) {
    console.error("Notation: temp directory is unavailable");
    return;
  }
  const dialogDirectory = join(tempRoot, "notation");
  const dialogFilePath = join(dialogDirectory, "notation-dialog.html");
  const dialogDataFilePath = join(dialogDirectory, "notation-dialog.data.js");
  const dialogUrl = pathToFileURL(dialogFilePath).href;
  const dialogDataUrl = pathToFileURL(dialogDataFilePath).href;
  let lastUiState: DialogUiState | undefined;
  let lastSavedExportPath: string | undefined;

  while (true) {
    const metadata = deps.getMetadata();
    const payload = JSON.stringify({
      clips,
      ...metadata,
      ...(emptyStateMessage ? { emptyStateMessage } : {}),
      ...(lastUiState ? { initialUiState: lastUiState } : {}),
      ...(lastSavedExportPath ? { lastSavedExportPath } : {}),
    });

    const bridgeScript = `<script src=${JSON.stringify(dialogDataUrl)}></script>`;
    const html = template.replace("</head>", `${bridgeScript}</head>`);
    const bridgeDataScript = `window.__NOTATION_DATA__=${JSON.stringify(payload)};`;

    try {
      await mkdir(dialogDirectory, { recursive: true });
      await writeFile(dialogDataFilePath, bridgeDataScript, "utf8");
      await writeFile(dialogFilePath, html, "utf8");
      deps.reportDialogPath?.(dialogFilePath);
    } catch (e) {
      console.error("Notation: failed to write dialog files to temp path:", e);
      return;
    }

    try {
      const raw = await deps.context.ui.showModalDialog(dialogUrl, DIALOG_WIDTH, DIALOG_HEIGHT);
      const result = parseDialogResult(raw);
      if (result.action === "close") {
        return;
      }
      if (!pngStorageDirectory) {
        console.error("Notation: storage directory is unavailable for export");
        return;
      }
      try {
        const savedPath =
          result.action === "save_png"
            ? await writePngToStorage(pngStorageDirectory, result.pngDataUrl)
            : result.action === "save_musicxml"
              ? await writeMusicXmlToStorage(pngStorageDirectory, result.musicXml)
              : await writeSvgToStorage(pngStorageDirectory, result.svgString);
        if (!savedPath) {
          const actionName =
            result.action === "save_png"
              ? "PNG"
              : result.action === "save_musicxml"
                ? "MusicXML"
                : "SVG";
          console.error(`Notation: dialog returned invalid ${actionName} data`);
          return;
        }
        deps.reportDialogPath?.(savedPath);
        lastSavedExportPath = savedPath;
        lastUiState = result.uiState;
      } catch (e) {
        console.error("Notation: failed to save export to storage directory:", e);
        return;
      }
    } catch (e) {
      console.error("Notation: dialog failed to show:", e);
      return;
    }
  }
}
