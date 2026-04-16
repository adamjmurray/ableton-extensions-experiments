import Note from "../Note.js";

export default class Transformer {
  oldNotes: Note[];
  newNotes: Note[];
  randoms: number[][];
  unipolarRandom: number[];
  bipolarRandom1: number[];
  bipolarRandom2: number[];
  clip: { start: number; end: number; length: number } | undefined;

  constructor() {
    this.oldNotes = [];
    this.newNotes = [];
    this.randoms = [[1], [2], [3], [4], [5], [6], [7], [8]];
    this.unipolarRandom = [];
    this.bipolarRandom1 = [];
    this.bipolarRandom2 = [];
  }

  setNotes(notes: Note[]): void {
    this.oldNotes = Object.freeze(notes) as Note[];
    this.newNotes = notes.map((note) => note.clone());
    notes.forEach((_, index) => {
      for (const random of this.randoms) {
        random[index] = Math.pow(Math.random(), 2);
      }
      this.unipolarRandom[index] = Math.random();
      this.bipolarRandom1[index] = 2 * Math.random() - 1;
      this.bipolarRandom2[index] = 2 * Math.random() - 1;
    });
  }

  isInRandomBounds(x: number, y: number, noteIndex: number): boolean {
    if (x > 0) {
      if (y > 0) {
        return x >= this.randoms[0]![noteIndex]! && y >= this.randoms[1]![noteIndex]!;
      } else {
        return x >= this.randoms[2]![noteIndex]! && -y >= this.randoms[3]![noteIndex]!;
      }
    } else {
      if (y > 0) {
        return -x >= this.randoms[4]![noteIndex]! && y >= this.randoms[5]![noteIndex]!;
      } else {
        return -x >= this.randoms[6]![noteIndex]! && -y >= this.randoms[7]![noteIndex]!;
      }
    }
  }
}
