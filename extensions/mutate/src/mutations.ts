// Pure functions over the SDK NoteDescription shape. Each takes an optional
// `rng: () => number` (Math.random-shaped) so tests can pin behavior.
//
// These are placeholder algorithms for the AJM-192 scaffold — enough to
// verify that handlers actually write back to a clip via `clip.notes = […]`.
// Real mutation logic will land in follow-up tickets.

export type Note = {
  pitch: number;
  startTime: number;
  duration: number;
  velocity?: number;
};

type Rng = () => number;

const MIN_VELOCITY = 32;
const MAX_VELOCITY = 120;

export function randomizeVelocity(notes: Note[], rng: Rng = Math.random): Note[] {
  const span = MAX_VELOCITY - MIN_VELOCITY;
  return notes.map((n) => ({
    ...n,
    velocity: Math.round(MIN_VELOCITY + rng() * span),
  }));
}

// Swap pitches of adjacent pairs: [a,b,c,d] → [b,a,d,c].
// Odd-length lists leave the final note untouched.
export function swapNotes(notes: Note[]): Note[] {
  const out = notes.map((n) => ({ ...n }));
  for (let i = 0; i + 1 < out.length; i += 2) {
    const a = out[i]!;
    const b = out[i + 1]!;
    const tmp = a.pitch;
    a.pitch = b.pitch;
    b.pitch = tmp;
  }
  return out;
}

export function deleteTenPercent(notes: Note[], rng: Rng = Math.random): Note[] {
  if (notes.length === 0) return [];
  const removeCount = Math.ceil(notes.length * 0.1);
  const indices = new Set<number>();
  while (indices.size < removeCount) {
    indices.add(Math.floor(rng() * notes.length));
  }
  return notes.filter((_, i) => !indices.has(i));
}

// Placeholder. Real implementation will reorder drum-rack pad assignments —
// requires drum-chain inspection beyond the scope of the scaffold ticket.
export function shuffleDrums(notes: Note[], _rng: Rng = Math.random): Note[] {
  console.warn("Mutate: shuffleDrums is a stub — drum-rack mapping API not yet implemented.");
  return notes.map((n) => ({ ...n }));
}
