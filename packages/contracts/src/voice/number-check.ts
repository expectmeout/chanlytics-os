/**
 * Whether the caller's carrier vouched for the number a call shows (STIR/SHAKEN), as far as the call's own headers say
 * (decision 0137). A carrier that signs a call says the caller may use the number; the carrier that hands the call on
 * checks the signature and says what it found, in one of two places a trunk passes along: a header of its own
 * (Twilio's `X-Twilio-VerStat`), or a `verstat` parameter on the number in P-Asserted-Identity (RFC 8224's word, as
 * other carriers write it). Retell's inbound-call webhook hands over the `X-` headers and P-Asserted-Identity
 * (`custom_sip_headers`, lowercase keys), so this reads those two and nothing else.
 *
 * Three answers and no guess: the check passed, it failed (the signature did not verify: the number shown is one the
 * caller's carrier did not vouch for), or the call was never signed. A header that is absent, or says a word this does
 * not know, is null: nothing is known, and nothing is decided on it. Pure.
 */
import { isOneOf } from "../shared/unknown";

export const NUMBER_CHECKS = ["passed", "failed", "unsigned"] as const;
export type NumberCheck = (typeof NUMBER_CHECKS)[number];

/** The carriers' three words (ATIS-1000074; Twilio writes the attestation's letter after the first two), matched whole. */
const CHECK_WORDS: readonly (readonly [RegExp, NumberCheck])[] = [
  [/^tn-validation-passed(?:-[abc])?$/i, "passed"],
  [/^tn-validation-failed(?:-[abc])?$/i, "failed"],
  [/^no-tn-validation$/i, "unsigned"],
];

/** One of the carriers' words as a check, or null for any other. */
function checkOfWord(word: string): NumberCheck | null {
  const trimmed = word.trim();
  return CHECK_WORDS.find(([pattern]) => pattern.test(trimmed))?.[1] ?? null;
}

/** What a call's headers say of its number, or null where they say nothing this knows. */
export function numberCheckOf(headers: Record<string, unknown> | null | undefined): NumberCheck | null {
  if (!headers || typeof headers !== "object") return null;
  const own = headers["x-twilio-verstat"];
  const fromOwn = typeof own === "string" ? checkOfWord(own) : null;
  if (fromOwn) return fromOwn;
  const asserted = headers["p-asserted-identity"];
  const named = typeof asserted === "string" ? /[;?&]verstat=([a-z-]+)/i.exec(asserted) : null;
  return named?.[1] ? checkOfWord(named[1]) : null;
}

/** A check as a call's metadata carried it back from the inbound door, or null for anything else. */
export const numberCheckFrom = (kept: unknown): NumberCheck | null => (isOneOf(NUMBER_CHECKS, kept) ? kept : null);
