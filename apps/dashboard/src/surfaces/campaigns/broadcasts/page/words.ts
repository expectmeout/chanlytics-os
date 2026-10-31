/**
 * The words the send screen and the ledger take from the template library (moved from legacy/pages/broadcasts.jsx,
 * decision 0015): a row's key, its title and language in a person's words, the library's order and default, and what
 * each slot of a template may take on a broadcast.
 */
import type { AskedPurpose, ParamSourceKind } from "@chanlytics/contracts";
import type { BroadcastTemplate } from "../surface";
import { starters } from "../../templates/verbs";

/** What names an audience: its kind and its id, `kind:id` (the empty audience the "send again" fallback holds has neither). */
interface Keyed {
  kind?: string;
  id?: string | null;
}

export const bcKey = (a: Keyed) => `${String(a.kind)}:${a.id || ""}`;
export const bcIsStarter = (name: string) => !!starters.byName(name);
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
// time and service are nobody's here, nor a proposal's link (0006), nor a freed time (0081): null when a slot can take nothing. The booking link
// is offered where one is on file and the review link where the Google listing keeps one (the surface's `bookingLink`
// and `reviewLink`); without it, its slot can only be typed.
export const BC_TEXT: ParamSourceKind[] = ["text"];
export const bcSlots = (t: BroadcastTemplate, links: { bookingLink: boolean; reviewLink: boolean }) =>
  starters.slots(t, {
    visits: false,
    bookingLink: links.bookingLink,
    reviewLink: links.reviewLink,
    proposal: false,
    freed: false,
  });

/**
 * What the send screen's foot says it is waiting for (reach.ts bcStopOf), as the playbook composer's foot says its own: one
 * short sentence for the first thing missing, since on a phone the foot is docked away from the columns that explain it. The
 * number's and the day's limit's own sentences are the number's (contracts numberHealth, overLimitRefusal).
 */
export const BC_SAYS = {
  pickMessage: "Pick the message to send.",
  pickList: "Pick who it goes to.",
  fill: (label: string): string => `Fill in “${label}” to send it.`,
  nobody: (list: string, purpose: AskedPurpose): string =>
    `Nobody on “${list}” can be sent ${purpose === "marketing" ? "an offer" : "a message"} yet.`,
  /** A send by WhatsApp has no number to go from: said here, and by the When column's number line. */
  noNumber: "No WhatsApp number connected — connect one in Settings › Connections.",
} as const;
