import type { ClipBounds, Note } from "../transforms.js";

export function PianoRoll({
  notes,
  bounds,
  width,
  height,
  dimmed = false,
}: {
  notes: Note[];
  bounds: ClipBounds;
  width: number;
  height: number;
  dimmed?: boolean;
}) {
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
              fill={`rgba(255, 102, 17, ${alpha.toFixed(2)})`}
              stroke="rgba(255, 136, 51, 0.5)"
              stroke-width={0.5}
            />
          );
        })}
      </g>
    </svg>
  );
}
