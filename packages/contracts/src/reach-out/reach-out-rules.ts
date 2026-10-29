/**
 * Reach out's rules that more than one place asks (Part 3), each said once.
 *
 *   outreachRefusalOf   the lead's own facts, as the send door reads them (deliver.ts) and as the clock reads them
 *                       before it claims a send: one mapping, so the two never disagree about who may be written to.
 *   draftRefusalOf      the same, for an email its owner sends (00429): asked as it is handed over, as To send is read
 *                       and on each tick of the clock, since no send door stands between the owner's inbox and the
 *                       business. A customer's address is refused too, as the person door refuses it at Sent.
 *   OUTREACH_WAIT_REFUSALS   the door's refusals that mean "not now": the send is planned again, never canceled (C5).
 *   reachOutEmailOf     a step's words with the lead's, the workspace's and the send's values in (§4.3's slots, and
 *                       00430's person slots from a company's addressee, each with its fallback), by
 *                       the one fill every email takes (templates/slot-sets.ts); a slot with no value holds the email
 *                       (missing_value, the reason that exists: broadcast.ts). The send, the sheet's preview and the
 *                       approval's first email read it.
 *   reachOutCardEmailOf the same fill for a lead's card before anything is written: the opening left as a mark, the
 *                       slots with no value named (the lead workbench's decide card).
 *   reachOutExampleValues  the same slots, made up for what changes from business to business: the Templates page's preview.
 *   coldEndingOf        how a cold email ends (0077): its sequence's name under the words, or its mailbox's signature
 *                       where the sequence chose it and it carries no link to a first email. The send, the owner's
 *                       draft, the preview and the test all end by it; coldSignedOff puts the name under the words.
 *   REACH_OUT_MONTH_EMAILS   the month's allowance per workspace (§4.8's number; the price is Ruben's to set).
 *   REACH_OUT_CHECKS_PER_DAY the check's daily ceiling per workspace (Part 4, R12).
 */
import type { DeliveryRefusal } from "../consent/consent";
import { renderOwnVersion } from "../templates/message-versions";
import { slotHoles, slotMentions, slotValueOf, slotValues, slotsWritten } from "../templates/slot-sets";
import { LEAD_ROLE_WORDS, leadAddresseeOf } from "../leads/lead-kind";
import { REACH_OUT_SLOT_FALLBACKS, REACH_OUT_SLOT_SET, linkCount } from "./reach-out-words";

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
 * 00429): a morning's work. Its steps after the first are planned first, so a nudge is never crowded out by new leads.
 */
export const REACH_OUT_DRAFTS_PER_DAY = 30;

/**
 * The most emails a reach-out its owner sends holds for them at once (00429): planned, being written or waiting in To
 * send, two days' share. An owner who falls behind is handed nothing new until they catch up, so a draft is not left
 * to be given up (kept_waiting) and its lead with it.
 */
export const REACH_OUT_DRAFTS_OPEN_MAX = 2 * REACH_OUT_DRAFTS_PER_DAY;

/** A draft's lead as the send door would judge it (00429 reach_out_draft_facts), snake_case as SQL answers it. */
export interface DraftLeadFacts {
  lead_stage: string | null;
  suppressed: boolean;
  wrote_back: boolean;
  away: boolean;
  stopped: boolean;
  /** A person in People holds its address while it has no person of its own: a customer. */
  customer: boolean;
}

/**
 * Why a draft may not be offered to its owner now: the send door's refusal (outreachRefusalOf), a customer's address
 * (already_yours, as the person door says it at Sent), or its lead gone. Null when it may.
 */
export function draftRefusalOf(f: DraftLeadFacts | null): string | null {
  if (!f) return "lead_gone";
  const refused = outreachRefusalOf({
    leadStage: f.lead_stage,
    suppressed: f.suppressed,
    wroteBack: f.wrote_back,
    away: f.away,
    stopped: f.stopped,
  });
  return refused ?? (f.customer ? "already_yours" : null);
}

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
  /** A company's people (00430): its addressee fills the person slots. Absent, or a place: their fallbacks. */
  kind?: string | null;
  facts?: unknown;
  /** Where it was found (00430 leads.source), which the foot's first line says (whyFrom). Absent: the Maps card. */
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
 * person's slot is its addressee's (00430): {{first name}} greets with its fallback where nobody is named, and {{title}}
 * and {{role}}, which claim something of a person, are holes there.
 */
function reachOutValues(lead: SlotLead, workspace: SlotWorkspace, opening: string | null): Array<string | undefined> {
  const who = leadAddresseeOf(lead);
  return slotValues(REACH_OUT_SLOT_SET, {
    business: lead.business_name,
    company: lead.business_name,
    "first name": who?.first_name || REACH_OUT_SLOT_FALLBACKS["first name"],
    // A person's title or role is said only where their source said it: no guess stands in (a hole holds the email).
    title: who?.title || (who?.role ? LEAD_ROLE_WORDS[who.role] : null),
    role: who?.role ? LEAD_ROLE_WORDS[who.role] : null,
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

/** How a sequence to leads ends its emails (0077): its Signed line, or its mailbox's own signature. */
export const REACH_OUT_SIGNS_WITH = ["name", "mailbox"] as const;
export type ReachOutSignsWith = (typeof REACH_OUT_SIGNS_WITH)[number];

/** What goes under a cold email's words: the name it signs off with, or the mailbox's signature; never both. */
export interface ColdEnding {
  signOff: string | null;
  signature: string | null;
}

/** The longest line a sign-off holds, as written: a longer one is a sentence of the words, never a sign-off. */
const SIGN_OFF_LINE_MAX = 60;
/** The most lines a sign-off runs to: "Best,", the name, the business. */
const SIGN_OFF_LINES_MAX = 3;

/**
 * Whether the words close on the name the sequence signs with ({{your name}}, in any case or spacing): a line of their
 * sign-off names it, alone or with other words ("- {{your name}}, {{your business}}"). The sign-off is their last lines,
 * up to three, each short, back to the first blank line; a sentence of the words that names it, or the name said
 * further up, is not one (29 Oct 2026: a follow-up closing "- Ruben, Chanlytics" was signed Ruben again).
 */
function endsWithYourName(body: string): boolean {
  const closing: string[] = [];
  for (const raw of body
    .trimEnd()
    .split(/\r\n|\r|\n/)
    .reverse()) {
    const line = raw.trim();
    if (!line || line.length > SIGN_OFF_LINE_MAX || closing.length === SIGN_OFF_LINES_MAX) break;
    closing.push(line);
  }
  return closing.some((line) => slotMentions(REACH_OUT_SLOT_SET, line).some((m) => m.key === "your name"));
}

/**
 * How a cold email ends (0077), the one rule the send, the owner's draft, the preview and the test take: the mailbox's
 * signature where the sequence chose it, it has words, and it carries no link to a first email (the words' own link
 * rule, `linkCount`); else the Signed line under the words, unless their sign-off names it already. `body` is the
 * step's words as written, before their values go in.
 */
export function coldEndingOf(p: {
  signsWith: ReachOutSignsWith;
  signedBy: string | null;
  signature: string | null;
  first: boolean;
  body: string;
}): ColdEnding {
  const signature = p.signature?.trim() || null;
  if (p.signsWith === "mailbox" && signature && !(p.first && linkCount(signature) > 0))
    return { signOff: null, signature };
  const name = p.signedBy?.trim() || null;
  return { signOff: name && !endsWithYourName(p.body) ? name : null, signature: null };
}

/** The words with the name under them, a blank line between; the words as they are where there is none. */
export function coldSignedOff(body: string, signOff: string | null): string {
  return signOff ? `${body.trimEnd()}\n\n${signOff}` : body;
}

/**
 * Where the opening stands in a card's email (canvas B's decide card): a character no words hold, which the card draws as
 * the line still to be written. It is written for each business when its batch is planned, never before.
 */
export const REACH_OUT_OPENING_MARK = "";

/**
 * Where a value the card fills stands in its email (canvas B: the values drawn as values): two characters no words hold,
 * before and after it.
 */
export const REACH_OUT_VALUE_MARKS = ["", ""] as const;

/** A step's email as one lead's card shows it before anything is written, by the send's own fill. */
interface ReachOutCardEmail {
  subject: string | null;
  /** The opening is REACH_OUT_OPENING_MARK; a slot with no value here stays as it is written ({{title}}). */
  body: string;
  /** The slots with no value for this lead, by key: the send would hold the email (missing_value). */
  holes: string[];
  /** The slots that said their fallback for this lead ("first name" greets "there" where nobody is named). */
  fellBack: string[];
}

/**
 * A step's email as a lead's card shows it (the lead workbench, canvas B): the same values and the same fill as the
 * send (reachOutValues, renderOwnVersion), with no model call. The opening is the mark, drawn as still to come; a slot
 * with no value is named in `holes` and left as written, so the card says why Add would come to nothing before it is
 * pressed; a person slot that fell back says so in `fellBack`.
 */
export function reachOutCardEmailOf(
  words: { subject: string | null; body: string },
  lead: SlotLead,
  workspace: SlotWorkspace,
): ReachOutCardEmail {
  const values = reachOutValues(lead, workspace, REACH_OUT_OPENING_MARK);
  const texts = words.subject === null ? [words.body] : [words.subject, words.body];
  const written = [...new Set(texts.flatMap((t) => slotsWritten(REACH_OUT_SLOT_SET, t).keys))];
  const holes = written.filter((k) => (slotValueOf(REACH_OUT_SLOT_SET, k, values) ?? null) === null);
  const named = leadAddresseeOf(lead)?.first_name;
  const fellBack = !named && written.includes("first name") ? ["first name"] : [];
  // Each value the card shows is marked where it stands (REACH_OUT_VALUE_MARKS), so the card draws it as a value; the
  // opening keeps its own mark, and a slot with no value stays as written.
  const marked = values.map((v, i) =>
    v && REACH_OUT_SLOT_SET.keys[i] !== "opening" ? `${REACH_OUT_VALUE_MARKS[0]}${v}${REACH_OUT_VALUE_MARKS[1]}` : v,
  );
  const email = renderOwnVersion("email", words, marked, REACH_OUT_LANGUAGE, REACH_OUT_SLOT_SET);
  return { subject: words.subject === null ? null : email.subject, body: email.body, holes, fellBack };
}

/** One slot a step's words name, as a lead's card lists it: its value for this lead, or none, and whether it said its fallback. */
interface ReachOutCardSlot {
  key: string;
  /** Null where this lead has no value for it (a hole), and for the opening, which is written later. */
  value: string | null;
  fellBack: boolean;
}

/**
 * The slots a sequence's words name, as one lead's card lists them (the Emails tab): each with the value the send's fill
 * gives it for this lead (reachOutValues), in the order they are first written.
 */
export function reachOutCardSlotsOf(
  texts: readonly string[],
  lead: SlotLead,
  workspace: SlotWorkspace,
): ReachOutCardSlot[] {
  const values = reachOutValues(lead, workspace, null);
  const named = !!leadAddresseeOf(lead)?.first_name;
  const written = [...new Set(texts.flatMap((t) => slotsWritten(REACH_OUT_SLOT_SET, t).keys))];
  return written.map((key) => ({
    key,
    value: slotValueOf(REACH_OUT_SLOT_SET, key, values) ?? null,
    fellBack: key === "first name" && !named,
  }));
}

/** What the slots a business changes hold in a preview made before any business is chosen: made-up, and said to be. */
const EXAMPLE_LEAD = {
  business_name: "Lakeside Bakery",
  city: "Springfield",
  opening: "Your 4.8 stars from 212 reviews caught my eye.",
  // A person at it, so the person slots show a name, not their fallback.
  person: { name: "Dana Reyes", first_name: "Dana", title: "Owner", role: "owner", email: null, profile_url: null },
} as const;

/** The made-up business a preview or a test reads as where nobody is in the sequence yet: a company, a person named. */
export const reachOutExampleLead = (): SlotLead => ({
  business_name: EXAMPLE_LEAD.business_name,
  city: EXAMPLE_LEAD.city,
  kind: "company",
  facts: { people: [EXAMPLE_LEAD.person], addressee: 0 },
  source: "local_businesses",
});

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
