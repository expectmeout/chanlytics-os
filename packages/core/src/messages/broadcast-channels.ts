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
 *             row the door demands before anything leaves (written once the person is claimed). A message about their visit
 *             or their proposal carries no unsubscribe: its foot says a reply of STOP stops them. An OFFER leaves from
 *             the mailbox on the campaigns domain, and its foot owes more (contracts emailFoot): why they get it, the
 *             business's name and postal address, and the Unsubscribe link, which the one-click headers carry too. A
 *             business with no postal address on file sends none: the person is held (`no_business_address`). An offer is
 *             what contracts isOfferByEmail says: a marketing message, and (decision D2) the business's own news, a
 *             broadcast or a moment's whose message is about "ours", whatever its template's category.
 *
 * Every refusal here is a person held with a reason the run's page already says (contracts HELD_REASONS), never
 * rerouted to another channel.
 */
import {
  type AppointmentState,
  type AskedPurpose,
  RECIPIENT_REASON_HEARD,
  allowanceRoom,
  appointmentHolds,
  emailFoot,
  emailFootHtml,
  enrolPurpose,
  heldByAllowance,
  isOfferByEmail,
  leftOutByFacts,
  messageAboutOfTrigger,
  parseParamSpecs,
  purposeOfTemplate,
  renderOwnVersion,
  renderTemplate,
  triggerOf,
  versionWords,
  versionsOf,
  type ParamSpec,
  type SendPurpose,
  type VersionWords,
} from "@chanlytics/contracts";
import { broadcastEmailId } from "../campaigns/reach-out-ids";
import type { Channel, Delivery } from "../deliver";
import type {
  BroadcastBatchCommand,
  BroadcastBatchPorts,
  BroadcastRow,
  ContactRow,
  RecipientMark,
  RecipientRow,
} from "./ports";

/**
 * Which yes this run's send needs at the door: what its enrolment asked (contracts enrolPurpose, the stricter of the
 * moment's class and the message's category), asked again now of the moment the run kept (audienceTrigger) and of the
 * message as it is, so a person whose yes to offers ended after the run enrolled them is held at the wire. The door
 * was asked the message's own category alone, and a Win-back or an offer's moment carrying a utility message went to
 * someone who had said no more offers since. A broadcast, and a run made before runs kept their moment, go by the
 * message alone, as they always did; one the workspace no longer holds names no category and reads as an offer
 * (purposeOfTemplate fails closed).
 */
export function purposeAtTheDoor(trigger: string | null, message: { category: string | null } | null): AskedPurpose {
  const category = message?.category ?? null;
  return trigger === null ? purposeOfTemplate(category) : enrolPurpose(triggerOf(trigger)?.cls, { category });
}

/** The channel a person is reached on: the one their row says, and WhatsApp for a run made before rows said. */
export function channelOf(r: Pick<RecipientRow, "channel">): Channel {
  return r.channel === "sms" || r.channel === "email" ? r.channel : "whatsapp";
}

/** Whether a send on this person's wire may still start at `now` (BroadcastBatchCommand.startBy): always, on one with no moment. */
export function startsInTime(cmd: BroadcastBatchCommand, r: Pick<RecipientRow, "channel">, now: number): boolean {
  const by = cmd.startBy?.[channelOf(r)];
  return by === undefined || now <= by;
}

/** One batch as its people share it: the run, what fills its slots, who is on it, and what it reads once for them all. */
export interface Work {
  ports: BroadcastBatchPorts;
  cmd: BroadcastBatchCommand;
  b: BroadcastRow;
  /**
   * Which yes this send needs, whichever channel it goes by (purposeAtTheDoor): the message's category (Meta's where it
   * has a WhatsApp row), and for a playbook's run the stricter of that and its moment's class.
   */
  purpose: SendPurpose;
  /** The words of the message's WhatsApp row as Meta has it, those who go by WhatsApp are sent; none where it has no such row. */
  tpl: { body_preview: string | null };
  /**
   * Whether the message's WhatsApp version is one to send now (contracts messageHolds): approved by Meta and whole. When it is
   * not, it holds the run's WhatsApp people alone (broadcast.ts): the people of the other channels go on their own versions.
   */
  whatsappApproved: boolean;
  /**
   * The message's rows, read once for the batch (ports.message): the words of an email and of a text are read out of them, so
   * no person's send asks again.
   */
  rows: Awaited<ReturnType<BroadcastBatchPorts["message"]>>;
  specs: ParamSpec[];
  facts: Awaited<ReturnType<BroadcastBatchPorts["facts"]>>;
  /** The Google listing's review link, read once for the batch where a slot asks for it (slotsOf); else null. */
  reviewLink: string | null;
  people: Map<string, ContactRow>;
  priors: Map<string, { id: string; sentAt: string | null }>;
  /** The appointments the batch's reminders were drawn for, by key (ports.appointments): what each send asks again. */
  appointments: ReadonlyMap<string, AppointmentState>;
  /** The month's emails and texts already sent, read once for the first person who needs it and counted as the batch sends. */
  month: Partial<Record<"email" | "sms", number>>;
  /**
   * The campaigns domain an offer by email leaves from cannot be used (the head, broadcast.ts offersAtTheHead), and this
   * run's message is such an offer: each person who goes by email is held, `email_marketing_disabled`, never claimed.
   */
  offersClosed: boolean;
  /**
   * Whether nobody on the run goes another way than email, once the batch has asked (broadcast-stops.ts emailAlone): a hold
   * on the workspace's offers and news by email stops such a run, and skips the email people of any other. Null until asked.
   */
  emailAlone: boolean | null;
  /**
   * The moment a playbook's run was made for (contracts audienceTrigger), null for a broadcast and for a run that kept
   * none. The month's allowance asks it, with the message's purpose: a booking moment's message about a visit is never held
   * by it (heldByAllowance).
   */
  trigger: string | null;
  /** How many people this batch has settled: a batch that reached nobody waits before the next (broadcast.ts stall). */
  marked: number;
  /**
   * The people this batch gave back, still queued, to be tried again once the live hold on their thread has passed (a
   * day-before reminder: broadcast.ts holdForLater), and when that is: the run waits for it rather than for a minute.
   */
  waiting: { count: number; retryAt: Date | null };
  mark(contactId: string, patch: RecipientMark): Promise<void>;
}

/** A visit run's or a follow-up's words for one person, resolved when the run was made and kept on their row. */
export function rowFacts(r: Pick<RecipientRow, "facts">): Record<string, unknown> {
  return r.facts !== null && typeof r.facts === "object" && !Array.isArray(r.facts)
    ? (r.facts as Record<string, unknown>)
    : {};
}

/**
 * What fills the message's slots, read once for the batch: its specs, and the Google listing's review link only where a
 * slot asks for it (ports.reviewLink), else null. A message with no review slot never depends on the listing, as before
 * 00408, so a failure on that table never stops its send; one whose slot needs the link stops on the read, which the
 * batch makes before the run is marked sending or anyone is claimed, so the job's next try finds the run as it was.
 */
export async function slotsOf(
  ports: Pick<BroadcastBatchPorts, "reviewLink">,
  params: unknown,
): Promise<{ specs: ParamSpec[]; reviewLink: string | null }> {
  const specs = parseParamSpecs(params);
  return { specs, reviewLink: specs.some((s) => s.kind === "review_link") ? await ports.reviewLink() : null };
}

/**
 * Why a person's own row holds them at the wire, or null: a send by hand left them out for the week's breath, in the run's
 * own write (contracts LEFT_OUT_FACTS: never sent, whatever the hold after the run wrote), or a reminder's appointment moved,
 * was cancelled or left the calendar since the run drew it (decision 0002: never a message for a time that no longer stands).
 */
export function rowHold(
  appointments: ReadonlyMap<string, AppointmentState>,
  r: Pick<RecipientRow, "facts">,
): string | null {
  const facts = rowFacts(r);
  if (leftOutByFacts(facts)) return RECIPIENT_REASON_HEARD;
  return appointmentHolds(appointments, facts) ? null : "appointment_changed";
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
 * The words of the message's email or text version in its language, as the batch's one read of the message has them; null
 * when it holds none there. An email's and a text's row is approved the moment it is saved (contracts messageHolds), so
 * having one is being sent on it.
 */
function versionOf(w: Work, channel: "email" | "sms"): VersionWords | null {
  const [row = null] = versionsOf(w.rows, w.b.template_name)[channel];
  return row ? versionWords({ channel, components: row.components, body_preview: row.body_preview }) : null;
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
 * sends, and the queued row it will be written as, under the id `broadcastEmailId` derives (campaigns/reach-out-ids.ts) from
 * the run, the person and their attempt, so a batch that resumes meets the same row and a person tried again writes a fresh one (a send the
 * provider did not take has its row withdrawn, broadcast.ts). The row is written after the claim, by `queueEmailRow`;
 * one already there that is no longer queued has had its say.
 */
async function emailDelivery(
  w: Work,
  i: { r: RecipientRow; c: ContactRow; to: string; conversationId: string; params: string[] },
  base: Omit<Delivery, "channel" | "body">,
): Promise<Prepared> {
  const version = versionOf(w, "email");
  if (!version) return { held: "no_channel" };
  const said = renderOwnVersion("email", version, i.params, w.b.template_language);
  if (!said.subject) return { held: "no_channel" };
  const messageId = await broadcastEmailId({
    broadcastId: w.b.id,
    contactId: i.c.id,
    attempt: i.r.attempt,
    waits: w.cmd.waits ?? 0,
    stalls: w.cmd.stalls ?? 0,
  });
  const { businessName, address } = w.facts;
  let foot: Foot;
  if (isOfferByEmail({ channel: "email", purpose: w.purpose, proactive: base.proactive, about: base.about })) {
    // An offer, and the business's own news with it (decision D2), owes the postal address and a way out the person can
    // press: with neither, nobody is written to. It leaves on the campaigns domain, as the offer foot's request says.
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
      footer: emailFoot(businessName, address, offer, w.b.template_language),
      offer: { unsubscribeUrl, footerHtml: emailFootHtml(businessName, address, offer, w.b.template_language) },
    };
  } else
    foot = {
      footer: emailFoot(businessName, address, { kind: "visit", facts: rowFacts(i.r) }, w.b.template_language),
    };
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
    // A visit's or a follow-up's run is about something of theirs, any other run (a broadcast) the business's news, which by
    // email asks a yes covering email or a relationship (contracts messageAboutOfTrigger, decision D1): the run's moment,
    // read as the enrolment read it, so the two cannot disagree about anyone.
    about: messageAboutOfTrigger(w.trigger),
    // The moment itself, for the door's one question about it: whether this send passes the thread's 24-hour pause (D4).
    trigger: w.trigger,
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
  const version = versionOf(w, "sms");
  if (!version) return { held: "no_channel" };
  const said = renderOwnVersion("sms", version, i.params, b.template_language);
  return { delivery: { ...base, channel: "sms", body: said.body } };
}
