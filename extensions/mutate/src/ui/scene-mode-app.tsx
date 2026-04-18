import { useEffect, useState } from "preact/hooks";
import type { FillMode } from "../apply.js";
import { freshSeed, ZERO_CONTROLS, type MutateControls } from "../variations.js";
import { applyMutations, closeDialog, MAX_VARIATIONS, type SceneModePayload } from "./bridge.js";
import { ControlsGrid } from "./controls.js";
import { IndicatorGrid, type CellState } from "./indicator-grid.js";

export function SceneModeApp({ data }: { data: SceneModePayload }) {
  const [controls, setControls] = useState<MutateControls>(ZERO_CONTROLS);
  const [mutateSource, setMutateSource] = useState(true);
  const [variations, setVariations] = useState(0);
  const [fillMode, setFillMode] = useState<FillMode>("skip");
  const [baseSeed, setBaseSeed] = useState(() => freshSeed());

  useEffect(() => {
    setBaseSeed(freshSeed());
  }, [controls, variations]);

  const canApply = mutateSource || variations > 0;

  const handleApply = () => {
    if (!canApply) return;
    applyMutations({
      action: "apply",
      controls,
      variations,
      baseSeed,
      fillMode,
      mutateSource,
    });
  };

  const cols = data.sources.length;
  // The indicator grid gets a prepended "source" row when mutateSource is on.
  const sourceRowOffset = mutateSource ? 1 : 0;
  const rows = sourceRowOffset + variations;
  const scenesBelow = data.totalScenesInSong - data.sceneIndex - 1;

  const isSourceRow = (row: number) => mutateSource && row === 0;

  const variationIndexForRow = (row: number) => row - sourceRowOffset;

  const rowIsNewScene = (row: number) => {
    if (isSourceRow(row)) return false;
    return variationIndexForRow(row) >= scenesBelow;
  };

  const rowLabelAt = (row: number) => {
    if (isSourceRow(row)) return `Scene ${data.sceneIndex + 1}`;
    const vi = variationIndexForRow(row);
    return rowIsNewScene(row) ? "New scene" : `Scene ${data.sceneIndex + 1 + 1 + vi}`;
  };

  const colLabelAt = (col: number) => data.sources[col]?.trackName ?? "";

  const stateAt = (row: number, col: number): CellState => {
    if (isSourceRow(row)) return "write-overwrite"; // always rewriting live source clips
    if (rowIsNewScene(row)) return "write-empty";
    const source = data.sources[col]!;
    const vi = variationIndexForRow(row);
    const occupied = source.slotsBelowOccupied[vi] === true;
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
          <button class="btn primary" onClick={handleApply} disabled={!canApply}>
            Apply
          </button>
        </div>
      </div>

      <div class="scene-header">
        <div class="title-line">
          Source: scene {data.sceneIndex + 1}
          {data.sceneName ? ` · ${data.sceneName}` : ""}
        </div>
        <div class="subtitle-line">
          {cols} MIDI clip{cols === 1 ? "" : "s"} across {cols} track{cols === 1 ? "" : "s"}
        </div>
      </div>

      <div class="controls-panel">
        <ControlsGrid controls={controls} onChange={setControls} />
        <div class="right-pane">
          <div>
            <div class="section-label">Target</div>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={mutateSource}
                onInput={(e) => setMutateSource((e.target as HTMLInputElement).checked)}
              />
              <span>Mutate this scene</span>
            </label>
          </div>
          <div>
            <div class="section-label">Variations</div>
            <div class="field">
              <input
                type="number"
                min={0}
                max={MAX_VARIATIONS}
                step={1}
                value={variations}
                onInput={(e) => {
                  const n = Math.max(0, Math.min(MAX_VARIATIONS, Number((e.target as HTMLInputElement).value) | 0));
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
        {cols > 0 && rows > 0 ? (
          <IndicatorGrid
            rows={rows}
            cols={cols}
            stateAt={stateAt}
            rowLabelAt={rowLabelAt}
            rowIsNewScene={rowIsNewScene}
            colLabelAt={colLabelAt}
          />
        ) : (
          <div style={{ color: "var(--text-dim)" }}>
            {cols === 0 ? "No MIDI clips in this scene." : "Nothing to apply."}
          </div>
        )}
      </div>
    </div>
  );
}
