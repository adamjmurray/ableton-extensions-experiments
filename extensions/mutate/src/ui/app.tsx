import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import type { FillMode } from "../apply.js";
import {
  freshSeed,
  generateVariations,
  ZERO_CONTROLS,
  type MutateControls,
} from "../variations.js";
import {
  applyMutations,
  closeDialog,
  getMutateData,
  type DialogPayload,
} from "./bridge.js";
import { ControlsGrid } from "./controls.js";
import { PianoRoll } from "./piano-roll.js";

const SOURCE_WIDTH = 1160;
const SOURCE_HEIGHT = 140;
const THUMB_WIDTH = 224;
const THUMB_HEIGHT = 100;

function App({ data }: { data: DialogPayload }) {
  const [controls, setControls] = useState<MutateControls>(ZERO_CONTROLS);
  const [variations, setVariations] = useState(4);
  const [fillMode, setFillMode] = useState<FillMode>("skip");
  const [baseSeed, setBaseSeed] = useState(() => freshSeed());

  useEffect(() => {
    setBaseSeed(freshSeed());
  }, [controls, variations]);

  const variationNotes = useMemo(
    () => generateVariations(data.sourceNotes, controls, variations, baseSeed, data.bounds),
    [data, controls, variations, baseSeed],
  );

  const handleApply = () => {
    applyMutations({
      action: "apply",
      controls,
      variations,
      baseSeed,
      fillMode,
    });
  };

  return (
    <div class="app">
      <div class="toolbar">
        <span class="title">Mutate</span>
        <span class="subtitle">
          {data.sourceClipName || "(unnamed clip)"}
          {data.trackName ? ` · ${data.trackName}` : ""}
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

      <div class="source-panel">
        <div class="label">Source</div>
        <PianoRoll
          notes={data.sourceNotes}
          bounds={data.bounds}
          width={SOURCE_WIDTH}
          height={SOURCE_HEIGHT}
        />
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

      <div class="variations">
        {variationNotes.map((notes, i) => {
          const occupied = i < data.slotsBelowOccupied.length && data.slotsBelowOccupied[i];
          const noSlot = i >= data.availableSlotsBelow;
          const willSkip = occupied && fillMode === "skip";
          const dimmed = willSkip || noSlot;
          let status = "";
          if (noSlot) status = "no slot";
          else if (willSkip) status = "skip (occupied)";
          else if (occupied) status = "overwrite";
          return (
            <div key={i} class={`variation${dimmed ? " dimmed" : ""}`}>
              <div class="label">
                <span>Var {i + 1}</span>
                {status ? <span class="status">{status}</span> : null}
              </div>
              <PianoRoll
                notes={notes}
                bounds={data.bounds}
                width={THUMB_WIDTH}
                height={THUMB_HEIGHT}
                dimmed={dimmed}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const mount = document.getElementById("app");
if (mount) {
  render(<App data={getMutateData()} />, mount);
}
