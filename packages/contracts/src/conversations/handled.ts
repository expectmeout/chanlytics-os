/**
 * What a customer's message became when the receptionist finished with it, stamped on the inbound row's meta as
 * `handled` (message_stamp_handled, 00305; the Reports lenses spec, K1). One meaning each, decided by core's one rule
 * (inbound/handled.ts handledOf) and held by the verb's executed test (inbound-executed.test.mjs): a message is a
 * `handoff` exactly when an escalation LANDED for it, and a write the database refused asked nobody.
 *
 *   ai       the receptionist answered it and nobody was asked: its reply left (the acknowledgement of a voice note
 *            and the holding message count), or its thread's one reply covers it (a newer message of the thread took
 *            the turn, 00284)
 *   held     its reply was written and waits (the veto window, the confidence floor), and nobody was asked
 *   handoff  a person was asked: an escalation was opened, changed or refreshed for it, whatever else went out beside
 *            it (a holding message, a confirmation that failed)
 *   blocked  nothing went out and nobody was asked: a rule set it aside (the person opted out, a person already holds
 *            the thread, a reaction or a system notice, a short code, a sender off the pilot allowlist, a send the
 *            wire refused), or the only thing that was to happen, an escalation, could not be written
 *
 * A message with no `handled` is unknown, not any of these: a row from before the stamp, an email (the receptionist
 * does not answer email), and a message the deadman sweep finished, whose outcome nobody recorded.
 */
export const HANDLED_OUTCOMES = ["ai", "held", "handoff", "blocked"] as const;
export type Handled = (typeof HANDLED_OUTCOMES)[number];
