/**
 * The Leads page's read: its rows, the checks and reasons on each, and the month's standing. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import {
  AppError,
  LEAD_MONTHLY_ALLOWANCE,
  type LeadCheck,
  type LeadCheckKey,
  type LeadClass,
  type LeadCounts,
  type LeadEmailState,
  leadMarkSrc,
  leadMonth,
  type LeadMonthDto,
  type LeadRowDto,
  type LeadsQuery,
  type LeadStage,
} from "@chanlytics/contracts";
import { readLeadOne } from "@chanlytics/db";
import { type DoorArgs, monthUsed, renewsOnOf } from "./lead-helpers";
import { listCounts } from "./lead-searches";
import { tenantFacts } from "../tenant";
import type { RouteContext } from "../with-route";

/* --------------------------------------------------------- a page of rows */

/** One row as `leads_page` answers it: the member and its lead, flat. */
interface LeadPageRow {
  member_id: string;
  lead_id: string;
  place_id: string;
  search_id: string;
  class: string;
  excluded_by: string | null;
  fit: string | null;
  reason: string | null;
  distance_m: number | null;
  counted: boolean;
  judgment: unknown;
  business_name: string;
  category: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  /** D5 (00146): the neighbourhood the listing names, and the coordinates the door has always returned. */
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  /** D6 (00161): the name of the copy of the business's mark we keep, in the lead-marks bucket. */
  mark_path: string | null;
  website_host: string | null;
  instagram_url: string | null;
  phone_e164: string | null;
  phone_sources: number | null;
  phone_wrong: boolean;
  email: string | null;
  email_alternates: unknown;
  email_state: string;
  email_checked_at: string | null;
  rating: number | null;
  reviews: number | null;
  stage: string;
  closed_reason: string | null;
  last_outcome: string | null;
  last_note: string | null;
  about: string | null;
  hours: unknown;
  image_url: string | null;
  price: string | null;
  reviews_dist: unknown;
  facebook_url: string | null;
  linkedin_url: string | null;
  tiktok_url: string | null;
  claimed: boolean | null;
  maps_url: string | null;
  rank: number | null;
  contact_id: string | null;
  contacted_at: string | null;
  converted_at: string | null;
  exported_at: string | null;
  found_at: string;
  places: number;
  version: number;
  page_key: string;
}

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

/** What the judge answered for each criterion of this place, by the plan's own key, in the order it answered. */
function judgedBy(judgment: unknown): Map<string, { answer: "yes" | "no" | "unknown"; reason: string | null }> {
  const out = new Map<string, { answer: "yes" | "no" | "unknown"; reason: string | null }>();
  const j =
    judgment && typeof judgment === "object"
      ? (judgment as { answer?: { criteria?: unknown; reason?: unknown } | null })
      : null;
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
const SEEN_CHECKS = new Set<string>(["on_maps", "in_area", "phone_two_sources", "mailbox"] satisfies LeadCheckKey[]);

/**
 * The checks behind a lead (§0.1): what was seen in the listing and the
 * mailbox, and what Claude read. A check is listed only where there is
 * something to say about it -- a read check is each criterion the judge
 * answered, under the key it answered it by -- so the peek never claims a thing
 * nobody asked was judged. The judge keys its answers by the plan's own names
 * (`kind`, then the plan's criteria and exclusions: contracts judgeQuestions),
 * so every one of them is reported; only the three of LEAD_CHECK_KEYS were,
 * which no plan's keys ever matched, and the peek said nothing Claude read
 * (Reach out Part 4, PR 9). The words are the plan's (contracts leadCheckWord).
 * Nothing here names whoever fetched the listing.
 */
function checksOf(r: LeadPageRow): LeadCheck[] {
  const out: LeadCheck[] = [];
  const where = [r.city, r.region].filter(Boolean).join(", ");
  out.push({ key: "on_maps", how: "seen", answer: "yes", source: "Google Maps", reason: null });
  out.push({
    key: "in_area",
    how: "seen",
    answer: r.distance_m === null ? "unknown" : "yes",
    source: "Google Maps · the plan",
    reason: where || null,
  });
  if (r.phone_e164)
    out.push({
      key: "phone_two_sources",
      how: "seen",
      answer: (r.phone_sources ?? 1) >= 2 ? "yes" : "unknown",
      source: "Maps · website",
      reason: null,
    });
  const state = r.email_state as LeadEmailState;
  if (state !== "none" || r.email) {
    out.push({
      key: "mailbox",
      how: "seen",
      answer: state === "ok" ? "yes" : state === "invalid" ? "no" : "unknown",
      source: "Mailbox check",
      reason: null,
    });
  }
  for (const [key, read] of judgedBy(r.judgment)) {
    // A seen check is measured, never read: a plan key that shared its name would say it twice.
    if (SEEN_CHECKS.has(key)) continue;
    out.push({ key, how: "read", answer: read.answer, source: "Claude · the listing", reason: read.reason });
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
    neighborhood: r.neighborhood ?? null,
    // Served from our own storage, on the origin the content policy allows (00161); the site's own address never.
    mark_url: leadMarkSrc(process.env.NEXT_PUBLIC_SUPABASE_URL, r.mark_path),
    lat: r.lat ?? null,
    lng: r.lng ?? null,
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
    reviews_dist:
      r.reviews_dist && typeof r.reviews_dist === "object" ? (r.reviews_dist as LeadRowDto["reviews_dist"]) : null,
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
      other_emails: others
        .filter((e) => typeof e.email === "string")
        .map((e) => ({ email: String(e.email), why: typeof e.why === "string" ? e.why : "another address" })),
    },
  };
}

/** The searches' names, for the row that says which search found it: one read, whatever the page holds. */
async function searchNamesOf(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<Map<string, string>> {
  const { data, error } = await ctx.supabase
    .from("lead_searches")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .limit(200);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
}

export interface LeadsPageAnswer {
  rows: LeadRowDto[];
  /** The last row's place in the order, for the next page; null when this was the end. */
  next: { key: string; id: string } | null;
  counts?: LeadCounts;
  /** The month's standing (D5), with the first page only: what a Keep on the workbench costs is read from here. */
  month?: LeadMonthDto;
}

/**
 * The month as a surface says it (D5): what its leads ceiling has taken, what is left, and the day it renews. The
 * month and the day it renews are the BUSINESS's (lead_month), and the whole is contracts'; planFacts reads the same
 * two numbers for the plan card, which is why both go through monthUsed rather than the counters themselves.
 */
async function monthStanding(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  now: Date = new Date(),
): Promise<LeadMonthDto> {
  const { timezone } = await tenantFacts(ctx.supabase, tenantId);
  const used = await monthUsed(ctx, tenantId, leadMonth(timezone, now));
  const left = Math.max(0, LEAD_MONTHLY_ALLOWANCE - used.allowance);
  return { used: LEAD_MONTHLY_ALLOWANCE - left, left, renewsOn: renewsOnOf(timezone, now) };
}

/**
 * A page of the view, as the database ordered it (leads_page): the list, the
 * class, the sort and the direction are all SQL, so the next page carries on
 * from the key the database answered rather than from a count of rows read.
 */
export async function leadsPage(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  q: LeadsQuery,
  opts: { month?: boolean } = {},
): Promise<LeadsPageAnswer> {
  const first = !q.after_key && !q.after_id;
  const [answer, names, counts, month] = await Promise.all([
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
    // The month rides the first page, as the counts do: the workbench says what a press costs without a read of
    // its own, and paging through five hundred rows never asks for it again. Only for a member who may find: the
    // month's door (00143) is theirs, and refuses anyone else, which took the whole page down with it.
    first && opts.month !== false ? monthStanding(ctx, tenantId) : Promise.resolve(null),
  ]);
  if (answer.error) throw new Error(`leads_page: ${answer.error.message}`);
  const raw = (Array.isArray(answer.data) ? answer.data : []) as unknown as LeadPageRow[];
  const last = raw[raw.length - 1];
  return {
    rows: raw.map((r) => toLeadRowDto(r, names)),
    next: last && raw.length >= q.limit ? { key: last.page_key, id: last.member_id } : null,
    ...(counts ? { counts } : {}),
    ...(month ? { month } : {}),
  };
}

/* ------------------------------------------------------------ one lead -- */

const GONE = () => new AppError("not_found", "That lead is not in your workspace.", 404);

/**
 * One lead, as a row of the page (Reach out Part 4, PR 9): what the peek draws for a lead the address names that is
 * not on the pages the tab has loaded (a link, a lead far down a view). The same row the list answers -- the lead,
 * the membership the page would show (00212's lead_member_of, over the one rule leads_page asks: not blanked, and a
 * qualified one only once counted; the view's search's when `searchId` names one, else the newest), the places it
 * was found at and its search's name -- put through the list's own builder. A lead of another workspace than the one
 * the tab named is a 404, however many workspaces the caller belongs to: the peek draws it in that workspace's page.
 * Read under the caller's own row security.
 */
export async function leadOne(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  leadId: string,
  searchId?: string,
): Promise<{ row: LeadRowDto }> {
  const [one, names] = await Promise.all([
    readLeadOne(ctx.supabase, tenantId, leadId, searchId),
    searchNamesOf(ctx, tenantId),
  ]);
  if (!one) throw GONE();
  const { lead, member } = one;
  const row: LeadPageRow = {
    ...lead,
    member_id: member.id,
    lead_id: lead.id,
    place_id: lead.place_id ?? "",
    search_id: member.search_id,
    class: member.class,
    excluded_by: member.excluded_by,
    fit: member.fit,
    reason: member.reason,
    distance_m: member.distance_m,
    counted: member.counted,
    judgment: member.judgment,
    places: one.places,
    page_key: "",
  };
  return { row: toLeadRowDto(row, names) };
}
