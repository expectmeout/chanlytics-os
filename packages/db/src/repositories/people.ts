/**
 * Everyone in People, as `people_list` (00112) computes them under the caller's row security.
 *
 * One pager for the dashboard's lists, counts and exports and the edge's playbook sweep: each had its own loop over
 * the same function, with its own page size and its own rule for when to name the page arguments. And the names of a
 * few people by their ids, for a read that holds their ids and not their names (Ask's message search).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NameableContact, PersonDecisionDto, PersonRowDto } from "@chanlytics/contracts";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

/** Rows per page: what people_list answers at most (the database clamps p_limit to it). */
export const PEOPLE_PAGE = 1000;

/**
 * The most ids one read names: `.in()` puts every id in the URL, and a request fails at about two hundred. The one
 * bound for every read by ids here (namesOfPeople, messageSenders, callersOf).
 */
export const IDS_PER_READ = 100;

/**
 * What these people are called, as contracts' personName makes a name: their name, WhatsApp name, number and address,
 * by id. Read under the caller's row security and the workspace's own filter (RLS would show a member of two workspaces
 * the other's people): a person the caller cannot read, or of another workspace, is not answered. One read for a
 * hundred ids or fewer, in batches past that. A read that fails THROWS: a name the database could not answer is never
 * "Unknown".
 */
export async function namesOfPeople(
  db: Db,
  tenantId: string,
  ids: readonly string[],
): Promise<Array<{ id: string } & NameableContact>> {
  const out: Array<{ id: string } & NameableContact> = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db
      .from("contacts")
      .select("id, display_name, wa_profile_name, phone_e164, email")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`namesOfPeople: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** The most decisions a person's page holds: the newest, so what drops is the oldest history. */
const PERSON_DECISIONS = 500;

/**
 * What a person's page shows of what was decided: the ledger's rows about their threads (a take-over, a snooze, a
 * resolve) and about them (pausing or resuming the receptionist for this person is recorded against the contact, not a
 * thread: core person-mode, many-at-once), newest first, at most PERSON_DECISIONS. One read: a decision is about a
 * contact or a conversation, and an id is never both's, so the subject's kind and its id each name the set and the
 * pair is exactly the person and their threads. A person with no thread still has their own. A read that fails THROWS: a
 * history the database could not answer is never a history with nothing in it.
 */
export async function personDecisions(
  db: Db,
  tenantId: string,
  contactId: string,
  conversationIds: readonly string[],
): Promise<PersonDecisionDto[]> {
  const { data, error } = await db
    .from("decisions")
    .select("id, verb, subject_type, subject_id, actor_type, actor_user_id, created_at, payload")
    .eq("tenant_id", tenantId)
    .in("subject_type", ["contact", "conversation"])
    .in("subject_id", [contactId, ...conversationIds])
    .order("created_at", { ascending: false })
    .limit(PERSON_DECISIONS);
  if (error) throw new Error(`person decisions: ${error.message}`);
  return (data ?? []).map((d) => ({ ...d, payload: d.payload as Record<string, unknown> | null }));
}

/**
 * Where a page of People starts (0021, 00276): just past this place in the kept order, a row's `in_touch_at`,
 * `added_at` and `id`. Someone who writes between two pages moves above it, so a pass that follows it reads nobody
 * twice; they are read on the next pass.
 */
export interface PeopleCursor {
  at: string;
  added: string;
  id: string;
}

/**
 * The place just past a row, when its database says it (00276). Null for a row without it: a database before 00276,
 * whose next page is read by offset, and which is never named a cursor it cannot take.
 */
export function peopleCursorOf(row: PersonRowDto | undefined): PeopleCursor | null {
  return row?.in_touch_at && row.added_at ? { at: row.in_touch_at, added: row.added_at, id: row.id } : null;
}

/**
 * One page of people: after a cursor, or an offset. The page arguments are named only when they leave their defaults,
 * so a database that has not been given 00112 answers the first page as it always has, and one before 00276 is never
 * named a cursor (a cursor comes only from a row that carries its place). A read that fails THROWS: a page the
 * database could not answer is never an empty workspace.
 */
export async function peoplePage(
  db: Db,
  tenantId: string,
  page: { q?: string | null; offset?: number; limit?: number; after?: PeopleCursor | null } = {},
): Promise<PersonRowDto[]> {
  const offset = page.offset ?? 0;
  const limit = page.limit ?? PEOPLE_PAGE;
  const after = page.after ?? null;
  const { data, error } = await db.rpc("people_list", {
    p_tenant_id: tenantId,
    ...(page.q ? { p_query: page.q } : {}),
    ...(offset > 0 ? { p_offset: offset } : {}),
    ...(limit !== PEOPLE_PAGE ? { p_limit: limit } : {}),
    ...(after ? { p_after_at: after.at, p_after_added: after.added, p_after_id: after.id } : {}),
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data ?? [];
}

/**
 * Everyone, every page of them: whatever counts people counts everyone. One call is at most a thousand rows, and a
 * caller that does not loop gets a thousand with no error, no flag and no way to tell them from "that is everyone".
 * Each page after the first starts just past the last row's place (00276), so nobody is read twice when someone writes
 * between two pages; from a database before 00276, by offset, as it always was.
 */
export async function everyoneIn(db: Db, tenantId: string): Promise<PersonRowDto[]> {
  const all: PersonRowDto[] = [];
  for (let after: PeopleCursor | null = null; ;) {
    const page = await peoplePage(db, tenantId, after ? { after } : { offset: all.length });
    all.push(...page);
    if (page.length < PEOPLE_PAGE) return all;
    after = peopleCursorOf(page[page.length - 1]);
  }
}

/**
 * The erasure digests of these values in this workspace (00263 erasure_digests): the database's own, since only it
 * holds the pepper that keys them once the re-key has run. Value → digest, one call for all of them; a value asked
 * twice is asked once. Throws when the database cannot answer: "we could not check" is never "nobody was erased".
 */
export async function erasureDigests(db: Db, tenantId: string, values: string[]): Promise<Map<string, string>> {
  const asked = [...new Set(values.filter((v) => v !== ""))];
  if (asked.length === 0) return new Map();
  const { data, error } = await db.rpc("erasure_digests", { p_tenant_id: tenantId, p_values: asked });
  if (error) throw new Error(`cannot make the erasure digests: ${error.message}`);
  const digests = data ?? [];
  if (digests.length !== asked.length) throw new Error("the erasure digests came back short");
  const out = new Map<string, string>();
  for (const [i, value] of asked.entries()) {
    const digest = digests[i];
    if (digest === undefined) throw new Error("the erasure digests came back short");
    out.set(value, digest);
  }
  return out;
}

/** What the merge door answers (merge_people, 00326): the kept record, the merged one, and what moved. */
interface MergedPeople {
  contact_id: string;
  merged: string;
  tenant_id: string;
  decision_id: string;
  consent: string;
  marketing_consent: string;
  email_marketing: string;
  counts: Record<string, number | string>;
}

/**
 * Two records of one person become one (decision 0028): the one door, `merge_people`, as the signed-in owner. The caller
 * is `auth.uid()` inside the door, so the session client is what is handed in, never the service role. The door's
 * refusals come back as the database's error with the sentence contracts holds (MERGE_REFUSALS); the route turns one
 * into its own status (dbRefusal). Everything the door moves, it moves in one transaction.
 */
export async function mergePeople(db: Db, keep: string, merge: string): Promise<MergedPeople> {
  const { data, error } = await db.rpc("merge_people", { p_keep: keep, p_merge: merge });
  if (error) throw error;
  return mergedOf(data);
}

/**
 * The door's answer read key by key: a word where it said one, the counts as it gave them, never a cast. An answer
 * that names no kept or merged record is not the door's, and is refused rather than read as a success: the merge has
 * committed by then, and the route answers that something went wrong, never a page with nobody on it.
 */
function mergedOf(v: unknown): MergedPeople {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const word = (k: string): string => (typeof o[k] === "string" ? o[k] : "");
  if (!word("contact_id") || !word("merged")) throw new Error("merge_people answered without the two records");
  const counts =
    o.counts && typeof o.counts === "object" && !Array.isArray(o.counts) ? (o.counts as Record<string, unknown>) : {};
  const out: Record<string, number | string> = {};
  for (const [k, n] of Object.entries(counts)) if (typeof n === "number" || typeof n === "string") out[k] = n;
  return {
    contact_id: word("contact_id"),
    merged: word("merged"),
    tenant_id: word("tenant_id"),
    decision_id: word("decision_id"),
    consent: word("consent"),
    marketing_consent: word("marketing_consent"),
    email_marketing: word("email_marketing"),
    counts: out,
  };
}
