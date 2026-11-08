/**
 * A workspace's searches: reading, naming, removing and undoing one, and the lead a person came from. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import {
  AppError,
  peoplePlanOf,
  type LeadArea,
  type LeadCounts,
  type LeadEmailState,
  type LeadRoundEnding,
  type LeadSearchDto,
  type LeadSearchPlan,
  type LeadSearchVia,
  type LeadStage,
  type PersonLeadDto,
  recordOrEmpty,
  DbFailure,
} from "@chanlytics/contracts";
import { emitEvent } from "@chanlytics/db/events";
import { asJson } from "@chanlytics/db/shared";
import type { Json } from "@chanlytics/db/types";
import {
  countKeptMembers,
  findLeadScope,
  findNewestLeadOfPerson,
  findSearchCard,
  findSearchScope,
  listLeadCardsLive,
  listSearchCards,
  readLeadListCounts,
  removeLeadSearch,
  renameLeadSearch,
  undoLeadSearchRemoval,
} from "@chanlytics/db/leads";
import { answerOf, refusalOf } from "./answers";
import { findLeadTimeline } from "../campaigns/reach-out-leads";
import { requireUuid } from "../shared/request-guards";
import { serviceDb } from "../shared/service-db";
import { type Params, row } from "../shared/route";
import type { RouteContext } from "../shared/with-route";
import type { TenantId, ContactId } from "@chanlytics/contracts";

export interface SearchViewRow {
  id: string;
  tenant_id: TenantId;
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
  /** 00459: the sequence this search's Add goes to, or null. */
  adds_to?: string | null;
  /** 00496: whether this search is a sequence's own list; absent before it. */
  sequence_list?: boolean | null;
}

/** The round's nearby areas as the view returns them: only rows shaped as an area are handed on. */
function nearbyOf(value: unknown): LeadArea[] {
  if (!Array.isArray(value)) return [];
  return value.filter((first): first is LeadArea => {
    const leadArea = first as Partial<LeadArea> | null;
    return (
      !!leadArea &&
      typeof leadArea === "object" &&
      typeof leadArea.label === "string" &&
      typeof leadArea.radius_m === "number" &&
      typeof leadArea.query === "string" &&
      (leadArea.kind === "zip" || leadArea.kind === "city" || leadArea.kind === "radius") &&
      typeof leadArea.state === "string" &&
      (leadArea.center === null ||
        (!!leadArea.center && typeof leadArea.center.lat === "number" && typeof leadArea.center.lng === "number"))
    );
  });
}

/** One search with its latest round, or a 404 in the product's words. */
export async function searchRow(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  id: string,
): Promise<SearchViewRow> {
  const { data, error } = await findSearchCard(ctx.supabase, tenantId, id);
  if (error) throw new DbFailure(error);
  if (!data) throw new AppError("not_found", "This search is not in your workspace.", 404);
  return data as SearchViewRow;
}

/**
 * The plan an answer carries, as the door takes it (lead_round_answer, 00140): the version after the round's, at the
 * count the search's plan reserved. A client may send any version and count; this is the one place that sets them,
 * for the route and for a proposal that amends (server/ask/proposals.ts).
 */
/** A plan as a door takes it: JSON, as a plan is. */
export const planAsJson = (plan: LeadSearchPlan): Json => asJson(plan);

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

/**
 * The plan a new round carries, as the door takes it (lead_search_more): at the search's version or the next. A card
 * counts each change made on it (planVersionOf), so one changed twice is past the next, and to the search it is one.
 */
export function morePlanOf(search: Pick<SearchViewRow, "plan">, plan: LeadSearchPlan): LeadSearchPlan {
  const at = (search.plan as LeadSearchPlan | null)?.version;
  return typeof at === "number" ? { ...plan, version: Math.min(plan.version, at + 1) } : plan;
}

async function listSearches(ctx: Pick<RouteContext, "supabase">, tenantId: TenantId): Promise<SearchViewRow[]> {
  const { data, error } = await listSearchCards(ctx.supabase, tenantId, 200);
  if (error) throw new DbFailure(error);
  return (data ?? []) as SearchViewRow[];
}

/* ------------------------------------------------------ the two row scopes */

/**
 * The lead a verb acts on, read under RLS: one this workspace cannot see is a
 * 404, and the role is judged in the lead's own workspace. An erased lead is
 * gone, not forbidden.
 */
export interface LeadRow {
  id: string;
  tenant_id: TenantId;
  business_name: string;
  email: string | null;
  email_state: LeadEmailState;
  stage: LeadStage;
  closed_reason: string | null;
  contact_id: ContactId | null;
  place_id: string;
  erased_at: string | null;
  blanked_at: string | null;
}

async function loadLead(ctx: Pick<RouteContext, "supabase">, id: string): Promise<LeadRow> {
  const leadId = requireUuid(id, "lead");
  const { data, error } = await findLeadScope(ctx.supabase, leadId);
  if (error) throw new DbFailure(error);
  const found = (data ?? null) as LeadRow | null;
  if (!found || found.erased_at) throw new AppError("not_found", "That lead is not in your workspace.", 404);
  return found;
}

export const leadScope = row((ctx: RouteContext, params: Params) => loadLead(ctx, String(params.id ?? "")));

interface LeadSearchScopeRow {
  id: string;
  tenant_id: TenantId;
  name: string;
  plan: unknown;
  removed_at: string | null;
}

async function loadLeadSearch(ctx: Pick<RouteContext, "supabase">, id: string): Promise<LeadSearchScopeRow> {
  const searchId = requireUuid(id, "search");
  const { data, error } = await findSearchScope(ctx.supabase, searchId);
  if (error) throw new DbFailure(error);
  if (!data) throw new AppError("not_found", "This search is not in your workspace.", 404);
  return data;
}

export const leadSearchScope = row((ctx: RouteContext, params: Params) => loadLeadSearch(ctx, String(params.id ?? "")));

/* ------------------------------------------------- what the owner reads -- */

/** The rail's six numbers (lead_list_counts), or zeroes when the workspace has none. */
export async function listSearchCounts(ctx: Pick<RouteContext, "supabase">, tenantId: TenantId): Promise<LeadCounts> {
  const { data, error } = await readLeadListCounts(ctx.supabase, tenantId);
  if (error) throw new DbFailure(error, "lead_list_counts");
  const leadCounts = recordOrEmpty(data);
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    all: n(leadCounts.all),
    ready: n(leadCounts.ready),
    nurture: n(leadCounts.nurture),
    converted: n(leadCounts.converted),
    said_no: n(leadCounts.said_no),
    not_a_fit: n(leadCounts.not_a_fit),
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
 * reader for Ask (leads.searches says it; a proposal that amends answers it); the DTO reads the question in
 * every state, for the page.
 */
export const waitingQuestionOf = (searchView: Pick<SearchViewRow, "state" | "question">): string | null =>
  searchView.state === "waiting_on_owner" &&
  searchView.question &&
  typeof searchView.question === "object" &&
  typeof (searchView.question as { sentence?: unknown }).sentence === "string"
    ? (searchView.question as { sentence: string }).sentence
    : null;

/**
 * One search as the Leads page holds it (GET lead-searches maps each row through this), and as Ask says one it read by
 * its id. `asked_on` is the view's own created_at: the day the owner asked, said once.
 */
export function toSearchDto(searchView: SearchViewRow): LeadSearchDto {
  // A people search's plan is the people card's (00430), never read as a places one.
  const people = peoplePlanOf(searchView.plan);
  const plans = { plan: people ? null : (searchView.plan as LeadSearchPlan), people };
  const question =
    searchView.question && typeof searchView.question === "object"
      ? (searchView.question as { sentence?: unknown; criterionKey?: unknown; criterion_key?: unknown })
      : null;
  if (!searchView.round_id)
    return {
      id: searchView.id,
      name: searchView.name,
      asked: searchView.asked,
      asked_on: searchView.created_at,
      via: searchView.via as LeadSearchVia,
      ...plans,
      plan_version: searchView.plan_version ?? 1,
      thread_id: searchView.thread_id ?? null,
      adds_to: searchView.adds_to ?? null,
      sequence_list: searchView.sequence_list ?? false,
      round: null,
    };
  return {
    id: searchView.id,
    name: searchView.name,
    asked: searchView.asked,
    asked_on: searchView.created_at,
    // A list of your own (00242) says so: the page draws its own strip and offers nothing that searches it again.
    via: searchView.via as LeadSearchVia,
    ...plans,
    plan_version: searchView.plan_version ?? 1,
    thread_id: searchView.thread_id ?? null,
    adds_to: searchView.adds_to ?? null,
    sequence_list: searchView.sequence_list ?? false,
    round: {
      id: searchView.round_id,
      seq: searchView.seq ?? 1,
      purpose: searchView.purpose ?? "probe",
      state: searchView.state ?? "ended",
      ending: (searchView.ending ?? null) as LeadRoundEnding | null,
      question:
        question && typeof question.sentence === "string"
          ? { sentence: question.sentence, criterion_key: questionKeyOf(question) }
          : null,
      target: searchView.target ?? 0,
      counted: searchView.counted,
      qualified: searchView.qualified,
      review: searchView.review,
      excluded: searchView.excluded,
      emails_checked: searchView.emails_checked,
      with_phone: searchView.with_phone,
      // The view stores the ending a stopping round WILL take; a screen only
      // needs to know one is pending, which is what tells Stopping from
      // Checking (S12).
      ending_pending: searchView.ending_pending !== null,
      waiting_since: searchView.waiting_since,
      cost_usd: searchView.cost_usd,
      ended_at: searchView.ended_at,
      undo_op_id: searchView.undo_op_id,
      undo_version: searchView.undo_version,
      nearby: nearbyOf(searchView.nearby),
      fits: { strong: searchView.strong ?? 0, look: searchView.look ?? 0, long: searchView.long ?? 0 },
    },
  };
}

/** Every kept search with its latest round, and the rail's counts: one read of each. */
export async function getSearches(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
): Promise<{ searches: LeadSearchDto[]; counts: LeadCounts; cards_live: string[] }> {
  const [rows, counts, live] = await Promise.all([
    listSearches(ctx, tenantId),
    listSearchCounts(ctx, tenantId),
    // Which cards find leads now (00430): what the rail, the first day and Ask may offer. Unread, the Maps card alone.
    listLeadCardsLive(ctx.supabase).catch(() => ["local_businesses"]),
  ]);
  return { searches: rows.map(toSearchDto), counts, cards_live: live };
}

/* --------------------------------------------------------- a search, kept */

export async function renameSearch(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  leadSearchScope: LeadSearchScopeRow,
  name: string,
): Promise<{ name: string }> {
  const { data, error } = await renameLeadSearch(ctx.supabase, leadSearchScope.id, name);
  if (error) throw new DbFailure(error, "lead_search_rename");
  const answer = answerOf(data);
  const refused = refusalOf(answer);
  if (refused) throw refused;
  const now = answer.name ?? name;
  await emitEvent(serviceDb(), leadSearchScope.tenant_id, "lead.search_renamed", "lead_search", leadSearchScope.id, {
    name: now,
    by: ctx.userId,
  });
  return { name: now };
}

/**
 * Removing a search keeps the leads being worked (00140). What is left
 * unblanked afterwards IS what was kept, so the toast's number is the
 * database's and never the page's guess.
 */
export async function removeSearch(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  leadSearchScope: LeadSearchScopeRow,
): Promise<{ archived: number; kept: number; toast: string }> {
  const { data, error } = await removeLeadSearch(ctx.supabase, leadSearchScope.id);
  if (error) throw new DbFailure(error, "lead_search_remove");
  const answer = answerOf(data);
  const refused = refusalOf(answer);
  if (refused) throw refused;
  const { count, error: kept } = await countKeptMembers(ctx.supabase, leadSearchScope.id);
  if (kept) throw new Error(kept.message);
  const keptN = count ?? 0;
  // A search and the leads nobody worked are gone on a member's word: the ledger says whose, and what was kept.
  await emitEvent(serviceDb(), leadSearchScope.tenant_id, "lead.search_removed", "lead_search", leadSearchScope.id, {
    name: leadSearchScope.name,
    kept: keptN,
    archived: answer.blanked ?? 0,
    by: ctx.userId,
  });
  return {
    archived: answer.blanked ?? 0,
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
  leadSearchScope: LeadSearchScopeRow,
): Promise<{ removed: number; credited: number; op_id: string | null; version: number; toast: string }> {
  const { data, error } = await undoLeadSearchRemoval(ctx.supabase, leadSearchScope.id);
  if (error) throw new DbFailure(error, "lead_search_undo");
  const answer = answerOf(data);
  const refused = refusalOf(answer);
  if (refused) throw refused;
  const removed = answer.removed ?? 0;
  const credited = answer.credited ?? 0;
  return {
    removed,
    credited,
    op_id: answer.op_id ?? null,
    version: answer.version ?? 1,
    toast:
      removed === 0
        ? "Nothing to take back: every lead here has been worked."
        : `Took back ${removed} lead${removed === 1 ? "" : "s"}. ${credited} went back to this month's leads.`,
  };
}

/**
 * The lead a person was found as, the newest when two places held their number; null when they were never one. A
 * converted lead's page links to its person; this is the way back. It carries what a reach-out wrote to the lead and
 * what came back (Reach out Part 6, H11): the story its peek reads, which a failed read leaves out rather than fail
 * the page.
 */
export async function findLeadOfPerson(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  contactId: ContactId,
): Promise<PersonLeadDto | null> {
  const { data, error } = await findNewestLeadOfPerson(ctx.supabase, tenantId, contactId);
  if (error) throw new DbFailure(error);
  if (!data) return null;
  const reach = await findLeadTimeline(ctx, tenantId, data.id).catch(() => null);
  return { id: data.id, business_name: data.business_name, found_at: data.found_at, reach_out: reach };
}
