/**
 * What a caller's record holds, for the one question a call asks of it (decision 0136, contracts voice/call-back-owed.ts):
 * whether the workspace said their thread is not a customer's, and whether the business talks with them. Five small
 * reads, side by side, asked only of a call that would ask a person for a call back. Any that fails is thrown: the
 * door then asks for the call back, as it always did.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure } from "@chanlytics/contracts";
import type { CallerFacts, ContactId, TenantId } from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** A member's two words about a thread (00539): the newer one is what stands. */
const THREAD_WORDS = ["not_a_customer", "reply_anyway"] as const;

/** The newer of a member's two words about the thread, or null: an undone "not a customer" is no word. */
async function lastWordOf(db: Db, tenantId: TenantId, conversationId: string): Promise<CallerFacts["lastWord"]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("decisions")
    .select("verb, payload")
    .eq("subject_type", "conversation")
    .eq("subject_id", conversationId)
    .in("verb", [...THREAD_WORDS])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "reading a member's word about a caller's thread");
  if (data?.verb === "reply_anyway") return "reply_anyway";
  const payload = data?.payload;
  const undone = !!payload && typeof payload === "object" && !Array.isArray(payload) && payload.undone === true;
  return data?.verb === "not_a_customer" && !undone ? "not_a_customer" : null;
}

/** Whether words went between them: anything the business sent, or anything they wrote. A call's note is the system's. */
async function wroteWith(db: Db, tenantId: TenantId, conversationId: string): Promise<boolean> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .neq("sender", "system")
    .or("direction.eq.outbound,sender.eq.customer")
    .limit(1);
  if (error) throw new DbFailure(error, "reading whether the business writes with a caller");
  return (data ?? []).length > 0;
}

/** Whether the business has phoned them. */
async function phonedThem(db: Db, tenantId: TenantId, contactId: ContactId): Promise<boolean> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("calls")
    .select("id")
    .eq("contact_id", contactId)
    .eq("direction", "outbound")
    .limit(1);
  if (error) throw new DbFailure(error, "reading whether the business phoned a caller");
  return (data ?? []).length > 0;
}

/** A caller's record, as contracts' callerStandingOf reads it. */
export async function findCallerFacts(
  db: Db,
  tenantId: TenantId,
  caller: { conversationId: string; contactId: ContactId | null },
): Promise<CallerFacts> {
  const { conversationId, contactId } = caller;
  const scoped = tenantDb(db, tenantId);
  const [thread, person, lastWord, wrote, phoned] = await Promise.all([
    scoped.from("conversations").select("set_aside_at, set_aside_why").eq("id", conversationId).maybeSingle(),
    contactId ? scoped.from("contacts").select("acquired_via, name_source").eq("id", contactId).maybeSingle() : null,
    lastWordOf(db, tenantId, conversationId),
    wroteWith(db, tenantId, conversationId),
    contactId ? phonedThem(db, tenantId, contactId) : false,
  ]);
  if (thread.error) throw new DbFailure(thread.error, "reading a caller's thread");
  if (person?.error) throw new DbFailure(person.error, "reading a caller's record");
  return {
    setAsideAt: thread.data?.set_aside_at ?? null,
    setAsideWhy: thread.data?.set_aside_why ?? null,
    lastWord,
    wrote,
    phoned,
    acquiredVia: person?.data?.acquired_via ?? null,
    nameSource: person?.data?.name_source ?? null,
  };
}
