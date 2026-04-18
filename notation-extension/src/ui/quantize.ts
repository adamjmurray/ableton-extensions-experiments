import type { NoteData } from "./bridge.js";

export type QuantizeGrid = "16th" | "16th-triplet" | "32nd";

// Grid size in beats (1 beat = 1 quarter note)
const GRID_SIZES: Record<QuantizeGrid, number> = {
  "16th": 0.25,
  "16th-triplet": 1 / 6,
  "32nd": 0.125,
};

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

// Snap to whichever of two grids is closer
function snapToClosest(value: number, gridA: number, gridB: number): number {
  const a = snapToGrid(value, gridA);
  const b = snapToGrid(value, gridB);
  return Math.abs(value - a) <= Math.abs(value - b) ? a : b;
}

export function quantizeNotes(notes: NoteData[], grid: QuantizeGrid): NoteData[] {
  if (grid === "16th-triplet") {
    // Mixed mode: snap each value to whichever is closer — straight 16th or 16th triplet
    const straight = GRID_SIZES["16th"];
    const triplet = GRID_SIZES["16th-triplet"];
    const minDur = Math.min(straight, triplet);

    return notes.map((note) => {
      const startTime = snapToClosest(note.startTime, straight, triplet);
      let duration = snapToClosest(note.duration, straight, triplet);
      if (duration < minDur) {
        duration = minDur;
      }
      return { ...note, startTime, duration };
    });
  }

  const gridSize = GRID_SIZES[grid];
  return notes.map((note) => {
    const startTime = snapToGrid(note.startTime, gridSize);
    let duration = snapToGrid(note.duration, gridSize);
    if (duration < gridSize) {
      duration = gridSize;
    }
    return { ...note, startTime, duration };
  });
}
