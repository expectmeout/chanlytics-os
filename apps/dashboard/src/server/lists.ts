import "server-only";
import { AppError } from "@chanlytics/contracts";
import { readAllRows } from "@chanlytics/db";
import type { RouteContext } from "./with-route";

/**
 * Saved lists: what the routes agree on.
 *
 * A list is a name and the people on it. The name is the only thing a person
 * types; the members are ids the page already holds. Both guards live here
 * so the create route and the edit route refuse the same things in the same
 * words.
 */
export interface SavedListDto {
  id: string;
  name: string;
  ids: string[];
}

export const LIST_NAME_MAX = 60;
export const LIST_BATCH_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanListName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > LIST_NAME_MAX) {
    throw new AppError("validation", `A list needs a name of up to ${LIST_NAME_MAX} characters.`);
  }
  return name;
}

/** An optional array of contact ids: absent is empty; anything else must be uuids, deduplicated, bounded. */
export function cleanIdList(raw: unknown, what: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string" || !UUID.test(x))) {
    throw new AppError("validation", `${what} must be a list of contact ids.`);
  }
  const ids = Array.from(new Set(raw as string[]));
  if (ids.length > LIST_BATCH_MAX) throw new AppError("validation", `At most ${LIST_BATCH_MAX} people at a time.`);
  return ids;
}

/**
 * Every saved list of one workspace with every id on it: the People rail, a profile's lists, the broadcast
 * composer's audiences and the assistant's listing all read this. The members are paged (readAllRows): one select
 * answers at most 1000 rows, so past a thousand memberships the lists silently lost people -- on People, on a
 * profile, and in the count the send would then not match.
 */
export async function savedLists(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<SavedListDto[]> {
  const [lists, members] = await Promise.all([
    readAllRows<{ id: string; name: string }>("segments", (from, to) =>
      ctx.supabase
        .from("segments")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    readAllRows<{ segment_id: string; contact_id: string }>("segment_members", (from, to) =>
      ctx.supabase
        .from("segment_members")
        .select("segment_id, contact_id")
        .eq("tenant_id", tenantId)
        .order("segment_id")
        .order("contact_id")
        .range(from, to),
    ),
  ]);
  const byList = new Map<string, string[]>();
  for (const m of members) {
    const ids = byList.get(m.segment_id) ?? [];
    ids.push(m.contact_id);
    byList.set(m.segment_id, ids);
  }
  return lists.map((l) => ({ id: l.id, name: l.name, ids: byList.get(l.id) ?? [] }));
}

/** One saved list with every id on it, or null when this workspace has no such list: what a send to it enrols. */
export async function savedList(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  id: string,
): Promise<SavedListDto | null> {
  const { data: seg, error } = await ctx.supabase
    .from("segments")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!seg) return null;
  const members = await readAllRows<{ contact_id: string }>("segment_members", (from, to) =>
    ctx.supabase
      .from("segment_members")
      .select("contact_id")
      .eq("segment_id", seg.id)
      .order("contact_id")
      .range(from, to),
  );
  return { id: seg.id, name: seg.name, ids: members.map((m) => m.contact_id) };
}
