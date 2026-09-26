/**
 * The email a reach-out send leaves as, frozen before its row is written (Reach out, Part 3; C9, C10, D19): the step's
 * words with the lead's values in, the workspace's own domain as From and its mailbox's reply route as Reply-To (so a
 * reply lands in the Inbox), the foot the law asks for, and the one-click unsubscribe sealed for this person and this
 * email. A step after the first answers the email before it: "Re:" and its Message-ID, so the nudge reads as the same
 * thread (D19). Pure over its inputs; the sender (sender.ts) reads them.
 */
import {
  buildEmailRequest,
  ownDomainIdentity,
  signUnsubscribeToken,
  unsubscribeUrl,
  type EmailParent,
  type EmailRequest,
} from "../packages/channels.js";
import { campaignFooter, campaignFooterHtml, reachOutSlots, whyFrom, type SlotLead } from "../packages/contracts.js";

export interface RequestInput {
  tenantId: string;
  /** The email's own id (core sendMessageId): the idempotency key, the tag, and the unsubscribe's seal. */
  messageId: string;
  contactId: string;
  /** The person's stored address, as the send door compares it. */
  to: string;
  /** The step's words: its template's heading (the subject) and body. */
  words: { subject: string | null; body: string };
  lead: { business_name: string | null; city: string | null };
  workspace: { businessName: string | null; address: string | null };
  domain: { host: string; from_local: string; from_name: string };
  mailbox: { reply_token: string };
  mailDomain: string;
  unsubscribe: { secret: string; origin: string };
  /** The lead's email on the step before, for a step after the first; null for the first. */
  parent: EmailParent | null;
}

/** Why a step's words cannot become this lead's: the step's (no subject, a slot no lead could fill) or the lead's. */
export type WordsRefusal = "unknown_slot" | "no_subject" | "missing_value";
export type RequestRefusal = WordsRefusal | "no_business_address" | "words_unsendable";

/** Every slot a step may name, each with a value: what tells a slot no lead could fill from one this lead cannot. */
const EVERY_SLOT = { lead: { business_name: "x", city: "x" }, workspace: { businessName: "x" } };

/**
 * A step's words with this lead's values in. The step's own faults come first, and are the step's to fix (the sender
 * holds its sends): a first email with no subject, or a slot no lead could fill ({{first name}}). Then the lead's: a
 * slot it has no value for ({{city}} for a lead with none) holds this email and no other. A step after the first
 * answers the email before it, so its own heading is never read (D19).
 */
export function reachOutWords(
  words: { subject: string | null; body: string },
  lead: SlotLead,
  workspace: { businessName: string | null },
  answers: boolean,
): { ok: true; subject: string | null; body: string } | { ok: false; reason: WordsRefusal } {
  const subject = answers ? null : (words.subject ?? "");
  for (const text of [subject, words.body])
    if (text !== null && !reachOutSlots(text, EVERY_SLOT.lead, EVERY_SLOT.workspace).ok)
      return { ok: false, reason: "unknown_slot" };
  if (subject !== null && !subject.trim()) return { ok: false, reason: "no_subject" };
  const s = subject === null ? null : reachOutSlots(subject, lead, workspace);
  const b = reachOutSlots(words.body, lead, workspace);
  if ((s && !s.ok) || !b.ok) return { ok: false, reason: "missing_value" };
  return { ok: true, subject: s ? s.text : null, body: b.text };
}

export function reachOutRequest(
  i: RequestInput,
): { ok: true; request: EmailRequest; subject: string; body: string } | { ok: false; reason: RequestRefusal } {
  const words = reachOutWords(i.words, i.lead, i.workspace, i.parent !== null);
  if (!words.ok) return words;
  // The foot names who and where (CAN-SPAM): without both there is no email to send, only a refusal to say.
  const business = i.workspace.businessName?.trim() ?? "";
  const address = i.workspace.address?.trim() ?? "";
  if (!business || !address) return { ok: false, reason: "no_business_address" };
  const token = signUnsubscribeToken(i.unsubscribe.secret, {
    tenantId: i.tenantId,
    contactId: i.contactId,
    messageId: i.messageId,
  });
  const url = unsubscribeUrl(i.unsubscribe.origin, token);
  // Every lead a reach-out writes to is one the finder found on the map.
  const foot = { why: whyFrom("maps"), business, address, unsubscribeUrl: url };
  let request: EmailRequest;
  try {
    request = buildEmailRequest({
      identity: ownDomainIdentity(i.domain, i.mailbox, i.mailDomain),
      to: i.to,
      parent: i.parent,
      ...(words.subject !== null ? { subject: words.subject } : {}),
      body: words.body,
      signature: null,
      // The owner's words, sent by the machine: the campaign marks it auto-generated either way.
      actor: "human",
      campaign: { unsubscribeUrl: url, footer: campaignFooter(foot), footerHtml: campaignFooterHtml(foot) },
      messageId: i.messageId,
      tenantId: i.tenantId,
    });
  } catch {
    // Words no email may carry (a first email whose subject poses as a reply): the step's to fix, never this send's.
    return { ok: false, reason: "words_unsendable" };
  }
  return { ok: true, request, subject: request.subject, body: words.body };
}
