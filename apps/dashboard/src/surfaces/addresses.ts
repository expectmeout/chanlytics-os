/**
 * Every address a page opens, in one table (decision 0047; wiring/records-not-pages, task 4.1; findings A1 and A2g). A link
 * is written by many places (a bell row, an Activity line, an Ask citation, a timeline row, a Today row, a People cell, a
 * mail) and read by one: the page the address names, by a parse of its own. Contracts' `addressOf` is the one writer of a
 * record's address (activity/record-address.ts); this is the other half, each page's own parse of the param after its word,
 * said once and in one place, so that what a writer produces and what its page opens can be held to each other
 * (tests/links/every-record-has-one-address.test.mjs, every-writer-writes-an-address-its-page-opens.test.mjs).
 *
 * A row is a page by its route word (the keys of SURFACE_ROUTES, which the registry test holds to: every page the frame draws
 * opens its own route here) and the page's own parse, answering what the param opens -- a record by its kind and id (`{ ref }`,
 * the very ref `addressOf` writes it from), a view of the page with no record behind it (`{ view }`: the Calendar's day, a
 * Reports lens, Campaigns' composer), or null for a param the page does not open. Each parse calls the one the page itself
 * reads its address with (the Inbox's thread, Conversations' row, the Calendar's day and visit, People's person, list, lead
 * and deal, Campaigns' moment, Sent's run, Reports' lens, Settings' pane); none is written here a second time.
 *
 * The same table serves a page that is handed an address for a record it may not hold: it says which record an address names
 * (use-named-record.ts), so a deep link is a read of that one record by its id (finding A2c), never a look in the window the
 * page holds.
 */
import {
  calendarParamParts,
  canonicalRoute,
  firstRunStepOf,
  FIRST_RUN_FIND_ROUTE,
  FIRST_RUN_ROUTE,
  newConversationOf,
  parseLeadsRoute,
  parseListToken,
  parsePeopleRoute,
  parsePipelineRoute,
  parseSequencesRoute,
  personRouteOf,
  personTabRoute,
  pipelinePersonOf,
  reportsParamParts,
  type RecordRef,
} from "@chanlytics/contracts";
import { parseHome } from "./campaigns/home/address";
import { broadcastsProps } from "./campaigns/routes";
import { conversationsRow, inboxThread } from "./inbox/address";
import { cvRoute } from "./inbox/cv-rules";
import { isPersonParam } from "./people/chrome";
import { SET_TABS } from "./settings/frame/tabs";

/** What an address opens: a record, by the ref `addressOf` writes it from; or a view of a page that has no record behind it. */
type Opened = { ref: RecordRef } | { view: string };

/** A page's own parse of the param after its word (`""` for the route alone): what it opens, or null for a param it does not open. */
type Parse = (param: string) => Opened | null;

/** An id as an address writes it: a row's uuid, or a seeded one (`priya`, `th-1`); no separator, which divides the id from a view. */
const RECORD_ID = /^[A-Za-z0-9_-]+$/;

/** A parse that takes the route's whole param as one word: an address with a slash in it (`inbox/th-1/x`) is nobody's. */
const flat =
  (parse: Parse): Parse =>
  (param) =>
    param.includes("/") ? null : parse(param);

/** The kinds that are the whole of a Settings pane: the pane's id is the word after `admin/`. */
const PANE_RECORDS: ReadonlyMap<string, RecordRef> = new Map<string, RecordRef>([
  ["workspace", { kind: "facts" }],
  ["autonomy", { kind: "rules" }],
  ["integrations", { kind: "channel" }],
  ["team", { kind: "team" }],
  ["billing", { kind: "billing" }],
]);

/** A page that is only itself: the route alone opens it, and no param does. */
const alone =
  (view: string): Parse =>
  (param) =>
    param === "" ? { view } : null;

/** What the Inbox's param opens: a thread by its conversation's id, or the door of a new conversation. */
function opensInbox(param: string): Opened | null {
  if (param === "") return { view: "inbox" };
  if (newConversationOf(param)) return { view: "inbox/new" };
  const id = inboxThread(param);
  return id !== null && RECORD_ID.test(id) ? { ref: { kind: "conversation", id } } : null;
}

/** What Conversations' param opens: a chat or a call by its id, or a tab of the list. */
function opensConversations(param: string): Opened | null {
  if (param === "") return { view: "conversations" };
  const { chat, call } = conversationsRow(param);
  if (call !== null && RECORD_ID.test(call)) return { ref: { kind: "call", id: call } };
  if (chat !== null && RECORD_ID.test(chat)) return { ref: { kind: "conversation", id: chat, in: "conversations" } };
  const tab = cvRoute(param);
  return tab.id === null && (tab.channel !== "all" || param === "all")
    ? { view: `conversations/${tab.channel}` }
    : null;
}

/** What Live's param opens: the call it names, opened on the page. */
function opensLive(param: string): Opened | null {
  if (param === "") return { view: "live" };
  return RECORD_ID.test(param) ? { ref: { kind: "call", id: param, on: "live" } } : null;
}

/**
 * What the Calendar's param opens: a visit (on its day, where the address says it, over the view it names), a view of the
 * board (`calendar/month`, or a view on a day: `calendar/week:2026-10-12`), or a day, which is Day's.
 */
function opensCalendar(param: string): Opened | null {
  if (param === "") return { view: "calendar" };
  const at = calendarParamParts(param);
  if (at.visitId) return { ref: { kind: "visit", id: at.visitId, ...(at.day ? { day: at.day } : {}) } };
  if (at.view) return { view: `calendar/${at.view}` };
  return at.day ? { view: "calendar/day" } : null;
}

/**
 * What Campaigns' param opens: its Sequences view (0060: the list, a sequence on one of its tabs, a new one), else a moment (a
 * campaign or a reach-out) in its drawer, a message by its name, the composer or a group.
 */
function opensCampaigns(param: string): Opened | null {
  if (param === "") return { view: "campaigns" };
  const sequences = parseSequencesRoute(`campaigns/${param}`);
  if (sequences)
    return { view: sequences.view === "list" ? "campaigns/sequences" : `campaigns/sequences/${sequences.view}` };
  if (param.includes("/")) return null;
  const at = parseHome(param);
  if (at.moment) return { ref: { kind: "campaign", id: at.moment } };
  if (at.message) return { ref: { kind: "template", name: at.message } };
  if (at.compose) return { view: "campaigns/new" };
  return at.group ? { view: "campaigns/in" } : null;
}

/**
 * What Sent's param opens: a run, the Get their yes section, or the one To send. Any other word is an audience, a door to the
 * composer (doorOf).
 */
function opensSent(param: string): Opened | null {
  if (param === "") return { view: "broadcasts" };
  const at = broadcastsProps(param);
  if (at.initialRun) return { ref: { kind: "send", id: at.initialRun } };
  if (at.initialToSend) return { view: "broadcasts/to-send" };
  return at.initialYes ? { view: "broadcasts/get-yes" } : null;
}

/** What People's param opens: its views, a list, a person, a lead or a search of Leads, and a deal on the Pipeline. */
function opensPeople(param: string): Opened | null {
  if (param === "") return { view: "clients" };
  if (param === "new-list") return { view: "clients/new-list" };
  // The route as the page's parsers read it, whole.
  const route = `clients/${param}`;
  // A person's tab is their address with its word (contracts personRouteOf, the one parse of it): their page, on that
  // tab, which addressOf writes back the same (S5-1). Any other slash in the param is nobody's, as flat says of the others.
  if (param.includes("/")) {
    const { id, tab } = personRouteOf(param);
    return isPersonParam(id) && RECORD_ID.test(id) && personTabRoute(id, tab) === route
      ? { ref: { kind: "person", id, tab } }
      : null;
  }
  if (/^leads(:|$)/.test(param)) {
    const at = parseLeadsRoute(route);
    if (!at) return null;
    if (!at.peek && !at.searchId) return { view: "clients/leads" };
    return {
      ref: {
        kind: "lead",
        ...(at.peek ? { id: at.peek } : {}),
        ...(at.searchId ? { searchId: at.searchId } : {}),
      },
    };
  }
  if (/^pipeline(:|$)/.test(param)) {
    const at = parsePipelineRoute(route);
    if (!at) return null;
    if (!at.peek) return { view: "clients/pipeline" };
    // A row's id is the person's, or the person's and one of their deals' joined by `_` (contracts pipelineRowId).
    const personId = pipelinePersonOf(at.peek);
    const dealKey = at.peek.length > personId.length ? at.peek.slice(personId.length + 1) : null;
    return { ref: { kind: "deal", personId, ...(dealKey ? { dealKey } : {}), on: "pipeline" } };
  }
  if (/^(seg|list|state):/.test(param)) {
    // A person seen over a view (`:p-<id>`, contracts parsePeopleRoute) is that person's; Everyone peeked is Everyone.
    const at = parsePeopleRoute(route);
    if (at?.peek) return RECORD_ID.test(at.peek) ? { ref: { kind: "person", id: at.peek } } : null;
    if (at && !at.view) return { view: "clients" };
    const list = parseListToken(at?.view ?? param);
    return list ? { ref: { kind: "list", id: list.id, ...(list.kind === "saved" ? { saved: true } : {}) } } : null;
  }
  return isPersonParam(param) && RECORD_ID.test(param) ? { ref: { kind: "person", id: param } } : null;
}

/** What Lists' param opens: a list by its id, built-in or kept, which People then picks (people/lists-route.tsx). */
function opensLists(param: string): Opened | null {
  if (param === "") return { view: "lists" };
  const list = parseListToken(`list:${param}`) ?? parseListToken(`seg:${param}`);
  return list ? { ref: { kind: "list", id: list.id, ...(list.kind === "saved" ? { saved: true } : {}) } } : null;
}

/** What the first run's param opens: a step it has, or Find asked for by name. */
function opensStart(param: string): Opened | null {
  if (param === "") return { view: "start" };
  return firstRunStepOf(param) !== null || `${FIRST_RUN_ROUTE}/${param}` === FIRST_RUN_FIND_ROUTE
    ? { view: "start/step" }
    : null;
}

/** What Settings' param opens: a pane it has, and the row of Business or Activity after it; a pane that is a kind is that kind. */
function opensSettings(param: string): Opened | null {
  if (param === "") return { view: "admin" };
  const section = param.slice(0, param.includes("/") ? param.indexOf("/") : param.length);
  // The back office is for the people who run Chanlytics, and the retired AI memory still answers: found by who is looking
  // (SET_TAB asks the window), so a shape here and not a lookup.
  if (section === "platform" || section === "memory") return param === section ? { view: `admin/${section}` } : null;
  // A pane the rail lists. SET_TAB falls to Profile for anything else, which opens, but is no address a writer should write.
  if (!SET_TABS.some((t) => t.id === section)) return null;
  const record = PANE_RECORDS.get(section);
  if (record && param === section) return { ref: record };
  return { view: `admin/${section}` };
}

/**
 * What Reports' param opens: a lens, over days or not (the Reviews lens is the reviews' kind, and, named by a review's id, that
 * review with its reply box), and the Overview.
 */
function opensReports(param: string): Opened | null {
  const at = reportsParamParts(param);
  if (!at) return null;
  if (at.lens !== "reviews") return { view: `reports/${at.lens}` };
  return { ref: at.review ? { kind: "review", id: at.review } : { kind: "review" } };
}

/**
 * Every page that has a route of its own, by the route's word (the keys of SURFACE_ROUTES), and the page's own parse of the
 * param after it. A page added to SURFACE_ROUTES is a row here in the same change, and the registry test fails without it.
 * The shapes each takes, after the page's word:
 *
 *   inbox          `th-<conversation>`, `new`, `new:<person>`
 *   conversations  `<tab>`, `<conversation>`, `cv-<call>`, and a row on its tab, `<tab>:<row>`
 *   live           `<call>`
 *   calendar       `<yyyy-mm-dd>`, `a-<visit>`, `<yyyy-mm-dd>:a-<visit>`
 *   campaigns      `in:<group>`, `moment:<campaign>`, `message:<template>`, `new` and the composer's other doors (`new:to:`,
 *                  `new:leads`; `new:every`, `new:moment:` and `new:edit:` land on Sequences, contracts sequenceLandingOf)
 *   broadcasts     `run:<send>`, `get-yes`
 *   clients        `<person>`, `new-list`, `seg:<built-in list>`, `list:<kept list>`, `leads` and its views
 *                  (`leads:s-<search>:l-<list>:c-<class>:p-<lead>`), `pipeline` and its views (`pipeline:v-<view>:p-<person>[_<deal>]`)
 *   segments       `<list>`
 *   start          `<step>`, `find`
 *   admin          `<pane>`, with a row of Business or Activity after it (`workspace/<row>`, `activity/<part>`)
 *   reports        `<lens>`, `<lens>:<days>`, `<days>`, `reviews:<review>`
 *   today, messages: the route alone. outbound: a door (contracts doorOf), read as the page that replaced it.
 */
const PAGES: ReadonlyMap<string, Parse> = new Map<string, Parse>([
  ["today", alone("today")],
  ["inbox", flat(opensInbox)],
  ["conversations", flat(opensConversations)],
  ["live", flat(opensLive)],
  ["calendar", flat(opensCalendar)],
  ["campaigns", opensCampaigns],
  ["messages", alone("messages")],
  ["broadcasts", flat(opensSent)],
  // A person's tab has a slash (`clients/<id>/history`), which opensPeople reads itself.
  ["clients", opensPeople],
  ["segments", flat(opensLists)],
  ["start", flat(opensStart)],
  ["admin", opensSettings],
  ["reports", flat(opensReports)],
  // The old Playbooks list is a door: canonicalRoute sends `outbound` to `campaigns` and `outbound/<id>` to its moment before
  // the page is asked, so nothing is opened here.
  ["outbound", () => null],
]);

/**
 * What a route opens, by the page it is the route of and that page's own parse: a record, a view, or null where the page does
 * not open it (a word the page does not know, an address of a page that is not here). A retired route is read as the one that
 * replaced it (contracts canonicalRoute), and the product's word as the shell's.
 */
export function opensRoute(route: string): Opened | null {
  const canonical = canonicalRoute(route);
  const at = canonical.indexOf("/");
  const parse = PAGES.get(at < 0 ? canonical : canonical.slice(0, at));
  return parse ? parse(at < 0 ? "" : canonical.slice(at + 1)) : null;
}
