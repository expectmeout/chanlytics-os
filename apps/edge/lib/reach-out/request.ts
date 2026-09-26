/**
 * The email a reach-out send leaves as, frozen before its row is written (Reach out, Part 3; C9, C10, D19): the step's
 * words with the lead's values in, the workspace's own domain as From and its mailbox's reply route as Reply-To (so a
 * reply lands in the Inbox), the foot the law asks for, and the one-click unsubscribe sealed for this person and this
 * email. A step after the first answers the email before it: "Re:" and its Message-ID, so the nudge reads as the same
 * thread (D19). Pure over its inputs; the sender (sender.ts) reads them, and so does the sheet's preview (preview.ts),
 * so a preview holds what a send holds.
 *
 * The six slots (Part 4) are filled with their real values: the lead's name and city, the workspace's name, the name
 * the chain signs with, the workspace's booking link, and the opening the check wrote for this send.
 */
import { createHash } from "node:crypto";
import {
  buildEmailRequest,
  ownDomainIdentity,
  signUnsubscribeToken,
  unsubscribeUrl,
  type EmailParent,
  type EmailRequest,
} from "../packages/channels.js";
import {
  campaignFooter,
  campaignFooterHtml,
  isReachOutSlot,
  reachOutSlots,
  slotCount,
  slotsNamed,
  whyFrom,
  wordsNeedOpening,
  type SlotLead,
  type SlotWorkspace,
} from "../packages/contracts.js";

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
  /** The workspace's slots, and the address its foot names. */
  workspace: Required<SlotWorkspace> & { address: string | null };
  /** The opening the check wrote for this send; null when it has none. */
  opening: string | null;
  domain: { host: string; from_local: string; from_name: string };
  mailbox: { reply_token: string };
  /** The domain its replies come back on: the mail domain, or the cold reply domain when it is set (D17). */
  replyDomain: string;
  unsubscribe: { secret: string; origin: string };
  /** The lead's email on the step before, for a step after the first; null for the first. */
  parent: EmailParent | null;
}

/**
 * Why a step's words cannot become this lead's email:
 *   - the step's own (unknown_slot, no_subject) and the workspace's (no_signed_by, no_booking_link): the sender holds
 *     the send and the lead keeps its place (R6), since its owner can fix them;
 *   - no_opening: the words name {{opening}} and this send has none, so it goes back to be checked (R5);
 *   - missing_value: this lead has no value for a slot ({{city}} for a lead with none), and this send alone is skipped.
 */
export type WordsRefusal =
  "unknown_slot" | "no_subject" | "no_signed_by" | "no_booking_link" | "no_opening" | "missing_value";
export type RequestRefusal = WordsRefusal | "no_business_address" | "words_unsendable";

/**
 * A step's words with this send's values in. The step's own faults come first: a first email with no subject, or a
 * {{…}} that is none of the six (contracts' one slot rule). Then the workspace's: words that name the name it signs
 * with, or its booking link, when it has none. Then this send's opening, and last the lead's own values. A step after
 * the first answers the email before it, so its own heading is never read (D19).
 */
export function reachOutWords(
  words: { subject: string | null; body: string },
  lead: SlotLead,
  workspace: SlotWorkspace,
  answers: boolean,
  opening: string | null,
): { ok: true; subject: string | null; body: string } | { ok: false; reason: WordsRefusal } {
  const subject = answers ? null : (words.subject ?? "");
  const texts = subject === null ? [words.body] : [subject, words.body];
  for (const text of texts) {
    const named = slotsNamed(text);
    if (named.stray || named.names.some((k) => !isReachOutSlot(k))) return { ok: false, reason: "unknown_slot" };
  }
  if (subject !== null && !subject.trim()) return { ok: false, reason: "no_subject" };
  const said = texts.join("\n");
  if (slotCount(said, "your name") > 0 && !workspace.yourName?.trim()) return { ok: false, reason: "no_signed_by" };
  if (slotCount(said, "booking link") > 0 && !workspace.bookingLink?.trim())
    return { ok: false, reason: "no_booking_link" };
  if (wordsNeedOpening({ subject, body: words.body }) && !opening?.trim()) return { ok: false, reason: "no_opening" };
  const s = subject === null ? null : reachOutSlots(subject, lead, workspace, opening);
  const b = reachOutSlots(words.body, lead, workspace, opening);
  if ((s && !s.ok) || !b.ok) return { ok: false, reason: "missing_value" };
  return { ok: true, subject: s ? s.text : null, body: b.text };
}

/**
 * The words a send was checked against (R5), as one short mark: its step's words, the name its chain signs with, and
 * whether the workspace has a booking link. The check stamps it on the send; the sender compares it with the words as
 * they stand, and a send whose words changed since goes back to be checked.
 */
export function checkedWordsOf(
  words: { subject: string | null; body: string },
  signedBy: string | null,
  hasBookingLink: boolean,
): string {
  return createHash("sha256")
    .update(JSON.stringify([words.subject ?? null, words.body, signedBy?.trim() || null, hasBookingLink]))
    .digest("hex");
}

export function reachOutRequest(
  i: RequestInput,
): { ok: true; request: EmailRequest; subject: string; body: string } | { ok: false; reason: RequestRefusal } {
  const words = reachOutWords(i.words, i.lead, i.workspace, i.parent !== null, i.opening);
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
      identity: ownDomainIdentity(i.domain, i.mailbox, i.replyDomain),
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
