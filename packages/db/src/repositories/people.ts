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

/** The most ids one read names: `.in()` puts every id in the URL, and a request fails at about two hundred. */
const NAMES_AT_ONCE = 100;

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
  for (let i = 0; i < ids.length; i += NAMES_AT_ONCE) {
    const { data, error } = await db
      .from("contacts")
      .select("id, display_name, wa_profile_name, phone_e164, email")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + NAMES_AT_ONCE));
    if (error) throw new Error(`namesOfPeople: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/**
 * One page of people. The page arguments are named only when they leave their defaults, so a database that has not
 * been given 00112 answers the first page as it always has. A read that fails THROWS: a page the database could not
 * answer is never an empty workspace.
 */
export async function peoplePage(
  db: Db,
  tenantId: string,
  page: { q?: string | null; offset?: number; limit?: number } = {},
): Promise<PersonRowDto[]> {
  const offset = page.offset ?? 0;
  const limit = page.limit ?? PEOPLE_PAGE;
  const { data, error } = await db.rpc("people_list", {
    p_tenant_id: tenantId,
    ...(page.q ? { p_query: page.q } : {}),
    ...(offset > 0 ? { p_offset: offset } : {}),
    ...(limit !== PEOPLE_PAGE ? { p_limit: limit } : {}),
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return (data ?? []) as unknown as PersonRowDto[];
}

/**
 * Everyone, every page of them: whatever counts people counts everyone. One call is at most a thousand rows, and a
 * caller that does not loop gets a thousand with no error, no flag and no way to tell them from "that is everyone".
 */
export async function everyoneIn(db: Db, tenantId: string): Promise<PersonRowDto[]> {
  const all: PersonRowDto[] = [];
  for (let offset = 0; ; offset += PEOPLE_PAGE) {
    const page = await peoplePage(db, tenantId, { offset });
    all.push(...page);
    if (page.length < PEOPLE_PAGE) return all;
  }
}
