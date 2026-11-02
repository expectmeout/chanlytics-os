/**
 * What the lead sheet draws, worked out once a draw from what the page and its reads hand it (sheet.tsx): the one card
 * (lead-sheet-now.ts), the five lines (lead-sheet-lines.ts), the email the card carries, the dock, and the Sequence line's
 * steps: their place in the sequence they are in (the one reader, 00459 sequence_place), or before one, the pick's steps
 * as they would get them. Every rule is contracts'; this only gathers their inputs from the reads.
 */
import {
  LEAD_SHEET_WORDS as W,
  leadCardStepsOf,
  leadDockOf,
  leadHistoryOf,
  leadLinesOf,
  leadNowOf,
  leadSheetChecksLineOf,
  leadSheetClosedOf,
  leadSheetEmailLineOf,
  leadSheetStateOf,
  leadSheetSubOf,
  leadSheetWhyOf,
  leadVerdictOf,
  markedOpeningOf,
  placeRailOf,
  placeStands,
  type LeadCardCheck,
  type LeadCardPart,
  type LeadCardStepVM,
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
} from "@chanlytics/contracts";
import { subjectWords } from "../../campaigns/sequences/place/email-as";
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
   * The record of the sequence the rail draws (its steps and words): the one their place stands in, else the pick's. Null
   * while it is read.
   */
  railRecord: SequenceRecordDto | null;
  /** That record is still being read. */
  railReading: boolean;
  /** How many an OK sends in their batch (the record's count), where it is known. */
  batch?: number;
  pile: SheetPileFacts | null;
}

/** The Sequence line's steps: which lens, the sequence it draws, its rows, and each email's words for this lead. */
export interface SheetRail {
  lens: "one" | "preview";
  sequence: { id: string; name: string; state: SequenceState };
  vm: PlaceRailVM;
  /** Each email of the sequence for this lead, by its place: what a step opened shows. */
  steps: ReadonlyMap<number, LeadCardStepVM>;
}

/** The email the card carries: who it goes to, its words in parts, and what its opening says. */
export interface SheetMail {
  to: string;
  subject: readonly LeadCardPart[] | null;
  body: readonly LeadCardPart[];
  /** What the check refused marked in its opening, where it is read before it goes. */
  opening: MarkedOpening | null;
  /** Its opening is still being written. */
  writing: boolean;
  /** Rewrite the opening stands under it: an email waiting for an OK, its opening written. */
  rewrite: boolean;
  /** Held: what it was held for stays in sight, whatever the width. */
  tall: boolean;
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
  /** Only what to press; null when nothing needs you, and the sheet draws no foot. */
  dock: LeadSheetDockVM | null;
  rail: SheetRail | null;
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
  leadId: string,
): Map<number, LeadCardStepVM> {
  const lead = leadCardLeadOf(leadId);
  const out = new Map<number, LeadCardStepVM>();
  if (!chain || !lead) return out;
  for (const s of leadCardStepsOf({ chain, lead, workspace: leadCardWorkspace() })) {
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
  if (place) {
    const rec = railRecordOf(i, place.sequence.id);
    if (!rec) return null;
    const steps = stepsByPlace(rec.chain ?? null, rec.steps, i.vm.id);
    return {
      lens: "one",
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
  const steps = stepsByPlace(rec.chain ?? pick.chain, recSteps, i.vm.id);
  return {
    lens: "preview",
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
  const card = leadCardFor(i.vm.id, pick ? pick.chain : null, i.tz, check);
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

/** The first email they would get from the pick. */
function firstMailOf(vm: LeadPeekVM, card: LeadCardFacts): SheetMail | null {
  const email = card.email;
  if (!email) return null;
  return {
    to: W.mail.ifAdded(email.to ?? vm.reach.email.value),
    subject: email.subject,
    body: email.body,
    opening: null,
    writing: false,
    rewrite: false,
    tall: false,
  };
}

/** The email their step holds, its opening as it goes: read before an OK, or marked where the check refused it. */
function stepMailOf(vm: LeadPeekVM, place: SequencePlaceDto, rail: SheetRail | null): SheetMail | null {
  const row = place.place;
  const step = rail ? rail.steps.get(row.place ?? 1) : null;
  if (!step) return null;
  const writing = row.checked === false;
  const held = row.group === "held";
  return {
    to: W.mail.to(addresseeOf(vm, vm.reach.email.value)),
    subject: step.subject,
    body: step.body,
    opening: markedOpeningOf(row.opening, { reason: row.why, detail: row.hold_detail }),
    writing,
    rewrite: !held && !writing && !!row.opening,
    tall: held,
  };
}

/** The email handed to you, as it reads. */
function draftMailOf(vm: LeadPeekVM, place: SequencePlaceDto): SheetMail | null {
  const draft = place.place.draft;
  if (!draft) return null;
  return {
    to: W.mail.to(addresseeOf(vm, draft.to)),
    subject: [{ kind: "text", text: draft.subject }],
    body: [{ kind: "text", text: draft.text }],
    opening: null,
    writing: false,
    rewrite: false,
    tall: false,
  };
}

/** The email the card says it carries. */
function mailOf(p: { now: LeadNowVM; i: SheetInputs; card: LeadCardFacts; rail: SheetRail | null }): SheetMail | null {
  const place = p.i.place.place;
  if (p.now.mail === "first") return firstMailOf(p.i.vm, p.card);
  if (p.now.mail === "step" && place) return stepMailOf(p.i.vm, place, p.rail);
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
  if (!i.place.read || i.railReading) return true;
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
  const dock = held
    ? null
    : leadDockOf({
        state: c.state,
        place,
        pick: pick ? { id: pick.rootId, name: pick.name, state: pick.row.state } : null,
        blocked: c.blocked,
        elsewhere,
        canCall: c.lead.canCall,
        canLater: !!(i.row && i.row.searchId),
        closed: c.closed,
        batch: i.batch,
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
    batch: i.batch ?? null,
    tz: i.tz,
    nowMs,
  });
  const history = leadHistoryOf({ vm: i.vm, place, tz: i.tz, nowMs });
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
    dock,
    rail,
  };
}
