/**
 * How it reaches out's rows as Ask may change them (decision 0113): a change a card proposes and the owner approves,
 * applied to a parsed config's reach_out section by the one writer of a key of it (writeReachOutKey), which the page's own
 * folds write through too. Ask's change schema is ask/schemas.ts's, its one door settings-change.ts.
 */
import { listOrEmpty, recordOrEmpty } from "../../shared/unknown";
import type { ReplyOffer } from "./config-rules";
import type { ReachOutConfig } from "./reach-out-schema";

export type AskReachOutChange =
  | { op: "set_offer"; offer: string }
  | { op: "set_who_for"; who_for: string }
  | { op: "set_fixes"; fixes: string }
  | { op: "add_claim"; claim: string }
  | { op: "remove_claim"; claim: string }
  | { op: "set_cold_tone"; tone: string }
  | { op: "set_signed_by"; name: string }
  | { op: "set_signature"; signature: string }
  | { op: "set_reply_offer"; offer: ReplyOffer };

/** Each op, with the row of How it reaches out its card opens (admin/outreach/<row>). */
export const ASK_REACH_OUT_ROWS: Readonly<Record<AskReachOutChange["op"], string>> = {
  set_offer: "offer",
  set_who_for: "who_for",
  set_fixes: "fixes",
  add_claim: "proof",
  remove_claim: "proof",
  set_cold_tone: "cold_tone",
  set_signed_by: "signed_by",
  set_signature: "signature",
  set_reply_offer: "reply_offer",
};

export const isReachOutChange = (change: { op: string }): change is AskReachOutChange =>
  Object.hasOwn(ASK_REACH_OUT_ROWS, change.op);

/**
 * One key of the section written, the one way it is written, by the page's folds and Ask's cards alike: a text trimmed; a
 * list's entries trimmed, an empty one dropped; an emptied value takes its key away, and the section goes with its last
 * key; the booking link, what an answer offered before the page, is stored as nothing. In place, on the config it is
 * handed: the page's folds write on a copy of the stored one.
 */
export function writeReachOutKey(
  config: { reach_out?: unknown },
  key: keyof ReachOutConfig,
  value: string | readonly string[],
): void {
  const written = typeof value === "string" ? value.trim() : value.map((v) => v.trim()).filter(Boolean);
  const section = { ...recordOrEmpty(config.reach_out) };
  if (written.length === 0 || (key === "reply_offer" && written === "booking_link")) delete section[key];
  else section[key] = written;
  if (Object.keys(section).length) config.reach_out = section;
  else delete config.reach_out;
}

const claimsOf = (section: Record<string, unknown>): string[] =>
  listOrEmpty(section.proof).filter((c): c is string => typeof c === "string");

/** The key a change writes, and what it writes there. */
function writeOf(
  section: Record<string, unknown>,
  change: AskReachOutChange,
): [keyof ReachOutConfig, string | string[]] {
  switch (change.op) {
    case "set_offer":
      return ["offer", change.offer];
    case "set_who_for":
      return ["who_for", change.who_for];
    case "set_fixes":
      return ["fixes", change.fixes];
    case "add_claim": {
      const claims = claimsOf(section);
      const claim = change.claim.trim();
      // Past the limit it is the save's to refuse, in its words: dropped here, the card's receipt would say it was added.
      return ["proof", claims.includes(claim) ? claims : [...claims, claim]];
    }
    case "remove_claim":
      return ["proof", claimsOf(section).filter((c) => c !== change.claim.trim())];
    case "set_cold_tone":
      return ["tone", change.tone];
    case "set_signed_by":
      return ["signed_by", change.name];
    case "set_signature":
      return ["signature", change.signature];
    case "set_reply_offer":
      return ["reply_offer", change.offer];
  }
}

/** A config with the change applied to its reach_out section. */
export function applyReachOutChange<C extends Record<string, unknown>>(config: C, change: AskReachOutChange): C {
  const next = { ...config };
  const [key, value] = writeOf(recordOrEmpty(config.reach_out), change);
  writeReachOutKey(next, key, value);
  return next;
}

const quoted = (text: string) => `“${text.trim()}”`;
const REPLY_OFFER_SAID: Record<ReplyOffer, string> = {
  booking_link: "your booking link",
  call: "a call with you",
  answer: "the answer alone",
};

/** The card's one line. */
export function describeReachOutChange(change: AskReachOutChange): string {
  switch (change.op) {
    case "set_offer":
      return change.offer.trim() ? `What you offer: ${quoted(change.offer)}` : "What you offer, taken away";
    case "set_who_for":
      return change.who_for.trim() ? `Who it's for: ${quoted(change.who_for)}` : "Who it's for, taken away";
    case "set_fixes":
      return change.fixes.trim() ? `What you fix for them: ${quoted(change.fixes)}` : "What you fix, taken away";
    case "add_claim":
      return `A claim you stand behind: ${quoted(change.claim)}`;
    case "remove_claim":
      return `No longer a claim: ${quoted(change.claim)}`;
    case "set_cold_tone":
      return change.tone.trim()
        ? `Cold emails sound: ${quoted(change.tone)}`
        : "Cold emails sound as the receptionist does";
    case "set_signed_by":
      return change.name.trim()
        ? `Cold emails sign as ${change.name.trim()}`
        : "Cold emails sign as each sequence says";
    case "set_signature":
      return change.signature.trim() ? `Signature: ${quoted(change.signature)}` : "No signature";
    case "set_reply_offer":
      return `An answer to a lead offers ${REPLY_OFFER_SAID[change.offer]}`;
  }
}
