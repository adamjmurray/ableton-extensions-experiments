import {
  type ActivationContext,
  type DeviceParameter,
  type Handle,
  initialize,
  MidiTrack,
  type Simpler,
} from "@ableton/extensions-sdk";
import { derange } from "./derange.js";
import { mulberry32, type Rng } from "./rng.js";
import { type DrumPad, findTopLevelDrumChains, findTopLevelDrumPads } from "./walker.js";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "0.0.5");

  console.log("Drum Rack Jumbler activated!");

  function resolvePads(arg: unknown): DrumPad[] | null {
    const track = context.objects.getObjectFromHandle(arg as Handle, MidiTrack);
    return findTopLevelDrumPads(track)?.pads ?? null;
  }

  function findParameter(simpler: Simpler<"0.0.5">, name: string): DeviceParameter<"0.0.5"> | null {
    return simpler.parameters.find((p) => p.name === name) ?? null;
  }

  // Remaps DrumChain.receivingNote across the rack so each pad is triggered
  // by a different MIDI note. Works on any pad contents (Simpler, Drum
  // Sampler, nested racks, empty) because it only touches the DrumChain
  // itself, not the devices inside. The visible pad grid follows
  // receivingNote, so pads visually rearrange too.
  context.commands.registerCommand("drumRackJumbler.swapDrumPads", async (arg: unknown) => {
    const track = context.objects.getObjectFromHandle(arg as Handle, MidiTrack);
    const drumChains = findTopLevelDrumChains(track);
    if (!drumChains) {
      console.log("Swap Drum Pads: no top-level drum rack on this track");
      return;
    }
    if (drumChains.length < 2) {
      console.log("Swap Drum Pads: need at least 2 pads to swap");
      return;
    }
    const rng = mulberry32(Date.now() >>> 0);
    const originalNotes = drumChains.map((c) => c.receivingNote);
    const shuffledNotes = derange(originalNotes, rng);
    context.withinTransaction(() => {
      drumChains.forEach((chain, i) => {
        chain.receivingNote = shuffledNotes[i]!;
      });
    });
  });

  // Randomizes each pad's pitch within ±maxSemitones.
  // continuous=true uses Transpose (int) + Detune (cents) for fractional values;
  // continuous=false snaps to integer semitones (Transpose only, Detune reset to 0).
  async function randomizePitch(pads: DrumPad[], maxSemitones: number, continuous: boolean) {
    const rng: Rng = mulberry32(Date.now() >>> 0);
    type Target = {
      transpose: DeviceParameter<"0.0.5">;
      detune: DeviceParameter<"0.0.5"> | null;
      semitones: number;
      cents: number;
    };
    const targets: Target[] = [];
    for (const pad of pads) {
      const transpose = findParameter(pad.simpler, "Transpose");
      if (!transpose) continue;
      const detune = findParameter(pad.simpler, "Detune");
      let semitones: number;
      let cents: number;
      if (continuous) {
        const value = (rng() * 2 - 1) * maxSemitones;
        semitones = Math.round(value);
        cents = (value - semitones) * 100;
      } else {
        semitones = Math.floor(rng() * (2 * maxSemitones + 1)) - maxSemitones;
        cents = 0;
      }
      targets.push({ transpose, detune, semitones, cents });
    }
    if (targets.length === 0) return false;
    await context.withinTransaction(async () => {
      await Promise.all(
        targets.flatMap((t) => {
          const ops = [t.transpose.setValue(t.semitones)];
          if (t.detune) ops.push(t.detune.setValue(t.cents));
          return ops;
        }),
      );
    });
    return true;
  }

  function registerPitchCommand(
    id: string,
    label: string,
    maxSemitones: number,
    continuous: boolean,
  ) {
    context.commands.registerCommand(id, async (arg: unknown) => {
      const pads = resolvePads(arg);
      if (!pads) {
        console.log(`${label}: no top-level drum rack on this track`);
        return;
      }
      const ok = await randomizePitch(pads, maxSemitones, continuous);
      if (!ok) console.log(`${label}: no Transpose parameter found on any Simpler`);
    });
    context.ui.registerContextMenuAction("MidiTrack", label, id);
  }

  context.commands.registerCommand("drumRackJumbler.zeroPitch", async (arg: unknown) => {
    const pads = resolvePads(arg);
    if (!pads) {
      console.log("Zero Pitch Shift Simplers: no top-level drum rack on this track");
      return;
    }
    const ops: Promise<void>[] = [];
    for (const pad of pads) {
      const transpose = findParameter(pad.simpler, "Transpose");
      const detune = findParameter(pad.simpler, "Detune");
      if (transpose) ops.push(transpose.setValue(0));
      if (detune) ops.push(detune.setValue(0));
    }
    if (ops.length === 0) {
      console.log("Zero Pitch Shift Simplers: no Transpose/Detune parameters found on any Simpler");
      return;
    }
    await context.withinTransaction(async () => {
      await Promise.all(ops);
    });
  });
  context.ui.registerContextMenuAction(
    "MidiTrack",
    "Zero Pitch Shift Simplers",
    "drumRackJumbler.zeroPitch",
  );

  registerPitchCommand("drumRackJumbler.pitch1", "Pitch Shift Simplers (±1 semitone)", 1, true);
  registerPitchCommand(
    "drumRackJumbler.pitch12",
    "Pitch Shift Simplers (±12 semitones)",
    12,
    false,
  );
  registerPitchCommand(
    "drumRackJumbler.pitch24",
    "Pitch Shift Simplers (±24 semitones)",
    24,
    false,
  );

  context.ui.registerContextMenuAction(
    "MidiTrack",
    "Swap Drum Pads",
    "drumRackJumbler.swapDrumPads",
  );
}
