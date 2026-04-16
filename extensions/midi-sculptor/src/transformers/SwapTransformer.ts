import Note from "../Note.js";
import { mod } from "../utils.js";
import Transformer from "./Transformer.js";

export default class SwapTransformer extends Transformer {
  targets: string[];

  constructor() {
    super();
    this.targets = ["pitch", "velocity", "duration", "velrange", "release", "duration"];
  }

  set notes(notes: Note[]) {
    super.setNotes(notes);
  }

  target(target: string, enabled: boolean): void {
    const { targets } = this;
    const index = targets.indexOf(target);

    if (enabled) {
      if (index < 0) {
        targets.push(target);
      }
    } else {
      if (index >= 0) {
        targets.splice(index, 1);
      }
    }
  }

  swap(mapIndex: (index: number, size: number) => number): Note[] {
    const { newNotes, oldNotes, targets } = this;
    return newNotes.map((note, index) => {
      const mappedIndex = mapIndex(index, newNotes.length);
      const mappedNote = oldNotes[mappedIndex] || oldNotes[index]!;
      targets.forEach((prop) =>
        note.set(prop as any, mappedNote.get(prop as any)),
      );
      return note;
    });
  }

  rotate(amount: number): Note[] {
    amount = Math.round(amount * this.oldNotes.length);
    return this.swap((index, size) => mod(index - amount, size));
  }

  swapPairs(): Note[] {
    return this.swap((index) => (index % 2 == 0 ? index + 1 : index - 1));
  }

  reverse(): Note[] {
    return this.swap((index, size) => size - index - 1);
  }

  zip(): Note[] {
    return this.swap((index, size) => {
      const middle = Math.floor(size / 2);
      return index < middle ? 2 * index + 1 : (index - middle) * 2;
    });
  }

  unzip(): Note[] {
    return this.swap((index, size) => {
      const middle = Math.floor(size / 2);
      return index % 2 === 0 ? middle + index / 2 : (index - 1) / 2;
    });
  }

  randomize2D(amountX: number, amountY: number): Note[] {
    return this.swap((index, size) => {
      if (this.isInRandomBounds(amountX, amountY, index)) {
        const random = Math.abs(
          amountX > 0 ? this.bipolarRandom1[index]! : this.bipolarRandom2[index]!,
        );
        return Math.floor(random * size);
      } else {
        return index;
      }
    });
  }
}
