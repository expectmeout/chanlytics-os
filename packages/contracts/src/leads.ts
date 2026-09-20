/**
 * The Leads scope of People, in words (PRD 2026-09-17 v3 §6, §9; release B).
 *
 * Release A (`lead-search.ts`, `lead-judge.ts`) holds the plan, the stored sets
 * and every rule with a right answer. This file is what the OWNER sees: the
 * word a stored value wears, the shape a request takes, the view a route
 * spells, and the view models the page draws a row, the rail and the standing
 * line from. Pure -- nothing here reads a file, a database or a clock of its
 * own; a caller hands in the workspace's zone and the moment.
 *
 * No word here names the vendor that runs the searches. Where a fact came from
 * is said the way the owner would say it ("Google Maps listing"), never by the
 * name of the service that fetched it.
 */
import { z } from "zod";
import {
  LEAD_CLOSED_REASONS, LEAD_EMAIL_STATES, LEAD_FITS, LEAD_MEMBER_CLASSES, LEAD_OPERATION_KINDS, LEAD_STAGES,
  siteHost,
  type LeadEmailState, type LeadFit, type LeadMemberClass, type LeadRoundEnding, type LeadSearchPlan,
} from "./lead-search";
import { initialsOf } from "./viewmodels";
import { agoShort } from "./time";
import { clockDateYear, clockTime } from "./clock";

/**
 * One home per set. Release A declares all six in `lead-search.ts` and `schema-sets.ts:122` holds
 * `LEAD_OPERATION_KINDS` Exactly equal to `lead_operations.kind`; B widens that one by `stage` and `bulk`
 * **in `lead-search.ts`**, in the same commit as 4.2's migration and `gen:schema-sets` (4.2 step 5) -- widening it
 * here first fails `schema-sets.ts:122` with `Type 'false' does not satisfy the constraint 'true'` until the
 * generated set carries the two new kinds. Nothing below re-declares a stored set.
 */
export { LEAD_CLOSED_REASONS, LEAD_EMAIL_STATES, LEAD_FITS, LEAD_OPERATION_KINDS, LEAD_STAGES };
/** B's screen word for A's stored set (`lead_search_members.class`): one set, two names, never two lists. */
export const LEAD_CLASSES = LEAD_MEMBER_CLASSES;
export type LeadClass = LeadMemberClass;
export const LEAD_LISTS = ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"] as const;
export const LEAD_SORTS = ["fit", "found", "distance", "business", "rating", "stage"] as const;   // leads_page's p_sort (B widens A's three)
export const LEAD_CALL_OUTCOMES = ["interested", "call_back", "not_interested", "voicemail", "no_answer", "wrong_number"] as const;
export const LEAD_NOT_A_FIT_WHYS = ["chain", "wrong_kind", "too_far", "customer", "other"] as const;
/** A's stored set has no type of its own; the word for one of its members is derived here, not a second list. */
export type LeadStage = (typeof LEAD_STAGES)[number];
export type { LeadEmailState, LeadFit };   // A's, re-exported so a page reads one name
export type LeadList = (typeof LEAD_LISTS)[number]; export type LeadSort = (typeof LEAD_SORTS)[number];
export type LeadCallOutcome = (typeof LEAD_CALL_OUTCOMES)[number]; export type LeadNotAFitWhy = (typeof LEAD_NOT_A_FIT_WHYS)[number];

/** Stored values are never shown (§9.1). */
export const LEAD_STAGE_WORDS: Record<LeadStage, string> = { ready: "Ready", nurture: "Contacted", converted: "Talking", archived: "Closed" };
export const LEAD_CLOSED_WORDS: Record<(typeof LEAD_CLOSED_REASONS)[number], string> = { said_no: "Said no", not_a_fit: "Not a fit", customer: "Already a customer", stale: "Went quiet", search_removed: "Search removed" };
export const LEAD_FIT_WORDS: Record<(typeof LEAD_FITS)[number], string> = { strong: "Strong fit", look: "Worth a look", long: "Long shot" };
/** Claims only what the check saw (S12): a catch-all server accepts anything, so the check cannot tell. */
export const LEAD_EMAIL_WORDS: Record<(typeof LEAD_EMAIL_STATES)[number], string> = { none: "No email", checking: "Checking", ok: "Checked", catch_all: "Unconfirmed", unknown: "Couldn't check", invalid: "Bounces" };
export const LEAD_CALL_OUTCOME_WORDS: Record<(typeof LEAD_CALL_OUTCOMES)[number], string> = { interested: "Interested", call_back: "Call back later", not_interested: "Not interested", voicemail: "Left a voicemail", no_answer: "No answer", wrong_number: "Wrong number" };
/** The rail's six lists, said once (§6.1). `leadRail` draws from here and nowhere else. */
export const LEAD_LIST_WORDS: Record<LeadList, string> = { all: "All leads", ready: "Ready", nurture: "Contacted", converted: "Talking", said_no: "Said no", not_a_fit: "Not a fit" };
/** Where a lead's facts came from, in the owner's words. */
export const LEAD_SOURCE_WORD = "Google Maps listing";
export const LEAD_LOCKED_LINE = "Wait for their yes. Once they write back, they're in People and your yes page works for them.";
export const LEAD_DRAFT_NOTE = "Your business address and a way to say no are added at the foot, as US law asks.";
export const LEAD_NO_ADDRESS = "Add your business address in Settings first. US law asks for it at the foot of every email you send a business.";
/** Both consent doors say this, permanently, for a person a lead is linked to (decision 19). */
export const LEAD_CONSENT_REFUSAL = "This person came from a lead you found. A yes has to come from them: their own message, or your yes page.";

/** What a call outcome does to the stage (§9.4). Only Interested converts; Wrong number keeps the stage. */
export function outcomeMove(o: (typeof LEAD_CALL_OUTCOMES)[number]): { stage: LeadStage | null; closedReason: string | null; converts: boolean } {
  switch (o) {
    case "interested": return { stage: "converted", closedReason: null, converts: true };
    case "not_interested": return { stage: "archived", closedReason: "said_no", converts: false };
    case "wrong_number": return { stage: null, closedReason: null, converts: false };
    default: return { stage: "nurture", closedReason: null, converts: false };
  }
}

/* --------------------------------------------------------------- requests */

export const LeadsQuerySchema = z.object({
  list: z.enum(LEAD_LISTS).default("all"),
  search: z.string().uuid().optional(),
  class: z.enum(LEAD_CLASSES).optional(),
  sort: z.enum(LEAD_SORTS).default("fit"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  after_key: z.string().max(80).optional(),
  after_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});
export type LeadsQuery = z.infer<typeof LeadsQuerySchema>;
/** The view a bulk act names when the owner chose "Select all N that match" (S13): the same keys GET leads takes. */
export const LeadsViewSchema = LeadsQuerySchema.omit({ after_key: true, after_id: true, limit: true });

/** POST leads/[id]/stage, the page's five acts made exclusive. */
export const LeadStageInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stage"), stage: z.enum(["ready", "nurture", "converted"]) }),
  z.object({ kind: z.literal("not_a_fit"), why: z.enum(LEAD_NOT_A_FIT_WHYS) }),
  z.object({ kind: z.literal("said_no") }),
  z.object({ kind: z.literal("outcome"), outcome: z.enum(LEAD_CALL_OUTCOMES), note: z.string().trim().max(280).optional() }),
  /** "Did you send it?" Yes. */
  z.object({ kind: z.literal("emailed") }),
]);
export type LeadStageInput = z.infer<typeof LeadStageInputSchema>;

/** The door's arguments (lead_set_stage). The door judges what converts; this only spells the ask. */
export function stageArgs(i: LeadStageInput): { p_stage: string | null; p_reason: string | null; p_fit_reason: string | null; p_outcome: string | null; p_note: string | null } {
  const none = { p_stage: null, p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null };
  switch (i.kind) {
    case "stage": return { ...none, p_stage: i.stage };
    case "not_a_fit": return { ...none, p_stage: "archived", p_reason: i.why === "customer" ? "customer" : "not_a_fit", p_fit_reason: i.why };
    case "said_no": return { ...none, p_stage: "archived", p_reason: "said_no" };
    case "emailed": return { ...none, p_stage: "nurture", p_outcome: "emailed" };
    case "outcome": {
      const m = outcomeMove(i.outcome);
      return { ...none, p_stage: m.stage, p_reason: m.closedReason, p_outcome: i.outcome, p_note: i.note ?? null };
    }
  }
}
export const LeadsBulkSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("ids"), action: z.enum(["contacted", "not_a_fit"]), ids: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({ by: z.literal("view"), action: z.enum(["contacted", "not_a_fit"]), view: LeadsViewSchema }),
]);
export type LeadsBulkInput = z.infer<typeof LeadsBulkSchema>;
export const LeadDraftInputSchema = z.object({
  tone: z.enum(["first", "shorter", "warmer"]).default("first"),
  previous: z.object({ subject: z.string().max(200), body: z.string().max(4000) }).optional(),
});
export const LeadExportQuerySchema = LeadsViewSchema;
export const RenameLeadSearchSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const BusinessLineSchema = z.object({ business_line: z.string().trim().min(3).max(160) });

/* ------------------------------------------- a view of the scope, as a route */

/**
 * The chips a view may carry. Release B parses none -- the route grammar keeps the key so the surface, the route and
 * the bulk act agree on one shape, and release C fills it (`2026-09-19-lead-finder-C-extras.md`). It is a type, not a
 * list: an empty record cannot be given a value by accident.
 */
export type LeadChips = Record<string, never>;

/** "clients/leads:s-<search>:l-<list>:c-<class>" -- the grammar Ask's page citations admit (ask.ts PAGE_PREFIX). Chips join in release C. */
export function leadsRoute(v: { searchId?: string | null; list?: LeadList | null; cls?: LeadClass | null; chips?: Record<string, unknown> }): string {
  const parts = ["clients/leads"];
  if (v.searchId) parts.push(`s-${v.searchId}`);
  if (v.list && v.list !== "all") parts.push(`l-${v.list}`);
  if (v.cls) parts.push(`c-${v.cls}`);
  return parts.join(":");
}
export function parseLeadsRoute(route: string): { searchId: string | null; list: LeadList; cls: LeadClass | null; chips: Record<string, unknown> } | null {
  const [head, ...segs] = route.split(":");
  if (head !== "clients/leads" && head !== "leads") return null;
  const out = { searchId: null as string | null, list: "all" as LeadList, cls: null as LeadClass | null, chips: {} };
  for (const s of segs) {
    const dash = s.indexOf("-");
    if (dash < 1) continue;
    const [seg, val] = [s.slice(0, dash), s.slice(dash + 1)];
    if (seg === "s" && /^[0-9a-f-]{36}$/.test(val)) out.searchId = val;
    else if (seg === "l" && (LEAD_LISTS as readonly string[]).includes(val)) out.list = val as LeadList;
    else if (seg === "c" && (LEAD_CLASSES as readonly string[]).includes(val)) out.cls = val as LeadClass;
  }
  return out;
}

/* ------------------------------------------- what the model answers ------- */

export const LEAD_DRAFT_JSON_SCHEMA = { type: "object", additionalProperties: false, required: ["subject", "body"], properties: { subject: { type: "string" }, body: { type: "string" } } } as const;
export const LeadDraftAnswerSchema = z.object({ subject: z.string().trim().min(3).max(120), body: z.string().trim().min(20).max(2000) });
export const LEAD_SUGGEST_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["line", "items"],
  properties: { line: { type: "string" }, items: { type: "array", items: { type: "object", additionalProperties: false, required: ["words", "who_for", "category_key"], properties: { words: { type: "string" }, who_for: { type: "string" }, category_key: { type: "string" } } } } },
} as const;
export const LeadSuggestAnswerSchema = z.object({
  line: z.string().trim().min(3).max(160),
  items: z.array(z.object({ words: z.string().trim().min(3).max(80), who_for: z.string().trim().min(3).max(120), category_key: z.string().regex(/^[a-z_]{2,40}$/) })).min(1).max(4),
});
/** The foot every draft carries: the business's postal address and a way to say no (CAN-SPAM). */
export function leadDraftFooter(business: string, address: string): string {
  return `\n\n—\n${business} · ${address}\nNot interested? Reply "no thanks" and I won't write again.`;
}

/* ------------------------------------------------- what the doors answer -- */

export interface LeadCheck { key: LeadCheckKey; how: "seen" | "read"; answer: "yes" | "no" | "unknown"; source: string; reason: string | null }
/** The seven checks §0.1 and the interface name, four seen and three read; §9.2's "six" is the PRD's count of one screen. */
export const LEAD_CHECK_KEYS = ["on_maps", "in_area", "phone_two_sources", "mailbox", "independent", "right_kind", "own_address"] as const;
export type LeadCheckKey = (typeof LEAD_CHECK_KEYS)[number];
export interface LeadRowDto {
  id: string; search_id: string; place_id: string; business_name: string; category: string | null;
  city: string | null; state: string | null; street: string | null;
  /** `leads_page` answers it beside the city; the area cell reads "78704 · Austin, TX" from the pair. */
  postal_code?: string | null;
  /** Not the door's: `leads_page` returns the search's id, and 4.4 fills the name from the same read that loads the searches. */
  search_name?: string | null;
  phone: string | null; phone_agrees: boolean; phone_wrong: boolean;
  email: string | null; email_state: LeadEmailState; email_checked_at: string | null;
  website: string | null; instagram: string | null; rating: number | null; reviews: number | null;
  stage: LeadStage; closed_reason: string | null; contact_id: string | null;
  /** How the lead has been worked, from `leads_page` (4.2): a fixture copies the real shape even where B draws none of it. */
  last_outcome: string | null; last_note: string | null; contacted_at: string | null; converted_at: string | null;
  places: number; found_at: string; exported_at: string | null; version: number;
  member: { class: LeadClass; fit: "strong" | "look" | "long" | null; reason: string; excluded_by: string | null; distance_m: number | null; counted: boolean; checks: LeadCheck[]; other_emails: { email: string; why: string }[] };
}
export interface LeadSearchRoundDto {
  id: string; seq: number; purpose: string; state: string; ending: LeadRoundEnding | null;
  question: { sentence: string; criterion_key: string } | null;
  target: number; counted: number; qualified: number; review: number; excluded: number;
  /** Counted leads whose address was found and checked: "88 you can email", and "41 emails checked" while it runs. */
  emails_checked: number;
  /** Counted leads reachable by phone: "72 by phone" (§8.6's sentence needs both, W2 put both on the view). */
  with_phone: number;
  /** The round is stopping and still checking what it found (S12): the only way to tell Stopping from Checking. */
  ending_pending: boolean;
  waiting_since: string | null; cost_usd: number; ended_at: string | null;
  undo_op_id: string | null; undo_version: number | null;
}
export interface LeadSearchDto { id: string; name: string; asked: string; asked_on: string; plan: LeadSearchPlan; plan_version: number; round: LeadSearchRoundDto | null }
export interface LeadCounts { all: number; ready: number; nurture: number; converted: number; said_no: number; not_a_fit: number }
export interface LeadSuggestionsDto { business_line: string; by_owner: boolean; made_at: string; items: { words: string; who_for: string; category_key: string; reach: string | null }[]; note?: string }
/** What the plan card is given beside the plan (Task 9); `planFacts` in `server/leads.ts` (4.4) builds exactly this. */
export interface LeadPlanFacts { dupes: number; leadsLeft: number; bound: "month" | "budget" | null; prior: { places: number; matched: number; with_email: number } | null; priorOf: string | null; cannotSee: string[]; renewsOn: string; nearby: string[] }

/* ------------------------------------------------ what the page is given -- */

/**
 * One row as the table draws it (§6.2). Every field is a word or a shape, and not one of them is a stored value:
 * `stage` rides along only so the row's dot has a class. Task 2's `LEAD_COLUMNS` reads exactly these and nothing else.
 */
export interface LeadRowVM {
  id: string; searchId: string; searchName: string; mark: string; name: string; places: number;
  category: string; area: string; cls: LeadClass;
  fitLabel: string; fitTitle: string;
  email: string | null; emailState: LeadEmailState; emailLabel: string; emailWord: string;
  phone: string | null; phoneAgrees: boolean; phoneWrong: boolean;
  why: string; rating: string; stage: LeadStage; stageLabel: string;
  foundLabel: string; foundAt: string; distance: string; source: string; host: string;
  excludedBy: string | null; version: number;
}

const METRES_PER_MILE = 1609.344;
/** A key from a plan ("chain", "wrong_kind") as a person would read it. */
const keyInWords = (key: string): string => {
  const words = key.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
};
/** "1.2 mi" close in, whole miles past ten: nobody says "12.4 mi" about a drive across town. */
const milesLabel = (m: number | null): string => {
  if (m === null || m === undefined) return "";
  const mi = m / METRES_PER_MILE;
  return `${mi < 10 ? mi.toFixed(1) : String(Math.round(mi))} mi`;
};
/** "5.0 · 16": the stars and how many said so, together, because one without the other says nothing. */
const ratingLabel = (rating: number | null, reviews: number | null): string => (rating === null || rating === undefined ? "" : `${rating.toFixed(1)} · ${reviews ?? 0}`);
/** A closed lead says WHY it closed; "archived" is a stored value and never reaches a screen. */
const stageLabelOf = (stage: LeadStage, closedReason: string | null): string =>
  (stage === "archived" ? LEAD_CLOSED_WORDS[closedReason as (typeof LEAD_CLOSED_REASONS)[number]] ?? LEAD_STAGE_WORDS.archived : LEAD_STAGE_WORDS[stage]);

/** One row's words and shapes (§6.2). Nothing here is a stored value. */
export function toLeadRowVM(r: LeadRowDto, tz: string, now: Date): LeadRowVM {
  const nowMs = now.getTime();
  const foundMs = Date.parse(r.found_at);
  const m = r.member;
  const excludedBy = m.excluded_by ? keyInWords(m.excluded_by) : null;
  const rating = ratingLabel(r.rating, r.reviews);
  // Qualified wears its fit band; Needs review wears the judge's reason, which
  // is what it is waiting on; Excluded wears the criterion that left it out.
  const fitLabel = m.class === "excluded" ? excludedBy ?? m.reason : m.class === "review" ? m.reason : m.fit ? LEAD_FIT_WORDS[m.fit] : m.reason;
  const fitTitle = m.class === "excluded"
    ? `Left out: ${excludedBy ?? m.reason}`
    : m.class === "qualified" && rating ? `${m.reason} · ${rating.replace(" · ", " from ")} reviews` : m.reason;
  const area = [r.postal_code ?? "", [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  return {
    id: r.id,
    searchId: r.search_id,
    searchName: r.search_name ?? "",
    mark: initialsOf(r.business_name),
    name: r.business_name,
    places: r.places,
    category: r.category ?? "",
    area,
    cls: m.class,
    fitLabel,
    fitTitle,
    email: r.email,
    emailState: r.email_state,
    // The cell draws the address itself; an address nobody has is blank, not "none".
    emailLabel: r.email ?? "",
    emailWord: LEAD_EMAIL_WORDS[r.email_state],
    // E.164, because the row dials it (plDial's tel:); the double tick says Maps and their own site agree.
    phone: r.phone,
    phoneAgrees: r.phone_agrees,
    phoneWrong: r.phone_wrong,
    why: m.reason,
    rating,
    stage: r.stage,
    stageLabel: stageLabelOf(r.stage, r.closed_reason),
    foundLabel: agoShort(foundMs, nowMs),
    foundAt: `${clockDateYear(foundMs, tz)} · ${clockTime(foundMs, tz)}`,
    distance: milesLabel(m.distance_m),
    source: LEAD_SOURCE_WORD,
    host: siteHost(r.website) ?? "",
    excludedBy,
    version: r.version,
  };
}

/** A round that is still going; one waiting on the owner is its own mark. */
const roundIsLive = (state: string): boolean => state !== "ended" && state !== "waiting_on_owner";

/** The rail's rows under Leads (§6.1): the six lists with counts, then the searches with their marks. */
export function leadRail(counts: LeadCounts, searches: LeadSearchDto[]): { lists: { id: LeadList; label: string; count: number }[]; searches: { id: string; name: string; count: number; mark: "live" | "question" | null }[] } {
  // Said no is a list only when somebody said no: an empty row in the rail
  // teaches the owner nothing and costs them a line every day.
  const ids: LeadList[] = ["all", "ready", "nurture", "converted", ...(counts.said_no > 0 ? (["said_no"] as LeadList[]) : []), "not_a_fit"];
  return {
    lists: ids.map((id) => ({ id, label: LEAD_LIST_WORDS[id], count: counts[id === "all" ? "all" : id] })),
    searches: searches.map((s) => ({
      id: s.id,
      name: s.name,
      count: s.round?.counted ?? 0,
      mark: !s.round ? null : s.round.state === "waiting_on_owner" ? "question" : roundIsLive(s.round.state) ? "live" : null,
    })),
  };
}

/** "322 leads · 272 ready · 3 searches", and "1 search needs you" when one waits. */
export function leadsStanding(counts: LeadCounts, searches: LeadSearchDto[]): { total: string; parts: string[]; needsYou: { count: number; searchId: string } | null } {
  const waiting = searches.filter((s) => s.round?.state === "waiting_on_owner");
  return {
    total: `${counts.all} leads`,
    parts: [`${counts.ready} ready`, `${searches.length} ${searches.length === 1 ? "search" : "searches"}`],
    needsYou: waiting.length ? { count: waiting.length, searchId: waiting[0]!.id } : null,
  };
}
