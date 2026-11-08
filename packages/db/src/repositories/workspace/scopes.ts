/**
 * What a member's door reads of its subject before it acts, as the member signed in may read it (decision 0111): a
 * thread, a person, a message, a call, a run, a template, a playbook, with the workspace each is of; the member's own
 * workspaces; the decision a verb leaves and the hold it closes. Row-level security decides what the member may see.
 * Each answer is the database's as it came; the door says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import type { ContactId, TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** A thread as a verb on it reads it: its state, its windows, its person and their ways in, or none. */
export const findThreadScope = async (db: Db, conversationId: string) =>
  db
    .from("conversations")
    .select(
      "id, tenant_id, state, paused_until, snooze_until, set_aside_at, set_aside_why, assignee_user_id, last_wa_inbound_at:last_inbound_on_whatsapp, last_ig_inbound_at:last_inbound_on_instagram, last_message_at, last_inbound_at, contact_id, contacts (phone_e164, display_name, wa_profile_name, name_source, name_settled_at, consent, dnc, marketing_consent, email, email_suppressed_at, contact_identities (channel, external_id, created_at))",
    )
    .eq("id", conversationId)
    .maybeSingle();

/** A person as a verb on them reads them: their workspace, their erasure and their yes to offers, or none. */
export const findPersonScope = async (db: Db, contactId: ContactId) =>
  db.from("contacts").select("id, tenant_id, erased_at, marketing_consent").eq("id", contactId).maybeSingle();

/** A person as their erasure reads them: their workspace, number, address and erasure, or none. */
export const findErasableScope = async (db: Db, contactId: ContactId) =>
  db.from("contacts").select("id, tenant_id, phone_e164, email, erased_at").eq("id", contactId).maybeSingle();

/** A message as a verb on it reads it: its workspace, thread, sender and state, or none. */
export const findMessageScope = async (db: Db, messageId: string) =>
  db.from("messages").select("id, tenant_id, conversation_id, sender, status").eq("id", messageId).maybeSingle();

/** A call as a verb on it reads it: its workspace, the provider's id, its state and its recording, or none. */
export const findCallScope = async (db: Db, callId: string) =>
  db.from("calls").select("id, tenant_id, retell_call_id, status, recording").eq("id", callId).maybeSingle();

/** A run as a verb on it reads it, or none. */
export const findRunScope = async (db: Db, runId: string) =>
  db
    .from("sequence_batches")
    .select(
      "id, tenant_id, state, name, recipient_count, playbook_id:step_id, run_for, audience, scheduled_for, offered_start",
    )
    .eq("id", runId)
    .maybeSingle();

/** A template as a verb on it reads it, or none. */
export const findTemplateScope = async (db: Db, templateId: string) =>
  db.from("templates").select("id, tenant_id, name, language").eq("id", templateId).maybeSingle();

/** A playbook as a verb on it reads it: with its class and its message, which a change of its channels is judged by. */
export const findPlaybookScope = async (db: Db, stepId: string) =>
  db
    .from("sequence_steps")
    .select("id, tenant_id, name, state, trigger, policy_class, template_id")
    .eq("id", stepId)
    .maybeSingle();

/** A thread's newest customer messages that a reply can answer on, `limit` of them: their channel and meta. */
export const listCustomerWrites = async (db: Db, tenantId: TenantId, conversationId: string, limit: number) =>
  db
    .from("messages")
    .select("channel, meta")
    .eq("conversation_id", conversationId)
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .eq("sender", "customer")
    .in("type", ["text", "template", "media"])
    .order("channel_ts", { ascending: false, nullsFirst: false })
    .limit(limit);

/** A decision kept on the workspace's record, its id back. */
export const recordDecisionRow = async (db: Db, row: Database["public"]["Tables"]["decisions"]["Insert"]) =>
  db.from("decisions").insert(row).select("id").single();

/** A thread's open holds resolved by a member's decision, their ids back. */
export const resolveOpenHolds = async (db: Db, conversationId: string, userId: string, decisionId: string | null) =>
  db
    .from("escalations")
    .update({ state: "resolved", resolved_by_user_id: userId, decision_id: decisionId })
    .eq("conversation_id", conversationId)
    .eq("state", "open")
    .select("id");

/** The workspace's reply rule's limits, or none. */
export const findReplyLimits = async (db: Db, tenantId: TenantId) =>
  db
    .from("policies")
    .select("limits")
    .eq("tenant_id", tenantId)
    .eq("class", "reply")
    .is("subject_type", null)
    .maybeSingle();

/** The member's workspaces, oldest first: each with their role and the workspace's address, name and clock. */
export const listMyMemberships = async (db: Db, userId: string) =>
  db
    .from("memberships")
    .select("tenant_id, role, tenants (slug, name, timezone)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

/** One take of a rate bucket (take_rate). */
export const takeRateBucket = async (db: Pick<Db, "rpc">, args: Database["public"]["Functions"]["take_rate"]["Args"]) =>
  db.rpc("take_rate", args);
