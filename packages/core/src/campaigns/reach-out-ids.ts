/**
 * Reach out's identities (Part 3), derived from what they are (uuid-v5.ts), so a retry meets its own row: a step's run
 * is its step and its day; a send is its run and its lead; the email an attempt writes is its send and its number (E4).
 * A deferred send's next attempt is a new row under a new Resend idempotency key, which a key's 24 hours at Resend would
 * otherwise answer with the first one's reply. A broadcast's email to one person is named the same way, by the person's
 * attempt (`broadcastEmailId`).
 */
import { uuidV5 } from "../uuid-v5";

export const reachOutRunIdFor = (stepId: string, runFor: string): Promise<string> =>
  uuidV5(`reach_out_run:${stepId}:${runFor}`);
export const sendIdFor = (runId: string, leadId: string): Promise<string> =>
  uuidV5(`reach_out_send:${runId}:${leadId}`);
export const sendMessageId = (sendId: string, attempt: number): Promise<string> =>
  uuidV5(`reach_out_email:${sendId}:${attempt}`);
/** The team's step a hand step makes for a lead (Part 5, G20): once per step and lead, whichever day's run reaches it. */
export const handStepIdFor = (stepId: string, leadId: string): Promise<string> =>
  uuidV5(`reach_out_hand:${stepId}:${leadId}`);

/**
 * The id of a broadcast's email to one person: the run, the person, and how many times they were claimed and given back
 * (`attempt`, read with the queued people, which the database's guard adds one to on every release: 00301), as a reach-out
 * send is named by its attempt (`sendMessageId`). A person released, because the provider did not take their email and its
 * row was withdrawn, is tried again under a NEW id however the run's own counters stand: a clean batch starts its waits at
 * nothing, and a person given back at the first wait would otherwise come back under the id of their own canceled row, find
 * it, and be skipped as send_failed having never been sent. A run resumed after a kill releases nobody, so it keeps the id
 * and meets the row it was sending.
 *
 * A database that has not reached 00301 has no attempt to read (undefined). The id is then named as it was, by the waits
 * and stalls the run carried, for as long as that read lasts: code that ships before its migration keeps its runs going.
 */
export const broadcastEmailId = (i: {
  broadcastId: string;
  contactId: string;
  attempt: number | undefined;
  waits: number;
  stalls: number;
}): Promise<string> => {
  const who = `broadcast_email:${i.broadcastId}:${i.contactId}`;
  return uuidV5(i.attempt === undefined ? `${who}:${i.waits}:${i.stalls}` : `${who}:attempt:${i.attempt}`);
};
