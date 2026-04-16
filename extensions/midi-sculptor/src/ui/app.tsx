import { render } from "preact";
import { useState, useCallback, useEffect } from "preact/hooks";
import {
  XYPad,
  HSlider,
  ButtonGroup,
  NotePreview,
  RangeControl,
  IconClamp,
  IconReflect,
  IconWrap,
  IconRemove,
  IconAnchorMin,
  IconAnchorMid,
  IconAnchorMax,
} from "./components.js";
import {
  PROPERTIES,
  generateNotes,
  generateRandomSeeds,
  applyShift,
  applySpread,
  applyRandomize2D,
  applySwapRotate,
  applySwapReverse,
  applySwapPairs,
  applySwapZip,
  applySplitInto,
  applySplitInTime,
  type PreviewNote,
  type RandomSeeds,
} from "./domain.js";
import { closeWithResult, getInitialNotes } from "./bridge.js";

const TABS = ["slide", "swap", "set", "split"] as const;
type Tab = (typeof TABS)[number];

// --- Slide Tool ---
function SlideTool({ notes }: { notes: PreviewNote[] }) {
  const [prop, setProp] = useState("velocity");
  const [range, setRange] = useState(PROPERTIES.velocity!.range);
  const [edge, setEdge] = useState("clamp");
  const [anchor, setAnchor] = useState("mid");
  const [shiftAmt, setShiftAmt] = useState(0);
  const [spreadAmt, setSpreadAmt] = useState(0);
  const [xyVal, setXYVal] = useState({ x: 0, y: 0 });
  const [seeds, setSeeds] = useState<RandomSeeds>(() => generateRandomSeeds(notes.length));
  const [activeControl, setActiveControl] = useState<string | null>(null);

  useEffect(() => {
    setRange(PROPERTIES[prop]?.range ?? 1);
  }, [prop]);

  const regenerateSeeds = useCallback(() => {
    setSeeds(generateRandomSeeds(notes.length));
    setXYVal({ x: 0, y: 0 });
  }, [notes.length]);

  let modified = notes;
  if (activeControl === "shift" && shiftAmt !== 0) {
    modified = applyShift(notes, prop, shiftAmt, range, edge);
  } else if (activeControl === "randomize" && (xyVal.x !== 0 || xyVal.y !== 0)) {
    modified = applyRandomize2D(notes, prop, xyVal.x, xyVal.y, range, seeds, edge);
  } else if (activeControl === "spread" && spreadAmt !== 0) {
    modified = applySpread(notes, prop, spreadAmt, range, anchor, edge);
  }

  const handleApply = () => {
    closeWithResult({
      tool: "slide",
      operation: activeControl || "shift",
      property: prop,
      amount:
        activeControl === "randomize"
          ? [xyVal.x, xyVal.y]
          : activeControl === "spread"
            ? spreadAmt
            : shiftAmt,
      range,
      edgeBehavior: edge,
      anchor,
    });
  };

  return (
    <div>
      {/* Property + Range */}
      <div class="row-center">
        <ButtonGroup
          label="Property"
          options={Object.entries(PROPERTIES).map(([k, v]) => ({
            value: k,
            label: v.label,
          }))}
          value={prop}
          onChange={setProp}
        />
        <RangeControl
          value={range}
          onChange={setRange}
          maxVal={PROPERTIES[prop]?.max ?? 127}
          unit={PROPERTIES[prop]?.unit ?? ""}
          decimal={PROPERTIES[prop]?.decimal ?? false}
        />
      </div>

      {/* Preview */}
      <div class="row-center mt-md">
        <NotePreview original={notes} modified={modified} prop={prop} />
      </div>

      {/* Controls */}
      <div class="row-center mt-md gap-lg">
        <HSlider
          value={shiftAmt}
          onChange={(v) => {
            setActiveControl("shift");
            setShiftAmt(v);
          }}
          onRelease={() => {
            setShiftAmt(0);
            setActiveControl(null);
          }}
          label="Shift"
          width={130}
        />
        <XYPad
          value={xyVal}
          onChange={(v) => {
            setActiveControl("randomize");
            setXYVal(v);
          }}
          onRelease={regenerateSeeds}
          size={130}
          label="Randomize"
        />
        <HSlider
          value={spreadAmt}
          onChange={(v) => {
            setActiveControl("spread");
            setSpreadAmt(v);
          }}
          onRelease={() => {
            setSpreadAmt(0);
            setActiveControl(null);
          }}
          label="Spread"
          width={130}
        />
      </div>

      {/* Edge + Anchor */}
      <div class="row-center mt-md">
        <ButtonGroup
          label="Edge Behavior"
          options={[
            { value: "clamp", label: <span><IconClamp /> Clamp</span> },
            { value: "reflect", label: <span><IconReflect /> Reflect</span> },
            { value: "rotate", label: <span><IconWrap /> Wrap</span> },
            { value: "remove", label: <span><IconRemove /> None</span> },
          ]}
          value={edge}
          onChange={setEdge}
        />
        <ButtonGroup
          label="Spread Anchor"
          options={[
            { value: "min", label: <span><IconAnchorMin /> Low</span> },
            { value: "mid", label: <span><IconAnchorMid /> Mid</span> },
            { value: "max", label: <span><IconAnchorMax /> High</span> },
          ]}
          value={anchor}
          onChange={setAnchor}
        />
      </div>

      {/* Legend */}
      <div class="row-center mt-md" style={{ fontSize: 10, color: "var(--text-muted)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 12, height: 4, background: "#444", borderRadius: 1 }} />
          <span>Original</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 12, height: 4, background: "var(--accent)", borderRadius: 1 }} />
          <span>Modified</span>
        </div>
      </div>

      <div class="row-center mt-md">
        <button class="btn-action" onClick={handleApply}>
          Apply & Close
        </button>
      </div>
    </div>
  );
}

// --- Swap Tool ---
function SwapTool({ notes }: { notes: PreviewNote[] }) {
  const [targets, setTargets] = useState({
    pitch: true,
    velocity: true,
    duration: true,
  });
  const [rotateAmt, setRotateAmt] = useState(0);
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const [xyVal, setXYVal] = useState({ x: 0, y: 0 });

  const targetList = Object.entries(targets)
    .filter(([_, v]) => v)
    .map(([k]) => k);

  let modified = notes;
  if (activeOp === "rotate" && rotateAmt !== 0) {
    modified = applySwapRotate(notes, rotateAmt, targetList);
  } else if (activeOp === "reverse") {
    modified = applySwapReverse(notes, targetList);
  } else if (activeOp === "pairs") {
    modified = applySwapPairs(notes, targetList);
  } else if (activeOp === "zip") {
    modified = applySwapZip(notes, targetList);
  }

  const handleApply = (op: string, amount?: number | [number, number]) => {
    closeWithResult({
      tool: "swap",
      operation: op,
      amount,
      targets,
    });
  };

  return (
    <div>
      <div class="section-label">Targets</div>
      <div class="checkbox-row">
        {["pitch", "velocity", "duration", "velrange", "release"].map((t) => (
          <label key={t}>
            <input
              type="checkbox"
              checked={(targets as any)[t] ?? false}
              onChange={(e) =>
                setTargets((prev) => ({
                  ...prev,
                  [t]: (e.target as HTMLInputElement).checked,
                }))
              }
            />
            {t}
          </label>
        ))}
      </div>

      <div class="row-center mt-md">
        <NotePreview original={notes} modified={modified} prop="pitch" />
      </div>

      <div class="row-center mt-md gap-lg">
        <HSlider
          value={rotateAmt}
          onChange={(v) => {
            setActiveOp("rotate");
            setRotateAmt(v);
          }}
          onRelease={() => {
            setRotateAmt(0);
            setActiveOp(null);
          }}
          label="Rotate"
          width={160}
        />
        <XYPad
          value={xyVal}
          onChange={(v) => {
            setActiveOp("random");
            setXYVal(v);
          }}
          onRelease={() => setXYVal({ x: 0, y: 0 })}
          size={120}
          label="Randomize"
        />
      </div>

      <div class="section-label mt-md">Quick Operations</div>
      <div class="row-center gap-sm">
        <button
          class="btn-action secondary"
          onPointerDown={() => setActiveOp("pairs")}
          onPointerUp={() => setActiveOp(null)}
          onClick={() => handleApply("pairs")}
        >
          Pairs
        </button>
        <button
          class="btn-action secondary"
          onPointerDown={() => setActiveOp("reverse")}
          onPointerUp={() => setActiveOp(null)}
          onClick={() => handleApply("reverse")}
        >
          Reverse
        </button>
        <button
          class="btn-action secondary"
          onPointerDown={() => setActiveOp("zip")}
          onPointerUp={() => setActiveOp(null)}
          onClick={() => handleApply("zip")}
        >
          Zip
        </button>
        <button class="btn-action secondary" onClick={() => handleApply("unzip")}>
          Unzip
        </button>
      </div>

      <div class="row-center mt-md">
        <button class="btn-action" onClick={() => handleApply("rotate", rotateAmt)}>
          Apply & Close
        </button>
      </div>
    </div>
  );
}

// --- Set Tool ---
function SetTool({ notes }: { notes: PreviewNote[] }) {
  const [prop, setProp] = useState("note");
  const [value, setValue] = useState("muted");
  const [xyVal, setXYVal] = useState({ x: 0, y: 0 });

  const handleApply = (op: string, amount?: [number, number]) => {
    closeWithResult({
      tool: "set",
      operation: op,
      property: prop,
      value: isNaN(Number(value)) ? value : Number(value),
      amount,
    });
  };

  return (
    <div>
      <div class="row gap-sm">
        <ButtonGroup
          label="Property"
          options={[
            { value: "note", label: "Note" },
            { value: "pitch", label: "Pitch" },
            { value: "velocity", label: "Velocity" },
            { value: "duration", label: "Duration" },
          ]}
          value={prop}
          onChange={setProp}
        />
      </div>

      <div class="row mt-md gap-sm">
        <span class="label">Value</span>
        {prop === "note" ? (
          <div class="btn-group">
            {["muted", "unmuted", "deleted"].map((v) => (
              <button
                key={v}
                class={value === v ? "active" : ""}
                onClick={() => setValue(v)}
              >
                {v}
              </button>
            ))}
          </div>
        ) : (
          <input
            type="number"
            value={value}
            step="any"
            onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          />
        )}
      </div>

      <div class="row-center mt-md">
        <NotePreview original={notes} modified={notes} prop="pitch" />
      </div>

      <div class="section-label mt-md">Operations</div>
      <div class="row-center gap-lg">
        <button class="btn-action" onClick={() => handleApply("all")}>
          Set All
        </button>
        <XYPad
          value={xyVal}
          onChange={setXYVal}
          onRelease={() => setXYVal({ x: 0, y: 0 })}
          size={120}
          label="Random Set"
        />
        <button
          class="btn-action"
          onClick={() => handleApply("random", [xyVal.x, xyVal.y])}
        >
          Apply Random
        </button>
      </div>
    </div>
  );
}

// --- Split Tool ---
function SplitTool({ notes }: { notes: PreviewNote[] }) {
  const [splitType, setSplitType] = useState("note");
  const [amount1, setAmount1] = useState(2);
  const [amount2, setAmount2] = useState(1);
  const [gate, setGate] = useState(1);
  const [envelope, setEnvelope] = useState("none");
  const [tiltAmt, setTiltAmt] = useState(0);

  let modified = notes;
  if (splitType === "note") {
    modified = applySplitInto(notes, amount1, gate);
  } else if (splitType === "time") {
    modified = applySplitInTime(notes, amount1, gate);
  }

  const handleSplit = () => {
    closeWithResult({
      tool: "split",
      operation: "split",
      splitType,
      amount1,
      amount2,
      gate,
      envelope,
    });
  };

  const handleTilt = () => {
    closeWithResult({
      tool: "split",
      operation: "tilt",
      splitType,
      amount1,
      amount2,
      gate,
      envelope,
      tiltAmount: tiltAmt,
    });
  };

  return (
    <div>
      <div class="row gap-sm">
        <ButtonGroup
          label="Split Type"
          options={[
            { value: "note", label: "By Count" },
            { value: "time", label: "By Time" },
            { value: "euclid", label: "Euclidean" },
            { value: "halves", label: "Halves" },
          ]}
          value={splitType}
          onChange={setSplitType}
        />
      </div>

      <div class="row mt-md gap-sm">
        <span class="label">
          {splitType === "time" ? "Time" : splitType === "euclid" ? "Pulses" : "Count"}
        </span>
        <input
          type="number"
          value={amount1}
          min={1}
          step={splitType === "time" ? 0.25 : 1}
          onInput={(e) => setAmount1(Number((e.target as HTMLInputElement).value))}
        />
        {(splitType === "euclid" || splitType === "halves") && (
          <>
            <span class="label">{splitType === "euclid" ? "Total" : "Divisions"}</span>
            <input
              type="number"
              value={amount2}
              min={1}
              step={1}
              onInput={(e) => setAmount2(Number((e.target as HTMLInputElement).value))}
            />
          </>
        )}
      </div>

      <div class="row mt-md gap-sm">
        <span class="label">Gate</span>
        <HSlider
          value={gate}
          onChange={setGate}
          min={0.05}
          max={1}
          width={140}
          springBack={false}
        />
        <span style={{ fontSize: 10, color: "var(--text-dim)", minWidth: 28 }}>
          {(gate * 100).toFixed(0)}%
        </span>
      </div>

      <div class="row mt-md gap-sm">
        <ButtonGroup
          label="Envelope"
          options={[
            { value: "none", label: "None" },
            { value: "fade-out", label: "Fade Out" },
            { value: "fade-in", label: "Fade In" },
            { value: "ramp-down", label: "Ramp Down" },
            { value: "ramp-up", label: "Ramp Up" },
          ]}
          value={envelope}
          onChange={setEnvelope}
        />
      </div>

      <div class="row-center mt-md">
        <NotePreview original={notes} modified={modified} prop="pitch" />
      </div>

      <div class="row-center mt-md gap-lg">
        <button class="btn-action" onClick={handleSplit}>
          Split
        </button>
        <HSlider
          value={tiltAmt}
          onChange={setTiltAmt}
          min={-1}
          max={1}
          width={140}
          springBack={false}
          label="Tilt"
        />
        <button class="btn-action" onClick={handleTilt}>
          Apply Tilt
        </button>
      </div>
    </div>
  );
}

// --- Main App ---
function App() {
  const [tab, setTab] = useState<Tab>("slide");

  // Try to load real notes from extension, fall back to generated
  const [notes] = useState<PreviewNote[]>(() => {
    const initial = getInitialNotes();
    if (initial.length > 0) {
      return initial.map((n: any) => ({
        pitch: n.pitch ?? 60,
        velocity: n.velocity ?? 100,
        start: n.start ?? 0,
        duration: n.duration ?? 1,
      }));
    }
    return generateNotes(12);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Title */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px 0",
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--accent)",
            boxShadow: "0 0 6px var(--accent-dim)",
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase" as const,
            color: "#ccc",
          }}
        >
          MIDI Sculptor
        </span>
      </div>

      {/* Tab bar */}
      <div class="tab-bar">
        {TABS.map((t) => (
          <button
            key={t}
            class={`tab-btn ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div class="panel-container">
        {tab === "slide" && <SlideTool notes={notes} />}
        {tab === "swap" && <SwapTool notes={notes} />}
        {tab === "set" && <SetTool notes={notes} />}
        {tab === "split" && <SplitTool notes={notes} />}
      </div>

      {/* Footer */}
      <div class="footer">
        <button class="btn-action secondary" onClick={() => closeWithResult({ cancelled: true })}>
          Cancel
        </button>
      </div>
    </div>
  );
}

render(<App />, document.getElementById("app")!);
