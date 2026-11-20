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

/** A whole number of units, as the minor units an amount is held in, by the currency's own. */
export const minorOfUnits = (units: number, currency: string): number => Math.round(units * minorPerUnit(currency));
