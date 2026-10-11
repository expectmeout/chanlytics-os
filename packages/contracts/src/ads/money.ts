/**
 * An ad's money, said one way: the account's own currency, never converted (Ads rule 7). An amount is an integer in the
 * currency's minor units; it is shown in whole units from 10 (and for any whole number), in cents under 10 where there are
 * some, with the currency's symbol. Two accounts in two currencies are two sums, side by side.
 */
import { numberFormat } from "../shared/time";
import { MINOR_PER_UNIT } from "./ads";

/** What a sum of nothing is said in, and what an account that has none yet is read in: the currency most accounts are in. */
export const ADS_DEFAULT_CURRENCY = "USD";

/** A currency's amount in the symbol and the digits asked for. */
function shown(units: number, currency: string, digits: number): string {
  return numberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(units);
}

/** `$14`, `$1,284`, `$5.50`: whole units from 10 (and for any whole number), cents under 10 where there are some. */
export function moneyOf(minor: number, currency: string): string {
  const units = minor / MINOR_PER_UNIT;
  if (Number.isInteger(units) || units >= 10) return shown(Math.round(units), currency, 0);
  return shown(units, currency, 2);
}

/** An amount with its unit: `$15 a day`. */
export const perDayOf = (minor: number, currency: string): string => `${moneyOf(minor, currency)} a day`;

/** What is left of a total: `$308 left of $720`. */
export const leftOfMoney = (left: number, total: number, currency: string): string =>
  `${moneyOf(left, currency)} left of ${moneyOf(total, currency)}`;

/** The currency's symbol on its own: `$`, `£`. */
export function currencySymbol(currency: string): string {
  const parts = numberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(
    0,
  );
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}

/** A whole number of units, as the minor units an amount is held in. */
export const minorOfUnits = (units: number): number => units * MINOR_PER_UNIT;

/** One amount in its currency. */
export interface MoneyItem {
  minor: number;
  currency: string;
}

/** The sums of amounts, one for each currency in the order they first appear. Never converted. */
export function sumsOf(items: readonly MoneyItem[]): MoneyItem[] {
  const sums = new Map<string, number>();
  for (const i of items) sums.set(i.currency, (sums.get(i.currency) ?? 0) + i.minor);
  return [...sums].map(([currency, minor]) => ({ currency, minor }));
}

/** `$847`, or `$847 + £230` where the currencies differ: each currency's sum, side by side, never converted. */
export function sumMoney(items: readonly MoneyItem[]): string {
  const sums = sumsOf(items);
  if (sums.length === 0) return moneyOf(0, ADS_DEFAULT_CURRENCY);
  return sums.map((s) => moneyOf(s.minor, s.currency)).join(" + ");
}
