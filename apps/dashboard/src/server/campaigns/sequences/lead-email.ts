/**
 * A lead's email as Ask wrote it in a draft, judged (split out of draft-judge.ts, which it would have taken past its
 * length): kept where it holds as every email must (contracts validateReachOutWords), a first one with no link, and no
 * number about the business that the owner's claims or its name do not back (decision 0113); else left for the owner to
 * write. With the two word helpers the judge's own clauses are made with.
 */
import "server-only";
import {
  NEW_WORDS,
  REACH_OUT_SUBJECT_MAX,
  linkCount,
  validateReachOutWords,
  violatesNoPrices,
  wordsIssueWords,
  type NewDraftAnswerStep,
  type NewEmail,
} from "@chanlytics/contracts";
import { unbackedNumbers } from "./numbers";

/** A reason said inside the judge's own sentence: its last stop taken off. */
export const clause = (reason: string): string => reason.trim().replace(/[.!]+$/, "");

/** Words as Ask wrote them, one line ending and no space around them. */
export const cleanWords = (text: string) => text.replace(/\r\n?/g, "\n").trim();

/** A subject kept over an email left to write: one past what a subject holds is the owner's to write too. */
export const subjectHeld = (subject: string | null): string | null =>
  subject && subject.length <= REACH_OUT_SUBJECT_MAX ? subject : null;

/** A lead's email as it was written: a later one answers in the first's thread, so it has no subject. */
export const emailWritten = (written: Pick<NewDraftAnswerStep, "subject" | "body">, first: boolean): NewEmail => ({
  subject: first ? cleanWords(written.subject) || null : null,
  body: cleanWords(written.body),
});

/** Why a lead's email does not hold, in a clause (the rule it breaks, in the words its sheet says it in); null where it holds. */
export function leadEmailRefusal(item: NewEmail, first: boolean, backing: readonly string[]): string | null {
  const reasons = NEW_WORDS.cannot.why;
  const issue = validateReachOutWords(item, first)[0];
  if (issue) return clause(wordsIssueWords(issue));
  if (violatesNoPrices(`${item.subject ?? ""} ${item.body}`)) return reasons.price;
  if (first && linkCount(item.body) > 0) return reasons.firstLink;
  if (unbackedNumbers(`${item.subject ?? ""}\n${item.body}`, backing).length > 0) return reasons.unbackedNumber;
  return null;
}

/**
 * A lead's email: kept where it holds as every email must, a first one with no link (the check says so), and no number
 * about the business that the owner's claims or its name do not back (decision 0113), else left for the owner to write.
 */
export function leadEmail(
  newDraftAnswerStep: Pick<NewDraftAnswerStep, "subject" | "body">,
  first: boolean,
  backing: readonly string[],
): NewEmail {
  const item = emailWritten(newDraftAnswerStep, first);
  return leadEmailRefusal(item, first, backing) === null ? item : { subject: first ? item.subject : null, body: "" };
}
