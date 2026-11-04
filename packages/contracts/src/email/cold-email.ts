/**
 * A cold email as it leaves, once its words are filled (Reach out C9, D19; decisions 0056, 0077). The send (the edge's
 * reachOutRequest), the draft its owner sends (reachOutDraft) and Send me a test all lay it out here, and its text is
 * emailTextOf's, so none of them can tell a lead a different email (3 Nov 2026: a test laid out its own way read as
 * another email).
 */
import { emailFoot } from "../templates/email-foot";
import { whyFrom } from "../reach-out/reach-out";
import { REACH_OUT_LANGUAGE, coldEndingOf, coldSignedOff, type ReachOutSignsWith } from "../reach-out/reach-out-rules";
import { firstSubject, replySubject } from "./email-subject";

/** A cold email's parts as the wire takes them (channels buildEmailRequest), and emailTextOf lays out. */
export interface ColdEmail {
  subject: string;
  /** The words, with the name it signs with under them where it signs with its name. */
  body: string;
  /** The mailbox's signature, where the sequence signs with it and something of it is left to carry; else null. */
  signature: string | null;
  /** Why they hear from you, by how the finder found them; who and where; how to stop. */
  footer: string;
}

/**
 * Its subject is the first email's own, cut as the wire cuts it, or "Re:" the email before's once for a step after the
 * first; its ending is coldEndingOf's; its foot the cold one, in the language every reach-out email is filed in. Throws
 * where the foot lacks who or where (emailFoot): every caller says so first, as a refusal of its own.
 */
export function coldEmailOf(p: {
  /** The words with this lead's values in; a null subject answers the email before. */
  filled: { subject: string | null; body: string };
  /** The email before's subject, which a step after the first answers under; null for the first. */
  before: string | null;
  /** The step's own words as written: what its ending reads (their links, a sign-off that names the sender). */
  written: string;
  /** Where the finder found the lead (its source): the foot's first line. A lead with none was found on the map. */
  source: string | null | undefined;
  business: string;
  address: string;
  signsWith: ReachOutSignsWith;
  signedBy: string | null;
  /** The signature of the mailbox it leaves from; null where it has none, or where the owner's own mail app adds theirs. */
  signature: string | null;
  /** The send's one-click way out; null where the email says its way out in words alone. */
  unsubscribeUrl: string | null;
}): ColdEmail {
  const first = p.filled.subject !== null;
  const ending = coldEndingOf({
    signsWith: p.signsWith,
    signedBy: p.signedBy,
    signature: p.signature,
    first,
    body: p.written,
    address: p.address,
  });
  return {
    subject: first ? firstSubject(p.filled.subject ?? "") : replySubject(p.before),
    body: coldSignedOff(p.filled.body, ending.signOff),
    signature: ending.signature,
    footer: emailFoot(
      p.business,
      p.address,
      { kind: "cold", why: whyFrom(p.source ?? "local_businesses"), unsubscribeUrl: p.unsubscribeUrl },
      REACH_OUT_LANGUAGE,
    ),
  };
}
