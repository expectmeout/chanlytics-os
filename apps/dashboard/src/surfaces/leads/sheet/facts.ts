/**
 * What the lead sheet draws, worked out once a draw from what the page and its reads hand it (sheet.tsx): the one card
 * (lead-sheet-now.ts), the five lines (lead-sheet-lines.ts), the email the card carries, the dock, and the Sequence line's
 * steps: their place in the sequence they are in (the one reader, 00459 sequence_place), or before one, the pick's steps
 * as they would get them. Every rule is contracts'; this only gathers their inputs from the reads.
 */
import {
  chainFirstSender,
  chainPaceOf,
  coldEndingOf,
  LEAD_SHEET_WORDS as W,
  leadCardStepsOf,
  leadDockOf,
  leadHistoryOf,
  leadLinesOf,
  leadNowOf,
  leadOpeningOf,
  leadOwnWordsOf,
  leadSheetChecksLineOf,
  leadSheetClosedOf,
  leadSheetEmailLineOf,
  leadSheetStateOf,
  leadSheetSubOf,
  leadSheetWhyOf,
  leadVerdictOf,
  leadWordsInBox,
  leadWordsPieces,
  markedOpeningOf,
  placeRailOf,
  placeStands,
  type LeadCardCheck,
  type LeadCardLead,
  type LeadCardStepVM,
  type LeadEmailDto,
  type LeadEmailPiece,
  type LeadEmailText,
  type LeadOwnWords,
  type LeadStepWordsDto,
  type LeadHistoryRowVM,
  type LeadLineVM,
  type LeadNowVM,
  type LeadPeekVM,
  type LeadRowVM,
  type LeadSheetChecksLineVM,
  type LeadSheetClosedVM,
  type LeadSheetDockVM,
  type LeadSheetEmailLineVM,
  type LeadSheetLead,
  type LeadSheetState,
  type LeadSheetWhyVM,
  type LeadVerdictVM,
  type MarkedOpening,
  type PlaceRailVM,
  type ReachOutChainDto,
  type SequencePlaceDto,
  type SequenceRecordDto,
  type SequenceState,
  type SlotWorkspace,
} from "@chanlytics/contracts";
import { subjectWords } from "../../campaigns/sequences/place/email-as";
import { businessAddressOf } from "../../campaigns/sequences/leads/reads";
import { leadCardFor, leadCardLeadOf, leadCardWorkspace, type LeadCardFacts } from "../pile/card";
import { leadDtoFor } from "../surface";
import type { LeadAim } from "./use-aim";

/** A pile's own: how many are left for later, for its end. */
export interface SheetPileFacts {
  later: number;
}

/** What the sheet is handed to work its facts out from. */
interface SheetInputs {
  row: LeadRowVM | null;
  vm: LeadPeekVM;
  tz: string;
  aim: LeadAim;
  /** Their place (GET leads/:id/place), whether it has been read, and why it could not be: none is told apart from not yet. */
  place: { read: boolean; failed: string | null; place: SequencePlaceDto | null };
  /**
   * Their own emails (GET leads/:id/emails), for History, none where the read failed, which only leaves a row out; and
   * their own words at each step (decision 0096), which nothing edits where they could not be read.
   */
  emails: { read: boolean; list: readonly LeadEmailDto[]; words: readonly LeadStepWordsDto[]; wordsRead: boolean };
  /**
   * The record of the sequence the rail draws (its steps and words): the one their place stands in, else the pick's. Null
   * while it is read.
   */
  railRecord: SequenceRecordDto | null;
  /** That record is still being read. */
  railReading: boolean;
  /** The batch their step waits in, where the record holds it. */
  waiting?: SheetWaiting | null;
  pile: SheetPileFacts | null;
  /** The page can write them an email of your own (Leads' sheet; not over a record, which has no draft of its own). */
  writes: boolean;
}

/**
 * The batch their step waits in, by the record's needs: how many an OK sends (held emails left out) and how many the check
 * held, when it was made, and the mailbox and the pace its sequence writes at (contracts chainPaceOf).
 */
export interface SheetWaiting {
  ready: number;
  held: number;
  at: string;
  /** The one mailbox it writes from; null where it writes from several, or from none. */
  from: string | null;
  /** How many a day its mailboxes may send; null where the record does not say. */
  pace: number | null;
}

/** The Sequence line's steps: which lens, the sequence it draws, its rows, and each email's words for this lead. */
export interface SheetRail {
  lens: "one" | "preview";
  sequence: { id: string; name: string; state: SequenceState };
  vm: PlaceRailVM;
  /** Each email of the sequence for this lead, by its place: what a step opened shows. */
  steps: ReadonlyMap<number, LeadCardStepVM>;
  /** The sequence's chain, which how an email ends and what fills it read; null while it is read. */
  chain: ReachOutChainDto | null;
}

/** What an email needs to become a box (decision 0096): whose it is, its words as written, and what fills them. */
export interface SheetMailEdit {
  sequenceId: string;
  stepId: string;
  leadId: string;
  name: string;
  /** A first email, with its subject; a later one answers it. */
  first: boolean;
  /** These words are this lead's own. */
  own: boolean;
  written: LeadEmailText;
  stepWritten: LeadEmailText;
  lead: LeadCardLead;
  workspace: SlotWorkspace;
  opening: string | null;
}

/** An email as the sheet reads it: who it goes to, its words in pieces, how it ends, and what may be done about it. */
export interface SheetMail {
  to: string;
  subject: string | null;
  pieces: readonly LeadEmailPiece[];
  /** The name or the signature it ends with under the words, as the send ends it. */
  ending: string | null;
  /** What the check refused marked in its opening, where it is read before it goes. */
  opening: MarkedOpening | null;
  /** Its opening is still being written. */
  writing: boolean;
  /** Rewrite the opening stands under it: its opening written, and the email not yet gone. */
  rewrite: boolean;
  /** Its line is not written yet, and a press can have it written now: its send. */
  writeNow: string | null;
  /** Held: what it was held for stays in sight, whatever the width. */
  tall: boolean;
  /** It can be typed in; null where it has gone, or is its owner's to send, or their words could not be read. */
  edit: SheetMailEdit | null;
  /** Their own words could not be read: these are the step's, and may not be what goes. */
  wordsUnread: boolean;
}

export interface SheetFacts {
  /** A read that could change what the sheet says is still out: who they are and nothing more, until it lands. */
  reading: boolean;
  /** Why their place could not be read: the sheet says that, never a guess at where they stand. */
  unread: string | null;
  card: LeadCardFacts;
  check: LeadCardCheck | undefined;
  state: LeadSheetState;
  closed: LeadSheetClosedVM | null;
  verdict: LeadVerdictVM;
  /** The line under the name, the checks in a line, how the address checked, and Fit's checks. */
  sub: string;
  checks: LeadSheetChecksLineVM | null;
  email: LeadSheetEmailLineVM;
  why: LeadSheetWhyVM | null;
  now: LeadNowVM;
  mail: SheetMail | null;
  lines: LeadLineVM[];
  history: LeadHistoryRowVM[];
  place: SequencePlaceDto | null;
  /** The sequence that has them, where it is not the pick. */
  elsewhere: { id: string | null; name: string; written: boolean } | null;
  /** An email of your own can be written to them here: an address that reaches them, on a page with the draft. */
  canWrite: boolean;
  /** Only what to press; null where nothing is left to press, and the sheet draws no foot. */
  dock: LeadSheetDockVM | null;
  rail: SheetRail | null;
  /** An email of the Sequence line, opened by its place (railMailOf). */
  railMail: (at: number) => ReturnType<typeof railMailOf>;
  /** The batch their step waits in, which Approve asks about. */
  waiting: SheetWaiting | null;
}

/** The send states that have written to a lead, or are about to: a business gets one sequence. */
const WRITTEN = new Set(["claimed", "queued", "sent", "handed", "drafted"]);

/** The lead as the state reads it: its class, stage and address, and a number to call. */
const sheetLeadOf = (vm: LeadPeekVM): LeadSheetLead => ({
  cls: vm.cls,
  stage: vm.stage,
  emailState: vm.reach.email.state,
  hasEmail: !!vm.reach.email.address,
  canCall: !!(vm.reach.phone && vm.reach.phone.tel && !vm.reach.phone.wrong),
});

/**
 * The sequence that has them, where it is not the pick: their place's (standing, or one that wrote to them, which keeps
 * them there), else the add door's answer naming another.
 */
function elsewhereOf(i: SheetInputs, check: LeadCardCheck | undefined): SheetFacts["elsewhere"] {
  const pick = i.aim.target;
  const place = i.place.place;
  if (place) {
    // With no pick (over a record, or none chosen yet) their own sequence is no other one.
    if (!pick || place.sequence.id === pick.rootId) return null;
    const written = place.sends.some((s) => WRITTEN.has(s.state));
    if (!placeStands(place.place.group) && !written) return null;
    return { id: place.sequence.id, name: place.sequence.name, written };
  }
  if (check && (check.why === "elsewhere" || check.why === "written") && check.chain_name)
    return { id: check.chain_id ?? null, name: check.chain_name, written: check.why === "written" };
  return null;
}

/** The sequence the rail draws: the one their place stands in, else the pick; its record where it is the one read. */
export const railSequenceOf = (i: Pick<SheetInputs, "place" | "aim">): string | null =>
  i.place.place ? i.place.place.sequence.id : i.aim.target ? i.aim.target.rootId : null;

/** The record the rail draws from, where it is the sequence's own. */
const railRecordOf = (i: SheetInputs, id: string): SequenceRecordDto | null =>
  i.railRecord && i.railRecord.sequence.id === id ? i.railRecord : null;

/** Each email of a sequence for this lead, by the step's place. */
function stepsByPlace(
  chain: ReachOutChainDto | null,
  steps: SequenceRecordDto["steps"],
  who: { leadId: string; own: LeadOwnWords },
): Map<number, LeadCardStepVM> {
  const lead = leadCardLeadOf(who.leadId);
  const out = new Map<number, LeadCardStepVM>();
  if (!chain || !lead) return out;
  for (const s of leadCardStepsOf({ chain, lead, workspace: leadCardWorkspace(), own: who.own })) {
    const step = steps.find((x) => x.id === s.id);
    if (step) out.set(step.place, s);
  }
  return out;
}

/** The rail's titles: each email's subject as this lead reads it, else what the step is. */
const titlesOf = (emails: ReadonlyMap<number, LeadCardStepVM>): Map<number, string> =>
  new Map(
    [...emails].flatMap(([place, s]) => {
      const t = subjectWords(s.subject);
      return t ? [[place, t] as [number, string]] : [];
    }),
  );

/**
 * The Sequence line's steps: their place, drawn on the record's rail for one lead, where a sequence has them; else, with
 * a pick and an email to write to, the pick's steps as they would get them. None while their place or the pick's record
 * is still being read, and none for a lead no sequence can take.
 */
function railOf(i: SheetInputs, state: LeadSheetState, nowMs: number): SheetRail | null {
  // Never the pick's preview while their place is still being read: it may be a place of their own.
  if (!i.place.read) return null;
  const clock = { tz: i.tz, nowMs };
  const place = i.place.place;
  const who = { leadId: i.vm.id, own: leadOwnWordsOf(i.emails.words) };
  if (place) {
    const rec = railRecordOf(i, place.sequence.id);
    if (!rec) return null;
    const steps = stepsByPlace(rec.chain ?? null, rec.steps, who);
    return {
      lens: "one",
      chain: rec.chain ?? null,
      sequence: place.sequence,
      vm: placeRailOf({
        lens: "one",
        steps: rec.steps,
        titles: titlesOf(steps),
        seq: place.sequence.state,
        place,
        readsReplies: place.reads_replies,
        clock,
      }),
      steps,
    };
  }
  const pick = i.aim.target;
  if (!pick || state === "phone" || state === "closed" || state === "elsewhere") return null;
  const rec = railRecordOf(i, pick.rootId);
  if (!rec) return null;
  const recSteps = rec.steps;
  const steps = stepsByPlace(rec.chain ?? pick.chain, recSteps, who);
  return {
    lens: "preview",
    chain: rec.chain ?? pick.chain,
    sequence: { id: pick.rootId, name: pick.name, state: pick.row.state },
    vm: placeRailOf({
      lens: "preview",
      steps: recSteps,
      titles: titlesOf(steps),
      seq: pick.row.state,
      place: null,
      readsReplies: false,
      clock,
    }),
    steps,
  };
}

/** The card, the door's answer and the lead's state: what the rest of the facts are read from. */
function cardStateOf(i: SheetInputs) {
  const pick = i.aim.target;
  const check = pick ? i.aim.checkOf(i.vm.id) : undefined;
  const card = leadCardFor(i.vm.id, pick ? pick.chain : null, i.tz, { check, own: leadOwnWordsOf(i.emails.words) });
  const lead = sheetLeadOf(i.vm);
  const state = leadSheetStateOf({ lead, place: i.place.place, check, email: card.email });
  const blocked = card.email ? card.email.blocked : null;
  const dto = leadDtoFor(i.vm.id);
  const closed =
    state === "closed"
      ? leadSheetClosedOf({ lead, closedReason: dto ? (dto.closed_reason ?? null) : null, blocked })
      : null;
  return { card, check, lead, state, blocked, closed };
}

/** Who an email goes to: the person a company's sequence writes to, then the address. */
function addresseeOf(vm: LeadPeekVM, address: string): string {
  const person = vm.company ? vm.company.people.find((p) => p.addressee) : null;
  return person ? `${person.name} · ${address}` : address;
}

/** The sentence the listing says for this lead (contracts leadFactOf), which the check offers its reader first. */
function factLineOf(leadId: string): string | null {
  const dto = leadDtoFor(leadId);
  if (!dto) return null;
  const { business_name, city, hours, rating, reviews } = dto;
  return leadOpeningOf(null, { business_name, city, hours: hours ?? null, rating, reviews });
}

/** The words of one step for this lead, as they read and as they end, and what it takes to type them. */
function stepWordsOf(
  i: Pick<SheetInputs, "vm" | "emails">,
  on: { step: LeadCardStepVM; chain: ReachOutChainDto; line: string | null },
): Pick<SheetMail, "subject" | "pieces" | "ending" | "edit" | "wordsUnread"> | null {
  const { step, chain, line } = on;
  const lead = leadCardLeadOf(i.vm.id);
  if (!lead) return null;
  const workspace = { ...leadCardWorkspace(), yourName: chain.signed_by };
  const box = leadWordsInBox({ words: step.written, lead, workspace, opening: line });
  const first = step.stepWritten.subject !== null;
  const ending = coldEndingOf({
    signsWith: chain.signs_with ?? "name",
    signedBy: chain.signed_by,
    // An email its owner sends ends with the name alone: their mail app adds their signature.
    signature: chain.owner_sends ? null : (chainFirstSender(chain)?.signature?.words ?? null),
    first,
    body: step.written.body,
    address: businessAddressOf(),
  });
  return {
    subject: box.subject,
    pieces: leadWordsPieces({ body: step.written.body, lead, workspace, opening: line }),
    ending: ending.signature ?? ending.signOff,
    wordsUnread: !i.emails.wordsRead,
    edit: i.emails.wordsRead
      ? {
          sequenceId: chain.root_id,
          stepId: step.id,
          leadId: i.vm.id,
          name: i.vm.short,
          first,
          own: step.own,
          written: step.written,
          stepWritten: step.stepWritten,
          lead,
          workspace,
          opening: line,
        }
      : null,
  };
}

/** The first email they would get from the pick. */
function firstMailOf(i: SheetInputs, card: LeadCardFacts): SheetMail | null {
  const email = card.email;
  const step = card.steps[0];
  const chain = i.aim.target ? i.aim.target.chain : null;
  if (!email || !step || !chain) return null;
  const line = step.body.some((x) => x.kind === "opening") ? factLineOf(i.vm.id) : null;
  const words = stepWordsOf(i, { step, chain, line });
  if (!words) return null;
  return {
    to: W.mail.ifAdded(email.to ?? i.vm.reach.email.value),
    ...words,
    opening: markedOpeningOf(line, { reason: null, detail: null }),
    writing: false,
    rewrite: false,
    writeNow: null,
    tall: false,
  };
}

/**
 * The email their step holds, its opening as it goes: read before an OK, marked where the check refused it, or the one
 * up next, on its day. One the check has not come to says the sentence the listing would give it, else that it is to come.
 */
function stepMailOf(i: SheetInputs, place: SequencePlaceDto, rail: SheetRail | null): SheetMail | null {
  const row = place.place;
  const step = rail ? rail.steps.get(row.place ?? 1) : null;
  if (!step || !rail || !rail.chain) return null;
  const hasLine = step.body.some((x) => x.kind === "opening");
  const unread = row.checked === false;
  // Waiting for an OK or held, the check is at it; up next and days off, the check has not come to it yet (2 hours before).
  const writing = hasLine && unread && row.group !== "next";
  const line = hasLine ? (row.opening ?? (unread ? factLineOf(i.vm.id) : null)) : null;
  const words = stepWordsOf(i, { step, chain: rail.chain, line });
  if (!words) return null;
  return {
    to: W.mail.to(addresseeOf(i.vm, i.vm.reach.email.value)),
    ...words,
    opening: markedOpeningOf(line, { reason: row.why, detail: row.hold_detail }),
    writing,
    rewrite: (row.group === "waiting" || row.group === "next") && !writing && hasLine && !!row.opening,
    writeNow: row.group === "next" && hasLine && unread ? row.send_id : null,
    tall: row.group === "held",
  };
}

/** The email handed to you, as it reads: yours to change in your mail app. */
function draftMailOf(vm: LeadPeekVM, place: SequencePlaceDto): SheetMail | null {
  const draft = place.place.draft;
  if (!draft) return null;
  return {
    to: W.mail.to(addresseeOf(vm, draft.to)),
    subject: draft.subject,
    pieces: [{ at: 0, kind: "words", text: draft.text }],
    ending: null,
    opening: null,
    writing: false,
    rewrite: false,
    writeNow: null,
    tall: false,
    edit: null,
    wordsUnread: false,
  };
}

/**
 * An email of the sequence opened on the Sequence line, by its place: as they get it, typed in where it has not gone. One
 * that went is read from what went, by its send (`sent`), and none is offered to type.
 */
export function railMailOf(
  i: Pick<SheetInputs, "vm" | "emails" | "place">,
  rail: SheetRail,
  at: number,
): (SheetMail & { sent: string | null }) | null {
  const step = rail.steps.get(at);
  if (!step || !rail.chain) return null;
  const place = i.place.place;
  const send = place ? (place.sends.filter((s) => s.step_id === step.id).at(-1) ?? null) : null;
  const open = !send || send.state === "planned" || send.state === "held" || send.state === "skipped";
  const went = send && (send.state === "sent" || send.state === "handed") ? send.id : null;
  const row = place ? place.place : null;
  const hasLine = step.body.some((x) => x.kind === "opening");
  const line = hasLine ? (row && send && row.send_id === send.id ? (row.opening ?? null) : factLineOf(i.vm.id)) : null;
  const words = stepWordsOf(i, { step, chain: rail.chain, line });
  if (!words) return null;
  return {
    to: "",
    ...words,
    edit: open ? words.edit : null,
    opening: markedOpeningOf(line, { reason: null, detail: null }),
    writing: false,
    rewrite: false,
    writeNow: null,
    tall: false,
    sent: went,
  };
}

/** The email the card says it carries. */
function mailOf(p: { now: LeadNowVM; i: SheetInputs; card: LeadCardFacts; rail: SheetRail | null }): SheetMail | null {
  const place = p.i.place.place;
  if (p.now.mail === "first") return firstMailOf(p.i, p.card);
  if (p.now.mail === "step" && place) return stepMailOf(p.i, place, p.rail);
  if (p.now.mail === "draft" && place) return draftMailOf(p.i.vm, place);
  return null;
}

/**
 * Whether a read that decides what the sheet says is still out: their place, the record of the sequence the Sequence line
 * draws and, for a lead no sequence has, the sequences Add could go to and the add door's answer. All of them land before
 * the sheet says anything of its own, so it draws once, as it is, and never a guess the next read takes back.
 */
function sheetStillReading(i: SheetInputs, state: LeadSheetState): boolean {
  if (i.place.failed !== null) return false;
  if (!i.place.read || !i.emails.read || i.railReading) return true;
  if (i.place.place || state === "closed") return false;
  return i.aim.reading || i.aim.checking(i.vm.id);
}

/** The sheet's facts, from the page's reads. */
export function sheetFactsOf(i: SheetInputs, nowMs: number): SheetFacts {
  const c = cardStateOf(i);
  const pick = i.aim.target;
  const place = i.place.place;
  const elsewhere = elsewhereOf(i, c.check);
  const reading = sheetStillReading(i, c.state);
  const unread = i.place.failed;
  // Nothing is offered that a read could take back, and nothing where their place could not be read.
  const held = reading || unread !== null;
  const canWrite = i.writes && c.lead.hasEmail && c.lead.emailState !== "invalid";
  const dock = held
    ? null
    : leadDockOf({
        state: c.state,
        place,
        pick: pick ? { id: pick.rootId, name: pick.name, state: pick.row.state } : null,
        blocked: c.blocked,
        elsewhere,
        canCall: c.lead.canCall,
        canWrite,
        canLater: !!(i.row && i.row.searchId),
        closed: c.closed,
        batch: i.waiting ? i.waiting.ready : undefined,
      });
  const verdict = leadVerdictOf(i.vm);
  const checks = leadSheetChecksLineOf(i.vm);
  const email = leadSheetEmailLineOf(i.vm);
  const rail = railOf(i, c.state, nowMs);
  const steps = rail ? rail.vm.steps.length : null;
  const phone = i.vm.reach.phone;
  const now = leadNowOf({
    state: c.state,
    place,
    closed: c.closed,
    elsewhere,
    verdict,
    fitWord: i.vm.fit.word,
    reason: c.card.reason ? c.card.reason.text : i.vm.fit.sentence || null,
    checks,
    blocked: c.blocked,
    email,
    phone: phone ? { value: phone.value, confirmed: i.vm.slots.phone.state === "ok", today: i.vm.today } : null,
    firstEmail: !!c.card.email,
    steps,
    batch: i.waiting ? i.waiting.ready : null,
    batchAt: i.waiting ? i.waiting.at : null,
    pace: i.waiting ? i.waiting.pace : null,
    tz: i.tz,
    nowMs,
  });
  const history = leadHistoryOf({ vm: i.vm, place, emails: i.emails.list, tz: i.tz, nowMs });
  return {
    reading,
    unread,
    card: c.card,
    check: c.check,
    state: c.state,
    closed: c.closed,
    verdict,
    sub: leadSheetSubOf(i.vm),
    checks,
    email,
    why: leadSheetWhyOf(i.vm),
    now,
    mail: mailOf({ now, i, card: c.card, rail }),
    lines: leadLinesOf({
      vm: i.vm,
      checks,
      email,
      place,
      steps,
      pick: pick ? { name: pick.name } : null,
      canJoin: c.state === "ready" || c.state === "gap" || c.state === "finding",
      history,
    }),
    history,
    place,
    elsewhere,
    canWrite,
    dock,
    rail,
    railMail: (at) => (rail ? railMailOf(i, rail, at) : null),
    waiting: i.waiting ?? null,
  };
}

/**
 * The batch the lead's step waits in, by the record's needs: how many an OK sends (held emails left out), how many the
 * check held, when it was made, and the mailbox and the pace its sequence writes at (chainPaceOf, as its run's screen
 * says them).
 */
export const waitingOf = (rec: SequenceRecordDto | null, batchId: string | null): SheetWaiting | null => {
  if (!rec || !batchId) return null;
  const b = rec.sequence.needs.batches.find((x) => x.id === batchId);
  if (!b) return null;
  const pace = rec.chain ? chainPaceOf(rec.chain) : null;
  return {
    ready: b.people,
    held: b.held ?? 0,
    at: b.at,
    from: pace ? pace.from : null,
    pace: pace ? pace.share : null,
  };
};
