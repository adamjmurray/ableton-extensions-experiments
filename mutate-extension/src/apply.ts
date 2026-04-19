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

  // Phase 1: create any missing scenes. In-place notes are written in the
  // final phase so they group with the variation-notes writes.
  await context.withinTransaction(() => {
    const scenePromises: Promise<unknown>[] = [];
    for (let idx = song.scenes.length; idx < requiredScenes; idx++) {
      scenePromises.push(song.createScene(idx));
    }
    return Promise.all(scenePromises);
  });

  // Determine target slots now that scenes exist, and split occupied ones.
  type Target = { slot: (typeof source.track.clipSlots)[number]; notes: Note[]; varIndex: number };
  const targets: Target[] = [];
  const occupiedToDelete: Target[] = [];
  for (let i = 0; i < variations; i++) {
    const slot = source.track.clipSlots[source.slotIndex + 1 + i]!;
    const target: Target = { slot, notes: outputs.variations[i]!, varIndex: i };
    const occupied = slot.clip !== null;
    if (occupied && fillMode === "skip") continue;
    if (occupied) occupiedToDelete.push(target);
    targets.push(target);
  }

  // Phase 2: delete occupied slots (if any).
  if (occupiedToDelete.length > 0) {
    await context.withinTransaction(() =>
      Promise.all(occupiedToDelete.map((t) => t.slot.deleteClip())),
    );
  }

  // Phase 3: create all MIDI clips in parallel.
  const created = await context.withinTransaction(() =>
    Promise.all(targets.map((t) => t.slot.createMidiClip(source.duration))),
  );

  // Phase 4: in-place notes + set notes + metadata on all created clips (one undo step).
  context.withinTransaction(() => {
    if (outputs.inPlace) {
      source.clip.notes = outputs.inPlace as NoteDescription[];
    }
    created.forEach((clip, i) => {
      const t = targets[i]!;
      clip.notes = t.notes as NoteDescription[];
      applyClipMetadata(clip, source.clip, t.varIndex + 1);
    });
  });
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

  // Phase 1: create missing scenes. In-place notes are written in the final
  // phase so they group with the variation-notes writes.
  await context.withinTransaction(() => {
    const scenePromises: Promise<unknown>[] = [];
    for (let idx = song.scenes.length; idx <= maxTargetSceneIndex; idx++) {
      scenePromises.push(song.createScene(idx));
    }
    return Promise.all(scenePromises);
  });

  type Target = {
    slot: (typeof source.sources)[number]["track"]["clipSlots"][number];
    src: SceneSourceClip;
    notes: Note[];
    varIndex: number;
  };
  const targets: Target[] = [];
  const occupiedToDelete: Target[] = [];
  for (let vi = 0; vi < variations; vi++) {
    const targetSceneIndex = source.sceneIndex + 1 + vi;
    source.sources.forEach((src, si) => {
      const slot = src.track.clipSlots[targetSceneIndex];
      if (!slot) return;
      const t: Target = { slot, src, notes: outputsBySource[si]!.variations[vi]!, varIndex: vi };
      const occupied = slot.clip !== null;
      if (occupied && fillMode === "skip") return;
      if (occupied) occupiedToDelete.push(t);
      targets.push(t);
    });
  }

  if (occupiedToDelete.length > 0) {
    await context.withinTransaction(() =>
      Promise.all(occupiedToDelete.map((t) => t.slot.deleteClip())),
    );
  }

  const created = await context.withinTransaction(() =>
    Promise.all(targets.map((t) => t.slot.createMidiClip(t.src.duration))),
  );

  context.withinTransaction(() => {
    source.sources.forEach((src, si) => {
      const inPlace = outputsBySource[si]!.inPlace;
      if (inPlace) src.clip.notes = inPlace as NoteDescription[];
    });
    created.forEach((clip, i) => {
      const t = targets[i]!;
      clip.notes = t.notes as NoteDescription[];
      applyClipMetadata(clip, t.src.clip, t.varIndex + 1);
    });
  });
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

  // Plan lane assignments: one lane per (track, variation) pair.
  type LanePlan = {
    track: MidiTrack<"0.0.5">;
    name: string;
    vi: number;
    entries: Array<{ sourceIndex: number; src: RangeSourceClip }>;
  };
  const lanePlans: LanePlan[] = [];
  for (const { track, entries } of byTrack.values()) {
    const baseIndex = nextMutateLaneIndex(track);
    for (let vi = 0; vi < variations; vi++) {
      lanePlans.push({ track, name: `Mutate ${baseIndex + vi}`, vi, entries });
    }
  }

  // Phase 1: create all take lanes in parallel. In-place notes are written in
  // the final phase so they group with the variation-notes writes.
  const lanes = await context.withinTransaction(() =>
    Promise.all(lanePlans.map((p) => p.track.createTakeLane())),
  );

  // Phase 2: set lane names + create all clips in parallel.
  type ClipPlan = {
    laneIdx: number;
    sourceIndex: number;
    src: RangeSourceClip;
    vi: number;
  };
  const clipPlans: ClipPlan[] = [];
  lanePlans.forEach((p, laneIdx) => {
    for (const { sourceIndex, src } of p.entries) {
      clipPlans.push({ laneIdx, sourceIndex, src, vi: p.vi });
    }
  });

  const createdClips = await context.withinTransaction(() => {
    lanes.forEach((lane, i) => {
      lane.name = lanePlans[i]!.name;
    });
    return Promise.all(
      clipPlans.map((cp) => lanes[cp.laneIdx]!.createMidiClip(cp.src.startTime, cp.src.duration)),
    );
  });

  // Phase 3: in-place notes + set notes + metadata on created clips.
  context.withinTransaction(() => {
    source.clips.forEach((src, sourceIndex) => {
      const inPlace = outputsBySourceIndex[sourceIndex]!.inPlace;
      if (inPlace) src.clip.notes = inPlace as NoteDescription[];
    });
    createdClips.forEach((clip, i) => {
      const cp = clipPlans[i]!;
      const notes = outputsBySourceIndex[cp.sourceIndex]!.variations[cp.vi]!;
      clip.notes = notes as NoteDescription[];
      applyClipMetadata(clip, cp.src.clip, cp.vi + 1);
    });
  });
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

  const baseIndex = nextMutateLaneIndex(source.track);

  // Phase 1: create all take lanes in parallel. In-place notes are written in
  // the final phase so they group with the variation-notes writes.
  const lanes = await context.withinTransaction(() =>
    Promise.all(Array.from({ length: variations }, () => source.track.createTakeLane())),
  );

  // Phase 2: set lane names + create clips.
  const createdClips = await context.withinTransaction(() => {
    lanes.forEach((lane, i) => {
      lane.name = `Mutate ${baseIndex + i}`;
    });
    return Promise.all(lanes.map((lane) => lane.createMidiClip(source.startTime, source.duration)));
  });

  // Phase 3: in-place notes + set notes + metadata.
  context.withinTransaction(() => {
    if (outputs.inPlace) {
      source.clip.notes = outputs.inPlace as NoteDescription[];
    }
    createdClips.forEach((clip, i) => {
      clip.notes = outputs.variations[i] as NoteDescription[];
      applyClipMetadata(clip, source.clip, i + 1);
    });
  });
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
  context.withinTransaction(() => {
    source.sources.forEach((src, i) => {
      const seed = deriveSeed2D(baseSeed, i, 0);
      const notes = mutateOneShot(src.notes, controls, seed, src.bounds);
      src.clip.notes = notes as NoteDescription[];
    });
  });
}
