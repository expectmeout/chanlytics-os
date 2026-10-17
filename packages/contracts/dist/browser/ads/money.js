import { numberFormat } from "../shared/time.js";
import { MINOR_PER_UNIT } from "./ads.js";
export const ADS_DEFAULT_CURRENCY = "USD";
function shown(units, currency, digits) {
  return numberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(units);
}
export function moneyOf(minor, currency) {
  const units = minor / MINOR_PER_UNIT;
  if (Number.isInteger(units) || units >= 10) return shown(Math.round(units), currency, 0);
  return shown(units, currency, 2);
}
export const perDayOf = (minor, currency) => `${moneyOf(minor, currency)} a day`;
export const leftOfMoney = (left, total, currency) => `${moneyOf(left, currency)} left of ${moneyOf(total, currency)}`;
export function currencySymbol(currency) {
  const parts = numberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(
    0
  );
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}
export const minorOfUnits = (units) => units * MINOR_PER_UNIT;
export function sumsOf(items) {
  const sums = /* @__PURE__ */ new Map();
  for (const i of items) sums.set(i.currency, (sums.get(i.currency) ?? 0) + i.minor);
  return [...sums].map(([currency, minor]) => ({ currency, minor }));
}
export function sumMoney(items) {
  const sums = sumsOf(items);
  if (sums.length === 0) return moneyOf(0, ADS_DEFAULT_CURRENCY);
  return sums.map((s) => moneyOf(s.minor, s.currency)).join(" + ");
}
