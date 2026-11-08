/**
 * How it reaches out's rows as Ask may change them (decision 0113): a change a card proposes and the owner approves,
 * applied to a parsed config's reach_out section as the page's own folds write it (business/fold-shapes.ts): trimmed,
 * an emptied value its key removed, the section gone once nothing is in it, and the booking link, what an answer
 * offered before the page, stored as nothing. Ask's change schema is ask/schemas.ts's, its one door settings-change.ts.
 */
import { REACH_OUT_LIMITS, type ReplyOffer } from "./config-rules";

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

type Section = Record<string, unknown> & { proof?: unknown };

const claimsOf = (section: Section): string[] =>
  Array.isArray(section.proof) ? section.proof.filter((c): c is string => typeof c === "string") : [];

/** The section with one change written into it, as the page's fold writes the same row. */
function sectionWith(section: Section, change: AskReachOutChange): Section {
  const next: Section = { ...section };
  const put = (key: string, value: string | string[] | undefined) => {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
  };
  switch (change.op) {
    case "set_offer":
      put("offer", change.offer.trim());
      break;
    case "set_who_for":
      put("who_for", change.who_for.trim());
      break;
    case "set_fixes":
      put("fixes", change.fixes.trim());
      break;
    case "add_claim": {
      const claims = claimsOf(section);
      const claim = change.claim.trim();
      put("proof", claims.includes(claim) ? claims : [...claims, claim].slice(0, REACH_OUT_LIMITS.claims));
      break;
    }
    case "remove_claim":
      put(
        "proof",
        claimsOf(section).filter((c) => c !== change.claim.trim()),
      );
      break;
    case "set_cold_tone":
      put("tone", change.tone.trim());
      break;
    case "set_signed_by":
      put("signed_by", change.name.trim());
      break;
    case "set_signature":
      put("signature", change.signature.trim());
      break;
    case "set_reply_offer":
      put("reply_offer", change.offer === "booking_link" ? undefined : change.offer);
      break;
  }
  return next;
}

/** A config with the change applied to its reach_out section. */
export function applyReachOutChange<C extends Record<string, unknown>>(config: C, change: AskReachOutChange): C {
  const raw = config.reach_out;
  const section: Section = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  const next = sectionWith(section, change);
  // A section with nothing in it is no section: undefined, which a save leaves out.
  return Object.keys(next).length ? { ...config, reach_out: next } : { ...config, reach_out: undefined };
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
