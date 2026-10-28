/**
 * Ask's drafts written ahead for the threads waiting on a person (decision 0071, 00475): one a thread and kind (a reply,
 * or a call's brief), kept through conversation_draft_keep until the customer writes again, and read back for the rows
 * Today draws. Every call runs as the member signed in: the door checks the caller and the thread, RLS keeps the reads
 * to their workspace.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;

/** A kept draft as the table holds it: its words are the caller's to read (contracts ReplyDraftWords). */
interface ConversationDraftRow {
  conversation_id: string;
  kind: string;
  for_message_id: string | null;
  words: Json;
  made_at: string;
}

/**
 * The drafts kept on these threads, any kind, in the workspace; or, asked for the newest (`{ newest: n }`), the workspace's
 * newest, newest first, at most n and one more: the caller learns from that one whether these are all there are (Today's
 * read of them with its own first reads, before it knows its rows).
 */
export async function conversationDraftsOf(
  db: Db,
  tenantId: string,
  which: readonly string[] | { newest: number },
): Promise<ConversationDraftRow[]> {
  if (Array.isArray(which) && which.length === 0) return [];
  const all = db
    .from("conversation_drafts")
    .select("conversation_id, kind, for_message_id, words, made_at")
    .eq("tenant_id", tenantId);
  const { data, error } = await ("newest" in which
    ? all.order("made_at", { ascending: false }).limit(which.newest + 1)
    : all.in("conversation_id", [...which]));
  if (error) throw new Error(`conversation_drafts: ${error.message}`);
  return data ?? [];
}

/**
 * What a thread's draft is written for: the customer's newest message (a draft answers it, and is stale once they say
 * more), and the open hold's reason and what it left (the receptionist's handover, a call-back's to-do), read under RLS.
 */
export async function threadDraftFacts(
  db: Db,
  tenantId: string,
  conversationId: string,
): Promise<{ forMessageId: string | null; reason: string | null; details: string | null }> {
  const [msg, hold] = await Promise.all([
    db
      .from("messages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("sender", "customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("escalations")
      .select("reason, details")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("state", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (msg.error) throw new Error(`messages: ${msg.error.message}`);
  if (hold.error) throw new Error(`escalations: ${hold.error.message}`);
  const details = hold.data?.details;
  return {
    forMessageId: msg.data?.id ?? null,
    reason: hold.data?.reason ?? null,
    details: typeof details === "string" && details.trim() ? details.trim() : null,
  };
}

/** What the door answered: the draft kept, or its refusal in its own word (not_acting, not_found). */
type ConversationDraftKept = { kept: ConversationDraftRow } | { refused: string };

/** Keep a thread's draft through its door (conversation_draft_keep), for the member signed in. */
export async function conversationDraftKeep(
  db: Db,
  d: { tenantId: string; conversationId: string; kind: string; forMessageId: string | null; words: Json },
): Promise<ConversationDraftKept> {
  const { data, error } = await db.rpc("conversation_draft_keep", {
    p_tenant_id: d.tenantId,
    p_conversation_id: d.conversationId,
    p_kind: d.kind,
    p_words: d.words,
    ...(d.forMessageId ? { p_for_message_id: d.forMessageId } : {}),
  });
  if (error) throw new Error(`conversation_draft_keep: ${error.message}`);
  const r = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  if (typeof r.error === "string") return { refused: r.error };
  return {
    kept: {
      conversation_id: typeof r.conversation_id === "string" ? r.conversation_id : d.conversationId,
      kind: typeof r.kind === "string" ? r.kind : d.kind,
      for_message_id: typeof r.for_message_id === "string" ? r.for_message_id : null,
      words: (r.words ?? {}) as Json,
      made_at: typeof r.made_at === "string" ? r.made_at : new Date().toISOString(),
    },
  };
}
