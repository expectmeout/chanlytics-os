/** Reach out: emails. */

import { recordOrEmpty, type LeadEmailDto, type TenantId, type ContactId, valueAt } from "@chanlytics/contracts";
import type { Database, Json } from "../../../types";
import { emailWordsFrom } from "./sheet";
import { moveSend, type Db, type ReachOutSendInsert, type ReachOutSendRow, withdrawEmail } from "./reach-out";

/**
 * Whether an email of the lead's own is still on its way (one a lead, 00540's partial index). One taken back with Undo
 * has ended, though the clock has not read it yet: settled here, so writing it again goes straight through.
 */
export async function getLeadEmailOnItsWay(db: Db, tenantId: TenantId, leadId: string): Promise<boolean> {
  const { data, error } = await db
    .from("sequence_sends")
    .select("id, message_id")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .is("sequence_id", null)
    .eq("state", "queued");
  if (error) throw new Error(`cannot read the lead's emails: ${error.message}`);
  let waiting = false;
  for (const s of data ?? []) {
    const email = s.message_id ? await findWrittenEmail(db, { tenantId, id: s.message_id }) : null;
    if (email?.status === "canceled")
      await moveSend(db, { tenantId, id: s.id, from: "queued", patch: { state: "skipped", reason: "canceled" } });
    else waiting = true;
  }
  return waiting;
}

/**
 * A lead's own email kept: its message, where it has one, then its row. "on_its_way" when another took the one place a
 * lead has for one queued (a second press), and its message goes back.
 */
export async function keepLeadEmail(
  db: Db,
  params: { message: MessageInsert | null; send: ReachOutSendInsert },
): Promise<"kept" | "on_its_way"> {
  if (params.message) await insertQueuedEmail(db, params.message);
  const { error } = await db.from("sequence_sends").insert(params.send);
  if (!error) return "kept";
  // Never a queued email no job will send: its job is asked for only once its row is kept. The row's failure is what's said.
  if (params.message)
    await withdrawEmail(db, {
      tenantId: params.send.tenant_id,
      id: params.message.id ?? "",
      reason: "send_moved",
    }).catch(() => false);
  if (error.code !== "23505") throw new Error(`cannot keep the lead's email: ${error.message}`);
  return "on_its_way";
}

/** A lead's own emails, oldest first (GET leads/:id/emails), on the session's client. */
export async function listLeadEmails(db: Db, tenantId: TenantId, leadId: string): Promise<LeadEmailDto[]> {
  const { data, error } = await db
    .from("sequence_sends")
    .select(
      "id, state, reason, sent_at, said_at, created_at, mailbox:mailbox_connections!sequence_sends_mailbox_id_same_workspace(address)",
    )
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .is("sequence_id", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`cannot read the lead's emails: ${error.message}`);
  return (data ?? []).map((s) => ({
    id: s.id,
    state: s.state,
    at: s.sent_at ?? s.created_at,
    from: s.mailbox?.address ?? null,
    said: s.said_at !== null,
    reason: s.reason,
  }));
}

/* ------------------------------------------------------------ the sender -- */

/** The cold emails a workspace wrote this calendar month, in its zone, that left or may still leave (00187). */
export async function readMonthSent(db: Db, tenantId: TenantId, at: Date): Promise<number> {
  const { data, error } = await db.rpc("reach_out_month_sent", {
    p_tenant_id: tenantId,
    p_at: at.toISOString(),
  });
  if (error) throw new Error(`cannot count the month's cold emails: ${error.message}`);
  if (typeof data !== "number") throw new Error("cannot count the month's cold emails: the database answered no count");
  return data;
}

export type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];

/**
 * A reach-out's email, written queued under its own id (core sendMessageId) before its send leaves `claimed`.
 * "exists" when that id is a row already: a writer that died after writing it, whose email this is.
 */
export async function insertQueuedEmail(db: Db, row: MessageInsert): Promise<"written" | "exists"> {
  const { error } = await db.from("messages").insert(row);
  if (!error) return "written";
  if (error.code === "23505") return "exists";
  throw new Error(`cannot write the email: ${error.message}`);
}

/** An email a writer wrote before, as it was frozen: its thread, its person, where it stands, and whom it names. */
export interface WrittenEmail {
  conversation_id: string;
  contact_id: ContactId | null;
  status: string;
  to: string | null;
}

export async function findWrittenEmail(
  db: Db,
  params: { tenantId: TenantId; id: string },
): Promise<WrittenEmail | null> {
  const { data, error } = await db
    .from("messages")
    .select("conversation_id, contact_id, status, meta")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .maybeSingle();
  if (error) throw new Error(`cannot read the written email: ${error.message}`);
  if (!data) return null;
  const to = valueAt(data.meta, "email", "request", "to");
  return {
    conversation_id: data.conversation_id,
    contact_id: data.contact_id,
    status: data.status,
    to: Array.isArray(to) && typeof to[0] === "string" ? to[0] : null,
  };
}

/** Whether an outbound_send job was scheduled for this email: a writer that died after scheduling it. */
export async function sendJobScheduled(db: Db, params: { tenantId: TenantId; messageId: string }): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("kind", "outbound_send")
    .eq("payload->>message_id", params.messageId)
    .limit(1);
  if (error) throw new Error(`cannot read the email's job: ${error.message}`);
  return (data ?? []).length > 0;
}

/** A send's run and its chain as they stand now: the claim read them, and its writer is seconds behind. */
export interface SendStanding {
  run: string | null;
  step: { state: string; template_id: string; after_step_id: string | null } | null;
  root: string | null;
  /** The name the chain signs with ({{your name}}): the root's. */
  signedBy: string | null;
  /** Its owner sends its emails, each handed to them as a draft (the root's owner_sends, 00429). */
  ownerSends: boolean;
  /** How its emails end (the root's signs_with, 00492): its name, or its mailbox's signature. */
  signsWith: "name" | "mailbox";
}

export async function sendStanding(db: Db, reachOutSend: ReachOutSendRow): Promise<SendStanding> {
  const [run, chain] = await Promise.all([
    db
      .from("sequence_batches")
      .select("state")
      .eq("tenant_id", reachOutSend.tenant_id)
      .eq("id", reachOutSend.batch_id)
      .maybeSingle(),
    db
      .from("sequence_steps")
      .select("id, state, template_id, after_step_id, signed_by, owner_sends, signs_with")
      .eq("tenant_id", reachOutSend.tenant_id)
      .in("id", [reachOutSend.step_id ?? reachOutSend.sequence_id, reachOutSend.sequence_id]),
  ]);
  if (run.error) throw new Error(`cannot read the send's run: ${run.error.message}`);
  if (chain.error) throw new Error(`cannot read the send's chain: ${chain.error.message}`);
  const step = reachOutSend.step_id ? (chain.data ?? []).find((p) => p.id === reachOutSend.step_id) : undefined;
  return {
    run: run.data?.state ?? null,
    step: step?.template_id
      ? { state: step.state, template_id: step.template_id, after_step_id: step.after_step_id }
      : null,
    root: (chain.data ?? []).find((p) => p.id === reachOutSend.sequence_id)?.state ?? null,
    signedBy: (chain.data ?? []).find((p) => p.id === reachOutSend.sequence_id)?.signed_by ?? null,
    ownerSends: (chain.data ?? []).find((p) => p.id === reachOutSend.sequence_id)?.owner_sends === true,
    signsWith:
      (chain.data ?? []).find((p) => p.id === reachOutSend.sequence_id)?.signs_with === "mailbox" ? "mailbox" : "name",
  };
}

/** A step's words as an email template holds them: its HEADER is the subject, its BODY the words. */
export async function findEmailWords(
  db: Db,
  tenantId: TenantId,
  templateId: string,
): Promise<{ subject: string | null; body: string } | null> {
  const { data, error } = await db
    .from("templates")
    .select("components, body_preview")
    .eq("tenant_id", tenantId)
    .eq("id", templateId)
    .eq("channel", "email")
    .maybeSingle();
  if (error) throw new Error(`cannot read the step's words: ${error.message}`);
  return data ? emailWordsFrom(data) : null;
}

/** A workspace's name and its configuration, as stored: the foot's who, and the profile its where is read from. */
export async function findWorkspaceNameAndConfig(
  db: Db,
  tenantId: TenantId,
): Promise<{ name: string | null; config: unknown }> {
  const [t, cfg] = await Promise.all([
    db.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (t.error) throw new Error(`cannot read the workspace: ${t.error.message}`);
  if (cfg.error) throw new Error(`cannot read the workspace's configuration: ${cfg.error.message}`);
  return { name: t.data?.name ?? null, config: cfg.data?.config ?? null };
}

/** What a lead's words fill a step's slots with. */
export async function findLeadSlots(
  db: Db,
  tenantId: TenantId,
  leadId: string,
): Promise<{
  business_name: string | null;
  city: string | null;
  /** The finder's checked address, and its check (00429: a draft its owner sends goes to it). */
  email: string | null;
  email_state: string | null;
  /** A place or a company, where it was found, and a company's people (00430): the person slots and the foot read them. */
  kind: string;
  source: string;
  facts: Json;
} | null> {
  const { data, error } = await db
    .from("leads")
    .select("business_name, city, email, email_state, kind, source, facts")
    .eq("tenant_id", tenantId)
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the lead: ${error.message}`);
  return data;
}

/** The address a person has on file, as the send door compares a request's recipient with it. */
export async function findContactEmail(db: Db, tenantId: TenantId, contactId: ContactId): Promise<string | null> {
  const { data, error } = await db
    .from("contacts")
    .select("email")
    .eq("tenant_id", tenantId)
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the person: ${error.message}`);
  return data?.email ?? null;
}

/** A send as it stands now, for a writer whose move found it moved. */
export async function sendNow(
  db: Db,
  params: { tenantId: TenantId; id: string },
): Promise<{ state: string; message_id: string | null } | null> {
  const { data, error } = await db
    .from("sequence_sends")
    .select("state, message_id")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .maybeSingle();
  if (error) throw new Error(`cannot read the send: ${error.message}`);
  return data;
}

/**
 * A run whose emails were handed to its owner, or taken back from them (00429): scheduled becomes sending, and its row is
 * touched either way, since a page hears a run by its row (the feed tells of broadcasts, never of their sends), so
 * Today's, the brief's and Ask's count of the emails waiting reads again.
 */
export async function runHanded(db: Db, params: { tenantId: TenantId; id: string; at: Date }): Promise<void> {
  const { error } = await db
    .from("sequence_batches")
    .update({ state: "sending", updated_at: params.at.toISOString() })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .in("state", ["scheduled", "sending"]);
  if (error) throw new Error(`cannot mark the run handed over: ${error.message}`);
}

/** A run whose first email is written: scheduled becomes sending, through its guard's own move. */
export async function runSending(db: Db, params: { tenantId: TenantId; id: string }): Promise<void> {
  const { error } = await db
    .from("sequence_batches")
    .update({ state: "sending" })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .eq("state", "scheduled");
  if (error) throw new Error(`cannot start the run: ${error.message}`);
}

/** The email a step's send answers (D19): the lead's email on the step before, as its receipt stamped it. */
export interface ParentEmail {
  messageId: string;
  /** Its Message-ID, stamped by its receipt (00128); null until one arrives. */
  rfcMessageId: string | null;
  /** The chain it carried, oldest first. */
  references: string[];
  subject: string | null;
  /** Sent by its owner from their own inbox, on their word (00429): the thread is theirs, so the next email is too. */
  ownerSent: boolean;
}

/** The lead's sent email on the step before this one in its chain; null when it has none. */
export async function findParentEmail(
  db: Db,
  params: { tenantId: TenantId; rootId: string; leadId: string; stepId: string },
): Promise<ParentEmail | null> {
  const { data: sends, error } = await db
    .from("sequence_sends")
    .select("message_id, said_at")
    .eq("tenant_id", params.tenantId)
    .eq("sequence_id", params.rootId)
    .eq("lead_id", params.leadId)
    .eq("step_id", params.stepId)
    .eq("state", "sent")
    .order("sent_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`cannot read the step before's send: ${error.message}`);
  const id = sends?.[0]?.message_id;
  if (!id) return null;
  const { data: m, error: me } = await db
    .from("messages")
    .select("id, meta")
    .eq("tenant_id", params.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (me) throw new Error(`cannot read the step before's email: ${me.message}`);
  if (!m) return null;
  const otherError = recordOrEmpty(valueAt(m.meta, "email"));
  const refs = valueAt(otherError, "request", "headers", "References");
  const subject =
    typeof otherError.subject === "string" ? otherError.subject : valueAt(otherError, "request", "subject");
  return {
    messageId: m.id,
    rfcMessageId: typeof otherError.message_id === "string" && otherError.message_id ? otherError.message_id : null,
    references: typeof refs === "string" ? refs.split(/\s+/).filter(Boolean) : [],
    subject: typeof subject === "string" ? subject : null,
    ownerSent: sends?.[0]?.said_at != null,
  };
}

/**
 * A lead whose address bounced for good (Reach out C11): its address is invalid now, as the finder's own check would
 * say it, so the Leads page shows it and no step or run writes to it again. The address itself already stops at the
 * send door (suppressed). An erased or blanked lead is left as it is. True when the lead was marked.
 */
export async function recordLeadAddressBounced(
  db: Db,
  params: { tenantId: TenantId; leadId: string; at: string; retried?: boolean },
): Promise<boolean> {
  const { data: lead, error } = await db
    .from("leads")
    .select("version, email_state, erased_at, blanked_at")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.leadId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the lead whose address bounced: ${error.message}`);
  if (!lead || lead.erased_at || lead.blanked_at || lead.email_state === "invalid") return false;
  const { data: moved, error: e2 } = await db
    .from("leads")
    .update({ email_state: "invalid", email_checked_at: params.at, version: lead.version + 1 })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.leadId)
    .eq("version", lead.version)
    .select("id");
  if (e2) throw new Error(`cannot mark the lead's address bounced: ${e2.message}`);
  // Worked by a person at the same moment: read again and marked once more; twice, and the receipt comes again.
  if ((moved ?? []).length === 0) {
    if (params.retried) throw new Error("the lead whose address bounced moved while it was marked");
    return recordLeadAddressBounced(db, { ...params, retried: true });
  }
  return true;
}
