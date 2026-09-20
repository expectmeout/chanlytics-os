/**
 * The lead finder's routes share these: the door's answer read once, its
 * refusals said in sentences, the estimate the route computes for the door to
 * store (00140's create and more take p_estimate_usd), and the search's latest
 * round from lead_searches_view.
 */
import {
  AppError,
  LEAD_ASSUMED_YIELD, LEAD_CHECK_KEYS, LEAD_DRAFT_JSON_SCHEMA, LEAD_EMAIL_WORDS, LEAD_MONTHLY_ALLOWANCE, LEAD_MONTHLY_BUDGET_USD, LEAD_NO_ADDRESS, LEAD_PROBE_PLACES,
  LEAD_STAGE_WORDS, LEAD_SUGGEST_DAYS, LEAD_SUGGEST_JSON_SCHEMA, LEAD_SUGGEST_UNAVAILABLE,
  LeadDraftAnswerSchema, LeadSuggestAnswerSchema,
  clockDate, estimateRoundUsd, leadDraftFooter, leadMonth, leadReachLine, parseTenantConfig, placesToAsk, siteHost, stageArgs, wallClockAt,
  type LeadArea, type LeadCheck, type LeadCheckKey, type LeadClass, type LeadCounts, type LeadEmailState, type LeadNichePrior, type LeadPlanFacts,
  type LeadRoundEnding, type LeadRoundPurpose, type LeadRowDto, type LeadSearchDto, type LeadSearchPlan, type LeadStage, type LeadStageInput,
  type LeadSuggestionsDto, type LeadsBulkInput, type LeadsCheckAgainInput, type LeadsQuery,
} from "@chanlytics/contracts";
import type { Database, Json } from "@chanlytics/db";
import type { RouteContext } from "./with-route";
import { row, type Params } from "./route";
import { requireUuid } from "./request-guards";
import { recordDecision } from "./verbs";
import { saveLeadSuggestions } from "./service";
import { tenantFacts } from "./tenant";
import { askForJson } from "./model-json";
import { attachment, csvCell, dateTag, safeName } from "./export";

export interface DoorAnswer {
  error?: string;
  /** lead_set_stage: what the lead is now, and whether this act made a person. */
  stage?: string;
  closed_reason?: string | null;
  contact_id?: string | null;
  existed?: boolean;
  converted?: boolean;
  /** lead_bulk: how many leads the act reached. lead_search_remove: how many memberships it blanked. */
  done?: number;
  /** lead_bulk keep/exclude: how many of the named leads were not in Needs review. lead_check_again: how many were not asked. */
  skipped?: number;
  /** lead_check_again: how many addresses are being checked again. */
  scheduled?: number;
  blanked?: number;
  /** lead_search_undo: how many left the search, and how many went back to a month. */
  removed?: number;
  credited?: number;
  /** lead_erase: final, and answered again rather than re-executed. */
  erased?: boolean;
  already?: boolean;
  /** lead_search_rename: the name as the door cleaned it. */
  name?: string;
  /** The door's own sentence for its refusal (00140): said as it is when present. */
  sentence?: string;
  state?: string;
  /** A member door's own word for "not in that state": the class the member is in now (lead_member_move). */
  class?: string;
  left?: number;
  left_usd?: number;
  counted?: number;
  search_id?: string;
  round_id?: string;
  op_id?: string;
  version?: number;
}

/**
 * One door's arguments, with null where the owner named nothing.
 *
 * `database.types.ts` spells an argument that has a SQL default as OPTIONAL
 * (`p_class?: string`) and never as nullable, because the generator cannot see
 * that the default IS null. PostgREST sends an omitted argument and an
 * explicit null the same way, and 00142's own bodies read null as "not given"
 * (`coalesce(p_class, 'qualified')`). Naming the whole list in one object is
 * what makes a route's arguments readable in one place -- and assertable in
 * one deepEqual -- so this narrows that one difference, and nothing else: the
 * door's NAME and every argument's own type stay checked.
 */
type DoorArgs<K extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][K]["Args"];

/** The jsonb a door answers, as an object; anything else is an empty answer. */
export function answerOf(data: unknown): DoorAnswer {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as DoorAnswer) : {};
}

/** What a member's class is called on the screen, for the sentence a member door's `state` refusal says. */
const MEMBER_NOW: Record<string, string> = { qualified: "already counted", review: "in Needs review", excluded: "left out" };

/** A door's refusal, in a sentence the owner can act on; null when the door did not refuse. */
export function refusalOf(a: DoorAnswer): AppError | null {
  if (a.error && a.sentence) return new AppError("conflict", a.sentence, 409);
  switch (a.error) {
    case undefined:
      return null;
    case "state":
      // Two doors say `state`. A round says which state it is in; a member
      // door says which class the place is in now (lead_member_move), and
      // "this search is not waiting for an answer" is not what happened to it.
      return typeof a.class === "string"
        ? new AppError("conflict", `This place is ${MEMBER_NOW[a.class] ?? a.class} now. Reload and try again.`, 409)
        : new AppError("conflict", "This search is not waiting for an answer.", 409);
    case "no_card":
      return new AppError("conflict", a.sentence ?? "I can find local businesses for now.", 409);
    case "paused":
      return new AppError("conflict", "Searching is paused for now. Nothing was started.", 409);
    case "month_leads_used":
      return new AppError("conflict", a.left && a.left > 0 ? `This month covers ${a.left} more leads. Ask for ${a.left} or fewer, or wait for next month.` : "This month's leads are used up. Nothing more counts until next month.", 409);
    case "budget_used":
      return new AppError("conflict", "This month's searching budget is used. A smaller search, or a phone standard, may still fit.", 409);
    case "day_cap":
      return new AppError("conflict", "Today's searching is at its cap. Try again tomorrow.", 409);
    case "hidden":
      return new AppError("conflict", "This place is hidden: it is already a customer, or was erased.", 409);
    case "out_of_area":
      return new AppError("conflict", "This place is outside the area the search covers.", 409);
    case "changed":
      return new AppError("conflict", "Someone changed this since you saw it. Reload and try again.", 409);
    case "not_found":
      return new AppError("not_found", "That place is not in this search.", 404);
    case "removed":
      return new AppError("conflict", "This search was removed, so nothing more counts against it.", 409);
    case "live":
      return new AppError("conflict", "This search is still running. Let it finish, then ask for more.", 409);
    case "running":
      // The Done strip's Undo, asked of a round that has not finished: a
      // different act from "ask for more", so a sentence of its own.
      return new AppError("conflict", "This search is still running, so there is nothing to take back yet.", 409);
    case "too_late":
      return new AppError("conflict", "That was more than a day ago, so these leads stay yours and stay counted.", 409);
    case "nothing_to_add":
      return new AppError("conflict", a.counted ? `This search already found the ${a.counted} you asked for. Ask for more than that to add any.` : "This search already found what you asked for.", 409);
    case "undone":
      return new AppError("conflict", "That change was already undone.", 409);
    case "kind":
      return new AppError("conflict", "That change cannot be undone.", 409);
    default:
      // A door said something this build has no sentence for. The owner gets
      // one plain sentence rather than a de-underscored word out of the
      // database; the code goes to the log, where it can be looked up.
      console.warn("lead_door_refusal_unknown", JSON.stringify({ error: String(a.error).slice(0, 80) }));
      return new AppError("conflict", "Something about this search stopped that from going through. Reload and try again.", 409);
  }
}

/** The yield assumed before a probe has measured one: half the places qualify (contracts' LEAD_ASSUMED_YIELD, which the plan card's minutes read too). */
export const ASSUMED_YIELD = LEAD_ASSUMED_YIELD;

/**
 * What a round is expected to cost, from the card's brief prices: the probe and
 * its main phase for a first round, the main phase alone after. A top-up runs
 * to the count minus what already counted (00140's lead_search_more sets that
 * as its target), so that is what it is priced for -- pricing the whole count
 * reserves money the round will never be allowed to spend.
 */
export function estimateForRound(plan: LeadSearchPlan, purpose: LeadRoundPurpose, counted = 0): number {
  const wanted = purpose === "topup" ? Math.max(1, plan.count - counted) : plan.count;
  const main = estimateRoundUsd(plan, "main", placesToAsk(plan, wanted, ASSUMED_YIELD).total);
  if (purpose !== "probe") return Math.round(main * 100) / 100;
  return Math.round((estimateRoundUsd(plan, "probe", LEAD_PROBE_PLACES) + main) * 100) / 100;
}

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
}

/** One search with its latest round, or a 404 in the product's words. */
export async function searchRow(ctx: Pick<RouteContext, "supabase">, tenantId: string, id: string): Promise<SearchViewRow> {
  const { data, error } = await ctx.supabase.from("lead_searches_view").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AppError("not_found", "This search is not in your workspace.", 404);
  return data as unknown as SearchViewRow;
}

export async function listSearches(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<SearchViewRow[]> {
  const { data, error } = await ctx.supabase.from("lead_searches_view").select("*").eq("tenant_id", tenantId).is("removed_at", null).order("created_at", { ascending: false }).limit(200);
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
const LEAD_SCOPE_COLUMNS = "id, tenant_id, business_name, email, email_state, stage, closed_reason, contact_id, place_id, erased_at, blanked_at";

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
  const { data, error } = await ctx.supabase.from("lead_searches").select("id, tenant_id, name, plan, removed_at").eq("id", searchId).maybeSingle();
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
  return { all: n(c.all), ready: n(c.ready), nurture: n(c.nurture), converted: n(c.converted), said_no: n(c.said_no), not_a_fit: n(c.not_a_fit) };
}

/** `asked_on` is the view's own created_at: the day the owner asked, said once. */
function toSearchDto(r: SearchViewRow): LeadSearchDto {
  const q = r.question && typeof r.question === "object" ? (r.question as { sentence?: unknown; criterion_key?: unknown }) : null;
  if (!r.round_id) return { id: r.id, name: r.name, asked: r.asked, asked_on: r.created_at, plan: r.plan as LeadSearchPlan, plan_version: r.plan_version ?? 1, round: null };
  return {
    id: r.id,
    name: r.name,
    asked: r.asked,
    asked_on: r.created_at,
    plan: r.plan as LeadSearchPlan,
    plan_version: r.plan_version ?? 1,
    round: {
      id: r.round_id,
      seq: r.seq ?? 1,
      purpose: r.purpose ?? "probe",
      state: r.state ?? "ended",
      ending: (r.ending ?? null) as LeadRoundEnding | null,
      question: q && typeof q.sentence === "string" ? { sentence: q.sentence, criterion_key: typeof q.criterion_key === "string" ? q.criterion_key : "" } : null,
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
    },
  };
}

/** Every kept search with its latest round, and the rail's counts: one read of each. */
export async function searchesOf(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<{ searches: LeadSearchDto[]; counts: LeadCounts }> {
  const [rows, counts] = await Promise.all([listSearches(ctx, tenantId), listCounts(ctx, tenantId)]);
  return { searches: rows.map(toSearchDto), counts };
}

/* --------------------------------------------------------- a page of rows */

/** One row as `leads_page` answers it: the member and its lead, flat. */
interface LeadPageRow {
  member_id: string; lead_id: string; place_id: string; search_id: string; class: string; excluded_by: string | null;
  fit: string | null; reason: string | null; distance_m: number | null; counted: boolean; judgment: unknown;
  business_name: string; category: string | null; street: string | null; city: string | null; region: string | null; postal_code: string | null;
  website_host: string | null; instagram_url: string | null; phone_e164: string | null; phone_sources: number | null; phone_wrong: boolean;
  email: string | null; email_alternates: unknown; email_state: string; email_checked_at: string | null;
  rating: number | null; reviews: number | null; stage: string; closed_reason: string | null; last_outcome: string | null; last_note: string | null;
  about: string | null; hours: unknown; image_url: string | null; price: string | null; reviews_dist: unknown;
  facebook_url: string | null; linkedin_url: string | null; tiktok_url: string | null; claimed: boolean | null; maps_url: string | null; rank: number | null;
  contact_id: string | null; contacted_at: string | null; converted_at: string | null; exported_at: string | null; found_at: string;
  places: number; version: number; page_key: string;
}

/** What the judge answered for each criterion of this place, by the plan's own key. */
/**
 * The reason tokens contracts' classify wrote on the membership; [] when the judgment carries none. The email token
 * was written while the address was still to be checked (email:checking); the lead's own email_state is what is true
 * of it now, so the token says that -- unknown for a mail server that did not answer, ok for one that did after the
 * member stayed in review, none for a lead with no address.
 */
function reasonsOf(judgment: unknown, emailState: string): string[] {
  const j = judgment && typeof judgment === "object" ? (judgment as { reasons?: unknown }) : null;
  const raw = Array.isArray(j?.reasons) ? j.reasons.filter((x): x is string => typeof x === "string") : [];
  return raw.map((x) => (x.startsWith("email:") ? `email:${emailState}` : x));
}
function judgedBy(judgment: unknown): Map<string, { answer: "yes" | "no" | "unknown"; reason: string | null }> {
  const out = new Map<string, { answer: "yes" | "no" | "unknown"; reason: string | null }>();
  const j = judgment && typeof judgment === "object" ? (judgment as { answer?: { criteria?: unknown; reason?: unknown } | null }) : null;
  const answer = j?.answer && typeof j.answer === "object" ? j.answer : null;
  const criteria = Array.isArray(answer?.criteria) ? (answer.criteria as { key?: unknown; answer?: unknown }[]) : [];
  const reason = typeof answer?.reason === "string" ? answer.reason : null;
  for (const c of criteria) {
    if (typeof c.key !== "string") continue;
    out.set(c.key, { answer: c.answer === "pass" ? "yes" : c.answer === "fail" ? "no" : "unknown", reason });
  }
  return out;
}

/** The four checks the card SAW: never a word the check did not measure (S12). */
const SEEN_CHECKS = new Set<LeadCheckKey>(["on_maps", "in_area", "phone_two_sources", "mailbox"]);

/**
 * The checks behind a lead (§0.1): what was seen in the listing and the
 * mailbox, and what Claude read. A check is listed only where there is
 * something to say about it -- a read check appears when the plan asked for it
 * under that name -- so the peek never claims a thing nobody asked was judged.
 * Nothing here names whoever fetched the listing.
 */
function checksOf(r: LeadPageRow): LeadCheck[] {
  const out: LeadCheck[] = [];
  const where = [r.city, r.region].filter(Boolean).join(", ");
  out.push({ key: "on_maps", how: "seen", answer: "yes", source: "Google Maps", reason: null });
  out.push({ key: "in_area", how: "seen", answer: r.distance_m === null ? "unknown" : "yes", source: "Google Maps · the plan", reason: where || null });
  if (r.phone_e164) out.push({ key: "phone_two_sources", how: "seen", answer: (r.phone_sources ?? 1) >= 2 ? "yes" : "unknown", source: "Maps · website", reason: null });
  const state = r.email_state as LeadEmailState;
  if (state !== "none" || r.email) {
    out.push({ key: "mailbox", how: "seen", answer: state === "ok" ? "yes" : state === "invalid" ? "no" : "unknown", source: "Mailbox check", reason: null });
  }
  const judged = judgedBy(r.judgment);
  for (const key of LEAD_CHECK_KEYS) {
    if (SEEN_CHECKS.has(key)) continue;
    const read = judged.get(key);
    if (read) out.push({ key, how: "read", answer: read.answer, source: "Claude · the listing", reason: read.reason });
  }
  return out;
}

function toLeadRowDto(r: LeadPageRow, searchNames: Map<string, string>): LeadRowDto {
  const others = Array.isArray(r.email_alternates) ? (r.email_alternates as { email?: unknown; why?: unknown }[]) : [];
  return {
    id: r.lead_id,
    search_id: r.search_id,
    place_id: r.place_id,
    business_name: r.business_name,
    category: r.category,
    city: r.city,
    state: r.region,
    street: r.street,
    postal_code: r.postal_code,
    search_name: searchNames.get(r.search_id) ?? null,
    phone: r.phone_e164,
    // Two sources agreed on the number: the listing and the business's own site.
    phone_agrees: (r.phone_sources ?? 1) >= 2,
    phone_wrong: r.phone_wrong,
    email: r.email,
    email_state: r.email_state as LeadEmailState,
    email_checked_at: r.email_checked_at,
    website: r.website_host,
    instagram: r.instagram_url,
    rating: r.rating,
    reviews: r.reviews,
    // What the listing shows about the business (D2), as leads_page returns it; jsonb arrives as it was stored.
    about: r.about ?? null,
    hours: Array.isArray(r.hours) ? (r.hours as { day: string; hours: string }[]) : [],
    image_url: r.image_url ?? null,
    price: r.price ?? null,
    reviews_dist: r.reviews_dist && typeof r.reviews_dist === "object" ? (r.reviews_dist as LeadRowDto["reviews_dist"]) : null,
    facebook_url: r.facebook_url ?? null,
    linkedin_url: r.linkedin_url ?? null,
    tiktok_url: r.tiktok_url ?? null,
    claimed: r.claimed ?? null,
    maps_url: r.maps_url ?? null,
    rank: r.rank ?? null,
    stage: r.stage as LeadStage,
    closed_reason: r.closed_reason,
    contact_id: r.contact_id,
    last_outcome: r.last_outcome,
    last_note: r.last_note,
    contacted_at: r.contacted_at,
    converted_at: r.converted_at,
    places: r.places,
    found_at: r.found_at,
    exported_at: r.exported_at,
    version: r.version,
    member: {
      class: r.class as LeadClass,
      fit: (r.fit ?? null) as LeadRowDto["member"]["fit"],
      reason: r.reason ?? "",
      excluded_by: r.excluded_by,
      distance_m: r.distance_m,
      counted: r.counted,
      checks: checksOf(r),
      // The class rule's own reason tokens (email:unknown, unknown:<key>, inferred:<key>, out_of_area ...): what the
      // Needs review queue groups by (D3, contracts leadReviewGroups). Never words; the page spells them.
      reasons: reasonsOf(r.judgment, r.email_state),
      other_emails: others.filter((e) => typeof e.email === "string").map((e) => ({ email: String(e.email), why: typeof e.why === "string" ? e.why : "another address" })),
    },
  };
}

/** The searches' names, for the row that says which search found it: one read, whatever the page holds. */
async function searchNamesOf(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<Map<string, string>> {
  const { data, error } = await ctx.supabase.from("lead_searches").select("id, name").eq("tenant_id", tenantId).limit(200);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
}

export interface LeadsPageAnswer {
  rows: LeadRowDto[];
  /** The last row's place in the order, for the next page; null when this was the end. */
  next: { key: string; id: string } | null;
  counts?: LeadCounts;
}

/**
 * A page of the view, as the database ordered it (leads_page): the list, the
 * class, the sort and the direction are all SQL, so the next page carries on
 * from the key the database answered rather than from a count of rows read.
 */
export async function leadsPage(ctx: Pick<RouteContext, "supabase">, tenantId: string, q: LeadsQuery): Promise<LeadsPageAnswer> {
  const first = !q.after_key && !q.after_id;
  const [answer, names, counts] = await Promise.all([
    ctx.supabase.rpc("leads_page", {
      p_tenant_id: tenantId,
      p_search_id: q.search ?? null,
      p_class: q.class ?? null,
      p_sort: q.sort,
      p_after_key: q.after_key ?? null,
      p_limit: q.limit,
      p_list: q.list,
      p_dir: q.dir,
      p_after_id: q.after_id ?? null,
    } as DoorArgs<"leads_page">),
    searchNamesOf(ctx, tenantId),
    first ? listCounts(ctx, tenantId) : Promise.resolve(null),
  ]);
  if (answer.error) throw new Error(`leads_page: ${answer.error.message}`);
  const raw = (Array.isArray(answer.data) ? answer.data : []) as unknown as LeadPageRow[];
  const last = raw[raw.length - 1];
  return {
    rows: raw.map((r) => toLeadRowDto(r, names)),
    next: last && raw.length >= q.limit ? { key: last.page_key, id: last.member_id } : null,
    ...(counts ? { counts } : {}),
  };
}

/* ----------------------------------------------------- what the plan says */

/** The month after this one, as the owner reads it: "Oct 1". */
function renewsOnOf(tz: string, now: Date): string {
  const [y, m] = leadMonth(tz, now).split("-").map(Number);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const at = wallClockAt(tz, `${next.y}-${String(next.m).padStart(2, "0")}-01`, 12, 0);
  return clockDate(at, tz, now.getTime());
}

/** One counter's room, out of the month's whole. Never below zero: a reservation may sit above the cap for a moment. */
/**
 * What the month's two ceilings have already taken -- used and reserved
 * together, leads for the one and US dollars for the other -- through the door
 * 00143 opened. This is read as the MEMBER, and lead_counters is the engine's
 * own table with no member policy and select revoked from authenticated
 * (00140), so reading it directly raised for every owner and took the plan
 * card down with it; 00143's header records what that cost.
 *
 * `numeric` arrives from PostgREST as a string, so the budget is coerced.
 */
async function monthUsed(ctx: Pick<RouteContext, "supabase">, tenantId: string, period: string): Promise<{ allowance: number; budget: number }> {
  const { data, error } = await ctx.supabase.rpc("lead_month_used", { p_tenant_id: tenantId, p_period: period });
  if (error) throw new Error(`lead_month_used: ${error.message}`);
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0);
  const taken = (kind: "allowance" | "budget") => {
    const c = data && typeof data === "object" ? (data as Record<string, { used?: unknown; reserved?: unknown } | undefined>)[kind] : null;
    return n(c?.used) + n(c?.reserved);
  };
  return { allowance: taken("allowance"), budget: taken("budget") };
}

/** The platform-wide prior for a kind of business, or null when nobody has searched for one. */
export async function nichePrior(ctx: Pick<RouteContext, "supabase">, categoryKey: string): Promise<LeadNichePrior | null> {
  const { data, error } = await ctx.supabase.rpc("lead_niche_prior", { p_category_key: categoryKey });
  if (error) throw new Error(`lead_niche_prior: ${error.message}`);
  const p = data && typeof data === "object" ? (data as Partial<LeadNichePrior>) : null;
  return p && typeof p.places === "number" ? { places: p.places, matched: p.matched ?? 0, with_email: p.with_email ?? 0 } : null;
}

/**
 * What the plan card is given beside the plan (§8.3): what a search would
 * skip, what is left this month, and what past searches for this kind of
 * business measured. Release A ships none of this -- it has `lead_niche_prior`,
 * `lead_searches_on` and the counters -- so this is the one place that reads
 * them into the card's own shape.
 */
export async function planFacts(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  opts: { categoryKey?: string | null; nearby?: LeadArea[]; cannotSee?: LeadPlanFacts["cannotSee"]; now?: Date } = {},
): Promise<LeadPlanFacts> {
  // The month, and the day it renews, are the BUSINESS's (lead_month): a turn
  // that carries its own moment hands it in rather than reading the server's.
  const now = opts.now ?? new Date();
  const { timezone } = await tenantFacts(ctx.supabase, tenantId);
  const month = leadMonth(timezone, now);
  const [counts, used, prior] = await Promise.all([
    listCounts(ctx, tenantId),
    monthUsed(ctx, tenantId, month),
    opts.categoryKey ? nichePrior(ctx, opts.categoryKey) : Promise.resolve(null),
  ]);
  // The whole of each ceiling is contracts', never the database's: one
  // derivation per fact, so the number a person reads is spelled once.
  const leadsLeft = Math.max(0, LEAD_MONTHLY_ALLOWANCE - used.allowance);
  const budgetLeftUsd = Math.max(0, LEAD_MONTHLY_BUDGET_USD - used.budget);
  // Which of the month's two ceilings this workspace is nearer, as a share of
  // each month's whole: the card says "you have N leads left" for the one and
  // names the budget for the other. Neither touched binds nothing.
  const usedLeads = LEAD_MONTHLY_ALLOWANCE - leadsLeft;
  const usedUsd = LEAD_MONTHLY_BUDGET_USD - budgetLeftUsd;
  // The word is A's own counter kind (LEAD_COUNTER_KINDS: allowance | budget |
  // day), so the card, the door and the ledger all call the month's leads the
  // same thing.
  const bound: LeadPlanFacts["bound"] =
    usedLeads === 0 && usedUsd === 0 ? null : leadsLeft / LEAD_MONTHLY_ALLOWANCE <= budgetLeftUsd / LEAD_MONTHLY_BUDGET_USD ? "allowance" : "budget";
  return {
    // Every lead this workspace already owns is one a new search skips: the
    // place is already theirs, so it is never counted or charged twice.
    dupes: counts.all,
    leadsLeft,
    bound,
    prior,
    priorOf: prior ? opts.categoryKey ?? null : null,
    cannotSee: opts.cannotSee ?? null,
    renewsOn: renewsOnOf(timezone, now),
    nearby: opts.nearby ?? [],
  };
}

/* --------------------------------------------------------- a search, kept */

export async function renameSearch(ctx: Pick<RouteContext, "supabase">, s: LeadSearchScopeRow, name: string): Promise<{ name: string }> {
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
export async function removeSearch(ctx: Pick<RouteContext, "supabase">, s: LeadSearchScopeRow): Promise<{ archived: number; kept: number; toast: string }> {
  const { data, error } = await ctx.supabase.rpc("lead_search_remove", { p_search_id: s.id });
  if (error) throw new Error(`lead_search_remove: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  const { count, error: kept } = await ctx.supabase.from("lead_search_members").select("lead_id", { count: "exact", head: true }).eq("search_id", s.id).is("blanked_at", null);
  if (kept) throw new Error(kept.message);
  const keptN = count ?? 0;
  return { archived: a.blanked ?? 0, kept: keptN, toast: `Removed. The ${keptN} you contacted or are talking to are kept.` };
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

/* ------------------------------------------------------- one lead, worked */

/** What the owner reads after an act on one lead. The door decides what happened; this says it. */
function stageToast(input: LeadStageInput, a: DoorAnswer, name: string): string {
  if (a.converted) return `${name} is in People now, with this call on their page.`;
  switch (input.kind) {
    case "outcome":
      return input.outcome === "wrong_number" ? "That number is marked wrong." : input.outcome === "not_interested" ? "Marked as said no." : "Marked contacted.";
    case "stage":
      // A click to Talking marks Talking and nothing else: they join People on
      // a real conversation, never on a click (§9.6).
      return input.stage === "converted"
        ? "Marked talking. They join People when they write or call in, or when a call goes well."
        : input.stage === "nurture"
          ? "Marked contacted."
          : "Back in Ready.";
    case "emailed":
      return "Marked contacted.";
    case "said_no":
      return "Marked as said no.";
    case "not_a_fit":
      return input.why === "customer" ? "Hidden from every future search." : "Not a fit.";
  }
}

export interface StageAnswer {
  stage: string;
  closed_reason: string | null;
  contact_id: string | null;
  existed: boolean;
  converted: boolean;
  op_id: string | null;
  version: number;
  toast: string;
  /** Null when this act made a person: a person made is not undone from a toast (§9.6). */
  undo: { op_id: string; version: number } | null;
}

/** The one door for a stage, a call's outcome, "Did you send it?" and Not a fit. */
export async function setStage(ctx: Pick<RouteContext, "supabase">, lead: LeadRow, input: LeadStageInput): Promise<StageAnswer> {
  const { data, error } = await ctx.supabase.rpc("lead_set_stage", { p_lead_id: lead.id, ...stageArgs(input) } as DoorArgs<"lead_set_stage">);
  if (error) throw new Error(`lead_set_stage: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  const converted = a.converted === true;
  return {
    stage: a.stage ?? lead.stage,
    closed_reason: a.closed_reason ?? null,
    contact_id: a.contact_id ?? null,
    existed: a.existed === true,
    converted,
    op_id: a.op_id ?? null,
    version: a.version ?? 0,
    toast: stageToast(input, a, lead.business_name),
    undo: converted || !a.op_id ? null : { op_id: a.op_id, version: a.version ?? 0 },
  };
}

/** The selected ids, or every lead the view matches ("Select all 1,240 that match"): the door gets one or the other. */
export async function bulkStage(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  input: LeadsBulkInput,
): Promise<{ done: number; op_id: string | null; version: number; toast: string }> {
  const { data, error } = await ctx.supabase.rpc("lead_bulk", {
    p_tenant_id: tenantId,
    p_action: input.action,
    ...(input.by === "ids" ? { p_ids: input.ids, ...(input.search_id ? { p_search_id: input.search_id } : {}) } : { p_ids: null, p_view: input.view as unknown as Json }),
  } as DoorArgs<"lead_bulk">);
  if (error) throw new Error(`lead_bulk: ${error.message}`);
  const a = answerOf(data);
  // Keep over a selection stops when the month's leads run out: what was kept before that stays kept, and the
  // sentence rides the toast instead of refusing an act that half happened. With nothing done it is a refusal.
  const ranOut = a.error === "month_leads_used" && (a.done ?? 0) > 0 ? a.sentence ?? null : null;
  const refused = ranOut ? null : refusalOf(a);
  if (refused) throw refused;
  return { done: a.done ?? 0, op_id: a.op_id ?? null, version: a.version ?? 1, toast: bulkToast(input.action, a.done ?? 0, a.skipped ?? 0, ranOut) };
}

/** What a bulk act says when it is done: the count for the acts that take one, and what stopped or skipped part of it. */
function bulkToast(action: LeadsBulkInput["action"], done: number, skipped: number, ranOut: string | null): string {
  const tail = ranOut ? ` ${ranOut}` : skipped > 0 ? ` ${skipped} ${skipped === 1 ? "was" : "were"} not in Needs review.` : "";
  switch (action) {
    case "contacted": return "Marked contacted.";
    case "not_a_fit": return "Not a fit.";
    case "keep": return `Kept ${done}. ${done === 1 ? "It counts as a lead" : "They count as leads"} this month.${tail}`;
    case "exclude": return `Excluded ${done}. Nothing counted.${tail}`;
  }
}

/**
 * Check again (D3, 00145): the owner asks the mailbox check once more for addresses whose last check did not answer.
 * The door schedules the engine's own check job under each lead's round and says how many it took; none taken is a
 * refusal that says what the act is for, not a success that did nothing.
 */
export async function checkAgain(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  input: LeadsCheckAgainInput,
): Promise<{ scheduled: number; skipped: number; toast: string }> {
  const { data, error } = await ctx.supabase.rpc("lead_check_again", { p_tenant_id: tenantId, p_lead_ids: input.ids } as DoorArgs<"lead_check_again">);
  if (error) throw new Error(`lead_check_again: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  const scheduled = a.scheduled ?? 0;
  const skipped = a.skipped ?? 0;
  if (scheduled === 0) throw new AppError("conflict", "None of these can be checked again. An address is asked again only after its last check did not answer, once its search has finished.", 409);
  const tail = skipped > 0 ? ` ${skipped} ${skipped === 1 ? "was" : "were"} left as ${skipped === 1 ? "it is" : "they are"}: an address is asked again only after its last check did not answer.` : "";
  return { scheduled, skipped, toast: `Checking ${scheduled} again. ${scheduled === 1 ? "Its" : "Their"} answer lands here in a few minutes.${tail}` };
}

/** Erase one lead, for good (§0.4): the door writes the tombstones and blanks it; the ledger row survives what it destroyed. */
export async function eraseLead(ctx: Pick<RouteContext, "supabase" | "userId" | "via" | "undoOf">, lead: LeadRow): Promise<{ erased: true; already: boolean }> {
  const { data, error } = await ctx.supabase.rpc("lead_erase", { p_lead_id: lead.id });
  if (error) throw new Error(`lead_erase: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  const already = a.already === true;
  if (!already) await recordDecision(ctx, lead.tenant_id, "lead", lead.id, "erase", {});
  return { erased: true, already };
}

/* -------------------------------------------------------------- the draft */

/**
 * What Claude is told before it writes one cold email to one business.
 *
 * The rules are the law's and the product's, in that order: a truthful subject
 * from a real sender, one clear ask, and nothing claimed about the business
 * that the facts below do not say. The postal address and the way to say no
 * are NOT Claude's to write -- code adds them (`leadDraftFooter`), so a model
 * that forgets them cannot produce an email without them.
 */
export const DRAFT_SYSTEM = [
  "You write one short email from a small business to another small business it would like to work with.",
  "The rules, all of them:",
  "- Say who is writing and why in the first two lines. Never pretend to be a customer.",
  "- Use only the facts you are given. Never invent a person's name, a price, a number, or anything about their business.",
  "- One ask, and a small one: a reply, a short call, or a visit. Never a contract.",
  "- Plain words. No slogans, no flattery, no bold claims, no emoji.",
  "- Under 120 words, in short paragraphs, with no bullet list.",
  "- The subject says what the email is about in under nine words. Never a question about their money, never capitals.",
  "- Write no sign-off address and no unsubscribe line: those are added after you, by code.",
].join("\n");

const SUGGEST_SYSTEM = [
  "You suggest three or four kinds of LOCAL BUSINESS that a small business could usefully reach out to.",
  "Each one is a kind of business with a listing and a front door -- never people at home, never a job title, never one named company.",
  "For each: what to search for in plain words, who it is for and why in one short phrase, and a lower_snake_case key for the kind.",
  "Also give one line naming the business you were told about, as its owner would say it.",
  "No slogans, and no numbers you were not given.",
].join("\n");

/** A mailto: for the owner's own mail app: the address, the subject and the body, each encoded once; CRLF line breaks, as mail apps read them. */
export function leadMailto(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  return `mailto:${enc(to)}?subject=${enc(subject)}&body=${enc(body)}`;
}

/** The workspace's own facts a draft may quote: its name, the address the law asks for at the foot, and what it offers. */
async function workspaceOffer(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<{ name: string; address: string; services: string[] }> {
  const [facts, cfg] = await Promise.all([
    tenantFacts(ctx.supabase, tenantId),
    ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (cfg.error) throw new Error(cfg.error.message);
  const profile = parseTenantConfig(cfg.data?.config ?? null)?.brain?.profile ?? null;
  return { name: facts.name, address: (profile?.address ?? "").trim(), services: (profile?.services ?? []).slice(0, 5).map((s) => s.name) };
}

/** What this lead is, in the words the card saw: never a guess, and never the name of whoever fetched it. */
async function draftFacts(ctx: Pick<RouteContext, "supabase">, lead: LeadRow): Promise<string[]> {
  const { data, error } = await ctx.supabase.from("leads").select("business_name, category, city, region, website_host, rating, reviews").eq("id", lead.id).maybeSingle();
  if (error) throw new Error(error.message);
  const r = (data ?? null) as { business_name?: string; category?: string | null; city?: string | null; region?: string | null; website_host?: string | null; rating?: number | null; reviews?: number | null } | null;
  const out = [r?.business_name ?? lead.business_name];
  if (r?.category) out.push(r.category);
  const where = [r?.city, r?.region].filter(Boolean).join(", ");
  if (where) out.push(where);
  const host = siteHost(r?.website_host ?? null);
  if (host) out.push(host);
  if (typeof r?.rating === "number") out.push(`${r.rating.toFixed(1)} from ${r.reviews ?? 0} reviews`);
  return out;
}

export interface DraftAnswer { to: string; subject: string; body: string; mailto: string }

/**
 * One draft for one lead (§9.3). Refused before any model call when the
 * workspace has no address of its own (US law asks for one at the foot of a
 * business email) and when this lead has no address that reaches them. The
 * foot is code's, and the owner's own mail app sends it.
 */
export async function draftFor(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  lead: LeadRow,
  input: { tone: "first" | "shorter" | "warmer"; previous?: { subject: string; body: string } },
): Promise<DraftAnswer> {
  const offer = await workspaceOffer(ctx, lead.tenant_id);
  if (!offer.address) throw new AppError("validation", LEAD_NO_ADDRESS, 422);
  if (!lead.email || lead.email_state === "none" || lead.email_state === "invalid") {
    throw new AppError("conflict", "This lead has no address that reaches them. Call instead.", 409);
  }
  const facts = await draftFacts(ctx, lead);
  const said =
    input.tone === "shorter" ? "Make it shorter. The same ask, fewer words." : input.tone === "warmer" ? "Make it warmer. The same length, the same ask." : "Write the first one.";
  const answer = await askForJson(
    {
      tenantId: lead.tenant_id,
      userId: ctx.userId,
      purpose: "lead_draft",
      request: {
        max_tokens: 600,
        system: DRAFT_SYSTEM,
        schema: LEAD_DRAFT_JSON_SCHEMA as unknown as Record<string, unknown>,
        messages: [
          {
            role: "user",
            content: [
              `Who is writing: ${offer.name}${offer.services.length ? `, which offers ${offer.services.join(", ")}` : ""}.`,
              `Who it goes to: ${facts.join("; ")}.`,
              ...(input.previous ? [`The last draft was:\nSubject: ${input.previous.subject}\n${input.previous.body}`] : []),
              said,
            ].join("\n\n"),
          },
        ],
      },
    },
    LeadDraftAnswerSchema,
    "draft",
  );
  const body = `${answer.body}${leadDraftFooter(offer.name, offer.address)}`;
  return { to: lead.email, subject: answer.subject, body, mailto: leadMailto(lead.email, answer.subject, body) };
}

/* --------------------------------------------------- the first day's asks */

interface SuggestionRow { tenant_id: string; business_line: string; by_owner: boolean; items: unknown; made_at: string }
type SuggestItem = { words: string; who_for: string; category_key: string };

/**
 * Keeping the suggestions is the SERVICE's write: 00142 grants no insert or
 * update on `lead_suggestions` to a member, because what Claude wrote is not
 * something an owner types. That one line is the only part of this module a
 * route test cannot run against a database in memory, so it is a seam --
 * `setModelStream`'s twin, and the same rule: tests hand in their own.
 */
let keep: typeof saveLeadSuggestions = saveLeadSuggestions;
export function setSuggestionsWriter(w: typeof saveLeadSuggestions | null): void {
  keep = w ?? saveLeadSuggestions;
}

/** The kept row, when there is one. */
async function keptSuggestions(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<SuggestionRow | null> {
  const { data, error } = await ctx.supabase.from("lead_suggestions").select("tenant_id, business_line, by_owner, items, made_at").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as SuggestionRow | null;
}

/** Each suggestion gains how reachable that kind of business is, from what past searches measured. */
async function withReach(ctx: Pick<RouteContext, "supabase">, items: SuggestItem[]): Promise<LeadSuggestionsDto["items"]> {
  const priors = await Promise.all(items.map((i) => nichePrior(ctx, i.category_key)));
  return items.map((i, n) => ({ words: i.words, who_for: i.who_for, category_key: i.category_key, reach: leadReachLine(priors[n]) }));
}

/**
 * The three or four kinds of business worth reaching (§8.9), written from this
 * workspace's own business line and kept for a week: one model call a week per
 * workspace, unless the owner changes the line. A gateway that will not answer
 * is a note on the page, never a page that fails.
 */
export async function suggestionsFor(ctx: Pick<RouteContext, "supabase" | "userId">, tenantId: string): Promise<LeadSuggestionsDto> {
  const kept = await keptSuggestions(ctx, tenantId);
  const keptItems = Array.isArray(kept?.items) ? (kept.items as SuggestItem[]) : [];
  const byOwner = kept?.by_owner === true;
  if (kept && keptItems.length > 0 && Date.now() - Date.parse(kept.made_at) < LEAD_SUGGEST_DAYS * 86_400_000) {
    return { business_line: kept.business_line, by_owner: byOwner, made_at: kept.made_at, items: await withReach(ctx, keptItems) };
  }
  const offer = await workspaceOffer(ctx, tenantId);
  // The owner's own words when they wrote them; otherwise what the workspace
  // says it is and what it offers.
  const line = byOwner && kept ? kept.business_line : `${offer.name}${offer.services.length ? `: ${offer.services.join(", ")}` : ""}`;
  const madeAt = new Date().toISOString();
  try {
    const answer = await askForJson(
      {
        tenantId,
        userId: ctx.userId,
        purpose: "lead_suggest",
        request: {
          max_tokens: 400,
          system: SUGGEST_SYSTEM,
          schema: LEAD_SUGGEST_JSON_SCHEMA as unknown as Record<string, unknown>,
          messages: [{ role: "user", content: `The business: ${line}` }],
        },
      },
      LeadSuggestAnswerSchema,
      "suggestions",
    );
    const businessLine = byOwner && kept ? kept.business_line : answer.line;
    await keep(tenantId, { business_line: businessLine, by_owner: byOwner, items: answer.items as unknown as Json });
    return { business_line: businessLine, by_owner: byOwner, made_at: madeAt, items: await withReach(ctx, answer.items) };
  } catch (e) {
    // The first day's page is not worth failing over a model that would not
    // answer: the owner still gets the composer and the three ways people
    // arrive, and the note says why this part is empty.
    if (e instanceof AppError) return { business_line: line, by_owner: byOwner, made_at: kept?.made_at ?? madeAt, items: [], note: LEAD_SUGGEST_UNAVAILABLE };
    throw e;
  }
}

/** The owner's own words for what they do: saved, and the next read asks Claude again. */
export async function setBusinessLine(_ctx: Pick<RouteContext, "supabase">, tenantId: string, line: string): Promise<{ business_line: string }> {
  await keep(tenantId, { business_line: line, by_owner: true, items: [] as unknown as Json });
  return { business_line: line };
}

/* ------------------------------------------------------------- the export */

/** The columns a download carries, in the owner's words. Nothing here names whoever fetched the listing. */
const LEAD_CSV_COLUMNS: ReadonlyArray<readonly [string, (r: LeadRowDto) => string | number | null]> = [
  ["Business", (r) => r.business_name],
  ["What they do", (r) => r.category],
  ["Street", (r) => r.street],
  ["City", (r) => r.city],
  ["State", (r) => r.state],
  ["ZIP", (r) => r.postal_code ?? null],
  ["Phone", (r) => r.phone],
  ["Email", (r) => r.email],
  ["Mailbox", (r) => LEAD_EMAIL_WORDS[r.email_state]],
  ["Website", (r) => r.website],
  ["About", (r) => r.about ?? null],
  ["Facebook", (r) => r.facebook_url ?? null],
  ["LinkedIn", (r) => r.linkedin_url ?? null],
  ["Google Maps", (r) => r.maps_url ?? null],
  ["Rating", (r) => r.rating],
  ["Reviews", (r) => r.reviews],
  ["Stage", (r) => LEAD_STAGE_WORDS[r.stage]],
  ["Why", (r) => r.member.reason],
  ["Search", (r) => r.search_name ?? null],
  ["Found", (r) => r.found_at],
];

export function leadsCsv(rows: LeadRowDto[]): string {
  const head = LEAD_CSV_COLUMNS.map(([name]) => name).join(",");
  const body = rows.map((r) => LEAD_CSV_COLUMNS.map(([, pick]) => csvCell(pick(r))).join(","));
  return `\uFEFF${[head, ...body].join("\r\n")}\r\n`;
}

/** How many pages of 500 an export will walk before it stops: the month's whole allowance, with room. */
const EXPORT_PAGES = 20;

/**
 * Every lead the view matches, as a CSV, and the ledger row that says a copy
 * left the building. What it took is marked so the same lead is not charged
 * twice (§0.2), and a lead already charged is not charged again.
 */
export async function exportLeads(
  ctx: Pick<RouteContext, "supabase" | "userId" | "via" | "undoOf">,
  tenantId: string,
  view: Omit<LeadsQuery, "after_key" | "after_id" | "limit">,
): Promise<Response> {
  const rows: LeadRowDto[] = [];
  let after: { key: string; id: string } | null = null;
  // Every page, not the first: a CSV that stops at 500 is indistinguishable
  // from a complete one, on the download whose ledger row says a copy of the
  // list was taken.
  for (let page = 0; page < EXPORT_PAGES; page += 1) {
    const q: LeadsQuery = { ...view, limit: 500, ...(after ? { after_key: after.key, after_id: after.id } : {}) };
    const answer: LeadsPageAnswer = await leadsPage(ctx, tenantId, q);
    rows.push(...answer.rows);
    if (!answer.next) break;
    after = answer.next;
  }
  const { data, error } = await ctx.supabase.rpc("lead_export_mark", { p_tenant_id: tenantId, p_ids: rows.map((r) => r.id) });
  if (error) throw new Error(`lead_export_mark: ${error.message}`);
  const { name, timezone } = await tenantFacts(ctx.supabase, tenantId);
  console.log(JSON.stringify({ level: "info", event: "export.leads", user: ctx.userId, tenant: tenantId, rows: rows.length, marked: typeof data === "number" ? data : 0 }));
  // On the ledger, as the people export is: who took a copy, and when.
  await recordDecision(ctx, tenantId, "workspace", tenantId, "export", { what: "leads", rows: rows.length });
  return attachment(`leads-${safeName(name)}-${dateTag(new Date(), timezone)}.csv`, leadsCsv(rows), "text/csv");
}
