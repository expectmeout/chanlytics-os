import {
  AppError,
  firstNameOf,
  inboxSlots,
  isOptedOutContact,
  normalizeEmail,
  OPT_OUT_REFUSAL,
  purposeOfTemplate,
  renderTemplate,
  REPLY_LIMITS,
  replyWindow,
  resolveParams,
  slotToWrite,
} from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import type { Thread, ThreadPorts } from "./ports";
import { PERSON_CONTROL_MAX_S } from "./take-over";

/** The cancelable window IS the undo (§6): a queued reply waits this long before the job sends it. */
export const SEND_GRACE_MS = 15 * 1000;
/**
 * How long a stored reply receipt is replayed instead of sending again. The
 * key identifies the message, not the attempt, so this window is the ONLY
 * thing separating "a retry of the send that just timed out" from "the
 * operator meant to say that again". A retry arrives in seconds; repeating
 * the same words inside thirty seconds on purpose is implausible, and the
 * cost of getting it wrong is asymmetric: a swallowed send reports success
 * while the customer receives nothing.
 */
export const IDEMPOTENCY_WINDOW_MS = 30 * 1000;

export interface ReplyBody {
  text?: string;
  template?: { name: string; language: string; params?: string[] };
  /**
   * Email only: the address the operator was shown and agreed to, when the
   * address on the person's page is not the one they last wrote from. Agreed by
   * value, so an address that changed again in between is asked about again.
   */
  email_to?: string;
}
/** `decision_id` is the ledger row, for an undo to name; absent on a receipt stored before it was kept. */
export interface ReplyReceipt {
  message_id: string;
  status: string;
  cancelable_until: string;
  window_open: boolean;
  withdrawn_drafts: number;
  decision_id?: string;
}
export interface ReplyThread extends Pick<Thread, "id" | "tenant_id" | "phone_e164"> {
  contact_id: string | null;
  last_wa_inbound_at: string | null;
  consent: string | null;
  dnc: boolean | null;
  marketing_consent: string | null;
  /** The names on file, for a template that opens with their first name. */
  display_name?: string | null;
  wa_profile_name?: string | null;
  /** The address on the person's page, and whether it has stopped being sent to (00125, 00126). */
  email?: string | null;
  email_suppressed_at?: string | null;
}
export interface QueuedReply {
  tenant_id: string;
  conversation_id: string;
  contact_id: string | null;
  channel: "whatsapp" | "sms" | "email";
  sent_by: string;
  type: "template" | "text";
  body: string;
  template_name: string | null;
  template_vars: Json | null;
  content_hash: string;
  /** An email's row is born with its id and its frozen request: the request is tagged with the id and sent under it. */
  id?: string;
  meta?: Json;
}
/** An address never travels in a field the send path reads as a phone number: an email's is `to_email`. */
export type SendPayload = { message_id: string; conversation_id: string } & (
  { to_phone: string } | { to_email: string }
) &
  ({ body: string } | { template: { name: string; language: string; params: string[] } });

/** The email a reply answers, as the thread stores it. */
export interface EmailParentFacts {
  /** The stored message. */
  messageId: string;
  /** The address it came from, as its header spelled it. */
  from: string | null;
  /** Its own Message-ID and the chain it carried, for threading in the customer's mail client. */
  rfcMessageId: string | null;
  references: string[];
  subject: string | null;
}

/**
 * Email's half of a reply. The verb decides who it goes to and whether a
 * person must agree first; what it leaves AS is the adapter's, which knows the
 * workspace's mailbox and the deployment's mail domain (channels
 * buildEmailRequest, the one constructor of a request).
 */
export interface EmailReplyPorts {
  /** The person's latest email on this thread; null when it holds none. Read inside this workspace and this conversation only. */
  parent(conv: { id: string; tenant_id: string }): Promise<EmailParentFacts | null>;
  /** The request this reply leaves as, frozen, and the subject it carries; null when the workspace has no mailbox to send from. */
  freeze(input: {
    tenantId: string;
    messageId: string;
    to: string;
    parent: EmailParentFacts;
    body: string;
  }): Promise<{ request: Json; subject: string } | null>;
  /** The row's id before the row exists. */
  newId(): string;
}

export interface ReplyPorts extends Pick<
  ThreadPorts,
  "pauseMs" | "takeControl" | "withdrawDrafts" | "record" | "resolveEscalation" | "now"
> {
  /** Where the person last wrote: a text and an email have no 24-hour window and no templates. */
  replyChannel(conv: { id: string; tenant_id: string }): Promise<"whatsapp" | "sms" | "email">;
  email: EmailReplyPorts;
  /** The receipt stored under this caller's key, with when and for which intent it was stored. */
  priorReceipt(
    tenantId: string,
    key: string,
  ): Promise<{ response: ReplyReceipt; created_at: string; request_hash: string | null } | null>;
  /** The workspace's template by name and language, as Meta last told us about it; `variables` is one entry per slot, when the sync has filled it. */
  template(
    tenantId: string,
    name: string,
    language: string,
  ): Promise<{
    name: string;
    language: string;
    body_preview: string | null;
    meta_status: string | null;
    category: string | null;
    variables?: unknown;
  } | null>;
  /**
   * The facts a template's params come from, when the workspace has them: its name, and its booking link or null for
   * a business that quotes each job (the first run's decision 2).
   */
  templateFacts(tenantId: string): Promise<{ business_name: string; booking_link: string | null } | null>;
  /** needs_human, paused until, snooze cleared, claimed by the user, and the thread touched now. True iff a row changed. */
  claimForReply(conversationId: string, untilIso: string, userId: string, nowIso: string): Promise<boolean>;
  /** The operator's words as a queued outbound row; its id. */
  queue(row: QueuedReply): Promise<string>;
  /** The send job, due after the grace window; throws when it could not be scheduled. */
  schedule(tenantId: string, dueAt: Date, payload: SendPayload): Promise<void>;
  /** A queued row with no job to send it, canceled so it never sits "Sending…" forever. */
  cancelOrphan(messageId: string): Promise<void>;
  /** The receipt kept under the key for the replay window; a failure is logged there, never fatal. */
  storeReceipt(tenantId: string, key: string, requestHash: string, response: ReplyReceipt): Promise<void>;
  /** A stable digest of a string, for the intent and the content. */
  hash(s: string): string;
}
export interface ReplyCommand {
  conv: ReplyThread;
  userId: string;
  body: ReplyBody;
  idempotencyKey: string | null;
}

/**
 * What an email reply adds to the queued row. Everything here is decided
 * before anything is claimed or written, so a refusal means nothing happened.
 *
 * The recipient is the address on the person's page, never the parent's
 * headers: those are the sender's own words. When the two differ (the owner
 * corrected the address since, or the person wrote from a second one) the
 * operator is told where the reply will go and agrees to it by value, rather
 * than the reply going somewhere they did not expect (the plan's §7).
 */
async function shapeEmailReply(
  ports: ReplyPorts,
  conv: ReplyThread,
  to: string,
  text: string,
  agreedTo: string | undefined,
): Promise<{ id: string; meta: Json }> {
  if (conv.email_suppressed_at) {
    throw new AppError(
      "conflict",
      "Email to this address has stopped: it bounced, or they reported it. Correct the address on their page, or reach them another way.",
    );
  }
  const parent = await ports.email.parent(conv);
  if (!parent) throw new AppError("conflict", "There is no email from this person on this thread to reply to.");
  if (normalizeEmail(parent.from ?? "") !== to && agreedTo !== to) {
    throw new AppError(
      "conflict",
      `Their last email came from ${parent.from ?? "an address that was not kept"}, and the address on their page is ${to}. This reply will go to ${to}.`,
      409,
      { confirm_email_to: to },
    );
  }
  const id = ports.email.newId();
  const frozen = await ports.email.freeze({ tenantId: conv.tenant_id, messageId: id, to, parent, body: text });
  if (!frozen)
    throw new AppError(
      "conflict",
      "This workspace has no email address to send from yet. Set one up in Settings › Channels first.",
    );
  return {
    id,
    meta: {
      email: {
        subject: frozen.subject,
        to: [to],
        parent_id: parent.messageId,
        in_reply_to: parent.rfcMessageId,
        request: frozen.request,
      },
    } as Json,
  };
}

/**
 * Human reply (§4/§6): honest by API shape. Inside the 24h window → freeform;
 * outside → approved template only. The send is NEVER synchronous: the row
 * sits status='queued' through a cancel window (the honest undo), then the
 * outbound_send job fires it. A dashboard reply implicitly pauses the
 * receptionist (D10).
 */
export async function replyToConversation(ports: ReplyPorts, cmd: ReplyCommand): Promise<ReplyReceipt> {
  const { conv, body } = cmd;
  // An opt-out binds the humans too — refuse BEFORE anything is queued, so the
  // operator is told rather than watching a message sit in "queued" and then
  // silently cancel itself when the job re-checks.
  if (isOptedOutContact(conv)) throw new AppError("conflict", OPT_OUT_REFUSAL);

  // The clock is the port's, for the window too: the wall clock closed a
  // window the test had frozen open, a day after the test was written.
  const now = ports.now();
  // A reply goes back on the wire the person last wrote on, to the address that
  // wire needs. It never crosses: an email that cannot be sent does not become a text.
  const channel = await ports.replyChannel(conv);
  const to = channel === "email" ? (conv.email ?? null) : conv.phone_e164;
  if (!to) {
    throw new AppError(
      "conflict",
      channel === "email"
        ? "This person has no email address on their page, so an email reply cannot reach them. Add it there first."
        : "This person has no phone number, so a WhatsApp or text reply cannot reach them.",
    );
  }
  const window = replyWindow(channel, conv.last_wa_inbound_at, new Date(now));

  // Idempotency: a replayed POST returns the original receipt, never a double
  // text. The key is scoped to the CALLER and checked against the INTENT: the
  // client derives it from the thread and the words, which any member can
  // predict, so a stored receipt must never answer a colleague's identical
  // send; and a different body under the same key is a different intent.
  const idemKey = cmd.idempotencyKey ? `${cmd.userId}:${cmd.idempotencyKey}` : null;
  const intentHash = ports.hash(JSON.stringify(body));
  if (idemKey) {
    const prior = await ports.priorReceipt(conv.tenant_id, idemKey);
    // A receipt with no hash never answers: every writer keeps one, and a
    // receipt that somehow lacks it must not swallow a send on the strength
    // of the key alone.
    const sameIntent = prior?.request_hash === intentHash;
    if (prior && sameIntent && now - Date.parse(prior.created_at) < IDEMPOTENCY_WINDOW_MS) return prior.response;
  }

  let messageBody: string;
  let templateVars: Json | null = null;
  let templateName: string | null = null;
  let jobTemplate: { name: string; language: string; params: string[] } | undefined;
  let email: { id: string; meta: Json } | null = null;
  if (window.open) {
    if (!body.text?.trim()) throw new AppError("validation", "Reply text is required.");
    messageBody = body.text.trim();
    if (messageBody.length > REPLY_LIMITS[channel].max) throw new AppError("validation", REPLY_LIMITS[channel].refusal);
    if (channel === "email") email = await shapeEmailReply(ports, conv, to, messageBody, body.email_to);
  } else {
    if (!body.template?.name)
      throw new AppError(
        "window_closed",
        "The 24-hour WhatsApp window is closed — replies must use an approved template.",
      );
    const tpl = await ports.template(conv.tenant_id, body.template.name, body.template.language);
    if (!tpl || tpl.meta_status !== "approved") throw new AppError("validation", "Template not found or not approved.");
    // Which yes this template needs is Meta's category, and the door asks
    // again at the wire. Asked here too, so the operator hears a sentence now
    // instead of finding a canceled row later.
    if (purposeOfTemplate(tpl.category) === "marketing" && conv.marketing_consent !== "opted_in") {
      throw new AppError(
        "forbidden",
        "This template is a promotion, and this person has not said yes to offers. Use an appointment template, or ask them first.",
      );
    }
    // The template's own slots, filled as broadcasts and the assistant fill them (inboxSlots, resolveParams): the
    // customer's first name, the business name, the booking link. The Inbox filled exactly two -- the business name
    // and the link -- and turned away the workspace's own starters, which open with the first name (I6). A slot with
    // words to write is one the Inbox does not ask for: refused here, in its own label, where the operator hears a
    // sentence, not by Meta fifteen seconds after "queued".
    const toWrite = slotToWrite(tpl);
    if (toWrite) {
      throw new AppError(
        "validation",
        `This template needs words for “${toWrite}”, which the Inbox does not ask for. Pick a template without them, or send it from Campaigns.`,
      );
    }
    // Params are TENANT FACTS (E4): the workspace's own words for the slots
    // that name it, never the browser's, so the browser never chooses the
    // link that lands on a phone. A workspace with no facts on file cannot
    // send a template from here, and is told so before anything is queued.
    const facts = await ports.templateFacts(conv.tenant_id);
    if (!facts)
      throw new AppError(
        "validation",
        "This workspace has no template facts configured yet. Add the business name and booking link in Settings › Business first.",
      );
    const slots = inboxSlots(tpl);
    // A business that quotes each job has no link (the first run's decision 2). Its templates that name none still
    // go; one that sends the link is refused here, in words, rather than sent with the slot empty.
    if (!facts.booking_link && slots.some((s) => s.kind === "booking_link"))
      throw new AppError(
        "validation",
        "This template takes the booking link, and none is on file. Pick another template, or add the link in Settings › Business first.",
      );
    const params: string[] = resolveParams(slots, {
      firstName: firstNameOf(conv.display_name, conv.wa_profile_name),
      businessName: facts.business_name,
      bookingLink: facts.booking_link?.replace(/^https?:[/][/]/, "") ?? null,
    });
    templateName = tpl.name;
    templateVars = { language: tpl.language, params } as Json;
    messageBody = renderTemplate(tpl.body_preview, params) || `[template ${tpl.name}]`;
    jobTemplate = { name: tpl.name, language: tpl.language, params };
  }

  // ORDER MATTERS: pause the receptionist and claim the thread BEFORE any row
  // exists that a job could send. A failure here means nothing was queued, so
  // "it failed" is the truth. Zero rows counts as failure for the same reason
  // it does everywhere else: a forbidden or mis-targeted UPDATE reports success.
  const pauseUntil = now + (await ports.pauseMs(conv.tenant_id));
  // The claim IS the pause: one statement, one fact, and nothing in front of it
  // to be left disagreeing when it changes no row (take-over.ts says why).
  if (
    !(await ports.claimForReply(conv.id, new Date(pauseUntil).toISOString(), cmd.userId, new Date(now).toISOString()))
  ) {
    throw new AppError("conflict", "Could not take this thread over just now, so nothing was sent. Try again.", 409);
  }
  // Who is speaking now (00132), taken before the drafts go: the wire asks
  // this, and between the claim and the withdrawal a draft can still reach it.
  await ports.takeControl(
    conv.tenant_id,
    conv.id,
    cmd.userId,
    Math.min(PERSON_CONTROL_MAX_S, Math.max(1, Math.round((pauseUntil - now) / 1000))),
  );
  // The operator is REPLACING the receptionist's held reply, not queueing
  // behind it: withdraw the draft before writing their own words, or the
  // customer receives both.
  const withdrawn_drafts = await ports.withdrawDrafts(conv.tenant_id, conv.id);

  const message_id = await ports.queue({
    tenant_id: conv.tenant_id,
    conversation_id: conv.id,
    contact_id: conv.contact_id,
    channel,
    sent_by: cmd.userId,
    type: jobTemplate ? "template" : "text",
    body: messageBody,
    template_name: templateName,
    template_vars: templateVars,
    content_hash: ports.hash(messageBody),
    ...(email ?? {}),
  });
  const dueAt = new Date(now + SEND_GRACE_MS);
  try {
    await ports.schedule(conv.tenant_id, dueAt, {
      message_id,
      conversation_id: conv.id,
      ...(channel === "email" ? { to_email: to } : { to_phone: to }),
      ...(jobTemplate ? { template: jobTemplate } : { body: messageBody }),
    });
  } catch (e) {
    // Never leave an orphan queued row that silently never sends.
    await ports.cancelOrphan(message_id);
    throw e;
  }
  // The receipt is kept the moment the send is certain: a retry under the same
  // key after a failure further down must find it, or the words go twice. It
  // is kept again below with the decision's id, once there is one.
  const queued: ReplyReceipt = {
    message_id,
    status: "queued",
    cancelable_until: dueAt.toISOString(),
    window_open: window.open,
    withdrawn_drafts,
  };
  if (idemKey) await ports.storeReceipt(conv.tenant_id, idemKey, intentHash, queued);
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "reply", {
    message_id,
    window_open: window.open,
    template: templateName,
  });
  await ports.resolveEscalation(conv.id, decision_id);

  const receipt: ReplyReceipt = { ...queued, decision_id };
  if (idemKey) await ports.storeReceipt(conv.tenant_id, idemKey, intentHash, receipt);
  return receipt;
}
