/**
 * The Leads page's read: its rows, the checks and reasons on each, and the month's standing. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import {
  AppError,
  isSystemOneModel,
  LEAD_KIND_KEY,
  LEAD_READ_SOURCES,
  type LeadCheck,
  type LeadCheckKey,
  type LeadClass,
  type LeadCounts,
  type LeadEmailState,
  leadFiltersOf,
  leadMarkSrc,
  leadMonth,
  type LeadMonthDto,
  type LeadPileCountsDto,
  type LeadRowDto,
  type LeadsQuery,
  type LeadStage,
  type LeadViewCountsDto,
  type SequencePlaceOfDto,
  recordOrNull,
} from "@chanlytics/contracts";
import { getLeadPileCounts, listSequencePlaces } from "@chanlytics/db/campaigns";
import { getLeadViewCounts, listSearchNames, readLeadOne, readLeadsPage } from "@chanlytics/db/leads";
import { readMonthUsed, renewsOnOf } from "./allowance";
import { listSearchCounts } from "./searches";
import { getTenantFacts } from "../shared/tenant";
import type { RouteContext } from "../shared/with-route";
import { env } from "../shared/env";
import type { ContactId, TenantId } from "@chanlytics/contracts";

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
  contact_id: ContactId | null;
  contacted_at: string | null;
  converted_at: string | null;
  exported_at: string | null;
  found_at: string;
  places: number;
  version: number;
  page_key: string;
  /** The pile (00426): when a member put it off for later in this search, and the reach-out it goes with. */
  later_at?: string | null;
  chain_id?: string | null;
  /** A place or a company, and a company's people (00430). */
  kind?: string | null;
  facts?: unknown;
  /** Where it stands in the queue, where the read asked (00552): needs, in, or null in neither. */
  status_group?: string | null;
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

/** What the judge answered for a criterion: its answer, its reason, and the listing's facts it rested on. */
interface Judged {
  answer: "yes" | "no" | "unknown";
  reason: string | null;
  facts: string[];
}

/**
 * What the judge answered for each criterion of this place, by the plan's own key, in the order it answered. A
 * company's judge (contracts company-judge.ts, 00474) answers one question, whether it is the kind of company the search
 * is for: it is said under the same key a place's kind is (`kind`).
 */
function judgedBy(judgment: unknown): Map<string, Judged> {
  const out = new Map<string, Judged>();
  const json =
    judgment && typeof judgment === "object"
      ? (judgment as { answer?: { criteria?: unknown; reason?: unknown; fit?: unknown; facts?: unknown } | null })
      : null;
  const answer = json?.answer && typeof json.answer === "object" ? json.answer : null;
  const criteria = Array.isArray(answer?.criteria)
    ? (answer.criteria as { key?: unknown; answer?: unknown; facts?: unknown }[])
    : typeof answer?.fit === "string"
      ? [{ key: LEAD_KIND_KEY, answer: answer.fit, facts: answer.facts }]
      : [];
  const reason = typeof answer?.reason === "string" ? answer.reason : null;
  for (const c of criteria) {
    if (typeof c.key !== "string") continue;
    const facts = Array.isArray(c.facts) ? c.facts.filter((x): x is string => typeof x === "string") : [];
    out.set(c.key, { answer: c.answer === "pass" ? "yes" : c.answer === "fail" ? "no" : "unknown", reason, facts });
  }
  return out;
}

/**
 * The listing's numbers a criterion's answer can rest on (contracts JUDGE_FACT_KEYS), in the words its source names: a
 * criterion the judge answered from them ("a rating of 4.2 or lower") is a fact the listing shows, so it is said as
 * seen there, never as Claude's reading of the listing.
 */
const LISTING_NUMBERS: Readonly<Record<string, string>> = { rating: "rating", reviews: "reviews" };

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
function checksOf(leadPage: LeadPageRow): LeadCheck[] {
  const out: LeadCheck[] = [];
  const where = [leadPage.city, leadPage.region].filter(Boolean).join(", ");
  // A company the people card found (00430) is no listing on Maps and stands in no area: a business directory named it,
  // and its judge read the directory's facts of it, never a listing's.
  const company = leadPage.kind === "company";
  if (!company) {
    out.push({ key: "on_maps", how: "seen", answer: "yes", source: "Google Maps", reason: null });
    out.push({
      key: "in_area",
      how: "seen",
      answer: leadPage.distance_m === null ? "unknown" : "yes",
      source: "Google Maps · the plan",
      reason: where || null,
    });
  }
  if (leadPage.phone_e164)
    out.push({
      key: "phone_two_sources",
      how: "seen",
      answer: (leadPage.phone_sources ?? 1) >= 2 ? "yes" : "unknown",
      source: "Maps · website",
      reason: null,
    });
  const state = leadPage.email_state as LeadEmailState;
  if (state !== "none" || leadPage.email) {
    out.push({
      key: "mailbox",
      how: "seen",
      answer: state === "ok" ? "yes" : state === "invalid" ? "no" : "unknown",
      source: "Mailbox check",
      reason: null,
    });
  }
  // A place the screen left out before the judge (decision 0085) was read by the second model, never by Claude.
  const screened = isSystemOneModel(recordOrNull(leadPage.judgment)?.model);
  for (const [key, read] of judgedBy(leadPage.judgment)) {
    // A seen check is measured, never read: a plan key that shared its name would say it twice.
    if (SEEN_CHECKS.has(key)) continue;
    const numbers = read.facts.flatMap((f) => (LISTING_NUMBERS[f] ? [LISTING_NUMBERS[f]] : []));
    out.push(
      numbers.length && !company
        ? { key, how: "seen", answer: read.answer, source: `Google Maps · ${numbers.join(", ")}`, reason: read.reason }
        : {
            key,
            how: "read",
            answer: read.answer,
            source: company
              ? LEAD_READ_SOURCES.company
              : screened
                ? LEAD_READ_SOURCES.screen
                : read.facts.includes("site")
                  ? LEAD_READ_SOURCES.site
                  : LEAD_READ_SOURCES.judge,
            reason: read.reason,
          },
    );
  }
  return out;
}

function toLeadRowDto(leadPage: LeadPageRow, searchNames: Map<string, string>): LeadRowDto {
  const others = Array.isArray(leadPage.email_alternates)
    ? (leadPage.email_alternates as { email?: unknown; why?: unknown }[])
    : [];
  return {
    id: leadPage.lead_id,
    search_id: leadPage.search_id,
    place_id: leadPage.place_id,
    business_name: leadPage.business_name,
    category: leadPage.category,
    city: leadPage.city,
    state: leadPage.region,
    street: leadPage.street,
    postal_code: leadPage.postal_code,
    neighborhood: leadPage.neighborhood ?? null,
    // Served from our own storage, on the origin the content policy allows (00161); the site's own address never.
    mark_url: leadMarkSrc(env.NEXT_PUBLIC_SUPABASE_URL, leadPage.mark_path),
    lat: leadPage.lat ?? null,
    lng: leadPage.lng ?? null,
    search_name: searchNames.get(leadPage.search_id) ?? null,
    phone: leadPage.phone_e164,
    // Two sources agreed on the number: the listing and the business's own site.
    phone_agrees: (leadPage.phone_sources ?? 1) >= 2,
    phone_wrong: leadPage.phone_wrong,
    email: leadPage.email,
    email_state: leadPage.email_state as LeadEmailState,
    email_checked_at: leadPage.email_checked_at,
    website: leadPage.website_host,
    instagram: leadPage.instagram_url,
    rating: leadPage.rating,
    reviews: leadPage.reviews,
    // What the listing shows about the business (D2), as leads_page returns it; jsonb arrives as it was stored.
    about: leadPage.about ?? null,
    hours: Array.isArray(leadPage.hours) ? (leadPage.hours as { day: string; hours: string }[]) : [],
    image_url: leadPage.image_url ?? null,
    price: leadPage.price ?? null,
    reviews_dist:
      leadPage.reviews_dist && typeof leadPage.reviews_dist === "object"
        ? (leadPage.reviews_dist as LeadRowDto["reviews_dist"])
        : null,
    facebook_url: leadPage.facebook_url ?? null,
    linkedin_url: leadPage.linkedin_url ?? null,
    tiktok_url: leadPage.tiktok_url ?? null,
    claimed: leadPage.claimed ?? null,
    maps_url: leadPage.maps_url ?? null,
    rank: leadPage.rank ?? null,
    stage: leadPage.stage as LeadStage,
    closed_reason: leadPage.closed_reason,
    contact_id: leadPage.contact_id,
    chain_id: leadPage.chain_id ?? null,
    // What the lead is, and a company's people (00430).
    kind: leadPage.kind ?? "place",
    facts: leadPage.facts ?? null,
    status_group: leadPage.status_group === "needs" || leadPage.status_group === "in" ? leadPage.status_group : null,
    last_outcome: leadPage.last_outcome,
    last_note: leadPage.last_note,
    contacted_at: leadPage.contacted_at,
    converted_at: leadPage.converted_at,
    places: leadPage.places,
    found_at: leadPage.found_at,
    exported_at: leadPage.exported_at,
    version: leadPage.version,
    member: {
      class: leadPage.class as LeadClass,
      fit: (leadPage.fit ?? null) as LeadRowDto["member"]["fit"],
      reason: leadPage.reason ?? "",
      excluded_by: leadPage.excluded_by,
      distance_m: leadPage.distance_m,
      counted: leadPage.counted,
      checks: checksOf(leadPage),
      // The class rule's own reason tokens (email:unknown, unknown:<key>, inferred:<key>, out_of_area ...): what the
      // Needs review queue groups by (D3, contracts leadReviewGroups). Never words; the page spells them.
      reasons: reasonsOf(leadPage.judgment, leadPage.email_state),
      other_emails: others
        .filter((e) => typeof e.email === "string")
        .map((e) => ({ email: String(e.email), why: typeof e.why === "string" ? e.why : "another address" })),
      later_at: leadPage.later_at ?? null,
    },
  };
}

/** The searches' names, for the row that says which search found it: one read, whatever the page holds. */
async function searchNamesOf(ctx: Pick<RouteContext, "supabase">, tenantId: TenantId): Promise<Map<string, string>> {
  const { data, error } = await listSearchNames(ctx.supabase, tenantId, 200);
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
  /** The pile's progress line (sort=pile of one search, 00426), with the first page only. */
  pile?: LeadPileCountsDto;
  /**
   * What the view holds (00500 lead_view_counts), with the first page only: how many its filters keep ("Select all N
   * that match") and the Excluded view's chips' counts. The pile reads the view whole, so it asks none.
   */
  view?: LeadViewCountsDto;
}

/** The pile's progress line, read under the caller's row security (00426 lead_pile_counts). */
async function pileOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  searchId: string,
  leadsQuery: LeadsQuery,
): Promise<LeadPileCountsDto> {
  const { data, error } = await getLeadPileCounts(ctx.supabase, {
    tenantId,
    searchId,
    listId: leadsQuery.pile_list ?? null,
    ...(leadsQuery.class ? { cls: leadsQuery.class } : {}),
  });
  if (error) throw new Error(`lead_pile_counts: ${error.message}`);
  return data;
}

/**
 * The month as a surface says it (D5): what its leads ceiling has taken, what is left, and the day it renews. The
 * month and the day it renews are the BUSINESS's (lead_month), and the whole is contracts'; planFacts reads the same
 * two numbers for the plan card, which is why both go through readMonthUsed rather than the counters themselves.
 */
async function monthStanding(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  now: Date = new Date(),
): Promise<LeadMonthDto> {
  const { timezone } = await getTenantFacts(ctx.supabase, tenantId);
  const used = await readMonthUsed(ctx, tenantId, leadMonth(timezone, now));
  const left = Math.max(0, used.cap - used.allowance);
  return { used: used.cap - left, left, renewsOn: renewsOnOf(timezone, now) };
}

/**
 * A page of the view, as the database ordered it (leads_page): the list, the
 * class, the sort and the direction are all SQL, so the next page carries on
 * from the key the database answered rather than from a count of rows read.
 * So are the page's filters (decision 0083 Phase B, 00554: lead_view_rows), the
 * words, the criterion, the fit and the reaches, so a view past one page is
 * narrowed whole, and the first page says how many it keeps.
 */
export async function getLeadsPage(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  leadsQuery: LeadsQuery,
  opts: { month?: boolean } = {},
): Promise<LeadsPageAnswer> {
  const first = !leadsQuery.after_key && !leadsQuery.after_id;
  const pile = first && leadsQuery.sort === "pile" ? (leadsQuery.search ?? null) : null;
  // The pile walks every lead of its search, whatever the table is narrowed to (#1978): its read asks no filter.
  const filters = leadsQuery.sort === "pile" ? null : leadFiltersOf(leadsQuery);
  const [answer, names, counts, month, piled, view] = await Promise.all([
    readLeadsPage(ctx.supabase, {
      p_tenant_id: tenantId,
      p_search_id: leadsQuery.search ?? null,
      p_class: leadsQuery.class ?? null,
      p_sort: leadsQuery.sort,
      p_after_key: leadsQuery.after_key ?? null,
      p_limit: leadsQuery.limit,
      p_list: leadsQuery.list,
      p_dir: leadsQuery.dir,
      p_after_id: leadsQuery.after_id ?? null,
      ...(leadsQuery.pile_list ? { p_list_id: leadsQuery.pile_list } : {}),
      ...(filters ? { p_filters: filters } : {}),
    }),
    searchNamesOf(ctx, tenantId),
    first ? listSearchCounts(ctx, tenantId) : Promise.resolve(null),
    // The month rides the first page, as the counts do: the workbench says what a press costs without a read of
    // its own, and paging through five hundred rows never asks for it again. Only for a member who may find: the
    // month's door (00143) is theirs, and refuses anyone else, which took the whole page down with it.
    first && opts.month !== false ? monthStanding(ctx, tenantId) : Promise.resolve(null),
    pile ? pileOf(ctx, tenantId, pile, leadsQuery) : Promise.resolve(null),
    // Unreadable costs the counts, never the page: without them the page offers no "all that match" while narrowed.
    first && leadsQuery.sort !== "pile"
      ? getLeadViewCounts(ctx.supabase, {
          tenantId,
          searchId: leadsQuery.search ?? null,
          cls: leadsQuery.class ?? null,
          list: leadsQuery.list,
          filters,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (answer.error) throw new Error(`leads_page: ${answer.error.message}`);
  const raw = Array.isArray(answer.data) ? answer.data : [];
  const last = raw[raw.length - 1];
  const places = await placesOf(
    ctx,
    tenantId,
    raw.map((r) => r.lead_id),
  );
  return {
    rows: raw.map((r) => withPlace(toLeadRowDto(r, names), places)),
    next: last && raw.length >= leadsQuery.limit ? { key: last.page_key, id: last.member_id } : null,
    ...(counts ? { counts } : {}),
    ...(month ? { month } : {}),
    ...(piled ? { pile: piled } : {}),
    ...(view ? { view } : {}),
  };
}

/**
 * Where each lead of a page stands in a sequence (00459 sequence_places_of, the one reader), by its id: what Leads' cell
 * says in the sheet's and the record's words. Unreadable costs the cell's line, never the page: no row then carries one.
 */
async function placesOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  leadIds: readonly string[],
): Promise<ReadonlyMap<string, SequencePlaceOfDto> | null> {
  const places = await listSequencePlaces(ctx.supabase, tenantId, leadIds).catch(() => null);
  return places ? new Map(places.map((p) => [p.lead_id, p])) : null;
}

/** A row with its place, where the places were read: null in no sequence. */
const withPlace = (row: LeadRowDto, places: ReadonlyMap<string, SequencePlaceOfDto> | null): LeadRowDto =>
  places ? { ...row, place: places.get(row.id) ?? null } : row;

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
export async function getLeadOne(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
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
  return { row: withPlace(toLeadRowDto(row, names), await placesOf(ctx, tenantId, [lead.id])) };
}
