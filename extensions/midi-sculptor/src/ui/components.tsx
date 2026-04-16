import { useRef, useCallback } from "preact/hooks";
import type { JSX } from "preact";

function clampVal(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// --- XY Pad ---
interface XYPadProps {
  value: { x: number; y: number };
  onChange: (v: { x: number; y: number }) => void;
  onRelease?: () => void;
  size?: number;
  label?: string;
}

export function XYPad({ value, onChange, onRelease, size = 140, label }: XYPadProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const toXY = useCallback(
    (e: PointerEvent) => {
      const rect = ref.current!.getBoundingClientRect();
      const x = clampVal((e.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
      const y = clampVal(-((e.clientY - rect.top) / rect.height * 2 - 1), -1, 1);
      return { x, y };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      dragging.current = true;
      ref.current!.setPointerCapture(e.pointerId);
      onChange(toXY(e));
    },
    [onChange, toXY],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      onChange(toXY(e));
    },
    [onChange, toXY],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
    onRelease?.();
  }, [onRelease]);

  const px = (value.x + 1) / 2 * 100;
  const py = (1 - (value.y + 1) / 2) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        ref={ref}
        onPointerDown={handlePointerDown as any}
        onPointerMove={handlePointerMove as any}
        onPointerUp={handlePointerUp}
        style={{
          width: size,
          height: size,
          background: "var(--input-bg)",
          border: "1px solid var(--border)",
          borderRadius: 2,
          position: "relative",
          cursor: "crosshair",
          touchAction: "none",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--grid)" }} />
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "var(--grid)" }} />
        <div
          style={{
            position: "absolute",
            left: `${px}%`,
            top: `${py}%`,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "var(--accent)",
            border: "2px solid var(--accent-hover)",
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 8px var(--accent-dim)",
            pointerEvents: "none",
          }}
        />
      </div>
      {label && <span class="label">{label}</span>}
    </div>
  );
}

// --- Horizontal Slider ---
interface HSliderProps {
  value: number;
  onChange: (v: number) => void;
  onRelease?: () => void;
  min?: number;
  max?: number;
  label?: string;
  width?: number;
  springBack?: boolean;
}

export function HSlider({
  value,
  onChange,
  onRelease,
  min = -1,
  max = 1,
  label,
  width = 160,
  springBack = true,
}: HSliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const toVal = useCallback(
    (e: PointerEvent) => {
      const rect = ref.current!.getBoundingClientRect();
      return clampVal(min + ((e.clientX - rect.left) / rect.width) * (max - min), min, max);
    },
    [min, max],
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      dragging.current = true;
      ref.current!.setPointerCapture(e.pointerId);
      onChange(toVal(e));
    },
    [onChange, toVal],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      onChange(toVal(e));
    },
    [onChange, toVal],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
    if (springBack) onChange(0);
    onRelease?.();
  }, [onChange, onRelease, springBack]);

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        ref={ref}
        onPointerDown={handlePointerDown as any}
        onPointerMove={handlePointerMove as any}
        onPointerUp={handlePointerUp}
        style={{
          width,
          height: 20,
          background: "var(--input-bg)",
          border: "1px solid var(--border)",
          borderRadius: 2,
          position: "relative",
          cursor: "ew-resize",
          touchAction: "none",
        }}
      >
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--grid)" }} />
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: "50%",
            width: 4,
            height: 14,
            borderRadius: 1,
            background: "var(--accent)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      </div>
      {label && <span class="label">{label}</span>}
    </div>
  );
}

// --- Button Group ---
interface ButtonOption {
  value: string;
  label: string | JSX.Element;
}

interface ButtonGroupProps {
  options: ButtonOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function ButtonGroup({ options, value, onChange, label }: ButtonGroupProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <span class="label">{label}</span>}
      <div class="btn-group">
        {options.map((opt) => (
          <button
            key={opt.value}
            class={value === opt.value ? "active" : ""}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Note Preview (mini piano roll) ---
interface PreviewNote {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

interface NotePreviewProps {
  original: PreviewNote[];
  modified: PreviewNote[];
  prop: string;
  width?: number;
  height?: number;
}

export function NotePreview({ original, modified, prop, width = 380, height = 100 }: NotePreviewProps) {
  const allNotes = [...original, ...modified];
  if (!allNotes.length) {
    return (
      <svg width={width} height={height} style={{ background: "#111", borderRadius: 2, border: "1px solid var(--border-dim)" }}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="#555" fontSize={11}>No notes</text>
      </svg>
    );
  }

  const propVals = allNotes.map((n) => (n as Record<string, number>)[prop] ?? 0);
  const pMin = Math.min(...propVals);
  const pMax = Math.max(...propVals);
  const pRange = pMax - pMin || 1;

  const sMin = Math.min(...allNotes.map((n) => n.start));
  const sMax = Math.max(...allNotes.map((n) => n.start + n.duration));
  const sRange = sMax - sMin || 1;

  const toX = (s: number) => ((s - sMin) / sRange) * (width - 16) + 8;
  const toY = (v: number) => height - 8 - ((v - pMin) / pRange) * (height - 16);
  const noteH = Math.max(3, Math.min(8, ((height - 16) / (original.length || 1)) * 0.6));

  return (
    <svg width={width} height={height} style={{ background: "#111", borderRadius: 2, border: "1px solid var(--border-dim)" }}>
      {Array.from({ length: 5 }, (_, i) => {
        const y = 8 + (i * (height - 16)) / 4;
        return <line key={i} x1={8} x2={width - 8} y1={y} y2={y} stroke="var(--grid)" strokeWidth={0.5} />;
      })}
      {original.map((n, i) => (
        <rect
          key={`o${i}`}
          x={toX(n.start)}
          y={toY((n as Record<string, number>)[prop] ?? 0) - noteH / 2}
          width={Math.max(2, toX(n.start + n.duration) - toX(n.start))}
          height={noteH}
          fill="#444"
          rx={1}
        />
      ))}
      {modified.map((n, i) => (
        <rect
          key={`m${i}`}
          x={toX(n.start)}
          y={toY((n as Record<string, number>)[prop] ?? 0) - noteH / 2}
          width={Math.max(2, toX(n.start + n.duration) - toX(n.start))}
          height={noteH}
          fill="var(--accent)"
          opacity={0.85}
          rx={1}
        />
      ))}
    </svg>
  );
}

// --- Range Knob ---
interface RangeControlProps {
  value: number;
  onChange: (v: number) => void;
  maxVal?: number;
  unit?: string;
  decimal?: boolean;
}

export function RangeControl({ value, onChange, maxVal = 127, unit = "", decimal = false }: RangeControlProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const handlePointerDown = (e: PointerEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    ref.current!.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const delta = (startY.current - e.clientY) * 0.5;
    onChange(Math.max(0, startVal.current + delta));
  };
  const handlePointerUp = () => {
    dragging.current = false;
  };

  const angle = clampVal((value / maxVal) * 360, 0, 360);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <span class="label">Range</span>
      <div
        ref={ref}
        onPointerDown={handlePointerDown as any}
        onPointerMove={handlePointerMove as any}
        onPointerUp={handlePointerUp}
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: `conic-gradient(var(--accent) 0deg, var(--accent) ${angle}deg, var(--panel) ${angle}deg)`,
          border: "2px solid var(--border)",
          cursor: "ns-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "none",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--panel)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: "var(--text)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {decimal ? value.toFixed(1) : Math.round(value)}
        </div>
      </div>
      {unit && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{unit}</span>}
    </div>
  );
}

// --- SVG Icons for edge behavior & anchor ---
export function IconClamp() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style={{ marginRight: 2 }}>
      <path d="M1 9 L1 5 L13 5 L13 9" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M4 8 L4 5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M7 2 L7 5" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

export function IconReflect() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style={{ marginRight: 2 }}>
      <path d="M1 9 L7 1 L13 9" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export function IconWrap() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style={{ marginRight: 2 }}>
      <path d="M1 5 L5 1 L9 5 L13 1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export function IconRemove() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style={{ marginRight: 2 }}>
      <line x1="1" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="1" x2="7" y2="9" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
    </svg>
  );
}

export function IconAnchorMin() {
  return (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="none" style={{ marginRight: 2 }}>
      <line x1="1" y1="9" x2="1" y2="1" stroke="var(--accent)" strokeWidth="2" />
      <line x1="5" y1="9" x2="5" y2="4" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="9" y1="9" x2="9" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

export function IconAnchorMid() {
  return (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="none" style={{ marginRight: 2 }}>
      <line x1="1" y1="9" x2="1" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="6" y1="9" x2="6" y2="1" stroke="var(--accent)" strokeWidth="2" />
      <line x1="11" y1="9" x2="11" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

export function IconAnchorMax() {
  return (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="none" style={{ marginRight: 2 }}>
      <line x1="3" y1="9" x2="3" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="7" y1="9" x2="7" y2="4" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="11" y1="9" x2="11" y2="1" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}
