import { useEffect, useState } from "preact/hooks";
import type { ControlRange } from "../control.js";
import type { MutateControls } from "../variations.js";

export function VariationCountInput({
  value,
  min = 0,
  max,
  onChange,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [overMax, setOverMax] = useState(false);

  useEffect(() => {
    setText(String(value));
    setOverMax(false);
  }, [value]);

  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const commit = (n: number) => {
    const c = clamp(n);
    setOverMax(false);
    setText(String(c));
    if (c !== value) onChange(c);
  };

  return (
    <>
      <div class="stepper">
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          value={text}
          onInput={(e) => {
            const raw = (e.target as HTMLInputElement).value;
            setText(raw);
            if (raw === "") {
              setOverMax(false);
              return;
            }
            const parsed = Number(raw) | 0;
            if (Number.isFinite(parsed)) {
              setOverMax(parsed > max || parsed < min);
              const c = clamp(parsed);
              if (c !== value) onChange(c);
            }
          }}
          onBlur={(e) => {
            const raw = (e.target as HTMLInputElement).value;
            const parsed = raw === "" ? min : Number(raw) | 0;
            commit(Number.isFinite(parsed) ? parsed : min);
          }}
        />
        <div class="stepper-buttons">
          <button
            type="button"
            class="stepper-btn"
            aria-label="Increment"
            disabled={value >= max}
            onClick={() => commit(value + 1)}
          >
            ▲
          </button>
          <button
            type="button"
            class="stepper-btn"
            aria-label="Decrement"
            disabled={value <= min}
            onClick={() => commit(value - 1)}
          >
            ▼
          </button>
        </div>
      </div>
      {overMax && <div class="hint warn">Max is {max}</div>}
    </>
  );
}

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

function NumberField({
  value,
  min,
  max,
  step,
  integer = false,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  onChange: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
  }, [value]);

  const clamp = (n: number) => {
    const v = integer ? Math.trunc(n) : n;
    return Math.max(min, Math.min(max, v));
  };

  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={text}
      onKeyDown={(e) => {
        if (integer && (e.key === "." || e.key === "e" || e.key === "E")) {
          e.preventDefault();
        }
        if (min >= 0 && e.key === "-") {
          e.preventDefault();
        }
      }}
      onInput={(e) => {
        const raw = (e.target as HTMLInputElement).value;
        setText(raw);
        if (raw === "" || raw === "-" || raw.endsWith(".")) return;
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          const c = clamp(parsed);
          if (c !== value) onChange(c);
        }
      }}
      onBlur={(e) => {
        const raw = (e.target as HTMLInputElement).value;
        const parsed = raw === "" || raw === "-" ? value : Number(raw);
        const c = Number.isFinite(parsed) ? clamp(parsed) : value;
        setText(String(c));
        if (c !== value) onChange(c);
      }}
    />
  );
}

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
  const bipolar = min < 0;
  const pct = ((value - min) / (max - min)) * 100;
  const clampedPct = Math.max(0, Math.min(100, pct));
  const fromPct = bipolar ? Math.min(50, clampedPct) : 0;
  const toPct = bipolar ? Math.max(50, clampedPct) : clampedPct;
  const sliderStyle = {
    "--fill-from": `${fromPct}%`,
    "--fill-to": `${toPct}%`,
  } as Record<string, string>;
  return (
    <div class="field">
      <div class={`slider${bipolar ? " slider--bipolar" : ""}`} style={sliderStyle}>
        <input
          type="range"
          min={min}
          max={max}
          step={sliderStep}
          value={value}
          onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        />
        {bipolar && <span class="slider-notch" />}
      </div>
      <NumberField
        value={value}
        min={min}
        max={max}
        step={numberStep}
        integer={Number.isInteger(numberStep) && Number.isInteger(sliderStep)}
        onChange={onChange}
      />
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
