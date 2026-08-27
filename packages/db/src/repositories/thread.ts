/**
 * Gate 1b: the bot's working memory, read from Postgres.
 *
 * Until now the receptionist's memory lived in Vercel Blob and Postgres was a
 * write-only shadow — which meant every surface we built read a MIRROR of the
 * truth, and the two had to be kept in step by hand. Three of our worst bugs
 * came from that gap (an operator take-over clobbered by a webhook writing a
 * stale whole-object, archived threads swallowing new messages, a reply
 * scheduled before its mirror write).
 *
 * This returns the same four things the Blob blob did, so the caller's logic is
 * untouched — only the source moves:
 *   history      last turns fed to the model
 *   pausedUntil  a human is handling this thread
 *   replies      bot sends in the last 24h (rate cap)
 *   seen         retry dedupe — NOT needed here: ingest_inbound's is_new is an
 *                atomic gate on a unique index, which is strictly stronger than
 *                a 40-entry array that two concurrent lambdas could both miss.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

export interface ThreadTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PgThreadState {
  history: ThreadTurn[];
  seen: string[];
  pausedUntil: number;
  replies: number[];
}

/** Outbound rows only count as memory once they actually left. A canceled or
 *  failed send was never seen by the customer, so it must not appear in the
 *  model's context as something "we said". */
const DELIVERED = ["sent", "delivered", "read"];

const DAY_MS = 24 * 3600 * 1000;

/**
 * Blob-era voice notes, imported by the backfill as ordinary assistant turns.
 * Every one of them is now ALSO a native call_summary row written by the Retell
 * webhook, so leaving both in would show the model each call twice — in two
 * different formats — and it would reasonably conclude the customer phoned
 * twice as often as they did. The native row is canonical; this is the copy.
 */
const BLOB_CALL_NOTE = /^\[voice call note /;

const isBackfill = (m: { meta?: unknown }): boolean =>
  !!m.meta && typeof m.meta === "object" &&
  (m.meta as Record<string, unknown>).backfill === true;

/** True event time. A backfilled row has no channel_ts and its created_at is
 *  when the IMPORT ran, so it can only ever be placed approximately. */
const effectiveAt = (m: { channel_ts: string | null; created_at: string }): number =>
  new Date(m.channel_ts ?? m.created_at).getTime();

export async function readThreadState(
  db: Db,
  tenantId: string,
  conversationId: string,
  pausedUntilIso: string | null,
  historyLimit = 16,
): Promise<PgThreadState> {
  const since = new Date(Date.now() - DAY_MS).toISOString();

  const [recent, replies] = await Promise.all([
    db
      .from("messages")
      .select("body, sender, direction, type, status, created_at, channel_ts, meta")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(historyLimit * 3), // headroom: duplicates and blanks drop out below
    db
      .from("messages")
      .select("created_at, meta")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("sender", "ai")
      .eq("direction", "outbound")
      .in("status", DELIVERED)
      .gte("created_at", since),
  ]);

  if (recent.error) throw new Error(`readThreadState/history: ${recent.error.message}`);
  if (replies.error) throw new Error(`readThreadState/replies: ${replies.error.message}`);

  const kept = (recent.data ?? []).filter((m) => {
    const body = (m.body ?? "").trim();
    if (!body) return false; // media placeholders carry no text to reason over
    if (m.direction === "outbound" && !DELIVERED.includes(String(m.status))) return false;
    if (isBackfill(m) && BLOB_CALL_NOTE.test(body)) return false; // native row wins
    return true;
  });

  // Order by when things actually happened, so a call the customer made
  // yesterday sits before a message we sent this morning.
  kept.sort((a, b) => effectiveAt(a) - effectiveAt(b));

  const history: ThreadTurn[] = kept.map((m) => ({
    // A call note is the customer's own history on another channel — the
    // receptionist should know the call happened, same as it did on Blob.
    role: m.sender === "customer" ? "user" : "assistant",
    content: (m.body ?? "").trim(),
  }));

  return {
    history: history.slice(-historyLimit),
    seen: [],
    pausedUntil: pausedUntilIso ? new Date(pausedUntilIso).getTime() : 0,
    // Imported rows carry the timestamp of the IMPORT, not of a send. Counting
    // them would let a backfill silence the bot for a day against a cap it
    // never actually spent.
    replies: (replies.data ?? [])
      .filter((r) => !isBackfill(r))
      .map((r) => new Date(r.created_at).getTime()),
  };
}
