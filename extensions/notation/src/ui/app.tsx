import { render } from "preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { getNotationData, closeDialog, exportFile, type NotationData, type ClipData } from "./bridge.js";
import { quantizeNotes, type QuantizeGrid } from "./quantize.js";
import { notesToMusicXML, sortClipsForScore, type SortMode } from "./musicxml.js";
import { assignUnnamedIndices, buildFullPartName, truncatePartName } from "./part-name.js";

const GRIDS: { value: QuantizeGrid; label: string }[] = [
  { value: "16th", label: "16th" },
  { value: "16th-triplet", label: "16th triplet" },
  { value: "32nd", label: "32nd" },
];

const SORT_MODES: { value: SortMode; label: string; title: string }[] = [
  { value: "pitch", label: "Pitch", title: "Sort parts by pitch (treble above bass, then high to low)" },
  { value: "track", label: "Track", title: "Sort parts by track order" },
  { value: "native", label: "Native", title: "Preserve selection order" },
];

// PNG export renders the SVG onto a canvas at this multiple of its native
// dimensions so the bitmap stays sharp on retina/high-DPI displays. If the
// scaled bitmap would exceed PNG_MAX_PIXELS (4 bytes per RGBA pixel) or
// PNG_MAX_DIMENSION on either axis, the scale factor is reduced — and
// ultimately clamped to 1× — to avoid OOM or silent render-to-blank on
// large multi-part scores.
const PNG_SCALE_FACTOR = 2;
// 64 megapixels = ~256 MB at RGBA. Browsers typically cap canvas area
// somewhere between 16 and 256 MP; this is a conservative ceiling.
const PNG_MAX_PIXELS = 64 * 1024 * 1024;
// WKWebView (macOS) and WebView2 (Windows) cap canvas on each axis
// independently; Safari in particular renders blank above ~8192. Clamp
// each side under that before total-pixel clamping.
const PNG_MAX_DIMENSION = 8192;

// SVG → base64 without `unescape` (deprecated). Encodes the UTF-8 bytes
// via TextEncoder, then base64-encodes the resulting binary string.
function svgToBase64(svgData: string): string {
  const bytes = new TextEncoder().encode(svgData);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

// Walk SVG text nodes and attach an SVG <title> child showing the full,
// untruncated part name. We match by exact equality against the truncation
// OSMD renders (same MAX_PART_NAME_LENGTH + "…" rule as the MusicXML
// emitter), so even when two parts share the same truncation prefix, we
// only attach a tooltip when we can unambiguously recover the full name.
// Ambiguous truncations get a joined-with-" / " label so hovering still
// disambiguates which parts collapsed into the shown text.
function injectPartNameTooltips(container: HTMLDivElement | null, clips: ClipData[]): void {
  if (!container) return;
  const svg = container.querySelector("svg");
  if (!svg) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  // Mirror the gating in notesToMusicXML: clips with a track name skip the
  // "(unnamed #N)" fallback; only when both are blank is the label used.
  let unnamedCount = 0;
  const fullNames = clips.map((c, i) => {
    const clipName = (c.clip.name ?? "").trim();
    const label = clipName || (c.clip.trackName ? "" : `(unnamed #${c.clip.unnamedIndex ?? ++unnamedCount})`);
    return buildFullPartName(c.clip.trackName, label, i);
  });

  // Group full names by the label OSMD renders for them. A truncation with
  // multiple entries is an unavoidable collision — we show all of them.
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
    // Only label text nodes that were actually truncated; everything else
    // is either another OSMD label or the full, unambiguous part name.
    if (!candidates || !content.endsWith("…")) return;
    if (textEl.querySelector("title")) return;
    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = candidates.join(" / ");
    textEl.appendChild(titleEl);
  });
}

function App() {
  const data = useRef<NotationData>(assignUnnamedIndices(getNotationData()));
  const emptyStateMessage = data.current.emptyStateMessage;
  const [errorBanner, setErrorBanner] = useState<string | undefined>(data.current.errorMessage);
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);

  const hasDrumClip = data.current.clips.some((c) => c.isDrumRack);

  const isMultiClip = data.current.clips.length > 1;

  const [grid, setGrid] = useState<QuantizeGrid>("16th");
  const [status, setStatus] = useState("Loading...");
  const [debugXML, setDebugXML] = useState("");
  const [view, setView] = useState<"notation" | "xml">("notation");
  const [timeSigNum, setTimeSigNum] = useState(data.current.timeSignature.numerator);
  const [timeSigDen, setTimeSigDen] = useState(data.current.timeSignature.denominator);
  const [legato, setLegato] = useState(false);
  const [showTempo, setShowTempo] = useState(false);
  const [drumHeads, setDrumHeads] = useState(hasDrumClip);
  const [sortMode, setSortMode] = useState<SortMode>("pitch");

  const renderNotation = useCallback(async (g: QuantizeGrid, tsNum: number, tsDen: number, legato: boolean, showTempo: boolean, drumHeads: boolean, sortMode: SortMode) => {
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

    setDebugXML(musicXML);

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
      setStatus(`${totalNotes} notes${partsLabel} | ${g} quantization | ${tsNum}/${tsDen}${legato ? " | legato" : ""}`);
    } catch (e) {
      console.error("OSMD render error:", e);
      setStatus(`Render error: ${e}`);
    }
  }, []);

  useEffect(() => {
    renderNotation(grid, timeSigNum, timeSigDen, legato, showTempo, drumHeads, sortMode);
  }, [grid, timeSigNum, timeSigDen, legato, showTempo, drumHeads, sortMode, renderNotation]);

  const clipName = data.current.clips.length === 1
    ? (data.current.clips[0]?.clip.name || "notation")
    : "score";

  const handleExportSVG = useCallback(() => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    exportFile(svgData, `${clipName}.svg`);
  }, [clipName]);

  const handleExportPNG = useCallback(() => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();

    img.onload = () => {
      try {
        // Pick the largest scale (≤ PNG_SCALE_FACTOR) whose bitmap fits in
        // both PNG_MAX_PIXELS (total area) and PNG_MAX_DIMENSION (per-axis),
        // then floor to ≥1 so we always produce something. The per-axis cap
        // matters for long multi-part scores that fit under the total-pixel
        // budget but still blow past WebView's width/height limit.
        const native = Math.max(1, img.width * img.height);
        const areaScale = Math.sqrt(PNG_MAX_PIXELS / native);
        const dimScale = Math.min(
          PNG_MAX_DIMENSION / Math.max(1, img.width),
          PNG_MAX_DIMENSION / Math.max(1, img.height),
        );
        const scale = Math.max(1, Math.min(PNG_SCALE_FACTOR, areaScale, dimScale));
        if (scale < PNG_SCALE_FACTOR) {
          console.warn(
            `PNG export: scaled image would exceed limits (${PNG_MAX_PIXELS}px² or ${PNG_MAX_DIMENSION}px/side); reducing scale ${PNG_SCALE_FACTOR}× → ${scale.toFixed(2)}×.`,
          );
        }

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        canvas.width = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);
        ctx.scale(scale, scale);
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, img.width, img.height);
        ctx.drawImage(img, 0, 0);

        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
        exportFile(base64, `${clipName}.png`, "base64");
      } catch (e) {
        console.error("PNG export failed during canvas encode:", e);
        setStatus(`PNG export failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    img.onerror = (e) => {
      console.error("PNG export failed: could not load SVG into Image:", e);
      setStatus("PNG export failed: could not render SVG");
    };

    img.src = `data:image/svg+xml;base64,${svgToBase64(svgData)}`;
  }, [clipName]);

  const handleExportXML = useCallback(() => {
    if (!debugXML) return;
    exportFile(debugXML, `${clipName}.music.xml`);
  }, [debugXML, clipName]);

  if (emptyStateMessage) {
    return (
      <div class="app app-empty">
        <div class="empty-state">
          <div class="empty-message">{emptyStateMessage}</div>
          <button class="btn-close empty-close" onClick={closeDialog}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div class="app">
      <div class="toolbar">
        <div class="toolbar-group">
          <div class="btn-group">
            {GRIDS.map((g) => (
              <button
                key={g.value}
                class={grid === g.value ? "active" : ""}
                onClick={() => setGrid(g.value)}
                title={`Quantize to ${g.label}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div class="toolbar-group">
          <div class="btn-group">
            <button class={legato ? "active" : ""} onClick={() => setLegato((v) => !v)} title="Extend notes to fill gaps (remove rests)">
              Legato
            </button>
            <button class={showTempo ? "active" : ""} onClick={() => setShowTempo((v) => !v)} title={`Show tempo marking (${Math.round(data.current.tempo)} BPM)`}>
              Tempo
            </button>
            {hasDrumClip && (
              <button class={drumHeads ? "active" : ""} onClick={() => setDrumHeads((v) => !v)} title="Render drum-rack clips with x noteheads">
                Drums
              </button>
            )}
          </div>
        </div>

        {isMultiClip && (
          <div class="toolbar-group">
            <div class="btn-group">
              {SORT_MODES.map((m) => (
                <button
                  key={m.value}
                  class={sortMode === m.value ? "active" : ""}
                  onClick={() => setSortMode(m.value)}
                  title={m.title}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div class="toolbar-group">
          <select
            value={timeSigNum}
            onChange={(e) => setTimeSigNum(Number((e.target as HTMLSelectElement).value))}
            title="Time signature numerator"
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 12].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span class="separator">/</span>
          <select
            value={timeSigDen}
            onChange={(e) => setTimeSigDen(Number((e.target as HTMLSelectElement).value))}
            title="Time signature denominator"
          >
            {[2, 4, 8, 16].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div class="toolbar-group">
          <div class="btn-group">
            <button class={view === "notation" ? "active" : ""} onClick={() => setView("notation")} title="Show notation">Notation</button>
            <button class={view === "xml" ? "active" : ""} onClick={() => setView("xml")} title="Show MusicXML source">MusicXML</button>
          </div>
        </div>

        <div class="toolbar-group toolbar-right">
          {view === "notation" && (
            <>
              <button class="btn-export" onClick={handleExportSVG} title="Export as SVG">&#8599; SVG</button>
              <button class="btn-export" onClick={handleExportPNG} title="Export as PNG">&#8599; PNG</button>
            </>
          )}
          {view === "xml" && (
            <button class="btn-export" onClick={handleExportXML} title="Export as MusicXML">&#8599; XML</button>
          )}
          <button class="btn-close" onClick={closeDialog} title="Close">&#10005;</button>
        </div>
      </div>

      {errorBanner && (
        <div class="error-banner" role="alert">
          <span class="error-banner-message">{errorBanner}</span>
          <button
            class="error-banner-dismiss"
            onClick={() => setErrorBanner(undefined)}
            title="Dismiss"
            aria-label="Dismiss error"
          >
            &#10005;
          </button>
        </div>
      )}

      <div class="status-bar">{status}</div>

      <pre class="xml-view" style={{ display: view === "xml" ? "block" : "none" }}>{debugXML}</pre>
      <div class="notation-container" ref={containerRef} style={{ display: view === "notation" ? "flex" : "none" }} />
    </div>
  );
}

render(<App />, document.getElementById("app")!);
