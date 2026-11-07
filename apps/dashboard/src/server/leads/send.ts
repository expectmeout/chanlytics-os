/**
 * A lead's own email (decision 0094): one email a member writes to one lead. Pressed Send, it leaves from a mailbox the
 * business connected, through the one door (deliver.ts, purpose outreach), and keeps a row in sequence_sends with no
 * sequence, batch or step, so the mailbox's day counts it, a reply finds it and the clock settles the lead by it. Said
 * sent from their own mail app, it keeps the same row with no mailbox.
 *
 * What the door refuses at the wire is asked here too before anything is written, as the clock asks before it claims a
 * send: the same facts (draftFactsOf) by the same mapping (draftRefusalOf), so a press is told now, not a minute on. The
 * never-again list is one of those facts, so the send asks nothing of its own about it.
 */
import { randomUUID } from "node:crypto";
import { mailboxSignatureOf, reachOutRequest } from "@chanlytics/channels/email";
import {
  AppError,
  coldEmailOf,
  draftRefusalOf,
  LEAD_NO_ADDRESS,
  LEAD_OWN_EMAIL_WORDS as W,
  leadEmailFromOf,
  leadEmailRefusalOf,
  REACH_OUT_MONTH_EMAILS,
  SEND_GRACE_MS,
  type LeadEmailWords,
} from "@chanlytics/contracts";
import { sendMessageId } from "@chanlytics/core";
import {
  findContactEmail,
  draftFactsOf,
  keepLeadEmail,
  getLeadEmailOnItsWay,
  findLeadSequenceMailbox,
  findLeadSlots,
  getMailboxCapacity,
  readMonthSent,
  addReachOutPerson,
  withdrawEmail,
  mayWorkspaceSpend,
} from "@chanlytics/db/campaigns";
import { listMailboxConnectionsOf } from "@chanlytics/db/email";
import { requestJson } from "../connections/email";
import { env } from "../shared/env";
import { schedule } from "../shared/jobs";
import { log } from "../shared/log";
import { canonicalOrigin } from "../shared/origin";
import { serviceDb } from "../shared/service-db";
import type { RouteContext } from "../shared/with-route";
import { linkHostOf } from "../../link-host";
import { getWorkspaceOffer } from "./allowance";
import type { LeadRow } from "./searches";

type Ctx = Pick<RouteContext, "supabase" | "userId">;

/** Where the email's one-click way out opens: the cold link host where this project has one, else its own (as the edge's). */
const unsubscribeOrigin = (): string => {
  const host = linkHostOf(env.UNSUBSCRIBE_ORIGIN);
  return host ? `https://${host}` : canonicalOrigin();
};

/** The mailbox it would leave from now, or why it would not (contracts leadEmailFromOf), each with its day. */
async function roadOf(ctx: Ctx, lead: LeadRow, nowMs: number) {
  const db = serviceDb();
  const [rows, sequenceMailbox] = await Promise.all([
    listMailboxConnectionsOf(ctx.supabase, lead.tenant_id),
    findLeadSequenceMailbox(db, lead.tenant_id, lead.id),
  ]);
  const at = new Date(nowMs);
  const mailboxes = await Promise.all(
    rows.map(async (r) => {
      const c = await getMailboxCapacity(db, r.id, at);
      return { ...r, sent_days: c.sent_days, daily_cap: c.daily_cap, customer_domain: c.customer_domain, used: c.used };
    }),
  );
  return leadEmailFromOf({ sequenceMailbox, userId: ctx.userId, mailboxes, nowMs });
}

/** What the write step says of the road: the address to send from and what goes under the words, or why the mail app. */
export interface LeadEmailOffer {
  from: string | null;
  why_not: string | null;
  foot: string | null;
}

const MAIL_APP: LeadEmailOffer = { from: null, why_not: null, foot: null };

/**
 * Why the workspace can't send a cold email now, as a sequence's run is held (its billing, its month's allowance), and
 * what no send can do without (the seal for its way out). Null when it can.
 */
async function workspaceRefusal(tenantId: string, nowMs: number): Promise<string | null> {
  if (!env.UNSUBSCRIBE_SECRET) return W.noUnsubscribe;
  const db = serviceDb();
  const [may, sent] = await Promise.all([
    mayWorkspaceSpend(db, tenantId),
    readMonthSent(db, tenantId, new Date(nowMs)),
  ]);
  if (!may) return W.notActive;
  return sent >= REACH_OUT_MONTH_EMAILS ? W.monthSpent : null;
}

/**
 * The road, as a draft is handed over. It only says what a press would find, so one that can't be read leaves the mail
 * app's road as it always was: the press asks again, and refuses.
 */
export async function getLeadEmailOffer(
  ctx: Ctx,
  lead: LeadRow,
  workspace: { name: string; address: string },
): Promise<LeadEmailOffer> {
  try {
    const now = Date.now();
    const road = await roadOf(ctx, lead, now);
    if (!road.from) return { ...MAIL_APP, why_not: W.whyNot[road.why] };
    const held = await workspaceRefusal(lead.tenant_id, now);
    if (held) return { ...MAIL_APP, why_not: held };
    const db = serviceDb();
    const refused = draftRefusalOf(await draftFactsOf(db, lead.tenant_id, lead.id));
    if (refused) return { ...MAIL_APP, why_not: leadEmailRefusalOf(refused) };
    const slots = await findLeadSlots(db, lead.tenant_id, lead.id);
    // What the send lays under the words (contracts coldEmailOf, the one layout): no link in the text, so none is sealed yet.
    const laid = coldEmailOf({
      filled: { subject: lead.business_name, body: "" },
      before: null,
      written: "",
      source: slots?.source,
      business: workspace.name,
      address: workspace.address,
      signsWith: "mailbox",
      signedBy: null,
      signature: mailboxSignatureOf(road.from)?.text ?? null,
      unsubscribeUrl: null,
    });
    return { from: road.from.address, why_not: null, foot: [laid.signature, laid.footer].filter(Boolean).join("\n\n") };
  } catch (e) {
    log.error("lead_email_offer_unread", { tenant_id: lead.tenant_id, lead_id: lead.id, error: e });
    return MAIL_APP;
  }
}

const wontSend = (words: string) => new AppError("conflict", words, 409);

/** The email, written and on its way: its id for Undo, the mailbox it leaves from, and how long Undo holds it. */
interface LeadSendAnswer {
  message_id: string;
  from: string;
  status: "queued";
  cancelable_until: string;
}

/**
 * Pressed Send: judged, the person a first email makes, the request frozen, the email and its row, and the job in the
 * grace a member's reply has, so Undo is a real one (POST messages/:id/cancel-send). Nothing is written before the last
 * refusal. The door judges it again at the wire.
 */
export async function sendLeadEmail(ctx: Ctx, lead: LeadRow, words: LeadEmailWords): Promise<LeadSendAnswer> {
  const db = serviceDb();
  const tenantId = lead.tenant_id;
  const refused = draftRefusalOf(await draftFactsOf(db, tenantId, lead.id));
  if (refused) throw wontSend(leadEmailRefusalOf(refused));
  const now = Date.now();
  const road = await roadOf(ctx, lead, now);
  if (!road.from) throw wontSend(W.whyNot[road.why]);
  const held = await workspaceRefusal(tenantId, now);
  if (held) throw wontSend(held);
  const secret = env.UNSUBSCRIBE_SECRET ?? "";
  const workspace = await getWorkspaceOffer(ctx, tenantId);
  if (!workspace.address) throw new AppError("validation", LEAD_NO_ADDRESS, 422);
  if (await getLeadEmailOnItsWay(db, tenantId, lead.id)) throw wontSend(W.onItsWay);

  const [person, slots] = await Promise.all([
    addReachOutPerson(db, tenantId, lead.id),
    findLeadSlots(db, tenantId, lead.id),
  ]);
  if (!person.ok) throw wontSend(leadEmailRefusalOf(person.refused));
  const to = await findContactEmail(db, tenantId, person.contactId);
  if (!to || !slots) throw wontSend(W.noAddress);

  const sendId = randomUUID();
  const messageId = await sendMessageId(sendId, 0);
  const result = reachOutRequest({
    tenantId,
    messageId,
    contactId: person.contactId,
    to,
    words,
    lead: {
      business_name: slots.business_name,
      city: slots.city,
      kind: slots.kind,
      facts: slots.facts,
      source: slots.source,
    },
    workspace: { businessName: workspace.name, yourName: null, bookingLink: null, address: workspace.address },
    opening: null,
    signsWith: "mailbox",
    from: road.from,
    unsubscribe: { secret, origin: unsubscribeOrigin() },
    parent: null,
  });
  if (!result.ok) throw wontSend(W.unsendable);

  const kept = await keepLeadEmail(db, {
    message: {
      id: messageId,
      tenant_id: tenantId,
      conversation_id: person.conversationId,
      contact_id: person.contactId,
      channel: "email",
      direction: "outbound",
      sender: "human",
      sent_by: ctx.userId,
      type: "text",
      body: result.body,
      status: "queued",
      meta: {
        source: "reach_out",
        email: { subject: result.subject, to: [to], request: requestJson(result.request) },
        reach_out: { send_id: sendId, lead_id: lead.id, contact_id: person.contactId, attempt: 0 },
      },
    },
    send: {
      id: sendId,
      tenant_id: tenantId,
      lead_id: lead.id,
      contact_id: person.contactId,
      state: "queued",
      message_id: messageId,
      mailbox_id: road.from.id,
      said_by: ctx.userId,
    },
  });
  if (kept === "on_its_way") throw wontSend(W.onItsWay);

  const dueAt = new Date(now + SEND_GRACE_MS);
  try {
    await schedule(tenantId, "outbound_send", dueAt, {
      message_id: messageId,
      conversation_id: person.conversationId,
      to_email: to,
      purpose: "outreach",
      proactive: true,
    });
  } catch (e) {
    // Never a queued email no job will send: withdrawn, and the clock skips its row.
    await withdrawEmail(db, { tenantId, id: messageId, reason: "send_moved" }).catch(() => false);
    throw e;
  }
  return { message_id: messageId, from: road.from.address, status: "queued", cancelable_until: dueAt.toISOString() };
}

/**
 * "Did you send it?" answered yes, with the words it went with: the email went from their own mail app, so it keeps its
 * row with no mailbox, its message on the person's thread where one can be made, and a reply can find it. It left whatever
 * this says: a person who can't be made (the address is someone's in People, the lead closed since) leaves the row alone,
 * and a write that fails is said, never thrown over the stage the door already moved.
 */
export async function keepSaidEmail(ctx: Ctx, lead: LeadRow, words: LeadEmailWords): Promise<void> {
  const db = serviceDb();
  const tenantId = lead.tenant_id;
  try {
    const person = await addReachOutPerson(db, tenantId, lead.id);
    const to = person.ok ? await findContactEmail(db, tenantId, person.contactId) : null;
    const sendId = randomUUID();
    const messageId = person.ok ? await sendMessageId(sendId, 0) : null;
    const at = new Date().toISOString();
    const contactId = person.ok ? person.contactId : lead.contact_id;
    await keepLeadEmail(db, {
      message:
        person.ok && messageId
          ? {
              id: messageId,
              tenant_id: tenantId,
              conversation_id: person.conversationId,
              contact_id: person.contactId,
              channel: "email",
              direction: "outbound",
              sender: "human",
              sent_by: ctx.userId,
              type: "text",
              body: words.body,
              status: "sent",
              meta: {
                source: "reach_out",
                email: { subject: words.subject, to: to ? [to] : [], said_by: ctx.userId, said_at: at },
                reach_out: { send_id: sendId, lead_id: lead.id, contact_id: person.contactId, attempt: 0 },
              },
            }
          : null,
      send: {
        id: sendId,
        tenant_id: tenantId,
        lead_id: lead.id,
        contact_id: contactId,
        state: "sent",
        sent_at: at,
        said_at: at,
        said_by: ctx.userId,
        message_id: messageId,
      },
    });
  } catch (e) {
    log.error("lead_said_email_unkept", { tenant_id: tenantId, lead_id: lead.id, error: e });
  }
}
