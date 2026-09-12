import { AppError, isOptedOutContact, OPT_OUT_REFUSAL, purposeOfTemplate, replyWindow } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import type { Thread, ThreadPorts } from "./ports";

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
}
/** `decision_id` is the ledger row, for an undo to name; absent on a receipt stored before it was kept. */
export interface ReplyReceipt { message_id: string; status: string; cancelable_until: string; window_open: boolean; withdrawn_drafts: number; decision_id?: string }
export interface ReplyThread extends Pick<Thread, "id" | "tenant_id" | "phone_e164"> {
  contact_id: string | null;
  last_wa_inbound_at: string | null;
  consent: string | null;
  dnc: boolean | null;
  marketing_consent: string | null;
}
export interface QueuedReply {
  tenant_id: string;
  conversation_id: string;
  contact_id: string | null;
  channel: "whatsapp" | "sms";
  sent_by: string;
  type: "template" | "text";
  body: string;
  template_name: string | null;
  template_vars: Json | null;
  content_hash: string;
}
export type SendPayload = { message_id: string; conversation_id: string; to_phone: string } & ({ body: string } | { template: { name: string; language: string; params: string[] } });

export interface ReplyPorts extends Pick<ThreadPorts, "pauseMs" | "pauseBot" | "withdrawDrafts" | "record" | "resolveEscalation" | "now"> {
  /** Where the person last wrote: a text has no 24-hour window and no templates. */
  replyChannel(conv: { id: string; tenant_id: string }): Promise<"whatsapp" | "sms">;
  /** The receipt stored under this caller's key, with when and for which intent it was stored. */
  priorReceipt(tenantId: string, key: string): Promise<{ response: ReplyReceipt; created_at: string; request_hash: string | null } | null>;
  /** The workspace's template by name and language, as Meta last told us about it. */
  template(tenantId: string, name: string, language: string): Promise<{ name: string; language: string; body_preview: string | null; meta_status: string | null; category: string | null } | null>;
  /** The facts a template's params come from, when the workspace has them. */
  templateFacts(tenantId: string): Promise<{ business_name: string; booking_link: string } | null>;
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
export interface ReplyCommand { conv: ReplyThread; userId: string; body: ReplyBody; idempotencyKey: string | null }

/**
 * Human reply (§4/§6): honest by API shape. Inside the 24h window → freeform;
 * outside → approved template only. The send is NEVER synchronous: the row
 * sits status='queued' through a cancel window (the honest undo), then the
 * outbound_send job fires it. A dashboard reply implicitly pauses the
 * receptionist (D10).
 */
export async function replyToConversation(ports: ReplyPorts, cmd: ReplyCommand): Promise<ReplyReceipt> {
  const { conv, body } = cmd;
  if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
  // An opt-out binds the humans too — refuse BEFORE anything is queued, so the
  // operator is told rather than watching a message sit in "queued" and then
  // silently cancel itself when the job re-checks.
  if (isOptedOutContact(conv)) throw new AppError("conflict", OPT_OUT_REFUSAL);

  // The clock is the port's, for the window too: the wall clock closed a
  // window the test had frozen open, a day after the test was written.
  const now = ports.now();
  const channel = await ports.replyChannel(conv);
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
    const sameIntent = !prior?.request_hash || prior.request_hash === intentHash;
    if (prior && sameIntent && now - Date.parse(prior.created_at) < IDEMPOTENCY_WINDOW_MS) return prior.response;
  }

  let messageBody: string;
  let templateVars: Json | null = null;
  let templateName: string | null = null;
  let jobTemplate: { name: string; language: string; params: string[] } | undefined;
  if (window.open) {
    if (!body.text?.trim()) throw new AppError("validation", "Reply text is required.");
    messageBody = body.text.trim();
    if (channel === "sms" && messageBody.length > 1600) throw new AppError("validation", "A text can be at most 1600 characters.");
  } else {
    if (!body.template?.name) throw new AppError("window_closed", "The 24-hour WhatsApp window is closed — replies must use an approved template.");
    const tpl = await ports.template(conv.tenant_id, body.template.name, body.template.language);
    if (!tpl || tpl.meta_status !== "approved") throw new AppError("validation", "Template not found or not approved.");
    // Which yes this template needs is Meta's category, and the door asks
    // again at the wire. Asked here too, so the operator hears a sentence now
    // instead of finding a canceled row later.
    if (purposeOfTemplate(tpl.category) === "marketing" && conv.marketing_consent !== "opted_in") {
      throw new AppError("forbidden", "This template is a promotion, and this person has not said yes to offers. Use an appointment template, or ask them first.");
    }
    // Params are TENANT FACTS (E4): the workspace's config first, the client's
    // as a fallback for a workspace with no config, bounded by the route's
    // schema; so the browser never chooses the link that lands on a phone.
    const facts = await ports.templateFacts(conv.tenant_id);
    let params: string[] = facts ? [facts.business_name, facts.booking_link.replace(/^https?:[/][/]/, "")] : [];
    if (!params.length) params = body.template.params ?? [];
    if (!params.length) throw new AppError("validation", "This workspace has no template facts configured yet.");
    templateName = tpl.name;
    templateVars = { language: tpl.language, params } as Json;
    messageBody = params.reduce((acc, p, i) => acc.replaceAll(`{{${i + 1}}}`, p), tpl.body_preview ?? `[template ${tpl.name}]`);
    jobTemplate = { name: tpl.name, language: tpl.language, params };
  }

  // ORDER MATTERS: pause the receptionist and claim the thread BEFORE any row
  // exists that a job could send. A failure here means nothing was queued, so
  // "it failed" is the truth. Zero rows counts as failure for the same reason
  // it does everywhere else: a forbidden or mis-targeted UPDATE reports success.
  const pauseUntil = now + (await ports.pauseMs(conv.tenant_id));
  await ports.pauseBot(conv.tenant_id, conv.phone_e164, pauseUntil);
  if (!(await ports.claimForReply(conv.id, new Date(pauseUntil).toISOString(), cmd.userId, new Date(now).toISOString()))) {
    throw new AppError("conflict", "Could not take this thread over just now, so nothing was sent. Try again.", 409);
  }
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
  });
  const dueAt = new Date(now + SEND_GRACE_MS);
  try {
    await ports.schedule(conv.tenant_id, dueAt, { message_id, conversation_id: conv.id, to_phone: conv.phone_e164, ...(jobTemplate ? { template: jobTemplate } : { body: messageBody }) });
  } catch (e) {
    // Never leave an orphan queued row that silently never sends.
    await ports.cancelOrphan(message_id);
    throw e;
  }
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "reply", { message_id, window_open: window.open, template: templateName });
  await ports.resolveEscalation(conv.id, decision_id);

  const receipt: ReplyReceipt = { message_id, status: "queued", cancelable_until: dueAt.toISOString(), window_open: window.open, withdrawn_drafts, decision_id };
  if (idemKey) await ports.storeReceipt(conv.tenant_id, idemKey, intentHash, receipt);
  return receipt;
}
