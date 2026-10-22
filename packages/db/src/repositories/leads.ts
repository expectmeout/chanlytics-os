/**
 * One lead as the Leads page would show it (Reach out Part 4, PR 9): what GET leads/[id] reads for the peek of a lead
 * on no page the tab has loaded. The lead in the workspace named, the membership the page would show (00212's
 * lead_member_of, over lead_member_shown, the one rule leads_page asks) and how many places it was found at. Reads
 * run on the session client, so RLS decides what comes back; the page's rows are leads_page's, read by the dashboard.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

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
  tenantId: string,
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

/* ------------------------------------------------- the ideas for a new search -- */

/**
 * What a workspace's searches found and what came of their leads, with where it is (lead_suggest_history, 00398): the
 * jsonb as it comes, which contracts' ideaHistoryOf narrows. The service's read alone: the route checked the member.
 */
export async function readIdeaHistory(db: Db, tenantId: string): Promise<Json> {
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
export async function claimIdeas(db: Db, tenantId: string, line: string): Promise<string | null> {
  const got = await writeIdeas(db, { p_tenant_id: tenantId, p_act: "claim", p_line: line });
  return typeof got.claim === "string" && got.claim ? got.claim : null;
}

/**
 * Keeps the ideas written under a claim, while the claim stands (00399, 00400): false when it was let go meanwhile (the
 * owner saved a line, or a slower write was taken over), and nothing is written.
 */
export async function keepIdeas(db: Db, tenantId: string, claim: string, row: IdeasKept): Promise<boolean> {
  const got = await writeIdeas(db, {
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
  return got.kept === true;
}

/** The model would not write them under this claim: the claim let go, and the next reads say so for a while. */
export async function failIdeas(db: Db, tenantId: string, claim: string): Promise<void> {
  await writeIdeas(db, { p_tenant_id: tenantId, p_act: "fail", p_claim: claim });
}

/**
 * The owner's own words for what they do (00400, act line): kept with no ideas and no basis, so the next read asks
 * again; the owner's word clears any claim, so a write in flight finds its claim gone.
 */
export async function saveIdeasLine(db: Db, tenantId: string, line: string): Promise<void> {
  await writeIdeas(db, { p_tenant_id: tenantId, p_act: "line", p_line: line });
}

/**
 * New ideas (00471, act again): the same line written again, so the next write asks the model, with the ideas shown
 * kept to be passed on (ideaPassed), so the four it writes are new ones. Like a line, it clears any claim.
 */
export async function againIdeas(db: Db, tenantId: string): Promise<void> {
  await writeIdeas(db, { p_tenant_id: tenantId, p_act: "again" });
}

/**
 * The workspace's clock and language as its row says them (tenants.timezone, tenants.locale), or null where the row
 * cannot be read: the month the ideas' room is counted in, and the language they are written in (00399). Read on the
 * member's session; the server's tenantFactsOf says the clock where the row says none.
 */
export async function ideasClockAndLanguage(
  db: Db,
  tenantId: string,
): Promise<{ timezone: string | null; locale: string | null } | null> {
  const { data, error } = await db.from("tenants").select("timezone, locale").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`tenants: ${error.message}`);
  return data;
}

/**
 * When the workspace's newest round ended, or null when none has: what its ideas are written over (lead_suggestions.basis),
 * so a round that ends since asks for new ones. Read on the member's session: rounds are a member's to read.
 */
export async function ideasBasis(db: Db, tenantId: string): Promise<string | null> {
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
export async function leadCardsLive(db: Db): Promise<string[]> {
  const { data, error } = await db.rpc("lead_cards_live");
  if (error) throw new Error(`cannot read which cards find leads: ${error.message}`);
  return data ?? ["local_businesses"];
}

/**
 * A people search (00430 lead_people_search_create), as the member signed in: the plan, where it was made, the estimate
 * the route worked out and the Ask thread it was planned in. The door's own refusals ({error, sentence}) come back as
 * its answer; a thrown one is a request it refused outright.
 */
export async function leadPeopleSearchCreate(
  db: Db,
  p: { tenantId: string; plan: Json; via: "people" | "ask"; estimateUsd: number; threadId: string | null },
): Promise<{ search_id?: string; round_id?: string; error?: string; sentence?: string }> {
  const { data, error } = await db.rpc("lead_people_search_create", {
    p_tenant_id: p.tenantId,
    p_plan: p.plan,
    p_via: p.via,
    p_estimate_usd: p.estimateUsd,
    ...(p.threadId ? { p_thread_id: p.threadId } : {}),
  });
  if (error) throw new Error(`lead_people_search_create: ${error.message}`);
  return (data ?? {}) as { search_id?: string; round_id?: string; error?: string; sentence?: string };
}

/** What the addressee door answers (00430 lead_addressee_choose): the choice made, or the door's refusal by its code. */
type LeadAddresseeAnswer =
  | { ok: true; addressee: number; email_state: string; version: number }
  | { ok?: undefined; error: string; sentence?: string };

/**
 * The owner's choice of who a company lead's reach-out writes to (00430 lead_addressee_choose), as the member signed in:
 * the index of one of the people its source named. The door's own refusals ({error}, and a spend's {error, sentence})
 * come back as its answer; a thrown one is a request it refused outright (not signed in, not this member's lead).
 */
export async function leadAddresseeChoose(
  db: Db,
  p: { leadId: string; person: number },
): Promise<{ data: LeadAddresseeAnswer; error: null } | { data: null; error: { code?: string; message: string } }> {
  const { data, error } = await db.rpc("lead_addressee_choose", { p_lead_id: p.leadId, p_person: p.person });
  if (error) return { data: null, error };
  return { data: (data ?? { error: "no_answer" }) as LeadAddresseeAnswer, error: null };
}

/**
 * A people run's page of companies (00430 lead_company_upsert), service role: a lead for each new company, waiting in
 * Needs review on its address, and the people a company already held gains. Idempotent.
 */
export async function leadCompanyUpsert(
  db: Db,
  roundId: string,
  companies: Json[],
): Promise<{ made: number; held: number; left_out: number }> {
  const { data, error } = await db.rpc("lead_company_upsert", { p_round_id: roundId, p_companies: companies });
  if (error) throw new Error(`lead_company_upsert: ${error.message}`);
  const r = (data ?? {}) as { made?: number; held?: number; left_out?: number };
  return { made: r.made ?? 0, held: r.held ?? 0, left_out: r.left_out ?? 0 };
}

/**
 * Each lead's country (two letters, as the finder kept it; null where it kept none), by id: what the reach-out check
 * reads a lead's place by (decision 0056, 9). Service role; a read that fails throws.
 */
export async function leadCountriesOf(db: Db, ids: readonly string[]): Promise<Map<string, string | null>> {
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
