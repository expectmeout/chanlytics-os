/**
 * What a cold email's card says (propose_sequence's action cold_email, act/sequence/sequence.ts proposeColdEmail), from one set of
 * pieces: its summary, the words a turn stored before the sheet draws, Copy takes and the model reads; and its sheet
 * (contracts AskCardSheet, decision 0088), what holds it first, then a row a fact in the order an owner checks them. Who
 * sends is said once on the card. Its owner, each email handed to them to send from their own inbox (decision 0059),
 * holds every send on them: the sheet's one hold, said once over a group of such cards and left out of the answer beside
 * them (0088, item 5; on 3 November 2026 both real cold email turns said it again, beside a card that held it in its
 * summary alone). The workspace's connected mailboxes are a row. Its first run waits for an OK whichever sends, so that
 * row is aside (0088, item 6): no press turns on it. Beside the lead cards, since a cold email is the reach-out to leads.
 */
import "server-only";
import type { AskCardSheet } from "@chanlytics/contracts";
import { sheetWords } from "../playbook-card";

const FROM_MAILBOXES = "your connected mailboxes";
/** How its first run goes: planned at Approve, and held for the owner's say. */
const FIRST_RUN_WAITS = "Its first run is planned once approved, and waits for your say before an email goes.";

/** The pieces a cold email's card is made of, worded by its builder. */
interface ColdEmailSaid {
  /** Who it writes to: a search, quoted, or the leads an earlier step of the plan keeps. */
  to: string;
  /** The first email, its subject quoted. */
  first: string;
  /** Each email after it, with its wait: "after 4 days: a reply in the same thread". */
  then: readonly string[];
  gap_minutes: number;
}

/** A cold email's card: its summary and its sheet, from the same pieces. */
export function coldEmailCard(coldEmailSaid: ColdEmailSaid): { summary: string; sheet: AskCardSheet } {
  const sends = `from ${FROM_MAILBOXES}`;
  const pace = `one every ${coldEmailSaid.gap_minutes} minutes`;
  const emails = [`first: ${coldEmailSaid.first}`, ...coldEmailSaid.then].join("; ");
  const rows = [
    { label: "To", value: coldEmailSaid.to },
    { label: "First email", value: coldEmailSaid.first },
    { label: "Then", value: coldEmailSaid.then.join("; ") },
    { label: "Pace", value: pace },
    { label: "From", value: FROM_MAILBOXES },
    { label: "Sends", value: FIRST_RUN_WAITS, aside: true },
  ]
    .map((r) => ({ ...r, value: sheetWords(r.value) }))
    .filter((r) => r.value);
  return {
    summary: `To ${coldEmailSaid.to}, ${sends}, ${pace}: ${emails}. ${FIRST_RUN_WAITS}`,
    sheet: { holds: [], rows },
  };
}
