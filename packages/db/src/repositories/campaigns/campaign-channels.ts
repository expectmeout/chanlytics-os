/**
 * The facts a campaign's channels are judged by (One message, every channel, step 3; contracts reach-for.ts
 * channelsReady): the WhatsApp number's config, and the texting line a text would leave on. The dashboard's composers
 * and routes and the edge's playbook runs read them here, so both ask the same rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentChannel } from "@chanlytics/contracts";
import type { Database } from "../../database.types";
import { IDS_PER_READ } from "../people";

type Db = SupabaseClient<Database>;

/**
 * The active WhatsApp number (the oldest, where a workspace holds two: the one a send goes from when nothing says which
 * its person wrote to): its config (its quality, limit and standing, as Meta last said them) and the number itself (E.164:
 * offers on it are judged by Meta's pause on marketing messages to US numbers, contracts whatsapp-offers.ts), or null with
 * none. Throws on a failed read.
 */
export async function whatsappChannelFacts(
  db: Db,
  tenantId: string,
): Promise<{ config: Record<string, unknown>; number: string | null } | null> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("config, number_e164")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`whatsapp_channel_config: ${error.message}`);
  if (!data) return null;
  const cfg = data.config;
  return {
    config: cfg && typeof cfg === "object" && !Array.isArray(cfg) ? cfg : {},
    number: data.number_e164 ?? null,
  };
}

/**
 * The line a text would leave on, as the edge's sender picks it (apps/edge/lib/sms/sms.ts smsLineForTenant: the newest
 * with a messaging service, not failed), with the two facts a send asks of it; null with none. Throws on a failed read.
 */
export async function textLineFacts(
  db: Db,
  tenantId: string,
): Promise<{ sms_state: string | null; reg_mock: boolean | null } | null> {
  const { data, error } = await db
    .from("lines")
    .select("sms_state, reg_mock")
    .eq("tenant_id", tenantId)
    .not("messaging_service_sid", "is", null)
    .neq("voice_state", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`text_line_facts: ${error.message}`);
  return data ?? null;
}

/**
 * The channels a playbook ticks (`playbooks.channels`), for an edit that names none: the row's own, and null when the
 * row has none or the column is not there yet (a database 00298 has not reached), which the check reads as WhatsApp
 * alone. Any other failed read throws.
 */
export async function playbookChannels(db: Db, playbookId: string): Promise<string[] | null> {
  const { data, error } = await db.from("playbooks").select("channels").eq("id", playbookId).maybeSingle();
  if (error) {
    if (/channels/.test(error.message) && /does not exist|could not find/i.test(error.message)) return null;
    throw new Error(`playbook_channels: ${error.message}`);
  }
  return data?.channels ?? null;
}

/**
 * One playbook, read for a change of its channels alone (Ask's card): its name, moment, class and message from its row,
 * and whether a run of it waits for approval (`run_waits`: that run keeps the channels it was made with, which core
 * run-playbook stores as it enrols). In the workspace named, under the caller's row security; null where it
 * has no such playbook. The channels it keeps are playbookChannels', which knows a database 00298 has not reached.
 * Throws on a failed read.
 */
export async function playbookForChannels(
  db: Db,
  tenantId: string,
  playbookId: string,
): Promise<
  | (Pick<
      Database["public"]["Tables"]["playbooks"]["Row"],
      "id" | "name" | "trigger" | "policy_class" | "template_id"
    > & { run_waits: boolean })
  | null
> {
  const { data, error } = await db
    .from("playbooks")
    .select("id, name, trigger, policy_class, template_id")
    .eq("tenant_id", tenantId)
    .eq("id", playbookId)
    .maybeSingle();
  if (error) throw new Error(`playbook_for_channels: ${error.message}`);
  if (!data) return null;
  const waiting = await db
    .from("broadcasts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("playbook_id", playbookId)
    .eq("state", "pending_approval")
    .limit(1);
  if (waiting.error) throw new Error(`playbook_for_channels: ${waiting.error.message}`);
  return { ...data, run_waits: (waiting.data ?? []).length > 0 };
}

type PlaybookRowOf = Database["public"]["Tables"]["playbooks"]["Row"];

/**
 * One playbook as a change in place is judged against it (core checkPlaybookPatch; Ask's change card, PUT
 * playbooks/:id's patch): its row under the caller's RLS, and the run of it that waits for approval, with how many it is
 * for, which a pause leaves waiting (D8). Null where the workspace has no such playbook. A reach-out's root is one too:
 * its sheet's Pause is a change of its state. Throws on a failed read.
 */
export async function playbookForChange(
  db: Db,
  tenantId: string,
  playbookId: string,
): Promise<
  | (Pick<
      PlaybookRowOf,
      | "id"
      | "name"
      | "trigger"
      | "state"
      | "policy_class"
      | "run_hour"
      | "cap_per_run"
      | "gap_days"
      | "cadence_days"
      | "list_id"
      | "list_key"
    > & { waiting: { id: string; recipient_count: number } | null })
  | null
> {
  const { data, error } = await db
    .from("playbooks")
    .select("id, name, trigger, state, policy_class, run_hour, cap_per_run, gap_days, cadence_days, list_id, list_key")
    .eq("tenant_id", tenantId)
    .eq("id", playbookId)
    .maybeSingle();
  if (error) throw new Error(`playbook_for_change: ${error.message}`);
  if (!data) return null;
  const waiting = await db
    .from("broadcasts")
    .select("id, recipient_count")
    .eq("tenant_id", tenantId)
    .eq("playbook_id", playbookId)
    .eq("state", "pending_approval")
    .limit(1);
  if (waiting.error) throw new Error(`playbook_for_change: ${waiting.error.message}`);
  const [w] = waiting.data ?? [];
  return { ...data, waiting: w ? { id: w.id, recipient_count: w.recipient_count } : null };
}

/**
 * The running playbooks of a workspace on one moment, list and message (the moment spec, D9): a second "set up my
 * campaigns" proposed a twin win-back, which the week's breath then left reaching nobody. Each by its id and name. Throws
 * on a failed read.
 */
export async function runningTwins(
  db: Db,
  tenantId: string,
  on: { trigger: string; listId: string | null; listKey: string | null; templateId: string },
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db
    .from("playbooks")
    .select("id, name, list_id, list_key")
    .eq("tenant_id", tenantId)
    .eq("state", "running")
    .eq("trigger", on.trigger)
    .eq("template_id", on.templateId);
  if (error) throw new Error(`running_twins: ${error.message}`);
  // The same list, or none on both: a moment's playbooks name no list, a list's name exactly one of the two.
  return (data ?? [])
    .filter((p) => (p.list_id ?? null) === on.listId && (p.list_key ?? null) === on.listKey)
    .map((p) => ({ id: p.id, name: p.name }));
}

/**
 * Whether a read failed because the database has not reached the migration that adds a channel column it named: a
 * person's `consent_channels` and `marketing_channels` (00297), or a recipient's `channel` (00298). Postgres's 42703,
 * "column ... does not exist", read by its words as readLeadContext reads it. The caller reads again without the
 * columns: the arrays then read as null (WhatsApp alone) and the recipient's channel as null (WhatsApp), so every reply,
 * booking link and WhatsApp broadcast of code that shipped before its migration goes on. Either deploy order works.
 */
export function noChannelColumns(error: { message: string } | null | undefined): boolean {
  return (
    !!error &&
    /\b(consent_channels|marketing_channels|channel)\b/.test(error.message) &&
    /does not exist|could not find/i.test(error.message)
  );
}

/**
 * Whether a read failed because the database has not reached 00299, which gives a person `has_relationship` (whether they
 * wrote, called or have a deal, the other way into an offer by email), as a column PostgREST serves. The caller reads again
 * without it: the relationship then reads as absent, which fails closed (contracts mayMessageFor): no offer by email goes
 * to someone on that fact alone, and every reply, booking link, reminder and WhatsApp offer of code that shipped before
 * its migration goes on. Either deploy order works.
 */
export function noRelationshipColumn(error: { message: string } | null | undefined): boolean {
  return !!error && /\bhas_relationship\b/.test(error.message) && /does not exist|could not find/i.test(error.message);
}

/** Postgres's SQLSTATE for a column that is not there (undefined_column): what PostgREST answers a read that names one. */
const UNDEFINED_COLUMN = "42703";

/**
 * Up to `limit` people of a run still queued, in the order of their ids, each with their own words, the channel the run
 * picked for them (00298) and how many times they were claimed and given back (`attempt`, 00301): what the batch sends
 * from. The order is part of the read: without one the database may hand back a different few of a long run's queued
 * people on every read, and a person released and read again must come back the same way each time.
 *
 * A database that has not reached a migration lacks its column, and Postgres says so by its code (42703), whichever
 * column it was: the read is made again without the newest one first (`attempt`: the batch then names its emails as it
 * did before, by the run's waits), and without the channel too (everyone goes by WhatsApp, as every run did). Any other
 * failed read throws.
 */
export async function queuedRecipients(
  db: Db,
  p: { tenantId: string; broadcastId: string; limit: number },
): Promise<Array<{ contact_id: string; facts: unknown; channel?: string | null; attempt?: number }>> {
  const withAttempt = await db
    .from("broadcast_recipients")
    .select("contact_id, facts, channel, attempt")
    .eq("tenant_id", p.tenantId)
    .eq("broadcast_id", p.broadcastId)
    .eq("state", "queued")
    .order("contact_id")
    .limit(p.limit);
  if (!withAttempt.error) return withAttempt.data ?? [];
  if (withAttempt.error.code !== UNDEFINED_COLUMN) throw new Error(`queued_recipients: ${withAttempt.error.message}`);
  const withChannel = await db
    .from("broadcast_recipients")
    .select("contact_id, facts, channel")
    .eq("tenant_id", p.tenantId)
    .eq("broadcast_id", p.broadcastId)
    .eq("state", "queued")
    .order("contact_id")
    .limit(p.limit);
  if (!withChannel.error) return withChannel.data ?? [];
  if (withChannel.error.code !== UNDEFINED_COLUMN) throw new Error(`queued_recipients: ${withChannel.error.message}`);
  const bare = await db
    .from("broadcast_recipients")
    .select("contact_id, facts")
    .eq("tenant_id", p.tenantId)
    .eq("broadcast_id", p.broadcastId)
    .eq("state", "queued")
    .order("contact_id")
    .limit(p.limit);
  if (bare.error) throw new Error(`queued_recipients: ${bare.error.message}`);
  return bare.data ?? [];
}

/**
 * Whether anyone on a run, in any state, goes another way than `than` (a recipient's channel, 00298; none is WhatsApp, a
 * row written before recipients had one): the question a hold on one channel asks of it. WhatsApp's template not being
 * approved holds the run's WhatsApp people alone, and a hold on the workspace's offers and news by email its email people
 * alone. On a database 00298 has not reached everyone goes by WhatsApp. Any other failed read throws.
 */
export async function runGoesByOthers(
  db: Db,
  tenantId: string,
  broadcastId: string,
  than: "whatsapp" | "email",
): Promise<boolean> {
  const of = db
    .from("broadcast_recipients")
    .select("contact_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("broadcast_id", broadcastId);
  const { count, error } = await (than === "whatsapp"
    ? of.in("channel", ["sms", "email"])
    : of.or("channel.is.null,channel.eq.whatsapp,channel.eq.sms"));
  if (noChannelColumns(error)) return than === "email";
  if (error) throw new Error(`run_goes_by_others: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * The campaign messages (a broadcast's or a playbook run's) a workspace sent on a channel this calendar month, in its
 * zone, that left or may still leave (00298): what its month's allowance on that channel has spent, as `monthSent` counts
 * the cold emails. `at` is the instant the month is read at (now when none).
 */
export async function campaignMonthSent(db: Db, tenantId: string, channel: ConsentChannel, at?: Date): Promise<number> {
  const { data, error } = await db.rpc("campaign_month_sent", {
    p_tenant_id: tenantId,
    p_channel: channel,
    ...(at ? { p_at: at.toISOString() } : {}),
  });
  if (error) throw new Error(`cannot count the month's ${channel} campaign messages: ${error.message}`);
  if (typeof data !== "number")
    throw new Error(`cannot count the month's ${channel} campaign messages: the database answered no count`);
  return data;
}

/**
 * People of a run just assembled, held at once: each still queued is skipped, with `reason`, which is what the send would
 * have done at the wire (the month's allowance, core campaigns/allowance.ts). Only a person still queued is touched, so
 * one the send already settled is left as it is, and the write is the same one the send's own hold makes (jobs
 * broadcast-send: state skipped, a reason). In steps of IDS_PER_READ, a request's address being as long as its ids. Throws
 * on a failed write; people already held in an earlier step stay held, the rest queued, and the send holds those.
 */
export async function holdRecipients(
  db: Db,
  p: { tenantId: string; broadcastId: string; contactIds: readonly string[]; reason: string },
): Promise<void> {
  for (let i = 0; i < p.contactIds.length; i += IDS_PER_READ) {
    const { error } = await db
      .from("broadcast_recipients")
      .update({ state: "skipped", reason: p.reason })
      .eq("tenant_id", p.tenantId)
      .eq("broadcast_id", p.broadcastId)
      .eq("state", "queued")
      .in("contact_id", p.contactIds.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`hold_recipients: ${error.message}`);
  }
}
