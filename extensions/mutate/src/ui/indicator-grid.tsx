export type CellState = "write-empty" | "write-overwrite" | "skip";

export function IndicatorGrid({
  rows,
  cols,
  stateAt,
  rowLabelAt,
  rowIsNewScene = () => false,
  colLabelAt,
}: {
  rows: number;
  cols: number;
  stateAt: (row: number, col: number) => CellState;
  rowLabelAt: (row: number) => string;
  rowIsNewScene?: (row: number) => boolean;
  colLabelAt: (col: number) => string;
}) {
  const CELL = 18;
  const GAP = 2;

  const tooltipFor = (row: number, col: number): string => {
    const scene = rowLabelAt(row);
    const track = colLabelAt(col);
    const newFlag = rowIsNewScene(row) ? " (new scene)" : "";
    const state = stateAt(row, col);
    const verb =
      state === "skip"
        ? "skip (occupied)"
        : state === "write-overwrite"
          ? "overwrite"
          : "write";
    return `${scene}${newFlag} · ${track} — ${verb}`;
  };

  return (
    <div class="indicator-grid">
      <div class="grid-col-labels" style={{ marginLeft: "90px" }}>
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} class="grid-col-label" style={{ width: `${CELL}px` }} title={colLabelAt(c)}>
            {colLabelAt(c)}
          </div>
        ))}
      </div>
      <div class="grid-body">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} class="grid-row">
            <div class={`grid-row-label${rowIsNewScene(r) ? " new-scene" : ""}`}>
              {rowIsNewScene(r) ? "+ " : ""}
              {rowLabelAt(r)}
            </div>
            {Array.from({ length: cols }, (_, c) => {
              const state = stateAt(r, c);
              return (
                <div
                  key={c}
                  class={`grid-cell grid-cell--${state}`}
                  style={{ width: `${CELL}px`, height: `${CELL}px`, marginRight: `${GAP}px` }}
                  title={tooltipFor(r, c)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
