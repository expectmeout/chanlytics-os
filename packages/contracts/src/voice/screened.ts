/**
 * A call that asked nobody, as the ledger keeps it (the event `call.screened`, decision 0138): one row for each call
 * the product turned away or let pass without a person, and why. Written where each rule acts, so Reports counts what
 * happened and nothing is derived twice:
 *
 *   - `refused`: a caller a member said is not a customer, turned away before the receptionist answered (the edge's
 *     voice/inbound-call.ts). The provider keeps no call for it, so this row is its only record;
 *   - the four of contracts' callBackNotOwed, each a call that would have asked for a call back and did not (the edge's
 *     voice/call-webhook.ts);
 *   - `selling`: a call back read as someone selling and set aside (core writeReplyDraft, the `reply_draft` job).
 *
 * A call the receptionist ended itself because the caller was selling leaves no row: nothing reads that call's kind.
 */
import type { CallBackNotOwed } from "./call-back-owed";

export const SCREENED_REASONS = [
  "refused",
  "not_a_customer",
  "carrier_spam",
  "unverified_silent",
  "toll_free_silent",
  "selling",
] as const satisfies readonly ("refused" | "selling" | CallBackNotOwed)[];
export type ScreenedReason = (typeof SCREENED_REASONS)[number];

/** How many calls were screened in a window, by why: what Reports' line is said from. */
export interface ScreenedCallsDto {
  total: number;
  by_reason: Partial<Record<ScreenedReason, number>>;
}
