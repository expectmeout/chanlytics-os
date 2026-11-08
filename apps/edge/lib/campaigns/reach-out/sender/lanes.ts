/** Sender: lanes. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findContactEmail,
  draftFactsOf,
  findEmailWords,
  insertQueuedEmail,
  findLeadPreview,
  moveSend,
  recordPreviewSent,
  recheckSends,
  addReachOutPerson,
  runHanded,
  runSending,
  sendJobScheduled,
  sendNow,
  sendStanding,
  withdrawEmail,
  findWorkspaceNameAndConfig,
  findWrittenEmail,
  type ParentEmail,
  type ReachOutSendRow,
  type WrittenEmail,
} from "@chanlytics/db/campaigns";
import { findMailboxConnection, type MailboxConnectionRow } from "@chanlytics/db/email";
import type { Database, Json } from "@chanlytics/db/types";
import { scheduleJob } from "@chanlytics/jobs";
import {
  draftRefusalOf,
  mailboxSendsNow,
  parseTenantConfig,
  previewSlotOf,
  type LeadPreviewSlot,
  type SlotLead,
} from "@chanlytics/contracts";
import { dashboardOrigin, unsubscribeOrigin } from "../../../shared/dashboard-origin.js";
import { env } from "../../../shared/env.js";
import { askPreview } from "../../../previews/make.js";
import { reachOutDraft, reachOutRequest, reachOutWords } from "@chanlytics/channels/email";
import { REPLAN_GIVE_UP_MS, type Replan } from "../replan.js";
import type { Logger } from "../../../shared/log.js";
import { once } from "../once.js";
import { asJson } from "@chanlytics/db/shared";
import type { TenantId } from "@chanlytics/contracts";

export type Db = SupabaseClient<Database>;

/** The most one mailbox's claim takes in a tick: its gap spaces its sends minutes apart, so a tick finds one or two. */
export const CLAIM_PER_MAILBOX_PER_TICK = 5;

/** The most drafts a tick claims, across every workspace: a day's share is thirty a reach-out, all due at once. */
export const DRAFTS_PER_TICK = 60;

/** When the claim stops taking mailboxes: its door has 60 s (vercel.json), and a mailbox's writes take a few seconds. */
export const CLAIM_YIELD_AT_MS = 40_000;

/** How many mailboxes with sends due one page reads, and how many pages a tick reads past the ones it holds. */
export const DUE_MAILBOXES_PAGE = 50;

export const DUE_PAGES = 4;

/** A claim this old was left by a tick that died after it (a tick lives 60 s at most): it is written again. */
export const REWRITE_AFTER_MS = 5 * 60_000;

/** How far on a held send, or one waiting for the email before it to be stamped, is planned again (in its lead's hours). */
export const HOLD_MS = 3_600_000;

export const REWRITE_PAGE = 100;

/**
 * Refusals that are the step's or the workspace's, never the lead's: the send waits and the lead keeps its place. A
 * missing address or a template with a slot no lead can fill would otherwise skip every lead the run holds, for good,
 * at five a mailbox a minute.
 */
const HOLDS = new Set([
  "no_business_address",
  "no_template",
  "no_subject",
  "unknown_slot",
  "words_unsendable",
  // Part 4 (R6): words that name the name the chain signs with, or the booking link, when there is none.
  "no_signed_by",
  "no_booking_link",
  // Decision 0079: words that name {{their preview}} while the lead's is being made, asked for as it is held.
  "preview_building",
]);

/** What a reach-out needs to write an email beside its mailbox: the seal for its unsubscribe, and the origin its page answers on. */
export interface Lane {
  unsubscribeSecret: string;
  unsubscribeOrigin: string;
}

/**
 * The reach-out lane as this deployment holds it (C13), or what it lacks by the variables' names: the unsubscribe's
 * seal, without which no email may carry its one-click way out. Each email leaves from the mailbox its business
 * connected (decision 0056), so the platform's own mail keys are not asked.
 */
export function mailboxLane(): { ok: true; lane: Lane } | { ok: false; missing: string[] } {
  const secret = env.UNSUBSCRIBE_SECRET;
  if (!secret) return { ok: false, missing: ["UNSUBSCRIBE_SECRET"] };
  return { ok: true, lane: { unsubscribeSecret: secret, unsubscribeOrigin: unsubscribeOrigin() } };
}

export interface SenderCounts {
  claimed: number;
  written: number;
  /** Handed to their owner to send from their own inbox (00429). */
  drafted: number;
  /** Claims a tick left mid-way: written now, or their email adopted. */
  rewritten: number;
  skipped: number;
  /** Planned again: a chain paused since, a mailbox gone or not sending, an email before not yet stamped. */
  waited: number;
  /** Planned again an hour on for the step's or the workspace's words (HOLDS). */
  held: number;
  /** Back to be checked: their words changed since their check, or they name an opening they have none of (R5). */
  rechecked: number;
  /** Planned again past two weeks: given up, kept_waiting. */
  gave_up: number;
  errors: number;
  /** Workspaces whose month's allowance is spent: their sends wait for the next month. */
  month_spent: number;
  /** Workspaces that cannot write an email's foot: nothing of theirs is claimed. */
  workspaces_held: number;
}

export type Outcome = "written" | "adopted" | "drafted" | "skipped" | "waited" | "held" | "rechecked" | "lost";

interface Workspace {
  businessName: string | null;
  address: string | null;
  /** The booking link the words' {{booking link}} names (brain.booking_link). */
  bookingLink: string | null;
  /** Why no email of this workspace can be written now (a HOLDS reason), or null. */
  missing: string | null;
}

/** One tick's reads that hold for the whole tick, each made once: a workspace's facts, a template's words, a mailbox. */
export function tickReads(db: Db) {
  const workspaces = new Map<string, Promise<Workspace>>();
  const words = new Map<string, Promise<{ subject: string | null; body: string } | null>>();
  const mailboxes = new Map<string, Promise<MailboxConnectionRow | null>>();
  return {
    workspace: (tenantId: TenantId) =>
      once(workspaces, tenantId, async () => {
        const result = await findWorkspaceNameAndConfig(db, tenantId);
        // The address drafts put at their foot (the dashboard's getWorkspaceOffer): the profile's, as the owner wrote it.
        const brain = parseTenantConfig(result.config)?.brain;
        const address = brain?.profile?.address?.trim() || null;
        const businessName = result.name?.trim() || null;
        return {
          businessName,
          address,
          bookingLink: brain?.booking_link?.trim() || null,
          missing: !businessName || !address ? "no_business_address" : null,
        };
      }),
    words: (tenantId: TenantId, templateId: string) =>
      once(words, templateId, () => findEmailWords(db, tenantId, templateId)),
    mailbox: (tenantId: TenantId, mailboxId: string) =>
      once(mailboxes, mailboxId, () => findMailboxConnection(db, tenantId, mailboxId)),
  };
}

export interface Tick {
  db: Db;
  now: Date;
  /** The mailbox lane, or null without its seal: then only drafts are claimed (they need none). */
  lane: Lane | null;
  log: Logger;
  reads: ReturnType<typeof tickReads>;
  /** Planned again from now, at the tick's end: their mailbox went away since their claim. */
  replan: Replan[];
  /** Planned again an hour on, in their lead's hours, at the tick's end: held, or waiting for the email before. */
  later: Replan[];
  /** The holds said this tick, once each per workspace and reason. */
  said: Set<string>;
}

/**
 * An email this send wrote before: the send goes on as its email's. Still queued in a run closed since, it is withdrawn
 * first, so its job sends nothing; still queued otherwise, its job is made sure of, once. One its job already took is
 * its job's: the clock reads what became of it (sent, and the lead written to; refused, and why).
 */
export async function adopt(
  tick: Tick,
  reachOutSend: ReachOutSendRow,
  id: string,
  was: WrittenEmail,
): Promise<Outcome> {
  const { db } = tick;
  if (was.status === "queued") {
    const { run } = await sendStanding(db, reachOutSend);
    if (!run || run === "canceled" || run === "failed")
      await withdrawEmail(db, { tenantId: reachOutSend.tenant_id, id, reason: "run_canceled" });
    else if (!(await sendJobScheduled(db, { tenantId: reachOutSend.tenant_id, messageId: id }))) {
      if (!was.to) throw new Error(`the written email ${id} names no recipient`);
      await scheduleJob(db, {
        tenantId: reachOutSend.tenant_id,
        kind: "outbound_send",
        dueAt: tick.now,
        payload: {
          message_id: id,
          conversation_id: was.conversation_id,
          to_email: was.to,
          purpose: "outreach",
          proactive: true,
        },
      });
    }
  }
  const moved = await moveSend(db, {
    tenantId: reachOutSend.tenant_id,
    id: reachOutSend.id,
    from: "claimed",
    patch: { state: "queued", message_id: id, contact_id: was.contact_id ?? reachOutSend.contact_id },
  });
  return moved ? "adopted" : "lost";
}

/**
 * Its mailbox since the claim. A first email has no thread yet: its mailbox removed or not sending now, it is planned
 * again on another of the step's. A later one answers its lead's thread from that lead's mailbox (each lead hears from
 * one): removed, its chain ends with it; not sending now, it waits for it, an hour on.
 */
function mailboxTurn(
  mailbox: MailboxConnectionRow | null,
  later: boolean,
  nowMs: number,
): { go: MailboxConnectionRow } | { wait: "replan" | "later" } | { gone: true } {
  if (!mailbox || mailbox.state === "removed") return later ? { gone: true } : { wait: "replan" };
  if (mailboxSendsNow(mailbox, nowMs)) return { go: mailbox };
  return { wait: later ? "later" : "replan" };
}

/** What a claimed send may become, each only from `claimed`, as it was read. */
export function claimedTurns(tick: Tick, reachOutSend: ReachOutSendRow) {
  const move = async (patch: Partial<ReachOutSendRow>): Promise<boolean> =>
    moveSend(tick.db, { tenantId: reachOutSend.tenant_id, id: reachOutSend.id, from: "claimed", patch });
  return {
    move,
    /** Planned again, keeping its time: its chain paused since, or no lane to send it by. */
    wait: async (): Promise<Outcome> => ((await move({ state: "planned", claimed_at: null })) ? "waited" : "lost"),
    skip: async (reason: string): Promise<Outcome> =>
      (await move({ state: "skipped", reason: reason.slice(0, 60) })) ? "skipped" : "lost",
    /** Back to be checked, keeping its time and its owner's inclusions; a check under way for older words writes nothing. */
    recheck: async (): Promise<Outcome> =>
      (await recheckSends(tick.db, {
        tenantId: reachOutSend.tenant_id,
        ids: [reachOutSend.id],
        fromState: "claimed",
      })) === 1
        ? "rechecked"
        : "lost",
    hold: (reason: string): Outcome => {
      tick.later.push({ send: reachOutSend, wrote: false });
      const key = `${reachOutSend.tenant_id}:${reason}`;
      if (!tick.said.has(key)) {
        tick.said.add(key);
        tick.log.warn("reach_out_send_held", {
          tenant_id: reachOutSend.tenant_id,
          playbook_id: reachOutSend.step_id,
          reason,
        });
      }
      return "held";
    },
  };
}

type ClaimedTurns = ReturnType<typeof claimedTurns>;

/** What a claimed send's email is made of, read once in writeOne and handed to whichever way it leaves. */
export interface Made {
  afterStep: string | null;
  lead: { email: string | null; email_state: string | null };
  words: { subject: string | null; body: string };
  slots: SlotLead;
  workspace: {
    businessName: string | null;
    yourName: string | null;
    bookingLink: string | null;
    address: string | null;
  };
  /** The lead's email on the step before, for a step after the first (D19). */
  parent: ParentEmail | null;
  /** How its sequence ends its emails (00492, decision 0077). */
  signsWith: "name" | "mailbox";
  /** The lead's preview its words carry as {{their preview}} (decision 0079): its first send starts its thirty days. */
  previewId: string | null;
}

/**
 * The lead's own receptionist, for words that name {{their preview}} (decision 0079): open, with its link; being made,
 * and asked for where none is (askPreview, its build scheduled once), or held with the switch off and nothing made; or
 * gone, its door refusing one for this lead for good (not a business that takes bookings, a lead closed), which skips
 * the send as a failed or ended one does.
 */
export async function previewForWords(
  t: Tick,
  s: ReachOutSendRow,
): Promise<{ slot: LeadPreviewSlot; id: string | null }> {
  const row = await findLeadPreview(t.db, s.tenant_id, s.lead_id);
  const slot = previewSlotOf(row, t.now, dashboardOrigin());
  if (slot.state !== "building" || row?.state === "building" || env.LEAD_PREVIEWS !== "on")
    return { slot, id: slot.state === "open" ? (row?.id ?? null) : null };
  const otherAskPreview = await askPreview(t.db, { tenantId: s.tenant_id, leadId: s.lead_id, by: null });
  return { slot: otherAskPreview.ok ? slot : { state: "gone" }, id: null };
}

/**
 * A reach-out its owner sends (00429), or a step after the first whose email before it they sent from their own inbox
 * (the thread is theirs, whoever sends the chain now): handed to them as a draft, to the lead's own checked address,
 * never sent from a mailbox, and only while the send door would let it go (contracts draftRefusalOf: nothing stands
 * between the owner's inbox and the business but this). A step after the first answers the email before by its subject;
 * the owner's own client threads it.
 */
export async function handOver(
  tick: Tick,
  reachOutSend: ReachOutSendRow,
  turns: ClaimedTurns,
  match: Made,
): Promise<Outcome> {
  const { skip, hold, recheck, move } = turns;
  const to = match.lead.email?.trim().toLowerCase() ?? "";
  if (!to || match.lead.email_state === "invalid") return skip("no_address");
  const refused = draftRefusalOf(await draftFactsOf(tick.db, reachOutSend.tenant_id, reachOutSend.lead_id));
  if (refused) return skip(refused);
  const response = reachOutDraft({
    words: match.words,
    lead: match.slots,
    workspace: match.workspace,
    opening: reachOutSend.opening ?? null,
    parent: match.parent ? { subject: match.parent.subject } : null,
    signsWith: match.signsWith,
  });
  if (!response.ok && response.reason === "no_opening") return recheck();
  if (!response.ok) return HOLDS.has(response.reason) ? hold(response.reason) : skip(response.reason);
  const draft: Json = {
    to,
    subject: response.subject,
    body: response.body,
    text: response.text,
    ...(match.parent ? { parent_id: match.parent.messageId } : {}),
  };
  // Its mailbox let go: an owner's email is no mailbox's to count.
  if (!(await move({ state: "drafted", drafted_at: tick.now.toISOString(), draft, mailbox_id: null }))) return "lost";
  // The run's row, touched: its drafts are its owner's to send now, and a page that hears the run reads them again.
  await runHanded(tick.db, { tenantId: reachOutSend.tenant_id, id: reachOutSend.batch_id, at: tick.now }).catch(
    (e: unknown) =>
      tick.log.warn("reach_out_run_unstarted", {
        broadcast_id: reachOutSend.batch_id,
        error: e instanceof Error ? e.message : String(e),
      }),
  );
  return "drafted";
}

/**
 * A mailbox's send (decision 0056): its mailbox now, the email before it stamped, its words, the person (made once), the
 * frozen request, the row and the job, then its move to queued and its run sending.
 */
export async function sendFromMailbox(
  tick: Tick,
  reachOutSend: ReachOutSendRow,
  turns: ClaimedTurns,
  match: Made,
  params: { mailbox: MailboxConnectionRow | null; messageId: string },
): Promise<Outcome> {
  const { db } = tick;
  const { move, skip, recheck, hold } = turns;
  const { messageId } = params;
  const opening = reachOutSend.opening ?? null;
  // No lane to send it by (no unsubscribe seal): it keeps, planned again, for the lane.
  if (!tick.lane) return turns.wait();
  const turn = mailboxTurn(params.mailbox, match.afterStep !== null, tick.now.getTime());
  if ("gone" in turn) return skip("mailbox_gone");
  if ("wait" in turn) {
    (turn.wait === "replan" ? tick.replan : tick.later).push({ send: reachOutSend, wrote: false });
    return "waited";
  }
  // Its receipt stamps the email before within seconds of its leaving; one that never came in two weeks is not coming.
  if (match.parent && !match.parent.rfcMessageId) {
    if (tick.now.getTime() - Date.parse(reachOutSend.created_at) > REPLAN_GIVE_UP_MS) return skip("parent_unstamped");
    tick.later.push({ send: reachOutSend, wrote: false });
    return "waited";
  }
  const sentence = reachOutWords(match.words, match.slots, match.workspace, match.parent !== null, opening);
  if (!sentence.ok && sentence.reason === "no_opening") return recheck();
  if (!sentence.ok) return HOLDS.has(sentence.reason) ? hold(sentence.reason) : skip(sentence.reason);

  // 4. The person, made once; a lead that closed, or an address that is a customer's, is never written to cold.
  const person = await addReachOutPerson(db, reachOutSend.tenant_id, reachOutSend.lead_id);
  if (!person.ok) return skip(person.refused);
  // The address the door will compare the request with (deliver.ts recipient_changed): the person's, as stored.
  const to = await findContactEmail(db, reachOutSend.tenant_id, person.contactId);
  if (!to) return skip("no_address");

  // 5. The request, frozen; the row; the job.
  const result = reachOutRequest({
    tenantId: reachOutSend.tenant_id,
    messageId,
    contactId: person.contactId,
    to,
    words: match.words,
    lead: match.slots,
    workspace: match.workspace,
    opening,
    from: turn.go,
    signsWith: match.signsWith,
    unsubscribe: { secret: tick.lane.unsubscribeSecret, origin: tick.lane.unsubscribeOrigin },
    parent: match.parent,
  });
  if (!result.ok) return HOLDS.has(result.reason) ? hold(result.reason) : skip(result.reason);
  const meta = {
    source: "reach_out",
    email: {
      subject: result.subject,
      to: [to],
      request: result.request,
      ...(match.parent ? { parent_id: match.parent.messageId, in_reply_to: match.parent.rfcMessageId } : {}),
    },
    reach_out: {
      send_id: reachOutSend.id,
      lead_id: reachOutSend.lead_id,
      contact_id: person.contactId,
      playbook_id: reachOutSend.step_id,
      root_id: reachOutSend.sequence_id,
      broadcast_id: reachOutSend.batch_id,
      attempt: reachOutSend.attempts ?? 0,
    },
  };
  const wrote = await insertQueuedEmail(db, {
    id: messageId,
    tenant_id: reachOutSend.tenant_id,
    conversation_id: person.conversationId,
    contact_id: person.contactId,
    channel: "email",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: result.body,
    status: "queued",
    meta: asJson(meta),
  });
  if (wrote === "exists") {
    // Written between the read above and this insert: that one is this send's.
    const again = await findWrittenEmail(db, { tenantId: reachOutSend.tenant_id, id: messageId });
    if (!again) throw new Error(`the email ${messageId} is taken and cannot be read`);
    return adopt(tick, reachOutSend, messageId, again);
  }
  await scheduleJob(db, {
    tenantId: reachOutSend.tenant_id,
    kind: "outbound_send",
    dueAt: tick.now,
    payload: {
      message_id: messageId,
      conversation_id: person.conversationId,
      to_email: to,
      purpose: "outreach",
      proactive: true,
    },
  });

  // 6. The send is queued on its email; its run is sending.
  if (!(await move({ state: "queued", message_id: messageId, contact_id: person.contactId }))) {
    // Moved by another since it was read. Adopted (the clock's unstick found this email): it goes on. Anything else:
    // the email is withdrawn while still queued, so its job sends nothing the send no longer stands behind.
    const now = await sendNow(db, { tenantId: reachOutSend.tenant_id, id: reachOutSend.id });
    if (now?.state === "queued" && now.message_id === messageId) return "written";
    await withdrawEmail(db, { tenantId: reachOutSend.tenant_id, id: messageId, reason: "send_moved" });
    return "lost";
  }
  // The run's word only: its email is written and queued, and the clock's finish moves a scheduled run itself.
  await runSending(db, { tenantId: reachOutSend.tenant_id, id: reachOutSend.batch_id }).catch((e: unknown) =>
    tick.log.warn("reach_out_run_unstarted", {
      broadcast_id: reachOutSend.batch_id,
      error: e instanceof Error ? e.message : String(e),
    }),
  );
  // Their preview went with it (decision 0079): its thirty days start at the first email that carries it.
  if (match.previewId)
    await recordPreviewSent(db, match.previewId).catch((e: unknown) =>
      tick.log.warn("preview_sent_failed", { error: e instanceof Error ? e.message : String(e) }),
    );
  return "written";
}
