/**
 * What the lead sheet draws, worked out once a draw from what the page hands it (sheet.tsx): the lead's card (its
 * reason, marks and email, pile/card.tsx), its state and what stopped, the fit, the reach cells, the rail, its steps in
 * a sequence, what it wrote back, where it stands, and Change's options. Every rule is contracts' (lead-sheet.ts,
 * lead-card.ts); this only gathers their inputs from the page's reads.
 */
import {
  leadSheetCellsOf,
  leadSheetClosedOf,
  leadSheetEndRailOf,
  leadSheetFitOf,
  leadSheetOptionsOf,
  leadSheetRailOf,
  leadSheetReplyOf,
  leadSheetStandOf,
  leadSheetStateOf,
  leadSheetStoryOf,
  leadSheetTrackOf,
  type LeadCardCheck,
  type LeadPeekVM,
  type LeadRowVM,
  type LeadSheetCellVM,
  type LeadSheetClosedVM,
  type LeadSheetFitVM,
  type LeadSheetLead,
  type LeadSheetOptionVM,
  type LeadSheetRailVM,
  type LeadSheetState,
  type LeadSheetTrackVM,
  type ReachOutChainDto,
  type ReachOutLeadTimelineDto,
} from "@chanlytics/contracts";
import { leadCardFor, leadCardLeadOf, leadCardWorkspace, type LeadCardFacts } from "../pile/card";
import { leadDtoFor } from "../surface";
import type { LeadAim } from "./use-aim";

/** A pile's own: what kind of pile it is, and its end's numbers. */
export interface SheetPileFacts {
  mode: "list" | "first" | "search";
  later: number;
  held: number;
}

/** What the sheet is handed to work its facts out from. */
interface SheetInputs {
  row: LeadRowVM | null;
  vm: LeadPeekVM;
  tz: string;
  aim: LeadAim;
  story: ReachOutLeadTimelineDto | null;
  /** The open search's own sequence, where it writes to every ready lead it finds. */
  searchWrites: { rootId: string; name: string; chain: ReachOutChainDto | null } | null;
  pile: SheetPileFacts | null;
  monthLeft: number | null;
}

export interface SheetFacts {
  card: LeadCardFacts;
  check: LeadCardCheck | undefined;
  state: LeadSheetState;
  closed: LeadSheetClosedVM | null;
  fit: LeadSheetFitVM;
  cells: LeadSheetCellVM[];
  rail: LeadSheetRailVM;
  track: LeadSheetTrackVM | null;
  reply: string | null;
  stand: { title: string; line: string };
  options: LeadSheetOptionVM[];
  /** Email 1's head: the sequence's name, what follows it, and whether Change opens here. */
  mail: { head: string; sub: string; canChange: boolean } | null;
}

/** The lead as the state reads it: its class, stage and address, a number to call, and a sequence it is in. */
function sheetLeadOf(i: SheetInputs): LeadSheetLead {
  const story = i.story;
  const inStory = !!(story && story.chain && !story.stopped_at && story.closed_reason !== "said_no");
  return {
    cls: i.vm.cls,
    stage: i.vm.stage,
    emailState: i.vm.reach.email.state,
    hasEmail: !!i.vm.reach.email.address,
    canCall: !!(i.vm.reach.phone && i.vm.reach.phone.tel),
    inSequence: !!(i.row && i.row.chainId) || inStory,
  };
}

/** Email 1's head: whose it is, and "· email 1" (where it leaves from is the Emails tab's). */
function mailOf(card: LeadCardFacts, name: string | null, canChange: boolean): SheetFacts["mail"] {
  if (!card.email || !name) return null;
  return { head: name, sub: "· email 1", canChange };
}

/** The card, the door's answer and the lead's state: what the rest of the facts are read from. */
function cardStateOf(i: SheetInputs) {
  const target = i.aim.target;
  const writes = i.searchWrites;
  // The email shown is the one the lead would get: the search's own sequence where it writes to every lead, else the
  // sequence the adds go to.
  const chain = writes && writes.chain ? writes.chain : target ? target.chain : null;
  // By the lead's id: a lead opened whose row the table no longer shows (a filter, a link) is still the whole card.
  const check = target && !writes ? i.aim.checkOf(i.vm.id) : undefined;
  const card = leadCardFor(i.vm.id, chain, i.tz, check);
  const lead = sheetLeadOf(i);
  const state = leadSheetStateOf({ lead, check, email: card.email, story: leadSheetStoryOf(i.story) });
  const blocked = card.email ? card.email.blocked : null;
  const dto = leadDtoFor(i.vm.id);
  const closed =
    state === "closed"
      ? leadSheetClosedOf({ lead, closedReason: dto ? (dto.closed_reason ?? null) : null, blocked })
      : null;
  return { card, check, lead, state, blocked, closed };
}

/** The rail for the lead's state, in its pile or out of one. */
function sheetRailFor(i: SheetInputs, c: ReturnType<typeof cardStateOf>): LeadSheetRailVM {
  const target = i.aim.target;
  return leadSheetRailOf({
    state: c.state,
    pile: i.searchWrites ? "search" : i.pile ? i.pile.mode : null,
    target: target ? target.name : null,
    blocked: c.blocked,
    canCall: c.lead.canCall,
    canDraft: i.vm.reach.email.canDraft,
    canLater: !!(i.row && i.row.searchId),
    closed: c.closed,
    monthLeft: i.monthLeft,
  });
}

/** Change's options: each sequence fed by a list, with what its first email would come to for this lead. */
const sheetOptionsFor = (i: SheetInputs, nowMs: number): LeadSheetOptionVM[] =>
  leadSheetOptionsOf({
    chains: (i.aim.targets ?? []).map((t) => t.chain),
    picked: i.aim.target ? i.aim.target.rootId : null,
    lead: leadCardLeadOf(i.vm.id),
    workspace: leadCardWorkspace(),
    nowMs,
    tz: i.tz,
  });

/** The sheet's facts, from the page's reads. */
export function sheetFactsOf(i: SheetInputs, nowMs: number): SheetFacts {
  const c = cardStateOf(i);
  const target = i.aim.target;
  const writes = i.searchWrites;
  const track = c.lead.inSequence && i.story ? leadSheetTrackOf(i.story, nowMs, i.tz) : null;
  const canChange = !writes && (!i.pile || i.pile.mode === "list") && (i.aim.targets ?? []).length > 0;
  return {
    card: c.card,
    check: c.check,
    state: c.state,
    closed: c.closed,
    fit: leadSheetFitOf(i.vm, c.state),
    cells: leadSheetCellsOf(i.vm),
    rail: sheetRailFor(i, c),
    track,
    reply: leadSheetReplyOf(i.story),
    stand: leadSheetStandOf({
      track,
      state: c.state,
      target: target ? target.name : null,
      searchWrites: writes ? writes.name : null,
      closed: c.closed,
    }),
    options: sheetOptionsFor(i, nowMs),
    mail: mailOf(c.card, writes ? writes.name : target ? target.name : null, canChange),
  };
}

/** The rail at a pile's end. */
export const endRailOf = (pile: SheetPileFacts, target: string | null): LeadSheetRailVM =>
  leadSheetEndRailOf({ later: pile.later, held: pile.held, target });
