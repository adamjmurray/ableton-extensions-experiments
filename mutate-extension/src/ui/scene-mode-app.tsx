import { useEffect, useState } from "preact/hooks";
import type { FillMode } from "../apply.js";
import {
  freshSeed,
  hasAnyMutation,
  type MutateControls,
  type VariationMode,
  ZERO_CONTROLS,
} from "../variations.js";
import { applyMutations, closeDialog, MAX_VARIATIONS, type SceneModePayload } from "./bridge.js";
import { ControlsGrid, VariationCountInput } from "./controls.js";
import { PreviewPanel } from "./preview-panel.js";

export function SceneModeApp({ data }: { data: SceneModePayload }) {
  const [controls, setControls] = useState<MutateControls>(ZERO_CONTROLS);
  const [mutateSource, setMutateSource] = useState(true);
  const [variations, setVariations] = useState(0);
  const [fillMode, setFillMode] = useState<FillMode>("skip");
  const [variationMode, setVariationMode] = useState<VariationMode>("independent");
  const [baseSeed, setBaseSeed] = useState(() => freshSeed());
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setBaseSeed(freshSeed());
  }, [controls, variations]);

  const hasMutation = hasAnyMutation(controls);
  const canApply = (mutateSource || variations > 0) && hasMutation;

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

  const clipCount = data.preview.length;

  return (
    <div class="app">
      <div class="toolbar">
        <span class="title">Mutate</span>
        <span class="subtitle">
          Scene {data.sceneIndex + 1}
          {data.sceneName ? `: ${data.sceneName}` : ""} · {clipCount} MIDI clip
          {clipCount === 1 ? "" : "s"}
        </span>
        <div class="toolbar-right">
          {!hasMutation ? (
            <span class="hint">Adjust a control to enable Apply</span>
          ) : !mutateSource && variations === 0 ? (
            <span class="hint">Mutate this scene or generate variations to apply</span>
          ) : null}
          <button type="button" class="btn" onClick={() => closeDialog()}>
            Cancel
          </button>
          <button type="button" class="btn primary" onClick={handleApply} disabled={!canApply}>
            Apply
          </button>
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
            <VariationCountInput value={variations} max={MAX_VARIATIONS} onChange={setVariations} />
          </div>
          {variations > 0 && (
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
        </div>
      </div>

      <PreviewPanel
        clips={data.preview}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        controls={controls}
        variations={variations}
        mutateSource={mutateSource}
        variationMode={variationMode}
        baseSeed={baseSeed}
        fillMode={fillMode}
        branch="session"
      />
    </div>
  );
}
