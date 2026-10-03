/**
 * What a broadcast puts on each channel's wire (One message, every channel, step 3; the campaigns-on-every-channel
 * spec, 4.4 and 4.8): one person's words, made for the channel their row says and handed to the door. The batch
 * (broadcast.ts) keeps its shape, one person at a time; this is what differs between the three.
 *
 *   WhatsApp  the template, its numbered slots filled, as it always was.
 *   text      the text version's words with the same slots filled, and the STOP line (contracts renderOwnVersion), on
 *             the person's thread by their number.
 *   email     the email version's subject and body filled, and a short foot (why they hear from the business, and from
 *             whom), frozen as the request the mailbox sends (the adapter's emailRequest port) and written as the queued
 *             row the door demands before anything leaves (written once the person is claimed). An appointment message
 *             carries no unsubscribe: its foot says a reply of STOP stops them. An OFFER (a marketing message) leaves from
 *             the mailbox on the campaigns domain, and its foot owes more (contracts emailFoot): why they get it, the
 *             business's name and postal address, and the Unsubscribe link, which the one-click headers carry too. A
 *             business with no postal address on file sends none: the person is held (`no_business_address`).
 *
 * Every refusal here is a person held with a reason the run's page already says (contracts HELD_REASONS), never
 * rerouted to another channel.
 */
import {
  allowanceRoom,
  emailFoot,
  emailFootHtml,
  heldByAllowance,
  renderOwnVersion,
  renderTemplate,
  versionWords,
  type ParamSpec,
  type SendPurpose,
  type VersionWords,
} from "@chanlytics/contracts";
import { uuidV5 } from "../uuid-v5";
import type { Channel, Delivery } from "../deliver";
import type {
  BroadcastBatchCommand,
  BroadcastBatchPorts,
  BroadcastRow,
  ContactRow,
  RecipientMark,
  RecipientRow,
} from "./ports";

/** The channel a person is reached on: the one their row says, and WhatsApp for a run made before rows said. */
export function channelOf(r: Pick<RecipientRow, "channel">): Channel {
  return r.channel === "sms" || r.channel === "email" ? r.channel : "whatsapp";
}

/** One batch as its people share it: the run, what fills its slots, who is on it, and what it reads once for them all. */
export interface Work {
  ports: BroadcastBatchPorts;
  cmd: BroadcastBatchCommand;
  b: BroadcastRow;
  /** Which yes this send needs: Meta's category for the message, whichever channel it goes by (purposeOfTemplate). */
  purpose: SendPurpose;
  /** WhatsApp's template as Meta has it: the words of those who go by WhatsApp. */
  tpl: { body_preview: string | null };
  /**
   * Whether Meta approves that template. When it does not, it holds the run's WhatsApp people alone (broadcast.ts): the
   * people of the other channels go on their own versions.
   */
  whatsappApproved: boolean;
  specs: ParamSpec[];
  facts: Awaited<ReturnType<BroadcastBatchPorts["facts"]>>;
  people: Map<string, ContactRow>;
  priors: Map<string, { id: string; sentAt: string | null }>;
  /** The email and text versions this batch has read, once each: null is a message with none (any more) on that channel. */
  versions: Partial<Record<"email" | "sms", VersionWords | null>>;
  /** The month's emails and texts already sent, read once for the first person who needs it and counted as the batch sends. */
  month: Partial<Record<"email" | "sms", number>>;
  /**
   * The moment a playbook's run was made for (contracts audienceTrigger), null for a broadcast and for a run that kept
   * none. The month's allowance asks it, with the message's purpose: a booking moment's message about a visit is never held
   * by it (heldByAllowance).
   */
  trigger: string | null;
  /** How many people this batch has settled: a batch that reached nobody waits before the next (broadcast.ts stall). */
  marked: number;
  mark(contactId: string, patch: RecipientMark): Promise<void>;
}

/** A visit run's or a follow-up's words for one person, resolved when the run was made and kept on their row. */
export function rowFacts(r: Pick<RecipientRow, "facts">): Record<string, unknown> {
  return r.facts !== null && typeof r.facts === "object" && !Array.isArray(r.facts)
    ? (r.facts as Record<string, unknown>)
    : {};
}

/** What a run's messages record: that a broadcast sent them, which, and for a run, its playbook (a thread reads "by the Win-back playbook"). */
function metaOf(b: BroadcastRow) {
  const label = (b.audience as { label?: unknown } | null)?.label;
  return {
    source: "broadcast",
    broadcast_id: b.id,
    broadcast_name: b.name,
    ...(b.playbook_id ? { playbook_id: b.playbook_id, playbook_name: typeof label === "string" ? label : b.name } : {}),
  };
}

/**
 * The email or text version of the message in its language, as the workspace holds it now; null when it holds none, or
 * not an approved one. Read once per batch: the first person on that channel asks, the rest reuse it. A read that
 * fails throws, and the person is left queued: a version that could not be looked for is not one the workspace lacks.
 */
async function versionOf(w: Work, channel: "email" | "sms"): Promise<VersionWords | null> {
  if (!(channel in w.versions)) {
    const row = await w.ports.template(w.b.template_name, w.b.template_language, channel);
    w.versions[channel] =
      row && row.meta_status === "approved"
        ? versionWords({ channel, components: row.components, body_preview: row.body_preview })
        : null;
  }
  return w.versions[channel] ?? null;
}

/**
 * Whether the workspace's month of this channel is used up (contracts CAMPAIGN_MONTH_ALLOWANCE): Chanlytics pays for
 * emails and texts, so it meters them. Read once per batch for the first person who needs it and counted as the batch
 * sends (`countSent`); a person past it is held on their channel, never moved to another. Never for a run whose message
 * the allowance does not hold (contracts heldByAllowance: a visit reminder, the check after a visit, a booking moment's
 * message about a visit and not an offer): it counts toward the month and always goes. This is the backstop; the run's
 * enrolment already held whoever the month could not carry (campaigns/allowance.ts).
 */
export async function overAllowance(w: Work, channel: "email" | "sms"): Promise<boolean> {
  if (!heldByAllowance(w.trigger, w.purpose)) return false;
  w.month[channel] ??= await w.ports.monthSent(channel);
  return allowanceRoom(channel, w.month[channel] ?? 0) === 0;
}

/** One more email or text has left: the batch's own count of the month. */
export function countSent(w: Work, channel: Channel): void {
  if (channel !== "whatsapp") w.month[channel] = (w.month[channel] ?? 0) + 1;
}

/** The foot an email carries as the adapter takes it: its text, and for an offer the link and the foot in HTML. */
type Foot = Pick<Parameters<BroadcastBatchPorts["emailRequest"]>[0], "footer" | "offer">;

/** An email's queued row as the adapter writes it (ports queueEmail). */
type QueuedEmail = Parameters<BroadcastBatchPorts["queueEmail"]>[0];

/**
 * What goes to the door for one person, or why they are held instead. An email carries its queued row too, which is NOT
 * written here: it is written once the person is claimed (`queueEmailRow`), so a claim that is lost, or fails, leaves no
 * row behind to count against the month.
 */
type Prepared = { held: string } | { delivery: Delivery; queue?: QueuedEmail };

/**
 * The email, frozen: the version's subject and body with the slots filled, the foot, the request the hosted mailbox
 * sends, and the queued row it will be written as, under an id derived from the run, the person and how long the run has
 * waited, so a batch that resumes meets the same row and one that waited writes a fresh one (a send the provider did not
 * take has its row withdrawn, broadcast.ts). The row is written after the claim, by `queueEmailRow`; one already there
 * that is no longer queued has had its say.
 */
async function emailDelivery(
  w: Work,
  i: { r: RecipientRow; c: ContactRow; to: string; conversationId: string; params: string[] },
  base: Omit<Delivery, "channel" | "body">,
): Promise<Prepared> {
  const version = await versionOf(w, "email");
  if (!version) return { held: "no_channel" };
  const said = renderOwnVersion("email", version, i.params, w.b.template_language);
  if (!said.subject) return { held: "no_channel" };
  const messageId = await uuidV5(`broadcast_email:${w.b.id}:${i.c.id}:${w.cmd.waits ?? 0}:${w.cmd.stalls ?? 0}`);
  const { businessName, address } = w.facts;
  let foot: Foot;
  if (w.purpose === "marketing") {
    // An offer owes the postal address and a way out the person can press: with neither, nobody is written to.
    if (!address?.trim()) return { held: "no_business_address" };
    const unsubscribeUrl = await w.ports.unsubscribeUrl({ messageId, contactId: i.c.id });
    if (!unsubscribeUrl?.trim()) return { held: "no_channel" };
    // Someone who asked for offers by email says so; anyone else who may get one has dealt with the business.
    const offer = {
      kind: "offer" as const,
      why: i.c.email_marketing === "opted_in" ? ("asked" as const) : ("customer" as const),
      unsubscribeUrl,
    };
    foot = {
      footer: emailFoot(businessName, address, offer),
      offer: { unsubscribeUrl, footerHtml: emailFootHtml(businessName, address, offer) },
    };
  } else foot = { footer: emailFoot(businessName, address, { kind: "visit", facts: rowFacts(i.r) }) };
  const request = await w.ports.emailRequest({ messageId, to: i.to, subject: said.subject, body: said.body, ...foot });
  if (!request) return { held: "no_channel" };
  return {
    delivery: { ...base, channel: "email", body: said.body, messageId, email: request },
    queue: {
      id: messageId,
      conversationId: i.conversationId,
      contactId: i.c.id,
      body: said.body,
      request,
      meta: metaOf(w.b),
    },
  };
}

/**
 * An email's queued row, written now that its person is claimed (the door sends only from a row its request was frozen
 * for): true when it is queued, whether this call wrote it or a resumed run's is still queued, and false when a row under
 * that id has had its say (sent, canceled, failed), and nothing goes. Any other delivery has no row to write. A write
 * that fails throws, with nothing written.
 */
export async function queueEmailRow(w: Work, made: { queue?: QueuedEmail }): Promise<boolean> {
  return !made.queue || (await w.ports.queueEmail(made.queue)).status === "queued";
}

/**
 * One person's delivery on their channel, or why they are held. `params` are the values of the message's slots for
 * them, which every version of the message fills the same way.
 */
export async function prepare(
  w: Work,
  i: { r: RecipientRow; c: ContactRow; channel: Channel; to: string; conversationId: string; params: string[] },
): Promise<Prepared> {
  const { b, cmd } = w;
  const base = {
    tenantId: cmd.tenantId,
    conversationId: i.conversationId,
    contactId: i.c.id,
    to: i.to,
    sender: "human" as const,
    kind: "broadcast" as const,
    purpose: w.purpose,
    proactive: true,
    // A send the provider provably did not take (a connection that never opened, its "not now") is handed back rather
    // than written as failed: this person waits in the queue, and the run waits with them (00282).
    holdIfNotTaken: true,
    // A run's message names its playbook, so a thread reads "by the Win-back playbook".
    meta: metaOf(b),
  };
  if (i.channel === "whatsapp") {
    return {
      delivery: {
        ...base,
        channel: "whatsapp",
        body: renderTemplate(w.tpl.body_preview, i.params),
        template: { name: b.template_name, language: b.template_language, params: i.params },
      },
    };
  }
  if (i.channel === "email") return emailDelivery(w, i, base);
  const version = await versionOf(w, "sms");
  if (!version) return { held: "no_channel" };
  const said = renderOwnVersion("sms", version, i.params, b.template_language);
  return { delivery: { ...base, channel: "sms", body: said.body } };
}
