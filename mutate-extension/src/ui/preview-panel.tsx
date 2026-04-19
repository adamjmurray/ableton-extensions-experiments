import { useEffect, useMemo } from "preact/hooks";
import type { FillMode } from "../apply.js";
import { deriveSeed, deriveSeed2D } from "../rng.js";
import { generateVariations, type MutateControls, type VariationMode } from "../variations.js";
import type { PreviewClip } from "./bridge.js";
import { PianoRoll, type PianoRollColor } from "./piano-roll.js";

const SOURCE_WIDTH = 1160;
const SOURCE_HEIGHT = 140;
const THUMB_WIDTH = 224;
const THUMB_HEIGHT = 100;
const SOURCE_COLOR: PianoRollColor = { r: 77, g: 160, b: 255 };

export function PreviewPanel({
  clips,
  activeIndex,
  onActiveIndexChange,
  controls,
  variations,
  mutateSource,
  variationMode,
  baseSeed,
  fillMode,
  branch,
  onReroll,
}: {
  clips: PreviewClip[];
  activeIndex: number;
  onActiveIndexChange: (next: number) => void;
  controls: MutateControls;
  variations: number;
  mutateSource: boolean;
  variationMode: VariationMode;
  baseSeed: number;
  fillMode: FillMode;
  branch: "session" | "arrangement";
  onReroll: () => void;
}) {
  const total = clips.length;
  const safeIndex = Math.min(Math.max(0, activeIndex), Math.max(0, total - 1));

  useEffect(() => {
    if (safeIndex !== activeIndex) onActiveIndexChange(safeIndex);
  }, [safeIndex, activeIndex, onActiveIndexChange]);

  const active = clips[safeIndex];

  const { inPlaceNotes, variationNotes } = useMemo(() => {
    if (!active) return { inPlaceNotes: null, variationNotes: [] };
    const seedFor =
      active.seedAxis !== undefined
        ? (i: number) => deriveSeed2D(baseSeed, active.seedAxis as number, i)
        : (i: number) => deriveSeed(baseSeed, i);
    const chainBaseSeed =
      active.seedAxis !== undefined ? deriveSeed2D(baseSeed, active.seedAxis, 0) : baseSeed;
    if (variationMode === "cumulative") {
      const totalVars = (mutateSource ? 1 : 0) + variations;
      const chain = generateVariations(
        active.sourceNotes,
        controls,
        totalVars,
        chainBaseSeed,
        active.bounds,
        "cumulative",
      );
      return {
        inPlaceNotes: mutateSource ? (chain[0] ?? null) : null,
        variationNotes: mutateSource ? chain.slice(1) : chain,
      };
    }
    const inPlace = mutateSource
      ? generateVariations(active.sourceNotes, controls, 1, seedFor(0), active.bounds)[0]!
      : null;
    const vars = Array.from(
      { length: variations },
      (_, i) =>
        generateVariations(active.sourceNotes, controls, 1, seedFor(i + 1), active.bounds)[0]!,
    );
    return { inPlaceNotes: inPlace, variationNotes: vars };
  }, [active, controls, variations, baseSeed, mutateSource, variationMode]);

  if (!active) {
    return (
      <div class="preview-panel">
        <div style={{ color: "var(--text-dim)" }}>No MIDI clips to preview.</div>
      </div>
    );
  }

  const isArrangement = branch === "arrangement";
  const varLabel = isArrangement ? "Mutate" : "Var";
  const slotsOccupied = active.slotsBelowOccupied ?? [];
  const availableSlots = active.availableSlotsBelow ?? 0;

  return (
    <div class="preview-panel">
      <div class="preview-header">
        <div class="label">Preview</div>
        {total > 1 && (
          <div class="clip-picker">
            <button
              type="button"
              class="btn small"
              aria-label="Previous clip"
              disabled={safeIndex <= 0}
              onClick={() => onActiveIndexChange(Math.max(0, safeIndex - 1))}
            >
              ◀
            </button>
            <div class="clip-picker-label">
              Clip {safeIndex + 1} of {total}
            </div>
            <button
              type="button"
              class="btn small"
              aria-label="Next clip"
              disabled={safeIndex >= total - 1}
              onClick={() => onActiveIndexChange(Math.min(total - 1, safeIndex + 1))}
            >
              ▶
            </button>
          </div>
        )}
        <button
          type="button"
          class="btn small reroll"
          aria-label="Reroll random seed"
          title="Reroll random seed"
          onClick={onReroll}
        >
          <span class="reroll-label">Reroll</span>
          <span class="reroll-die">🎲</span>
        </button>
        <div class="preview-clip-name">
          {active.trackName}
          {active.clipName ? ` · ${active.clipName}` : ""}
        </div>
      </div>

      <div class="preview-source">
        <div class="mini-label">Source</div>
        <PianoRoll
          notes={active.sourceNotes}
          bounds={active.bounds}
          width={SOURCE_WIDTH}
          height={SOURCE_HEIGHT}
          color={SOURCE_COLOR}
        />
      </div>

      {(inPlaceNotes || variationNotes.length > 0) && (
        <div class="variations">
          {inPlaceNotes && (
            <div class="variation in-place">
              <div class="label">
                <span>Source (in-place)</span>
                <span class="status">overwrite</span>
              </div>
              <PianoRoll
                notes={inPlaceNotes}
                bounds={active.bounds}
                width={THUMB_WIDTH}
                height={THUMB_HEIGHT}
              />
            </div>
          )}
          {variationNotes.map((notes, i) => {
            if (isArrangement) {
              return (
                <div key={i} class="variation">
                  <div class="label">
                    <span>
                      {varLabel} {i + 1}
                    </span>
                    <span class="status">new lane</span>
                  </div>
                  <PianoRoll
                    notes={notes}
                    bounds={active.bounds}
                    width={THUMB_WIDTH}
                    height={THUMB_HEIGHT}
                  />
                </div>
              );
            }
            const occupied = i < slotsOccupied.length && slotsOccupied[i];
            const noSlot = i >= availableSlots;
            const willSkip = !!occupied && fillMode === "skip";
            const dimmed = willSkip;
            let status = "";
            if (noSlot) status = "new scene";
            else if (willSkip) status = "skip (occupied)";
            else if (occupied) status = "overwrite";
            return (
              <div key={i} class={`variation${dimmed ? " dimmed" : ""}`}>
                <div class="label">
                  <span>
                    {varLabel} {i + 1}
                  </span>
                  {status ? <span class="status">{status}</span> : null}
                </div>
                <PianoRoll
                  notes={notes}
                  bounds={active.bounds}
                  width={THUMB_WIDTH}
                  height={THUMB_HEIGHT}
                  dimmed={dimmed}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
