/**
 * What Ask's proposal cards read before they offer anything (decision 0111): the person, their deals and the mode
 * their replies take, the workspace's rule of a class, the thread a reply or a verb is for, the message a steer is
 * about, and the thread's open escalation. Read on the member's own client, each naming the workspace. Each answer is
 * the database's as it came; the tool says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

import type { SchemaSet, TenantId, ContactId } from "@chanlytics/contracts";
type Db = SupabaseClient<Database>;

/** One of the workspace's people as a card names them, or none. */
export const findPersonCard = async (db: Db, tenantId: TenantId, contactId: ContactId) =>
  db
    .from("contacts")
    .select("id, display_name, wa_profile_name, phone_e164, email, erased_at")
    .eq("tenant_id", tenantId)
    .eq("id", contactId)
    .maybeSingle();

/** A person's deals, newest first. */
export const listDealsOfPerson = async (db: Db, tenantId: TenantId, contactId: ContactId) =>
  db
    .from("deals")
    .select("id, stage, service, version, created_at")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

/** The mode a person's replies take, where the workspace set one for them, or none. */
export const findPersonReplyModeRow = async (db: Db, tenantId: TenantId, contactId: ContactId) =>
  db
    .from("policies")
    .select("mode")
    .eq("tenant_id", tenantId)
    .eq("class", "reply")
    .eq("subject_type", "contact")
    .eq("subject_id", contactId)
    .maybeSingle();

/** The workspace's own rule of a class: its mode and limits, or none. */
export const findWorkspaceRule = async (db: Db, tenantId: TenantId, ruleClass: SchemaSet<"policies.class">) =>
  db
    .from("policies")
    .select("mode, limits")
    .eq("tenant_id", tenantId)
    .eq("class", ruleClass)
    .is("subject_type", null)
    .maybeSingle();

/** One of the workspace's threads as a reply is offered on it: its state, its windows, and its person. */
export const findThreadForReply = async (db: Db, tenantId: TenantId, conversationId: string) =>
  db
    .from("conversations")
    .select(
      "id, tenant_id, contact_id, state, last_inbound_at, last_wa_inbound_at:last_inbound_on_whatsapp, last_ig_inbound_at:last_inbound_on_instagram, contacts (id, display_name, wa_profile_name, phone_e164, email, consent, dnc)",
    )
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

/** One of the workspace's messages as a steer names it, or none. */
export const findMessageCard = async (db: Db, tenantId: TenantId, messageId: string) =>
  db
    .from("messages")
    .select("id, conversation_id, sender, status, body, type, direction, created_at")
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

/** One of the workspace's threads as a verb is offered on it: its state, who has it, its snooze and its person. */
export const findThreadCard = async (db: Db, tenantId: TenantId, conversationId: string) =>
  db
    .from("conversations")
    .select("id, state, assignee_user_id, snooze_until, contacts (display_name, wa_profile_name, phone_e164, email)")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

/** A thread's newest open escalation, or none. */
export const findOpenEscalationOf = async (db: Db, tenantId: TenantId, conversationId: string) =>
  db
    .from("escalations")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("tenant_id", tenantId)
    .eq("state", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
