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
import { campaignFooter, campaignFooterHtml, reachOutSlots, whyFrom } from "../packages/contracts.js";

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

export type RequestRefusal = "missing_value" | "no_business_address" | "no_subject" | "words_unsendable";

export function reachOutRequest(
  i: RequestInput,
): { ok: true; request: EmailRequest; subject: string; body: string } | { ok: false; reason: RequestRefusal } {
  // A step's subject is its parent's, once, with "Re:" (buildEmailRequest): its own heading is not read.
  const subject = i.parent ? null : reachOutSlots(i.words.subject ?? "", i.lead, i.workspace);
  const body = reachOutSlots(i.words.body, i.lead, i.workspace);
  if ((subject && !subject.ok) || !body.ok) return { ok: false, reason: "missing_value" };
  if (subject && !subject.text.trim()) return { ok: false, reason: "no_subject" };
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
      ...(subject ? { subject: subject.text } : {}),
      body: body.text,
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
  return { ok: true, request, subject: request.subject, body: body.text };
}
