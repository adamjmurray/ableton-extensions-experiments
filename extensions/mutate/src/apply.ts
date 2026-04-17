import type {
  ExtensionContext,
  MidiClip,
  MidiTrack,
  NoteDescription,
} from "@ableton/extensions-sdk";
import type { ClipBounds, Note } from "./transforms.js";
import { deriveSeed2D } from "./rng.js";
import { generateVariations, type MutateControls } from "./variations.js";

export type SessionSource = {
  kind: "session";
  track: MidiTrack<"0.0.5">;
  slotIndex: number;
  duration: number;
  notes: Note[];
  bounds: ClipBounds;
};

export type SceneSourceClip = {
  trackIndex: number;
  track: MidiTrack<"0.0.5">;
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

export async function applySession(
  context: ExtensionContext<"0.0.5">,
  source: SessionSource,
  variations: Note[][],
  fillMode: FillMode,
): Promise<void> {
  const slotsBelow = source.track.clipSlots.slice(source.slotIndex + 1);
  const n = Math.min(slotsBelow.length, variations.length);
  if (n < variations.length) {
    console.log(
      `Mutate: only ${n} of ${variations.length} slot(s) available below source — truncating`,
    );
  }

  const promises = context.withinTransaction(() =>
    Promise.all(
      slotsBelow.slice(0, n).map(async (slot, i) => {
        const notes = variations[i]!;
        const occupied = slot.clip !== null;
        if (occupied && fillMode === "skip") return;
        if (occupied) await slot.deleteClip();
        const clip: MidiClip<"0.0.5"> = await slot.createMidiClip(source.duration);
        clip.notes = notes as NoteDescription[];
      }),
    ),
  );

  await promises;
}

export async function applyScene(
  context: ExtensionContext<"0.0.5">,
  source: SceneSource,
  controls: MutateControls,
  variations: number,
  baseSeed: number,
  fillMode: FillMode,
): Promise<void> {
  const song = context.application.song;
  const maxTargetSceneIndex = source.sceneIndex + variations;

  const work = context.withinTransaction(() =>
    (async () => {
      // Phase 1: create missing scenes at the bottom so every target index exists.
      while (song.scenes.length <= maxTargetSceneIndex) {
        await song.createScene(song.scenes.length);
      }

      // Phase 2: parallel slot writes for every (variation, source clip) pair.
      const writes: Promise<void>[] = [];
      for (let vi = 0; vi < variations; vi++) {
        const targetSceneIndex = source.sceneIndex + 1 + vi;
        for (const src of source.sources) {
          const perClipSeed = deriveSeed2D(baseSeed, src.trackIndex, vi);
          const [notes] = generateVariations(src.notes, controls, 1, perClipSeed, src.bounds);
          const slot = src.track.clipSlots[targetSceneIndex];
          if (!slot) continue;
          writes.push(
            (async () => {
              const occupied = slot.clip !== null;
              if (occupied && fillMode === "skip") return;
              if (occupied) await slot.deleteClip();
              const clip = await slot.createMidiClip(src.duration);
              clip.notes = notes as NoteDescription[];
            })(),
          );
        }
      }
      await Promise.all(writes);
    })(),
  );

  await work;
}
