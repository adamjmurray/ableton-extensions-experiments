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

export function quantizeNotes(notes: NoteData[], grid: QuantizeGrid): NoteData[] {
  const gridSize = GRID_SIZES[grid];

  return notes.map((note) => {
    const startTime = snapToGrid(note.startTime, gridSize);
    let duration = snapToGrid(note.duration, gridSize);
    // Ensure minimum duration of one grid unit
    if (duration < gridSize) {
      duration = gridSize;
    }
    return { ...note, startTime, duration };
  });
}
