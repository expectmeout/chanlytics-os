/**
 * Reach out's rules that more than one place asks (Part 3), each said once.
 *
 *   outreachRefusalOf   the lead's own facts, as the send door reads them (deliver.ts) and as the clock reads them
 *                       before it claims a send: one mapping, so the two never disagree about who may be written to.
 *   OUTREACH_WAIT_REFUSALS   the door's refusals that mean "not now": the send is planned again, never canceled (C5).
 *   reachOutSlots       a step's words with the lead's, the workspace's and the send's values in (§4.3's six slots); a
 *                       slot with no value holds the email (missing_value, the reason that exists: broadcast.ts).
 *   REACH_OUT_MONTH_EMAILS   the month's allowance per workspace (§4.8's number; the price is Ruben's to set).
 *   REACH_OUT_CHECKS_PER_DAY the check's daily ceiling per workspace (Part 4, R12).
 */
import type { DeliveryRefusal } from "../consent/consent";
import { isReachOutSlot, replaceSlots, slotsNamed, type ReachOutSlot } from "./reach-out-words";

export interface OutreachLeadFacts {
  leadStage: string | null;
  suppressed: boolean;
  wroteBack: boolean;
  /** An automatic out-of-office whose day is still ahead (00223, G8): the chain waits for it. */
  away: boolean;
}

export function outreachRefusalOf(f: OutreachLeadFacts): DeliveryRefusal | null {
  if (!f.leadStage) return "outreach_not_a_lead";
  // Only a business still being written to: a lead that said no, became a customer or was set aside is not.
  if (f.leadStage !== "ready" && f.leadStage !== "nurture") return "outreach_lead_closed";
  if (f.suppressed) return "outreach_suppressed";
  // Every cold email's foot promises "reply 'no thanks' and I won't write again", and a reply asking to stop, in any
  // words, is an opt-out the law says to honour. Nothing reads a reply to tell a no from a yes, so the promise is
  // kept the plain way: a person who wrote back, or phoned, is in a conversation, answered from the Inbox, and a
  // reach-out's next email (a nudge, a later run) is never sent to them. An out-of-office is not a person writing;
  // mail with a list's headers is, since a helpdesk sends a person's no with them too (00181).
  if (f.wroteBack) return "outreach_wrote_back";
  // An automatic out-of-office (00223): the send is skipped, and the step takes the lead back after the day it names.
  if (f.away) return "outreach_away";
  return null;
}

/**
 * A wait, never an end: the domain's day is full or the domain is not ready, the domain was removed (another sends
 * it), or the workspace is paused (billing). None is a fact about the lead, so none may end what its owner approved.
 */
export const OUTREACH_WAIT_REFUSALS = [
  "sending_domain_at_cap",
  "sending_domain_not_ready",
  "outreach_needs_own_domain",
  "paused",
] as const satisfies readonly DeliveryRefusal[];
export function isWaitRefusal(reason: string | null | undefined): boolean {
  return (OUTREACH_WAIT_REFUSALS as readonly string[]).includes(reason ?? "");
}

export const REACH_OUT_MONTH_EMAILS = 2000;

/**
 * The most attempts of the check before each send that one workspace may spend on the model in a UTC day (R12):
 * counted in reach_out_check_spend (00197) as each attempt is taken, a rewrite in it and a failure counted, so neither a
 * run's size nor a reset of a send's check lets it spend more.
 */
export const REACH_OUT_CHECKS_PER_DAY = 400;

/**
 * Whether a broadcasts row is a reach-out step's run (its audience says so, runReachOut): its sends are reach_out_sends
 * that the reach-out clock claims, never broadcast_recipients that a broadcast_send job sends. Approving one releases
 * it without that job, and the job leaves one alone.
 */
export function isReachOutRun(audience: unknown): boolean {
  return !!audience && typeof audience === "object" && (audience as { kind?: unknown }).kind === "reach_out";
}

export interface SlotLead {
  business_name: string | null;
  city: string | null;
}
/** The workspace's slots: its name, the name the chain signs with, its booking link. */
export interface SlotWorkspace {
  businessName: string | null;
  yourName?: string | null;
  bookingLink?: string | null;
}
export function reachOutSlots(
  words: string,
  lead: SlotLead,
  workspace: SlotWorkspace,
  opening: string | null = null,
): { ok: true; text: string } | { ok: false; reason: "missing_value" } {
  const values: Record<ReachOutSlot, string | null> = {
    business: lead.business_name?.trim() || null,
    city: lead.city?.trim() || null,
    "your business": workspace.businessName?.trim() || null,
    "your name": workspace.yourName?.trim() || null,
    "booking link": workspace.bookingLink?.trim() || null,
    opening: opening?.trim() || null,
  };
  // Any {{…}} is a slot, named in any case and spacing (reach-out-words: the one slot rule, the sheet's too). One this
  // does not fill, whether it has no value here or is no slot at all ({{first name}}, {{business_name}}), holds the
  // email, and so does a brace left once the slots are out: braces never reach a business.
  const named = slotsNamed(words);
  const missing = named.stray || named.names.some((k) => !isReachOutSlot(k) || values[k] === null);
  const text = replaceSlots(words, (k) => (isReachOutSlot(k) ? values[k] : null));
  return missing ? { ok: false, reason: "missing_value" } : { ok: true, text };
}
