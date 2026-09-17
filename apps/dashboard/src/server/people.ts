import type { PersonRowDto } from "@chanlytics/contracts";
import type { RouteContext } from "./with-route";

/**
 * Everyone who has written to or phoned a workspace, with the reply mode in
 * force for each — their own row when set, else the workspace's — so a list
 * can say "Held for you" instead of "Answering" for someone the owner asked
 * the receptionist to stay away from.
 *
 * One row per live person (never erased, never merged), computed in SQL by
 * `people_list` under the caller's own RLS. Shared by the People list and the
 * CSV export so the two never disagree about who exists.
 */
/** Rows per page: what people_list answers at most, and what the page loads at a time. */
export const PEOPLE_PAGE = 1000;

export interface PeoplePage {
  /** A name, their WhatsApp name, their email address, or three digits of the number. */
  q?: string | null;
  offset?: number;
  limit?: number;
}

/**
 * The characters a name or a number holds, and nothing else.
 *
 * ONE sanitizer for both halves of the People page: `people_list` interpolates
 * the needle into `ilike '%' || p_query || '%'`, where `%` and `_` are
 * wildcards, and countPeople strips them before building its `or()` filter. A
 * search for `a%b` matched `a<anything>b` in the list and the literal `ab` in
 * the count, so `total` described a different set than the rows beside it and
 * `has_more` stopped paging early or never stopped at all.
 */
export function searchNeedle(q: string | null | undefined): string {
  return (q ?? "").trim().replace(/[,()"'\\%*_]/g, "");
}

export async function listPeople(ctx: Pick<RouteContext, "supabase">, tenantId: string, page: PeoplePage = {}): Promise<PersonRowDto[]> {
  const q = searchNeedle(page.q) || null;
  const offset = page.offset ?? 0;
  const limit = page.limit ?? PEOPLE_PAGE;
  // The page arguments are named only when they leave their defaults: a
  // database that has not been given 00112 yet answers the first page as it
  // always has, and refuses nothing.
  const args = {
    p_tenant_id: tenantId,
    ...(q ? { p_query: q } : {}),
    ...(offset > 0 ? { p_offset: offset } : {}),
    ...(limit !== PEOPLE_PAGE ? { p_limit: limit } : {}),
  };
  const { data, error } = await ctx.supabase.rpc("people_list", args);
  if (error) throw new Error(error.message);
  const { data: pols, error: polErr } = await ctx.supabase
    .from("policies")
    .select("subject_type, subject_id, mode")
    .eq("tenant_id", tenantId)
    .eq("class", "reply");
  if (polErr) console.error("people_policies_read_failed", polErr.message);
  const workspaceMode = pols?.find((p) => p.subject_type === null)?.mode ?? null;
  const personMode = new Map((pols ?? []).filter((p) => p.subject_type === "contact").map((p) => [p.subject_id, p.mode]));
  return ((data ?? []) as PersonRowDto[]).map((r) => ({
    ...r,
    effective_reply_mode: personMode.get(r.id) ?? workspaceMode,
  }));
}

/**
 * EVERYONE, a page at a time.
 *
 * `people_list` clamps p_limit to 1000 in the database (00112), so one call is
 * one page however it is asked — and a caller that wants the whole workspace
 * and does not loop gets 1000 rows with no error, no flag and no way to tell
 * them from "that is everyone". Every read that means all of them goes through
 * here.
 */
export async function everyone(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<PersonRowDto[]> {
  const all: PersonRowDto[] = [];
  for (let offset = 0; ; offset += PEOPLE_PAGE) {
    const page = await listPeople(ctx, tenantId, { offset, limit: PEOPLE_PAGE });
    all.push(...page);
    if (page.length < PEOPLE_PAGE) break;
  }
  return all;
}

/**
 * How many live people there are, or match a query: the page's "N of M", and
 * whether there is a next page. Counted where the rows are (never erased,
 * never merged), with the same four matches the search uses (00125 added the
 * address to both, together: a count that matches less than the list pages
 * wrong). The query is
 * kept to the characters a name or a number holds, so a comma cannot reach
 * the filter grammar.
 */
export async function countPeople(ctx: Pick<RouteContext, "supabase">, tenantId: string, q: string | null): Promise<number> {
  let query = ctx.supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("erased_at", null)
    .is("merged_into_contact_id", null);
  const needle = searchNeedle(q);
  if (needle) {
    const digits = needle.replace(/\D/g, "");
    const clauses = [`display_name.ilike.*${needle}*`, `wa_profile_name.ilike.*${needle}*`, `email.ilike.*${needle}*`, ...(digits.length >= 3 ? [`phone_e164.ilike.*${digits}*`] : [])];
    query = query.or(clauses.join(","));
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}
