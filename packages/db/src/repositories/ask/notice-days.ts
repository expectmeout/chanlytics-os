/**
 * One morning per business (ask_notice_days, 00575): which businesses are due, what was said lately, and the line it leaves on the
 * bell. Read and written by the sweep with the service role. A database before the table reads as nothing said yet.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, type TenantId } from "@chanlytics/contracts";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The businesses the morning looks at, each with its clock and the last day it was looked at. Paused ones are not. */
export async function listBusinessesForMorning(
  db: Db,
): Promise<Array<{ id: string; timezone: string; lastDay: string | null }>> {
  const { data, error } = await db.from("tenants").select("id, timezone, status").eq("status", "active").limit(5000);
  if (error) throw new DbFailure(error, "tenants");
  const rows = data ?? [];
  if (rows.length === 0) return [];
  // The newest day of each: a morning looks back no further than yesterday, wherever on earth it is.
  const since = new Date(Date.now() - 2 * 24 * 3600_000).toISOString().slice(0, 10);
  const days = await db
    .from("ask_notice_days")
    .select("tenant_id, day")
    .gte("day", since)
    .order("day", { ascending: false })
    .limit(10000);
  const last = new Map<string, string>();
  for (const d of days.data ?? []) if (!last.has(d.tenant_id)) last.set(d.tenant_id, d.day);
  return rows.map((r) => ({ id: r.id, timezone: r.timezone ?? "UTC", lastDay: last.get(r.id) ?? null }));
}

/** Who may act on what Ask noticed, first among them: the owners, then the partners. */
export async function listOwnerSeats(db: Db, tenantId: TenantId): Promise<Array<{ user_id: string; role: string }>> {
  const { data, error } = await db
    .from("memberships")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "partner"])
    .limit(5);
  if (error) throw new DbFailure(error, "memberships");
  return [...(data ?? [])].sort((a, b) => (a.role === "owner" ? -1 : 0) - (b.role === "owner" ? -1 : 0));
}

/** What was said since a day: not said again. */
export async function listAskNoticeKeysSince(db: Db, tenantId: TenantId, sinceDay: string): Promise<string[]> {
  const { data } = await db.from("ask_notice_days").select("key").eq("tenant_id", tenantId).gte("day", sinceDay);
  return (data ?? []).flatMap((r) => (r.key ? [r.key] : []));
}

/** Today was looked at, and this was said, or nothing. */
export async function insertAskNoticeDay(db: Db, tenantId: TenantId, day: string, key: string | null): Promise<void> {
  const { error } = await db
    .from("ask_notice_days")
    .upsert({ tenant_id: tenantId, day, key }, { onConflict: "tenant_id,day" });
  if (error) throw new DbFailure(error, "ask_notice_days");
}

/**
 * The line it leaves on the bell, for everyone who may act: the kept kind every morning line is (ask_cards), which closes itself
 * as it is read. The caller schedules the job that tells their phones and browsers.
 */
export async function keepNoticeAlert(
  db: Db,
  tenantId: TenantId,
  notice: { title: string; route: string },
): Promise<string | null> {
  const { data, error } = await db
    .from("notifications")
    .insert({ tenant_id: tenantId, kind: "ask_cards", title: notice.title, body: "", route: notice.route })
    .select("id")
    .maybeSingle();
  if (error) throw new DbFailure(error, "notifications");
  return data?.id ?? null;
}

/** How many review replies are written and held for a person's word (decision 0064, step 6). */
export async function countHeldReviewReplies(db: Db, tenantId: TenantId): Promise<number> {
  const { count, error } = await db
    .from("google_reviews")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .not("draft_text", "is", null)
    .is("reply_text", null);
  if (error) throw new DbFailure(error, "google_reviews");
  return count ?? 0;
}
