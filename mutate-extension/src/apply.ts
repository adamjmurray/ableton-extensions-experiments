import type {
  ExtensionContext,
  MidiClip,
  MidiTrack,
  NoteDescription,
} from "@ableton/extensions-sdk";
import { deriveSeed, deriveSeed2D } from "./rng.js";
import type { ClipBounds, Note } from "./transforms.js";
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

export type ArrangementSource = {
  kind: "arrangement";
  track: MidiTrack<"0.0.5">;
  clip: MidiClip<"0.0.5">;
  startTime: number;
  duration: number;
  notes: Note[];
  bounds: ClipBounds;
};

export type RangeSourceClip = {
  trackIndex: number;
  track: MidiTrack<"0.0.5">;
  clip: MidiClip<"0.0.5">;
  startTime: number;
  duration: number;
  notes: Note[];
  bounds: ClipBounds;
};

export type RangeSource = {
  kind: "range";
  timeStart: number;
  timeEnd: number;
  clips: RangeSourceClip[]; // flat, ordered by (trackIndex, startTime)
};

export type SessionMultiSourceClip = {
  track: MidiTrack<"0.0.5">;
  clip: MidiClip<"0.0.5">;
  notes: Note[];
  bounds: ClipBounds;
};

export type SessionMultiSource = {
  kind: "sessionMulti";
  sources: SessionMultiSourceClip[];
};

export type ApplySource =
  | SessionSource
  | SceneSource
  | ArrangementSource
  | RangeSource
  | SessionMultiSource;

export type FillMode = "skip" | "overwrite";

// Scans existing take lane names on a track for the highest "Mutate N"
// suffix so that successive invocations produce distinct labels
// ("Mutate 1", "Mutate 2", then "Mutate 3", "Mutate 4", …) instead of
// stacking duplicates.
export function nextMutateLaneIndex(track: MidiTrack<"0.0.5">): number {
  let max = 0;
  for (const lane of track.takeLanes) {
    const match = /^Mutate (\d+)$/.exec(String(lane.name));
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

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
    console.log(`Mutate: only ${n} of ${variations} slot(s) available below source — truncating`);
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

export async function applyRange(
  context: ExtensionContext<"0.0.5">,
  source: RangeSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  mutateSource: boolean,
): Promise<void> {
  // Group source clips by trackIndex so we can create N take lanes per track
  // and put one varied clip per source on each lane.
  const byTrack = new Map<
    number,
    { track: MidiTrack<"0.0.5">; entries: Array<{ sourceIndex: number; src: RangeSourceClip }> }
  >();
  source.clips.forEach((src, sourceIndex) => {
    const existing = byTrack.get(src.trackIndex);
    if (existing) {
      existing.entries.push({ sourceIndex, src });
    } else {
      byTrack.set(src.trackIndex, { track: src.track, entries: [{ sourceIndex, src }] });
    }
  });

  const work = context.withinTransaction(() =>
    (async () => {
      if (mutateSource) {
        // In-place: each source clip gets seed (sourceIndex, 0).
        source.clips.forEach((src, sourceIndex) => {
          const seed = deriveSeed2D(baseSeed, sourceIndex, 0);
          const notes = mutateOneShot(src.notes, controls, seed, src.bounds);
          src.clip.notes = notes as NoteDescription[];
        });
      }

      // Per track: create N take lanes in parallel. Within each lane, the
      // per-clip writes also run in parallel since they operate on distinct
      // clips on the same new lane. Lane numbering is per-track and starts
      // after the highest existing "Mutate N" lane so reruns keep ascending.
      const laneTasks: Promise<void>[] = [];
      for (const { track, entries } of byTrack.values()) {
        const baseIndex = nextMutateLaneIndex(track);
        for (let vi = 0; vi < variations; vi++) {
          laneTasks.push(
            (async () => {
              const lane = await track.createTakeLane();
              lane.name = `Mutate ${baseIndex + vi}`;
              await Promise.all(
                entries.map(async ({ sourceIndex, src }) => {
                  const seed = deriveSeed2D(baseSeed, sourceIndex, vi + 1);
                  const notes = mutateOneShot(src.notes, controls, seed, src.bounds);
                  const created = await lane.createMidiClip(src.startTime, src.duration);
                  created.notes = notes as NoteDescription[];
                }),
              );
            })(),
          );
        }
      }
      await Promise.all(laneTasks);
    })(),
  );

  await work;
}

export async function applyArrangement(
  context: ExtensionContext<"0.0.5">,
  source: ArrangementSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  mutateSource: boolean,
): Promise<void> {
  const work = context.withinTransaction(() =>
    (async () => {
      if (mutateSource) {
        const seed = deriveSeed(baseSeed, 0);
        const notes = mutateOneShot(source.notes, controls, seed, source.bounds);
        source.clip.notes = notes as NoteDescription[];
      }

      // Create N new take lanes in parallel; each gets one variation.
      // Lane numbering continues after the highest existing "Mutate N"
      // lane on the track so reruns keep ascending.
      const baseIndex = nextMutateLaneIndex(source.track);
      const laneTasks = Array.from({ length: variations }, async (_, i) => {
        const seed = deriveSeed(baseSeed, i + 1);
        const notes = mutateOneShot(source.notes, controls, seed, source.bounds);
        const lane = await source.track.createTakeLane();
        lane.name = `Mutate ${baseIndex + i}`;
        const created = await lane.createMidiClip(source.startTime, source.duration);
        created.notes = notes as NoteDescription[];
      });
      await Promise.all(laneTasks);
    })(),
  );

  await work;
}

// Multi-clip in-place mutation for a Session clip-slot selection. No variations,
// no fan-out — each selected clip is rewritten with a seed derived from its
// index so the clips mutate independently under shared controls.
export async function applySessionMulti(
  context: ExtensionContext<"0.0.5">,
  source: SessionMultiSource,
  controls: MutateControls,
  baseSeed: number,
): Promise<void> {
  await context.withinTransaction(() =>
    (async () => {
      source.sources.forEach((src, i) => {
        const seed = deriveSeed2D(baseSeed, i, 0);
        const notes = mutateOneShot(src.notes, controls, seed, src.bounds);
        src.clip.notes = notes as NoteDescription[];
      });
    })(),
  );
}
