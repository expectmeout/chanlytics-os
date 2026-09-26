/**
 * Reach out's sends and the doors they go through (Part 3): the one place `reach_out_sends` is typed, and the doors of
 * 00184. The service role asks every one of them (the edge's clock and run); a read or a door that fails throws,
 * because "we could not check" is not "yes".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { maySpend, type BillingMode, type BillingStatus } from "@chanlytics/contracts";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;
export type ReachOutSendRow = Database["public"]["Tables"]["reach_out_sends"]["Row"];
export type ReachOutSendInsert = Database["public"]["Tables"]["reach_out_sends"]["Insert"];

/** What a domain may still send (00184 sending_domain_capacity): the one reading the timetable, the claim and the door share. */
export interface DomainCapacity {
  state: string;
  clean_since: string | null;
  /** The days it sent on since it was clean, within the last 90 (D15). */
  sent_days: number;
  /** What it spends in the rolling day: left, of unknown outcome, queued, claimed. */
  used: number;
  /** When it spends each (ms): those of the rolling day, the waiting ones, and the planned ones ahead. */
  recent: number[];
  last_sent_at: string | null;
}

export async function domainCapacityOf(db: Db, domainId: string, at: Date): Promise<DomainCapacity> {
  const { data, error } = await db.rpc("sending_domain_capacity", {
    p_domain_id: domainId,
    p_at: at.toISOString(),
  } as never);
  if (error) throw new Error(`cannot read the domain's capacity: ${error.message}`);
  const c = (data ?? {}) as Partial<DomainCapacity>;
  if (typeof c.used !== "number" || typeof c.sent_days !== "number")
    throw new Error("cannot read the domain's capacity: the database answered without its counts");
  return {
    state: String(c.state ?? ""),
    clean_since: typeof c.clean_since === "string" ? c.clean_since : null,
    sent_days: c.sent_days,
    used: c.used,
    recent: Array.isArray(c.recent) ? c.recent.map(Number).filter(Number.isFinite) : [],
    last_sent_at: typeof c.last_sent_at === "string" ? c.last_sent_at : null,
  };
}

export interface AudienceLead {
  lead_id: string;
  email: string;
  business_name: string | null;
  city: string | null;
  region: string | null;
  hours: unknown;
}

/**
 * The leads a chain's first step may write to (00191 reach_out_audience), strongest fit first: never one any chain of
 * the workspace planned, held or wrote to, and a catch-all address only when the chain includes them.
 */
export async function reachOutAudience(
  db: Db,
  p: { tenantId: string; searchId: string; limit: number; includeUnconfirmed: boolean },
): Promise<AudienceLead[]> {
  const { data, error } = await db.rpc("reach_out_audience", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    p_limit: p.limit,
    p_include_unconfirmed: p.includeUnconfirmed,
  } as never);
  if (error) throw new Error(`cannot read who a reach-out may write to: ${error.message}`);
  return (data ?? []) as AudienceLead[];
}

export type PersonForSend =
  | { ok: true; contactId: string; conversationId: string; made: boolean }
  | { ok: false; refused: "lead_gone" | "lead_closed" | "no_address" | "already_yours" };

/** The person a first send needs, made once (00184 reach_out_person): never a lead converted by it. */
export async function reachOutPerson(db: Db, tenantId: string, leadId: string): Promise<PersonForSend> {
  const { data, error } = await db.rpc("reach_out_person", { p_tenant_id: tenantId, p_lead_id: leadId } as never);
  if (error) throw new Error(`cannot make the person this send is for: ${error.message}`);
  const r = (data ?? {}) as { refused?: string; contact_id?: string; conversation_id?: string; made?: boolean };
  if (
    r.refused === "lead_gone" ||
    r.refused === "lead_closed" ||
    r.refused === "no_address" ||
    r.refused === "already_yours"
  )
    return { ok: false, refused: r.refused };
  if (!r.contact_id || !r.conversation_id)
    throw new Error("cannot make the person this send is for: no person came back");
  return { ok: true, contactId: r.contact_id, conversationId: r.conversation_id, made: r.made === true };
}

/** Up to `limit` due sends of a running chain on one domain, claimed under its lock within `cap` (00184, C7). */
export async function claimSends(
  db: Db,
  p: { domainId: string; cap: number; at: Date; limit: number },
): Promise<ReachOutSendRow[]> {
  // A share or a limit that is not a whole number is a caller's mistake, never "no cap" (JSON would send NaN as null).
  if (!Number.isInteger(p.cap) || !Number.isInteger(p.limit) || Number.isNaN(p.at.getTime()))
    throw new Error(`cannot claim the domain's due sends: a cap and a limit are whole numbers (${p.cap}, ${p.limit})`);
  const { data, error } = await db.rpc("reach_out_claim", {
    p_domain_id: p.domainId,
    p_cap: p.cap,
    p_at: p.at.toISOString(),
    p_limit: p.limit,
  } as never);
  if (error) throw new Error(`cannot claim the domain's due sends: ${error.message}`);
  return (data ?? []) as ReachOutSendRow[];
}

/** One send's move, only from the state it was read in: a stale writer changes nothing and is told so. */
export async function moveSend(
  db: Db,
  p: { tenantId: string; id: string; from: ReachOutSendRow["state"]; patch: Partial<ReachOutSendRow> },
): Promise<boolean> {
  const { data, error } = await db
    .from("reach_out_sends")
    .update(p.patch as never)
    .eq("tenant_id", p.tenantId)
    .eq("id", p.id)
    .eq("state", p.from)
    .select("id");
  if (error) throw new Error(`cannot move the send: ${error.message}`);
  return (data ?? []).length === 1;
}

export interface FollowerLead {
  lead_id: string;
  contact_id: string;
  email: string;
  region: string | null;
  hours: unknown;
  parent_message_id: string;
  /** The lead's own facts (outreach_lead_facts, keyed by it): the answer the send door will give about them. */
  facts: { lead_stage: string | null; suppressed: boolean; wrote_back: boolean };
  /** Any email of the chain to them bounced or failed for good (C4): the chain stops. */
  bounced: boolean;
}

/** A step's leads: sent the step before at least `afterDays` ago, not on this step yet (00184 reach_out_followers). */
export async function reachOutFollowers(
  db: Db,
  p: { tenantId: string; stepId: string; parentId: string; afterDays: number; limit: number },
): Promise<FollowerLead[]> {
  const { data, error } = await db.rpc("reach_out_followers", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    p_parent_id: p.parentId,
    p_after_days: p.afterDays,
    p_limit: p.limit,
  } as never);
  if (error) throw new Error(`cannot read who a step may write to: ${error.message}`);
  const rows = (data ?? []) as FollowerLead[];
  // The door's facts without the one it added last read as a failed read, as outreachFactsOf does (00181).
  for (const r of rows)
    if (typeof r.facts?.wrote_back !== "boolean")
      throw new Error("cannot read who a step may write to: the database did not say whether they wrote back");
  return rows;
}

/* ------------------------------------------------------------- the clock -- */

/** A queued send and what became of its email (00186 reach_out_queued_outcomes). An email row gone is all nulls. */
export interface QueuedOutcome {
  send: ReachOutSendRow;
  status: string | null;
  error: unknown;
  /** When it left, as its row was stamped (messages_guard's status_at.sent). */
  sent_at: string | null;
  /** When its email row was written. */
  written_at: string | null;
}

/** Queued sends with their emails, the ones with an outcome to read first (00186). */
export async function queuedOutcomes(db: Db, limit: number, tenantId?: string): Promise<QueuedOutcome[]> {
  const { data, error } = await db.rpc("reach_out_queued_outcomes", {
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  } as never);
  if (error) throw new Error(`cannot read the queued sends: ${error.message}`);
  return (data ?? []) as QueuedOutcome[];
}

/** Claims older than `before`, oldest first: a writer that died mid-send left them. */
export async function stuckClaims(db: Db, before: Date, limit: number, tenantId?: string): Promise<ReachOutSendRow[]> {
  let q = db.from("reach_out_sends").select("*").eq("state", "claimed");
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q
    .lt("claimed_at", before.toISOString())
    .order("claimed_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`cannot read the claimed sends: ${error.message}`);
  return data ?? [];
}

/** Planned sends left past `before` in runs that go ahead on running chains (00186 reach_out_stale_sends). */
export async function staleSends(db: Db, before: Date, limit: number, tenantId?: string): Promise<ReachOutSendRow[]> {
  const { data, error } = await db.rpc("reach_out_stale_sends", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  } as never);
  if (error) throw new Error(`cannot read the stale sends: ${error.message}`);
  return (data ?? []) as ReachOutSendRow[];
}

/** The open sends of canceled or failed runs, with their email's state (00186 reach_out_closed_sends). */
export async function closedRunSends(
  db: Db,
  stuckBefore: Date,
  limit: number,
  tenantId?: string,
): Promise<Array<{ send: ReachOutSendRow; email_status: string | null }>> {
  const { data, error } = await db.rpc("reach_out_closed_sends", {
    p_stuck_before: stuckBefore.toISOString(),
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  } as never);
  if (error) throw new Error(`cannot read the closed runs' sends: ${error.message}`);
  return (data ?? []) as Array<{ send: ReachOutSendRow; email_status: string | null }>;
}

/** Reach-out runs that go ahead with nothing left open (00186 reach_out_finishable). */
export async function finishableRuns(db: Db, limit: number, tenantId?: string): Promise<string[]> {
  const { data, error } = await db.rpc("reach_out_finishable", {
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  } as never);
  if (error) throw new Error(`cannot read the runs to finish: ${error.message}`);
  return ((data ?? []) as unknown[]).map((r) =>
    typeof r === "string" ? r : String((r as Record<string, unknown>).reach_out_finishable ?? ""),
  );
}

/** Which of these email ids have a row, a hundred at a time (an id list rides in the request's address). */
export async function writtenEmails(db: Db, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const all = [...new Set(ids)];
  for (let i = 0; i < all.length; i += 100) {
    const { data, error } = await db
      .from("messages")
      .select("id")
      .in("id", all.slice(i, i + 100));
    if (error) throw new Error(`cannot read the sends' emails: ${error.message}`);
    for (const m of data ?? []) out.add(m.id);
  }
  return out;
}

/** An email the clock withdraws while it is still queued (its run was closed): its job then sends nothing. */
export async function withdrawEmail(db: Db, p: { tenantId: string; id: string; reason: string }): Promise<boolean> {
  const why = { reason: p.reason } as unknown as Json;
  const { data, error } = await db
    .from("messages")
    .update({ status: "canceled", error: why })
    .eq("tenant_id", p.tenantId)
    .eq("id", p.id)
    .eq("status", "queued")
    .select("id");
  if (error) throw new Error(`cannot withdraw the email: ${error.message}`);
  return (data ?? []).length > 0;
}

/* ------------------------------------------------------------ the sender -- */

/** A verified domain with a send due, and its workspace. */
export interface DueDomain {
  id: string;
  tenant_id: string;
}

/**
 * The clean, verified domains with sends due in runs that go ahead on running chains, longest waiting first (00187),
 * past the workspaces and domains the caller is done with this tick. The lists ride in the call's body, not its
 * address, so their length is no URL's.
 */
export async function dueDomains(
  db: Db,
  at: Date,
  limit: number,
  opts: { tenantId?: string; skipTenants?: Iterable<string>; skipDomains?: Iterable<string> } = {},
): Promise<DueDomain[]> {
  const { data, error } = await db.rpc("reach_out_due_domains", {
    p_at: at.toISOString(),
    p_limit: limit,
    ...(opts.tenantId ? { p_tenant_id: opts.tenantId } : {}),
    p_skip_tenants: [...(opts.skipTenants ?? [])],
    p_skip_domains: [...(opts.skipDomains ?? [])],
  } as never);
  if (error) throw new Error(`cannot read the domains with sends due: ${error.message}`);
  return (data ?? []) as DueDomain[];
}

/** The cold emails a workspace wrote this calendar month, in its zone, that left or may still leave (00187). */
export async function monthSent(db: Db, tenantId: string, at: Date): Promise<number> {
  const { data, error } = await db.rpc("reach_out_month_sent", {
    p_tenant_id: tenantId,
    p_at: at.toISOString(),
  } as never);
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
  contact_id: string | null;
  status: string;
  to: string | null;
}

export async function writtenEmail(db: Db, p: { tenantId: string; id: string }): Promise<WrittenEmail | null> {
  const { data, error } = await db
    .from("messages")
    .select("conversation_id, contact_id, status, meta")
    .eq("tenant_id", p.tenantId)
    .eq("id", p.id)
    .maybeSingle();
  if (error) throw new Error(`cannot read the written email: ${error.message}`);
  if (!data) return null;
  const to = (data.meta as { email?: { request?: { to?: unknown } } } | null)?.email?.request?.to;
  return {
    conversation_id: data.conversation_id,
    contact_id: data.contact_id,
    status: data.status,
    to: Array.isArray(to) && typeof to[0] === "string" ? to[0] : null,
  };
}

/** Whether an outbound_send job was scheduled for this email: a writer that died after scheduling it. */
export async function sendJobScheduled(db: Db, p: { tenantId: string; messageId: string }): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("kind", "outbound_send")
    .eq("payload->>message_id", p.messageId)
    .limit(1);
  if (error) throw new Error(`cannot read the email's job: ${error.message}`);
  return (data ?? []).length > 0;
}

/** A send's run and its chain as they stand now: the claim read them, and its writer is seconds behind. */
export interface SendStanding {
  run: string | null;
  step: { state: string; template_id: string; after_playbook_id: string | null } | null;
  root: string | null;
  /** The name the chain signs with ({{your name}}): the root's. */
  signedBy: string | null;
}

export async function sendStanding(db: Db, s: ReachOutSendRow): Promise<SendStanding> {
  const [run, chain] = await Promise.all([
    db.from("broadcasts").select("state").eq("tenant_id", s.tenant_id).eq("id", s.broadcast_id).maybeSingle(),
    db
      .from("playbooks")
      .select("id, state, template_id, after_playbook_id, signed_by")
      .eq("tenant_id", s.tenant_id)
      .in("id", [s.playbook_id ?? s.root_id, s.root_id]),
  ]);
  if (run.error) throw new Error(`cannot read the send's run: ${run.error.message}`);
  if (chain.error) throw new Error(`cannot read the send's chain: ${chain.error.message}`);
  const step = s.playbook_id ? (chain.data ?? []).find((p) => p.id === s.playbook_id) : undefined;
  return {
    run: run.data?.state ?? null,
    step: step ? { state: step.state, template_id: step.template_id, after_playbook_id: step.after_playbook_id } : null,
    root: (chain.data ?? []).find((p) => p.id === s.root_id)?.state ?? null,
    signedBy: (chain.data ?? []).find((p) => p.id === s.root_id)?.signed_by ?? null,
  };
}

/** A step's words as an email template holds them: its HEADER is the subject, its BODY the words. */
export async function emailWordsOf(
  db: Db,
  tenantId: string,
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
  if (!data) return null;
  const part = (type: string): string | null => {
    for (const c of Array.isArray(data.components) ? data.components : [])
      if (c && typeof c === "object" && String((c as { type?: unknown }).type ?? "").toUpperCase() === type) {
        const t = (c as { text?: unknown }).text;
        return typeof t === "string" && t.trim() ? t : null;
      }
    return null;
  };
  const body = part("BODY") ?? (data.body_preview?.trim() || null);
  return body ? { subject: part("HEADER"), body } : null;
}

/** A workspace's name and its configuration, as stored: the foot's who, and the profile its where is read from. */
export async function workspaceNameAndConfig(
  db: Db,
  tenantId: string,
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
export async function leadSlotsOf(
  db: Db,
  tenantId: string,
  leadId: string,
): Promise<{ business_name: string | null; city: string | null } | null> {
  const { data, error } = await db
    .from("leads")
    .select("business_name, city")
    .eq("tenant_id", tenantId)
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the lead: ${error.message}`);
  return data;
}

/** The address a person has on file, as the send door compares a request's recipient with it. */
export async function contactEmailOf(db: Db, tenantId: string, contactId: string): Promise<string | null> {
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
  p: { tenantId: string; id: string },
): Promise<{ state: string; message_id: string | null } | null> {
  const { data, error } = await db
    .from("reach_out_sends")
    .select("state, message_id")
    .eq("tenant_id", p.tenantId)
    .eq("id", p.id)
    .maybeSingle();
  if (error) throw new Error(`cannot read the send: ${error.message}`);
  return data;
}

/** A run whose first email is written: scheduled becomes sending, through its guard's own move. */
export async function runSending(db: Db, p: { tenantId: string; id: string }): Promise<void> {
  const { error } = await db
    .from("broadcasts")
    .update({ state: "sending" })
    .eq("tenant_id", p.tenantId)
    .eq("id", p.id)
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
}

/** The lead's sent email on the step before this one in its chain; null when it has none. */
export async function parentEmailOf(
  db: Db,
  p: { tenantId: string; rootId: string; leadId: string; stepId: string },
): Promise<ParentEmail | null> {
  const { data: sends, error } = await db
    .from("reach_out_sends")
    .select("message_id")
    .eq("tenant_id", p.tenantId)
    .eq("root_id", p.rootId)
    .eq("lead_id", p.leadId)
    .eq("playbook_id", p.stepId)
    .eq("state", "sent")
    .order("sent_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`cannot read the step before's send: ${error.message}`);
  const id = sends?.[0]?.message_id;
  if (!id) return null;
  const { data: m, error: me } = await db
    .from("messages")
    .select("id, meta")
    .eq("tenant_id", p.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (me) throw new Error(`cannot read the step before's email: ${me.message}`);
  if (!m) return null;
  const e = ((m.meta as { email?: Record<string, unknown> } | null)?.email ?? {}) as {
    message_id?: unknown;
    subject?: unknown;
    request?: { subject?: unknown; headers?: Record<string, unknown> };
  };
  const refs = e.request?.headers?.References;
  const subject = typeof e.subject === "string" ? e.subject : e.request?.subject;
  return {
    messageId: m.id,
    rfcMessageId: typeof e.message_id === "string" && e.message_id ? e.message_id : null,
    references: typeof refs === "string" ? refs.split(/\s+/).filter(Boolean) : [],
    subject: typeof subject === "string" ? subject : null,
  };
}

/**
 * A lead whose address bounced for good (Reach out C11): its address is invalid now, as the finder's own check would
 * say it, so the Leads page shows it and no step or run writes to it again. The address itself already stops at the
 * send door (suppressed). An erased or blanked lead is left as it is. True when the lead was marked.
 */
export async function leadAddressBounced(
  db: Db,
  p: { tenantId: string; leadId: string; at: string; retried?: boolean },
): Promise<boolean> {
  const { data: lead, error } = await db
    .from("leads")
    .select("version, email_state, erased_at, blanked_at")
    .eq("tenant_id", p.tenantId)
    .eq("id", p.leadId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the lead whose address bounced: ${error.message}`);
  if (!lead || lead.erased_at || lead.blanked_at || lead.email_state === "invalid") return false;
  const { data: moved, error: e2 } = await db
    .from("leads")
    .update({ email_state: "invalid", email_checked_at: p.at, version: lead.version + 1 })
    .eq("tenant_id", p.tenantId)
    .eq("id", p.leadId)
    .eq("version", lead.version)
    .select("id");
  if (e2) throw new Error(`cannot mark the lead's address bounced: ${e2.message}`);
  // Worked by a person at the same moment: read again and marked once more; twice, and the receipt comes again.
  if ((moved ?? []).length === 0) {
    if (p.retried) throw new Error("the lead whose address bounced moved while it was marked");
    return leadAddressBounced(db, { ...p, retried: true });
  }
  return true;
}

/**
 * A lead written to by a reach-out's email: still being written to (ready becomes nurture; a later stage is kept),
 * first contacted when its first email left, its last outcome "emailed", and its event. Written only as it was read
 * (its version), so a person working the lead at the same moment wins and the next email says so again.
 */
export async function leadWritten(
  db: Db,
  p: { tenantId: string; leadId: string; at: string; sendId: string; retried?: boolean },
): Promise<boolean> {
  const { data: lead, error } = await db
    .from("leads")
    .select("stage, version, contacted_at")
    .eq("tenant_id", p.tenantId)
    .eq("id", p.leadId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the lead a send wrote to: ${error.message}`);
  if (!lead) return false;
  const { data: moved, error: e2 } = await db
    .from("leads")
    .update({
      stage: lead.stage === "ready" ? "nurture" : lead.stage,
      contacted_at: lead.contacted_at ?? p.at,
      last_outcome: "emailed",
      version: lead.version + 1,
    })
    .eq("tenant_id", p.tenantId)
    .eq("id", p.leadId)
    .eq("version", lead.version)
    .select("id");
  if (e2) throw new Error(`cannot record the lead as written to: ${e2.message}`);
  // Worked by a person at the same moment: read again and write once more (it only merges), then say it was not.
  if ((moved ?? []).length === 0) return p.retried ? false : leadWritten(db, { ...p, retried: true });
  const said = { by: "reach_out", send_id: p.sendId } as unknown as Json;
  const { error: e3 } = await db.from("events").insert({
    tenant_id: p.tenantId,
    kind: "lead.emailed",
    category: "lead",
    subject_type: "lead",
    subject_id: p.leadId,
    data: said,
  });
  if (e3) throw new Error(`cannot record the lead's email: ${e3.message}`);
  return true;
}

/* ------------------------------------------------------------- the check -- */

/** A business's record, as 00191's reach_out_record reads it: what the check writes and reads an opening from. */
export interface ReachOutRecordRow {
  business_name: string | null;
  category: string | null;
  city: string | null;
  region: string | null;
  rating: number | null;
  reviews: number | null;
  website_host: string | null;
  hours: unknown;
  about: string | null;
  email: string | null;
  why_it_fits: string | null;
  what_you_asked: string | null;
  site_listings: number;
  name_listings: number;
  email_domain_shared: boolean;
}

/** A send to check (00191 reach_out_unchecked), leased to this tick: the send, its step, its chain and its record. */
export interface UncheckedSend {
  send: ReachOutSendRow;
  /** The words' version the send was read at: the check writes only while it is still this (R5). */
  check_gen: number;
  template_id: string;
  template_language: string;
  signed_by: string | null;
  /** The holds its owner included it, or its lead in this chain, past (R7): never held for them again. */
  included_for: string[];
  record: ReachOutRecordRow;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);

function recordOf(r: Record<string, unknown>): ReachOutRecordRow {
  return {
    business_name: text(r.business_name),
    category: text(r.category),
    city: text(r.city),
    region: text(r.region),
    rating: num(r.rating),
    reviews: num(r.reviews),
    website_host: text(r.website_host),
    hours: r.hours ?? null,
    about: text(r.about),
    email: text(r.email),
    why_it_fits: text(r.why_it_fits),
    what_you_asked: text(r.what_you_asked),
    site_listings: Number(r.site_listings ?? 0),
    name_listings: Number(r.name_listings ?? 0),
    email_domain_shared: r.email_domain_shared === true,
  };
}

/**
 * The sends this tick checks, leased under their row locks (00191): at most `perWorkspace` of each workspace, round
 * robin, waiting for their owner or due within `aheadMinutes`, none another tick started in the last two minutes.
 */
export async function uncheckedSends(
  db: Db,
  p: { limit: number; perWorkspace: number; aheadMinutes: number; tenantId?: string },
): Promise<UncheckedSend[]> {
  const { data, error } = await db.rpc("reach_out_unchecked", {
    p_limit: p.limit,
    p_per_workspace: p.perWorkspace,
    p_ahead_minutes: p.aheadMinutes,
    ...(p.tenantId ? { p_tenant_id: p.tenantId } : {}),
  } as never);
  if (error) throw new Error(`cannot read the sends to check: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const send = r.send as ReachOutSendRow;
    return {
      send,
      check_gen: Number(r.check_gen ?? send.check_gen ?? 0),
      template_id: String(r.template_id),
      template_language: String(r.template_language ?? "en"),
      signed_by: text(r.signed_by),
      included_for: Array.isArray(r.included_for)
        ? r.included_for.filter((x): x is string => typeof x === "string")
        : [],
      record: recordOf(r),
    };
  });
}

/** Whether any send waits to be checked: what the check's clock answers for when it cannot check (R4). */
export async function uncheckedWaiting(db: Db, tenantId?: string): Promise<boolean> {
  let q = db.from("reach_out_sends").select("id").eq("state", "planned").is("checked_at", null);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.limit(1);
  if (error) throw new Error(`cannot read the sends to check: ${error.message}`);
  return (data ?? []).length > 0;
}

/** One business's record for a search, whether or not a send exists for it yet (the sheet's preview). */
export async function reachOutRecord(
  db: Db,
  p: { tenantId: string; searchId: string; leadId: string },
): Promise<ReachOutRecordRow | null> {
  const { data, error } = await db.rpc("reach_out_record", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    p_lead_id: p.leadId,
  } as never);
  if (error) throw new Error(`cannot read the business's record: ${error.message}`);
  const row = ((data ?? []) as Array<Record<string, unknown>>)[0];
  return row ? recordOf(row) : null;
}

/**
 * What the check found, written only onto a send still planned, not yet checked, and at the words' version it was read
 * at (R3, R5): a check never undoes an owner's answer, and never stamps words that changed under it. Its lease ends.
 */
export async function recordCheck(
  db: Db,
  p: { tenantId: string; id: string; gen: number; patch: Partial<ReachOutSendRow> },
): Promise<boolean> {
  const { data, error } = await db
    .from("reach_out_sends")
    .update({ ...p.patch, check_started_at: null } as never)
    .eq("tenant_id", p.tenantId)
    .eq("id", p.id)
    .eq("state", "planned")
    .is("checked_at", null)
    .eq("check_gen", p.gen)
    .select("id");
  if (error) throw new Error(`cannot record the send's check: ${error.message}`);
  return (data ?? []).length === 1;
}

/**
 * A send back to unchecked (R5): its words changed since its check, or it names an opening it has none of. Its words'
 * version moves on, so a check still under way for the old words writes nothing; what its owner included it past stays.
 */
export function checkResetPatch(gen: number): Partial<ReachOutSendRow> {
  return {
    checked_at: null,
    check_gen: gen + 1,
    checked_words: null,
    check_tries: 0,
    check_first_at: null,
    check_after: null,
    check_started_at: null,
    opening: null,
    angle: null,
    facts_used: [],
    hold_detail: null,
  };
}

/** Holds left past `before`, oldest planned first (00191: fourteen days from when a send was planned, R10). */
export async function heldStale(db: Db, before: Date, limit: number, tenantId?: string): Promise<ReachOutSendRow[]> {
  const { data, error } = await db.rpc("reach_out_held_stale", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  } as never);
  if (error) throw new Error(`cannot read the held sends: ${error.message}`);
  return (data ?? []) as ReachOutSendRow[];
}

/**
 * Holds the check could not answer (check_unavailable, no rule broken) left since `before`: put back to be checked
 * again at their words' next version, in one statement (00191 reach_out_release_unavailable, R4). A hold for a rule an
 * opening broke keeps: it is its owner's to answer. How many went back.
 */
export async function releaseUnavailableHolds(db: Db, p: { before: Date; tenantId?: string }): Promise<number> {
  const { data, error } = await db.rpc("reach_out_release_unavailable", {
    p_before: p.before.toISOString(),
    ...(p.tenantId ? { p_tenant_id: p.tenantId } : {}),
  } as never);
  if (error) throw new Error(`cannot put the holds back to be checked: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/**
 * One attempt of the check's model spend for a workspace's UTC day, taken only while the day is under `cap` (00191
 * reach_out_check_take, R12): true when taken. A reset of a send's check never gives it back.
 */
export async function takeCheckAttempt(db: Db, p: { tenantId: string; cap: number; at: Date }): Promise<boolean> {
  const { data, error } = await db.rpc("reach_out_check_take", {
    p_tenant_id: p.tenantId,
    p_cap: p.cap,
    p_at: p.at.toISOString(),
  } as never);
  if (error) throw new Error(`cannot take the check's attempt: ${error.message}`);
  return data === true;
}

/**
 * Whether a workspace may spend on reach-out now (contracts maySpend): a paused workspace, or one with no billing row,
 * may not. The one reading of it: the step's run (run-context.ts) and the check both ask it. A read that fails throws:
 * "we could not check" is not "yes".
 */
export async function workspaceMaySpend(db: Db, tenantId: string): Promise<boolean> {
  const [tenant, billing] = await Promise.all([
    db.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (tenant.error) throw new Error(`cannot read the workspace: ${tenant.error.message}`);
  if (billing.error) throw new Error(`cannot read the workspace's billing: ${billing.error.message}`);
  if (tenant.data?.status === "paused" || !billing.data) return false;
  return maySpend(billing.data.mode as BillingMode, billing.data.status as BillingStatus);
}

/** The workspace's own words about what it does (business_records.about, 00152), for the writer. */
export async function workspaceAbout(db: Db, tenantId: string): Promise<string | null> {
  const { data, error } = await db.from("business_records").select("about").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the business record: ${error.message}`);
  return data?.about?.trim() || null;
}
