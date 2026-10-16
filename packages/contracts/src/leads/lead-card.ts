/**
 * The lead workbench's card (canvas B v2, "The decide card"): what a decision on one lead needs, in the order the eye
 * wants it. The reason to write now and what it rests on, whether they can be reached, and the first email they would
 * get from the sequence the pile adds to, filled with this lead's values by the send's own fill (reachOutCardEmailOf).
 * Nothing here calls a model: the opening is shown as still to come, written when its batch is planned and read on it
 * before anything goes. Every sentence the card and its tabs say is here.
 *
 *   leadCardEmailOf    email 1 for this lead: its parts, when it goes, and what Add would come to (a fallback said
 *                      first; a slot with no value, or no address, turns Add off and says why)
 *   leadCardStepsOf    every email of the sequence for this lead, the same way: the Emails tab
 *   leadCardReasonOf   the reason up front: the listing's own signals where it gave some, else the judge's line
 *   leadCardMarksOf    what the reason rests on: each check as a mark, seen, read or couldn't tell
 */
import { capitalize } from "../shared/words";
import { REACH_OUT_OPENING_MARK, reachOutCardEmailOf } from "../reach-out/reach-out-rules";
import type { SlotLead, SlotWorkspace } from "../reach-out/reach-out-rules";
import { REACH_OUT_SLOT_SET } from "../reach-out/reach-out-words";
import { reachOutWhenOf } from "../reach-out/reach-out-leads";
import { chainPaceOf } from "../reach-out/reach-out-sheet";
import { slotMentions } from "../templates/slot-sets";
import type { ReachOutChainDto } from "../reach-out/reach-out-dtos";
import type { LeadEmailState } from "./search/sets";
import type { LeadPeekVM } from "./lead-peek";

/** A piece of a card's email: words, the opening still to come, or a slot this lead has no value for. */
export type LeadCardPart = { kind: "text"; text: string } | { kind: "opening" } | { kind: "gap"; label: string };

/** The sequence the pile adds to, as much of it as the card reads. */
export type LeadCardChain = Pick<
  ReachOutChainDto,
  "root_id" | "name" | "steps" | "state" | "next" | "fed_by" | "owner_sends" | "mailboxes" | "gap_minutes" | "signed_by"
>;

/** What the card knows of the lead for its email: the slots' facts, and where the email would go. */
export interface LeadCardLead extends SlotLead {
  /** The address it would be written to; null when it has none. */
  to: string | null;
  emailState: LeadEmailState;
}

/** Email 1 on the card: its head, where it goes, its words in parts, when it goes, and what Add would come to. */
export interface LeadCardEmailVM {
  /** "Email 1 of 3 · from your own inbox". */
  head: string;
  to: string | null;
  subject: LeadCardPart[] | null;
  body: LeadCardPart[];
  /** "Goes tomorrow from 9 AM, after your OK": the batch, never a minute. */
  when: string;
  /** A fallback said before Add: "Nobody is named here, so it greets them as “there”." */
  note: string | null;
  /** Why Add would come to nothing, so it is off: no address, or a slot with no value here. */
  blocked: string | null;
}

/** One email of the sequence for this lead, as the Emails tab lists them. */
export interface LeadCardStepVM {
  id: string;
  /** "Email 2". */
  label: string;
  /** "4 days after, if nothing comes back"; null for the first. */
  after: string | null;
  subject: LeadCardPart[] | null;
  body: LeadCardPart[];
  /** A slot with no value here: the send would hold this email. */
  gap: boolean;
}

/** The card's words. */
export const LEAD_CARD_WORDS = {
  emailOf: (k: number, of: number) => (of > 1 ? `Email ${k} of ${of}` : "Email 1"),
  fromInbox: "from your own inbox",
  fromBoxes: "from your mailboxes",
  to: "To",
  subject: "Subject",
  opening: "A line about them, written when its batch is planned. You read it before it goes.",
  greets: (fallback: string) => `Nobody is named here, so it greets them as “${fallback}”.`,
  noAddress: "No address to write to, so Add is off. Their phone is on Reach.",
  badAddress: "Their address bounced, so Add is off.",
  holes: (labels: string[]) =>
    `Its words need ${labels.join(" and ")}, which this lead doesn't have, so Add is off. Change the words in the sequence.`,
  firstPile: "You write their email once, when you write to them all at the end.",
  after: (days: number | null) => `${days ?? "?"} days after, if nothing comes back`,
  emailsTitle: "What they would get",
  noEmails: "This sequence has no email to show yet.",
} as const;

/**
 * The pile's sheet on a phone (canvas B: decide at half height, read at full): its five tabs at full, Why first, and its
 * handle's words for where a press takes it.
 */
export const LEAD_CARD_TABS = [
  { id: "why", label: "Why" },
  { id: "reach", label: "Reach" },
  { id: "emails", label: "Emails" },
  { id: "about", label: "About" },
  { id: "activity", label: "Activity" },
] as const;
export type LeadCardTab = (typeof LEAD_CARD_TABS)[number]["id"];

export const LEAD_SHEET_WORDS = {
  tabs: "About this lead",
  raise: "Show everything about them",
  lower: "Back to the card",
} as const;

/** A slot's label as a page calls it ("Title"), lower-cased for a sentence. */
const slotLabel = (key: string): string => {
  const at = REACH_OUT_SLOT_SET.keys.indexOf(key);
  return (REACH_OUT_SLOT_SET.labels[at] || key).toLowerCase();
};

/** Words cut where a slot with no value still stands: text, and each such slot as a gap. */
function gapsOf(text: string): LeadCardPart[] {
  const parts: LeadCardPart[] = [];
  let from = 0;
  for (const m of slotMentions(REACH_OUT_SLOT_SET, text)) {
    if (m.index > from) parts.push({ kind: "text", text: text.slice(from, m.index) });
    parts.push({ kind: "gap", label: slotLabel(m.key) });
    from = m.index + m.written.length;
  }
  if (from < text.length) parts.push({ kind: "text", text: text.slice(from) });
  return parts;
}

/**
 * A filled email's words in parts: the opening's mark as the line still to come, a slot with no value as a gap. The
 * opening stands as a line of its own, so the blank lines the words keep round it are its room, not words.
 */
export function leadCardPartsOf(text: string): LeadCardPart[] {
  const pieces = text.split(REACH_OUT_OPENING_MARK);
  return pieces.flatMap((piece, i) => {
    const words = piece.replace(i > 0 ? /^\n+/ : /^/, "").replace(i < pieces.length - 1 ? /\n+$/ : /$/, "");
    return [...(i > 0 ? [{ kind: "opening" } as const] : []), ...(words ? gapsOf(words) : [])];
  });
}

/** The workspace's slots with the name this sequence signs with. */
const signedAs = (chain: LeadCardChain, w: SlotWorkspace): SlotWorkspace => ({ ...w, yourName: chain.signed_by });

/** The email steps, in their order: a call or a note for the team is no email. */
const emailSteps = (chain: LeadCardChain) => chain.steps.filter((s) => !s.hand).sort((a, b) => a.n - b.n);

/** Where its emails leave from, after the head's "·". */
function fromWords(chain: LeadCardChain): string | null {
  if (chain.owner_sends) return LEAD_CARD_WORDS.fromInbox;
  const one = chainPaceOf(chain).from;
  if (one) return `from ${one}`;
  return chain.mailboxes.length > 1 ? LEAD_CARD_WORDS.fromBoxes : null;
}

/** Why Add would come to nothing for this lead, by the send's own rules; null when it would go. */
function blockedOf(lead: LeadCardLead, holes: string[]): string | null {
  if (!lead.to || lead.emailState === "none") return LEAD_CARD_WORDS.noAddress;
  if (lead.emailState === "invalid") return LEAD_CARD_WORDS.badAddress;
  return holes.length ? LEAD_CARD_WORDS.holes(holes.map(slotLabel)) : null;
}

/**
 * Email 1 of the sequence the pile adds to, for this lead: null when the sequence has no email step. When it goes is the
 * sequence's own line (reachOutWhenOf: its batch, never a minute).
 */
export function leadCardEmailOf(p: {
  chain: LeadCardChain;
  lead: LeadCardLead;
  workspace: SlotWorkspace;
  nowMs: number;
  tz: string;
}): LeadCardEmailVM | null {
  const steps = emailSteps(p.chain);
  const first = steps[0];
  if (!first) return null;
  const email = reachOutCardEmailOf(
    { subject: first.subject ?? "", body: first.body },
    p.lead,
    signedAs(p.chain, p.workspace),
  );
  const from = fromWords(p.chain);
  const when = reachOutWhenOf(
    {
      root_id: p.chain.root_id,
      name: p.chain.name,
      state: p.chain.state,
      fed_by: p.chain.fed_by,
      run_hour: p.chain.next.run_hour,
      last_run_for: p.chain.next.last_run_for,
      waiting_run_id: p.chain.next.waiting_run_id,
    },
    p.nowMs,
    p.tz,
  );
  return {
    head: [LEAD_CARD_WORDS.emailOf(1, steps.length), from].filter(Boolean).join(" · "),
    to: p.lead.to,
    subject: email.subject === null ? null : leadCardPartsOf(email.subject),
    body: leadCardPartsOf(email.body),
    when: capitalize(when),
    note: email.fellBack.includes("first name") ? LEAD_CARD_WORDS.greets("there") : null,
    blocked: blockedOf(p.lead, email.holes),
  };
}

/** Every email of the sequence for this lead, in order: the first with its subject, each after it in the same thread. */
export function leadCardStepsOf(p: {
  chain: LeadCardChain;
  lead: LeadCardLead;
  workspace: SlotWorkspace;
}): LeadCardStepVM[] {
  const w = signedAs(p.chain, p.workspace);
  return emailSteps(p.chain).map((s, i) => {
    const email = reachOutCardEmailOf({ subject: i === 0 ? (s.subject ?? "") : null, body: s.body }, p.lead, w);
    return {
      id: s.id,
      label: `Email ${i + 1}`,
      after: i === 0 ? null : LEAD_CARD_WORDS.after(s.after_days),
      subject: email.subject === null ? null : leadCardPartsOf(email.subject),
      body: leadCardPartsOf(email.body),
      gap: email.holes.length > 0,
    };
  });
}

/* ------------------------------------------------------------------------------------- the reason, up front -- */

/** The reason on the card, in large type: what it says, where it came from, and whether it was seen or read. */
export interface LeadCardReasonVM {
  text: string;
  /** Where it came from, said when it is tapped. */
  from: string;
  /** Seen on a page (its listing's own figures), or Claude's reading of the pages: a reading wears a dashed ring. */
  how: "seen" | "read";
}

const LEAD_CARD_REASON_WORDS = {
  lowShare: (share: string) => `${capitalize(share)} of its reviews are 1 or 2 stars`,
  unclaimed: "nobody has claimed its listing",
  both: (low: string) => `${low}, and nobody has claimed its listing.`,
  fromListing: "Seen on its listing: the spread of its reviews and its claim mark.",
  fromJudge: "Claude's reading of its listing and its website. A reading, not a fact on the page.",
  fromCompany: "What its source says of the company.",
} as const;

/**
 * The reason to write now, up front (canvas B: "The reason leads, in large type"). For a place, the listing's own signals
 * where it gave some (a low-star share worth saying, an unclaimed listing), which the opening can cite; else the
 * judge's line. For a company, the judge's line from what its source gave. Null when there is nothing to say.
 */
export function leadCardReasonOf(
  vm: Pick<LeadPeekVM, "rated" | "claimedNote" | "fit" | "company">,
): LeadCardReasonVM | null {
  const low = vm.rated?.low ?? null;
  const share = low ? low.replace(/\s*at 1.2 stars?$/i, "").trim() : null;
  const unclaimed = !!vm.claimedNote && !vm.company;
  if (share && unclaimed)
    return {
      text: LEAD_CARD_REASON_WORDS.both(LEAD_CARD_REASON_WORDS.lowShare(share)),
      from: LEAD_CARD_REASON_WORDS.fromListing,
      how: "seen",
    };
  if (share)
    return {
      text: `${LEAD_CARD_REASON_WORDS.lowShare(share)}.`,
      from: LEAD_CARD_REASON_WORDS.fromListing,
      how: "seen",
    };
  if (unclaimed)
    return {
      text: `${capitalize(LEAD_CARD_REASON_WORDS.unclaimed)}.`,
      from: LEAD_CARD_REASON_WORDS.fromListing,
      how: "seen",
    };
  const sentence = vm.fit.sentence.trim();
  if (!sentence) return null;
  return {
    text: sentence,
    from: vm.company ? LEAD_CARD_REASON_WORDS.fromCompany : LEAD_CARD_REASON_WORDS.fromJudge,
    how: vm.company ? "seen" : "read",
  };
}

/** One mark of what the reason rests on: a check, how it was known, and its answer. */
export interface LeadCardMarkVM {
  key: string;
  label: string;
  how: "seen" | "read";
  answer: "yes" | "no" | "unknown";
  /** Where it came from, in the tip. */
  from: string;
}

/** How many marks the half-height card holds; the rest are on Why. */
export const LEAD_CARD_MARKS_MAX = 4;

/**
 * What the reason rests on, as quiet marks: couldn't-tell first (it is the open question on the card), then what was
 * seen, then what Claude read; a check that said no is the verdict's, on Why. At most LEAD_CARD_MARKS_MAX.
 */
export function leadCardMarksOf(vm: Pick<LeadPeekVM, "groups">): LeadCardMarkVM[] {
  const all = vm.groups.flatMap((g) =>
    g.checks
      .filter((c) => c.answer !== "no")
      .map((c) => ({ key: c.key, label: c.label, how: g.how, answer: c.answer, from: c.source })),
  );
  const rank = (m: LeadCardMarkVM) => (m.answer === "unknown" ? 0 : m.how === "seen" ? 1 : 2);
  return all.sort((a, b) => rank(a) - rank(b)).slice(0, LEAD_CARD_MARKS_MAX);
}
