/** Words: limits. */

import { REACH_OUT_LIMITS } from "../../../config/workspace-config/config-rules";
import { posesAsReply } from "../../../email/subject";
import { webAddressesIn } from "../../../shared/link";
import { emailIssues } from "../../templates/message-versions/email-rules";
import type { EmailIssue, EmailProblem, EmailRules } from "../../templates/message-versions/email-rules";
import { slotCountIn, slotFault, slotMentions, slotsOut } from "../../templates/slot-sets";
import { REACH_OUT_BODY_MAX, REACH_OUT_SLOT_SET, REACH_OUT_SUBJECT_MAX, type ReachOutSlot } from "./slots";

/** The whole email as a business reads it, the opening counted at its most (§4.4). */
export const REACH_OUT_WORDS_MAX = 120;

/** Ask's own words for a step to leads, shorter than the owner may write (drafts/sequence.ts LEAD_RULES): the first. */
export const ASK_FIRST_WORDS_MAX = 80;

/** Ask's own words for a later step, which answers in the same thread. */
export const ASK_LATER_WORDS_MAX = 50;

export const OPENING_WORDS_MAX = 40;

/** An opening's length in characters, as a send stores it (00197 reach_out_sends.opening): forty words fit well within. */
export const OPENING_CHARS_MAX = 400;

export const ANGLE_WORDS_MAX = 3;

export const REACH_OUT_STEPS_MAX = 5;

/** The most mailboxes a chain names (as many as a workspace connects); none named is every connected one. */
export const REACH_OUT_MAILBOXES_MAX = 10;

export const REACH_OUT_NAME_MAX = 80;

/** The name a cold email signs with, at most this long: Cold email's Signs as holds the same (decision 0113). */
export const SIGNED_BY_MAX = REACH_OUT_LIMITS.signedBy;

/** The gap's choices on the sheet, in minutes; the database holds 5–120 (00183). */
export const REACH_OUT_GAP_MINUTES = [5, 8, 12, 20, 30, 60] as const;

/** A step after the first waits this long after the one before (00183 holds 2–30); a new one starts at four. */
export const REACH_OUT_AFTER_DAYS = { min: 2, max: 30, first: 4 } as const;

/** How many times the words name one slot. */
export function slotCount(text: string, slot: ReachOutSlot): number {
  return slotCountIn(REACH_OUT_SLOT_SET, text, slot);
}

/**
 * Whether a step's words are written wrongly for the slots: a {{…}} that is none of them, or a brace with no pair. The save
 * refuses such words (validateReachOutWords), and the sender holds a send whose words were saved before the rule.
 */
export function reachOutSlotFault(text: string): boolean {
  return slotFault(REACH_OUT_SLOT_SET, text);
}

/**
 * Whether a step's words name {{opening}}, in its subject or its body: the one rule for "this email needs an opening
 * written for it", asked by the check (which writes one) and by the sender (which sends none without it).
 */
export function wordsNeedOpening(input: { subject: string | null; body: string }): boolean {
  return slotCount(`${input.subject ?? ""}\n${input.body}`, "opening") > 0;
}

/** Words as a reader counts them: a mark standing alone (a dash, the comma a slot left behind) is no word. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** The words a business reads, counted as a reader counts them: a slot is one word, the opening its most. */
export function emailWordCount(text: string): number {
  const slots = slotMentions(REACH_OUT_SLOT_SET, text).reduce(
    (n, m) => n + (m.key === "opening" ? OPENING_WORDS_MAX : 1),
    0,
  );
  return slots + wordCount(slotsOut(REACH_OUT_SLOT_SET, text));
}

/**
 * The web addresses a reader sees in the words, their slots taken out (shared/link.ts webAddressesIn). The one link rule:
 * the words' "one link at most" and the opening's "no link" both ask it.
 */
export function linksIn(text: string): string[] {
  return webAddressesIn(slotsOut(REACH_OUT_SLOT_SET, text));
}

/** The links a business sees: each one written out, each {{booking link}} and each {{their preview}}. */
export function linkCount(text: string): number {
  return linksIn(text).length + slotCount(text, "booking link") + slotCount(text, "their preview");
}

/**
 * Words in capitals: a line, or lines one under another, of eight letters or more and none of them lower case.
 * "FREE / TRIAL / TODAY" on three lines shouts as one.
 */
export function shoutingLine(text: string): boolean {
  let run = 0;
  for (const line of slotsOut(REACH_OUT_SLOT_SET, text).split(/\r\n|\r|\n/)) {
    const letters = line.replace(/[^\p{L}]/gu, "");
    const capitals = letters !== "" && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
    run = capitals ? run + letters.length : 0;
    if (run >= 8) return true;
  }
  return false;
}

/** What a cold email asks of its words beyond what every email's are asked (a reach-out's own rules). */
type ColdProblem =
  | "subject_poses_as_reply"
  | "opening_in_subject"
  | "link_in_subject"
  | "opening_twice"
  | "too_many_words"
  | "too_many_links"
  | "shouting";

export type WordsProblem = EmailProblem | ColdProblem;

/** One thing wrong with a step's words: the shared email problems and the cold email's. */
export type WordsIssue = EmailIssue<ColdProblem>;

/** What a cold email's subject may not be: a reply it is not, the opening, a link, or a shout. */
function coldSubjectProblems(subject: string): ColdProblem[] {
  const out: ColdProblem[] = [];
  if (posesAsReply(subject)) out.push("subject_poses_as_reply");
  if (slotCount(subject, "opening") > 0) out.push("opening_in_subject");
  if (linkCount(subject) > 0) out.push("link_in_subject");
  if (shoutingLine(subject)) out.push("shouting");
  return out;
}

/** What a cold email's body may not be: the opening twice, over the hundred and twenty words, a second link, a shout. */
function coldBodyProblems(body: string): ColdProblem[] {
  const out: ColdProblem[] = [];
  if (slotCount(body, "opening") > 1) out.push("opening_twice");
  if (emailWordCount(body) > REACH_OUT_WORDS_MAX) out.push("too_many_words");
  if (linkCount(body) > 1) out.push("too_many_links");
  if (shoutingLine(body)) out.push("shouting");
  return out;
}

/**
 * What a reach-out step's email keeps to, as an email's rules (campaigns/templates/message-versions/email-rules.ts): its slots, a subject
 * up to 80 characters (the first step's: a step after it answers the one before, "Re:", D19, and has none) and a body
 * up to 1,200, then the cold email's own. The one check, the Templates editor and the sheet all read these.
 */
export function reachOutRules(first: boolean): EmailRules<ColdProblem> {
  return {
    slots: REACH_OUT_SLOT_SET,
    subject: first,
    subjectMax: REACH_OUT_SUBJECT_MAX,
    bodyMax: REACH_OUT_BODY_MAX,
    subjectAlso: coldSubjectProblems,
    bodyAlso: coldBodyProblems,
    say: wordsIssueWords,
    foot: REACH_OUT_FOOT_NOTE,
  };
}

/** What the sender adds under a cold email that a preview does not draw. */
const REACH_OUT_FOOT_NOTE =
  "The footer is added when it goes: why they are hearing from you, who you are and where, and how to say no.";

/**
 * One step's words, as the sheet saves them. The first step names its subject; a step after it answers the one before
 * ("Re:", D19), so its subject is never read. Every {{…}} is one of the slots, and the opening goes in the body once.
 * The whole email, the opening counted at its most, is under 120 words, with one link at most and no line in capitals.
 */
export function validateReachOutWords(input: { subject: string | null; body: string }, first: boolean): WordsIssue[] {
  return emailIssues({ subject: (input.subject ?? "").trim(), body: input.body.trim() }, reachOutRules(first));
}

export function wordsIssueWords(wordsIssue: WordsIssue): string {
  switch (wordsIssue.problem) {
    case "subject_missing":
      return "Give your email a subject.";
    case "subject_too_long":
      return `Keep the subject under ${REACH_OUT_SUBJECT_MAX} characters.`;
    case "subject_poses_as_reply":
      return "A first email can't start with Re: or Fwd:.";
    case "opening_in_subject":
      return "The opening goes in the email, not the subject.";
    case "link_in_subject":
      return "Keep links out of the subject.";
    case "body_missing":
      return "Write what you'd say.";
    case "body_too_long":
      return `Keep it under ${REACH_OUT_BODY_MAX.toLocaleString("en-US")} characters.`;
    case "unknown_slot":
      return `{{${wordsIssue.slot ?? ""}}} isn't one of the slots. Use one from the list.`;
    case "stray_brace":
      return "Braces are for slots only, two on each side: {{business}}.";
    case "opening_twice":
      return "The opening goes in once.";
    case "too_many_words":
      return `Keep it under ${REACH_OUT_WORDS_MAX} words, counting the opening as ${OPENING_WORDS_MAX}.`;
    case "too_many_links":
      return "One link at most. A second reads like a pitch.";
    case "shouting":
      return "A line in capitals reads like spam.";
  }
}
