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
  /** A name, their WhatsApp name, or three digits of the number. */
  q?: string | null;
  offset?: number;
  limit?: number;
}

/** Everyone in People, a page at a time: people_list answers at most PEOPLE_PAGE rows, and the pool a broadcast or a run picks from is never one page of it. */
export async function everyone(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<PersonRowDto[]> {
  const all: PersonRowDto[] = [];
  for (let offset = 0; ; offset += PEOPLE_PAGE) {
    const page = await listPeople(ctx, tenantId, { offset, limit: PEOPLE_PAGE });
    all.push(...page);
    if (page.length < PEOPLE_PAGE) break;
  }
  return all;
}

export async function listPeople(ctx: Pick<RouteContext, "supabase">, tenantId: string, page: PeoplePage = {}): Promise<PersonRowDto[]> {
  const q = page.q?.trim() || null;
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
 * How many live people there are, or match a query: the page's "N of M", and
 * whether there is a next page. Counted where the rows are (never erased,
 * never merged), with the same three matches the search uses. The query is
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
  const needle = (q ?? "").trim().replace(/[,()"'\\%*]/g, "");
  if (needle) {
    const digits = needle.replace(/\D/g, "");
    const clauses = [`display_name.ilike.*${needle}*`, `wa_profile_name.ilike.*${needle}*`, ...(digits.length >= 3 ? [`phone_e164.ilike.*${digits}*`] : [])];
    query = query.or(clauses.join(","));
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}
