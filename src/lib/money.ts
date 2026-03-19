import { dinero, add, subtract, toDecimal, USD, type Dinero } from "dinero.js";

/**
 * Currency-safe money helpers using dinero.js v2.
 * All amounts are in USD cents internally for accuracy.
 */

/** Create a Dinero<number> from a dollar amount (e.g. 1234.56 → 123456 cents). */
export function usd(dollars: number): Dinero<number> {
  return dinero({ amount: Math.round(dollars * 100), currency: USD });
}

/** Convert a Dinero to a plain number (dollars). */
export function toDollars(d: Dinero<number>): number {
  return parseFloat(toDecimal(d));
}

/** Sum an array of dollar amounts with currency safety. */
export function sumDollars(values: number[]): number {
  if (values.length === 0) return 0;
  const result = values.reduce((acc, v) => add(acc, usd(v)), usd(0));
  return toDollars(result);
}

/** Subtract b from a with currency safety. */
export function subtractDollars(a: number, b: number): number {
  return toDollars(subtract(usd(a), usd(b)));
}

/** Format a dollar number for display (no $ sign). */
export function fmtMoney(n: number): string {
  return Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
