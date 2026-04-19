import { useEffect, useState } from "preact/hooks";
import { freshSeed, hasAnyMutation, type MutateControls, ZERO_CONTROLS } from "../variations.js";
import { applyMutations, closeDialog, type SessionMultiPayload } from "./bridge.js";
import { ControlsGrid } from "./controls.js";

// Multi-slot Session selection: shared controls, one in-place mutation per
// selected clip (independent seeds). Variations are intentionally omitted —
// fan-out semantics across arbitrary slot selections get messy, so users go
// to scene mode or single-clip mode when they want variations.
export function SessionMultiApp({ data }: { data: SessionMultiPayload }) {
  const [controls, setControls] = useState<MutateControls>(ZERO_CONTROLS);
  const [baseSeed, setBaseSeed] = useState(() => freshSeed());

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

  const clipCount = data.sources.length;
  const trackNames = new Set(data.sources.map((s) => s.trackName));
  const trackCount = trackNames.size;

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

      <div class="scene-header">
        <div class="title-line">Mutate these clips in place</div>
        <div class="subtitle-line">
          Shared controls, each clip mutates independently. Select a single clip or scene to
          generate variations.
        </div>
      </div>

      <div class="controls-panel">
        <ControlsGrid controls={controls} onChange={setControls} />
      </div>

      <div class="indicator-panel">
        <ul style={{ listStyle: "none", padding: 0, margin: 0, color: "var(--text-dim)" }}>
          {data.sources.map((s, i) => (
            <li key={i} style={{ padding: "2px 0" }}>
              {s.trackName} · {s.clipName || "(unnamed clip)"} · {s.noteCount} note
              {s.noteCount === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
