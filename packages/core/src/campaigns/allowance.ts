/**
 * The month's allowance, at enrolment (One message, every channel, step 3; contracts reach-for.ts). Chanlytics pays for the
 * emails and texts a workspace's campaigns send, so it meters them (CAMPAIGN_MONTH_ALLOWANCE). The send holds a person
 * past the month's room at the wire (messages/broadcast-channels.ts overAllowance), which is the backstop; this reads the
 * month BEFORE anyone is enrolled and names who is already past it, so the run's own page says so up front instead of
 * each person failing at send time.
 *
 * Held on their channel, never moved to another; a visit reminder and the after-visit check are never held
 * (contracts heldByAllowance: a booking moment's message about a visit, not an offer a booking moment sends), and a send
 * that goes by WhatsApp alone never asks.
 */
import {
  heldByAllowance,
  pastAllowance,
  type ConsentChannel,
  type MonthSent,
  type SendPurpose,
} from "@chanlytics/contracts";

/** The reason a person held at enrolment carries on their row: the one the send's own check gives (contracts HELD_REASONS). */
export const MONTH_ALLOWANCE_REASON = "month_allowance";

/**
 * What a run's record (a playbook's event, a broadcast's decision) says of the month's allowance, when it held anybody at
 * enrolment: how many the allowance holds (`held`, as many as its enrolment counted) and how many of those whose hold
 * could not be written (`unheld`: queued, and held at the wire all the same, the backstop). Nothing when it held nobody.
 * One spelling for the playbook's run and the person's broadcast alike.
 */
export function allowanceRecord(held: number, unheld: number): Record<string, number> {
  return {
    ...(held > 0 ? { held_for_allowance: held } : {}),
    ...(unheld > 0 ? { hold_unwritten: unheld } : {}),
  };
}

/**
 * Which of a run's people are past the month's room, in the order given. The month's count is read for a channel only
 * when somebody goes by it, and not at all for a send the allowance never holds, so a WhatsApp run, a visit run and a
 * run with nobody on email or text cost no read. A read that fails throws: a count that could not be made is not room.
 */
export async function pastTheMonth<T extends { channel: ConsentChannel }>(
  ports: { monthSent(channel: keyof MonthSent): Promise<number> },
  people: readonly T[],
  trigger: string | null,
  purpose: SendPurpose,
): Promise<T[]> {
  if (!heldByAllowance(trigger, purpose)) return [];
  const sent: MonthSent = { email: 0, sms: 0 };
  for (const channel of ["email", "sms"] as const) {
    if (people.some((p) => p.channel === channel)) sent[channel] = await ports.monthSent(channel);
  }
  return pastAllowance(people, sent, trigger, purpose);
}
