import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantConfig, getTenantConfigAsMember, type Database, type TenantConfigRow } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";

/**
 * The workspace's configuration row, whole, as the server reads it on a member's behalf: the one way the dashboard
 * reads it.
 *
 * The calendar feed's address in it grants read access to the owner's calendar, so the database shows it whole to the
 * owner alone. A member's session reads the row through tenant_config_read (00365), which masks it for anyone else, and
 * from 00366 the table is the owner's alone to read: a session in a browser can no longer read the address at all. The
 * server needs it for every member all the same. The Calendar and the receptionist's openings read the feed, and a save
 * writes the whole column back, so a masked address would be fetched as a feed or saved over the real one. So where the
 * session's row came back with the address hidden, the row is read again with the service role: the session's answer
 * is the floor (a member of this workspace, or nothing is read), and what the server holds is the row as stored. What
 * the server answers still hides the address from whoever may not see it (readers/settings.ts feedVisibleTo).
 * `db` is the member's session. Null: no row, or not a member.
 */
export async function configRowOf(db: SupabaseClient<Database>, tenantId: string): Promise<TenantConfigRow | null> {
  const row = await getTenantConfigAsMember(db, tenantId);
  return row?.feed_hidden ? getTenantConfig(serviceDb(), tenantId) : row;
}

/** The configuration as stored, for a member's session: configRowOf's `config`, or null with no row. */
export async function storedConfigOf(db: SupabaseClient<Database>, tenantId: string): Promise<unknown> {
  return (await configRowOf(db, tenantId))?.config ?? null;
}
