/**
 * Ask's citation grammar: the kinds a citation may name, the rule that keeps one honest (a row a reader returned this
 * turn, or a page) and where each opens. Read by ask.ts's message, the answer's normaliser (ask-answer.ts) and the
 * format the model writes (answer-format.ts). Pure; it imports only the tables of the addresses the pages themselves parse.
 */
import { addressOf } from "../activity/record-address";
import { calendarParamParts } from "../calendar/appointment-key";
import { JOURNEY_STAGE_IDS, type JourneyStageId } from "../journey/journey";
import type { LifecycleGroup } from "../playbooks/lifecycle/lifecycle-types";
import { parseLeadsRoute, leadsRoute } from "../leads/lead-plan";
import { BUILTIN_LISTS, parseListToken } from "../people/lists/lists";
import { GET_YES_ROUTE } from "../people/people-lists";
import { LENS_ROUTES, reportsRouteParts } from "../reports/lenses";

/* ----------------------------------------------------------- the citation */

/**
 * Fifteen names (the spec, 5.7): a page, and the fourteen kinds of row a reader returns. A Broadcasts row cites as a
 * broadcast: `run` is the word its address and a scope spell (ask.ts ASK_SCOPE_KINDS), never a citation's. A visit (the
 * record's row, appointments.id) and a Google review (google_reviews.id) joined them with the wiring's last two links
 * (15 October 2026): an answer about a booking or a review now opens it, where it opened the page around it.
 */
export const ASK_CITATION_KINDS = [
  "thread",
  "conversation",
  "call",
  "person",
  "page",
  "lead",
  "search",
  "deal",
  "list",
  "broadcast",
  "playbook",
  "template",
  "mailbox",
  "visit",
  "review",
] as const;
export type AskCitationKind = (typeof ASK_CITATION_KINDS)[number];

/** The rows an answer's items may name, in words: said once, by the prompt's rules and the format's items alike. */
export const ASK_ROW_WORDS =
  "people, threads, calls, leads, searches, deals, lists, broadcasts, playbooks, templates, mailboxes, appointments, reviews";

export interface AskCitation {
  kind: AskCitationKind;
  /** A row's id as its reader gave it (a People list's is its name, `quiet`); for a page, its route. */
  id: string;
  label: string;
}

/* --------------------------------------------------------------- grounding */

/**
 * A row a reader returned: its kind and id, where it opens as its page opens it -- a deal at its person's page, a
 * template on Templates, a list at `clients/list:<id>` or `clients/seg:<id>`, a connected mailbox on Connections -- and
 * its name.
 * The server's readers return these (server/readers RowRef), and the read set keeps them.
 */
export interface AskRowRef {
  kind: AskCitationKind;
  id: string;
  route: string;
  label: string;
}

/** What the tools and the page returned this turn, by kind and id, each with its RowRef: the rows a citation may name. */
export type AskReadSet = Record<Exclude<AskCitationKind, "page">, Map<string, AskRowRef>>;

export function emptyReadSet(): AskReadSet {
  return Object.fromEntries(
    ASK_CITATION_KINDS.filter((k) => k !== "page").map((k) => [k, new Map<string, AskRowRef>()]),
  ) as AskReadSet;
}

/** Rows read, into the read set by kind and id as their readers gave them. A page needs no read, and is not kept. */
export function noteRows(read: AskReadSet, refs: Iterable<AskRowRef>): void {
  for (const r of refs) if (r.kind !== "page") read[r.kind].set(r.id, r);
}

/**
 * The pages a citation or a navigate target may point at without a read: every page the palette jumps to (askPages;
 * the Pipeline, Sequences and the back office only where the workspace and the person have them), and People's lists.
 */
export const ASK_PAGE_ROUTES: readonly string[] = [
  "today",
  "inbox",
  "clients",
  "clients/leads",
  "clients/pipeline",
  "segments",
  "conversations",
  "live",
  "calendar",
  "campaigns",
  // Campaigns › Sequences (decision 0060): everything that sends on its own.
  "campaigns/sequences",
  // Campaigns › Messages, its other view (19 Oct 2026); its old route, `messages` below, a door to it.
  "campaigns/messages",
  "outbound",
  "broadcasts",
  "messages",
  ...LENS_ROUTES,
  "start",
  "admin/workspace",
  "admin/hours",
  "admin/receptionist",
  "admin/team",
  "admin/autonomy",
  "admin/notifications",
  "admin/integrations",
  "admin/billing",
  "admin/activity",
  "admin/profile",
  "admin/partner",
  "admin/platform",
];

/**
 * Whether a route is a page Ask may name: one of the listed pages (ASK_PAGE_ROUTES), or an address its page takes by a
 * parse of its own -- the Calendar's day, Reports' lens and the days after it, People's Leads views that name no search
 * and no lead and its built-in lists, the Sent room's Get their yes, the calls tab of Conversations and a group of
 * Campaigns' ledger. A visit is no page: it is a row, cited as kind visit, so `calendar/<day>:a-<id>` is not one, whatever
 * the id. A route that only BEGINS with a page's word
 * is no page (`admin/opening`, `calendar/next-week`, `reports/foo`, `today/x`): it lands on "Not in this release", on the usual
 * week or on a card that names no surface. A list of the workspace's own (`clients/list:<id>`) is a row, its reader's route,
 * and so are a thread, a call, a person, a campaign and a run: never a page.
 */
function isPageRoute(route: string): boolean {
  if (ASK_PAGES.has(route)) return true;
  const at = route.indexOf("/");
  const param = at < 0 ? "" : route.slice(at + 1);
  switch (at < 0 ? route : route.slice(0, at)) {
    case "calendar": {
      // A view (`calendar/month`) or a day is a page; a visit, in any view, is a row.
      const named = calendarParamParts(param);
      return named.visitId === null && (named.day !== null || named.view !== null);
    }
    case "conversations":
      return route === CALLS_ROUTE;
    case "campaigns":
      return param.startsWith("in:") && CAMPAIGN_GROUPS.includes(param.slice("in:".length));
    case "reports": {
      // A lens is a page; one review (`reports/reviews:<id>`) is a row, never a page.
      const parts = reportsRouteParts(route);
      return parts !== null && parts.review === null;
    }
    case "broadcasts":
      return route === GET_YES_ROUTE;
    case "clients":
      return isPeopleView(route, param);
    default:
      return false;
  }
}

/** A view of People that is a page: a built-in list, or the Leads scope narrowed by its pile alone (the writer's own order). */
function isPeopleView(route: string, param: string): boolean {
  if (param.startsWith("seg:")) {
    const ref = parseListToken(param);
    return ref?.kind === "builtin" && BUILTIN_LISTS.some((l) => l.id === ref.id);
  }
  if (param !== "leads" && !param.startsWith("leads:")) return false;
  const view = parseLeadsRoute(route);
  return !!view && !view.searchId && !view.peek && leadsRoute({ list: view.list, cls: view.cls }) === route;
}

const ASK_PAGES: ReadonlySet<string> = new Set(ASK_PAGE_ROUTES);

/** The calls tab of Conversations: the one tab address the product writes (a call's bell row, Today's calls figure, Live). */
const CALLS_ROUTE = "conversations/phone";

/**
 * The groups of Campaigns' ledger that are no journey stage. A record over the type, so a group LifecycleGroup gains is a
 * compile error here until it is named, and the list below cannot fall behind the ledger's.
 */
const OTHER_GROUPS = { lists: true, reach_out: true, sent_once: true } satisfies Record<
  Exclude<LifecycleGroup["id"], JourneyStageId>,
  true
>;

/** The groups of Campaigns' ledger an address narrows it to (`campaigns/in:<group>`): a journey stage, then the others. */
const CAMPAIGN_GROUPS: readonly string[] = [...JOURNEY_STAGE_IDS, ...Object.keys(OTHER_GROUPS)];

/**
 * Drop every citation that names a row the tools did not return this turn.
 * A model that read nothing cannot cite anything; a model that read the
 * Inbox can cite only the threads it saw. A page needs no read, because a
 * page is not a claim, but it must be a page: one of the listed pages, or an
 * address its page parses (isPageRoute). Anything else is dropped.
 */
export function groundCitations(citations: AskCitation[], read: AskReadSet): { kept: AskCitation[]; dropped: number } {
  const kept: AskCitation[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const c of citations) {
    const ok = c.kind === "page" ? isPageRoute(c.id) : read[c.kind].has(c.id);
    const key = `${c.kind}:${c.id}`;
    if (!ok || seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    kept.push(c);
  }
  return { kept, dropped };
}

/** The rows that open at one route whoever read them: the kinds a citation named before the read set held routes. */
const OWN_ROUTES: Partial<Record<AskCitationKind, (id: string) => string>> = {
  thread: (id) => addressOf({ kind: "conversation", id }),
  conversation: (id) => addressOf({ kind: "conversation", id, in: "conversations" }),
  call: (id) => addressOf({ kind: "call", id }),
  person: (id) => addressOf({ kind: "person", id }),
  // Where the record opens them without a day: the Calendar finds a visit by its row, and the Reviews lens a review.
  visit: (id) => addressOf({ kind: "visit", id }),
  review: (id) => addressOf({ kind: "review", id }),
};

/**
 * Where a citation opens: a page at its route; a row at the route its reader gave it, the RowRef the read set holds,
 * never one derived here (a deal opens its person's page, a template Templates). A citation stored without its `to`
 * was made before answers kept one, when a row was a thread, a conversation, a call or a person: it opens where the
 * pages open those. A row of another kind the read set does not hold opens nowhere: "".
 */
export function citationRoute(c: AskCitation, read?: AskReadSet): string {
  if (c.kind === "page") return c.id;
  return read?.[c.kind].get(c.id)?.route ?? OWN_ROUTES[c.kind]?.(c.id) ?? "";
}
