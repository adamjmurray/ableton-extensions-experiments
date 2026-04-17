import { useEffect, useState } from "preact/hooks";
import type { FillMode } from "../apply.js";
import { freshSeed, ZERO_CONTROLS, type MutateControls } from "../variations.js";
import { applyMutations, closeDialog, type SceneModePayload } from "./bridge.js";
import { ControlsGrid } from "./controls.js";
import { IndicatorGrid, type CellState } from "./indicator-grid.js";

export function SceneModeApp({ data }: { data: SceneModePayload }) {
  const [controls, setControls] = useState<MutateControls>(ZERO_CONTROLS);
  const [variations, setVariations] = useState(4);
  const [fillMode, setFillMode] = useState<FillMode>("skip");
  const [baseSeed, setBaseSeed] = useState(() => freshSeed());

  useEffect(() => {
    setBaseSeed(freshSeed());
  }, [controls, variations]);

  const handleApply = () => {
    applyMutations({
      action: "apply",
      controls,
      variations,
      baseSeed,
      fillMode,
    });
  };

  const rows = variations;
  const cols = data.sources.length;

  const scenesBelow = data.totalScenesInSong - data.sceneIndex - 1;

  const rowIsNewScene = (row: number) => row >= scenesBelow;

  const rowLabelAt = (row: number) =>
    rowIsNewScene(row) ? "New scene" : `Scene ${data.sceneIndex + 1 + 1 + row}`;

  const colLabelAt = (col: number) => data.sources[col]?.trackName ?? "";

  const stateAt = (row: number, col: number): CellState => {
    if (rowIsNewScene(row)) return "write-empty";
    const source = data.sources[col]!;
    const occupied = source.slotsBelowOccupied[row] === true;
    if (!occupied) return "write-empty";
    return fillMode === "skip" ? "skip" : "write-overwrite";
  };

  return (
    <div class="app">
      <div class="toolbar">
        <span class="title">Mutate</span>
        <span class="subtitle">
          Scene {data.sceneIndex + 1}
          {data.sceneName ? `: ${data.sceneName}` : ""}
        </span>
        <div class="toolbar-right">
          <button class="btn" onClick={() => closeDialog()}>
            Cancel
          </button>
          <button class="btn primary" onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>

      <div class="scene-header">
        <div class="title-line">Source: scene {data.sceneIndex + 1}{data.sceneName ? ` · ${data.sceneName}` : ""}</div>
        <div class="subtitle-line">
          {cols} MIDI clip{cols === 1 ? "" : "s"} across {cols} track{cols === 1 ? "" : "s"}
        </div>
      </div>

      <div class="controls-panel">
        <ControlsGrid controls={controls} onChange={setControls} />
        <div class="right-pane">
          <div>
            <div class="section-label">Variations</div>
            <div class="field">
              <input
                type="number"
                min={1}
                max={32}
                step={1}
                value={variations}
                onInput={(e) => {
                  const n = Math.max(1, Math.min(32, Number((e.target as HTMLInputElement).value) | 0));
                  setVariations(n);
                }}
              />
            </div>
          </div>
          <div>
            <div class="section-label">Fill mode</div>
            <div class="btn-group">
              <button
                class={`tab ${fillMode === "skip" ? "active" : ""}`}
                onClick={() => setFillMode("skip")}
              >
                Skip
              </button>
              <button
                class={`tab ${fillMode === "overwrite" ? "active" : ""}`}
                onClick={() => setFillMode("overwrite")}
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="indicator-panel">
        {cols > 0 ? (
          <IndicatorGrid
            rows={rows}
            cols={cols}
            stateAt={stateAt}
            rowLabelAt={rowLabelAt}
            rowIsNewScene={rowIsNewScene}
            colLabelAt={colLabelAt}
          />
        ) : (
          <div style={{ color: "var(--text-dim)" }}>No MIDI clips in this scene.</div>
        )}
      </div>
    </div>
  );
}
