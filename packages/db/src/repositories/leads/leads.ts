/**
 * One lead as the Leads page would show it (Reach out Part 4, PR 9): what GET leads/[id] reads for the peek of a lead
 * on no page the tab has loaded. The lead in the workspace named, the membership the page would show (00212's
 * lead_member_of, over lead_member_shown, the one rule leads_page asks) and how many places it was found at. Reads
 * run on the session client, so RLS decides what comes back; the page's rows are leads_page's, read by the dashboard.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import type { LeadViewCountsDto, TenantId, ContactId } from "@chanlytics/contracts";
import { readAllRows } from "../../shared/paged";
import { platformWide, tenantDb } from "../../shared/tenant-db";
import { z } from "zod";
import { readAnswer } from "../../shared/read-json";

type Db = SupabaseClient<Database>;

/** The lead's columns as leads_page answers them, under the names it answers them by. */
const ONE_LEAD_COLUMNS =
  "id, tenant_id, place_id, business_name, category, street, city, region, postal_code, neighborhood, lat, lng, mark_path, website_host, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, email_checked_at, rating, reviews, stage, closed_reason, last_outcome, last_note, about, hours, image_url, price, reviews_dist, facebook_url, linkedin_url, tiktok_url, claimed, maps_url, rank, contact_id, contacted_at, converted_at, exported_at, found_at, version, blanked_at, erased_at, kind, source, facts";

type LeadsRow = Database["public"]["Tables"]["leads"]["Row"];
// A reach-out's facts (resume_at; booked_at and reach_out_stopped_at, 00241) are its own reads', never the page's row,
// and so are the stage's (stage_at and stage_from, 00309): Reports reads them.
export type LeadOneLead = Omit<
  LeadsRow,
  | "country"
  | "logo_url"
  | "resume_at"
  | "website_root"
  | "booked_at"
  | "reach_out_stopped_at"
  | "stage_at"
  | "stage_from"
  // A company's key is the finder's to dedupe by (00430); the page reads what the lead is and its people.
  | "source_key"
>;

/** The membership lead_member_of answers, the columns leads_page answers of it. */
export interface LeadOneMember {
  id: string;
  search_id: string;
  class: string;
  excluded_by: string | null;
  fit: string | null;
  reason: string;
  distance_m: number | null;
  counted: boolean;
  judgment: Json;
}

const jsonString = (v: Json | undefined): string | null => (typeof v === "string" ? v : null);

/** lead_member_of's jsonb, narrowed: a shape it does not answer is no membership. */
function memberOf(data: Json | null): LeadOneMember | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = jsonString(data.id);
  const searchId = jsonString(data.search_id);
  const cls = jsonString(data.class);
  if (!id || !searchId || !cls) return null;
  return {
    id,
    search_id: searchId,
    class: cls,
    excluded_by: jsonString(data.excluded_by),
    fit: jsonString(data.fit),
    reason: jsonString(data.reason) ?? "",
    distance_m: typeof data.distance_m === "number" ? data.distance_m : null,
    counted: data.counted === true,
    judgment: data.judgment ?? null,
  };
}

/**
 * One lead of the workspace named, with the membership the page would show (in `searchId` when it names one, else
 * the newest) and its places counted; null when the lead is not the workspace's, is erased or blanked, or has no
 * membership the page would show.
 */
export async function readLeadOne(
  db: Db,
  tenantId: TenantId,
  leadId: string,
  searchId?: string,
): Promise<{ lead: LeadOneLead; member: LeadOneMember; places: number } | null> {
  const [l, m, places] = await Promise.all([
    db.from("leads").select(ONE_LEAD_COLUMNS).eq("id", leadId).eq("tenant_id", tenantId).maybeSingle(),
    db.rpc("lead_member_of", {
      p_tenant_id: tenantId,
      p_lead_id: leadId,
      ...(searchId ? { p_search_id: searchId } : {}),
    }),
    db.from("lead_places").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
  ]);
  if (l.error) throw new Error(`readLeadOne: ${l.error.message}`);
  if (m.error) throw new Error(`lead_member_of: ${m.error.message}`);
  if (places.error) throw new Error(`readLeadOne: ${places.error.message}`);
  const lead = l.data;
  const member = memberOf(m.data);
  if (!lead || lead.tenant_id !== tenantId || lead.blanked_at || lead.erased_at || !member) return null;
  return { lead, member, places: places.count ?? 1 };
}

/* ---------------------------------------------------------- what a view holds -- */

/** A count the database answered, or none when it is not a whole number of rows. */
const rowCount = (v: Json | undefined): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);

/** What 00552 adds to a view's counts, where the database said it. */
const statusCountsOf = (options: {
  [key: string]: Json | undefined;
}): Pick<LeadViewCountsDto, "status_groups" | "with_email" | "with_phone"> => {
  const g = options.status_groups;
  return g && typeof g === "object" && !Array.isArray(g)
    ? {
        status_groups: { needs: rowCount(g.needs), in: rowCount(g.in), none: rowCount(g.none) },
        with_email: rowCount(options.with_email),
        with_phone: rowCount(options.with_phone),
      }
    : {};
};

/**
 * What a view of Leads holds (00500 lead_view_counts, decision 0083 Phase B), under the caller's row security as
 * leads_page reads: its members, how many its filters keep, and each criterion's count over the view without them; and,
 * from 00552, each status group's count and how many can be reached each way, which a database before it does not say.
 */
export async function getLeadViewCounts(
  db: Db,
  params: { tenantId: TenantId; searchId: string | null; cls: string | null; list: string; filters: Json | null },
): Promise<LeadViewCountsDto> {
  const { data, error } = await db.rpc("lead_view_counts", {
    p_tenant_id: params.tenantId,
    ...(params.searchId ? { p_search_id: params.searchId } : {}),
    ...(params.cls ? { p_class: params.cls } : {}),
    p_list: params.list,
    ...(params.filters ? { p_filters: params.filters } : {}),
  });
  if (error) throw new Error(`lead_view_counts: ${error.message}`);
  const value = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const by =
    value.excluded_by && typeof value.excluded_by === "object" && !Array.isArray(value.excluded_by)
      ? value.excluded_by
      : {};
  return {
    view: rowCount(value.view),
    matching: rowCount(value.matching),
    excluded_by: Object.fromEntries(Object.entries(by).map(([k, n]) => [k, rowCount(n)])),
    ...statusCountsOf(value),
  };
}

/* ------------------------------------------------- the ideas for a new search -- */

/**
 * What a workspace's searches found and what came of their leads, with where it is (lead_suggest_history, 00398): the
 * jsonb as it comes, which contracts' ideaHistoryOf narrows. The service's read alone: the route checked the member.
 */
export async function readIdeaHistory(db: Db, tenantId: TenantId): Promise<Json> {
  const { data, error } = await db.rpc("lead_suggest_history", { p_tenant_id: tenantId });
  if (error) throw new Error(`lead_suggest_history: ${error.message}`);
  return data;
}

/** What a workspace's ideas are kept with (lead_suggestions_write, act keep). */
export interface IdeasKept {
  business_line: string;
  by_owner: boolean;
  items: Json;
  basis: string | null;
  passed: Json;
}

type IdeasWriteArgs = Database["public"]["Functions"]["lead_suggestions_write"]["Args"];

/** The one writer of lead_suggestions (00400), by act; its answer as a record, or {} where it answered none. */
async function writeIdeas(db: Db, args: IdeasWriteArgs): Promise<Record<string, Json | undefined>> {
  const { data, error } = await db.rpc("lead_suggestions_write", args);
  if (error) throw new Error(`lead_suggestions_write(${args.p_act}): ${error.message}`);
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

/**
 * The claim on writing a workspace's ideas (00398, 00400): the claim's own moment, which keepIdeas and failIdeas take
 * back, or null while another read writes them.
 */
export async function claimIdeas(db: Db, tenantId: TenantId, line: string): Promise<string | null> {
  const result = await writeIdeas(db, { p_tenant_id: tenantId, p_act: "claim", p_line: line });
  return typeof result.claim === "string" && result.claim ? result.claim : null;
}

/**
 * Keeps the ideas written under a claim, while the claim stands (00399, 00400): false when it was let go meanwhile (the
 * owner saved a line, or a slower write was taken over), and nothing is written.
 */
export async function keepIdeas(db: Db, tenantId: TenantId, claim: string, row: IdeasKept): Promise<boolean> {
  const result = await writeIdeas(db, {
    p_tenant_id: tenantId,
    p_act: "keep",
    p_claim: claim,
    p_line: row.business_line,
    p_by_owner: row.by_owner,
    p_items: row.items,
    // A keep always has a basis ("" where no round has ended); null is the owner's line, saved apart.
    p_basis: row.basis ?? "",
    p_passed: row.passed,
  });
  return result.kept === true;
}

/** The model would not write them under this claim: the claim let go, and the next reads say so for a while. */
export async function failIdeas(db: Db, tenantId: TenantId, claim: string): Promise<void> {
  await writeIdeas(db, { p_tenant_id: tenantId, p_act: "fail", p_claim: claim });
}

/**
 * The owner's own words for what they do (00400, act line): kept with no ideas and no basis, so the next read asks
 * again; the owner's word clears any claim, so a write in flight finds its claim gone.
 */
export async function saveIdeasLine(db: Db, tenantId: TenantId, line: string): Promise<void> {
  await writeIdeas(db, { p_tenant_id: tenantId, p_act: "line", p_line: line });
}

/**
 * New ideas (00470, act again): the same line written again, so the next write asks the model, with the ideas shown
 * kept to be passed on (ideaPassed), so the four it writes are new ones. Like a line, it clears any claim.
 */
export async function askForIdeasAgain(db: Db, tenantId: TenantId): Promise<void> {
  await writeIdeas(db, { p_tenant_id: tenantId, p_act: "again" });
}

/**
 * The workspace's clock and language as its row says them (tenants.timezone, tenants.locale), or null where the row
 * cannot be read: the month the ideas' room is counted in, and the language they are written in (00399). Read on the
 * member's session; the server's tenantFactsOf says the clock where the row says none.
 */
export async function findIdeasClockAndLanguage(
  db: Db,
  tenantId: TenantId,
): Promise<{ timezone: string | null; locale: string | null } | null> {
  const { data, error } = await db.from("tenants").select("timezone, locale").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`tenants: ${error.message}`);
  return data;
}

/**
 * When the workspace's newest round ended, or null when none has: what its ideas are written over (lead_suggestions.basis),
 * so a round that ends since asks for new ones. Read on the member's session: rounds are a member's to read.
 */
export async function findIdeasBasis(db: Db, tenantId: TenantId): Promise<string | null> {
  const { data, error } = await db
    .from("lead_rounds")
    .select("ended_at")
    .eq("tenant_id", tenantId)
    .eq("state", "ended")
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`lead_rounds: ${error.message}`);
  return data ? data.ended_at : null;
}

/**
 * The cards that find leads now (00430 lead_cards_live: lead_platform.cards_on): the Maps card, and the people card once
 * its calibration run proved it. What the Leads page offers and Ask proposes; the door refuses the rest itself.
 */
export async function listLeadCardsLive(db: Db): Promise<string[]> {
  const { data, error } = await db.rpc("lead_cards_live");
  if (error) throw new Error(`cannot read which cards find leads: ${error.message}`);
  return data ?? ["local_businesses"];
}

/** Each actor's event prices, by event name, as the price watch last read them from the provider. */
export type LeadPricesSeen = Record<string, Record<string, number>>;

/**
 * What the lead sources charged when the price watch last read them, and when (00506: lead_platform.prices and its
 * prices_checked_at, the one row of the platform's lead switch). The service role's: nothing here is a workspace's.
 */
export async function findLeadPricesSeen(db: Db): Promise<{ prices: LeadPricesSeen; checkedAt: string | null }> {
  const { data, error } = await db.from("lead_platform").select("prices, prices_checked_at").limit(1).maybeSingle();
  if (error) throw new Error(`cannot read the lead sources' prices: ${error.message}`);
  const prices = data?.prices;
  return {
    prices: prices && typeof prices === "object" && !Array.isArray(prices) ? (prices as LeadPricesSeen) : {},
    checkedAt: data?.prices_checked_at ?? null,
  };
}

/** The prices the watch just read, kept as the next read's baseline, and the moment it read them. */
export async function keepLeadPrices(db: Db, prices: LeadPricesSeen, at: Date): Promise<void> {
  const { error } = await db
    .from("lead_platform")
    .update({ prices, prices_checked_at: at.toISOString() })
    .eq("id", true);
  if (error) throw new Error(`cannot keep the lead sources' prices: ${error.message}`);
}

/** What lead_people_search_create answers: the search and its round, or the door's refusal and its sentence. */
const PeopleSearchMade = z
  .object({ search_id: z.string(), round_id: z.string(), error: z.string(), sentence: z.string() })
  .partial();

/**
 * A people search (00430 lead_people_search_create), as the member signed in: the plan, where it was made, the estimate
 * the route worked out and the Ask thread it was planned in. The door's own refusals ({error, sentence}) come back as
 * its answer; a thrown one is a request it refused outright.
 */
export async function createLeadPeopleSearch(
  db: Db,
  params: { tenantId: TenantId; plan: Json; via: "people" | "ask"; estimateUsd: number; threadId: string | null },
): Promise<{ search_id?: string; round_id?: string; error?: string; sentence?: string }> {
  const { data, error } = await db.rpc("lead_people_search_create", {
    p_tenant_id: params.tenantId,
    p_plan: params.plan,
    p_via: params.via,
    p_estimate_usd: params.estimateUsd,
    ...(params.threadId ? { p_thread_id: params.threadId } : {}),
  });
  if (error) throw new Error(`lead_people_search_create: ${error.message}`);
  return readAnswer("lead_people_search_create", PeopleSearchMade, data ?? {});
}

/** What lead_company_upsert answers: the page's three counts; a round gone answers none of them. */
const CompaniesKept = z.object({ made: z.number(), held: z.number(), left_out: z.number() }).partial();

/** What the addressee door answers (00430 lead_addressee_choose): the choice made, or the door's refusal by its code. */
type LeadAddresseeAnswer =
  | { ok: true; addressee: number; email_state: string; version: number }
  | { ok?: undefined; error: string; sentence?: string };

const LeadAddresseeAnswerShape: z.ZodType<LeadAddresseeAnswer> = z.union([
  z.object({ ok: z.literal(true), addressee: z.number(), email_state: z.string(), version: z.number() }),
  z.object({ ok: z.undefined().optional(), error: z.string(), sentence: z.string().optional() }),
]);

/**
 * The owner's choice of who a company lead's reach-out writes to (00430 lead_addressee_choose), as the member signed in:
 * the index of one of the people its source named. The door's own refusals ({error}, and a spend's {error, sentence})
 * come back as its answer; a thrown one is a request it refused outright (not signed in, not this member's lead).
 */
export async function chooseLeadAddressee(
  db: Db,
  params: { leadId: string; person: number },
): Promise<{ data: LeadAddresseeAnswer; error: null } | { data: null; error: { code?: string; message: string } }> {
  const { data, error } = await db.rpc("lead_addressee_choose", { p_lead_id: params.leadId, p_person: params.person });
  if (error) return { data: null, error };
  return {
    data: readAnswer("lead_addressee_choose", LeadAddresseeAnswerShape, data ?? { error: "no_answer" }),
    error: null,
  };
}

/**
 * A people run's page of companies (00430 lead_company_upsert), service role: a lead for each new company, waiting in
 * Needs review on its address, and the people a company already held gains. Idempotent.
 */
export async function upsertLeadCompany(
  db: Db,
  roundId: string,
  companies: Json[],
): Promise<{ made: number; held: number; left_out: number }> {
  const { data, error } = await db.rpc("lead_company_upsert", { p_round_id: roundId, p_companies: companies });
  if (error) throw new Error(`lead_company_upsert: ${error.message}`);
  const r = readAnswer("lead_company_upsert", CompaniesKept, data ?? {});
  return { made: r.made ?? 0, held: r.held ?? 0, left_out: r.left_out ?? 0 };
}

/**
 * Each lead's country (two letters, as the finder kept it; null where it kept none), by id: what the reach-out check
 * reads a lead's place by (decision 0056, 9). Service role; a read that fails throws.
 */
export async function findLeadCountries(db: Db, ids: readonly string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(ids)];
  // A hundred at a time: an id list rides in the request's address.
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await db
      .from("leads")
      .select("id, country")
      .in("id", unique.slice(i, i + 100));
    if (error) throw new Error(`cannot read the leads' countries: ${error.message}`);
    for (const r of data ?? []) out.set(r.id, r.country?.trim().toUpperCase() || null);
  }
  return out;
}

/** What the lead ideas read of who a workspace's customers are: its people, its leads and its won deals, as rows. */
export interface IdeaCustomerRows {
  /** Each person kept (none erased or merged away): how they came, and the lead they came from. */
  contacts: { id: string; acquired_via: string | null; lead_id: string | null }[];
  /** Each lead kept: its kind (the listing's category, or a company's industry) and its stage. */
  leads: { id: string; category: string | null; stage: string }[];
  /** Each deal won, standing or since ended: what it was for, and the lead or person it was with. */
  deals: { service: string | null; lead_id: string | null; contact_id: ContactId | null }[];
}

/**
 * The rows the lead ideas fold into who the workspace's customers are (contracts ideaCustomersOf): every person, every
 * lead and every won deal, read whole (readAllRows) under the member's own session, so RLS decides what comes back. The
 * ideas are written rarely (a month, a round, a press), so a whole read is affordable; a read that fails THROWS, and the
 * ideas are written without it.
 */
export async function getIdeaCustomerRows(db: Db, tenantId: TenantId): Promise<IdeaCustomerRows> {
  const [contacts, leads, deals] = await Promise.all([
    readAllRows<{ id: string; acquired_via: string | null; lead_id: string | null }>("contacts", (from, to) =>
      db
        .from("contacts")
        .select("id, acquired_via, lead_id")
        .eq("tenant_id", tenantId)
        .is("erased_at", null)
        .is("merged_into_contact_id", null)
        .order("id")
        .range(from, to),
    ),
    readAllRows<{ id: string; category: string | null; stage: string }>("leads", (from, to) =>
      db
        .from("leads")
        .select("id, category, stage")
        .eq("tenant_id", tenantId)
        .is("erased_at", null)
        .order("id")
        .range(from, to),
    ),
    readAllRows<{ id: string; service: string | null; lead_id: string | null; contact_id: ContactId | null }>(
      "deals",
      (from, to) =>
        db
          .from("deals")
          .select("id, service, lead_id, contact_id")
          .eq("tenant_id", tenantId)
          .in("stage", ["won", "ended"])
          .order("id")
          .range(from, to),
    ),
  ]);
  return {
    contacts: contacts.map((c) => ({ id: c.id, acquired_via: c.acquired_via, lead_id: c.lead_id })),
    leads: leads.map((l) => ({ id: l.id, category: l.category, stage: l.stage })),
    deals: deals.map((d) => ({ service: d.service, lead_id: d.lead_id, contact_id: d.contact_id })),
  };
}

/**
 * The leads this workspace may count this month (00512's lead_allowance, decision 0090): the trial's while its billing
 * says trialing, else the month's. The Leads page and the plan card read it beside what the month has taken, so the
 * number left is the one lead_reserve holds. A read that fails throws: "we could not check" is not a whole month.
 */
export async function getLeadAllowance(db: Db, tenantId: TenantId): Promise<number> {
  const { data, error } = await db.rpc("lead_allowance", { p_tenant_id: tenantId });
  if (error) throw new Error(`lead_allowance: ${error.message}`);
  const n = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(n)) throw new Error("lead_allowance answered no number");
  return n;
}

/**
 * What reading businesses' sites cost (00541 lead_site_reads_spent): `reads` credits, `usd` at the card's price, against
 * the round while it lives, else the month and the day it was read in; `roundId` null is a read no round asked for. The
 * service role's.
 */
export async function recordLeadSiteReadsSpent(
  db: Db,
  tenantId: TenantId,
  roundId: string | null,
  reads: number,
  usd: number,
): Promise<void> {
  const { error } = await db.rpc("lead_site_reads_spent", {
    p_tenant_id: tenantId,
    ...(roundId ? { p_round_id: roundId } : {}),
    p_reads: reads,
    p_usd: usd,
  });
  if (error) throw new Error(`lead_site_reads_spent: ${error.message}`);
}

/** A lead with a site and no copy of its mark yet (00161), as the leads sweep tries it again. */
interface LeadToMark {
  id: string;
  tenant_id: TenantId;
  website_host: string;
  logo_url: string | null;
}

/**
 * The leads found in [`from`, `until`) with a site and no copy of their mark, still untouched, the oldest first and at
 * most `limit`: what a collect's mark step, the first thing it gives up, left for the leads sweep to try again. Every
 * workspace's, on purpose: the sweep's, each tick, so its filters are those of the partial index on `found_at`
 * (leads_untouched_purge). A lead someone has already acted on waits for the next round that finds its place.
 */
export async function listLeadsUnmarked(db: Db, from: Date, until: Date, limit: number): Promise<LeadToMark[]> {
  const { data, error } = await platformWide(db)
    .from("leads")
    .select("id, tenant_id, website_host, logo_url")
    .eq("stage", "ready")
    .is("contact_id", null)
    .is("contacted_at", null)
    .is("exported_at", null)
    .is("blanked_at", null)
    .is("erased_at", null)
    .not("website_host", "is", null)
    .is("mark_path", null)
    .gte("found_at", from.toISOString())
    .lt("found_at", until.toISOString())
    .order("found_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`leads: ${error.message}`);
  return (data ?? []).flatMap((r) => (r.website_host ? [{ ...r, website_host: r.website_host }] : []));
}

/**
 * A lead's mark kept (00161): the copy's name where the lead still has none, and the address it was read from where the
 * lead had no address either (`had`), never on a lead blanked or erased since it was read. Answers whether a row took
 * it: an update that matched none (marked, blanked or erased since) is not a mark kept.
 */
export async function keepLeadMark(
  db: Db,
  message: { id: string; tenantId: TenantId; had: string | null; logoUrl: string | null; markPath: string },
): Promise<boolean> {
  const patch = message.had
    ? { mark_path: message.markPath }
    : { mark_path: message.markPath, logo_url: message.logoUrl };
  const { data, error } = await tenantDb(db, message.tenantId)
    .from("leads")
    .update(patch)
    .eq("id", message.id)
    .is("mark_path", null)
    .is("blanked_at", null)
    .is("erased_at", null)
    .select("id");
  if (error) throw new Error(`leads: ${error.message}`);
  return (data ?? []).length > 0;
}
