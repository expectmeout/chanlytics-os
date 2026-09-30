/**
 * Everyone in People, as `people_list` (00112) computes them under the caller's row security.
 *
 * One pager for the dashboard's lists, counts and exports and the edge's playbook sweep: each had its own loop over
 * the same function, with its own page size and its own rule for when to name the page arguments. And the names of a
 * few people by their ids, for a read that holds their ids and not their names (Ask's message search).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NameableContact, PersonRowDto } from "@chanlytics/contracts";
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

/**
 * Where a page of People starts (0021, 00268): just past this place in the kept order, a row's `in_touch_at`,
 * `added_at` and `id`. Someone who writes between two pages moves above it, so a pass that follows it reads nobody
 * twice; they are read on the next pass.
 */
export interface PeopleCursor {
  at: string;
  added: string;
  id: string;
}

/**
 * The place just past a row, when its database says it (00268). Null for a row without it: a database before 00268,
 * whose next page is read by offset, and which is never named a cursor it cannot take.
 */
export function peopleCursorOf(row: PersonRowDto | undefined): PeopleCursor | null {
  return row?.in_touch_at && row.added_at ? { at: row.in_touch_at, added: row.added_at, id: row.id } : null;
}

/**
 * One page of people: after a cursor, or an offset. The page arguments are named only when they leave their defaults,
 * so a database that has not been given 00112 answers the first page as it always has, and one before 00268 is never
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
 * Each page after the first starts just past the last row's place (00268), so nobody is read twice when someone writes
 * between two pages; from a database before 00268, by offset, as it always was.
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
