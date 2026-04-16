import { describe, it, expect } from "vitest";
import { clamp, fuzzyEquals, mod, reflectedMod } from "../src/utils.js";

describe("utils", () => {
  describe("clamp(value, min, max)", () => {
    it("does not change values between the given minimum and maximum (inclusive)", () => {
      expect(clamp(0, 0, 3)).toBe(0);
      expect(clamp(1, 0, 3)).toBe(1);
      expect(clamp(2, 0, 3)).toBe(2);
      expect(clamp(3, 0, 3)).toBe(3);
      expect(clamp(1.5, 1.1, 1.6)).toBe(1.5);
      expect(clamp(-3, -3, 3)).toBe(-3);
      expect(clamp(1, 1, 1)).toBe(1);
    });

    it("sets the value to the minimum when it is less than the minimum", () => {
      expect(clamp(0, 1, 3)).toBe(1);
      expect(clamp(0, 2, 3)).toBe(2);
      expect(clamp(-1, 2, 3)).toBe(2);
      expect(clamp(-2, -1, 3)).toBe(-1);
      expect(clamp(1.1, 1.2, 3)).toBe(1.2);
    });

    it("sets the value to the maximum when it is greater than the maximum", () => {
      expect(clamp(5, 1, 3)).toBe(3);
      expect(clamp(5, 1, 4)).toBe(4);
      expect(clamp(0, -2, -1)).toBe(-1);
      expect(clamp(-1, -3, -2)).toBe(-2);
      expect(clamp(1.3, 1.1, 1.2)).toBe(1.2);
    });
  });

  describe("fuzzyEquals(num1, num2)", () => {
    it("is true when the numbers are equal", () => {
      expect(fuzzyEquals(0, 0)).toBe(true);
      expect(fuzzyEquals(1.5, 1.5)).toBe(true);
      expect(fuzzyEquals(-2 / 3, -2 / 3)).toBe(true);
      expect(fuzzyEquals(Number.MAX_VALUE, Number.MAX_VALUE)).toBe(true);
      expect(fuzzyEquals(Number.MAX_VALUE + 1, Number.MAX_VALUE + 1)).toBe(true);
    });

    it("is true when both numbers are NaN", () => {
      expect(fuzzyEquals(NaN, NaN)).toBe(true);
    });

    it("is true when both numbers are Infinity", () => {
      expect(fuzzyEquals(Infinity, Infinity)).toBe(true);
      expect(fuzzyEquals(-Infinity, -Infinity)).toBe(true);
    });

    it("is true when the numbers are different but close in value", () => {
      expect(fuzzyEquals(1, 1.0001)).toBe(true);
      expect(fuzzyEquals(10002 / 10000, 1.0001)).toBe(true);
      expect(fuzzyEquals(2 / 3, (2 / 3 / Number.MAX_VALUE) * Number.MAX_VALUE)).toBe(true);
    });

    it("is false when the numbers are different and not close in value", () => {
      expect(fuzzyEquals(0, 1)).toBe(false);
      expect(fuzzyEquals(0, 0.01)).toBe(false);
      expect(fuzzyEquals(-1, 1)).toBe(false);
      expect(fuzzyEquals(0, NaN)).toBe(false);
      expect(fuzzyEquals(Number.MAX_VALUE, Infinity)).toBe(false);
      expect(fuzzyEquals(Infinity, -Infinity)).toBe(false);
    });
  });

  describe("fuzzyEquals(num1, num2, delta)", () => {
    it("allows the fuzziness to be controlled", () => {
      expect(fuzzyEquals(0, 0.0999999999, 0.1)).toBe(true);
      expect(fuzzyEquals(0.0999999999, 0, 0.1)).toBe(true);
      expect(fuzzyEquals(0, 0.1, 0.1)).toBe(false);

      expect(fuzzyEquals(1, 1, 0)).toBe(true);
      expect(fuzzyEquals(1, 0.9999999999999, 0)).toBe(false);
    });
  });

  describe("mod(dividend, divisor)", () => {
    it("behaves like the % operator for positive numbers and handles negative numbers with wrap-around", () => {
      const tests: Record<number, Record<string, number>> = {
        0: { "-1": NaN, " 0": NaN, "+1": NaN },
        1: { "-2": 0, "-1": 0, " 0": 0, "+1": 0, "+2": 0 },
        2: { "-3": 1, "-2": 0, "-1": 1, " 0": 0, "+1": 1, "+2": 0, "+3": 1 },
        3: {
          "-4": 2, "-3": 0, "-2": 1, "-1": 2,
          " 0": 0, "+1": 1, "+2": 2, "+3": 0, "+4": 1,
        },
        4: {
          "-5": 3, "-4": 0, "-3": 1, "-2": 2, "-1": 3,
          " 0": 0, "+1": 1, "+2": 2, "+3": 3, "+4": 0, "+5": 1,
        },
        5: {
          "-6": 4, "-5": 0, "-4": 1, "-3": 2, "-2": 3, "-1": 4,
          " 0": 0, "+1": 1, "+2": 2, "+3": 3, "+4": 4, "+5": 0, "+6": 1,
        },
      };
      Object.entries(tests).forEach(([divisorString, expectations]) => {
        const divisor = Number(divisorString);
        Object.entries(expectations).forEach(([dividend, expected]) => {
          expect(mod(Number(dividend), divisor)).toBe(expected);
        });
      });
    });

    it("works with fractional numbers", () => {
      const tests: Record<number, Record<string, number>> = {
        0: { "-0.2": NaN, "+0.2": NaN },
        1: { "-1.2": 0.8, "-0.2": 0.8, "+0.2": 0.2, "+1.2": 0.2 },
        2: {
          "-4.2": 1.8, "-3.2": 0.8, "-2.2": 1.8, "-1.2": 0.8, "-0.2": 1.8,
          "+0.2": 0.2, "+1.2": 1.2, "+2.2": 0.2, "+3.2": 1.2, "+4.2": 0.2,
        },
      };
      Object.entries(tests).forEach(([divisorString, expectations]) => {
        const divisor = Number(divisorString);
        Object.entries(expectations).forEach(([dividend, expected]) => {
          const actual = mod(Number(dividend), divisor);
          expect(fuzzyEquals(actual, expected)).toBe(true);
        });
      });
    });
  });

  describe("reflectedMod(dividend, divisor)", () => {
    it('"bounces" off the boundary', () => {
      const tests: Record<number, Record<string, number>> = {
        0: { "-1": NaN, " 0": NaN, "+1": NaN },
        1: { "-3": 1, "-2": 0, "-1": 1, " 0": 0, "+1": 1, "+2": 0, "+3": 1 },
        2: {
          "-5": 1, "-4": 0, "-3": 1, "-2": 2, "-1": 1,
          " 0": 0, "+1": 1, "+2": 2, "+3": 1, "+4": 0, "+5": 1,
        },
        3: {
          "-7": 1, "-6": 0, "-5": 1, "-4": 2, "-3": 3, "-2": 2, "-1": 1,
          " 0": 0, "+1": 1, "+2": 2, "+3": 3, "+4": 2, "+5": 1, "+6": 0, "+7": 1,
        },
        4: {
          "-9": 1, "-8": 0, "-7": 1, "-6": 2, "-5": 3, "-4": 4, "-3": 3, "-2": 2, "-1": 1,
          " 0": 0, "+1": 1, "+2": 2, "+3": 3, "+4": 4, "+5": 3, "+6": 2, "+7": 1, "+8": 0, "+9": 1,
        },
      };
      Object.entries(tests).forEach(([divisorString, expectations]) => {
        const divisor = Number(divisorString);
        Object.entries(expectations).forEach(([dividend, expected]) => {
          expect(reflectedMod(Number(dividend), divisor)).toBe(expected);
        });
      });
    });

    it("works with fractional numbers", () => {
      const tests: Record<number, Record<string, number>> = {
        0: { "-0.2": NaN, "+0.2": NaN },
        1: { "-2.2": 0.2, "-1.2": 0.8, "-0.2": 0.2, "+0.2": 0.2, "+1.2": 0.8, "+2.2": 0.2 },
        2: { "-4.2": 0.2, "-3.2": 0.8, "-2.2": 1.8, "+2.2": 1.8, "+3.2": 0.8, "+4.2": 0.2 },
      };
      Object.entries(tests).forEach(([divisorString, expectations]) => {
        const divisor = Number(divisorString);
        Object.entries(expectations).forEach(([dividend, expected]) => {
          const actual = reflectedMod(Number(dividend), divisor);
          expect(fuzzyEquals(actual, expected)).toBe(true);
        });
      });
    });
  });
});
