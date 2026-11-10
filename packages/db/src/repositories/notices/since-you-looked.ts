/**
 * What happened since a member last looked (Today in three zones, 2 Nov 2026): when they last closed the bell, and what
 * the receptionist answered since, which Today's "Since you looked" line says beside the bell's own notes. On the
 * member's own session: RLS decides what it may read.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, isReachOutRun, personName, runTitleOf, DbFailure } from "@chanlytics/contracts";
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
): Promise<{
  count: number;
  last: { body: string; created_at: string; contact_id: ContactId | null; conversation_id: string | null } | null;
}> {
  const { data, count, error } = await db
    .from("messages")
    .select("body, created_at, contact_id, conversation_id", { count: "exact" })
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
    last: last
      ? {
          body: last.body ?? "",
          created_at: last.created_at,
          contact_id: last.contact_id,
          conversation_id: last.conversation_id,
        }
      : null,
  };
}

/** The newest batches one read looks through for what left since: a member away for weeks is told of the latest. */
const SENT_SINCE_BATCHES = 40;
/** How far before `since` a batch may have been made and still have sent after it: a day's batch goes over hours. */
const MADE_BEFORE_MS = 3 * DAY_MS;

/** What one sequence sent since: how many of its messages left, and when the last did. */
export interface SequenceSentSince {
  id: string;
  name: string;
  sent: number;
  last_at: string;
  leads: boolean;
}

/**
 * What the workspace's sequences sent since `since` (decision 0120): its newest batches that are going or gone, each
 * counted by the sends that left after `since` (the batch's own index), folded by sequence. A sequence is named as its
 * newest batch that sent is (contracts runTitleOf), and is to leads where that batch is a cold email's: the batches say
 * both, so the page that hears a batch hears all this read draws. `more` when the batches read were as many as one read
 * takes, so older ones may have sent too. On the member's own session.
 */
export async function listSentSince(
  db: Db,
  params: { tenantId: TenantId; since: string },
): Promise<{ sequences: SequenceSentSince[]; more: boolean }> {
  const madeFrom = new Date(Date.parse(params.since) - MADE_BEFORE_MS).toISOString();
  const batches = await db
    .from("sequence_batches")
    .select("id, sequence_id, name, run_for, audience")
    .eq("tenant_id", params.tenantId)
    .in("state", ["sending", "sent"])
    .gte("created_at", madeFrom)
    .order("created_at", { ascending: false })
    .limit(SENT_SINCE_BATCHES);
  if (batches.error) throw new DbFailure(batches.error, "cannot read the batches that went");
  const rows = batches.data;
  if (rows.length === 0) return { sequences: [], more: false };
  const bySequence = new Map<string, SequenceSentSince>();
  // One batch at a time, the newest first: each is one count over its own index, and a workspace has a handful since a
  // member looked.
  for (const batch of rows) {
    const left = await db
      .from("sequence_sends")
      .select("sent_at", { count: "exact" })
      .eq("tenant_id", params.tenantId)
      .eq("batch_id", batch.id)
      .eq("state", "sent")
      .gt("sent_at", params.since)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (left.error) throw new DbFailure(left.error, "cannot count what a batch sent");
    const last = left.data[0]?.sent_at;
    const sent = left.count ?? 0;
    if (!last || sent === 0) continue;
    const had = bySequence.get(batch.sequence_id);
    bySequence.set(
      batch.sequence_id,
      had
        ? { ...had, sent: had.sent + sent, last_at: had.last_at > last ? had.last_at : last }
        : {
            id: batch.sequence_id,
            name: runTitleOf({ name: batch.name, run_for: batch.run_for }),
            sent,
            last_at: last,
            leads: isReachOutRun(batch.audience),
          },
    );
  }
  // Nothing left since: no line, whatever older batches there are.
  if (bySequence.size === 0) return { sequences: [], more: false };
  return { sequences: [...bySequence.values()], more: rows.length === SENT_SINCE_BATCHES };
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
