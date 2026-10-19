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
 * A link to a run (a bell row, Today, the Inbox, Ask, a report, the Calendar): `broadcasts/run:<id>`, which lands by what
 * the run is once it is read (runLandingOf): on its sheet while it waits for a decision, on its day of its sequence's
 * History once it went. The one writer of it (the Campaigns wiring review's lane 1, 19 Oct 2026): every place that links
 * to a run calls this, so the run's own address, when it has one, is changed here alone.
 */
export const runRoute = (id: string): string => `broadcasts/run:${id}`;

/**
 * A run's sheet in Sent, where a link lands on it whether or not Sequences is drawn (the run's address with `/sheet`, a
 * word the sheet's page reads past): History's Open the run, and People's door to a batch it holds no draft of.
 */
export const runSheetRoute = (id: string): string => `${runRoute(id)}/sheet`;

/**
 * Send once's address: the composer over Sequences, on the audience it is for (`campaigns/new:to:<audience>`, a list's or
 * an audience's id, the way People and a list ask to message these people) or on none (`campaigns/new`). The one writer.
 */
export const sendOnceRoute = (audience?: string | null): string =>
  audience ? `campaigns/new:to:${audience}` : "campaigns/new";

/**
 * A message of the Library, open in its own drawer over Sequences by its name (`campaigns/message:<name>`): a template's
 * notice, an Activity line about it, the call's text. The one writer.
 */
export const messageRoute = (name: string): string => `campaigns/message:${name}`;

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
