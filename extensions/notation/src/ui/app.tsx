import { render } from "preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { getNotationData, closeDialog, exportFile, type NotationData } from "./bridge.js";
import { quantizeNotes, type QuantizeGrid } from "./quantize.js";
import { notesToMusicXML } from "./musicxml.js";

const GRIDS: { value: QuantizeGrid; label: string }[] = [
  { value: "16th", label: "16th" },
  { value: "16th-triplet", label: "16th triplet" },
  { value: "32nd", label: "32nd" },
];

function App() {
  const data = useRef<NotationData>(getNotationData());
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);

  const [grid, setGrid] = useState<QuantizeGrid>("16th");
  const [status, setStatus] = useState("Loading...");
  const [debugXML, setDebugXML] = useState("");
  const [view, setView] = useState<"notation" | "xml">("notation");
  const [timeSigNum, setTimeSigNum] = useState(data.current.timeSignature.numerator);
  const [timeSigDen, setTimeSigDen] = useState(data.current.timeSignature.denominator);

  const renderNotation = useCallback(async (g: QuantizeGrid, tsNum: number, tsDen: number) => {
    if (!containerRef.current) return;

    const quantized = quantizeNotes(data.current.notes, g);
    const musicXML = notesToMusicXML(
      quantized,
      { numerator: tsNum, denominator: tsDen },
      data.current.rootNote,
      data.current.scaleName,
      data.current.clip.start,
      data.current.clip.end,
    );

    setDebugXML(musicXML);

    try {
      if (!osmdRef.current) {
        osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
          backend: "svg",
          drawTitle: false,
          drawComposer: false,
          drawCredits: false,
          autoResize: true,
        });
      }

      await osmdRef.current.load(musicXML);
      osmdRef.current.render();
      setStatus(`${quantized.length} notes | ${g} quantization | ${tsNum}/${tsDen}`);
    } catch (e) {
      console.error("OSMD render error:", e);
      setStatus(`Render error: ${e}`);
    }
  }, []);

  useEffect(() => {
    renderNotation(grid, timeSigNum, timeSigDen);
  }, [grid, timeSigNum, timeSigDen, renderNotation]);

  const clipName = data.current.clip.name || "notation";

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


  return (
    <div class="app">
      <div class="toolbar">
        <div class="toolbar-group">
          <span class="label">Quantize</span>
          <div class="btn-group">
            {GRIDS.map((g) => (
              <button
                key={g.value}
                class={grid === g.value ? "active" : ""}
                onClick={() => setGrid(g.value)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div class="toolbar-group">
          <span class="label">Time Sig</span>
          <select
            value={timeSigNum}
            onChange={(e) => setTimeSigNum(Number((e.target as HTMLSelectElement).value))}
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 12].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span class="separator">/</span>
          <select
            value={timeSigDen}
            onChange={(e) => setTimeSigDen(Number((e.target as HTMLSelectElement).value))}
          >
            {[2, 4, 8, 16].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div class="toolbar-group">
          <span class="label">View</span>
          <div class="btn-group">
            <button class={view === "notation" ? "active" : ""} onClick={() => setView("notation")}>Notation</button>
            <button class={view === "xml" ? "active" : ""} onClick={() => setView("xml")}>XML</button>
          </div>
        </div>

        <div class="toolbar-group toolbar-right">
          {view === "notation" && (
            <>
              <button class="btn-export" onClick={handleExportSVG}>SVG</button>
              <button class="btn-export" onClick={handleExportPNG}>PNG</button>
            </>
          )}
          <button class="btn-close" onClick={closeDialog}>Close</button>
        </div>
      </div>

      <div class="status-bar">{status}</div>

      <pre class="xml-view" style={{ display: view === "xml" ? "block" : "none" }}>{debugXML}</pre>
      <div class="notation-container" ref={containerRef} style={{ display: view === "notation" ? "flex" : "none" }} />
    </div>
  );
}

render(<App />, document.getElementById("app")!);
