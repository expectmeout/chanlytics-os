/**
 * Where the Sequences page opens (decision 0060): Campaigns › Sequences, `campaigns/sequences`, the list; a sequence's
 * record at `campaigns/sequences/<id>`, its People and History tabs one word further, and a new one at
 * `campaigns/sequences/new`. One parser and one writer, so a link and the page read an address the same way.
 */

/** The list's address. */
export const SEQUENCES_ROUTE = "campaigns/sequences";

/** A record's tabs, in their order (D5: the same three for every sequence). */
const SEQUENCE_TABS = ["steps", "people", "history"] as const;
export type SequenceTab = (typeof SEQUENCE_TABS)[number];

/** What an address of the page opens: the list, a record on one of its tabs, or a new sequence. */
export type SequencesPlace = { view: "list" } | { view: "new" } | { view: "record"; id: string; tab: SequenceTab };

/** Whether a param of `campaigns` is the Sequences view's (its second word, `sequences`). */
export const isSequencesParam = (param: string | null): boolean => param === "sequences";

const isTab = (word: string | undefined): word is SequenceTab => SEQUENCE_TABS.some((t) => t === word);

/**
 * What a route of the page opens (`campaigns/sequences`, `/<id>`, `/<id>/people`, `/new`); null for a route that is not
 * the page's. A tab it does not know is the record's first.
 */
export function parseSequencesRoute(route: string): SequencesPlace | null {
  const [path = ""] = route.split("?");
  const [root, view, id, tab] = path.split("/");
  if (root !== "campaigns" || view !== "sequences") return null;
  if (!id) return { view: "list" };
  if (id === "new") return { view: "new" };
  return { view: "record", id, tab: isTab(tab) ? tab : "steps" };
}

/** A sequence's address, on a tab; the first tab is the record's own address. */
export const sequenceRoute = (id: string, tab: SequenceTab = "steps"): string =>
  tab === "steps" ? `${SEQUENCES_ROUTE}/${id}` : `${SEQUENCES_ROUTE}/${id}/${tab}`;

/**
 * Where an older address of Campaigns lands where Sequences is drawn (the plan's S5, D1): Campaigns' home, or one of its
 * groups, on the list; a campaign open (`campaigns/moment:<id>`, its People at `:people`) on its sequence. The server reads
 * a sequence by the id of any of its parts (a step's, a batch's), and the record then names its own. Null where the address
 * stays: the composer, a message, Ads, and Sent with its runs, whose sheet still decides a held email and takes the
 * owner's word on one they send (the People tab's doors go there) until History and People do it in place (S6).
 */
export function sequenceLandingOf(route: string): string | null {
  const [path = ""] = route.split("?");
  const [root, param = ""] = path.split("/");
  if (root === "campaigns") {
    if (param === "" || param.startsWith("in:")) return SEQUENCES_ROUTE;
    const moment = /^moment:([^:/]+)(:people)?$/.exec(param);
    if (moment?.[1]) return sequenceRoute(moment[1], moment[2] ? "people" : "steps");
  }
  return null;
}
