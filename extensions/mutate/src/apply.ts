import type { ExtensionContext, MidiClip, MidiTrack, NoteDescription } from "@ableton/extensions-sdk";
import type { ClipBounds, Note } from "./transforms.js";

export type SessionSource = {
  kind: "session";
  track: MidiTrack<"0.0.5">;
  slotIndex: number;
  duration: number;
  notes: Note[];
  bounds: ClipBounds;
};

// Discriminated-union shape leaves room for a future `{ kind: "arrangement" }` variant.
export type ApplySource = SessionSource;

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
