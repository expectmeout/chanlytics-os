/**
 * The bell as the member's page reads it (decision 0111): the workspace's notices since a day, when the member last
 * looked, and the member's own marks on these notices. Read on the member's own client. Each answer is the database's
 * as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** The workspace's notices since `since`, newest first, `limit` of them. */
export const listBellRows = async (db: Db, tenantId: TenantId, since: string, limit: number) =>
  db
    .from("notifications")
    .select("id, kind, title, body, route, subject_type, subject_id, created_at, closed_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

/** When the member last looked at the workspace's bell and how far they have read it (00614), or none. */
export const findBellSeen = async (db: Db, tenantId: TenantId, userId: string) =>
  db
    .from("notification_reads")
    .select("seen_at, read_through_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

/** The member's own marks (read, dismissed) on these notices. */
export const listNotificationMarks = async (db: Db, userId: string, notificationIds: string[]) =>
  db
    .from("notification_marks")
    .select("notification_id, read_at, dismissed_at")
    .eq("user_id", userId)
    .in("notification_id", notificationIds);
