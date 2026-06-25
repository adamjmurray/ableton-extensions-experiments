import {
  type ActivationContext,
  DataModelObject,
  type DeviceParameter,
  DrumRack,
  type Handle,
  initialize,
  type Simpler,
} from "@ableton-extensions/sdk";
import { derange } from "./derange.js";
import { mulberry32, type Rng } from "./rng.js";
import { type DrumPad, drumChains, drumPads } from "./walker.js";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  console.log("Drum Rack Jumbler activated!");

  // Every action is registered only on the "DrumRack" scope, so the arg is
  // always the right-clicked Drum Rack's handle.
  function resolveDrumRack(arg: unknown): DrumRack<"1.0.0"> | null {
    const obj = context.getObjectFromHandle(arg as Handle, DataModelObject);
    return obj instanceof DrumRack ? obj : null;
  }

  function resolvePads(arg: unknown): DrumPad[] | null {
    const rack = resolveDrumRack(arg);
    return rack ? drumPads(rack) : null;
  }

  function findParameter(simpler: Simpler<"1.0.0">, name: string): DeviceParameter<"1.0.0"> | null {
    return simpler.parameters.find((p) => p.name === name) ?? null;
  }

  // -------------------------------------------------------------------
  // Command registrations. Order doesn't affect the menu — menu order is
  // controlled by the registerContextMenuAction block at the bottom.
  // -------------------------------------------------------------------

  // Remaps DrumChain.receivingNote across the rack so each pad is triggered
  // by a different MIDI note. Works on any pad contents (Simpler, Drum
  // Sampler, nested racks, empty) because it only touches the DrumChain
  // itself, not the devices inside. The visible pad grid follows
  // receivingNote, so pads visually rearrange too.
  context.commands.registerCommand("drumRackJumbler.swapDrumPads", async (arg: unknown) => {
    const rack = resolveDrumRack(arg);
    if (!rack) {
      console.log("Swap Drum Pads: no drum rack in this selection");
      return;
    }
    const chains = drumChains(rack);
    if (chains.length < 2) {
      console.log("Swap Drum Pads: need at least 2 pads to swap");
      return;
    }
    const rng = mulberry32(Date.now() >>> 0);
    const originalNotes = chains.map((c) => c.receivingNote);
    const shuffledNotes = derange(originalNotes, rng);
    context.withinTransaction(() => {
      chains.forEach((chain, i) => {
        chain.receivingNote = shuffledNotes[i]!;
      });
    });
  });

  context.commands.registerCommand("drumRackJumbler.randomizePan", async (arg: unknown) => {
    const rack = resolveDrumRack(arg);
    if (!rack) {
      console.log("Randomize Panning: no drum rack in this selection");
      return;
    }
    const rng = mulberry32(Date.now() >>> 0);
    await context.withinTransaction(async () => {
      await Promise.all(
        drumChains(rack).map((chain) => {
          const pan = chain.mixer.panning;
          return pan.setValue(pan.min + rng() * (pan.max - pan.min));
        }),
      );
    });
  });

  context.commands.registerCommand("drumRackJumbler.centerPan", async (arg: unknown) => {
    const rack = resolveDrumRack(arg);
    if (!rack) {
      console.log("Center All Panning: no drum rack in this selection");
      return;
    }
    await context.withinTransaction(async () => {
      await Promise.all(drumChains(rack).map((chain) => chain.mixer.panning.setValue(0)));
    });
  });

  // Randomizes each pad's pitch within ±maxSemitones.
  // continuous=true uses Transpose (int) + Detune (cents) for fractional values;
  // continuous=false snaps to integer semitones (Transpose only, Detune reset to 0).
  async function randomizePitch(pads: DrumPad[], maxSemitones: number, continuous: boolean) {
    const rng: Rng = mulberry32(Date.now() >>> 0);
    type Target = {
      transpose: DeviceParameter<"1.0.0">;
      detune: DeviceParameter<"1.0.0"> | null;
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
        console.log(`${label}: no drum rack in this selection`);
        return;
      }
      const ok = await randomizePitch(pads, maxSemitones, continuous);
      if (!ok) console.log(`${label}: no Transpose parameter found on any Simpler`);
    });
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

  context.commands.registerCommand("drumRackJumbler.resetPitch", async (arg: unknown) => {
    const pads = resolvePads(arg);
    if (!pads) {
      console.log("Reset Simpler Pitch Shifts: no drum rack in this selection");
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
      console.log(
        "Reset Simpler Pitch Shifts: no Transpose/Detune parameters found on any Simpler",
      );
      return;
    }
    await context.withinTransaction(async () => {
      await Promise.all(ops);
    });
  });

  // -------------------------------------------------------------------
  // Menu order is the registration order below. Actions are registered only on
  // the DrumRack scope, so they appear when you right-click a Drum Rack device
  // (and never clutter the menu of a non-drum track).
  // -------------------------------------------------------------------
  const menuItems: [string, string][] = [
    ["Swap Drum Pads", "drumRackJumbler.swapDrumPads"],
    ["Randomize Panning", "drumRackJumbler.randomizePan"],
    ["Center All Panning", "drumRackJumbler.centerPan"],
    ["Pitch Shift Simplers (±1 semitone)", "drumRackJumbler.pitch1"],
    ["Pitch Shift Simplers (±12 semitones)", "drumRackJumbler.pitch12"],
    ["Pitch Shift Simplers (±24 semitones)", "drumRackJumbler.pitch24"],
    ["Reset Simpler Pitch Shifts", "drumRackJumbler.resetPitch"],
  ];
  for (const [label, commandId] of menuItems) {
    context.ui.registerContextMenuAction("DrumRack", label, commandId);
  }
}
