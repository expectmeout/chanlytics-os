/**
 * Reach out's rules that more than one place asks (Part 3), each said once.
 *
 *   outreachRefusalOf   the lead's own facts, as the send door reads them (deliver.ts) and as the clock reads them
 *                       before it claims a send: one mapping, so the two never disagree about who may be written to.
 *   OUTREACH_WAIT_REFUSALS   the door's refusals that mean "not now": the send is planned again, never canceled (C5).
 *   reachOutEmailOf     a step's words with the lead's, the workspace's and the send's values in (§4.3's slots, and
 *                       00429's person slots from a company's addressee, each with its fallback), by
 *                       the one fill every email takes (templates/slot-sets.ts); a slot with no value holds the email
 *                       (missing_value, the reason that exists: broadcast.ts). The send, the sheet's preview and the
 *                       approval's first email read it.
 *   reachOutExampleValues  the same slots, made up for what changes from business to business: the Templates page's preview.
 *   REACH_OUT_MONTH_EMAILS   the month's allowance per workspace (§4.8's number; the price is Ruben's to set).
 *   REACH_OUT_CHECKS_PER_DAY the check's daily ceiling per workspace (Part 4, R12).
 */
import type { DeliveryRefusal } from "../consent/consent";
import { renderOwnVersion } from "../templates/message-versions";
import { slotHoles, slotValues } from "../templates/slot-sets";
import { LEAD_ROLE_WORDS, leadAddresseeOf } from "../leads/lead-kind";
import { REACH_OUT_SLOT_FALLBACKS, REACH_OUT_SLOT_SET } from "./reach-out-words";

export interface OutreachLeadFacts {
  leadStage: string | null;
  suppressed: boolean;
  wroteBack: boolean;
  /** An automatic out-of-office whose day is still ahead (00226, G8): the chain waits for it. */
  away: boolean;
  /** Its owner stopped writing to this lead (00241, Part 6's H10). Absent from an older read: not stopped. */
  stopped?: boolean;
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
  // An automatic out-of-office (00226): the send is skipped, and the step takes the lead back after the day it names.
  if (f.away) return "outreach_away";
  // Its owner pressed Stop writing to them (00241): the email is skipped, never waited on.
  if (f.stopped) return "outreach_stopped";
  return null;
}

/**
 * A wait, never an end: the mailbox's day is full or it is not sending (signed out, held, paused, resting), the mailbox
 * was removed (another of the chain's takes the lead), or the workspace is paused (billing). None is a fact about the
 * lead, so none may end what its owner approved.
 */
export const OUTREACH_WAIT_REFUSALS = [
  "sending_mailbox_at_cap",
  "sending_mailbox_not_ready",
  "outreach_needs_own_mailbox",
  "paused",
] as const satisfies readonly DeliveryRefusal[];
export function isWaitRefusal(reason: string | null | undefined): boolean {
  return (OUTREACH_WAIT_REFUSALS as readonly string[]).includes(reason ?? "");
}

export const REACH_OUT_MONTH_EMAILS = 2000;

/**
 * The most emails a reach-out its owner sends hands them in a day, across its steps (the 4 Oct spec's decision 8;
 * 00428): a morning's work. Its steps after the first are planned first, so a nudge is never crowded out by new leads.
 */
export const REACH_OUT_DRAFTS_PER_DAY = 30;

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

/**
 * The reach-out a moment's id opens: the chain whose root it is, or whose step it is (the wiring's second audit,
 * W-campaign-run-template-reachout-3). A reach-out's later emails each run as their own step, so their runs, their Activity
 * lines and the links kept from them name the step, and the drawer opened on one said "This campaign is gone". Read where
 * the address is read, it opens the links already kept too (bell rows, mails, bookmarks, the ledger).
 */
export function chainOfMoment<C extends { root_id: string; steps: ReadonlyArray<{ id: string }> }>(
  chains: readonly C[],
  id: string,
): C | null {
  return chains.find((c) => c.root_id === id || c.steps.some((s) => s.id === id)) ?? null;
}

/** The reach-out a run is of, by its root step's id, or null for any other run (the one reading of the audience's root). */
export function reachOutRootOf(audience: unknown): string | null {
  if (!isReachOutRun(audience)) return null;
  const root = (audience as { root_id?: unknown }).root_id;
  return typeof root === "string" && root ? root : null;
}

/** The language a reach-out's emails are filed in: the one spelling it has always used (00211), kept as it is stored. */
export const REACH_OUT_LANGUAGE = "en";

export interface SlotLead {
  business_name: string | null;
  city: string | null;
  /** A company's people (00429): its addressee fills the person slots. Absent, or a place: their fallbacks. */
  kind?: string | null;
  facts?: unknown;
  /** Where it was found (00429 leads.source), which the foot's first line says (whyFrom). Absent: the Maps card. */
  source?: string | null;
}
/** The workspace's slots: its name, the name the chain signs with, its booking link. */
export interface SlotWorkspace {
  businessName: string | null;
  yourName?: string | null;
  bookingLink?: string | null;
}

/**
 * The slots' values, in the slot set's order, from the lead's, the workspace's and the send's: a blank one is a hole. A
 * person's slot is its addressee's (00429), and its fallback where the lead names nobody, so it never holds an email.
 */
function reachOutValues(lead: SlotLead, workspace: SlotWorkspace, opening: string | null): Array<string | undefined> {
  const who = leadAddresseeOf(lead);
  return slotValues(REACH_OUT_SLOT_SET, {
    business: lead.business_name,
    company: lead.business_name,
    "first name": who?.first_name || REACH_OUT_SLOT_FALLBACKS["first name"],
    title: who?.title || (who?.role ? LEAD_ROLE_WORDS[who.role] : null) || REACH_OUT_SLOT_FALLBACKS.title,
    role: (who?.role ? LEAD_ROLE_WORDS[who.role] : null) || REACH_OUT_SLOT_FALLBACKS.role,
    city: lead.city,
    "your business": workspace.businessName,
    "your name": workspace.yourName,
    "booking link": workspace.bookingLink,
    opening,
  });
}

/**
 * A step's email for one lead: its words with the six slots filled, by the one fill every email's slots take
 * (renderOwnVersion over the six as a slot set), or why not. Any {{…}} is a slot, named in any case and spacing (the one
 * slot rule, the sheet's and the editor's too). One that has no value here, or is no slot at all ({{first name}},
 * {{business_name}}), holds the email, and so does a brace left once the slots are out: braces never reach a business.
 * A step after the first has no subject (`null`): it answers the email before it.
 */
export function reachOutEmailOf(
  words: { subject: string | null; body: string },
  lead: SlotLead,
  workspace: SlotWorkspace,
  opening: string | null = null,
): { ok: true; subject: string | null; body: string } | { ok: false; reason: "missing_value" } {
  const values = reachOutValues(lead, workspace, opening);
  const texts = words.subject === null ? [words.body] : [words.subject, words.body];
  if (texts.some((t) => slotHoles(REACH_OUT_SLOT_SET, t, values))) return { ok: false, reason: "missing_value" };
  const email = renderOwnVersion("email", words, values, REACH_OUT_LANGUAGE, REACH_OUT_SLOT_SET);
  return { ok: true, subject: words.subject === null ? null : email.subject, body: email.body };
}

/** What the slots a business changes hold in a preview made before any business is chosen: made-up, and said to be. */
const EXAMPLE_LEAD = {
  business_name: "Lakeside Bakery",
  city: "Springfield",
  opening: "Your 4.8 stars from 212 reviews caught my eye.",
  // A person at it, so the person slots show a name, not their fallback.
  person: { name: "Dana Reyes", first_name: "Dana", title: "Owner", role: "owner", email: null, profile_url: null },
} as const;

/**
 * The six slots' values in a preview of a step's email as one business would read it: made-up ones for what changes from
 * business to business, and the workspace's own for what it knows; a slot the workspace has nothing for is a hole, said
 * by its name, as the send would hold it.
 */
export function reachOutExampleValues(workspace: SlotWorkspace): Array<string | undefined> {
  return reachOutValues(
    {
      business_name: EXAMPLE_LEAD.business_name,
      city: EXAMPLE_LEAD.city,
      kind: "company",
      facts: { people: [EXAMPLE_LEAD.person], addressee: 0 },
    },
    workspace,
    EXAMPLE_LEAD.opening,
  );
}
