/**
 * The lead workbench's card (canvas B v2, "The decide card"): what a decision on one lead needs, in the order the eye
 * wants it. The reason to write now and what it rests on, whether they can be reached, and the first email they would
 * get from the sequence the pile adds to, filled with this lead's values by the send's own fill (reachOutCardEmailOf).
 * Nothing here calls a model: the opening is shown as still to come, written when its batch is planned and read on it
 * before anything goes. Every sentence the card and its tabs say is here.
 *
 *   leadCardEmailOf    email 1 for this lead: its parts, when it goes, and what Add would come to (a fallback said
 *                      first; the door's own answer, reach_out_why_not, or a slot with no value turns Add off and
 *                      says why, and where an address is what is missing, the door that is left: Call, or someone
 *                      else at the company)
 *   leadCardStepsOf    every email of the sequence for this lead, the same way: the Emails tab
 *   leadCardSlotsOf    what fills their words for this lead, each with where it came from, or what stands in for it
 *   leadCardReasonOf   the reason up front: the listing's own signals where it gave some, else the judge's line
 *   leadCardMarksOf    what the reason rests on: each check as a mark, seen, read or couldn't tell
 */
import { capitalize } from "../shared/words";
import {
  REACH_OUT_OPENING_MARK,
  REACH_OUT_VALUE_MARKS,
  reachOutCardEmailOf,
  reachOutCardSlotsOf,
} from "../reach-out/reach-out-rules";
import type { SlotLead, SlotWorkspace } from "../reach-out/reach-out-rules";
import { REACH_OUT_SLOT_SET } from "../reach-out/reach-out-words";
import {
  REACH_OUT_WHY_NOT_WORDS,
  reachOutWhenOf,
  type ReachOutAddLeadDto,
  type ReachOutWhyNot,
} from "../reach-out/reach-out-leads";
import { chainPaceOf } from "../reach-out/reach-out-sheet";
import { slotMentions } from "../templates/slot-sets";
import type { ReachOutChainDto } from "../reach-out/reach-out-dtos";
import type { LeadEmailState } from "./search/sets";
import type { LeadPeekVM } from "./lead-peek";

/**
 * A piece of a card's email: words, a value filled for this lead, the opening (still to come, or, where the listing's
 * own fields say it, its words: contracts leadFactOf, decision 0078), or a slot with no value.
 */
export type LeadCardPart =
  | { kind: "text"; text: string }
  | { kind: "value"; text: string }
  | { kind: "opening"; text?: string }
  | { kind: "gap"; label: string };

/** The sequence the pile adds to, as much of it as the card reads. */
export type LeadCardChain = Pick<
  ReachOutChainDto,
  "root_id" | "name" | "steps" | "state" | "next" | "fed_by" | "owner_sends" | "mailboxes" | "gap_minutes" | "signed_by"
>;

/** What the card knows of the lead for its email: the slots' facts, where the email would go, and the other ways to them. */
export interface LeadCardLead extends SlotLead {
  /** The address it would be written to; null when it has none. */
  to: string | null;
  emailState: LeadEmailState;
  /** A number to call that nobody marked wrong. */
  canCall: boolean;
  /** A company with someone else named at it, who could be written to instead (00430 lead_addressee_choose). */
  canChoose: boolean;
}

/**
 * The door's answer for this lead (00426 reach_out_add, dry: the one predicate, reach_out_why_not, then what only a list
 * can say): why it would not be added, and the sequence that has it when another does. Null: it would be added.
 */
export type LeadCardCheck = (Pick<ReachOutAddLeadDto, "why" | "chain_name"> & { chain_id?: string | null }) | null;

/** Where an address is what Add lacks, the door the card offers in its place: their phone, or someone else there. */
export type LeadCardInstead = "call" | "choose" | null;

/** Email 1 on the card: its head, where it goes, its words in parts, when it goes, and what Add would come to. */
export interface LeadCardEmailVM {
  /** "Email 1 of 3 · from your own inbox". */
  head: string;
  to: string | null;
  subject: LeadCardPart[] | null;
  body: LeadCardPart[];
  /** "Goes tomorrow from 9 AM, after your OK": the batch, never a minute; null where Add is off (it would not go). */
  when: string | null;
  /** A fallback said before Add: "Nobody is named here, so it greets them as “there”." */
  note: string | null;
  /** Why Add would come to nothing, so it is off: the door's answer, or a slot with no value here. */
  blocked: string | null;
  /** Where an address is what is missing: the door left to them (the rail's Call, or Reach's people). */
  instead: LeadCardInstead;
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
  /** The legend under an email drawn whole (the canvas's preview as a real lead): where each marked part comes from. */
  fromRecord: "from their record",
  // A company the people card found has no listing (00430): its opening is said from its directory record and site.
  writtenForThem: "written for them",
  greets: (fallback: string) => `Nobody is named here, so it greets them as “${fallback}”.`,
  checking: "once their address checks out",
  holes: (labels: string[]) =>
    `Its words need ${labels.join(" and ")}, which this lead doesn't have, so Add is off. Change the words in the sequence.`,
  firstPile: "You write their email once, when you write to them all at the end.",
  after: (days: number | null) => `${days ?? "?"} days after, if nothing comes back`,
  emailsTitle: "What they would get",
  noEmails: "This sequence has no email to show yet.",
  elsewhere: (name: string) =>
    `They're with “${name}” already, and a lead is in one sequence at a time, so Add is off.`,
  callTip: "No email can go to them, so the yes here is a call from your phone.",
  choose: "Someone else named there can be written to instead: choose them on Reach.",
  slotsTitle: "What fills their words",
} as const;

/** The door's reasons, as the card says them where Add is off (reach_out_why_not's set; Checking joins, never said). */
const LEAD_CARD_WHY_NOT: Record<ReachOutWhyNot, string> = {
  gone: "They're no longer in your leads, so Add is off.",
  closed: "They were already worked, so Add is off.",
  customer: "They're already a customer, so Add is off.",
  suppressed: "They asked not to be written to, so Add is off.",
  written: "They were already written to, and a business is written to once, so Add is off.",
  shared: "They share a number or a site with another lead, and a business is written to once, so Add is off.",
  no_email: "No address to write to, so Add is off.",
  checking: "Their address is still being checked.",
  unconfirmed: "Their address can't be confirmed, and this sequence writes only to confirmed ones, so Add is off.",
  invalid: "Their address bounced, so Add is off.",
  unchecked: "Their address hasn't been checked yet, so Add is off.",
  already: "They're on this sequence's list already.",
  not_counted: "They're still in Needs review: keep them first.",
  elsewhere: "They're in another sequence already, and a lead is in one sequence at a time, so Add is off.",
};

/** The reasons that are an address: where the card offers the door that is left (a call, someone else there). */
const ADDRESS_WHYS: ReadonlySet<ReachOutWhyNot> = new Set(["no_email", "invalid", "unconfirmed", "unchecked"]);

/**
 * The lead sheet's tabs (the refined canvas, 17 Oct 2026: in Sequences' words), Why first: Why (the checks, the listing
 * and how it was found), Contact (where the sequence writes, the ways in, the people there, the address and the week),
 * and Sequence (where they stand in it, step by step, and the email they would get). "Reach" read as the old Reach out,
 * and a step can be a call, so neither Reach nor Emails stays.
 */
export const LEAD_CARD_TABS = [
  { id: "why", label: "Why" },
  { id: "contact", label: "Contact" },
  { id: "sequence", label: "Sequence" },
] as const;
export type LeadCardTab = (typeof LEAD_CARD_TABS)[number]["id"];

/** A slot's label as a page calls it ("Title"), lower-cased for a sentence. */
const slotLabel = (key: string): string => {
  const at = REACH_OUT_SLOT_SET.keys.indexOf(key);
  return (REACH_OUT_SLOT_SET.labels[at] || key).toLowerCase();
};

/** The values the fill marked, cut out of the words: text between them, and each value as a part of its own. */
const VALUE_RE = new RegExp(
  `${REACH_OUT_VALUE_MARKS[0]}([^${REACH_OUT_VALUE_MARKS[1]}]*)${REACH_OUT_VALUE_MARKS[1]}`,
  "g",
);
function cardValuesOf(text: string): LeadCardPart[] {
  const parts: LeadCardPart[] = [];
  let from = 0;
  for (const m of text.matchAll(VALUE_RE)) {
    const at = m.index ?? 0;
    if (at > from) parts.push(...gapsOf(text.slice(from, at)));
    parts.push({ kind: "value", text: m[1] ?? "" });
    from = at + m[0].length;
  }
  if (from < text.length) parts.push(...gapsOf(text.slice(from)));
  return parts;
}

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
    return [...(i > 0 ? [{ kind: "opening" } as const] : []), ...(words ? cardValuesOf(words) : [])];
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

/**
 * Why Add would come to nothing for this lead: the door's own answer where it gave one (the one predicate, never a
 * second reading of the address here), else a slot with no value, which the send would hold the email for. Null when
 * it would go, and before the door has answered.
 */
function blockedOf(holes: string[], check: LeadCardCheck | undefined): string | null {
  if (check)
    return check.why === "elsewhere" && check.chain_name
      ? LEAD_CARD_WORDS.elsewhere(check.chain_name)
      : LEAD_CARD_WHY_NOT[check.why];
  return holes.length ? LEAD_CARD_WORDS.holes(holes.map(slotLabel)) : null;
}

/** The door left where the door said an address is what is missing: someone else at the company first, else a call. */
function insteadOf(lead: LeadCardLead, check: LeadCardCheck | undefined): LeadCardInstead {
  if (!check || !ADDRESS_WHYS.has(check.why)) return null;
  if (lead.canChoose) return "choose";
  return lead.canCall ? "call" : null;
}

/**
 * Email 1 of the sequence the pile adds to, for this lead: null when the sequence has no email step. When it goes is the
 * sequence's own line (reachOutWhenOf: its batch, never a minute), and an address still being checked goes once it
 * checks out (reach_out_add lets it join). `check` is the door's answer for this lead: absent until it has answered.
 */
export function leadCardEmailOf(p: {
  chain: LeadCardChain;
  lead: LeadCardLead;
  workspace: SlotWorkspace;
  nowMs: number;
  tz: string;
  check?: LeadCardCheck;
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
  const blocked = blockedOf(email.holes, p.check);
  return {
    head: [LEAD_CARD_WORDS.emailOf(1, steps.length), from].filter(Boolean).join(" · "),
    to: p.lead.to,
    subject: email.subject === null ? null : leadCardPartsOf(email.subject),
    body: leadCardPartsOf(email.body),
    when: blocked
      ? null
      : capitalize(p.lead.emailState === "checking" && !p.check ? `${when}, ${LEAD_CARD_WORDS.checking}` : when),
    note: email.fellBack.includes("first name") ? LEAD_CARD_WORDS.greets("there") : null,
    blocked,
    instead: insteadOf(p.lead, p.check),
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

/** One slot their words name, as the Emails tab lists it: its label, what it says for this lead, and where that came from. */
export interface LeadCardSlotVM {
  key: string;
  label: string;
  /** What it says for them; null where they have no value for it (the send would hold the email) or it is written later. */
  value: string | null;
  /** Where the value came from, what stands in for it, or why there is none. */
  from: string;
  look: "value" | "fallback" | "gap" | "later";
}

/** Where each slot's value comes from, as the Emails tab says it. */
const LEAD_CARD_SLOT_FROM = {
  place: "From their listing",
  company: "From their source",
  person: "Of the person it writes to, from their source",
  workspace: "Your workspace's name, in Settings",
  signs: "The name this sequence signs with",
  booking: "Your booking link, in Settings",
  opening: "Written for them when its batch is planned, and read by you before it goes",
  preview: "Their own receptionist, made when the first email that names it goes",
  fallback: (said: string) => `Nobody is named here, so it says “${said}”`,
  gap: "They have none, so the send would hold this email",
} as const;

/** Where a slot's value came from, by its key and the lead's kind. */
function slotFromOf(key: string, company: boolean): string {
  if (key === "your business") return LEAD_CARD_SLOT_FROM.workspace;
  if (key === "your name") return LEAD_CARD_SLOT_FROM.signs;
  if (key === "booking link") return LEAD_CARD_SLOT_FROM.booking;
  if (key === "first name" || key === "title" || key === "role") return LEAD_CARD_SLOT_FROM.person;
  return company ? LEAD_CARD_SLOT_FROM.company : LEAD_CARD_SLOT_FROM.place;
}

/**
 * What fills the sequence's words for this lead (the Emails tab, canvas B: "every variable, with its source"): each slot
 * its emails name, in the order first written, with the value the send's own fill gives it here and where it came from;
 * a fallback said as one, a slot with no value as the hole that holds the email, the opening as still to be written.
 */
export function leadCardSlotsOf(p: {
  chain: LeadCardChain;
  lead: LeadCardLead;
  workspace: SlotWorkspace;
}): LeadCardSlotVM[] {
  const texts = emailSteps(p.chain).flatMap((s, i) => (i === 0 ? [s.subject ?? "", s.body] : [s.body]));
  const company = p.lead.kind === "company";
  return reachOutCardSlotsOf(texts, p.lead, signedAs(p.chain, p.workspace)).map((s): LeadCardSlotVM => {
    const label = capitalize(slotLabel(s.key));
    if (s.key === "opening")
      return { key: s.key, label, value: null, from: LEAD_CARD_SLOT_FROM.opening, look: "later" };
    if (s.key === "their preview" && s.value === null && p.lead.preview?.state !== "gone")
      return { key: s.key, label, value: null, from: LEAD_CARD_SLOT_FROM.preview, look: "later" };
    if (s.value === null) return { key: s.key, label, value: null, from: LEAD_CARD_SLOT_FROM.gap, look: "gap" };
    if (s.fellBack)
      return { key: s.key, label, value: s.value, from: LEAD_CARD_SLOT_FROM.fallback(s.value), look: "fallback" };
    return { key: s.key, label, value: s.value, from: slotFromOf(s.key, company), look: "value" };
  });
}

/* --------------------------------------------------------------------------------- Add them all (canvas B) -- */

/** One lead a bulk Add would take: what the card knows of it, and the door's answer (absent until it has answered). */
export interface LeadCardBulkLead {
  id: string;
  lead: LeadCardLead;
  check: LeadCardCheck | undefined;
}

type LeadCardBulkKey = "goes" | "there" | "checking" | "elsewhere" | "cant";

/** A bulk Add, before it is pressed: what each lead would come to, in buckets, and the leads the press adds. */
export interface LeadCardBulkVM {
  title: string;
  /** The leads the press adds: those that go as they are, greeted “there”, or once their address checks out. */
  ids: string[];
  buckets: { key: LeadCardBulkKey; label: string; n: number; note: string | null; goes: boolean }[];
  press: string;
  /** How many the door has not answered for yet: the press waits for them. */
  waiting: number;
}

const LEAD_CARD_BULK_WORDS = {
  door: (n: number) => `Add all ${n}…`,
  title: (target: string) => `Add them to “${target}”`,
  goes: "Go as they are",
  there: "Greeted as “there”: nobody is named",
  checking: "Go once their address checks out",
  elsewhere: "In another sequence already",
  cant: "Can't be written to",
  holes: "missing what its words need",
  press: (n: number) => (n ? `Add the ${n}` : "None can be added"),
  waiting: "Asking which of them can go…",
} as const;

/** The bulk door's label over the pile: "Add all 12…". */
export const leadCardBulkDoorOf = (n: number): string => LEAD_CARD_BULK_WORDS.door(n);

/** Counts as the door's words say them, most first: "2 with no email address, 1 already a customer". */
const countsWords = (counts: Map<string, number>): string =>
  [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([w, n]) => `${n} ${w}`)
    .join(", ");

/** Which bucket one lead falls in, and the words it is counted under where it can't go. */
function bucketOf(chain: LeadCardChain, b: LeadCardBulkLead, w: SlotWorkspace): [LeadCardBulkKey, string | null] {
  const c = b.check;
  if (c) return c.why === "elsewhere" ? ["elsewhere", c.chain_name] : ["cant", REACH_OUT_WHY_NOT_WORDS[c.why]];
  const first = emailSteps(chain)[0];
  const email = first ? reachOutCardEmailOf({ subject: first.subject ?? "", body: first.body }, b.lead, w) : null;
  if (email && email.holes.length) return ["cant", LEAD_CARD_BULK_WORDS.holes];
  if (b.lead.emailState === "checking") return ["checking", null];
  return email && email.fellBack.length ? ["there", null] : ["goes", null];
}

/**
 * A bulk Add over the leads still open in the pile (canvas B: "Add N, with what each would come to"): the door's own
 * answer for each (reach_out_add, dry), and for those it would take, the send's fill, so a greeting that falls back and
 * a slot with no value are said before the press. The press adds the ones that would go.
 */
export function leadCardBulkOf(p: {
  chain: LeadCardChain;
  leads: readonly LeadCardBulkLead[];
  workspace: SlotWorkspace;
}): LeadCardBulkVM {
  const w = signedAs(p.chain, p.workspace);
  const ids: string[] = [];
  const n = new Map<LeadCardBulkKey, number>();
  const why = { elsewhere: new Map<string, number>(), cant: new Map<string, number>() };
  let waiting = 0;
  for (const b of p.leads) {
    if (b.check === undefined) {
      waiting += 1;
      continue;
    }
    const [key, words] = bucketOf(p.chain, b, w);
    n.set(key, (n.get(key) ?? 0) + 1);
    if (key === "elsewhere" || key === "cant") {
      const said = key === "elsewhere" ? (words ? `with “${words}”` : "with another") : (words ?? "");
      why[key].set(said, (why[key].get(said) ?? 0) + 1);
    } else ids.push(b.id);
  }
  const keys: LeadCardBulkKey[] = ["goes", "there", "checking", "elsewhere", "cant"];
  return {
    title: LEAD_CARD_BULK_WORDS.title(p.chain.name),
    ids,
    buckets: keys
      .filter((k) => (n.get(k) ?? 0) > 0)
      .map((k) => ({
        key: k,
        label: LEAD_CARD_BULK_WORDS[k],
        n: n.get(k) ?? 0,
        note: k === "elsewhere" || k === "cant" ? countsWords(why[k]) : null,
        goes: k !== "elsewhere" && k !== "cant",
      })),
    press: waiting ? LEAD_CARD_BULK_WORDS.waiting : LEAD_CARD_BULK_WORDS.press(ids.length),
    waiting,
  };
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
