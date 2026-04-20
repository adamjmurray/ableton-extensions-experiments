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
import { type DrumPad, findTopLevelDrumPads } from "./walker.js";

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

  context.commands.registerCommand("drumRackJumbler.shuffle", async (arg: unknown) => {
    const pads = resolvePads(arg);
    if (!pads) {
      console.log("Swap Simplers in Drum Rack: no top-level drum rack on this track");
      return;
    }
    if (pads.length < 2) {
      console.log("Swap Simplers in Drum Rack: need at least 2 pads with samples to swap");
      return;
    }
    const rng = mulberry32(Date.now() >>> 0);
    const shuffledPaths = derange(
      pads.map((p) => p.path),
      rng,
    );
    await context.withinTransaction(async () => {
      await Promise.all(pads.map((pad, i) => pad.simpler.replaceSample(shuffledPaths[i]!)));
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
    "Swap Simplers in Drum Rack",
    "drumRackJumbler.shuffle",
  );
}
