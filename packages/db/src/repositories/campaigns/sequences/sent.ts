/**
 * What Sent (a workspace's runs) and the playbooks' pages read of the runs and who they reached (decision 0111): the
 * runs' rows, a run's people a page at a time, a person's runs, the consent changes and replies since a run, and the
 * playbooks' own steps. Read on the member's own client, each naming the workspace. Each answer is the database's as
 * it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types";
import type { TenantId, ContactId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What a run's row is read with: the same set of columns on every list of runs. */
const RUN_ROW_COLUMNS =
  "id, name, template_id, template_name, template_language, params, audience, state, scheduled_for, started_at, finished_at, recipient_count, failure, created_at, playbook_id:step_id, run_for, sequence_id, offered_start, offered_end, offered_from";

/** These runs of the workspace's, newest first. */
export const listRunRowsByIds = async (db: Db, tenantId: TenantId, runIds: string[]) =>
  db
    .from("sequence_batches")
    .select(RUN_ROW_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("id", runIds)
    .order("created_at", { ascending: false });

/** The workspace's newest runs, `limit` of them. */
export const listRecentRunRows = async (db: Db, tenantId: TenantId, limit: number) =>
  db
    .from("sequence_batches")
    .select(RUN_ROW_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

/** Every run a playbook made, newest first. */
export const listPlaybookRunRows = async (db: Db, tenantId: TenantId) =>
  db
    .from("sequence_batches")
    .select(RUN_ROW_COLUMNS)
    .eq("tenant_id", tenantId)
    .not("step_id", "is", null)
    .order("created_at", { ascending: false });

/** One of the workspace's runs, or none. */
export const findRunRow = async (db: Db, tenantId: TenantId, runId: string) =>
  db.from("sequence_batches").select(RUN_ROW_COLUMNS).eq("tenant_id", tenantId).eq("id", runId).maybeSingle();

/** These runs' names, playbooks, audiences and times. */
export const listRunNames = async (db: Db, tenantId: TenantId, runIds: string[]) =>
  db
    .from("sequence_batches")
    .select("id, name, playbook_id:step_id, audience, scheduled_for, created_at")
    .eq("tenant_id", tenantId)
    .in("id", runIds);

/** One page (`from` to `to`) of a run's people, the latest sent first, each with the channel it went by. */
export const pageRunPeople = async (db: Db, tenantId: TenantId, runId: string, from: number, to: number) =>
  db
    .from("sequence_sends")
    .select(
      "channel, broadcast_id:batch_id, contact_id, message_id, state, reason, sent_at, messages(conversation_id, status, meta, external_id), contacts(display_name, wa_profile_name, phone_e164, email, erased_at, merged_into_contact_id, name_source, name_settled_at)",
    )
    .eq("tenant_id", tenantId)
    .eq("batch_id", runId)
    .is("lead_id", null)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("contact_id")
    .range(from, to);

/** One page (`from` to `to`) of the sends a person was on, by run. */
export const pagePersonSends = async (db: Db, tenantId: TenantId, contactId: ContactId, from: number, to: number) =>
  db
    .from("sequence_sends")
    .select("broadcast_id:batch_id, state, reason, sent_at, message_id, channel")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .is("lead_id", null)
    .order("batch_id")
    .range(from, to);

/** One page (`from` to `to`) of these runs' people, with their message's thread, state and receipt. */
export const pagePeopleOnRuns = async (db: Db, tenantId: TenantId, runIds: string[], from: number, to: number) =>
  db
    .from("sequence_sends")
    // With the channel each went by (00298), so a run says what each sent and its read is WhatsApp's (0030).
    .select(
      "broadcast_id:batch_id, contact_id, state, reason, sent_at, channel, messages(conversation_id, status, meta)",
    )
    .eq("tenant_id", tenantId)
    .is("lead_id", null)
    .in("batch_id", runIds)
    .order("batch_id")
    .order("contact_id")
    .range(from, to);

/** These people's consent changes since `since`. */
export const listConsentChangesSince = async (db: Db, tenantId: TenantId, contactIds: ContactId[], since: string) =>
  db
    .from("events")
    .select("id, subject_id, data, created_at")
    .eq("tenant_id", tenantId)
    .eq("kind", "contact.consent_changed")
    .in("subject_id", contactIds)
    .gt("created_at", since);

/** One page (`from` to `to`) of the customers' messages on these threads since `since`, with their words or without. */
export const pageInboundOn = async (
  db: Db,
  tenantId: TenantId,
  page: { conversationIds: string[]; since: string; withWords: boolean; from: number; to: number },
) =>
  db
    .from("messages")
    .select(page.withWords ? "conversation_id, created_at, meta, body" : "conversation_id, created_at, meta")
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .eq("sender", "customer")
    .in("conversation_id", page.conversationIds)
    .gt("created_at", page.since)
    .order("id")
    .range(page.from, page.to);

/** What went out on these threads since `since`: who sent it, its kind and its meta. */
export const listOutboundSince = async (db: Db, tenantId: TenantId, conversationIds: string[], since: string) =>
  db
    .from("messages")
    .select("conversation_id, created_at, sender, type, meta")
    .eq("tenant_id", tenantId)
    .eq("direction", "outbound")
    .in("conversation_id", conversationIds)
    .gt("created_at", since);

/** One page (`from` to `to`) of the workspace's proposals still out. */
export const pageProposalsOut = async (db: Db, tenantId: TenantId, from: number, to: number) =>
  db
    .from("deals")
    .select("id, contact_id, proposed_at")
    .eq("tenant_id", tenantId)
    .eq("stage", "proposed")
    .order("id")
    .range(from, to);

/** The workspace's proposal follow-up playbook, or none. */
export const findProposalFollowUp = async (db: Db, tenantId: TenantId) =>
  db
    .from("sequence_steps")
    .select("id, sequence_id, state, run_hour, last_run_for, until, template_name, template_language, words_ok_at")
    .eq("tenant_id", tenantId)
    .eq("trigger", "proposal_waiting")
    .maybeSingle();

/** The workspace's steps with `columns` (the moments alone, or every one), newest first. */
export const listStepsWith = async (db: Db, tenantId: TenantId, columns: string, momentsOnly: boolean) => {
  const q = db.from("sequence_steps").select(columns).eq("tenant_id", tenantId);
  return (momentsOnly ? q.eq("kind", "moment") : q).order("created_at", { ascending: false });
};

/** The list a step runs on, or none. */
export const findStepList = async (db: Db, stepId: string) =>
  db.from("sequence_steps").select("list_id").eq("id", stepId).maybeSingle();
