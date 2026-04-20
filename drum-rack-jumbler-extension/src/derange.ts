import type { Rng } from "./rng.js";

// Returns a permutation of `items` with no fixed points (no result[i] === items[i]).
// Fisher-Yates with rejection: reshuffle until the result is a derangement.
// For length < 2 there is no derangement, so the input is returned as-is —
// callers are expected to gate on length themselves.
export function derange<T>(items: T[], rng: Rng): T[] {
  if (items.length < 2) return items.slice();
  while (true) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    if (result.every((v, i) => v !== items[i])) return result;
  }
}
