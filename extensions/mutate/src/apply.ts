import type {
  ExtensionContext,
  MidiClip,
  MidiTrack,
  NoteDescription,
} from "@ableton/extensions-sdk";
import type { ClipBounds, Note } from "./transforms.js";
import { deriveSeed, deriveSeed2D } from "./rng.js";
import { generateVariations, type MutateControls } from "./variations.js";

export type SessionSource = {
  kind: "session";
  track: MidiTrack<"0.0.5">;
  slotIndex: number;
  clip: MidiClip<"0.0.5">;
  duration: number;
  notes: Note[];
  bounds: ClipBounds;
};

export type SceneSourceClip = {
  trackIndex: number;
  track: MidiTrack<"0.0.5">;
  clip: MidiClip<"0.0.5">;
  notes: Note[];
  bounds: ClipBounds;
  duration: number;
};

export type SceneSource = {
  kind: "scene";
  sceneIndex: number;
  sources: SceneSourceClip[];
};

export type ApplySource = SessionSource | SceneSource;

export type FillMode = "skip" | "overwrite";

// Seed-indexing convention: index 0 is reserved for the in-place mutation so
// that toggling mutateSource on/off doesn't re-roll the user-visible Var
// thumbnails. Variation i (0-based in UI) uses seed index i + 1.
function mutateOneShot(
  notes: Note[],
  controls: MutateControls,
  seed: number,
  bounds: ClipBounds,
): Note[] {
  const [result] = generateVariations(notes, controls, 1, seed, bounds);
  return result!;
}

export async function applySession(
  context: ExtensionContext<"0.0.5">,
  source: SessionSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  fillMode: FillMode,
  mutateSource: boolean,
): Promise<void> {
  const slotsBelow = source.track.clipSlots.slice(source.slotIndex + 1);
  const n = Math.min(slotsBelow.length, variations);
  if (n < variations) {
    console.log(
      `Mutate: only ${n} of ${variations} slot(s) available below source — truncating`,
    );
  }

  const work = context.withinTransaction(() =>
    (async () => {
      const tasks: Promise<void>[] = [];

      if (mutateSource) {
        const seed = deriveSeed(baseSeed, 0);
        const notes = mutateOneShot(source.notes, controls, seed, source.bounds);
        source.clip.notes = notes as NoteDescription[];
      }

      for (let i = 0; i < n; i++) {
        const slot = slotsBelow[i]!;
        const seed = deriveSeed(baseSeed, i + 1);
        const notes = mutateOneShot(source.notes, controls, seed, source.bounds);
        tasks.push(
          (async () => {
            const occupied = slot.clip !== null;
            if (occupied && fillMode === "skip") return;
            if (occupied) await slot.deleteClip();
            const created = await slot.createMidiClip(source.duration);
            created.notes = notes as NoteDescription[];
          })(),
        );
      }

      await Promise.all(tasks);
    })(),
  );

  await work;
}

export async function applyScene(
  context: ExtensionContext<"0.0.5">,
  source: SceneSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  fillMode: FillMode,
  mutateSource: boolean,
): Promise<void> {
  const song = context.application.song;
  const maxTargetSceneIndex = source.sceneIndex + variations;

  const work = context.withinTransaction(() =>
    (async () => {
      // Phase 1: in-place source writes + scene creation.
      if (mutateSource) {
        for (const src of source.sources) {
          const seed = deriveSeed2D(baseSeed, src.trackIndex, 0);
          const notes = mutateOneShot(src.notes, controls, seed, src.bounds);
          src.clip.notes = notes as NoteDescription[];
        }
      }
      while (song.scenes.length <= maxTargetSceneIndex) {
        await song.createScene(song.scenes.length);
      }

      // Phase 2: parallel slot writes for every (variation, source clip) pair.
      const writes: Promise<void>[] = [];
      for (let vi = 0; vi < variations; vi++) {
        const targetSceneIndex = source.sceneIndex + 1 + vi;
        for (const src of source.sources) {
          const seed = deriveSeed2D(baseSeed, src.trackIndex, vi + 1);
          const notes = mutateOneShot(src.notes, controls, seed, src.bounds);
          const slot = src.track.clipSlots[targetSceneIndex];
          if (!slot) continue;
          writes.push(
            (async () => {
              const occupied = slot.clip !== null;
              if (occupied && fillMode === "skip") return;
              if (occupied) await slot.deleteClip();
              const created = await slot.createMidiClip(src.duration);
              created.notes = notes as NoteDescription[];
            })(),
          );
        }
      }
      await Promise.all(writes);
    })(),
  );

  await work;
}

