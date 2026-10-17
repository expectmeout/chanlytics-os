import { DEAL_PERS, DEAL_PER_WORDS } from "./deal-words.js";
import { numberFormat } from "../shared/time.js";
export function amountWords(cents, per, currency = "USD") {
  if (cents === null || cents === void 0 || !Number.isFinite(cents)) return null;
  const whole = cents % 100 === 0;
  const money = numberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2
  }).format(cents / 100);
  const p = per && DEAL_PERS.includes(per) ? DEAL_PER_WORDS[per] : null;
  return p && per !== "once" ? `${money} ${p}` : money;
}
export function parseAmount(words) {
  const digits = String(words || "").replace(/[^0-9.-]/g, "");
  const n = digits ? Number(digits) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
export function amountTotalsWords(items) {
  const order = ["once", "month", "year"];
  const sums = /* @__PURE__ */ new Map();
  for (const i of items) {
    if (i.amount_cents === null || i.amount_cents === void 0 || !Number.isFinite(i.amount_cents)) continue;
    const per = i.per === "month" || i.per === "year" ? i.per : "once";
    const currency = (i.currency || "USD").toUpperCase();
    const key = `${per}|${currency}`;
    const s = sums.get(key) ?? { cents: 0, per, currency };
    s.cents += i.amount_cents;
    sums.set(key, s);
  }
  if (!sums.size) return null;
  return [...sums.values()].sort((a, b) => order.indexOf(a.per) - order.indexOf(b.per) || a.currency.localeCompare(b.currency)).map((s) => amountWords(s.cents, s.per, s.currency)).join(" + ");
}
