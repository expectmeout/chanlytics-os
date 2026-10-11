/**
 * What you offer: the services row at rest, and the services sheet's words (its foot, its search, its Undo and
 * its Save). The prompt's share of each block is prompt-cost-words.ts; the booking rules are booking-rules-words.ts.
 */
import { CANNOT_SAY_SERVICES } from "./business-gap";
import { CHIPS_SHOWN, chipsMoreWords, count } from "./counts";
import { blockShareWords } from "./prompt-cost-words";

/* ---- What you offer ---- */

/** A service as the settings read hands one over (contracts ServiceSchema), read defensively: the page is untyped. */
export interface ServiceWordsInput {
  name?: string | null;
  duration_min?: number | null;
  price_note?: string | null;
}

export interface ServicesWordsVM {
  /** How many are on record. */
  count: number;
  /** "33"; null with none, and the row says it has none. The key says what it counts. */
  line: string | null;
  /** The first three in the stored order, which is the order the receptionist reads them in: each name, and how long it takes where it has a duration ("3 h", serviceTakesWords). */
  chips: { name: string; takes: string | null }[];
  /** "+30" past the three; null when every one is a chip. */
  more: string | null;
}

const SERVICE_CHIPS = CHIPS_SHOWN;

/**
 * How long something takes, in an owner's words: a service ("3 h"), or a shift of the hours from its opening to its
 * closing ("8 h 30 min"). "45 min" under an hour, then hours and what is left (never "180m", which a screen reader may
 * say as metres). Minutes as typed are read too ("90"), since the sheet's box holds a string while it is typed in;
 * anything that is not a positive number of minutes says nothing.
 */
export function lengthWords(minutes: number | string | null | undefined): string | null {
  const m = typeof minutes === "string" ? Number(minutes.trim()) : minutes;
  if (typeof m !== "number" || !Number.isFinite(m) || m <= 0) return null;
  const whole = Math.round(m);
  if (whole < 60) return `${whole} min`;
  const h = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** What a service's price says when none is written: the receptionist quotes it at a consultation. */
export const SERVICE_PRICE_EMPTY = "At consult";

/**
 * A service's one line in the services sheet on a phone, under its name: how long it takes, its price or that it is
 * quoted at a consultation, and that it is booked as a consultation first where the booking rules say so: "3 h · At
 * consult", "45 min · $40 · Consult first". The row opens onto its boxes when pressed.
 */
export function serviceLineWords(
  s: { duration_min?: number | string | null; price_note?: string | null },
  consultFirst: boolean,
): string {
  const price = typeof s.price_note === "string" && s.price_note.trim() ? s.price_note.trim() : SERVICE_PRICE_EMPTY;
  return [lengthWords(s.duration_min), price, consultFirst ? "Consult first" : null].filter(Boolean).join(" · ");
}

/**
 * The services row at rest: how many are on record, and the first few by name with how long each takes.
 *
 * It said how they were priced too, in a sentence of its own under the names ("None names a price.", judged by the
 * detector the replies are checked by), which on nearly every record was a line about nothing (24 Sep): a row states
 * its fact and stops, and the sheet's own line says when a price note is one to write. A service with no name is a
 * row nobody finished, which no save writes, and is not counted.
 */
export function servicesWords(services: readonly ServiceWordsInput[] | null | undefined): ServicesWordsVM {
  // A stored list that is not one (a hand-edited record) is no services, never a throw: the page draws this as it draws.
  const list = (Array.isArray(services) ? services : []).filter(
    (s): s is ServiceWordsInput & { name: string } => !!s && typeof s.name === "string" && s.name.trim() !== "",
  );
  const n = list.length;
  if (!n) return { count: 0, line: null, chips: [], more: null };
  const chips = list.slice(0, SERVICE_CHIPS).map((s) => ({
    name: s.name.trim(),
    takes: lengthWords(s.duration_min),
  }));
  return {
    count: n,
    line: count(n),
    chips,
    more: n > SERVICE_CHIPS ? chipsMoreWords(n - SERVICE_CHIPS) : null,
  };
}

/**
 * What the services sheet's foot says it will be told: "33 services, 1,190 characters — a quarter of everything it
 * reads." (the canvas's Edit-Sheet), from the services the save would write, its block's characters and the whole
 * prompt's length. With none it says what that costs, in the gap line's own words for it (CANNOT_SAY_SERVICES).
 */
export function servicesToldWords(i: { count: number; chars: number | null; total: number | null }): string {
  const n = i.count;
  if (!n) return `No services, so it ${CANNOT_SAY_SERVICES}.`;
  const share = i.chars ? blockShareWords(i.chars, i.total ?? 0) : null;
  const size = i.chars ? `, ${count(i.chars)} characters` : "";
  return `${count(n)} ${n === 1 ? "service" : "services"}${size}${share ? ` — ${share}` : ""}.`;
}

/**
 * The name of the Undo left where a service was taken out of the sheet, as a screen reader hears it: what it puts back,
 * "Undo removing Balayage". Each was named only "Undo", and two waiting side by side could not be told apart.
 */
export function serviceUndoName(name: string | null | undefined): string {
  const n = typeof name === "string" ? name.trim() : "";
  return n ? `Undo removing ${n}` : "Undo removing a service";
}

/**
 * What the services sheet's search has left in sight, said politely to a screen reader as it narrows: "11 of 33
 * services". A search that leaves none says so as the sheet's own note does ("No service is called that."), and a list
 * with no rows says it has none. With no search the page says nothing: every row is in sight, which the list shows.
 */
export function servicesFoundWords(shown: number, total: number): string {
  if (!total) return "No services yet.";
  if (!shown) return "No service is called that.";
  return `${count(shown)} of ${count(total)} ${total === 1 ? "service" : "services"}`;
}
