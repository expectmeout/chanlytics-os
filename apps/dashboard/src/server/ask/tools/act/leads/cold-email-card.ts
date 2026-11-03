/**
 * What a cold email's card says (propose_sequence's action cold_email, act/sequence.ts proposeColdEmail), from one set of
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

/** Handed to the owner: the summary's phrase and the sheet's hold say it in the one set of words. */
const HANDED_TO_YOU = "handed to you to send from your own inbox";
const FROM_MAILBOXES = "your connected mailboxes";
/** How its first run goes, whichever sends: planned at Approve, and held for the owner's say. */
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
  owner_sends: boolean;
}

/** A cold email's card: its summary and its sheet, from the same pieces. */
export function coldEmailCard(p: ColdEmailSaid): { summary: string; sheet: AskCardSheet } {
  const sends = p.owner_sends ? `each email ${HANDED_TO_YOU}` : `from ${FROM_MAILBOXES}`;
  const pace = `one every ${p.gap_minutes} minutes`;
  const emails = [`first: ${p.first}`, ...p.then].join("; ");
  const rows = [
    { label: "To", value: p.to },
    { label: "First email", value: p.first },
    { label: "Then", value: p.then.join("; ") },
    { label: "Pace", value: pace },
    // Who sends, where it is not the hold: the owner's hand is said once, as what holds every send.
    { label: "From", value: p.owner_sends ? "" : FROM_MAILBOXES },
    { label: "Sends", value: FIRST_RUN_WAITS, aside: true },
  ]
    .map((r) => ({ ...r, value: sheetWords(r.value) }))
    .filter((r) => r.value);
  return {
    summary: `To ${p.to}, ${sends}, ${pace}: ${emails}. ${FIRST_RUN_WAITS}`,
    sheet: { holds: p.owner_sends ? [sheetWords(`each email is ${HANDED_TO_YOU}.`)] : [], rows },
  };
}
