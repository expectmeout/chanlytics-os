/**
 * A broadcast's run, as the send job and its settlement read and write it (packages/jobs broadcast-send.ts and
 * settle.ts, decision 0111): its row, its state moved along (scheduled, sending, failed), its people's sends counted and
 * written, the people of a batch, and what a run that died already sent them. Each answer is the database's as it came;
 * the job says its failures in its own words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;
type Run = { tenantId: string; broadcastId: string };

/** The columns a run reads of its broadcast. */
const RUN_COLUMNS =
  "id, state, name, template_name, template_language, params, recipient_count, playbook_id:step_id, audience, offered_start, offered_end, offered_from";

/** The broadcast a run sends, or null. */
export const findBroadcastRun = async (db: Db, run: Run) =>
  db.from("sequence_batches").select(RUN_COLUMNS).eq("id", run.broadcastId).eq("tenant_id", run.tenantId).maybeSingle();

/** Only the broadcast's state: whether it is still wanted. */
export const findBroadcastState = async (db: Db, run: Run) =>
  db.from("sequence_batches").select("state").eq("id", run.broadcastId).eq("tenant_id", run.tenantId).maybeSingle();

/** The broadcast moved from scheduled to sending; no row back means it was not scheduled. */
export const startBroadcastRun = async (db: Db, run: Run, at: string) =>
  db
    .from("sequence_batches")
    .update({ state: "sending", started_at: at })
    .eq("id", run.broadcastId)
    .eq("tenant_id", run.tenantId)
    .eq("state", "scheduled")
    .select("id");

/** The broadcast failed, unless it failed already: the first stop is the run's. */
export const failBroadcastRun = async (db: Db, run: Run, failure: string, at: string) =>
  db
    .from("sequence_batches")
    .update({ state: "failed", failure, finished_at: at })
    .eq("id", run.broadcastId)
    .eq("tenant_id", run.tenantId)
    .neq("state", "failed")
    .select("id");

/** A run that died, failed while it still stood scheduled or sending: no row back means it finished by itself. */
export const failInterruptedBroadcast = async (db: Db, run: Run, at: string) =>
  db
    .from("sequence_batches")
    .update({ state: "failed", failure: "run_interrupted", finished_at: at })
    .eq("id", run.broadcastId)
    .eq("tenant_id", run.tenantId)
    .in("state", ["scheduled", "sending"])
    .select("id");

/** How many of the broadcast's people stand in a state (all of them when none is named), and for a reason when named. */
export function countBroadcastSends(db: Db, run: Run, where: { state?: string; reason?: string } = {}) {
  let query = db
    .from("sequence_sends")
    .select("contact_id", { count: "exact", head: true })
    .eq("tenant_id", run.tenantId)
    .eq("batch_id", run.broadcastId);
  if (where.state) query = query.eq("state", where.state);
  if (where.reason) query = query.eq("reason", where.reason);
  return query;
}

/** One person's send on the broadcast, written; the caller may narrow it further (a claim takes only a queued row). */
export const writeBroadcastSend = async (
  db: Db,
  run: Run & { contactId: string },
  patch: Database["public"]["Tables"]["sequence_sends"]["Update"],
) =>
  db
    .from("sequence_sends")
    .update(patch)
    .eq("tenant_id", run.tenantId)
    .eq("batch_id", run.broadcastId)
    .eq("contact_id", run.contactId)
    .is("lead_id", null);

/** A person's send on a run written only while it is still queued: the person back, none when another took it. */
export const claimBroadcastSend = async (
  db: Db,
  run: Run & { contactId: string },
  patch: Database["public"]["Tables"]["sequence_sends"]["Update"],
) =>
  db
    .from("sequence_sends")
    .update(patch)
    .eq("tenant_id", run.tenantId)
    .eq("batch_id", run.broadcastId)
    .eq("contact_id", run.contactId)
    .is("lead_id", null)
    .eq("state", "queued")
    .select("contact_id");

/** The people of a batch, as a run reads them to judge and send: their numbers, addresses, consents and names. */
export const listBatchPeople = async (db: Db, tenantId: string, ids: string[]) =>
  db
    .from("contacts")
    .select(
      "id, phone_e164, consent, dnc, marketing_consent, erased_at, display_name, wa_profile_name, email, email_marketing, name_source, name_settled_at",
    )
    .in("id", ids)
    .eq("tenant_id", tenantId);

/** The messages the broadcast already left these people: sent, delivered or read, with its id in their meta. */
export const listBroadcastMessagesTo = async (db: Db, run: Run, contactIds: string[]) =>
  db
    .from("messages")
    .select("id, contact_id, created_at")
    .eq("tenant_id", run.tenantId)
    .in("contact_id", contactIds)
    .filter("meta->>broadcast_id", "eq", run.broadcastId)
    .in("status", ["sent", "delivered", "read"]);
