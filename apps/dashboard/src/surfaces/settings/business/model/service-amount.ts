/**
 * A service's amount in the Services sheet (the Ads tracking plan's T6): what the service is worth each time it is
 * booked, which a report counts bookings by. Its box holds a number with its currency ("45 USD"), exact text and never
 * a price note read; Settings keep whole minor units beside the currency's code (contracts ServiceSchema), and the pair
 * alone is an amount, as the database reads it (00683 service_amounts). Pure: what the box holds, what was typed in
 * it, what a save writes for it, and the sentences under it.
 */
import { isCurrencyCode, minorPerUnit, recordOrEmpty } from "@chanlytics/contracts";

/** A service's row as far as its amount goes: what Settings keep, and what is being typed over it. */
interface AmountRow {
  /** The box as typed, once it is typed in; absent while the stored amount stands. */
  amount?: string;
  amount_minor?: number;
  currency?: string;
}

/** A service's amount as money: its minor units beside its currency. */
interface ServiceAmount {
  minor: number;
  currency: string;
}

/** The box's words: its column, what it holds when empty, and what an amount is for. */
export const AMOUNT_WORDS = {
  head: "Amount",
  hint: "45 USD",
  /** Under the rows: what an amount is for, and that no customer is told it. */
  note: "What a service is worth each time it is booked. Reports count by it, and no customer is told it.",
  notMoney: "A number and its currency, like 45 USD.",
  noCurrency: (typed: string) => `Say its currency too, like ${typed} USD.`,
} as const;

/** The amount a stored service has, or null: the pair alone is an amount, and a price note is never read for one. */
function serviceAmountOf(service: unknown): ServiceAmount | null {
  const { amount_minor: minor, currency } = recordOrEmpty(service);
  return typeof minor === "number" && Number.isSafeInteger(minor) && minor >= 0 && isCurrencyCode(currency)
    ? { minor, currency }
    : null;
}

/** How many digits a currency keeps after its point: the zeros of its minor units (100 keeps two, 1 none). */
const fractionPlaces = (currency: string): number => String(minorPerUnit(currency)).length - 1;

/** What the box holds: what is being typed, else the stored amount with its currency, else nothing. */
export function amountBoxOf(row: AmountRow): string {
  if (typeof row.amount === "string") return row.amount;
  const kept = serviceAmountOf(row);
  if (!kept) return "";
  const perUnit = minorPerUnit(kept.currency);
  const digits = kept.minor % perUnit === 0 ? 0 : fractionPlaces(kept.currency);
  return `${(kept.minor / perUnit).toFixed(digits)} ${kept.currency}`;
}

/** A number, a fraction after a point or a comma, and a currency's three letters: "45", "45.50 USD", "120,50 eur". */
const TYPED = /^(\d{1,8})(?:[.,](\d{1,4}))?(?:\s*([A-Za-z]{3}))?$/;

/** What a typed box comes to: an amount, none for an emptied box, or the sentence said under it. */
type AmountTyped = { amount: ServiceAmount | null; problem?: undefined } | { problem: string };

/**
 * What was typed in the box, with the currency a number alone takes (`fallback`: the service's own, else the list's).
 * No currency is ever assumed: a number alone with nothing to take one from is asked for it.
 */
function amountTypedOf(typed: string, fallback: string | null): AmountTyped {
  const box = typed.trim();
  if (box === "") return { amount: null };
  const [, whole, fraction = "", code] = TYPED.exec(box) ?? [];
  if (whole === undefined) return { problem: AMOUNT_WORDS.notMoney };
  const currency = (code ?? fallback ?? "").toUpperCase();
  if (currency === "") return { problem: AMOUNT_WORDS.noCurrency(box) };
  const places = fractionPlaces(currency);
  if (fraction.length > places) return { problem: AMOUNT_WORDS.notMoney };
  const minor = Number(whole) * minorPerUnit(currency) + Number(fraction.padEnd(places, "0") || "0");
  return { amount: { minor, currency } };
}

/** The currency the list already uses: its first service with an amount kept. */
const listCurrencyOf = (rows: readonly AmountRow[]): string | null =>
  rows.map((row) => serviceAmountOf(row)?.currency ?? null).find((currency) => currency !== null) ?? null;

/** A row's typed box read against its list; null for a row nobody typed in, whose stored amount stands. */
const typedIn = (row: AmountRow, rows: readonly AmountRow[]): AmountTyped | null =>
  typeof row.amount === "string" ? amountTypedOf(row.amount, row.currency ?? listCurrencyOf(rows)) : null;

/** What is wrong with the box of the row at `at`, under the field key its sentence is said by; nothing for none. */
export function amountProblemAt(row: AmountRow, at: number, rows: readonly AmountRow[]): Record<string, string> {
  const problem = typedIn(row, rows)?.problem;
  return problem === undefined ? {} : { [`service-${at}-amount`]: problem };
}

/**
 * The keys a save writes for a row's amount: what was typed, else what is stored, which a save of the sheet must never
 * lose (AI's card sets it); none for a service with no amount, and for a box with a problem.
 */
export function amountKeysOf(row: AmountRow, rows: readonly AmountRow[]): { amount_minor?: number; currency?: string } {
  const typed = typedIn(row, rows);
  const amount = typed === null ? serviceAmountOf(row) : typed.problem === undefined ? typed.amount : null;
  return amount ? { amount_minor: amount.minor, currency: amount.currency } : {};
}
