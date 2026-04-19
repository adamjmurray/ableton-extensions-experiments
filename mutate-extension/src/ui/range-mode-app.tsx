import { useEffect, useState } from "preact/hooks";
import {
  freshSeed,
  hasAnyMutation,
  type MutateControls,
  type VariationMode,
  ZERO_CONTROLS,
} from "../variations.js";
import { applyMutations, closeDialog, MAX_VARIATIONS, type RangeModePayload } from "./bridge.js";
import { ControlsGrid, VariationCountInput } from "./controls.js";

export function RangeModeApp({ data }: { data: RangeModePayload }) {
  const [controls, setControls] = useState<MutateControls>(ZERO_CONTROLS);
  const [mutateSource, setMutateSource] = useState(true);
  const [variations, setVariations] = useState(0);
  const [variationMode, setVariationMode] = useState<VariationMode>("independent");
  const [baseSeed, setBaseSeed] = useState(() => freshSeed());

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
      fillMode: "skip", // unused in range mode; kept in the message shape for uniformity
      mutateSource,
      variationMode,
    });
  };

  const clipCount = data.clips.length;
  const trackNames = new Set(data.clips.map((c) => c.trackName));
  const trackCount = trackNames.size;

  return (
    <div class="app">
      <div class="toolbar">
        <span class="title">Mutate</span>
        <span class="subtitle">
          {data.scopeLabel ?? `Range ${data.timeStart.toFixed(2)} – ${data.timeEnd.toFixed(2)}`} ·{" "}
          {trackCount} track{trackCount === 1 ? "" : "s"} · {clipCount} MIDI clip
          {clipCount === 1 ? "" : "s"}
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

      <div class="scene-header">
        <div class="title-line">
          {clipCount} MIDI clip{clipCount === 1 ? "" : "s"} across {trackCount} track
          {trackCount === 1 ? "" : "s"}
        </div>
        <div class="subtitle-line">
          Take lanes are always additive — variations append new lanes per track.
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
            <VariationCountInput value={variations} max={MAX_VARIATIONS} onChange={setVariations} />
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
        </div>
      </div>

      <div class="indicator-panel">
        {clipCount > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, color: "var(--text-dim)" }}>
            {data.clips.map((c, i) => (
              <li key={i} style={{ padding: "2px 0" }}>
                {c.trackName} · {c.clipName || "(unnamed clip)"} · {c.noteCount} note
                {c.noteCount === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ color: "var(--text-dim)" }}>No MIDI clips in this range.</div>
        )}
      </div>
    </div>
  );
}
