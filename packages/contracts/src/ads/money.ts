/**
 * An ad's money (decision 0049, call 9): an amount is a whole number of its currency's own minor units, beside the
 * currency's ISO 4217 code. A dollar holds a hundred cents, a yen is its own smallest unit, a Kuwaiti dinar holds a
 * thousand fils: how many is the currency's own, read from the runtime's currency table (Intl) and never assumed to be a
 * hundred. An amount is never converted, and two currencies are never added.
 *
 * This is the one rule every tree reads an amount by. How a page says an amount is the page's
 * (apps/dashboard/src/surfaces/campaigns/ads/model/money.ts).
 */
import { numberFormat } from "../shared/time";

/**
 * How many of a currency's minor units make one unit: 100 for USD, 1 for JPY, 1000 for KWD. A code that is not three
 * letters is no currency an account can hold; it is read as a hundred, the commonest, so an odd account never throws.
 */
export function minorPerUnit(currency: string): number {
  if (!/^[A-Za-z]{3}$/.test(currency)) return 100;
  const digits = numberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return 10 ** digits;
}
