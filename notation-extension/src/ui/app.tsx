import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  type ClipData,
  closeDialog,
  getNotationData,
  type NotationData,
  saveMusicXmlAndClose,
  savePngAndClose,
  saveSvgAndClose,
} from "./bridge.js";
import { notesToMusicXML, type SortMode, sortClipsForScore } from "./musicxml.js";
import { assignUnnamedIndices, buildFullPartName, truncatePartName } from "./part-name.js";
import { type QuantizeGrid, quantizeNotes } from "./quantize.js";

const GRIDS: { value: QuantizeGrid; label: string }[] = [
  { value: "16th", label: "16th" },
  { value: "16th-triplet", label: "16th triplet" },
  { value: "32nd", label: "32nd" },
];

const SORT_MODES: { value: SortMode; label: string; title: string }[] = [
  {
    value: "pitch",
    label: "Pitch",
    title: "Sort parts by pitch (treble above bass, then high to low)",
  },
  { value: "track", label: "Track", title: "Sort parts by track order" },
  { value: "native", label: "Native", title: "Preserve selection order" },
];

function injectPartNameTooltips(container: HTMLDivElement | null, clips: ClipData[]): void {
  if (!container) return;
  const svg = container.querySelector("svg");
  if (!svg) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  let unnamedCount = 0;
  const fullNames = clips.map((c, i) => {
    const clipName = (c.clip.name ?? "").trim();
    const label =
      clipName || (c.clip.trackName ? "" : `(unnamed #${c.clip.unnamedIndex ?? ++unnamedCount})`);
    return buildFullPartName(c.clip.trackName, label, i);
  });

  const byRendered = new Map<string, string[]>();
  for (const full of fullNames) {
    const rendered = truncatePartName(full);
    const bucket = byRendered.get(rendered);
    if (bucket) bucket.push(full);
    else byRendered.set(rendered, [full]);
  }

  const texts = svg.querySelectorAll("text");
  texts.forEach((textEl) => {
    const content = textEl.textContent ?? "";
    const candidates = byRendered.get(content);
    if (!candidates || !content.endsWith("…")) return;
    if (textEl.querySelector("title")) return;
    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = candidates.join(" / ");
    textEl.appendChild(titleEl);
  });
}

// PNG export renders the SVG onto a canvas at PNG_SCALE_FACTOR× CSS size
// (×devicePixelRatio) so it stays sharp on high-DPI displays. If the scaled
// bitmap would exceed PNG_MAX_PIXELS (total RGBA area) or PNG_MAX_DIMENSION on
// either axis, the scale is reduced — ultimately to 1× — to avoid OOM or a
// silent render-to-blank on large multi-part scores. WKWebView (macOS) and
// WebView2 (Windows) cap each axis (Safari renders blank above ~8192) and total
// canvas area independently.
const PNG_SCALE_FACTOR = 2;
// 64 megapixels ≈ 256 MB at RGBA; a conservative ceiling under typical browser caps.
const PNG_MAX_PIXELS = 64 * 1024 * 1024;
// Clamp each side under WebView's per-axis limit before total-pixel clamping.
const PNG_MAX_DIMENSION = 8192;

// Largest scale ≤ desired whose bitmap fits both the per-axis and total-pixel
// caps, floored to ≥1 so we always produce something.
function clampPngScale(desired: number, cssWidth: number, cssHeight: number): number {
  const native = Math.max(1, cssWidth * cssHeight);
  const areaScale = Math.sqrt(PNG_MAX_PIXELS / native);
  const dimScale = Math.min(
    PNG_MAX_DIMENSION / Math.max(1, cssWidth),
    PNG_MAX_DIMENSION / Math.max(1, cssHeight),
  );
  const scale = Math.max(1, Math.min(desired, areaScale, dimScale));
  if (scale < desired) {
    console.warn(
      `PNG export: scaled image would exceed limits (${PNG_MAX_PIXELS}px² or ${PNG_MAX_DIMENSION}px/side); reducing scale ${desired}× → ${scale.toFixed(2)}×.`,
    );
  }
  return scale;
}

async function renderScoreToPngBlob(container: HTMLDivElement): Promise<Blob | undefined> {
  const svg = container.querySelector("svg");
  if (!svg) return;

  const rect = svg.getBoundingClientRect();
  const cloned = svg.cloneNode(true) as SVGSVGElement;
  cloned.setAttribute("width", String(rect.width));
  cloned.setAttribute("height", String(rect.height));
  if (!cloned.getAttribute("xmlns")) {
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(cloned);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load SVG"));
    img.src = url;
  });

  const desiredScale = Math.max(1, Math.floor(PNG_SCALE_FACTOR * window.devicePixelRatio));
  const scale = clampPngScale(desiredScale, rect.width, rect.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.drawImage(img, 0, 0, rect.width, rect.height);
  URL.revokeObjectURL(url);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Canvas export failed");
  return blob;
}

function App() {
  const data = useRef<NotationData>(assignUnnamedIndices(getNotationData()));
  const emptyStateMessage = data.current.emptyStateMessage;
  const lastSavedPath =
    data.current.lastSavedExportPath ??
    data.current.lastSavedPngPath ??
    data.current.lastSavedMusicXmlPath;
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const latestMusicXmlRef = useRef("");
  const baseStatusRef = useRef("Loading...");

  const hasDrumClip = data.current.clips.some((c) => c.isDrumRack);

  const isMultiClip = data.current.clips.length > 1;

  const [grid, setGrid] = useState<QuantizeGrid>(data.current.initialUiState?.grid ?? "16th");
  const [status, setStatus] = useState("Loading...");
  const [timeSigNum, setTimeSigNum] = useState(
    data.current.initialUiState?.timeSigNum ?? data.current.timeSignature.numerator,
  );
  const [timeSigDen, setTimeSigDen] = useState(
    data.current.initialUiState?.timeSigDen ?? data.current.timeSignature.denominator,
  );
  const [legato, setLegato] = useState(data.current.initialUiState?.legato ?? false);
  const [showTempo, setShowTempo] = useState(data.current.initialUiState?.showTempo ?? false);
  const [drumHeads, setDrumHeads] = useState(data.current.initialUiState?.drumHeads ?? hasDrumClip);
  const [sortMode, setSortMode] = useState<SortMode>(
    data.current.initialUiState?.sortMode ?? "pitch",
  );

  const renderNotation = useCallback(
    async (
      g: QuantizeGrid,
      tsNum: number,
      tsDen: number,
      legato: boolean,
      showTempo: boolean,
      drumHeads: boolean,
      sortMode: SortMode,
    ) => {
      if (emptyStateMessage) return;
      if (!containerRef.current) return;

      const quantizedClips: ClipData[] = data.current.clips.map((c) => {
        const qc: ClipData = { notes: quantizeNotes(c.notes, g), clip: c.clip };
        if (c.isDrumRack && drumHeads) qc.isDrumRack = true;
        return qc;
      });

      const orderedClips = sortClipsForScore(quantizedClips, sortMode);
      const totalNotes = orderedClips.reduce((sum, c) => sum + c.notes.length, 0);
      const musicXML = notesToMusicXML(
        orderedClips,
        { numerator: tsNum, denominator: tsDen },
        data.current.rootNote,
        data.current.scaleName,
        legato,
        showTempo ? data.current.tempo : undefined,
      );
      latestMusicXmlRef.current = musicXML;

      try {
        if (!osmdRef.current) {
          osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
            backend: "svg",
            drawTitle: false,
            drawComposer: false,
            drawCredits: false,
            drawPartNames: orderedClips.length > 1,
            autoResize: true,
          });
          osmdRef.current.EngravingRules.InstrumentLabelTextHeight = 1.5;
          osmdRef.current.EngravingRules.PageTopMargin = 1;
          osmdRef.current.EngravingRules.PageBottomMargin = 1;
          osmdRef.current.EngravingRules.PageLeftMargin = 2;
          osmdRef.current.EngravingRules.PageRightMargin = 2;
        }

        await osmdRef.current.load(musicXML);
        osmdRef.current.render();
        injectPartNameTooltips(containerRef.current, orderedClips);
        const partsLabel = orderedClips.length > 1 ? ` | ${orderedClips.length} parts` : "";
        const statusText = `${totalNotes} notes${partsLabel} | ${g} quantization | ${tsNum}/${tsDen}${legato ? " | legato" : ""}`;
        baseStatusRef.current = statusText;
        setStatus(statusText);
      } catch (e) {
        console.error("OSMD render error:", e);
        const errorText = `Render error: ${e}`;
        baseStatusRef.current = errorText;
        setStatus(errorText);
      }
    },
    [],
  );

  useEffect(() => {
    renderNotation(grid, timeSigNum, timeSigDen, legato, showTempo, drumHeads, sortMode);
  }, [grid, timeSigNum, timeSigDen, legato, showTempo, drumHeads, sortMode, renderNotation]);

  async function saveImage() {
    try {
      if (!containerRef.current) return;
      const blob = await renderScoreToPngBlob(containerRef.current);
      if (!blob) return;
      const pngDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const out = reader.result;
          if (typeof out === "string") resolve(out);
          else reject(new Error("Failed to serialize PNG data"));
        };
        reader.onerror = () => reject(new Error("Failed to read PNG blob"));
        reader.readAsDataURL(blob);
      });
      savePngAndClose(pngDataUrl, {
        grid,
        timeSigNum,
        timeSigDen,
        legato,
        showTempo,
        drumHeads,
        sortMode,
      });
    } catch (e) {
      console.error("Save failed:", e);
      setStatus(`Save failed: ${e}`);
      setTimeout(() => setStatus(baseStatusRef.current), 3000);
    }
  }

  function saveSvg() {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector("svg");
    if (!svg) {
      setStatus("SVG export unavailable: score not rendered yet");
      setTimeout(() => setStatus(baseStatusRef.current), 3000);
      return;
    }

    const cloned = svg.cloneNode(true) as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    cloned.setAttribute("width", String(rect.width));
    cloned.setAttribute("height", String(rect.height));
    if (!cloned.getAttribute("xmlns")) {
      cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(cloned);
    saveSvgAndClose(svgString, {
      grid,
      timeSigNum,
      timeSigDen,
      legato,
      showTempo,
      drumHeads,
      sortMode,
    });
  }

  function saveMusicXml() {
    const musicXml = latestMusicXmlRef.current;
    if (!musicXml) {
      setStatus("MusicXML export unavailable: score not rendered yet");
      setTimeout(() => setStatus(baseStatusRef.current), 3000);
      return;
    }
    saveMusicXmlAndClose(musicXml, {
      grid,
      timeSigNum,
      timeSigDen,
      legato,
      showTempo,
      drumHeads,
      sortMode,
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        e.preventDefault();
        void saveImage();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [grid, timeSigNum, timeSigDen, legato, showTempo, drumHeads, sortMode]);

  if (emptyStateMessage) {
    return (
      <div class="app app-empty">
        <div class="empty-state">
          <div class="empty-message">{emptyStateMessage}</div>
          <button type="button" class="btn-close empty-close" onClick={closeDialog}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="app">
      <div class="toolbar">
        <div class="toolbar-group">
          <span class="toolbar-label">Quantize</span>
          <select
            value={grid}
            onChange={(e) => setGrid((e.target as HTMLSelectElement).value as QuantizeGrid)}
            title="Quantize grid"
          >
            {GRIDS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>

        <label class="toolbar-check" title="Extend notes to fill gaps (remove rests)">
          <input
            type="checkbox"
            checked={legato}
            onChange={(e) => setLegato((e.currentTarget as HTMLInputElement).checked)}
          />
          Legato
        </label>

        <div class="toolbar-divider" />

        <div class="toolbar-group">
          <span class="toolbar-label">Time Signature</span>
          <select
            value={timeSigNum}
            onChange={(e) => setTimeSigNum(Number((e.target as HTMLSelectElement).value))}
            title="Time signature numerator"
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span class="separator">/</span>
          <select
            value={timeSigDen}
            onChange={(e) => setTimeSigDen(Number((e.target as HTMLSelectElement).value))}
            title="Time signature denominator"
          >
            {[2, 4, 8, 16].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <label
          class="toolbar-check"
          title={`Show tempo marking (${Math.round(data.current.tempo)} BPM)`}
        >
          <input
            type="checkbox"
            checked={showTempo}
            onChange={(e) => setShowTempo((e.currentTarget as HTMLInputElement).checked)}
          />
          Tempo
        </label>

        {(hasDrumClip || isMultiClip) && <div class="toolbar-divider" />}

        {isMultiClip && (
          <div class="toolbar-group">
            <span class="toolbar-label">Sort Staffs</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode((e.target as HTMLSelectElement).value as SortMode)}
              title="Sort parts"
            >
              {SORT_MODES.map((m) => (
                <option key={m.value} value={m.value} title={m.title}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {hasDrumClip && (
          <label class="toolbar-check" title="Render drum-rack clips with x noteheads">
            <input
              type="checkbox"
              checked={drumHeads}
              onChange={(e) => setDrumHeads((e.currentTarget as HTMLInputElement).checked)}
            />
            Drum Notation
          </label>
        )}

        <button
          type="button"
          class="btn-copy"
          onClick={saveImage}
          title="Save PNG to storage directory (Ctrl/Cmd+S)"
        >
          Save PNG
        </button>
        <button
          type="button"
          class="btn-copy"
          onClick={saveSvg}
          title="Save SVG to storage directory"
        >
          Save SVG
        </button>
        <button
          type="button"
          class="btn-copy"
          onClick={saveMusicXml}
          title="Save MusicXML to storage directory"
        >
          Save MusicXML
        </button>
        <button type="button" class="btn-close" onClick={closeDialog} title="Close">
          &#10005;
        </button>
      </div>

      {lastSavedPath && (
        <div class="saved-path-bar" title={lastSavedPath}>
          Saved: {lastSavedPath}
        </div>
      )}

      <div class="status-bar">{status}</div>

      <div class="notation-container" ref={containerRef} />
    </div>
  );
}

render(<App />, document.getElementById("app")!);
