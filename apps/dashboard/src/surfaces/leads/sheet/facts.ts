/**
 * What the lead sheet draws, worked out once a draw from what the page and its reads hand it (sheet.tsx): the quick look
 * (the verdict, the reason, the checks line, the email line), the head's word, the dock, and the Sequence section's rail:
 * their place in the sequence they are in (the one reader, 00459 sequence_place), or before one, the pick's steps as they
 * would get them. Every rule is contracts' (lead-sheet.ts, lead-sheet-dock.ts, lead-sheet-card.ts, sequence-place.ts,
 * lead-card.ts); this only gathers their inputs from the reads.
 */
import {
  leadCardStepsOf,
  leadDockOf,
  leadSheetChecksLineOf,
  leadSheetClosedOf,
  leadSheetEmailLineOf,
  leadSheetStateOf,
  leadSheetSubOf,
  leadSheetWhyOf,
  leadSheetWordOf,
  leadVerdictOf,
  placeRailOf,
  placeStands,
  type LeadCardCheck,
  type LeadCardStepVM,
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
  type PlaceRailVM,
  type PlaceTone,
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
  /** Their place (GET leads/:id/place), and whether it has been read: none is told apart from not yet. */
  place: { read: boolean; place: SequencePlaceDto | null };
  /**
   * The record of the sequence the rail draws (its steps and words): the one their place stands in, else the pick's. Null
   * while it is read.
   */
  railRecord: SequenceRecordDto | null;
  /** How many others wait for an OK in their batch (the record's people), where it is known. */
  batchOthers?: number;
  pile: SheetPileFacts | null;
}

/** The Sequence section's rail: which lens, the sequence it draws, its rows, and each email's words for this lead. */
export interface SheetRail {
  lens: "one" | "preview";
  sequence: { id: string; name: string; state: SequenceState };
  vm: PlaceRailVM;
  /** Each email of the sequence for this lead, by its place: what a step opened shows. */
  steps: ReadonlyMap<number, LeadCardStepVM>;
}

export interface SheetFacts {
  card: LeadCardFacts;
  check: LeadCardCheck | undefined;
  state: LeadSheetState;
  closed: LeadSheetClosedVM | null;
  verdict: LeadVerdictVM;
  /** The line under the name, the checks line, the email line, and Fit's checks. */
  sub: string;
  checks: LeadSheetChecksLineVM | null;
  email: LeadSheetEmailLineVM;
  why: LeadSheetWhyVM | null;
  /** The word beside their name, and its tone. */
  word: { word: string; tone: PlaceTone };
  place: SequencePlaceDto | null;
  /** The sequence that has them, where it is not the pick. */
  elsewhere: { id: string | null; name: string; written: boolean } | null;
  /** Only what to press; null when nothing needs you. */
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
 * The Sequence section's rail: their place, drawn on the record's rail for one lead, where a sequence has them; else, with
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

/** The sheet's facts, from the page's reads. */
export function sheetFactsOf(i: SheetInputs, nowMs: number): SheetFacts {
  const c = cardStateOf(i);
  const pick = i.aim.target;
  const place = i.place.place;
  const elsewhere = elsewhereOf(i, c.check);
  // Still reading: their place, or the sequences Add could go to, for a lead not closed. Nothing is offered the reads
  // could take back.
  const reading = !i.place.read || (i.aim.targets === null && !place && c.state !== "closed");
  const dock = leadDockOf({
    state: c.state,
    place,
    pick: pick ? { id: pick.rootId, name: pick.name, state: pick.row.state } : null,
    blocked: c.blocked,
    elsewhere,
    canCall: c.lead.canCall,
    canLater: !!(i.row && i.row.searchId),
    closed: c.closed,
    reading,
    batchOthers: i.batchOthers,
    tz: i.tz,
    nowMs,
  });
  return {
    card: c.card,
    check: c.check,
    state: c.state,
    closed: c.closed,
    verdict: leadVerdictOf(i.vm),
    sub: leadSheetSubOf(i.vm),
    checks: leadSheetChecksLineOf(i.vm),
    email: leadSheetEmailLineOf(i.vm),
    why: leadSheetWhyOf(i.vm),
    word: leadSheetWordOf({ state: c.state, place, closed: c.closed }),
    place,
    elsewhere,
    dock,
    rail: railOf(i, c.state, nowMs),
  };
}
