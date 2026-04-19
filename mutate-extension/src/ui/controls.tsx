import type { ControlRange } from "../control.js";
import type { MutateControls } from "../variations.js";

type RangeRowConfig = {
  key: "velocity" | "start" | "duration" | "probability";
  label: string;
  numberStep: number;
  sliderStep: number;
  offsetMin: number;
  offsetMax: number;
  rangeMax: number;
};

type AmountRowConfig = {
  key: "drop" | "swap";
  label: string;
  numberStep: number;
  sliderStep: number;
};

const RANGE_ROWS: RangeRowConfig[] = [
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
];

const AMOUNT_ROWS: AmountRowConfig[] = [
  { key: "drop", label: "Delete", numberStep: 0.05, sliderStep: 0.01 },
  { key: "swap", label: "Swap", numberStep: 0.05, sliderStep: 0.01 },
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
  row: RangeRowConfig;
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

function AmountRow({
  row,
  value,
  onChange,
}: {
  row: AmountRowConfig;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <>
      <div class="row-label">{row.label}</div>
      <div class="amount-cell">
        <SliderField
          value={value}
          min={0}
          max={1}
          sliderStep={row.sliderStep}
          numberStep={row.numberStep}
          onChange={onChange}
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
      <div />
      <div class="header">Offset</div>
      <div class="header">Random Range</div>
      {RANGE_ROWS.map((row) => (
        <OffsetRangeRow
          key={row.key}
          row={row}
          value={controls[row.key]}
          onChange={(next) => onChange({ ...controls, [row.key]: next })}
        />
      ))}
      <div class="divider" />
      <div />
      <div class="header amount-header">Amount</div>
      {AMOUNT_ROWS.map((row) => (
        <AmountRow
          key={row.key}
          row={row}
          value={controls[row.key]}
          onChange={(next) => onChange({ ...controls, [row.key]: next })}
        />
      ))}
    </div>
  );
}
