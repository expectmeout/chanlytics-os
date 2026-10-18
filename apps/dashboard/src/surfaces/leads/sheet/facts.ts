/**
 * What the lead sheet draws, worked out once a draw from what the page hands it (sheet.tsx): the lead's card (its
 * reason and email, pile/card.tsx), its state and what stopped, the line under its name, its checks and ways-in lines
 * and Why's checks (lead-sheet-card.ts), its steps in a sequence
 * and its place there, the word beside its name, the sequence box, the dock, what it wrote back, where it stands, and
 * Change's options. Every rule is contracts' (lead-sheet.ts, lead-sheet-dock.ts, lead-card.ts); this only gathers their
 * inputs from the page's reads.
 */
import {
  leadSheetBoxOf,
  leadSheetChecksLineOf,
  leadSheetClosedOf,
  leadSheetContactLineOf,
  leadSheetDockOf,
  leadSheetEndRailOf,
  leadSheetOptionsOf,
  leadSheetPlaceOf,
  leadSheetReplyOf,
  leadSheetStandOf,
  leadSheetStateOf,
  leadSheetStoryOf,
  leadSheetSubOf,
  leadSheetTrackOf,
  leadSheetWhyOf,
  leadSheetWordOf,
  type LeadCardCheck,
  type LeadCardPart,
  type LeadPeekVM,
  type LeadRowVM,
  type LeadSheetChecksLineVM,
  type LeadSheetClosedVM,
  type LeadSheetContactLineVM,
  type LeadSheetLead,
  type LeadPlaceVM,
  type LeadSheetBoxVM,
  type LeadSheetDockVM,
  type LeadSheetOptionVM,
  type LeadSheetRailVM,
  type LeadSheetState,
  type LeadWordTone,
  type LeadSheetTrackVM,
  type LeadSheetWhyVM,
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
  /** Whether this lead's story has been read (none is told apart from not yet). */
  storyRead: boolean;
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
  /** The line under the name, the card's checks and ways-in lines, and Why's checks. */
  sub: { desk: string; phone: string };
  checks: LeadSheetChecksLineVM | null;
  contact: LeadSheetContactLineVM;
  why: LeadSheetWhyVM | null;
  /** Their place in the sequence they are in, and the word beside their name. */
  place: LeadPlaceVM | null;
  word: { word: string; tone: LeadWordTone };
  /** The sequence box on the card: the door to the record, and Change. */
  box: LeadSheetBoxVM;
  /** Only what needs you; null when nothing does. */
  dock: LeadSheetDockVM | null;
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

/** Step 1's subject as this lead would get it, where every part of it fills: words and values alone. */
const subjectOf = (parts: LeadCardPart[] | null | undefined): string | null =>
  parts && parts.length && parts.every((p) => p.kind === "text" || p.kind === "value")
    ? parts
        .map((p) => (p.kind === "text" || p.kind === "value" ? p.text : ""))
        .join("")
        .trim() || null
    : null;

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

/** Their newest reading that asks for an answer, for the dock's line: what it was read as, and when. */
const replyOf = (story: ReachOutLeadTimelineDto | null) => {
  const r = story
    ? [...story.readings].reverse().find((x) => !x.undone && (x.claim === "person" || x.claim === "owner"))
    : null;
  return r ? { intent: r.intent, readAt: r.read_at } : null;
};

/**
 * Still reading: a lead the row says a sequence has whose story has not come back, or a lead to add before the sequences
 * the adds could go to are known. The box and the dock say so, never a place the reads would take back.
 */
const stillReadingOf = (i: SheetInputs, c: ReturnType<typeof cardStateOf>): boolean =>
  (!i.storyRead && !!(i.row && i.row.chainId)) ||
  (i.aim.targets === null && !i.searchWrites && !c.lead.inSequence && c.state !== "closed");

/** The dock for the lead's state and place, in its pile or out of one. */
function sheetDockFor(
  i: SheetInputs,
  c: ReturnType<typeof cardStateOf>,
  place: LeadPlaceVM | null,
  nowMs: number,
): LeadSheetDockVM | null {
  const target = i.aim.target;
  return leadSheetDockOf({
    state: c.state,
    place,
    pile: i.searchWrites ? "search" : i.pile ? i.pile.mode : null,
    target: target ? target.name : null,
    blocked: c.blocked,
    canCall: c.lead.canCall,
    canLater: !!(i.row && i.row.searchId),
    closed: c.closed,
    reply: replyOf(i.story),
    reading: stillReadingOf(i, c),
    tz: i.tz,
    nowMs,
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
  const place = track ? leadSheetPlaceOf(i.story, nowMs, i.tz) : null;
  const canChange = !writes && (!i.pile || i.pile.mode === "list") && (i.aim.targets ?? []).length > 0;
  const box = leadSheetBoxOf({
    state: c.state,
    place,
    inSequence: track ? { rootId: track.rootId, name: track.name } : null,
    elsewhere: c.check && c.check.chain_name ? { rootId: c.check.chain_id ?? null, name: c.check.chain_name } : null,
    target: target ? { rootId: target.rootId, name: target.name } : null,
    firstSubject: c.card.email ? subjectOf(c.card.email.subject) : null,
    searchWrites: writes ? { rootId: writes.rootId, name: writes.name } : null,
    canChange,
    closed: c.closed,
    reading: stillReadingOf(i, c),
  });
  return {
    card: c.card,
    check: c.check,
    state: c.state,
    closed: c.closed,
    sub: { desk: leadSheetSubOf(i.vm), phone: leadSheetSubOf(i.vm, true) },
    checks: leadSheetChecksLineOf(i.vm),
    contact: leadSheetContactLineOf(i.vm),
    why: leadSheetWhyOf(i.vm),
    place,
    word: leadSheetWordOf({ state: c.state, place, closed: c.closed }),
    box,
    dock: sheetDockFor(i, c, place, nowMs),
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
