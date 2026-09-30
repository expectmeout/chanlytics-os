/**
 * The words the send screen and the ledger take from the template library (moved from legacy/pages/broadcasts.jsx,
 * decision 0015): a row's key, its title and language in a person's words, the library's order and default, and what
 * each slot of a template may take on a broadcast.
 */
import type { ParamSourceKind } from "@chanlytics/contracts";
import type { BroadcastTemplate } from "../surface";
import { starters } from "../../templates/verbs";

/** What names an audience: its kind and its id, `kind:id` (the empty audience the "send again" fallback holds has neither). */
interface Keyed {
  kind?: string;
  id?: string | null;
}

export const bcKey = (a: Keyed) => `${String(a.kind)}:${a.id || ""}`;
// Words for people: a starter's title, or the name with its underscores made spaces.
export const bcTitle = (name: string | null | undefined) => starters.title(name);
export const bcIsStarter = (name: string) => !!starters.byName(name);
// The language a row goes out in, as a person reads it. A workspace holding the
// starter set in both languages has two rows per name, and the chips said the
// same words over each -- so the question asked before a send names the one it
// means. Empty when there is no row: a guess is worse than nothing here.
export const bcLangWords = (t: { language: string } | null | undefined) =>
  t ? ` (${starters.langWords(t.language)})` : "";
// The library's order: starters first, then templates written here, then the rest.
export const bcOrder = (a: BroadcastTemplate, b: BroadcastTemplate) => starters.compare(a, b);
// What a broadcast opens on: the quick note when the workspace holds it, else the first.
export const bcDefault = (list: readonly BroadcastTemplate[]) => starters.defaultFor(list, null) || null;
// The line under the words: the one Meta holds for this row, else the starter's
// own (contracts templateFooter). It resolved ONLY through the starter library
// before, so a template a workspace wrote here showed its footer while it was
// being drafted and never again -- on this page, on Playbooks, and on Messages.
export const bcFooter = (t: BroadcastTemplate | null | undefined) => (t ? starters.footer(t) : null);
// What each slot of a template may take on a broadcast, its default first (contracts templateSlots): a starter's
// first name is each person's own, its business name and booking link may be typed over, and a slot on a template
// written elsewhere may take anything, its guess first. Every slot took any source, so a first name could be set to
// the booking link and a broadcast greeted everyone "Hi your booking link". A broadcast has no visit, so a visit's
// time and service are nobody's here, nor a proposal's link (0006): null when a slot can take nothing.
export const BC_TEXT: ParamSourceKind[] = ["text"];
export const bcSlots = (t: BroadcastTemplate, bookingLink: boolean) =>
  starters.slots(t, { visits: false, bookingLink, proposal: false });
