/** How long a send with no word of its outcome stands before the clock calls it failed: a mailbox gives no receipt, so the mailboxes' clock looks within this. */
export const UNKNOWN_OUTCOME_MS = 24 * 3_600_000;
