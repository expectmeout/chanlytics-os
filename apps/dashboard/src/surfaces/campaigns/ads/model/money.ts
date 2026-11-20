/**
 * An ad's money, said one way: the account's own currency, never converted (Ads rule 7). An amount is a whole number of
 * the currency's own minor units (contracts `minorPerUnit`: a hundred to the dollar, one to the yen, a thousand to the
 * dinar), and it is said exact: what an owner approved, or a platform charged, is never rounded to a unit. Only an
 * average nobody approved, the cost for each person, is (`aboutMoneyOf`). Two accounts in two currencies are two sums,
 * side by side.
 */
import { minorPerUnit, numberFormat } from "@chanlytics/contracts";

/** What a sum of nothing is said in, and what an account that has none yet is read in: the currency most accounts are in. */
export const ADS_DEFAULT_CURRENCY = "USD";

/** A number of units with its currency's symbol, in the digits asked for; a code that is no currency is said beside it. */
function unitsSaid(units: number, currency: string, digits: number): string {
  const fraction = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  if (!/^[A-Za-z]{3}$/.test(currency)) return `${numberFormat("en-US", fraction).format(units)} ${currency}`.trim();
  return numberFormat("en-US", { style: "currency", currency, ...fraction }).format(units);
}

/**
 * An amount, exact: `$14`, `$12.50`, `$1,284.50`, `¥1,284`, `KWD 1.250`. A whole number of units is said without its
 * fraction, and any other with every digit its currency keeps.
 */
export function moneyOf(minor: number, currency: string): string {
  const perUnit = minorPerUnit(currency);
  const whole = Math.round(minor);
  // The digits a currency keeps are the zeros of its minor units: 100 keeps two, 1 none, 1000 three.
  return unitsSaid(whole / perUnit, currency, whole % perUnit === 0 ? 0 : String(perUnit).length - 1);
}

/**
 * An average nobody approved (the cost for each person who booked), which has no exact minor unit of its own: whole
 * units from 10 up, and as `moneyOf` says it under 10, where a unit is too coarse.
 */
export function aboutMoneyOf(minor: number, currency: string): string {
  const units = minor / minorPerUnit(currency);
  return Math.abs(units) >= 10 ? unitsSaid(Math.round(units), currency, 0) : moneyOf(minor, currency);
}

/** An amount with its unit: `$15 a day`. */
export const perDayOf = (minor: number, currency: string): string => `${moneyOf(minor, currency)} a day`;

/** What is left of a total: `$308 left of $720`. */
export const leftOfMoney = (left: number, total: number, currency: string): string =>
  `${moneyOf(left, currency)} left of ${moneyOf(total, currency)}`;

/** A whole number of units, as the minor units an amount is held in, by the currency's own. */
export const minorOfUnits = (units: number, currency: string): number => Math.round(units * minorPerUnit(currency));

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
