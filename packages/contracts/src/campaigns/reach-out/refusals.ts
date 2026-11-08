/**
 * What How it reaches out's boxes refuse (decision 0113), and the words each refusal says under its box. Alone, since
 * the business's one save holds every fold's checks and rides into Settings' and the first run's first load: it carries
 * these, and neither the writers' readers (section.ts) nor the page's words (settings.ts).
 */
import { REACH_OUT_LIMITS } from "../../config/workspace-config/config-rules";
import { phoneAsWritten } from "../../shared/phone";
import { linksIn } from "./words/limits";

export type SignatureProblem = "too_long" | "too_many_lines" | "link";

/** What is wrong with a signature: longer than its limit, past its lines, or a link (the foot's link is code's). */
export function reachOutSignatureProblem(text: string): SignatureProblem | null {
  const t = text.trim();
  if (!t) return null;
  if (t.length > REACH_OUT_LIMITS.signature) return "too_long";
  if (t.split(/\r\n|\r|\n/).length > REACH_OUT_LIMITS.signatureLines) return "too_many_lines";
  return linksIn(t).length > 0 ? "link" : null;
}

export type PhoneProblem = "not_a_phone";

/** What is wrong with the signature's phone: words that are no number someone can dial (shared/phone.ts phoneAsWritten). */
export function reachOutPhoneProblem(text: string): PhoneProblem | null {
  const t = text.trim();
  return !t || phoneAsWritten(t) ? null : "not_a_phone";
}

/** The refusal a row says under its box, by the limit it went past. */
export const REACH_OUT_REFUSAL_WORDS = {
  tooLong: (max: number) => `Keep it under ${max} characters.`,
  claims: `Up to ${REACH_OUT_LIMITS.claims} claims.`,
  signature: `${REACH_OUT_LIMITS.signatureLines} lines at most, and no link.`,
  phone: "A phone number, as people write one: its digits, with spaces, dashes or brackets.",
} as const;
