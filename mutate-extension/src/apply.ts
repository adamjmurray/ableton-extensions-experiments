import type {
  ExtensionContext,
  MidiClip,
  MidiTrack,
  NoteDescription,
} from "@ableton/extensions-sdk";
import { deriveSeed, deriveSeed2D } from "./rng.js";
import type { ClipBounds, Note } from "./transforms.js";
import { generateVariations, type MutateControls, type VariationMode } from "./variations.js";

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

// Copies preservable metadata from the source clip to a newly created
// variation clip: name (suffixed " var. N") and color. Start/end markers
// and loop settings are NOT preserved — the alpha SDK exposes no setters
// for MidiClip.startMarker/endMarker/looping/loopStart/loopEnd, and
// createMidiClip takes only a length.
function applyClipMetadata(
  created: MidiClip<"0.0.5">,
  source: MidiClip<"0.0.5">,
  variationNumber: number,
): void {
  created.name = `${String(source.name)} var. ${variationNumber}`;
  created.color = Number(source.color);
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

// Produces the ordered outputs for one source clip.
//   inPlace: notes for the in-place rewrite (null when mutateSource is off)
//   variations: notes for each variation slot, in order
//
// Independent mode calls seedForIndex(0) for the in-place mutation and
// seedForIndex(vi + 1) for each variation — preserving the legacy seed layout
// so swapping between independent and "mutateSource" on/off doesn't re-roll
// the variation thumbnails.
// Cumulative mode chains outputs instead: the chain has length
// (mutateSource ? 1 : 0) + variations, seeded from chainBaseSeed. The first
// step becomes the in-place result (if enabled) and each subsequent step
// mutates the previous output.
function computeSourceOutputs(
  notes: Note[],
  controls: MutateControls,
  bounds: ClipBounds,
  mutateSource: boolean,
  variations: number,
  mode: VariationMode,
  chainBaseSeed: number,
  seedForIndex: (seedIndex: number) => number,
): { inPlace: Note[] | null; variations: Note[][] } {
  if (mode === "cumulative") {
    const total = (mutateSource ? 1 : 0) + variations;
    const chain = generateVariations(notes, controls, total, chainBaseSeed, bounds, "cumulative");
    if (mutateSource) {
      return { inPlace: chain[0] ?? null, variations: chain.slice(1) };
    }
    return { inPlace: null, variations: chain };
  }
  const inPlace = mutateSource ? mutateOneShot(notes, controls, seedForIndex(0), bounds) : null;
  const out: Note[][] = [];
  for (let vi = 0; vi < variations; vi++) {
    out.push(mutateOneShot(notes, controls, seedForIndex(vi + 1), bounds));
  }
  return { inPlace, variations: out };
}

export async function applySession(
  context: ExtensionContext<"0.0.5">,
  source: SessionSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  fillMode: FillMode,
  mutateSource: boolean,
  variationMode: VariationMode,
): Promise<void> {
  const song = context.application.song;
  const requiredScenes = source.slotIndex + 1 + variations;

  const outputs = computeSourceOutputs(
    source.notes,
    controls,
    source.bounds,
    mutateSource,
    variations,
    variationMode,
    baseSeed,
    (i) => deriveSeed(baseSeed, i),
  );

  const work = context.withinTransaction(() =>
    (async () => {
      const tasks: Promise<void>[] = [];

      if (outputs.inPlace) {
        source.clip.notes = outputs.inPlace as NoteDescription[];
      }

      while (song.scenes.length < requiredScenes) {
        await song.createScene(song.scenes.length);
      }

      const slotsBelow = source.track.clipSlots.slice(source.slotIndex + 1);

      for (let i = 0; i < variations; i++) {
        const slot = slotsBelow[i]!;
        const notes = outputs.variations[i]!;
        tasks.push(
          (async () => {
            const occupied = slot.clip !== null;
            if (occupied && fillMode === "skip") return;
            if (occupied) await slot.deleteClip();
            const created = await slot.createMidiClip(source.duration);
            created.notes = notes as NoteDescription[];
            applyClipMetadata(created, source.clip, i + 1);
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
  variationMode: VariationMode,
): Promise<void> {
  const song = context.application.song;
  const maxTargetSceneIndex = source.sceneIndex + variations;

  // One independent chain per source clip.
  const outputsBySource = source.sources.map((src) =>
    computeSourceOutputs(
      src.notes,
      controls,
      src.bounds,
      mutateSource,
      variations,
      variationMode,
      deriveSeed2D(baseSeed, src.trackIndex, 0),
      (i) => deriveSeed2D(baseSeed, src.trackIndex, i),
    ),
  );

  const work = context.withinTransaction(() =>
    (async () => {
      // Phase 1: in-place source writes + scene creation.
      source.sources.forEach((src, si) => {
        const inPlace = outputsBySource[si]!.inPlace;
        if (inPlace) src.clip.notes = inPlace as NoteDescription[];
      });
      while (song.scenes.length <= maxTargetSceneIndex) {
        await song.createScene(song.scenes.length);
      }

      // Phase 2: parallel slot writes for every (variation, source clip) pair.
      const writes: Promise<void>[] = [];
      for (let vi = 0; vi < variations; vi++) {
        const targetSceneIndex = source.sceneIndex + 1 + vi;
        source.sources.forEach((src, si) => {
          const notes = outputsBySource[si]!.variations[vi]!;
          const slot = src.track.clipSlots[targetSceneIndex];
          if (!slot) return;
          writes.push(
            (async () => {
              const occupied = slot.clip !== null;
              if (occupied && fillMode === "skip") return;
              if (occupied) await slot.deleteClip();
              const created = await slot.createMidiClip(src.duration);
              created.notes = notes as NoteDescription[];
              applyClipMetadata(created, src.clip, vi + 1);
            })(),
          );
        });
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
  variationMode: VariationMode,
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

  // One independent chain per source clip, keyed by its flat sourceIndex.
  const outputsBySourceIndex = source.clips.map((src, sourceIndex) =>
    computeSourceOutputs(
      src.notes,
      controls,
      src.bounds,
      mutateSource,
      variations,
      variationMode,
      deriveSeed2D(baseSeed, sourceIndex, 0),
      (i) => deriveSeed2D(baseSeed, sourceIndex, i),
    ),
  );

  const work = context.withinTransaction(() =>
    (async () => {
      source.clips.forEach((src, sourceIndex) => {
        const inPlace = outputsBySourceIndex[sourceIndex]!.inPlace;
        if (inPlace) src.clip.notes = inPlace as NoteDescription[];
      });

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
                  const notes = outputsBySourceIndex[sourceIndex]!.variations[vi]!;
                  const created = await lane.createMidiClip(src.startTime, src.duration);
                  created.notes = notes as NoteDescription[];
                  applyClipMetadata(created, src.clip, vi + 1);
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
  variationMode: VariationMode,
): Promise<void> {
  const outputs = computeSourceOutputs(
    source.notes,
    controls,
    source.bounds,
    mutateSource,
    variations,
    variationMode,
    baseSeed,
    (i) => deriveSeed(baseSeed, i),
  );

  const work = context.withinTransaction(() =>
    (async () => {
      if (outputs.inPlace) {
        source.clip.notes = outputs.inPlace as NoteDescription[];
      }

      // Create N new take lanes in parallel; each gets one variation.
      // Lane numbering continues after the highest existing "Mutate N"
      // lane on the track so reruns keep ascending.
      const baseIndex = nextMutateLaneIndex(source.track);
      const laneTasks = Array.from({ length: variations }, async (_, i) => {
        const notes = outputs.variations[i]!;
        const lane = await source.track.createTakeLane();
        lane.name = `Mutate ${baseIndex + i}`;
        const created = await lane.createMidiClip(source.startTime, source.duration);
        created.notes = notes as NoteDescription[];
        applyClipMetadata(created, source.clip, i + 1);
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
