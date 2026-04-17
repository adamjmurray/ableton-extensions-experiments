import type { ControlRange } from "../control.js";
import type { MutateControls } from "../variations.js";

type ControlKey = keyof MutateControls;

const ROWS: { key: ControlKey; label: string; step: number }[] = [
  { key: "velocity", label: "Velocity", step: 1 },
  { key: "start", label: "Start", step: 0.05 },
  { key: "duration", label: "Duration", step: 0.05 },
  { key: "probability", label: "Probability", step: 0.05 },
  { key: "drop", label: "Drop", step: 0.05 },
  { key: "swap", label: "Swap", step: 0.05 },
];

function OffsetRangeRow({
  label,
  step,
  value,
  onChange,
}: {
  label: string;
  step: number;
  value: ControlRange;
  onChange: (next: ControlRange) => void;
}) {
  return (
    <>
      <div class="row-label">{label}</div>
      <div class="field">
        <span class="field-label">off</span>
        <input
          type="number"
          step={step}
          value={value.offset}
          onInput={(e) =>
            onChange({ ...value, offset: Number((e.target as HTMLInputElement).value) })
          }
        />
      </div>
      <div class="field">
        <span class="field-label">rng</span>
        <input
          type="number"
          step={step}
          min={0}
          value={value.range}
          onInput={(e) =>
            onChange({ ...value, range: Number((e.target as HTMLInputElement).value) })
          }
        />
      </div>
    </>
  );
}

export function ControlsGrid({
  controls,
  onChange,
}: {
  controls: MutateControls;
  onChange: (next: MutateControls) => void;
}) {
  return (
    <div class="controls-grid">
      {ROWS.map((row) => (
        <OffsetRangeRow
          key={row.key}
          label={row.label}
          step={row.step}
          value={controls[row.key]}
          onChange={(next) => onChange({ ...controls, [row.key]: next })}
        />
      ))}
    </div>
  );
}
