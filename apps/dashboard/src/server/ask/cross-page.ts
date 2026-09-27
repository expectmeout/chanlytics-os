import { parseLeadsRoute, type AskScope, type AskSurface } from "@chanlytics/contracts";
import type { SearchResultBlock } from "./context";
import { calledName, type ToolRun } from "./tools";

/**
 * Reads made before the model is asked, for what the question names on ANOTHER page (the Phase 2 plan, D12, D13).
 *
 * The page a person is on reaches the model as its context (context.ts); a question about what that page shows is
 * answered from it. A question that names another page's rows plainly -- the week's report from the Inbox, tomorrow's
 * calendar from Reports, the calls from People -- would take a round to choose the tool and a second to answer; the
 * read runs beside the context instead and rides into the first round as data. A noun the page itself shows is not
 * read again. The table is deliberately narrow: a wrong read costs tokens and says nothing false, a missed one costs the
 * round it always cost, and the model may still call any tool.
 */
export const CROSS_PAGE_MAX = 2;

const DAY_WORDS: Array<[RegExp, string]> = [
  [/\b(tomorrow|mañana)\b/i, "tomorrow"],
  [/\b(today|hoy)\b/i, "today"],
  [/\b(mon|monday|lunes)\b/i, "mon"],
  [/\b(tue|tuesday|martes)\b/i, "tue"],
  [/\b(wed|wednesday|miércoles|miercoles)\b/i, "wed"],
  [/\b(thu|thursday|jueves)\b/i, "thu"],
  [/\b(fri|friday|viernes)\b/i, "fri"],
  [/\b(sat|saturday|sábado|sabado)\b/i, "sat"],
  [/\b(sun|sunday|domingo)\b/i, "sun"],
];

function dayOf(q: string, fallback: string): string {
  for (const [re, d] of DAY_WORDS) if (re.test(q)) return d;
  return fallback;
}

function daysOf(q: string): 7 | 30 | 90 {
  if (/\b(90|ninety|quarter|noventa|trimestre)\b/i.test(q)) return 90;
  if (/\b(30|thirty|month|treinta|mes)\b/i.test(q)) return 30;
  return 7;
}

const REPORT =
  /\breports?\b|\binforme\b|\b(last|past|previous|these|últimos?|ultimos?)\s+(7|seven|30|thirty|90|ninety|siete|treinta|noventa)\s*(days|días|dias)\b|\bhow (did|was|were|are|is)\b.*\b(week|month|days|semana|mes)\b|\bcómo (fue|va|nos fue|estuvo)\b/i;
const OPENINGS =
  /\bopenings?\b|\bavailab|\bfree (slots?|times?|spots?)\b|\bslots?\b|\bhuecos?\b|\bdisponib|\bopen (on |this |next |el |este |próximo |proximo )?(mon|tue|wed|thu|fri|sat|sun|today|tomorrow|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|mañana)/i;
const CALENDAR = /\bcalendar\b|\bcalendario\b|\bagenda\b|\bappointments?\b|\bcitas?\b|\bwhat'?s on\b|\bqué hay\b/i;
const PLAYBOOKS = /\bplaybooks?\b|\bwin-?back\b|\bsave our number\b|\bmonth'?s offer\b|\bstanding (rules?|offers?)\b/i;
const AUDIENCES =
  /\baudiences?\b|\bsaid yes\b|\bopted[- ]in\b|\boffers?\b|\bbroadcasts?\b|\bcampaigns?\b|\btemplates?\b|\bquiet (clients|customers|people)\b|\bdijeron que s[ií]\b|\bofertas?\b|\bplantillas?\b/i;
const MISSED = /\bmissed calls?\b|\bllamadas? perdidas?\b/i;
const CALLS = /\btranscripts?\b|\brecordings?\b|\bcalls?\b|\bcalled\b|\bllam(ó|o|aron|ada|adas|ar)\b|\bgrabaci[oó]n\b/i;
/** Drafts held for approval (D12): the snapshot carried them on every page; now one read carries them off the Inbox. */
const HELD = /\bheld\b|\bdrafts?\b|\bwaiting (for|on) (my |your )?approval\b|\bborradores?\b|\bretenid[oa]s?\b/i;

/** The reads each page's own rows already answer, by tool and action: on that page, its context answers the question. */
const ON_PAGE: Partial<Record<AskSurface, ReadonlySet<string>>> = {
  calendar: new Set(["calendar.openings", "calendar.week"]),
  campaigns: new Set(["campaigns.playbooks", "campaigns.audiences"]),
  today: new Set(["calls.list"]),
  conversations: new Set(["calls.list"]),
  live: new Set(["calls.list"]),
  inbox: new Set(["inbox.list"]),
};

/**
 * The reads a question names on another page, at most CROSS_PAGE_MAX, in the order below. On Reports a
 * report is read only for a period other than the one on screen (the context's view).
 */
export function crossPagePlan(text: string, surface: string | null, view: string | null = null): ToolRun[] {
  const q = text.replace(/\s+/g, " ").trim();
  const own = ON_PAGE[surface as AskSurface] ?? new Set<string>();
  const out: ToolRun[] = [];
  const add = (name: string, input: Record<string, unknown>) => {
    const called = calledName(name, input);
    if (!own.has(called) && !out.some((r) => calledName(r.name, r.input) === called)) out.push({ name, input });
  };
  if (REPORT.test(q)) {
    const days = daysOf(q);
    if (surface !== "reports" || String(days) !== view) add("report", { days });
  }
  if (OPENINGS.test(q)) add("calendar", { action: "openings", day: dayOf(q, ""), service: "" });
  else if (CALENDAR.test(q)) add("calendar", { action: "week", day: dayOf(q, "today") });
  if (PLAYBOOKS.test(q)) add("campaigns", { action: "playbooks" });
  if (AUDIENCES.test(q)) add("campaigns", { action: "audiences" });
  if (MISSED.test(q)) add("calls", { action: "list", filter: "missed" });
  else if (CALLS.test(q)) add("calls", { action: "list", filter: "recent" });
  if (HELD.test(q)) add("inbox", { action: "list", filter: "held" });
  return out.slice(0, CROSS_PAGE_MAX);
}

/**
 * The row the scope names, read whole by the tool and action that read it, to ride in with the page (as the snapshot's
 * scoped row did): a call (calls.get), a person (people.get), a thread or a conversation (inbox.thread), a lead
 * (leads.lead), a search (leads.search), and a run -- the Broadcasts row its address calls one -- (campaigns.broadcast).
 * A lead is read as the search the page is on found it (its address's `s-<id>`), the membership its peek shows, never
 * its newest in another search. A page needs no read: none. Moved here from loop.ts (PR 4.3): the reads made before
 * the model is asked live here.
 */
export function scopedRead(scope: AskScope | null, route?: string | null): ToolRun | null {
  if (scope?.kind === "call") return { name: "calls", input: { action: "get", call_id: scope.id } };
  if (scope?.kind === "person") return { name: "people", input: { action: "get", contact_id: scope.id } };
  if (scope?.kind === "thread" || scope?.kind === "conversation")
    return { name: "inbox", input: { action: "thread", conversation_id: scope.id, more: false } };
  if (scope?.kind === "lead") {
    const searchId = route ? parseLeadsRoute(route)?.searchId : null;
    return {
      name: "leads",
      input: { action: "lead", lead_id: scope.id, ...(searchId ? { search_id: searchId } : {}) },
    };
  }
  if (scope?.kind === "search") return { name: "leads", input: { action: "search", search_id: scope.id } };
  if (scope?.kind === "run") return { name: "campaigns", input: { action: "broadcast", broadcast_id: scope.id } };
  return null;
}

/**
 * One read as the model reads it: data in a block of its own, never in `system` (customers' words are in it), its
 * source the tool and action that read it (`read://calendar.week`), its title the call as it was made.
 */
export function readBlock(run: ToolRun, result: string): SearchResultBlock {
  return {
    type: "search_result",
    source: `read://${calledName(run.name, run.input)}`,
    title: `${run.name} ${JSON.stringify(run.input)}`,
    content: [{ type: "text", text: result }],
    citations: { enabled: false },
  };
}
