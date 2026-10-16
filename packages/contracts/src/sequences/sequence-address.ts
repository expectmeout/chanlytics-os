/**
 * Where the Sequences page opens (decision 0060): Campaigns › Sequences, `campaigns/sequences`, the list; a sequence's
 * record at `campaigns/sequences/<id>`, its People and History tabs one word further, a day of its History open one word
 * further still (`/history/<batch>`), and a new one at `campaigns/sequences/new`. One parser and one writer, so a link and the page read an
 * address the same way.
 */

/** The list's address. */
export const SEQUENCES_ROUTE = "campaigns/sequences";

/** A record's tabs, in their order (D5: the same three for every sequence). */
const SEQUENCE_TABS = ["steps", "people", "history"] as const;
export type SequenceTab = (typeof SEQUENCE_TABS)[number];

/** What an address of the page opens: the list, a record on one of its tabs, or a new sequence. */
export type SequencesPlace =
  { view: "list" } | { view: "new" } | { view: "record"; id: string; tab: SequenceTab; day?: string };

/** Whether a param of `campaigns` is the Sequences view's (its second word, `sequences`). */
export const isSequencesParam = (param: string | null): boolean => param === "sequences";

const isTab = (word: string | undefined): word is SequenceTab => SEQUENCE_TABS.some((t) => t === word);

/**
 * What a route of the page opens (`campaigns/sequences`, `/<id>`, `/<id>/people`, `/new`); null for a route that is not
 * the page's. A tab it does not know is the record's first.
 */
export function parseSequencesRoute(route: string): SequencesPlace | null {
  const [path = ""] = route.split("?");
  const [root, view, id, tab, day] = path.split("/");
  if (root !== "campaigns" || view !== "sequences") return null;
  if (!id) return { view: "list" };
  if (id === "new") return { view: "new" };
  const on = isTab(tab) ? tab : "steps";
  return { view: "record", id, tab: on, ...(on === "history" && day ? { day } : {}) };
}

/**
 * A sequence's address, on a tab; the first tab is the record's own address. A day of its History, open, is one word
 * further (`/history/<batch>`): a word of the path, which the page reads as it reads the tab.
 */
export const sequenceRoute = (id: string, tab: SequenceTab = "steps", day?: string | null): string =>
  tab === "steps"
    ? `${SEQUENCES_ROUTE}/${id}`
    : `${SEQUENCES_ROUTE}/${id}/${tab}${tab === "history" && day ? `/${day}` : ""}`;

/**
 * A run's sheet in Sent, where a link lands on it whether or not Sequences is drawn (the run's address with `/sheet`, a
 * word the sheet's page reads past): History's Open the run, and People's door to a batch it holds no draft of.
 */
export const runSheetRoute = (id: string): string => `broadcasts/run:${id}/sheet`;

/**
 * Where an older address of Campaigns lands where Sequences is drawn (the plan's S5, D1): Campaigns' home, or one of its
 * groups, on the list; a campaign open (`campaigns/moment:<id>`, its People at `:people`) on its sequence. The server reads
 * a sequence by the id of any of its parts (a step's, a batch's), and the record then names its own. Null where the address
 * stays: the composer, a message, Ads, and Sent itself. A run's address a link names (a bell row, Today, Ask's card:
 * `broadcasts/run:<id>`) lands on its sequence's History with that day open (the parity review's W4), where People and
 * History decide what it holds in place; its sheet stays at runSheetRoute's address, which no landing takes.
 */
export function sequenceLandingOf(route: string): string | null {
  const [path = ""] = route.split("?");
  const [root, param = "", rest] = path.split("/");
  if (root === "campaigns") {
    if (param === "" || param.startsWith("in:")) return SEQUENCES_ROUTE;
    const moment = /^moment:([^:/]+)(:people)?$/.exec(param);
    if (moment?.[1]) return sequenceRoute(moment[1], moment[2] ? "people" : "steps");
  }
  const run = root === "broadcasts" && rest === undefined ? /^run:([^:/]+)$/.exec(param) : null;
  if (run?.[1]) return sequenceRoute(run[1], "history", run[1]);
  return null;
}
