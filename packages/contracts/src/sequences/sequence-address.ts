/**
 * Where the Sequences page opens (decision 0060): Campaigns › Sequences, `campaigns/sequences`, the list; a sequence's
 * record at `campaigns/sequences/<id>`, its People and History tabs one word further, one of its runs two words further
 * (`/runs/<run>`: the run's one screen, the Campaigns wiring review's lane 2), and a new one at `campaigns/sequences/new`.
 * One parser and one writer, so a link and the page read an address the same way.
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
 * Who a new sequence is for, where the door that opened New said (the Campaigns wiring review's rule F, lane 6, 19 Oct
 * 2026: one New, which asks who and when): `once`, a message sent once, now or on a day, to a list or the people who said
 * yes (Send once is New with "now"), on the audience the door named; `leads`, the leads a search found. Unsaid, New asks.
 */
export type NewWho = "once" | "leads";

/**
 * What an address of the page opens: the list, a record on one of its tabs, one of its runs (`run`: the run's screen, open
 * over the record's History, where its days are), or New (on the moment a door asks for, `new:moment:<trigger>`: Setup's
 * first reminder, Ask's moment card; or for whom a door asks, `new:once[:to:<audience>]`, `new:leads`); and the way back.
 */
export type SequencesPlace = (
  | { view: "list" }
  | { view: "new"; moment?: string; who?: NewWho; to?: string }
  | { view: "record"; id: string; tab: SequenceTab; run?: string }
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
 * What a route of the page opens (`campaigns/sequences`, `/<id>`, `/<id>/people`, `/<id>/runs/<run>`, `/new`); null for a
 * route that is not the page's. A tab it does not know is the record's first. A day of History an older address names
 * (`/history/<batch>`, which the table of retired addresses moves on) is that run.
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
  if (id === "new" || id.startsWith("new:")) return { ...newPlaceOf(id), ...back };
  if ((tab === "runs" || tab === "history") && day) return { view: "record", id, tab: "history", run: day, ...back };
  return { view: "record", id, tab: isTab(tab) ? tab : "steps", ...back };
}

/**
 * New, by the word its address holds: a moment rides in it (`new:moment:<trigger>`), and so does who it is for
 * (`new:once`, `new:once:to:<audience>`, an audience's id holding colons of its own, `seg:<list>`; `new:leads`).
 */
function newPlaceOf(word: string): Extract<SequencesPlace, { view: "new" }> {
  const [, kind, ...rest] = word.split(":");
  if (kind === "moment" && rest[0]) return { view: "new", moment: rest[0] };
  if (kind === "leads") return { view: "new", who: "leads" };
  if (kind !== "once") return { view: "new" };
  const to = rest[0] === "to" ? rest.slice(1).join(":") : "";
  return to ? { view: "new", who: "once", to } : { view: "new", who: "once" };
}

/**
 * An address of the page with the way back to the Leads address it was opened from: Back, Start and Cancel return there.
 * A way back that is not a Leads address is not kept.
 */
export function sequenceRouteBack(route: string, back: string | null): string {
  if (!back || (back !== LEADS_ROUTE && !back.startsWith(`${LEADS_ROUTE}:`))) return route;
  return `${route}/${BACK}${back.slice(LEADS_ROUTE.length + 1)}`;
}

/** A sequence's address, on a tab; the first tab is the record's own address. */
export const sequenceRoute = (id: string, tab: SequenceTab = "steps"): string =>
  tab === "steps" ? `${SEQUENCES_ROUTE}/${id}` : `${SEQUENCES_ROUTE}/${id}/${tab}`;

/**
 * New sequence's address, on a moment a door asks for: what starts it chosen, the owner's line for that moment written in
 * (sequence-draft.ts newSequenceLine), and the sequence that already starts on it said with its door.
 */
export const newSequenceRoute = (moment?: string | null): string =>
  moment ? `${SEQUENCES_ROUTE}/new:moment:${moment}` : `${SEQUENCES_ROUTE}/new`;

/**
 * A run's home (the Campaigns wiring review's lane 2, 19 Oct 2026): its one screen, under its sequence,
 * `campaigns/sequences/<sequence>/runs/<run>`, which follows what the run is -- decided there while it waits for an OK,
 * stopped there while it goes, its report once it went. A one-off send is a sequence of one step, so its run is the same.
 * A writer that does not know the sequence names the run in its place: the server reads a sequence by the id of any of
 * its parts, and the page then writes its own. The one writer: every link to a run calls this (a bell row, Today, the
 * Inbox, Ask, a report, the Calendar, History's days).
 */
export const runRoute = (id: string, sequenceId?: string | null): string =>
  `${SEQUENCES_ROUTE}/${sequenceId || id}/runs/${id}`;

/**
 * Send once's address: New, for a message sent once (the Campaigns wiring review's rule F, lane 6), on the audience it is
 * for (`campaigns/sequences/new:once:to:<audience>`, a list's or an audience's id, the way People and a list ask to message
 * these people) or on none. It was the composer's sheet over Sequences (`campaigns/new`, `new:to:<audience>`), whose
 * addresses land here (shell/address.ts). The one writer.
 */
export const sendOnceRoute = (audience?: string | null): string =>
  audience ? `${SEQUENCES_ROUTE}/new:once:to:${audience}` : `${SEQUENCES_ROUTE}/new:once`;

/** New for leads: a sequence written to the leads a search found (the composer's Write to leads, `campaigns/new:leads`). */
export const newForLeadsRoute = (): string => `${SEQUENCES_ROUTE}/new:leads`;

/**
 * A message's home: the Library, Campaigns' Messages view, open on it by its name (`campaigns/messages/<name>`, the
 * Campaigns wiring review's rule A for a message, as a run's is under its sequence). A template's notice, an Activity line
 * about it, the call's text, a step's message: the one writer. A press on one anywhere but the Library opens it over the
 * page it was pressed on (shell/see-over.ts); its drawer over Sequences (`campaigns/message:<name>`) went, and lands here.
 */
export const messageRoute = (name: string): string => `campaigns/messages/${encodeURIComponent(name)}`;

/** The message a route opens in the Library (`campaigns/messages/<name>`, messageRoute's), or null for any other route. */
export function messageOfRoute(route: string): string | null {
  const [path = ""] = route.split("?");
  const m = /^campaigns\/messages\/([^/#]+)$/.exec(path);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/**
 * A sequence's replies in the Inbox (the canvas's History board: Replied is a door to the Inbox): `inbox/from:<id>` over
 * History's own period (`from:<id>:90`, `from:<id>:all`; none says 30 days), a word of the Inbox's path, as a thread's
 * `th-<id>` is. The Inbox lists the threads that answered the sequence in that period and nothing else, until it is left.
 */
export const sequenceRepliesRoute = (id: string, period: "30" | "90" | "all" = "30"): string =>
  `inbox/from:${id}${period === "30" ? "" : `:${period}`}`;

/**
 * The emails handed to their owner to send from their own inbox (00429), every reach-out's: a sheet over the page its door
 * was pressed on (shell/see-over.ts, `?see=to-send`; Ruben, 20 Oct 2026), its row in Needs you (the Campaigns wiring
 * review's rule D and his call 3). This address opens it over the Inbox. It had a page of its own in Sent's mount,
 * `broadcasts/to-send`, which lands here (shell/address.ts). A word of the Inbox's path, as `from:<id>` is.
 */
export const TO_SEND_PARAM = "to-send";
export const TO_SEND_ROUTE = `inbox/${TO_SEND_PARAM}`;

/** Whether an Inbox param is To send's: Needs you, with its To send open. */
export const isToSendParam = (param: string | null | undefined): boolean => param === TO_SEND_PARAM;

/** What an Inbox param of a sequence's replies names (`from:<id>[:<period>]`); null for any other param. */
export function sequenceRepliesOf(param: string | null): { id: string; period: "30" | "90" | "all" } | null {
  const m = param ? /^from:([0-9a-f-]{36})(?::(30|90|all))?$/i.exec(param) : null;
  return m?.[1] ? { id: m[1].toLowerCase(), period: m[2] === "90" || m[2] === "all" ? m[2] : "30" } : null;
}
