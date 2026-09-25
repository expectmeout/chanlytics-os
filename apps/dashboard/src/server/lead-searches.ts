/**
 * A workspace's searches: reading, naming, removing and undoing one, and the lead a person came from. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import {
  AppError,
  type LeadArea,
  type LeadCounts,
  type LeadEmailState,
  type LeadRoundEnding,
  type LeadSearchDto,
  type LeadSearchPlan,
  type LeadStage,
} from "@chanlytics/contracts";
import { answerOf, refusalOf } from "./lead-answers";
import { requireUuid } from "./request-guards";
import { type Params, row } from "./route";
import type { RouteContext } from "./with-route";

export interface SearchViewRow {
  id: string;
  tenant_id: string;
  created_by: string | null;
  card: string;
  name: string;
  asked: string;
  via: string;
  plan: unknown;
  removed_at: string | null;
  created_at: string;
  round_id: string | null;
  seq: number | null;
  purpose: string | null;
  state: string | null;
  ending: string | null;
  question: unknown;
  answered: string | null;
  target: number | null;
  plan_version: number | null;
  /** What this round has spent so far: cost per Qualified lead is read from here (00140's view). */
  cost_usd: number;
  qualified: number;
  review: number;
  excluded: number;
  counted: number;
  judge_tokens: number;
  /** 00142: the ending the round will take once its checks land -- the only way to tell Stopping from Checking (S12). */
  ending_pending: string | null;
  waiting_since: string | null;
  ended_at: string | null;
  /** Counted leads whose address was found and checked, and counted leads reachable by phone (the Done strip's two numbers). */
  emails_checked: number;
  with_phone: number;
  /** The undo_search operation a finished round's Undo names, while its twenty-four hours run. */
  undo_op_id: string | null;
  undo_version: number | null;
  /** 00145: where to look next when the round ran dry, as LeadArea rows; [] otherwise. */
  nearby: unknown;
  /** 00146: the qualified members by fit band, for the band bar. */
  strong: number | null;
  look: number | null;
  long: number | null;
  /** 00172: the Ask thread the search was planned in, or null. */
  thread_id: string | null;
}

/** The round's nearby areas as the view returns them: only rows shaped as an area are handed on. */
function nearbyOf(v: unknown): LeadArea[] {
  if (!Array.isArray(v)) return [];
  return v.filter((a): a is LeadArea => {
    const x = a as Partial<LeadArea> | null;
    return (
      !!x &&
      typeof x === "object" &&
      typeof x.label === "string" &&
      typeof x.radius_m === "number" &&
      typeof x.query === "string" &&
      (x.kind === "zip" || x.kind === "city" || x.kind === "radius") &&
      typeof x.state === "string" &&
      (x.center === null || (!!x.center && typeof x.center.lat === "number" && typeof x.center.lng === "number"))
    );
  });
}

/** One search with its latest round, or a 404 in the product's words. */
export async function searchRow(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  id: string,
): Promise<SearchViewRow> {
  const { data, error } = await ctx.supabase
    .from("lead_searches_view")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AppError("not_found", "This search is not in your workspace.", 404);
  return data as unknown as SearchViewRow;
}

/**
 * The plan an answer carries, as the door takes it (lead_round_answer, 00140): the version after the round's, at the
 * count the search's plan reserved. A client may send any version and count; this is the one place that sets them,
 * for the route and for a proposal that amends (server/ask/proposals.ts).
 */
export function answerPlanOf(
  search: Pick<SearchViewRow, "plan" | "plan_version">,
  plan: LeadSearchPlan,
): LeadSearchPlan {
  const reserved = (search.plan as LeadSearchPlan | null)?.count;
  return {
    ...plan,
    version: (search.plan_version ?? 1) + 1,
    count: typeof reserved === "number" ? reserved : plan.count,
  };
}

export async function listSearches(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<SearchViewRow[]> {
  const { data, error } = await ctx.supabase
    .from("lead_searches_view")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SearchViewRow[];
}

/* ------------------------------------------------------ the two row scopes */

/**
 * The lead a verb acts on, read under RLS: one this workspace cannot see is a
 * 404, and the role is judged in the lead's own workspace. An erased lead is
 * gone, not forbidden.
 */
export interface LeadRow {
  id: string;
  tenant_id: string;
  business_name: string;
  email: string | null;
  email_state: LeadEmailState;
  stage: LeadStage;
  closed_reason: string | null;
  contact_id: string | null;
  place_id: string;
  erased_at: string | null;
  blanked_at: string | null;
}

const LEAD_SCOPE_COLUMNS =
  "id, tenant_id, business_name, email, email_state, stage, closed_reason, contact_id, place_id, erased_at, blanked_at";

export async function loadLead(ctx: Pick<RouteContext, "supabase">, id: string): Promise<LeadRow> {
  const leadId = requireUuid(id, "lead");
  const { data, error } = await ctx.supabase.from("leads").select(LEAD_SCOPE_COLUMNS).eq("id", leadId).maybeSingle();
  if (error) throw new Error(error.message);
  const found = (data ?? null) as unknown as LeadRow | null;
  if (!found || found.erased_at) throw new AppError("not_found", "That lead is not in your workspace.", 404);
  return found;
}

export const leadScope = row((ctx: RouteContext, params: Params) => loadLead(ctx, String(params.id ?? "")));

export interface LeadSearchScopeRow {
  id: string;
  tenant_id: string;
  name: string;
  plan: unknown;
  removed_at: string | null;
}

export async function loadLeadSearch(ctx: Pick<RouteContext, "supabase">, id: string): Promise<LeadSearchScopeRow> {
  const searchId = requireUuid(id, "search");
  const { data, error } = await ctx.supabase
    .from("lead_searches")
    .select("id, tenant_id, name, plan, removed_at")
    .eq("id", searchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AppError("not_found", "This search is not in your workspace.", 404);
  return data as unknown as LeadSearchScopeRow;
}

export const leadSearchScope = row((ctx: RouteContext, params: Params) => loadLeadSearch(ctx, String(params.id ?? "")));

/* ------------------------------------------------- what the owner reads -- */

/** The rail's six numbers (lead_list_counts), or zeroes when the workspace has none. */
export async function listCounts(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<LeadCounts> {
  const { data, error } = await ctx.supabase.rpc("lead_list_counts", { p_tenant_id: tenantId });
  if (error) throw new Error(`lead_list_counts: ${error.message}`);
  const c = (data ?? {}) as Partial<LeadCounts>;
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    all: n(c.all),
    ready: n(c.ready),
    nurture: n(c.nurture),
    converted: n(c.converted),
    said_no: n(c.said_no),
    not_a_fit: n(c.not_a_fit),
  };
}

/**
 * The key lead_rounds.question is kept under. The runner writes core's RoundQuestion (ports.ts) verbatim through
 * lead_collect_commit, so it is `criterionKey`; reading only `criterion_key` gave the page "" for every question
 * ever asked, and Include lifted nothing. The snake spelling is read too, for a row written by hand.
 */
const questionKeyOf = (q: { criterionKey?: unknown; criterion_key?: unknown }): string =>
  typeof q.criterionKey === "string" ? q.criterionKey : typeof q.criterion_key === "string" ? q.criterion_key : "";

/**
 * The question a search is waiting on, or null: the round's sentence while its state is waiting_on_owner. The one
 * reader for Ask (list_lead_searches says it; a proposal that amends answers it); the DTO reads the question in
 * every state, for the page.
 */
export const waitingQuestionOf = (r: Pick<SearchViewRow, "state" | "question">): string | null =>
  r.state === "waiting_on_owner" &&
  r.question &&
  typeof r.question === "object" &&
  typeof (r.question as { sentence?: unknown }).sentence === "string"
    ? (r.question as { sentence: string }).sentence
    : null;

/** `asked_on` is the view's own created_at: the day the owner asked, said once. */
function toSearchDto(r: SearchViewRow): LeadSearchDto {
  const q =
    r.question && typeof r.question === "object"
      ? (r.question as { sentence?: unknown; criterionKey?: unknown; criterion_key?: unknown })
      : null;
  if (!r.round_id)
    return {
      id: r.id,
      name: r.name,
      asked: r.asked,
      asked_on: r.created_at,
      plan: r.plan as LeadSearchPlan,
      plan_version: r.plan_version ?? 1,
      thread_id: r.thread_id ?? null,
      round: null,
    };
  return {
    id: r.id,
    name: r.name,
    asked: r.asked,
    asked_on: r.created_at,
    plan: r.plan as LeadSearchPlan,
    plan_version: r.plan_version ?? 1,
    thread_id: r.thread_id ?? null,
    round: {
      id: r.round_id,
      seq: r.seq ?? 1,
      purpose: r.purpose ?? "probe",
      state: r.state ?? "ended",
      ending: (r.ending ?? null) as LeadRoundEnding | null,
      question: q && typeof q.sentence === "string" ? { sentence: q.sentence, criterion_key: questionKeyOf(q) } : null,
      target: r.target ?? 0,
      counted: r.counted,
      qualified: r.qualified,
      review: r.review,
      excluded: r.excluded,
      emails_checked: r.emails_checked,
      with_phone: r.with_phone,
      // The view stores the ending a stopping round WILL take; a screen only
      // needs to know one is pending, which is what tells Stopping from
      // Checking (S12).
      ending_pending: r.ending_pending !== null,
      waiting_since: r.waiting_since,
      cost_usd: r.cost_usd,
      ended_at: r.ended_at,
      undo_op_id: r.undo_op_id,
      undo_version: r.undo_version,
      nearby: nearbyOf(r.nearby),
      fits: { strong: r.strong ?? 0, look: r.look ?? 0, long: r.long ?? 0 },
    },
  };
}

/** Every kept search with its latest round, and the rail's counts: one read of each. */
export async function searchesOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
): Promise<{ searches: LeadSearchDto[]; counts: LeadCounts }> {
  const [rows, counts] = await Promise.all([listSearches(ctx, tenantId), listCounts(ctx, tenantId)]);
  return { searches: rows.map(toSearchDto), counts };
}

/* --------------------------------------------------------- a search, kept */

export async function renameSearch(
  ctx: Pick<RouteContext, "supabase">,
  s: LeadSearchScopeRow,
  name: string,
): Promise<{ name: string }> {
  const { data, error } = await ctx.supabase.rpc("lead_search_rename", { p_search_id: s.id, p_name: name });
  if (error) throw new Error(`lead_search_rename: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  return { name: a.name ?? name };
}

/**
 * Removing a search keeps the leads being worked (00140). What is left
 * unblanked afterwards IS what was kept, so the toast's number is the
 * database's and never the page's guess.
 */
export async function removeSearch(
  ctx: Pick<RouteContext, "supabase">,
  s: LeadSearchScopeRow,
): Promise<{ archived: number; kept: number; toast: string }> {
  const { data, error } = await ctx.supabase.rpc("lead_search_remove", { p_search_id: s.id });
  if (error) throw new Error(`lead_search_remove: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  const { count, error: kept } = await ctx.supabase
    .from("lead_search_members")
    .select("lead_id", { count: "exact", head: true })
    .eq("search_id", s.id)
    .is("blanked_at", null);
  if (kept) throw new Error(kept.message);
  const keptN = count ?? 0;
  return {
    archived: a.blanked ?? 0,
    kept: keptN,
    toast: `Removed. The ${keptN} you contacted or are talking to are kept.`,
  };
}

/**
 * The Done strip's Undo (§8.6): the leads of the ended round that nobody
 * touched leave the search and go back to the month they counted in. A lead
 * that was exported leaves without a credit -- it left the building, so it
 * stays charged -- and a worked lead stays where it is.
 */
export async function undoSearch(
  ctx: Pick<RouteContext, "supabase">,
  s: LeadSearchScopeRow,
): Promise<{ removed: number; credited: number; op_id: string | null; version: number; toast: string }> {
  const { data, error } = await ctx.supabase.rpc("lead_search_undo", { p_search_id: s.id });
  if (error) throw new Error(`lead_search_undo: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  const removed = a.removed ?? 0;
  const credited = a.credited ?? 0;
  return {
    removed,
    credited,
    op_id: a.op_id ?? null,
    version: a.version ?? 1,
    toast:
      removed === 0
        ? "Nothing to take back: every lead here has been worked."
        : `Took back ${removed} lead${removed === 1 ? "" : "s"}. ${credited} went back to this month's leads.`,
  };
}

/**
 * The lead a person was found as, the newest when two places held their number; null when they were never one. A
 * converted lead's page links to its person; this is the way back.
 */
export async function leadOfPerson(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  contactId: string,
): Promise<{ id: string; business_name: string; found_at: string } | null> {
  const { data, error } = await ctx.supabase
    .from("leads")
    .select("id, business_name, found_at")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .is("erased_at", null)
    .is("blanked_at", null)
    .order("found_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id, business_name: data.business_name, found_at: data.found_at } : null;
}
