export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function fuzzyEquals(num1: number, num2: number, delta = 0.0001): boolean {
  return Math.abs(num1 - num2) < delta || Object.is(num1, num2);
}

export function mod(dividend: number, divisor: number): number {
  const remainder = dividend % divisor;
  // Math.abs() converts -0 to 0 when the divisor is negative:
  return remainder >= 0 ? Math.abs(remainder) : remainder + divisor;
}

export function reflectedMod(dividend: number, divisor: number): number {
  const n = Math.abs(dividend);
  const value = mod(n, divisor);
  const reversed = Math.floor(n / divisor) % 2 === 1;
  return reversed ? divisor - value : value;
}
