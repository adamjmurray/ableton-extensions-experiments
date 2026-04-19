import type { ClipBounds, Note } from "../transforms.js";

export type PianoRollColor = { r: number; g: number; b: number };
export const DEFAULT_PIANO_ROLL_COLOR: PianoRollColor = { r: 255, g: 102, b: 17 };

export function PianoRoll({
  notes,
  bounds,
  width,
  height,
  dimmed = false,
  color = DEFAULT_PIANO_ROLL_COLOR,
}: {
  notes: Note[];
  bounds: ClipBounds;
  width: number;
  height: number;
  dimmed?: boolean;
  color?: PianoRollColor;
}) {
  const strokeR = Math.min(255, color.r + 34);
  const strokeG = Math.min(255, color.g + 34);
  const strokeB = Math.min(255, color.b + 34);
  const span = Math.max(bounds.end - bounds.start, 1e-6);

  let minP = 60;
  let maxP = 72;
  if (notes.length > 0) {
    minP = notes.reduce((m, n) => Math.min(m, n.pitch), notes[0]!.pitch);
    maxP = notes.reduce((m, n) => Math.max(m, n.pitch), notes[0]!.pitch);
    if (maxP - minP < 7) {
      const mid = (maxP + minP) / 2;
      minP = Math.floor(mid - 3.5);
      maxP = Math.ceil(mid + 3.5);
    } else {
      minP -= 1;
      maxP += 1;
    }
  }
  const pitchRange = Math.max(maxP - minP, 1);
  const rowHeight = height / pitchRange;

  return (
    <svg
      class="piano-roll"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
    >
      <title>Piano roll preview</title>
      <g opacity={dimmed ? 0.3 : 1}>
        {notes.map((n, i) => {
          const x = ((n.startTime - bounds.start) / span) * width;
          const w = Math.max(1, (n.duration / span) * width);
          const y = (maxP - n.pitch) * rowHeight;
          const h = Math.max(1, rowHeight - 0.5);
          const velocity = n.velocity ?? 100;
          const alpha = 0.35 + 0.65 * (velocity / 127);
          return (
            <rect
              key={i}
              x={Math.max(0, x)}
              y={Math.max(0, y)}
              width={Math.min(w, width - x)}
              height={h}
              fill={`rgba(${color.r}, ${color.g}, ${color.b}, ${alpha.toFixed(2)})`}
              stroke={`rgba(${strokeR}, ${strokeG}, ${strokeB}, 0.5)`}
              stroke-width={0.5}
            />
          );
        })}
      </g>
    </svg>
  );
}
