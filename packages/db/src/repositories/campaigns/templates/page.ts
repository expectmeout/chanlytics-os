/**
 * What the Messages page reads of a workspace's templates and where they went (decision 0111): the templates, the
 * runs and steps that send each, and what left, person by person and from the Inbox. Read on the member's own client,
 * each naming the workspace. Each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../database.types";

type Db = SupabaseClient<Database>;

/** The workspace's templates, by name. */
export const listTemplatesForPage = async (db: Db, tenantId: string) =>
  db
    .from("templates")
    .select(
      "id, channel, name, language, body_preview, variables, category, meta_status, quality, rejected_reason, synced_at, source, hidden_at, title, components",
    )
    .eq("tenant_id", tenantId)
    .order("name");

/** One page (`from` to `to`) of the workspace's runs, each with its template and what sent it. */
export const pageRunsOfTemplates = async (db: Db, tenantId: string, from: number, to: number) =>
  db
    .from("sequence_batches")
    .select("id, template_name, playbook_id:step_id, sequence_id, name, state, created_at")
    .eq("tenant_id", tenantId)
    .order("id")
    .range(from, to);

/** The workspace's steps, each with its template, its clock and its place in its sequence. */
export const listStepsOfTemplates = async (db: Db, tenantId: string) =>
  db
    .from("sequence_steps")
    .select("id, name, template_name, state, trigger, run_hour, cadence_days, until, sequence_id, place")
    .eq("tenant_id", tenantId);

/** One page (`from` to `to`) of what the workspace's runs sent, person by person. */
export const pageSendsSent = async (db: Db, tenantId: string, from: number, to: number) =>
  db
    .from("sequence_sends")
    .select("broadcast_id:batch_id, state, sent_at")
    .eq("tenant_id", tenantId)
    .is("lead_id", null)
    .eq("state", "sent")
    .order("batch_id")
    .order("contact_id")
    .range(from, to);

/** A template the Inbox sent: its name, WhatsApp's id for the send, and when. */
interface InboxTemplateSend {
  template_name: string | null;
  external_id: string | null;
  created_at: string;
}

/**
 * One page (`from` to `to`) of the templates the Inbox sent that WhatsApp took. Typed by hand: the inferred type of this
 * chain on `messages` is past what the compiler will write into a declaration (TS7056).
 */
export const pageTemplatesFromInbox = async (
  db: Db,
  tenantId: string,
  from: number,
  to: number,
): Promise<{ data: InboxTemplateSend[] | null; error: { message: string } | null }> =>
  db
    .from("messages")
    .select("template_name, external_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("direction", "outbound")
    .not("template_name", "is", null)
    .not("external_id", "is", null)
    .order("id")
    .range(from, to);
