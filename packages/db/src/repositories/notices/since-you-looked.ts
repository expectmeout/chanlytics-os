/**
 * What happened since a member last looked (Today in three zones, 2 Nov 2026): when they last closed the bell, and what
 * the receptionist answered since, which Today's "Since you looked" line says beside the bell's own notes. On the
 * member's own session: RLS decides what it may read.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { personName, DbFailure } from "@chanlytics/contracts";
import type { Database } from "../../types";
import { DELIVERED } from "../conversations/thread/history";
import type { TenantId, ContactId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** When a member last closed the bell or marked it read (notification_reads.seen_at); null where they never did. */
export async function findBellSeenAt(db: Db, params: { tenantId: TenantId; userId: string }): Promise<string | null> {
  const { data, error } = await db
    .from("notification_reads")
    .select("seen_at")
    .eq("tenant_id", params.tenantId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "cannot read when the bell was opened");
  return data?.seen_at ?? null;
}

/**
 * What the receptionist answered since `since`: the messages it sent that left (outbound, its own, not failed, not held),
 * counted, and the newest of them, its words and whom it was to.
 */
export async function findAnsweredSince(
  db: Db,
  params: { tenantId: TenantId; since: string },
): Promise<{ count: number; last: { body: string; created_at: string; contact_id: ContactId | null } | null }> {
  const { data, count, error } = await db
    .from("messages")
    .select("body, created_at, contact_id", { count: "exact" })
    .eq("tenant_id", params.tenantId)
    .eq("direction", "outbound")
    .eq("sender", "ai")
    .in("status", DELIVERED)
    .gt("created_at", params.since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new DbFailure(error, "cannot read what the receptionist answered");
  const [last] = data ?? [];
  return {
    count: count ?? 0,
    last: last ? { body: last.body ?? "", created_at: last.created_at, contact_id: last.contact_id } : null,
  };
}

/**
 * A person's name as the receptionist's last reply names them, by the one rule every page names a person by (contracts
 * personName): the name they were given, else what WhatsApp says, else their number, else their address. Null where the
 * read holds no such person.
 */
export async function findContactName(
  db: Db,
  params: { tenantId: TenantId; contactId: ContactId },
): Promise<string | null> {
  const { data, error } = await db
    .from("contacts")
    .select("display_name, wa_profile_name, phone_e164, email")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.contactId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "cannot read whom the reply was to");
  return data ? personName(data) : null;
}
