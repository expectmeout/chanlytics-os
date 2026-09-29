/**
 * A deal's amount in words and back (0004): "$2,500 a month" from its cents and how it recurs, cents from what a
 * person typed, and what a set of deals comes to. The deal card, the sheet, the Pipeline and Reports say it so.
 */
import { DEAL_PERS, DEAL_PER_WORDS, type DealPer } from "./deal-words";

/** "$2,500 a month", "$999.50", "$1,200 a year"; null without an amount. */
export function amountWords(
  cents: number | null | undefined,
  per: string | null | undefined,
  currency = "USD",
): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return null;
  const whole = cents % 100 === 0;
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
  const p = per && (DEAL_PERS as readonly string[]).includes(per) ? DEAL_PER_WORDS[per as DealPer] : null;
  return p && per !== "once" ? `${money} ${p}` : money;
}

/**
 * Cents from what a person typed ("2,500", "$999.50"), or null for anything
 * that is not an amount. Everything but digits, a point and a minus goes
 * first; letters alone strip to "", and Number("") is 0, which once made
 * "abc" a $0 client; the minus survives the strip, so "-5" is refused rather
 * than read as five dollars.
 */
export function parseAmount(words: string | null | undefined): number | null {
  const digits = String(words || "").replace(/[^0-9.-]/g, "");
  const n = digits ? Number(digits) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** An amount as a deal carries one: its cents, how it recurs and its currency. */
export interface AmountFact {
  amount_cents?: number | null;
  per?: string | null;
  currency?: string | null;
}

/**
 * What a set of deals is worth, summed by how each recurs and joined: "$4,250
 * + $600 a month". Once and no per are one sum; a currency is never added to
 * another. Null when nothing has an amount.
 */
export function amountTotalsWords(items: readonly AmountFact[]): string | null {
  const order = ["once", "month", "year"];
  const sums = new Map<string, { cents: number; per: string; currency: string }>();
  for (const i of items) {
    if (i.amount_cents === null || i.amount_cents === undefined || !Number.isFinite(i.amount_cents)) continue;
    const per = i.per === "month" || i.per === "year" ? i.per : "once";
    const currency = (i.currency || "USD").toUpperCase();
    const key = `${per}|${currency}`;
    const s = sums.get(key) ?? { cents: 0, per, currency };
    s.cents += i.amount_cents;
    sums.set(key, s);
  }
  if (!sums.size) return null;
  return [...sums.values()]
    .sort((a, b) => order.indexOf(a.per) - order.indexOf(b.per) || a.currency.localeCompare(b.currency))
    .map((s) => amountWords(s.cents, s.per, s.currency))
    .join(" + ");
}
