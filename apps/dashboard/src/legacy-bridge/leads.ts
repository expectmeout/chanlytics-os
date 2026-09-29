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
  LEAD_SORTS,
  leadRail,
  leadSearchWords,
  leadsRoute,
  leadsStanding,
  parseLeadsRoute,
  stageArgs,
  toLeadPeekVM,
  toLeadRowVM,
  type LeadChips,
  type LeadClass,
  type LeadCounts,
  type LeadMonthDto,
  type LeadList,
  type LeadPeekVM,
  type LeadRowDto,
  type LeadRowVM,
  type LeadSearchDto,
  type LeadSearchPlan,
  type LeadSort,
  type LeadStageInput,
  type LeadSuggestionsDto,
  type LeadsBulkInput,
} from "@chanlytics/contracts";
import { api } from "./api";
import { workspaceZone } from "./zone";
import { getActiveWorkspace } from "./workspace";
import { heldViews } from "./held-views";
import type { SurfaceOverride } from "./surface-data";
import { unwrap, type ApiResult, type RouteKey } from "../client/api";

export interface LeadsView {
  searchId: string | null;
  list: LeadList;
  cls: LeadClass | null;
  chips: Partial<LeadChips>;
  sort: LeadSort;
  dir: "asc" | "desc";
}
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
  /** The month's standing (D5): what the workbench says a press costs. Null until a first page has answered. */
  month: LeadMonthDto | null;
  /**
   * The leads the peek read on their own because no page loaded holds them (PR 9: a link to a lead, one far down a
   * view), as rows: what the page's acts look a lead up in when it is not among `rows`. Never drawn as rows.
   */
  peeked: LeadRowVM[];
  tz: string;
  readFailed: boolean;
  fetchedAt: number;
}

/** What `GET lead-searches` and `GET leads` answer (4.6's DTOs); the counts ride with whichever read made them. */
interface LeadSearchesAnswer {
  searches: LeadSearchDto[];
  counts?: LeadCounts;
}
interface LeadsPageAnswer {
  rows: LeadRowDto[];
  next: { key: string; id: string } | null;
  counts?: LeadCounts;
  month?: LeadMonthDto;
}

const NO_COUNTS: LeadCounts = { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 };
const DEFAULT_VIEW: LeadsView = { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" };
const LEADS_PAGE = 500;
const SNAPSHOT_ROWS = 100;

/* ------------------------------------------------------ how a call is sent */

interface LeadCallOptions {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  /**
   * false: nothing is re-read after it (a draft changes nothing anyone is looking at). "behind": the surface is
   * re-read all the same, but the act answers when the door accepts (client/api.ts), so the next press in a list
   * being worked down does not wait for two reads.
   */
  refresh?: false | "behind";
}

/**
 * One lead call, by the key the generated registry uses, answered by the DTO
 * 4.6 spells.
 *
 * Every one of release B's routes has a key now (Task 4.4 regenerated the
 * registry), so this is the one client and nothing else: it signs the tab out
 * on a 401, forgets the reads a write invalidated, and takes what a write
 * leaves stale from `refresh-map.ts` rather than from the caller.
 */
function leadCall<O>(key: string, opts: LeadCallOptions = {}): Promise<ApiResult<O>> {
  return api()(key as RouteKey, opts as never) as unknown as Promise<ApiResult<O>>;
}

/** A read the runner treats as the surface's own: a refusal throws, the way `api.ts`'s `read` does. */
async function leadRead<O>(key: string, query?: Record<string, string>): Promise<O> {
  return unwrap(await leadCall<O>(key, query ? { query } : {}));
}

/* --------------------------------------------------------- what is loaded */

/** What the Leads surface holds between reads. */
interface LeadsLoaded {
  tz: string;
  view: LeadsView;
  key: string;
  /** The month's standing (D5), from whichever first page last answered one. */
  month: LeadMonthDto | null;
  searches: LeadSearchDto[];
  counts: LeadCounts;
  rows: LeadRowDto[];
  next: { key: string; id: string } | null;
  offered: LeadRowDto[];
  suggestions: LeadSuggestionsDto | null;
}
let leadsLoaded: LeadsLoaded | null = null;
let view: LeadsView = DEFAULT_VIEW;
/**
 * The views this tab has read, by their key (the workspace and the whole view), the last eight: a rail pick used to
 * be a round trip each way, with the old view's rows under the new title until it landed. A view held here paints
 * at once, its Show more pages with it, and is read again behind, patched. Not the read cache (read-cache.ts): that
 * is emptied by every write, and a held view is safe across one, because it is read again the moment it is shown.
 * In memory only: signing out and a workspace change are both a new document. The standard's one helper
 * (held-views.ts), which also says whether a read that lands is still the newest asked.
 */
const held = heldViews<LeadsLoaded>(8);
const hold = (l: LeadsLoaded): void => held.hold(l.key, l);
/** The views this tab holds go: a test on a new wire (a workspace change is a new document). */
export function forgetLeadsViews(): void {
  held.forget();
  peeked.clear();
  peekAsked.clear();
  erased.clear();
  peekLast = null;
}

/** The key a read is made under: the workspace and every part of the view. */
function viewKey(v: LeadsView): string {
  return `${getActiveWorkspace() ?? ""}|${leadsRoute(v)}|${v.sort}|${v.dir}`;
}

function queryOf(v: LeadsView, after?: { key: string; id: string } | null): Record<string, string> {
  const q: Record<string, string> = { list: v.list, sort: v.sort, dir: v.dir, limit: String(LEADS_PAGE) };
  if (v.searchId) q.search = v.searchId;
  if (v.cls) q.class = v.cls;
  for (const [k, val] of Object.entries(v.chips))
    if (val !== undefined && val !== null && val !== "") q[k] = String(val);
  if (after) {
    q.after_key = after.key;
    q.after_id = after.id;
  }
  return q;
}

function publishLeads(failed = false): void {
  const now = new Date();
  const L = leadsLoaded;
  // The view these rows are of -- the one read, never one asked for since, which is still on its way. A refresh of
  // the old view that landed first published the old rows under the new view's route: the page took the new view for
  // landed, its rows stopped dimming, and the last view's rows stood under the new title until the read came back.
  const shown = L?.view ?? view;
  // Each row is handed its own search (D5): a review row names what it waits on in the queue's words.
  const vmOf = (r: LeadRowDto) =>
    toLeadRowVM(r, L?.tz ?? "UTC", now, (L?.searches ?? []).find((s) => s.id === r.search_id) ?? null);
  // An erased lead is gone from every view this tab holds at once: a view read before the erase still has it.
  const rows = (L?.rows ?? []).filter((r) => !erased.has(r.id));
  const drawn = new Set(rows.map((r) => r.id));
  (window as unknown as { __LEADS?: LeadsSurface }).__LEADS = {
    searches: L?.searches ?? [],
    counts: L?.counts ?? NO_COUNTS,
    rows: rows.map(vmOf),
    next: L?.next ?? null,
    offered: L?.offered.filter((r) => !erased.has(r.id)).length ?? 0,
    view: shown,
    route: leadsRoute(shown),
    suggestions: L?.suggestions ?? null,
    month: L?.month ?? null,
    peeked: peekedHere()
      .filter((r) => !drawn.has(r.id))
      .map(vmOf),
    tz: L?.tz ?? "UTC",
    readFailed: failed,
    fetchedAt: now.getTime(),
  };
}

/**
 * A page of a view, one row per lead: with no search named, leads_page (00212) answers a row per membership, so a lead
 * two searches hold (one found, and the list it was chosen into, Reach out Part 7) came twice and drew twice under one
 * key. The first of each is kept, in the order the door sorted them.
 */
async function leadsPage(v: LeadsView, after?: { key: string; id: string } | null): Promise<LeadsPageAnswer> {
  const page = await leadRead<LeadsPageAnswer>("GET leads", queryOf(v, after));
  const seen = new Set<string>();
  return { ...page, rows: page.rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))) };
}

/** Page one of a view, read under its key: what a first read and a warm both do. */
async function readPageOne(v: LeadsView): Promise<LeadsLoaded> {
  const key = viewKey(v);
  const [searches, page, tz] = await Promise.all([
    leadRead<LeadSearchesAnswer>("GET lead-searches"),
    leadsPage(v),
    workspaceZone(),
  ]);
  // The first day's suggestions, and only then: a workspace with a search has work to read instead.
  const suggestions =
    searches.searches.length === 0
      ? await leadRead<LeadSuggestionsDto>("GET lead-suggestions").catch(() => null)
      : (leadsLoaded?.suggestions ?? null);
  return {
    tz,
    view: v,
    key,
    searches: searches.searches,
    counts: page.counts ?? searches.counts ?? NO_COUNTS,
    month: page.month ?? null,
    rows: page.rows,
    next: page.next,
    offered: [],
    suggestions,
  };
}

/**
 * A new view. One this tab holds paints at once and is read again behind (a refresh: patched, its pages kept);
 * one it does not is page one under its key, and the old rows go with the old key.
 */
async function readView(v: LeadsView): Promise<void> {
  const ask = held.ask();
  const have = held.get(viewKey(v));
  if (have) {
    leadsLoaded = have;
    publishLeads();
    window.dispatchEvent(new CustomEvent("surface:leads"));
    await refreshView();
    return;
  }
  const loaded = await readPageOne(v);
  hold(loaded);
  if (!ask.still()) return; // superseded: a newer view asked after this one
  leadsLoaded = loaded;
  publishLeads();
}

/** A view the owner may pick next (a rail row under the pointer): read into what is held, and nothing on the page moves. */
export async function warmLeadsView(to: string): Promise<void> {
  const parsed = parseLeadsRoute(to);
  if (!parsed) return;
  const v: LeadsView = {
    ...DEFAULT_VIEW,
    searchId: parsed.searchId,
    list: parsed.list,
    cls: parsed.cls,
    chips: parsed.chips as Partial<LeadChips>,
    sort: view.sort,
    dir: view.dir,
  };
  // A warm that fails costs nothing; the pick reads for itself. Two warms in flight, or a warm and the pick that
  // follows it, are one request: the client shares an identical read for two seconds.
  if (held.has(viewKey(v))) return;
  try {
    hold(await readPageOne(v));
  } catch {
    /* the pick reads for itself */
  }
}

/**
 * The view a cold boot reads: the one the address names (all leads, off the page), in the order this tab last read,
 * which the surface cache put back before anything mounted -- the view the page asks for as it mounts, so the two
 * are one read. The bridge started from its own default instead, so a refresh on a search's Needs review read all
 * 500 leads first and drew them over the restored rows of the view on screen. An order the server does not know is
 * never sent; the lead open over a view is no part of it.
 */
export function leadsBootView(hash: string, restored: unknown): LeadsView {
  const parsed = parseLeadsRoute((hash || "").replace(/^#\/?/, ""));
  const was = (restored as { view?: { sort?: unknown; dir?: unknown } } | null | undefined)?.view;
  const known =
    !!was &&
    typeof was === "object" &&
    (LEAD_SORTS as readonly unknown[]).includes(was.sort) &&
    (was.dir === "asc" || was.dir === "desc");
  return {
    ...DEFAULT_VIEW,
    ...(parsed
      ? { searchId: parsed.searchId, list: parsed.list, cls: parsed.cls, chips: parsed.chips as Partial<LeadChips> }
      : {}),
    ...(known ? { sort: was.sort as LeadSort, dir: was.dir as "asc" | "desc" } : {}),
  };
}

/** The same view again, after a write or a Realtime change: patch, keep the pages, offer the rest. */
async function refreshView(): Promise<void> {
  const L = leadsLoaded;
  if (!L) return readView(view);
  const key = L.key;
  const [searches, page] = await Promise.all([leadRead<LeadSearchesAnswer>("GET lead-searches"), leadsPage(L.view)]);
  if (!leadsLoaded || leadsLoaded.key !== key) return; // the view moved while this was out
  const fresh = new Map(page.rows.map((r) => [r.id, r]));
  const loaded = new Set(L.rows.map((r) => r.id));
  const rows = L.rows.map((r) => fresh.get(r.id) ?? r);
  const arrived = page.rows.filter((r) => !loaded.has(r.id) && !L.offered.some((o) => o.id === r.id));
  if (L.view.sort === "found")
    rows.push(...arrived); // the order found: after what is already read
  else L.offered.push(...arrived); // any other order: offered, never sorted in
  L.searches = searches.searches;
  L.counts = page.counts ?? searches.counts ?? L.counts;
  // The month moves with a refresh (D5): a Keep just spent one, so the workbench's "5 of your 238 left" follows.
  L.month = page.month ?? L.month;
  L.rows = rows;
  publishLeads();
  // A lead the peek read on its own is not in any page this re-read patched: it is read again too, behind.
  void peekAgain();
}

export const leadsOverride: SurfaceOverride = {
  key: "leads",
  globals: ["__LEADS"],
  // The tab's cache holds the first hundred rows of the view: all an instant paint needs, and a fifth of what a
  // full page costs to keep and to parse on every boot. The read behind the paint says the rest, so the snapshot
  // offers nothing and has no page after it.
  trimSnapshot: (snap) => {
    const L = snap.__LEADS as LeadsSurface | undefined;
    return L ? { ...snap, __LEADS: { ...L, rows: L.rows.slice(0, SNAPSHOT_ROWS), next: null, offered: 0 } } : snap;
  },
  events: ["surface:leads"],
  // A run commits a page every few seconds and a check lands per batch: the strip and the rows follow the database.
  refreshOnTables: ["leads", "lead_searches", "lead_rounds", "lead_search_members"],
  debounceMs: 800,
  apply: async () => {
    try {
      if (!leadsLoaded)
        view = leadsBootView(window.location.hash, (window as unknown as { __LEADS?: unknown }).__LEADS);
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
    ? {
        ...DEFAULT_VIEW,
        searchId: parsed.searchId,
        list: parsed.list,
        cls: parsed.cls,
        chips: parsed.chips as Partial<LeadChips>,
        sort: view.sort,
        dir: view.dir,
      }
    : { ...view, ...(to as Partial<LeadsView>) };
  await readView(view);
  window.dispatchEvent(new CustomEvent("surface:leads"));
}

/** The next 500 of the same view; dropped if the view moved while it was out. */
export async function leadsMore(): Promise<void> {
  const L = leadsLoaded;
  if (!L?.next) return;
  const key = L.key;
  const page = await leadsPage(L.view, L.next);
  if (!leadsLoaded || leadsLoaded.key !== key) return;
  const seen = new Set(leadsLoaded.rows.map((r) => r.id));
  leadsLoaded.rows = [...leadsLoaded.rows, ...page.rows.filter((r) => !seen.has(r.id))];
  leadsLoaded.next = page.next;
  publishLeads();
  window.dispatchEvent(new CustomEvent("surface:leads"));
}

/** "12 new": the owner asked for them, so the view is read again in its order -- page one afresh, in place, so the view held keeps up. */
export async function leadsTakeOffered(): Promise<void> {
  const L = leadsLoaded;
  if (!L) return readView(view);
  const key = L.key;
  const fresh = await readPageOne(L.view);
  if (!leadsLoaded || leadsLoaded.key !== key) return;
  Object.assign(L, {
    searches: fresh.searches,
    counts: fresh.counts,
    month: fresh.month,
    rows: fresh.rows,
    next: fresh.next,
    offered: [],
  });
  publishLeads();
  window.dispatchEvent(new CustomEvent("surface:leads"));
}

/* --------------------------------------------------------------- the acts */
// Named functions, one per door, in people-detail.ts's style: the page calls window.__leadX, the tests call these.
// Every one answers when its door accepts, with the re-read behind it ("behind"): the owner is working down a list.

type LeadMember = LeadRowDto["member"];

/**
 * An act the owner sees at once: the loaded row is changed the way the press itself says, the page is told, and the
 * door is asked; a door that refuses puts the row back as it was. Only what the press names is changed -- the class
 * it puts the place in, and whether it counts. The month, the counts and everything a rule decides are the
 * re-read's to say, a moment later. A re-read that no longer holds the row (Needs review, once kept) leaves this one
 * as it is, so the lead stays kept where the owner left it rather than standing there still offering Keep.
 */
async function actAtOnce<R extends { ok: boolean }>(
  ids: string[],
  change: (row: LeadRowDto) => LeadRowDto,
  send: () => Promise<R>,
): Promise<R> {
  const L = leadsLoaded;
  const wanted = new Set(ids);
  const was = L ? L.rows.filter((r) => wanted.has(r.id)) : [];
  // A lead the peek read on its own (PR 9) shows the press at once too, and is put back the same way.
  const heldWas = [...peeked].filter(([, r]) => wanted.has(r.id));
  if (!L || (!was.length && !heldWas.length)) return send();
  const tell = () => {
    publishLeads();
    window.dispatchEvent(new CustomEvent("surface:leads"));
  };
  const changed = new Map(was.map((r) => [r, change(r)]));
  L.rows = L.rows.map((r) => changed.get(r) ?? r);
  const heldNow = heldWas.map(([k, r]) => [k, change(r), r] as const);
  for (const [k, after] of heldNow) peeked.set(k, after);
  tell();
  const r = await send();
  // Refused: back as it was -- unless the view moved on, or a re-read has already said what a row is now.
  if (!r.ok) {
    let moved = false;
    if (leadsLoaded === L) {
      const back = new Map([...changed].map(([before, after]) => [after, before]));
      if (L.rows.some((row) => back.has(row))) {
        L.rows = L.rows.map((row) => back.get(row) ?? row);
        moved = true;
      }
    }
    for (const [k, after, before] of heldNow)
      if (peeked.get(k) === after) {
        peeked.set(k, before);
        moved = true;
      }
    if (moved) tell();
  }
  return r;
}
const member = (m: LeadMember, patch: Partial<LeadMember>): LeadMember => ({ ...m, ...patch });
const kept = (r: LeadRowDto): LeadRowDto => ({ ...r, member: member(r.member, { class: "qualified", counted: true }) });
const leftOut = (r: LeadRowDto): LeadRowDto => ({
  ...r,
  member: member(r.member, { class: "excluded", counted: false }),
});
/** The stage a press asks for, as the door will spell it: only that. A person, a count, the month are the door's. */
const staged =
  (input: LeadStageInput) =>
  (r: LeadRowDto): LeadRowDto => {
    const a = stageArgs(input);
    return a.p_stage ? { ...r, stage: a.p_stage as LeadRowDto["stage"], closed_reason: a.p_reason } : r;
  };
const bulked =
  (action: "contacted" | "not_a_fit" | "keep" | "exclude") =>
  (r: LeadRowDto): LeadRowDto => {
    switch (action) {
      case "contacted":
        return staged({ kind: "stage", stage: "nurture" })(r);
      case "not_a_fit":
        return { ...r, stage: "archived", closed_reason: "not_a_fit" };
      case "keep":
        return kept(r);
      case "exclude":
        return leftOut(r);
    }
  };

export async function setLeadStage(id: string, input: LeadStageInput) {
  // An Interested call makes a person, so People is stale too: `refresh-map.ts`
  // names both surfaces for this one route.
  return actAtOnce([id], staged(input), () =>
    leadCall<{ stage: string; contact_id: string | null; op_id: string; version: number; toast: string }>(
      "POST leads/[id]/stage",
      { params: { id }, body: input, refresh: "behind" },
    ),
  );
}
export async function keepLead(searchId: string, id: string) {
  return actAtOnce([id], kept, () =>
    api()("POST leads/[id]/keep", { params: { id }, body: { search_id: searchId }, refresh: "behind" }),
  );
}
export async function excludeLead(searchId: string, id: string) {
  return actAtOnce([id], leftOut, () =>
    api()("POST leads/[id]/exclude", { params: { id }, body: { search_id: searchId }, refresh: "behind" }),
  );
}
export async function putBackLead(searchId: string, id: string) {
  return actAtOnce([id], kept, () =>
    api()("POST leads/[id]/put-back", { params: { id }, body: { search_id: searchId }, refresh: "behind" }),
  );
}
/** Undo names the operation and the version the page saw (E9): the server refuses when anyone changed it since. */
export async function undoLeadOperation(opId: string, version: number) {
  return api()("POST lead-operations/[id]/undo", { params: { id: opId }, body: { version } });
}
export async function draftForLead(
  id: string,
  input: { tone: "first" | "shorter" | "warmer"; previous?: { subject: string; body: string } },
) {
  return leadCall<{ to: string; subject: string; body: string; mailto: string }>("POST leads/[id]/draft", {
    params: { id },
    body: input,
    refresh: false,
  });
}
/**
 * Erase (the owner's, from the peek's menu): it answers when the door accepts, and the lead leaves every view this
 * tab holds at once -- a re-read only patches the rows it finds, so a lead it no longer finds would stand there,
 * erased, until a reload. The counts are the re-read's, behind it.
 */
export async function eraseLead(id: string) {
  const r = await leadCall<{ erased: true; already: boolean }>("DELETE leads/[id]", {
    params: { id },
    refresh: "behind",
  });
  if (r.ok) {
    erased.add(id);
    forgetPeeked(id);
    publishLeads();
    window.dispatchEvent(new CustomEvent("surface:leads"));
  }
  return r;
}
/** The selected ids, or the view for "Select all N that match" (S13). By ids, every row shows it at once; by view nobody knows which rows it reaches, so they wait for the re-read. */
export async function bulkLeads(body: LeadsBulkInput) {
  return actAtOnce(body.by === "ids" ? body.ids : [], bulked(body.action), () =>
    leadCall<{ done: number; op_id: string; version: number; toast: string }>("POST leads/bulk", {
      body,
      refresh: "behind",
    }),
  );
}
/** Check again (D3): the mailbox check once more for the addresses whose last check did not answer. */
export async function checkLeadsAgain(ids: string[]) {
  return leadCall<{ scheduled: number; skipped: number; toast: string }>("POST leads/check-again", { body: { ids } });
}
/** Include carries the plan the owner approved; the route sets its version and count (G1). Keep and Stop carry none (§7.2). */
export async function answerSearch(id: string, answer: "keep" | "include" | "stop", plan?: LeadSearchPlan) {
  return api()("POST lead-searches/[id]/answer", { params: { id }, body: { answer, ...(plan ? { plan } : {}) } });
}
export async function moreForSearch(id: string, purpose: "topup" | "renew", plan: LeadSearchPlan) {
  return api()("POST lead-searches/[id]/more", { params: { id }, body: { purpose, plan } });
}
export async function stopSearch(id: string) {
  return api()("POST lead-searches/[id]/stop", { params: { id } });
}
/** The Done strip's Undo (§8.6, Task 4.2's `lead_search_undo`): the untouched leads of the ended round leave and the month is credited. */
export async function removeRoundLeads(id: string) {
  return leadCall<{ removed: number; credited: number; op_id: string; version: number }>(
    "POST lead-searches/[id]/undo",
    {
      params: { id },
    },
  );
}
export async function renameSearch(id: string, name: string) {
  return leadCall<{ name: string }>("PATCH lead-searches/[id]", { params: { id }, body: { name } });
}
export async function removeSearch(id: string) {
  return leadCall<{ archived: number; kept: number }>("DELETE lead-searches/[id]", { params: { id } });
}
export async function setBusinessLine(business_line: string) {
  return leadCall<{ business_line: string }>("PUT lead-suggestions", { body: { business_line } });
}

/* ------------------------------------------ a lead on no page loaded (PR 9) */

/**
 * The leads the peek read on their own, by workspace, lead and the search the view is of, the last eight: a link to
 * a lead, or a lead far down a view the tab has read one page of, opened the peek on nothing, because the peek drew
 * only what the pages held. It asks `GET leads/[id]` once per lead and view (in the view's search, when the view is
 * one search's), holds the answer, and tells the page, which draws the peek when it comes. What it has asked is
 * forgotten with what it held (evicted) and whenever the door refuses, so a lead that could not be shown in one view
 * is asked again in another. A held lead the door no longer shows -- erased, or moved out, in another tab -- goes
 * from the peek and from every view.
 */
const PEEK_HELD = 8;
const peeked = new Map<string, LeadRowDto>();
const peekAsked = new Set<string>();
const erased = new Set<string>();
let peekLast: { id: string; searchId: string | null } | null = null;
const peekKey = (id: string, searchId: string | null) => `${getActiveWorkspace() ?? ""}|${id}|${searchId ?? ""}`;
const peekedHere = (): LeadRowDto[] => {
  const ws = `${getActiveWorkspace() ?? ""}|`;
  return [...peeked].filter(([k, r]) => k.startsWith(ws) && !erased.has(r.id)).map(([, r]) => r);
};
/** An erased lead goes from everything the peek holds, under every view it was read in. */
function forgetPeeked(id: string): void {
  for (const k of [...peeked.keys()]) if (peeked.get(k)?.id === id) peeked.delete(k);
  for (const k of [...peekAsked]) if (k.split("|")[1] === id) peekAsked.delete(k);
}

async function askPeek(id: string, searchId: string | null, again = false): Promise<void> {
  const key = peekKey(id, searchId);
  if (peekAsked.has(key) && !again) return;
  peekAsked.add(key);
  const r = await leadCall<{ row: LeadRowDto }>("GET leads/[id]", {
    params: { id },
    ...(searchId ? { query: { search: searchId } } : {}),
  });
  const tell = () => {
    publishLeads();
    window.dispatchEvent(new CustomEvent("surface:leads"));
  };
  if (!r.ok) {
    peekAsked.delete(key);
    // A lead held and read again that the door no longer shows was erased or moved out elsewhere: it goes.
    if (r.status === 404 && peeked.has(key)) {
      erased.add(id);
      forgetPeeked(id);
      tell();
    }
    return;
  }
  // A second guard beside the server's: a row of a search this workspace's surface does not hold is not drawn here.
  if (erased.has(id) || !leadsLoaded?.searches.some((s) => s.id === r.data.row.search_id)) {
    peekAsked.delete(key);
    return;
  }
  peeked.delete(key);
  peeked.set(key, r.data.row);
  while (peeked.size > PEEK_HELD) {
    const oldest = peeked.keys().next().value as string;
    peeked.delete(oldest);
    peekAsked.delete(oldest);
  }
  tell();
}

/** After a re-read: the lead the peek last held on its own is read again, behind, while no page loaded holds it. */
async function peekAgain(): Promise<void> {
  const last = peekLast;
  if (!last || !peeked.has(peekKey(last.id, last.searchId)) || leadsLoaded?.rows.some((r) => r.id === last.id)) return;
  await askPeek(last.id, last.searchId, true);
}

/**
 * The peek's view model for one lead: the DTO, its search, the workspace's zone (§9.2). A lead on a page loaded is
 * drawn at once; one on no page is the one the peek read on its own for this view, or null while that read is out --
 * the read is asked for here, once, and the page is told when it lands.
 */
export function peekVMFor(leadId: string): LeadPeekVM | null {
  const L = leadsLoaded;
  if (!L || erased.has(leadId)) return null;
  const vmOf = (row: LeadRowDto) =>
    toLeadPeekVM(row, L.searches.find((s) => s.id === row.search_id) ?? null, L.tz, new Date());
  const row = L.rows.find((r) => r.id === leadId);
  if (row) return vmOf(row);
  const searchId = L.view.searchId ?? null;
  peekLast = { id: leadId, searchId };
  const held = peeked.get(peekKey(leadId, searchId));
  if (held) return vmOf(held);
  void askPeek(leadId, searchId).catch(() => {});
  return null;
}

export function installLeadsCourier(): void {
  window.__leadsView = leadsView;
  window.__leadsWarm = warmLeadsView;
  window.__leadsMore = leadsMore;
  window.__leadsTakeOffered = leadsTakeOffered;
  // The three the page derives its address, its rail and its standing line from: contracts', handed over, never re-spelled.
  window.__leadsRouteOf = leadsRoute;
  window.__leadsRouteParse = parseLeadsRoute;
  window.__leadRail = leadRail;
  window.__leadsStanding = leadsStanding;
  // And what the peek draws one lead from, built from the rows already loaded: contracts' too (Task 12).
  window.__leadPeekVM = peekVMFor;
  // What a kept search says it asked for, in the owner's words (§8.10): the rail's menu and the question before
  // Remove read the same sentence.
  window.__leadSearchWords = leadSearchWords;
  window.__leadStage = setLeadStage;
  window.__leadKeep = keepLead;
  window.__leadExclude = excludeLead;
  window.__leadPutBack = putBackLead;
  window.__leadUndo = undoLeadOperation;
  window.__leadDraft = draftForLead;
  window.__leadErase = eraseLead;
  window.__leadsBulk = bulkLeads;
  window.__leadCheckAgain = checkLeadsAgain;
  window.__leadSearchAnswer = answerSearch;
  window.__leadSearchMore = moreForSearch;
  window.__leadSearchStop = stopSearch;
  window.__leadSearchUndo = removeRoundLeads;
  window.__leadSearchRename = renameSearch;
  window.__leadSearchRemove = removeSearch;
  window.__leadBusinessLine = setBusinessLine;
  // The two view models above joined this list each in the task that wrote what it
  // carries (`__leadPeekVM`, Task 12; `__leadSearchWords`, Task 16). The words
  // themselves never come through the courier: `window.__LEAD_WORDS` and
  // `window.__LEAD_VM` are seeded in `seed-globals.ts` beside `__FACT_WORDS`.
}

declare global {
  interface Window {
    __LEADS?: LeadsSurface;
    __leadsView?: typeof leadsView;
    __leadsWarm?: typeof warmLeadsView;
    __leadsMore?: typeof leadsMore;
    __leadsTakeOffered?: typeof leadsTakeOffered;
    __leadsRouteOf?: typeof leadsRoute;
    __leadPeekVM?: typeof peekVMFor;
    __leadsRouteParse?: typeof parseLeadsRoute;
    __leadRail?: typeof leadRail;
    __leadsStanding?: typeof leadsStanding;
    __leadSearchWords?: typeof leadSearchWords;
    __leadStage?: typeof setLeadStage;
    __leadKeep?: typeof keepLead;
    __leadExclude?: typeof excludeLead;
    __leadPutBack?: typeof putBackLead;
    __leadUndo?: typeof undoLeadOperation;
    __leadDraft?: typeof draftForLead;
    __leadErase?: typeof eraseLead;
    __leadsBulk?: typeof bulkLeads;
    __leadCheckAgain?: typeof checkLeadsAgain;
    __leadSearchAnswer?: typeof answerSearch;
    __leadSearchMore?: typeof moreForSearch;
    __leadSearchStop?: typeof stopSearch;
    __leadSearchUndo?: typeof removeRoundLeads;
    __leadSearchRename?: typeof renameSearch;
    __leadSearchRemove?: typeof removeSearch;
    __leadBusinessLine?: typeof setBusinessLine;
  }
}
