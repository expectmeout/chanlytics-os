/**
 * Reach out's identities (Part 3), derived from what they are (uuid-v5.ts), so a retry meets its own row: a step's run
 * is its step and its day; a send is its run and its lead; the email an attempt writes is its send and its number (E4).
 * A deferred send's next attempt is a new row under a new Resend idempotency key, which a key's 24 hours at Resend would
 * otherwise answer with the first one's reply.
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
