/**
 * The order the product lists templates in, starters first in the library's order, and what it picks by that
 * order: the template a composer opens on, a picker's rows grouped by name, and the template a call texts to book.
 */
import { slotToWrite } from "./inbox-templates";
import { languageLabels } from "./message-languages";
import { starterByKey, starterForTrigger } from "./starter-lookup";
import { STARTER_TEMPLATES } from "./starter-templates";
import { defaultSlotKinds } from "./template-slots";
import { templateTitle } from "./template-titles";

/* ---- Where a template sits, what a composer opens on, what a slot is called ---- */

/** A starter's place in the library's order; everything else after. */
export function starterIndex(name: string | null | undefined): number {
  const i = STARTER_TEMPLATES.findIndex((s) => s.name === name);
  return i === -1 ? STARTER_TEMPLATES.length : i;
}

/**
 * Starters in the library's order, then templates written here, then the
 * rest — marketing before utility, then by name. What a composer most
 * often needs is nearest.
 */
export function compareTemplates(
  a: { name: string; category?: string | null; source?: string | null; language?: string | null },
  b: { name: string; category?: string | null; source?: string | null; language?: string | null },
): number {
  const ai = starterIndex(a.name);
  const bi = starterIndex(b.name);
  if (ai !== bi) return ai - bi;
  const rank = (t: { category?: string | null; source?: string | null }) =>
    (t.source === "chanlytics" ? 0 : 2) + (t.category === "utility" ? 1 : 0);
  // Language last, so the order is TOTAL. Templates are one row per (name,
  // language): without this the rows of one name came back in whatever order
  // the query gave them, which is also the order `defaultTemplate` picked from.
  return (
    rank(a) - rank(b) ||
    a.name.localeCompare(b.name) ||
    String(a.language ?? "").localeCompare(String(b.language ?? ""))
  );
}

/**
 * The template a composer opens on: the trigger's starter, the quick note for a
 * broadcast, else the first.
 *
 * It used to `find` on the list AS GIVEN, so a workspace holding a starter in
 * two languages opened on whichever row the query happened to return first --
 * a different language on a different load, from a picker that drew the two
 * rows identically. The sort decides it now, and it is a total order.
 */
export function defaultTemplate<
  T extends { name: string; category?: string | null; source?: string | null; language?: string | null },
>(list: readonly T[], trigger: string | null): T | null {
  const s = trigger ? starterForTrigger(trigger) : starterByKey("quick_note");
  const sorted = list.slice().sort(compareTemplates);
  return (s ? sorted.find((t) => t.name === s.name) : undefined) ?? sorted[0] ?? null;
}

/** One entry per template NAME, in the library's order, with its rows by language. */
export interface TemplateGroup<T> {
  name: string;
  /** The words for the name: the workspace's own title, else the starter's, else the name made words. */
  title: string;
  /** Every row of this name, language order, and the words for each language. */
  rows: T[];
  labels: Record<string, string>;
}

/**
 * The rows of a picker grouped by the template they are.
 *
 * A composer showed one chip per ROW and titled it with `templateTitle(name)`,
 * which takes no language -- so the starter set installed in English and Spanish,
 * which Messages advertises as the default, drew seven PAIRS of identical chips
 * sitting next to each other. The Inbox composer had already solved this
 * (`inboxTemplates` labels each "<title> · <language>"); the two Campaigns
 * composers had not.
 */
export function groupTemplates<
  T extends { name: string; language: string; title?: string | null; category?: string | null; source?: string | null },
>(list: readonly T[]): TemplateGroup<T>[] {
  const out: TemplateGroup<T>[] = [];
  const at = new Map<string, TemplateGroup<T>>();
  for (const t of list.slice().sort(compareTemplates)) {
    let g = at.get(t.name);
    if (!g) {
      g = { name: t.name, title: templateTitle(t.name, t.title), rows: [], labels: {} };
      at.set(t.name, g);
      out.push(g);
    }
    g.rows.push(t);
  }
  for (const g of out) g.labels = languageLabels(g.rows.map((r) => r.language));
  return out;
}

/** Each slot's words for a person: a starter's own labels, else the labels the row carries, else "Value n". */
/**
 * The template this workspace may text somebody who asked to book.
 *
 * Three things at once, and none of them a name: APPROVED, because a row
 * asserting an approval Meta never gave is the defect this replaces; fillable
 * from the workspace's own facts, because the server fills the slots and never
 * asks a caller for words; and carrying the booking link, which is what makes
 * it the booking template rather than any other. A workspace with none has
 * none, and is owed that answer rather than a send that fails at Meta.
 */
export function bookingTemplate<
  T extends { name: string; language: string; meta_status?: string | null; variables: unknown },
>(templates: readonly T[]): T | null {
  const usable = templates.filter(
    (t) => t.meta_status === "approved" && !slotToWrite(t) && defaultSlotKinds(t).includes("booking_link"),
  );
  // The starter first when the workspace has it, so a business that took the
  // one we wrote gets the words we wrote; otherwise their own, in the order
  // the rest of the product lists templates.
  return usable.find((t) => t.name === "booking_link") ?? usable.slice().sort(compareTemplates)[0] ?? null;
}
