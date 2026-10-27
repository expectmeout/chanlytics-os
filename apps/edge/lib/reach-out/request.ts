/**
 * The email a reach-out send leaves as, frozen before its row is written (Reach out, Part 3; C9, C10, D19; decision
 * 0056): the step's words with the lead's values in, from the mailbox the business connected (its name, its address,
 * its address again to answer, so a reply lands in that mailbox and is read back into the Inbox), its signature, the
 * foot the law asks for, and the one-click unsubscribe sealed for this person and this email. Plain text, with no HTML
 * twin and no Auto-Submitted mark: one person's email from their own mailbox. A step after the first answers the email
 * before it: "Re:" and its Message-ID, so the nudge reads as the same thread (D19). Pure over its inputs; the sender
 * (sender.ts) reads them, and so does the sheet's preview (preview.ts), so a preview holds what a send holds.
 *
 * The slots (Part 4) are filled with their real values: the lead's name and city, the workspace's name, the name the
 * chain signs with, the workspace's booking link, the opening the check wrote for this send, and for a company the
 * person it writes to (00430: their first name, title and role, each with its fallback). The foot's first line says
 * where the lead was found (whyFrom, from its source).
 *
 * A reach-out its owner sends (00429) is handed to them instead (reachOutDraft): the same words, the same foot with its
 * way out in words and no link (their own client carries no List-Unsubscribe header), a nudge under "Re:" the email
 * before, as plain text they open or paste.
 */
import { createHash } from "node:crypto";
import {
  buildEmailRequest,
  connectedIdentity,
  mailboxSignatureOf,
  signUnsubscribeToken,
  unsubscribeUrl,
  type EmailParent,
  type EmailRequest,
} from "../packages/channels.js";
import {
  emailFoot,
  REACH_OUT_LANGUAGE,
  reachOutEmailOf,
  reachOutSlotFault,
  slotCount,
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
  lead: SlotLead;
  /** The workspace's slots, and the address its foot names. */
  workspace: Required<SlotWorkspace> & { address: string | null };
  /** The opening the check wrote for this send; null when it has none. */
  opening: string | null;
  /** The mailbox it leaves from: the name it sends as, its address, and the signature its owner gave it. */
  /** The mailbox it leaves from, and what that mailbox signs with (00487, channels mailboxSignatureOf). */
  from: {
    address: string;
    from_name: string;
    signature: string | null;
    signature_off?: boolean;
    gmail_signature?: string | null;
    gmail_signature_at?: string | null;
  };
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
  if (texts.some(reachOutSlotFault)) return { ok: false, reason: "unknown_slot" };
  if (subject !== null && !subject.trim()) return { ok: false, reason: "no_subject" };
  const said = texts.join("\n");
  if (slotCount(said, "your name") > 0 && !workspace.yourName?.trim()) return { ok: false, reason: "no_signed_by" };
  if (slotCount(said, "booking link") > 0 && !workspace.bookingLink?.trim())
    return { ok: false, reason: "no_booking_link" };
  if (wordsNeedOpening({ subject, body: words.body }) && !opening?.trim()) return { ok: false, reason: "no_opening" };
  // Filled by the one fill every email takes (contracts reachOutEmailOf), the one the sheet's and the Templates page's
  // previews read: a value this lead lacks holds this email alone.
  const email = reachOutEmailOf({ subject, body: words.body }, lead, workspace, opening);
  return email.ok ? { ok: true, subject: email.subject, body: email.body } : { ok: false, reason: email.reason };
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

/** What a reach-out its owner sends hands them for one lead (00429). */
interface DraftInput {
  words: { subject: string | null; body: string };
  lead: SlotLead;
  workspace: Required<SlotWorkspace> & { address: string | null };
  opening: string | null;
  /** The lead's email on the step before, for a step after the first: its subject, which this one answers. */
  parent: { subject: string | null } | null;
}

/** A subject that answers another: "Re:" once, never twice. */
const reOf = (subject: string): string => (/^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`);

/**
 * The email a reach-out its owner sends hands them (00429): the step's words with this lead's values in (reachOutWords,
 * the one fill), under "Re:" the email before for a step after the first, and the cold foot with its way out in words.
 * `text` is the whole email as the owner sends it: its words, a blank line, its foot. Refused as reachOutRequest refuses.
 */
export function reachOutDraft(
  i: DraftInput,
): { ok: true; subject: string; body: string; text: string } | { ok: false; reason: RequestRefusal } {
  const words = reachOutWords(i.words, i.lead, i.workspace, i.parent !== null, i.opening);
  if (!words.ok) return words;
  const business = i.workspace.businessName?.trim() ?? "";
  const address = i.workspace.address?.trim() ?? "";
  if (!business || !address) return { ok: false, reason: "no_business_address" };
  const before = i.parent?.subject?.trim() ?? "";
  const subject = words.subject ?? (before ? reOf(before) : "");
  if (!subject.trim()) return { ok: false, reason: "no_subject" };
  const foot = emailFoot(
    business,
    address,
    { kind: "cold", why: whyFrom(i.lead.source ?? "local_businesses"), unsubscribeUrl: null },
    REACH_OUT_LANGUAGE,
  );
  return { ok: true, subject, body: words.body, text: `${words.body}\n\n${foot}` };
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
  // Where the finder found the lead (its source, 00430): the map, a business directory, or a file of the owner's own.
  const foot = { kind: "cold" as const, why: whyFrom(i.lead.source ?? "local_businesses"), unsubscribeUrl: url };
  let request: EmailRequest;
  try {
    request = buildEmailRequest({
      identity: connectedIdentity(i.from),
      to: i.to,
      parent: i.parent,
      ...(words.subject !== null ? { subject: words.subject } : {}),
      body: words.body,
      signature: mailboxSignatureOf(i.from)?.text ?? null,
      // The owner's words, from the owner's own mailbox: one person's email, so it is marked as nothing else.
      actor: "human",
      plain: true,
      autoSubmitted: false,
      campaign: {
        unsubscribeUrl: url,
        // In the language every reach-out email is filed in, the one its words are filled under (reachOutEmailOf).
        footer: emailFoot(business, address, foot, REACH_OUT_LANGUAGE),
      },
      messageId: i.messageId,
      tenantId: i.tenantId,
    });
  } catch {
    // Words no email may carry (a first email whose subject poses as a reply): the step's to fix, never this send's.
    return { ok: false, reason: "words_unsendable" };
  }
  return { ok: true, request, subject: request.subject, body: words.body };
}
