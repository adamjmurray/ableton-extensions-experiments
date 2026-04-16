import { describe } from "vitest";
import { runSlideTransformerTests } from "../helpers.js";

describe("SlideTransformer", () => {
  runSlideTransformerTests("spread", {
    pitch: [
      {
        input: [10, 11, 12, 13],
        range: 12,
        amount: 0.5,
        expected: [4, 9, 14, 19],
      },
      {
        input: [4, 7, 10, 13],
        range: 12,
        amount: -0.25,
        expected: [7, 8, 9, 10],
      },
    ],
    velocity: [
      {
        input: [10, 11, 12, 13],
        range: 12,
        amount: 0.5,
        expected: [4, 9, 14, 19],
      },
      {
        input: [4, 7, 10, 13],
        range: 12,
        amount: -0.25,
        expected: [7, 8, 9, 10],
      },
    ],
    start: [
      {
        input: [10, 11, 12, 13],
        clip: { start: 0, end: 32 },
        range: 12,
        amount: 0.5,
        expected: [4, 9, 14, 19],
      },
      {
        input: [4, 7, 10, 13],
        range: 12,
        amount: -0.25,
        expected: [7, 8, 9, 10],
      },
    ],
    duration: [
      {
        input: [10, 11, 12, 13],
        clip: { start: 0, end: 32 },
        range: 12,
        amount: 0.5,
        expected: [4, 9, 14, 19],
      },
      {
        input: [4, 7, 10, 13],
        range: 12,
        amount: -0.25,
        expected: [7, 8, 9, 10],
      },
    ],
  });
});
