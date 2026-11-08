/**
 * What the receptionist's upkeep reads and writes of messages left unfinished (decision 0111): a customer's message
 * nobody answered, the replies since, a reply queued that nothing is sending (failed with its note), and the
 * escalations nobody took (00140's deadman doors). Each read is across workspaces on purpose (platformWide): the sweep
 * is the platform's. Each answer is the database's as it came; the sweep says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { platformWide } from "../../shared/tenant-db";

import type { SchemaSet, TenantId } from "@chanlytics/contracts";
type Db = SupabaseClient<Database>;

/** Customers' messages on `channels` made between `after` and `before` and never taken up, the oldest first. */
export const listUnansweredInbound = async (
  db: Db,
  channels: SchemaSet<"messages.channel">[],
  after: string,
  before: string,
  limit: number,
) =>
  platformWide(db)
    .from("messages")
    .select("id, tenant_id, conversation_id, body, created_at, meta")
    .eq("direction", "inbound")
    .eq("sender", "customer")
    .in("channel", channels)
    .gt("created_at", after)
    .lt("created_at", before)
    .is("meta->>processed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

/** The receptionist's or the team's replies in `states` on these threads since `since`. */
export const listRepliesSince = async (
  db: Db,
  conversationIds: string[],
  states: SchemaSet<"messages.status">[],
  since: string,
) =>
  platformWide(db)
    .from("messages")
    .select("conversation_id, created_at, meta")
    .eq("direction", "outbound")
    .in("sender", ["ai", "human"])
    .in("status", states)
    .in("conversation_id", conversationIds)
    .gt("created_at", since);

/** Replies still queued, made between `after` and `before`, the oldest first. */
export const listQueuedReplies = async (db: Db, after: string, before: string, limit: number) =>
  platformWide(db)
    .from("messages")
    .select("id, tenant_id, conversation_id, sender, created_at, meta")
    .eq("status", "queued")
    .gt("created_at", after)
    .lt("created_at", before)
    .order("created_at", { ascending: true })
    .limit(limit);

/** One of the workspace's queued replies failed with `error`, only while still queued: its id back, none when it moved. */
export const failQueuedReply = async (db: Db, tenantId: TenantId, messageId: string, error: Json) =>
  db
    .from("messages")
    .update({ status: "failed", error })
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .eq("status", "queued")
    .select("id");

/** The escalations nobody took for `olderThan` (deadman_candidates). */
export const listDeadmanCandidates = async (db: Db, olderThan: string) =>
  db.rpc("deadman_candidates", { p_older_than: olderThan });

/** These escalations stamped as alerted (deadman_mark_alerted). */
export const markDeadmanAlerted = async (db: Db, escalationIds: string[]) =>
  db.rpc("deadman_mark_alerted", { p_ids: escalationIds });
