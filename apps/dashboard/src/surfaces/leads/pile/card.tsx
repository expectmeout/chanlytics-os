/**
 * What a lead's card knows (the lead workbench, canvas B v2's decide card), for the lead sheet that draws it
 * (sheet/sheet.tsx) and the pile's Add them all: the reason to write now and the marks it rests on, and the emails they
 * would get from a sequence, filled with their values by the send's own fill. `leadCardFor` reads the lead's peek view
 * model and its record from the page's surface once a draw; every rule and word is contracts' (lead-card.ts).
 */
import {
  leadCardEmailOf,
  leadCardMarksOf,
  leadCardReasonOf,
  leadCardSlotsOf,
  leadCardStepsOf,
  type LeadCardCheck,
  type LeadCardEmailVM,
  type LeadCardLead,
  type LeadCardMarkVM,
  type LeadCardReasonVM,
  type LeadCardSlotVM,
  type LeadCardStepVM,
  type LeadPeekVM,
  type LeadRowVM,
  type ReachOutChainDto,
} from "@chanlytics/contracts";
import { tplOwn } from "../../campaigns/templates/words";
import { leadDtoFor, peekVMFor } from "../surface";

/** What the card draws for the lead that is up, and what its tabs read. */
export interface LeadCardFacts {
  peek: LeadPeekVM | null;
  reason: LeadCardReasonVM | null;
  marks: LeadCardMarkVM[];
  /** Email 1 of the sequence the adds go to; null on a first pile (none yet) or before the lead's record is in. */
  email: LeadCardEmailVM | null;
  steps: LeadCardStepVM[];
  /** What fills their words, each with where it came from: the Emails tab's list. */
  slots: LeadCardSlotVM[];
  /** The adds go to a list of the pile's own, written to at the end: its email is written then. */
  firstPile: boolean;
}

/** The workspace's slots, as Templates holds them. */
export const leadCardWorkspace = () => {
  const own = tplOwn();
  return { businessName: own.business_name, bookingLink: own.booking_link };
};

/** What the card knows of a lead for its emails: its record's slots, its address, and the other ways to them. */
export function leadCardLeadOf(leadId: string): LeadCardLead | null {
  const peek = peekVMFor(leadId);
  const dto = leadDtoFor(leadId);
  if (!dto) return null;
  return {
    business_name: dto.business_name,
    city: dto.city,
    kind: dto.kind ?? null,
    facts: dto.facts ?? null,
    to: peek ? peek.reach.email.address : dto.email,
    emailState: dto.email_state,
    canCall: !!(peek && peek.reach.phone && peek.reach.phone.tel),
    canChoose: !!(peek && peek.company && peek.company.people.length > 1),
  };
}

/**
 * The card's facts for the lead on screen, by its id, whether or not its row is in the table as filtered: its peek view
 * model and record (surface.ts), the target's emails, and the add door's answer for it (use-aim.ts checkOf: absent until
 * it has answered).
 */
export function leadCardFor(
  leadId: string,
  chain: ReachOutChainDto | null,
  tz: string,
  check: LeadCardCheck | undefined,
): LeadCardFacts {
  const peek = peekVMFor(leadId);
  const lead = leadCardLeadOf(leadId);
  const workspace = leadCardWorkspace();
  return {
    peek,
    reason: peek ? leadCardReasonOf(peek) : null,
    marks: peek ? leadCardMarksOf(peek) : [],
    email: chain && lead ? leadCardEmailOf({ chain, lead, workspace, nowMs: Date.now(), tz, check }) : null,
    steps: chain && lead ? leadCardStepsOf({ chain, lead, workspace }) : [],
    slots: chain && lead ? leadCardSlotsOf({ chain, lead, workspace }) : [],
    firstPile: !chain,
  };
}

/** The bulk Add's leads (contracts leadCardBulkOf): each open lead as the card knows it, with the door's answer. */
export const leadCardBulkLeadsOf = (rows: readonly LeadRowVM[], checkOf: (id: string) => LeadCardCheck | undefined) =>
  rows.flatMap((r) => {
    const lead = leadCardLeadOf(r.id);
    return lead ? [{ id: r.id, lead, check: checkOf(r.id) }] : [];
  });
