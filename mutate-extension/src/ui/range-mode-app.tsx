import { useEffect, useState } from "preact/hooks";
import { freshSeed, type MutateControls, ZERO_CONTROLS } from "../variations.js";
import { applyMutations, closeDialog, MAX_VARIATIONS, type RangeModePayload } from "./bridge.js";
import { ControlsGrid } from "./controls.js";
import { type CellState, IndicatorGrid } from "./indicator-grid.js";

export function RangeModeApp({ data }: { data: RangeModePayload }) {
  const [controls, setControls] = useState<MutateControls>(ZERO_CONTROLS);
  const [mutateSource, setMutateSource] = useState(true);
  const [variations, setVariations] = useState(0);
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
      fillMode: "skip", // unused in range mode; kept in the message shape for uniformity
      mutateSource,
    });
  };

  const cols = data.tracks.length;
  const sourceRowOffset = mutateSource ? 1 : 0;
  const rows = sourceRowOffset + variations;

  const isSourceRow = (row: number) => mutateSource && row === 0;
  const variationIndexForRow = (row: number) => row - sourceRowOffset;

  const rowLabelAt = (row: number) => {
    if (isSourceRow(row)) return "Source (in-place)";
    return `Mutate ${variationIndexForRow(row) + 1}`;
  };
  const colLabelAt = (col: number) => data.tracks[col]?.trackName ?? "";

  const stateAt = (row: number, _col: number): CellState => {
    if (isSourceRow(row)) return "write-overwrite"; // in-place writes
    return "write-empty"; // new take lane = always empty
  };

  return (
    <div class="app">
      <div class="toolbar">
        <span class="title">Mutate</span>
        <span class="subtitle">
          Range {data.timeStart.toFixed(2)} – {data.timeEnd.toFixed(2)} · {cols} track
          {cols === 1 ? "" : "s"} · {data.totalClipCount} MIDI clip
          {data.totalClipCount === 1 ? "" : "s"}
        </span>
        <div class="toolbar-right">
          <button type="button" class="btn" onClick={() => closeDialog()}>
            Cancel
          </button>
          <button type="button" class="btn primary" onClick={handleApply} disabled={!canApply}>
            Apply
          </button>
        </div>
      </div>

      <div class="scene-header">
        <div class="title-line">
          {data.totalClipCount} MIDI clip{data.totalClipCount === 1 ? "" : "s"} across {cols} track
          {cols === 1 ? "" : "s"}
        </div>
        <div class="subtitle-line">
          Take lanes are always additive — new lanes append per track. No fill mode.
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
              <span>Mutate these clips</span>
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
                  const n = Math.max(
                    0,
                    Math.min(MAX_VARIATIONS, Number((e.target as HTMLInputElement).value) | 0),
                  );
                  setVariations(n);
                }}
              />
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
            colLabelAt={colLabelAt}
          />
        ) : (
          <div style={{ color: "var(--text-dim)" }}>
            {cols === 0 ? "No MIDI clips in this range." : "Nothing to apply."}
          </div>
        )}
      </div>
    </div>
  );
}
