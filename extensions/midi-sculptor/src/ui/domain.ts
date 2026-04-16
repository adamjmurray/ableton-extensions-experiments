// Lightweight transformation logic for UI preview.
// Re-implements the core transforms for browser-side preview without importing
// the full transformer classes (which use Node.js features like Object.freeze).

export interface PreviewNote {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

export const PROPERTIES: Record<string, { label: string; range: number; unit: string; min: number; max: number; decimal: boolean }> = {
  pitch: { label: "Pitch", range: 12, unit: "st", min: 0, max: 127, decimal: false },
  velocity: { label: "Velocity", range: 64, unit: "", min: 1, max: 127, decimal: false },
  start: { label: "Start", range: 1, unit: "beats", min: 0, max: 16, decimal: true },
  duration: { label: "Duration", range: 1, unit: "beats", min: 0.001, max: 16, decimal: true },
};

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function mod(d: number, m: number) {
  const r = d % m;
  return r >= 0 ? Math.abs(r) : r + m;
}

function reflectedMod(d: number, m: number) {
  const n = Math.abs(d);
  const v = mod(n, m);
  return Math.floor(n / m) % 2 === 1 ? m - v : v;
}

export function applyEdge(value: number, prop: string, edge: string) {
  const meta = PROPERTIES[prop];
  if (!meta) return value;
  const { min, max } = meta;
  if (edge === "clamp") return clamp(value, min, max);
  if (edge === "reflect") return reflectedMod(value - min, max - min) + min;
  if (edge === "rotate") return mod(value - min, max - min) + min;
  return value; // "remove" / none
}

export interface RandomSeeds {
  bipolar1: number[];
  bipolar2: number[];
}

export function generateRandomSeeds(count: number): RandomSeeds {
  return {
    bipolar1: Array.from({ length: count }, () => 2 * Math.random() - 1),
    bipolar2: Array.from({ length: count }, () => 2 * Math.random() - 1),
  };
}

export function generateNotes(count = 8): PreviewNote[] {
  return Array.from({ length: count }, (_, i) => ({
    pitch: 48 + Math.floor(Math.random() * 24),
    velocity: 40 + Math.floor(Math.random() * 80),
    start: i * 0.5,
    duration: 0.25 + Math.random() * 0.5,
  }));
}

// --- Slide transforms ---
export function applyShift(notes: PreviewNote[], prop: string, amount: number, range: number, edge: string): PreviewNote[] {
  const delta = amount * range;
  return notes.map((n) => ({
    ...n,
    [prop]: applyEdge((n as any)[prop] + delta, prop, edge),
  }));
}

export function applySpread(
  notes: PreviewNote[],
  prop: string,
  amount: number,
  range: number,
  anchor: string,
  edge: string,
): PreviewNote[] {
  const values = notes.map((n) => (n as any)[prop] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  let spreadPoint: number, largestDelta: number;
  if (anchor === "min") { spreadPoint = min; largestDelta = max - min; }
  else if (anchor === "max") { spreadPoint = max; largestDelta = max - min; }
  else { spreadPoint = mid; largestDelta = mid - min; }
  if (largestDelta === 0) return notes;
  return notes.map((n) => ({
    ...n,
    [prop]: applyEdge(
      (n as any)[prop] + (amount * range * ((n as any)[prop] - spreadPoint)) / largestDelta,
      prop,
      edge,
    ),
  }));
}

export function applyRandomize2D(
  notes: PreviewNote[],
  prop: string,
  ax: number,
  ay: number,
  range: number,
  seeds: RandomSeeds,
  edge: string,
): PreviewNote[] {
  const hRange = range / 2;
  const dx = ax * hRange;
  const dy = ay * hRange;
  return notes.map((n, i) => ({
    ...n,
    [prop]: applyEdge((n as any)[prop] + seeds.bipolar1[i]! * dx + seeds.bipolar2[i]! * dy, prop, edge),
  }));
}

// --- Swap transforms ---
export function applySwapRotate(notes: PreviewNote[], amount: number, targets: string[]): PreviewNote[] {
  const offset = Math.round(amount * notes.length);
  return notes.map((n, i) => {
    const src = notes[mod(i - offset, notes.length)]!;
    const result = { ...n };
    for (const t of targets) (result as any)[t] = (src as any)[t];
    return result;
  });
}

export function applySwapReverse(notes: PreviewNote[], targets: string[]): PreviewNote[] {
  return notes.map((n, i) => {
    const src = notes[notes.length - 1 - i]!;
    const result = { ...n };
    for (const t of targets) (result as any)[t] = (src as any)[t];
    return result;
  });
}

export function applySwapPairs(notes: PreviewNote[], targets: string[]): PreviewNote[] {
  return notes.map((n, i) => {
    const j = i % 2 === 0 ? i + 1 : i - 1;
    const src = notes[j] ?? notes[i]!;
    const result = { ...n };
    for (const t of targets) (result as any)[t] = (src as any)[t];
    return result;
  });
}

export function applySwapZip(notes: PreviewNote[], targets: string[]): PreviewNote[] {
  const mid = Math.floor(notes.length / 2);
  return notes.map((n, i) => {
    const j = i < mid ? 2 * i + 1 : (i - mid) * 2;
    const src = notes[j] ?? notes[i]!;
    const result = { ...n };
    for (const t of targets) (result as any)[t] = (src as any)[t];
    return result;
  });
}

// --- Split transforms ---
export function applySplitInto(notes: PreviewNote[], count: number, gate: number): PreviewNote[] {
  const result: PreviewNote[] = [];
  for (const n of notes) {
    const dur = n.duration / count;
    for (let i = 0; i < count && result.length < 1000; i++) {
      result.push({ ...n, start: n.start + i * dur, duration: dur * gate });
    }
  }
  return result;
}

export function applySplitInTime(notes: PreviewNote[], time: number, gate: number): PreviewNote[] {
  const result: PreviewNote[] = [];
  for (const n of notes) {
    for (let t = 0; t < n.duration && result.length < 1000; t += time) {
      const dur = Math.min(time, n.duration - t);
      result.push({ ...n, start: n.start + t, duration: dur * gate });
    }
  }
  return result;
}
