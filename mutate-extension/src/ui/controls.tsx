import type { ControlRange } from "../control.js";
import type { MutateControls } from "../variations.js";

type ControlKey = keyof MutateControls;

type RowConfig = {
  key: ControlKey;
  label: string;
  numberStep: number;
  sliderStep: number;
  offsetMin: number;
  offsetMax: number;
  rangeMax: number;
};

const ROWS: RowConfig[] = [
  {
    key: "velocity",
    label: "Velocity",
    numberStep: 1,
    sliderStep: 1,
    offsetMin: -127,
    offsetMax: 127,
    rangeMax: 127,
  },
  {
    key: "start",
    label: "Start",
    numberStep: 0.05,
    sliderStep: 0.01,
    offsetMin: -1,
    offsetMax: 1,
    rangeMax: 1,
  },
  {
    key: "duration",
    label: "Duration",
    numberStep: 0.05,
    sliderStep: 0.01,
    offsetMin: -1,
    offsetMax: 1,
    rangeMax: 1,
  },
  {
    key: "probability",
    label: "Probability",
    numberStep: 0.05,
    sliderStep: 0.01,
    offsetMin: -1,
    offsetMax: 1,
    rangeMax: 1,
  },
  {
    key: "drop",
    label: "Drop",
    numberStep: 0.05,
    sliderStep: 0.01,
    offsetMin: 0,
    offsetMax: 1,
    rangeMax: 1,
  },
  {
    key: "swap",
    label: "Swap",
    numberStep: 0.05,
    sliderStep: 0.01,
    offsetMin: 0,
    offsetMax: 1,
    rangeMax: 1,
  },
];

function SliderField({
  value,
  min,
  max,
  sliderStep,
  numberStep,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  sliderStep: number;
  numberStep: number;
  onChange: (next: number) => void;
}) {
  const handle = (e: Event) => onChange(Number((e.target as HTMLInputElement).value));
  return (
    <div class="field">
      <input type="range" min={min} max={max} step={sliderStep} value={value} onInput={handle} />
      <input type="number" step={numberStep} min={min} max={max} value={value} onInput={handle} />
    </div>
  );
}

function OffsetRangeRow({
  row,
  value,
  onChange,
}: {
  row: RowConfig;
  value: ControlRange;
  onChange: (next: ControlRange) => void;
}) {
  return (
    <>
      <div class="row-label">{row.label}</div>
      <SliderField
        value={value.offset}
        min={row.offsetMin}
        max={row.offsetMax}
        sliderStep={row.sliderStep}
        numberStep={row.numberStep}
        onChange={(offset) => onChange({ ...value, offset })}
      />
      <SliderField
        value={value.range}
        min={0}
        max={row.rangeMax}
        sliderStep={row.sliderStep}
        numberStep={row.numberStep}
        onChange={(range) => onChange({ ...value, range })}
      />
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
      <div />
      <div class="header">Offset</div>
      <div class="header">Random Range</div>
      {ROWS.map((row) => (
        <OffsetRangeRow
          key={row.key}
          row={row}
          value={controls[row.key]}
          onChange={(next) => onChange({ ...controls, [row.key]: next })}
        />
      ))}
    </div>
  );
}
