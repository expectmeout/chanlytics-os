/**
 * The email a reach-out send leaves as, frozen before its row is written (Reach out, Part 3; C9, C10, D19; decision
 * 0056): the step's words with the lead's values in, from the mailbox the business connected (its name, its address,
 * its address again to answer, so a reply lands in that mailbox and is read back into the Inbox), its signature, the
 * foot the law asks for, and the one-click unsubscribe sealed for this person and this email. Plain text, with no HTML
 * twin and no Auto-Submitted mark: one person's email from their own mailbox. A step after the first answers the email
 * before it: "Re:" and its Message-ID, so the nudge reads as the same thread (D19). Pure over its inputs; the edge's sender
 * and the sheet's preview read them, and so does a lead's own email (the dashboard's lead-send.ts), so a preview holds what a
 * send holds.
 *
 * The slots (Part 4) are filled with their real values: the lead's name and city, the workspace's name, the name the
 * chain signs with, the workspace's booking link, the opening the check wrote for this send, and for a company the
 * person it writes to (00430: their first name, title and role, each with its fallback). Its subject, ending and foot
 * are laid out by contracts coldEmailOf, which the owner's draft and Send me a test take too; the foot's first line says
 * where the lead was found (whyFrom, from its source).
 *
 * A reach-out its owner sends (00429) is handed to them instead (reachOutDraft): the same words, the same foot with its
 * way out in words and no link (their own client carries no List-Unsubscribe header), a nudge under "Re:" the email
 * before, as plain text they open or paste.
 */
import { createHash } from "node:crypto";
import { mailboxSignatureOf } from "./mailbox/signature";
import { signUnsubscribeToken, unsubscribeUrl } from "../tokens/unsubscribe-token";
import { connectedIdentity } from "./identity";
import { buildEmailRequest, type EmailParent, type EmailRequest } from "./request";
import {
  coldEmailOf,
  emailTextOf,
  reachOutEmailOf,
  reachOutSlotFault,
  slotCount,
  wordsNeedOpening,
  type ReachOutSignsWith,
  type SlotLead,
  type SlotWorkspace,
} from "@chanlytics/contracts";

interface RequestInput {
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
  /** How its sequence ends its emails (00492, decision 0077): its name, or this mailbox's signature (coldEndingOf). */
  signsWith: ReachOutSignsWith;
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
 *   - preview_building: the words name {{their preview}} and the lead's is being made, or none is yet (decision 0079):
 *     the sender asks for it and holds the send;
 *   - no_preview: the lead's preview failed or has ended, and this send is skipped;
 *   - missing_value: this lead has no value for a slot ({{city}} for a lead with none), and this send alone is skipped.
 */
type WordsRefusal =
  | "unknown_slot"
  | "no_subject"
  | "no_signed_by"
  | "no_booking_link"
  | "no_opening"
  | "preview_building"
  | "no_preview"
  | "missing_value";
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
  // Their preview (decision 0079), before the lead's own values: being made holds the send, gone skips it.
  if (slotCount(said, "their preview") > 0 && lead.preview?.state !== "open")
    return { ok: false, reason: lead.preview?.state === "gone" ? "no_preview" : "preview_building" };
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
  /** How its sequence ends its emails (00492): the owner's mail app adds their own signature, so the name at most. */
  signsWith: ReachOutSignsWith;
}

/**
 * The email a reach-out its owner sends hands them (00429): the step's words with this lead's values in (reachOutWords,
 * the one fill), laid out as the send lays out its email (contracts coldEmailOf: "Re:" the email before for a step after
 * the first, the name under the words, the cold foot with its way out in words). `text` is the whole email as the owner
 * sends it (contracts emailTextOf). Refused as reachOutRequest refuses, and where the email before has no subject.
 */
export function reachOutDraft(
  i: DraftInput,
): { ok: true; subject: string; body: string; text: string } | { ok: false; reason: RequestRefusal } {
  const words = reachOutWords(i.words, i.lead, i.workspace, i.parent !== null, i.opening);
  if (!words.ok) return words;
  const business = i.workspace.businessName?.trim() ?? "";
  const address = i.workspace.address?.trim() ?? "";
  if (!business || !address) return { ok: false, reason: "no_business_address" };
  if (i.parent && !i.parent.subject?.trim()) return { ok: false, reason: "no_subject" };
  // Never a mailbox's signature: the owner's own mail app adds theirs.
  const email = coldEmailOf({
    filled: words,
    before: i.parent?.subject ?? null,
    written: i.words.body,
    source: i.lead.source,
    business,
    address,
    signsWith: i.signsWith,
    signedBy: i.workspace.yourName,
    signature: null,
    unsubscribeUrl: null,
  });
  return { ok: true, subject: email.subject, body: email.body, text: emailTextOf(email) };
}

export function reachOutRequest(
  i: RequestInput,
):
  | { ok: true; request: EmailRequest; subject: string; body: string; signature: string | null }
  | { ok: false; reason: RequestRefusal } {
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
  // Laid out as every cold email is (contracts coldEmailOf, which the owner's draft and Send me a test take too): its name
  // under the words, or the mailbox's signature where the sequence chose it, less its link lines in a first email and the
  // address the foot says; the foot says where the finder found the lead (its source, 00430).
  const email = coldEmailOf({
    filled: words,
    before: i.parent?.subject ?? null,
    written: i.words.body,
    source: i.lead.source,
    business,
    address,
    signsWith: i.signsWith,
    signedBy: i.workspace.yourName,
    signature: mailboxSignatureOf(i.from)?.text ?? null,
    unsubscribeUrl: url,
  });
  let request: EmailRequest;
  try {
    request = buildEmailRequest({
      identity: connectedIdentity(i.from),
      to: i.to,
      parent: i.parent,
      ...(words.subject !== null ? { subject: email.subject } : {}),
      body: email.body,
      signature: email.signature,
      // The owner's words, from the owner's own mailbox: one person's email, so it is marked as nothing else.
      actor: "human",
      plain: true,
      autoSubmitted: false,
      campaign: { unsubscribeUrl: url, footer: email.footer },
      messageId: i.messageId,
      tenantId: i.tenantId,
    });
  } catch {
    // Words no email may carry (a first email whose subject poses as a reply): the step's to fix, never this send's.
    return { ok: false, reason: "words_unsendable" };
  }
  return { ok: true, request, subject: request.subject, body: email.body, signature: email.signature };
}
