/**
 * The Leads scope's surface and acts (PRD §6, §8, §9; the review's E8, E9,
 * S13). The page reads window.__LEADS and calls the window functions
 * installed here; every act goes through its route (routes.generated.ts) and
 * refresh-map re-applies this surface after a write, which PATCHES what is
 * loaded rather than reading it again: a run adds rows every few seconds, and
 * an owner reading page three must not be put back on page one, re-sorted, or
 * have their selection dropped. The selection and the cursor are the page's.
 *
 * Every read is made under a key -- the workspace and the whole view -- and an
 * answer that lands under a newer key is dropped. New rows a refresh finds are
 * offered ("12 new"), not sorted in, unless the owner is reading in the order
 * found, where they append after what is already read.
 */
import {
  leadRail, leadsRoute, leadsStanding, parseLeadsRoute, refusalOf, toLeadRowVM,
  type LeadChips, type LeadClass, type LeadCounts, type LeadList, type LeadRowDto, type LeadRowVM, type LeadSearchDto, type LeadSearchPlan, type LeadSort, type LeadStageInput, type LeadSuggestionsDto, type LeadsBulkInput,
} from "@chanlytics/contracts";
import { api } from "./api";
import { workspaceZone } from "./zone";
import { getActiveWorkspace } from "./workspace";
import { refreshSurfaces } from "./surface-runner";
import { peopleOverride, type SurfaceOverride } from "./surface-data";
import { ROUTES } from "../client/routes.generated";
import { unwrap, type ApiResult, type RouteKey } from "../client/api";

export interface LeadsView { searchId: string | null; list: LeadList; cls: LeadClass | null; chips: Partial<LeadChips>; sort: LeadSort; dir: "asc" | "desc" }
export interface LeadsSurface {
  searches: LeadSearchDto[];
  counts: LeadCounts;
  rows: LeadRowVM[];
  next: { key: string; id: string } | null;
  /** How many rows a refresh found that are not drawn, under a sort that is not the order found. */
  offered: number;
  view: LeadsView;
  /** The view as a route, for the address and for Ask's citations: clients/leads:s-<search>:l-<list>. */
  route: string;
  suggestions: LeadSuggestionsDto | null;
  tz: string;
  readFailed: boolean;
  fetchedAt: number;
}

/** What `GET lead-searches` and `GET leads` answer (4.6's DTOs); the counts ride with whichever read made them. */
interface LeadSearchesAnswer { searches: LeadSearchDto[]; counts?: LeadCounts }
interface LeadsPageAnswer { rows: LeadRowDto[]; next: { key: string; id: string } | null; counts?: LeadCounts }

const NO_COUNTS: LeadCounts = { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 };
const DEFAULT_VIEW: LeadsView = { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" };
const PAGE = 500;

/* ------------------------------------------------------ how a call is sent */

/**
 * Release B's own routes are Task 4.4's files, and this surface is written
 * before them. `gen-route-types.mjs` has not given them a key yet, and the one
 * client reads a route's method and path FROM that generated registry, so it
 * cannot be handed one of these. Their method and path -- the two strings
 * 4.4's files declare -- are named here, and `call` below hands the client the
 * pair either way. Scaffolding, written 20 September 2026: the moment 4.4 has
 * regenerated the registry every key below is found there instead, `call`
 * takes the first branch, and this table and `named` are dead code to delete.
 *
 * What the scaffolded branch does NOT do, for the one wave it lives: sign the
 * tab out on a 401 (it answers the unauthorized refusal, and the next read
 * through the client signs out), and consult `refresh-map.ts`, whose keys must
 * every one be a route (typed-client.test.mjs) and so cannot name these yet --
 * it re-reads the surfaces the map will name instead.
 */
const B_ROUTES: Record<string, { method: string; path: string }> = {
  "PATCH lead-searches/[id]": { method: "PATCH", path: "/api/v1/lead-searches/[id]" },
  "DELETE lead-searches/[id]": { method: "DELETE", path: "/api/v1/lead-searches/[id]" },
  "POST lead-searches/[id]/undo": { method: "POST", path: "/api/v1/lead-searches/[id]/undo" },
  "POST leads/[id]/stage": { method: "POST", path: "/api/v1/leads/[id]/stage" },
  "POST leads/[id]/draft": { method: "POST", path: "/api/v1/leads/[id]/draft" },
  "DELETE leads/[id]": { method: "DELETE", path: "/api/v1/leads/[id]" },
  "POST leads/bulk": { method: "POST", path: "/api/v1/leads/bulk" },
  "GET lead-suggestions": { method: "GET", path: "/api/v1/lead-suggestions" },
  "PUT lead-suggestions": { method: "PUT", path: "/api/v1/lead-suggestions" },
};

const GENERATED = ROUTES as unknown as Record<string, { method: string; path: string } | undefined>;

interface LeadCallOptions {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  /** false: nothing is re-read after it (a draft changes nothing anyone is looking at). */
  refresh?: false;
  /** What this write leaves stale, for a route the registry does not carry yet; the refresh map says the same for the ones it does. */
  stale?: SurfaceOverride[];
}

/** The same URL the client would build: the route's path with its parameters, and the workspace this page is about. */
function urlFor(path: string, opts: LeadCallOptions): string {
  const params = opts.params ?? {};
  const url = path.replace(/\[(\w+)\]/g, (_m, name: string) => encodeURIComponent(params[name] ?? ""));
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v));
  const ws = getActiveWorkspace();
  if (ws && !qs.has("workspace")) qs.set("workspace", ws);
  const q = qs.toString();
  return q ? `${url}?${q}` : url;
}

/** A route the generated registry does not carry yet: the same request, read back through the same envelope. */
async function named<O>(key: string, opts: LeadCallOptions): Promise<ApiResult<O>> {
  const route = B_ROUTES[key];
  if (!route) throw new Error(`no such lead route: ${key}`);
  const write = route.method !== "GET";
  const res = await window.fetch(urlFor(route.path, opts), {
    method: route.method,
    headers: opts.body !== undefined ? { "content-type": "application/json" } : {},
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const j = (await res.json().catch(() => null)) as { ok: true; data: unknown } | { ok: false; error?: { code?: string; message?: string; details?: unknown } } | null;
  if (!j || !j.ok) {
    const e = j && !j.ok ? j.error : undefined;
    return { ok: false, ...refusalOf({ code: e?.code, status: res.status, message: e?.message, details: e?.details, retryAfter: res.headers.get("retry-after"), write }) };
  }
  if (write) {
    // Something changed: a read already in flight describes the world before it.
    api().forget();
    if (opts.refresh !== false) await refreshSurfaces(opts.stale ?? [leadsOverride]);
  }
  return { ok: true, data: j.data as O };
}

/** One lead call, by the key the generated registry uses, answered by the DTO 4.6 spells. */
function call<O>(key: string, opts: LeadCallOptions = {}): Promise<ApiResult<O>> {
  if (GENERATED[key]) {
    const { stale: _stale, ...rest } = opts; // the refresh map names them once the route has a key
    return api()(key as RouteKey, rest as never) as unknown as Promise<ApiResult<O>>;
  }
  return named<O>(key, opts);
}

/** A read the runner treats as the surface's own: a refusal throws, the way `api.ts`'s `read` does. */
async function leadRead<O>(key: string, query?: Record<string, string>): Promise<O> {
  return unwrap(await call<O>(key, query ? { query } : {}));
}

/* --------------------------------------------------------- what is loaded */

/** What the Leads surface holds between reads. */
let leadsLoaded: {
  tz: string;
  view: LeadsView;
  key: string;
  searches: LeadSearchDto[];
  counts: LeadCounts;
  rows: LeadRowDto[];
  next: { key: string; id: string } | null;
  offered: LeadRowDto[];
  suggestions: LeadSuggestionsDto | null;
} | null = null;
let view: LeadsView = DEFAULT_VIEW;
/** Bumped by every read that replaces the rows; a read that finishes under a newer number is dropped. */
let reads = 0;

/** The key a read is made under: the workspace and every part of the view. */
function viewKey(v: LeadsView): string {
  return `${getActiveWorkspace() ?? ""}|${leadsRoute(v)}|${v.sort}|${v.dir}`;
}

function queryOf(v: LeadsView, after?: { key: string; id: string } | null): Record<string, string> {
  const q: Record<string, string> = { list: v.list, sort: v.sort, dir: v.dir, limit: String(PAGE) };
  if (v.searchId) q.search = v.searchId;
  if (v.cls) q.class = v.cls;
  for (const [k, val] of Object.entries(v.chips)) if (val !== undefined && val !== null && val !== "") q[k] = String(val);
  if (after) { q.after_key = after.key; q.after_id = after.id; }
  return q;
}

function publishLeads(failed = false): void {
  const now = new Date();
  const L = leadsLoaded;
  (window as unknown as { __LEADS?: LeadsSurface }).__LEADS = {
    searches: L?.searches ?? [],
    counts: L?.counts ?? NO_COUNTS,
    rows: (L?.rows ?? []).map((r) => toLeadRowVM(r, L?.tz ?? "UTC", now)),
    next: L?.next ?? null,
    offered: L?.offered.length ?? 0,
    view,
    route: leadsRoute(view),
    suggestions: L?.suggestions ?? null,
    tz: L?.tz ?? "UTC",
    readFailed: failed,
    fetchedAt: now.getTime(),
  };
}

/** A new view: page one under its key. The old rows go with the old key. */
async function readView(v: LeadsView): Promise<void> {
  const mine = ++reads;
  const key = viewKey(v);
  const [searches, page, tz] = await Promise.all([
    leadRead<LeadSearchesAnswer>("GET lead-searches"),
    leadRead<LeadsPageAnswer>("GET leads", queryOf(v)),
    workspaceZone(),
  ]);
  if (mine !== reads) return; // superseded: a newer view asked after this one
  // The first day's suggestions, and only then: a workspace with a search has work to read instead.
  const suggestions = searches.searches.length === 0 ? await leadRead<LeadSuggestionsDto>("GET lead-suggestions").catch(() => null) : leadsLoaded?.suggestions ?? null;
  if (mine !== reads) return;
  leadsLoaded = { tz, view: v, key, searches: searches.searches, counts: page.counts ?? searches.counts ?? NO_COUNTS, rows: page.rows, next: page.next, offered: [], suggestions };
  publishLeads();
}

/** The same view again, after a write or a Realtime change: patch, keep the pages, offer the rest. */
async function refreshView(): Promise<void> {
  const L = leadsLoaded;
  if (!L) return readView(view);
  const key = L.key;
  const [searches, page] = await Promise.all([
    leadRead<LeadSearchesAnswer>("GET lead-searches"),
    leadRead<LeadsPageAnswer>("GET leads", queryOf(L.view)),
  ]);
  if (!leadsLoaded || leadsLoaded.key !== key) return; // the view moved while this was out
  const fresh = new Map(page.rows.map((r) => [r.id, r]));
  const loaded = new Set(L.rows.map((r) => r.id));
  const rows = L.rows.map((r) => fresh.get(r.id) ?? r);
  const arrived = page.rows.filter((r) => !loaded.has(r.id) && !L.offered.some((o) => o.id === r.id));
  if (L.view.sort === "found") rows.push(...arrived);            // the order found: after what is already read
  else L.offered.push(...arrived);                                // any other order: offered, never sorted in
  L.searches = searches.searches;
  L.counts = page.counts ?? searches.counts ?? L.counts;
  L.rows = rows;
  publishLeads();
}

export const leadsOverride: SurfaceOverride = {
  key: "leads",
  globals: ["__LEADS"],
  events: ["surface:leads"],
  // A run commits a page every few seconds and a check lands per batch: the strip and the rows follow the database.
  refreshOnTables: ["leads", "lead_searches", "lead_rounds", "lead_search_members"],
  debounceMs: 800,
  apply: async () => {
    try {
      await (leadsLoaded ? refreshView() : readView(view));
    } catch (e) {
      publishLeads(true);
      throw e;
    }
  },
};

/** A new view: a route (clients/leads:…) or a patch of the current one. Answers when the rows are in. */
export async function leadsView(to: string | Partial<LeadsView>): Promise<void> {
  const parsed = typeof to === "string" ? parseLeadsRoute(to) : null;
  view = parsed
    ? { ...DEFAULT_VIEW, searchId: parsed.searchId, list: parsed.list, cls: parsed.cls, chips: parsed.chips as Partial<LeadChips>, sort: view.sort, dir: view.dir }
    : { ...view, ...(to as Partial<LeadsView>) };
  await readView(view);
  window.dispatchEvent(new CustomEvent("surface:leads"));
}

/** The next 500 of the same view; dropped if the view moved while it was out. */
export async function leadsMore(): Promise<void> {
  const L = leadsLoaded;
  if (!L?.next) return;
  const key = L.key;
  const page = await leadRead<LeadsPageAnswer>("GET leads", queryOf(L.view, L.next));
  if (!leadsLoaded || leadsLoaded.key !== key) return;
  const seen = new Set(leadsLoaded.rows.map((r) => r.id));
  leadsLoaded.rows = [...leadsLoaded.rows, ...page.rows.filter((r) => !seen.has(r.id))];
  leadsLoaded.next = page.next;
  publishLeads();
  window.dispatchEvent(new CustomEvent("surface:leads"));
}

/** "12 new": the owner asked for them, so the view is read again in its order. */
export async function leadsTakeOffered(): Promise<void> {
  await readView(view);
  window.dispatchEvent(new CustomEvent("surface:leads"));
}

/* --------------------------------------------------------------- the acts */
// Named functions, one per door, in people-detail.ts's style: the page calls window.__leadX, the tests call these.

export async function setLeadStage(id: string, input: LeadStageInput) {
  // An Interested call makes a person, so People is stale too (the refresh map says the same once 4.4's route exists).
  return call<{ stage: string; contact_id: string | null; op_id: string; version: number; toast: string }>("POST leads/[id]/stage", { params: { id }, body: input, stale: [leadsOverride, peopleOverride] });
}
export async function keepLead(searchId: string, id: string) { return api()("POST leads/[id]/keep", { params: { id }, body: { search_id: searchId } }); }
export async function excludeLead(searchId: string, id: string) { return api()("POST leads/[id]/exclude", { params: { id }, body: { search_id: searchId } }); }
export async function putBackLead(searchId: string, id: string) { return api()("POST leads/[id]/put-back", { params: { id }, body: { search_id: searchId } }); }
/** Undo names the operation and the version the page saw (E9): the server refuses when anyone changed it since. */
export async function undoLeadOperation(opId: string, version: number) { return api()("POST lead-operations/[id]/undo", { params: { id: opId }, body: { version } }); }
export async function draftForLead(id: string, input: { tone: "first" | "shorter" | "warmer"; previous?: { subject: string; body: string } }) {
  return call<{ to: string; subject: string; body: string; mailto: string }>("POST leads/[id]/draft", { params: { id }, body: input, refresh: false });
}
export async function eraseLead(id: string) { return call<{ erased: true }>("DELETE leads/[id]", { params: { id } }); }
/** The selected ids, or the view for "Select all N that match" (S13). */
export async function bulkLeads(body: LeadsBulkInput) { return call<{ done: number; op_id: string; version: number; toast: string }>("POST leads/bulk", { body }); }
/** Include amends the plan, so it carries the version the owner approved; Keep and Stop carry none (§7.2). */
export async function answerSearch(id: string, answer: "keep" | "include" | "stop", plan?: LeadSearchPlan) { return api()("POST lead-searches/[id]/answer", { params: { id }, body: { answer, ...(plan ? { plan } : {}) } }); }
export async function moreForSearch(id: string, purpose: "topup" | "renew", plan: LeadSearchPlan) { return api()("POST lead-searches/[id]/more", { params: { id }, body: { purpose, plan } }); }
export async function stopSearch(id: string) { return api()("POST lead-searches/[id]/stop", { params: { id } }); }
/** The Done strip's Undo (§8.6, Task 4.2's `lead_search_undo`): the untouched leads of the ended round leave and the month is credited. */
export async function removeRoundLeads(id: string) { return call<{ removed: number; credited: number; op_id: string; version: number }>("POST lead-searches/[id]/undo", { params: { id } }); }
export async function renameSearch(id: string, name: string) { return call<{ name: string }>("PATCH lead-searches/[id]", { params: { id }, body: { name } }); }
export async function removeSearch(id: string) { return call<{ archived: number; kept: number }>("DELETE lead-searches/[id]", { params: { id } }); }
export async function setBusinessLine(business_line: string) { return call<{ business_line: string }>("PUT lead-suggestions", { body: { business_line } }); }

export function installLeadsCourier(): void {
  window.__leadsView = leadsView;
  window.__leadsMore = leadsMore;
  window.__leadsTakeOffered = leadsTakeOffered;
  // The three the page derives its address, its rail and its standing line from: contracts', handed over, never re-spelled.
  window.__leadsRouteOf = leadsRoute;
  window.__leadsRouteParse = parseLeadsRoute;
  window.__leadRail = leadRail;
  window.__leadsStanding = leadsStanding;
  window.__leadStage = setLeadStage;
  window.__leadKeep = keepLead;
  window.__leadExclude = excludeLead;
  window.__leadPutBack = putBackLead;
  window.__leadUndo = undoLeadOperation;
  window.__leadDraft = draftForLead;
  window.__leadErase = eraseLead;
  window.__leadsBulk = bulkLeads;
  window.__leadSearchAnswer = answerSearch;
  window.__leadSearchMore = moreForSearch;
  window.__leadSearchStop = stopSearch;
  window.__leadSearchUndo = removeRoundLeads;
  window.__leadSearchRename = renameSearch;
  window.__leadSearchRemove = removeSearch;
  window.__leadBusinessLine = setBusinessLine;
  // Two more view models join this list, each in the task that writes what it
  // carries: `__leadPeekVM` (contracts' `toLeadPeekVM`, Task 12) and
  // `__leadSearchWords` (contracts' `leadSearchWords`, Task 16). The words
  // themselves never come through the courier: `window.__LEAD_WORDS` and
  // `window.__LEAD_VM` are seeded in `seed-globals.ts` beside `__FACT_WORDS`.
}

declare global {
  interface Window {
    __LEADS?: LeadsSurface;
    __leadsView?: typeof leadsView;
    __leadsMore?: typeof leadsMore;
    __leadsTakeOffered?: typeof leadsTakeOffered;
    __leadsRouteOf?: typeof leadsRoute;
    __leadsRouteParse?: typeof parseLeadsRoute;
    __leadRail?: typeof leadRail;
    __leadsStanding?: typeof leadsStanding;
    __leadStage?: typeof setLeadStage;
    __leadKeep?: typeof keepLead;
    __leadExclude?: typeof excludeLead;
    __leadPutBack?: typeof putBackLead;
    __leadUndo?: typeof undoLeadOperation;
    __leadDraft?: typeof draftForLead;
    __leadErase?: typeof eraseLead;
    __leadsBulk?: typeof bulkLeads;
    __leadSearchAnswer?: typeof answerSearch;
    __leadSearchMore?: typeof moreForSearch;
    __leadSearchStop?: typeof stopSearch;
    __leadSearchUndo?: typeof removeRoundLeads;
    __leadSearchRename?: typeof renameSearch;
    __leadSearchRemove?: typeof removeSearch;
    __leadBusinessLine?: typeof setBusinessLine;
  }
}
