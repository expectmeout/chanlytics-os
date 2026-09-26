/**
 * Reach out's rules that more than one place asks (Part 3), each said once.
 *
 *   outreachRefusalOf   the lead's own facts, as the send door reads them (deliver.ts) and as the clock reads them
 *                       before it claims a send: one mapping, so the two never disagree about who may be written to.
 *   OUTREACH_WAIT_REFUSALS   the door's refusals that mean "not now": the send is planned again, never canceled (C5).
 *   reachOutSlots       a step's words with the lead's and the workspace's values in; a slot with no value holds the
 *                       email (missing_value, the reason that exists: broadcast.ts). Part 4 adds the rest of §4.3's.
 *   REACH_OUT_MONTH_EMAILS   the month's allowance per workspace (§4.8's number; the price is Ruben's to set).
 */
import type { DeliveryRefusal } from "./consent";

export interface OutreachLeadFacts {
  leadStage: string | null;
  suppressed: boolean;
  wroteBack: boolean;
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
  return null;
}

export const OUTREACH_WAIT_REFUSALS = [
  "sending_domain_at_cap",
  "sending_domain_not_ready",
] as const satisfies readonly DeliveryRefusal[];
export function isWaitRefusal(reason: string | null | undefined): boolean {
  return (OUTREACH_WAIT_REFUSALS as readonly string[]).includes(reason ?? "");
}

export const REACH_OUT_MONTH_EMAILS = 2000;

export interface SlotLead {
  business_name: string | null;
  city: string | null;
}
export function reachOutSlots(
  words: string,
  lead: SlotLead,
  workspace: { businessName: string | null },
): { ok: true; text: string } | { ok: false; reason: "missing_value" } {
  const values = new Map<string, string | null>([
    ["business", lead.business_name?.trim() || null],
    ["city", lead.city?.trim() || null],
    ["your business", workspace.businessName?.trim() || null],
  ]);
  // Any {{…}} is a slot, named in any case and spacing. One this does not fill, whether it has no value here or is no
  // slot at all ({{first name}}, {{business_name}}), holds the email: braces never reach a business.
  const SLOT = /\{\{([^{}]*)\}\}/g;
  // A brace pair left over once the slots are out ("{{business" with no end) is a slot nobody can fill.
  let missing = /\{\{|\}\}/.test(words.replace(SLOT, ""));
  const text = words.replace(SLOT, (whole, name: string) => {
    const v = values.get(name.trim().replace(/\s+/g, " ").toLowerCase());
    if (v == null) missing = true;
    return v ?? whole;
  });
  return missing ? { ok: false, reason: "missing_value" } : { ok: true, text };
}
