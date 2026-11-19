/**
 * An ad's money (decision 0049, call 9): an amount is a whole number of its currency's own minor units, beside the
 * currency's ISO 4217 code. A dollar holds a hundred cents, a yen is its own smallest unit, a Kuwaiti dinar holds a
 * thousand fils: how many is the currency's own, as ISO 4217 lists it, and never assumed to be a hundred. An amount is
 * never converted, and two currencies are never added.
 *
 * The list is written here, not read from the runtime's own currency table (Intl): that table moves between versions
 * (the forint and the Colombian peso hold a hundred in the data one Node ships and one in the next), and an amount is
 * kept by one runtime and read by another: the edge writes what an ad spent, a browser of any age says it. An amount
 * kept under one count and read under another would be a hundred times off.
 *
 * This is the one rule every tree reads an amount by. How a page says an amount is the page's
 * (apps/dashboard/src/surfaces/campaigns/ads/model/money.ts).
 */

/** The currencies ISO 4217 gives no minor unit: the amount is whole units. */
const WHOLE: ReadonlySet<string> = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "UYI",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);
/** The ones it divides in a thousand. */
const THOUSANDTHS: ReadonlySet<string> = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);
/** And in ten thousand. */
const TEN_THOUSANDTHS: ReadonlySet<string> = new Set(["CLF", "UYW"]);

/**
 * How many of a currency's minor units make one unit, as ISO 4217 lists it: 100 for USD, 1 for JPY, 1000 for KWD. A
 * code not listed above holds a hundred, as every other currency in use does; so does a code that is not three letters,
 * which is no currency an account can hold, so an odd account never throws.
 */
export function minorPerUnit(currency: string): number {
  const code = currency.toUpperCase();
  if (WHOLE.has(code)) return 1;
  if (THOUSANDTHS.has(code)) return 1000;
  return TEN_THOUSANDTHS.has(code) ? 10_000 : 100;
}
