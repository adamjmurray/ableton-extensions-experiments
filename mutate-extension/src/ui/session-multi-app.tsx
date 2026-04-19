import { useEffect, useState } from "preact/hooks";
import type { FillMode } from "../apply.js";
import {
  freshSeed,
  hasAnyMutation,
  type MutateControls,
  type VariationMode,
  ZERO_CONTROLS,
} from "../variations.js";
import { applyMutations, closeDialog, MAX_VARIATIONS, type SessionMultiPayload } from "./bridge.js";
import { ControlsGrid, VariationCountInput } from "./controls.js";
import { PreviewPanel } from "./preview-panel.js";

// Multi-clip Session selection. Variations are available when each track
// contributes at most one clip — variations then fan down the source's column.
// When at least one track has multiple selected clips (multiplePerTrack),
// variations are disabled and we explain why.
export function SessionMultiApp({ data }: { data: SessionMultiPayload }) {
  const variationsAllowed = !data.multiplePerTrack;

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

  const effectiveVariations = variationsAllowed ? variations : 0;
  const hasMutation = hasAnyMutation(controls);
  const canApply = (mutateSource || effectiveVariations > 0) && hasMutation;

  const handleApply = () => {
    if (!canApply) return;
    applyMutations({
      action: "apply",
      controls,
      variations: effectiveVariations,
      baseSeed,
      fillMode,
      mutateSource,
      variationMode,
    });
  };

  const clipCount = data.preview.length;
  const trackCount = new Set(data.preview.map((c) => c.trackName)).size;

  return (
    <div class="app">
      <div class="toolbar">
        <span class="title">Mutate</span>
        <span class="subtitle">
          {clipCount} MIDI clip{clipCount === 1 ? "" : "s"} across {trackCount} track
          {trackCount === 1 ? "" : "s"}
        </span>
        <div class="toolbar-right">
          {!hasMutation ? (
            <span class="hint">Adjust a control to enable Apply</span>
          ) : !mutateSource && effectiveVariations === 0 ? (
            <span class="hint">Mutate these clips or generate variations to apply</span>
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
          {variationsAllowed ? (
            <>
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
                <VariationCountInput
                  value={variations}
                  max={MAX_VARIATIONS}
                  onChange={setVariations}
                />
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
            </>
          ) : (
            <div>
              <div class="section-label">Variations</div>
              <div class="hint hint-lg">
                Unavailable: Session clip variations generate down a track's clip slot column, so
                each track in the selection must contribute at most one clip.
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
        variations={effectiveVariations}
        mutateSource={mutateSource}
        variationMode={variationMode}
        baseSeed={baseSeed}
        fillMode={fillMode}
        branch="session"
        onReroll={() => setBaseSeed(freshSeed())}
      />
    </div>
  );
}
