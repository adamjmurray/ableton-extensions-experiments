import { useEffect, useMemo, useState } from "preact/hooks";
import type { FillMode } from "../apply.js";
import { deriveSeed } from "../rng.js";
import {
  freshSeed,
  generateVariations,
  hasAnyMutation,
  type MutateControls,
  type VariationMode,
  ZERO_CONTROLS,
} from "../variations.js";
import { applyMutations, type ClipModePayload, closeDialog, MAX_VARIATIONS } from "./bridge.js";
import { ControlsGrid } from "./controls.js";
import { PianoRoll } from "./piano-roll.js";

const SOURCE_WIDTH = 1160;
const SOURCE_HEIGHT = 140;
const THUMB_WIDTH = 224;
const THUMB_HEIGHT = 100;

export function ClipModeApp({ data }: { data: ClipModePayload }) {
  const [controls, setControls] = useState<MutateControls>(ZERO_CONTROLS);
  const [mutateSource, setMutateSource] = useState(true);
  const [variations, setVariations] = useState(0);
  const [fillMode, setFillMode] = useState<FillMode>("skip");
  const [variationMode, setVariationMode] = useState<VariationMode>("independent");
  const [baseSeed, setBaseSeed] = useState(() => freshSeed());

  useEffect(() => {
    setBaseSeed(freshSeed());
  }, [controls, variations]);

  const { inPlaceNotes, variationNotes } = useMemo(() => {
    if (variationMode === "cumulative") {
      const total = (mutateSource ? 1 : 0) + variations;
      const chain = generateVariations(
        data.sourceNotes,
        controls,
        total,
        baseSeed,
        data.bounds,
        "cumulative",
      );
      return {
        inPlaceNotes: mutateSource ? (chain[0] ?? null) : null,
        variationNotes: mutateSource ? chain.slice(1) : chain,
      };
    }
    const inPlace = mutateSource
      ? generateVariations(data.sourceNotes, controls, 1, deriveSeed(baseSeed, 0), data.bounds)[0]!
      : null;
    const vars = Array.from(
      { length: variations },
      (_, i) =>
        generateVariations(
          data.sourceNotes,
          controls,
          1,
          deriveSeed(baseSeed, i + 1),
          data.bounds,
        )[0]!,
    );
    return { inPlaceNotes: inPlace, variationNotes: vars };
  }, [data, controls, variations, baseSeed, mutateSource, variationMode]);

  const hasMutation = hasAnyMutation(controls);
  const canApply = (mutateSource || variations > 0) && hasMutation;
  const isArrangement = data.branch === "arrangement";
  const varLabel = isArrangement ? "Mutate" : "Var";

  const handleApply = () => {
    if (!canApply) return;
    applyMutations({
      action: "apply",
      controls,
      variations,
      baseSeed,
      fillMode,
      mutateSource,
      variationMode,
    });
  };

  return (
    <div class="app">
      <div class="toolbar">
        <span class="title">Mutate</span>
        <span class="subtitle">
          {data.sourceClipName || "(unnamed clip)"}
          {data.trackName ? ` · ${data.trackName}` : ""}
          {isArrangement ? " · Arrangement" : ""}
        </span>
        <div class="toolbar-right">
          {!hasMutation && <span class="hint">Adjust a control to enable Apply</span>}
          <button type="button" class="btn" onClick={() => closeDialog()}>
            Cancel
          </button>
          <button type="button" class="btn primary" onClick={handleApply} disabled={!canApply}>
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
            <div class="section-label">Target</div>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={mutateSource}
                onInput={(e) => setMutateSource((e.target as HTMLInputElement).checked)}
              />
              <span>Mutate this clip</span>
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
            {!isArrangement && variations > data.availableSlotsBelow && (
              <div class="hint">
                {variations - data.availableSlotsBelow} new scene
                {variations - data.availableSlotsBelow === 1 ? "" : "s"} will be created
              </div>
            )}
          </div>
          {variations > 0 && (
            <div>
              <div class="section-label">Variation mode</div>
              <div class="btn-group">
                <button
                  type="button"
                  class={`tab ${variationMode === "independent" ? "active" : ""}`}
                  onClick={() => setVariationMode("independent")}
                  title="Each variation mutates the original clip"
                >
                  Independent
                </button>
                <button
                  type="button"
                  class={`tab ${variationMode === "cumulative" ? "active" : ""}`}
                  onClick={() => setVariationMode("cumulative")}
                  title="Each variation mutates the previous variation"
                >
                  Cumulative
                </button>
              </div>
            </div>
          )}
          {!isArrangement && variations > 0 && (
            <div>
              <div class="section-label">Occupied slots</div>
              <div class="btn-group">
                <button
                  type="button"
                  class={`tab ${fillMode === "skip" ? "active" : ""}`}
                  onClick={() => setFillMode("skip")}
                >
                  Skip
                </button>
                <button
                  type="button"
                  class={`tab ${fillMode === "overwrite" ? "active" : ""}`}
                  onClick={() => setFillMode("overwrite")}
                >
                  Overwrite
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div class="variations">
        {inPlaceNotes && (
          <div class="variation in-place">
            <div class="label">
              <span>Source (in-place)</span>
              <span class="status">overwrite</span>
            </div>
            <PianoRoll
              notes={inPlaceNotes}
              bounds={data.bounds}
              width={THUMB_WIDTH}
              height={THUMB_HEIGHT}
            />
          </div>
        )}
        {variationNotes.map((notes, i) => {
          if (data.branch === "arrangement") {
            return (
              <div key={i} class="variation">
                <div class="label">
                  <span>
                    {varLabel} {i + 1}
                  </span>
                  <span class="status">new lane</span>
                </div>
                <PianoRoll
                  notes={notes}
                  bounds={data.bounds}
                  width={THUMB_WIDTH}
                  height={THUMB_HEIGHT}
                />
              </div>
            );
          }
          const occupied = i < data.slotsBelowOccupied.length && data.slotsBelowOccupied[i];
          const noSlot = i >= data.availableSlotsBelow;
          const willSkip = !!occupied && fillMode === "skip";
          const dimmed = willSkip;
          let status = "";
          if (noSlot) status = "new scene";
          else if (willSkip) status = "skip (occupied)";
          else if (occupied) status = "overwrite";
          return (
            <div key={i} class={`variation${dimmed ? " dimmed" : ""}`}>
              <div class="label">
                <span>
                  {varLabel} {i + 1}
                </span>
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
