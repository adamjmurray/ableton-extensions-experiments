import { useEffect, useState } from "preact/hooks";
import { freshSeed, hasAnyMutation, type MutateControls, ZERO_CONTROLS } from "../variations.js";
import { applyMutations, closeDialog, type SessionMultiPayload } from "./bridge.js";
import { ControlsGrid } from "./controls.js";
import { PreviewPanel } from "./preview-panel.js";

// Multi-slot Session selection: shared controls, one in-place mutation per
// selected clip (independent seeds). Variations are intentionally omitted —
// fan-out semantics across arbitrary slot selections get messy, so users go
// to scene mode or single-clip mode when they want variations.
export function SessionMultiApp({ data }: { data: SessionMultiPayload }) {
  const [controls, setControls] = useState<MutateControls>(ZERO_CONTROLS);
  const [baseSeed, setBaseSeed] = useState(() => freshSeed());
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setBaseSeed(freshSeed());
  }, [controls]);

  const hasMutation = hasAnyMutation(controls);
  const canApply = hasMutation;

  const handleApply = () => {
    if (!canApply) return;
    applyMutations({
      action: "apply",
      controls,
      variations: 0,
      baseSeed,
      fillMode: "skip", // unused; kept for message shape uniformity
      mutateSource: true,
      variationMode: "independent", // unused; no variations in this mode
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
          {!hasMutation && <span class="hint">Adjust a control to enable Apply</span>}
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
      </div>

      <PreviewPanel
        clips={data.preview}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        controls={controls}
        variations={0}
        mutateSource={true}
        variationMode="independent"
        baseSeed={baseSeed}
        fillMode="skip"
        branch="session"
      />
    </div>
  );
}
