import { render } from "preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { getNotationData, closeDialog, exportFile, type NotationData, type ClipData } from "./bridge.js";
import { quantizeNotes, type QuantizeGrid } from "./quantize.js";
import { notesToMusicXML } from "./musicxml.js";

const GRIDS: { value: QuantizeGrid; label: string }[] = [
  { value: "16th", label: "16th" },
  { value: "16th-triplet", label: "16th triplet" },
  { value: "32nd", label: "32nd" },
];

function buildFullPartName(trackName: string, label: string, index: number): string {
  const t = (trackName ?? "").trim();
  const c = label.trim();
  if (t && c) return `[${t}] ${c}`;
  if (t) return `[${t}]`;
  if (c) return c;
  return `Part ${index + 1}`;
}

// Walk SVG text nodes ending with "…" and match them to their original full
// part name by prefix, then add an SVG <title> child so browsers show a
// native tooltip on hover. OSMD does not tag part-name labels, so we rely on
// the truncation marker + prefix match.
function injectPartNameTooltips(container: HTMLDivElement | null, clips: ClipData[]): void {
  if (!container) return;
  const svg = container.querySelector("svg");
  if (!svg) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  let unnamedCount = 0;
  const fullNames = clips.map((c, i) => {
    const clipName = (c.clip.name ?? "").trim();
    const label = clipName || `(unnamed ${++unnamedCount})`;
    return buildFullPartName(c.clip.trackName, label, i);
  });

  const texts = svg.querySelectorAll("text");
  texts.forEach((textEl) => {
    const content = textEl.textContent ?? "";
    if (!content.endsWith("…")) return;
    const prefix = content.slice(0, -1);
    const full = fullNames.find((n) => n.startsWith(prefix));
    if (!full) return;
    if (textEl.querySelector("title")) return;
    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = full;
    textEl.appendChild(titleEl);
  });
}

function App() {
  const data = useRef<NotationData>(getNotationData());
  const emptyStateMessage = data.current.emptyStateMessage;
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);

  const [grid, setGrid] = useState<QuantizeGrid>("16th");
  const [status, setStatus] = useState("Loading...");
  const [debugXML, setDebugXML] = useState("");
  const [view, setView] = useState<"notation" | "xml">("notation");
  const [timeSigNum, setTimeSigNum] = useState(data.current.timeSignature.numerator);
  const [timeSigDen, setTimeSigDen] = useState(data.current.timeSignature.denominator);
  const [legato, setLegato] = useState(false);
  const [showTempo, setShowTempo] = useState(false);

  const renderNotation = useCallback(async (g: QuantizeGrid, tsNum: number, tsDen: number, legato: boolean, showTempo: boolean) => {
    if (emptyStateMessage) return;
    if (!containerRef.current) return;

    const quantizedClips: ClipData[] = data.current.clips.map((c) => ({
      notes: quantizeNotes(c.notes, g),
      clip: c.clip,
    }));

    const totalNotes = quantizedClips.reduce((sum, c) => sum + c.notes.length, 0);
    const musicXML = notesToMusicXML(
      quantizedClips,
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
          drawPartNames: quantizedClips.length > 1,
          autoResize: true,
        });
        osmdRef.current.EngravingRules.InstrumentLabelTextHeight = 1.5;
        osmdRef.current.EngravingRules.PageTopMargin = 1;
        osmdRef.current.EngravingRules.PageBottomMargin = 1;
        osmdRef.current.EngravingRules.PageLeftMargin = 2;
        osmdRef.current.EngravingRules.PageRightMargin = 2;
      } else if (quantizedClips.length > 1) {
        osmdRef.current.setOptions({ drawPartNames: true });
      }

      await osmdRef.current.load(musicXML);
      osmdRef.current.render();
      injectPartNameTooltips(containerRef.current, quantizedClips);
      const partsLabel = quantizedClips.length > 1 ? ` | ${quantizedClips.length} parts` : "";
      setStatus(`${totalNotes} notes${partsLabel} | ${g} quantization | ${tsNum}/${tsDen}${legato ? " | legato" : ""}`);
    } catch (e) {
      console.error("OSMD render error:", e);
      setStatus(`Render error: ${e}`);
    }
  }, []);

  useEffect(() => {
    renderNotation(grid, timeSigNum, timeSigDen, legato, showTempo);
  }, [grid, timeSigNum, timeSigDen, legato, showTempo, renderNotation]);

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
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.scale(2, 2);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);

      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      exportFile(base64, `${clipName}.png`, "base64");
    };

    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
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
          </div>
        </div>

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
              <button class="btn-export" onClick={handleExportSVG} title="Download as SVG">&#8595; SVG</button>
              <button class="btn-export" onClick={handleExportPNG} title="Download as PNG">&#8595; PNG</button>
            </>
          )}
          {view === "xml" && (
            <button class="btn-export" onClick={handleExportXML} title="Download as MusicXML">&#8595; XML</button>
          )}
          <button class="btn-close" onClick={closeDialog} title="Close">&#10005;</button>
        </div>
      </div>

      <div class="status-bar">{status}</div>

      <pre class="xml-view" style={{ display: view === "xml" ? "block" : "none" }}>{debugXML}</pre>
      <div class="notation-container" ref={containerRef} style={{ display: view === "notation" ? "flex" : "none" }} />
    </div>
  );
}

render(<App />, document.getElementById("app")!);
