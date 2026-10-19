/**
 * Where the Sequences page opens (decision 0060): Campaigns › Sequences, `campaigns/sequences`, the list; a sequence's
 * record at `campaigns/sequences/<id>`, its People and History tabs one word further, a day of its History open one word
 * further still (`/history/<batch>`), and a new one at `campaigns/sequences/new`. One parser and one writer, so a link and the page read an
 * address the same way.
 *
 * A new sequence to leads is made by name where its leads are chosen (the lead-to-sequence canvas's one road: the lead
 * sheet's picker and New, or the bar's for many) and written on its own record, a draft. Any of the page's addresses may end
 * in the way back to the Leads address it was opened from (`/back:<the Leads address's words>`), which its head says.
 */

/** The list's address. */
export const SEQUENCES_ROUTE = "campaigns/sequences";

/** A record's tabs, in their order (D5: the same three for every sequence). */
const SEQUENCE_TABS = ["steps", "people", "history"] as const;
export type SequenceTab = (typeof SEQUENCE_TABS)[number];

/**
 * What an address of the page opens: the list, a record on one of its tabs, or a new sequence (on the moment a door asks
 * for, `new:moment:<trigger>`: Setup's first reminder, Ask's moment card); and the way back.
 */
export type SequencesPlace = (
  { view: "list" } | { view: "new"; moment?: string } | { view: "record"; id: string; tab: SequenceTab; day?: string }
) & {
  /** The Leads address it was opened from, where Back, Start and Cancel return; absent where none was named. */
  back?: string;
};

/** The Leads page's own route, which a way back names the words after (contracts leadsRoute). */
const LEADS_ROUTE = "clients/leads";
const BACK = "back:";

/** Whether a param of `campaigns` is the Sequences view's (its second word, `sequences`). */
export const isSequencesParam = (param: string | null): boolean => param === "sequences";

const isTab = (word: string | undefined): word is SequenceTab => SEQUENCE_TABS.some((t) => t === word);

/**
 * What a route of the page opens (`campaigns/sequences`, `/<id>`, `/<id>/people`, `/new`); null for a route that is not
 * the page's. A tab it does not know is the record's first.
 */
export function parseSequencesRoute(route: string): SequencesPlace | null {
  const [path = ""] = route.split("?");
  const words = path.split("/");
  const backAt = words.findIndex((w) => w.startsWith(BACK));
  const backWords = backAt >= 0 ? (words[backAt] ?? "").slice(BACK.length) : null;
  const back = backWords === null ? {} : { back: backWords ? `${LEADS_ROUTE}:${backWords}` : LEADS_ROUTE };
  const [root, view, id, tab, day] = backAt >= 0 ? words.slice(0, backAt) : words;
  if (root !== "campaigns" || view !== "sequences") return null;
  if (!id) return { view: "list", ...back };
  if (id === "new" || id.startsWith("new:")) {
    // A moment rides in the word itself (`new:moment:<trigger>`).
    const [, kind, moment] = id.split(":");
    return { view: "new", ...(kind === "moment" && moment ? { moment } : {}), ...back };
  }
  const on = isTab(tab) ? tab : "steps";
  return { view: "record", id, tab: on, ...(on === "history" && day ? { day } : {}), ...back };
}

/**
 * An address of the page with the way back to the Leads address it was opened from: Back, Start and Cancel return there.
 * A way back that is not a Leads address is not kept.
 */
export function sequenceRouteBack(route: string, back: string | null): string {
  if (!back || (back !== LEADS_ROUTE && !back.startsWith(`${LEADS_ROUTE}:`))) return route;
  return `${route}/${BACK}${back.slice(LEADS_ROUTE.length + 1)}`;
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
 * New sequence's address, on a moment a door asks for: what starts it chosen, the owner's line for that moment written in
 * (sequence-draft.ts newSequenceLine), and the sequence that already starts on it said with its door.
 */
export const newSequenceRoute = (moment?: string | null): string =>
  moment ? `${SEQUENCES_ROUTE}/new:moment:${moment}` : `${SEQUENCES_ROUTE}/new`;

/**
 * A run's sheet in Sent, where a link lands on it whether or not Sequences is drawn (the run's address with `/sheet`, a
 * word the sheet's page reads past): History's Open the run, and People's door to a batch it holds no draft of.
 */
export const runSheetRoute = (id: string): string => `broadcasts/run:${id}/sheet`;

/**
 * Where an older address of Campaigns lands (the plan's S5 and S6, D1 and D3): Campaigns' home, or one of its groups, and
 * Sent's list (`broadcasts`) on the list; a campaign open (`campaigns/moment:<id>`, its People at `:people`) on its sequence.
 * The server reads a sequence by the id of any of its parts (a step's, a batch's), and the record then names its own. The
 * composer's retired modes land too: Every time on New, a moment's Turn on on New on that moment. Null where the address
 * stays: the composer (Send once, Write to leads, a reach-out's change, `new:edit:<root>`, whose sheet sends an id that is
 * no reach-out's to its sequence once the chains are read), a message, Ads, and Sent's sheets (Get their yes, To send, an
 * audience). A run's address is landed by what the run is, which no address says (runLandingOf).
 */
export function sequenceLandingOf(route: string): string | null {
  const [path = ""] = route.split("?");
  const [root, param = ""] = path.split("/");
  if (root === "campaigns") {
    if (param === "" || param.startsWith("in:")) return SEQUENCES_ROUTE;
    const moment = /^moment:([^:/]+)(:people)?$/.exec(param);
    if (moment?.[1]) return sequenceRoute(moment[1], moment[2] ? "people" : "steps");
    // The composer's Every time and its moment mode went (the closed-loop audit of 17 Oct 2026, G): a moment's sequence is
    // made in New.
    if (param === "new:every") return newSequenceRoute();
    const on = /^new:moment:([^:/]+)$/.exec(param);
    if (on?.[1]) return newSequenceRoute(on[1]);
  }
  if (root === "broadcasts" && param === "") return SEQUENCES_ROUTE;
  return null;
}

/**
 * A sequence's replies in the Inbox (the canvas's History board: Replied is a door to the Inbox): `inbox/from:<id>` over
 * History's own period (`from:<id>:90`, `from:<id>:all`; none says 30 days), a word of the Inbox's path, as a thread's
 * `th-<id>` is. The Inbox lists the threads that answered the sequence in that period and nothing else, until it is left.
 */
export const sequenceRepliesRoute = (id: string, period: "30" | "90" | "all" = "30"): string =>
  `inbox/from:${id}${period === "30" ? "" : `:${period}`}`;

/** What an Inbox param of a sequence's replies names (`from:<id>[:<period>]`); null for any other param. */
export function sequenceRepliesOf(param: string | null): { id: string; period: "30" | "90" | "all" } | null {
  const m = param ? /^from:([0-9a-f-]{36})(?::(30|90|all))?$/i.exec(param) : null;
  return m?.[1] ? { id: m[1].toLowerCase(), period: m[2] === "90" || m[2] === "all" ? m[2] : "30" } : null;
}
