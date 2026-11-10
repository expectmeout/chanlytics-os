/**
 * What a cold email's card says (propose_sequence's action cold_email, act/sequence/sequence.ts proposeColdEmail), from one set of
 * pieces: its summary, the words a turn stored before the sheet draws, Copy takes and the model reads; and its sheet
 * (contracts AskCardSheet, decision 0088), what holds it first, then a row a fact in the order an owner checks them. Who
 * sends is said once on the card. The workspace's connected mailboxes are a row.
 *
 * Every email is on the card whole, subject and words (decision 0120): a press of a card that showed the words is their
 * OK, as it is for a customer's sequence (the answers canvas, D3), so the first run is planned at the press and goes as
 * Before each batch says, with no second yes for the same words. The row that says so is no aside: the press turns on it.
 * Beside the lead cards, since a cold email is the reach-out to leads.
 */
import "server-only";
import type { AskCardSheet } from "@chanlytics/contracts";
import { sheetWords } from "../playbook-card";

const FROM_MAILBOXES = "your connected mailboxes";
/** How its first run goes: the press is the OK of the words it shows, so the run goes as the sequence's batches do. */
const PRESS_IS_THE_OK =
  "Approving is your OK of these emails: the first run is planned at once and goes as “Before each batch” says.";

/** One email as the card shows it: where it falls, its subject (none for a reply in the same thread), and its words. */
interface ColdEmailShown {
  /** "After 4 days", for an email after the first; null for the first. */
  after: string | null;
  subject: string | null;
  body: string;
}

/** The pieces a cold email's card is made of, worded by its builder. */
interface ColdEmailSaid {
  /** Who it writes to: a search, quoted, or the leads an earlier step of the plan keeps. */
  to: string;
  /** Every email in order, whole. */
  emails: readonly ColdEmailShown[];
  gap_minutes: number;
}

/** An email in a line, as the summary says it: its subject quoted, or a reply in the first's thread. */
const inALine = (email: ColdEmailShown): string => {
  const says = email.subject ? `“${email.subject}”` : "a reply in the same thread";
  return email.after ? `${email.after}: ${says}` : `first: ${says}`;
};

/** An email whole, as its row shows it: its subject, then its words as they will be sent. */
const whole = (email: ColdEmailShown): string => {
  const head = email.subject ? `Subject: ${email.subject}` : "A reply in the same thread";
  return `${email.after ? `${email.after}. ` : ""}${head}\n\n${email.body.trim()}`;
};

/** A cold email's card: its summary and its sheet, from the same pieces. */
export function coldEmailCard(coldEmailSaid: ColdEmailSaid): { summary: string; sheet: AskCardSheet } {
  const sends = `from ${FROM_MAILBOXES}`;
  const pace = `one every ${coldEmailSaid.gap_minutes} minutes`;
  const rows = [
    { label: "To", value: coldEmailSaid.to },
    ...coldEmailSaid.emails.map((email, i) => ({
      label: i === 0 ? "First email" : `Email ${i + 1}`,
      value: whole(email),
    })),
    { label: "Pace", value: pace },
    { label: "From", value: FROM_MAILBOXES },
    { label: "Sends", value: PRESS_IS_THE_OK },
  ]
    .map((r) => ({ ...r, value: sheetWords(r.value) }))
    .filter((r) => r.value);
  return {
    summary: `To ${coldEmailSaid.to}, ${sends}, ${pace}: ${coldEmailSaid.emails.map(inALine).join("; ")}. ${PRESS_IS_THE_OK}`,
    sheet: { holds: [], rows },
  };
}
