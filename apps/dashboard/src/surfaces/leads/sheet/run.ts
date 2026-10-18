/**
 * What a press of the lead sheet's dock does (contracts LeadSheetAct), through the doors that already exist. In a pile
 * the pile's own acts (use-pile.ts: its Undo, its line, the card turning); out of one the lead's own: the peek's acts
 * (peek/acts.tsx: Not a fit's reasons, Keep, Leave out, Put back, the stage, the call, the draft), or the add and Later
 * doors said in a toast, and Next the page's own walk to the next row. A trip into Sequences (the record, Approve, a new
 * sequence, a version) carries the way back to this lead (contracts sequenceRouteBack; trip.ts holds the names), and
 * Take out is the sequence's own leave verb, whose undo is Put back. Nothing here writes a sentence of its own.
 */
import {
  LEAD_PILE_SAID,
  TO_SEND_ROUTE,
  routeOfPath,
  runSheetRoute,
  sequenceNewLeadsRoute,
  sequenceRoute,
  sequenceRouteBack,
  type LeadCardCheck,
  type LeadPlaceVM,
  type LeadRowVM,
  type LeadSheetAct,
  type LeadSheetTrackVM,
  type ReachOutAddDto,
} from "@chanlytics/contracts";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { holdTrip } from "../../campaigns/sequences/trip";
import { pressed } from "../../campaigns/sequences/verbs";
import { navigate, refusalToast } from "../../legacy-verbs";
import type { Flash, PeekActs } from "../peek/types";
import type { LeadPile } from "../pile/use-pile";
import { laterLead } from "../surface";
import type { LeadAim } from "./use-aim";

/** What a press reads: the lead, the acts and the pile, where its adds go, and where it stands with a sequence. */
interface SheetRun {
  row: LeadRowVM | null;
  leadId: string;
  name: string;
  contactId: string | null;
  on: PeekActs | null;
  pile: LeadPile | null;
  aim: LeadAim;
  flash: Flash;
  track: LeadSheetTrackVM | null;
  /** Their place in the sequence they are in: the batch a draft waits in. */
  place: LeadPlaceVM | null;
  /** The list the open search is, whose own sequence a new one for this list would be. */
  listId: string | null;
  check: LeadCardCheck | undefined;
  searchWrites: { rootId: string; name: string } | null;
  /** Where what went out to them, and what they wrote back, is read: their thread (the story's own door). */
  threadTo: string | null;
  /** The page's walk to the next row, out of a pile. */
  next: (() => void) | null;
  /** Stop writing asks first: the sheet's own question. */
  askStop: () => void;
  /** The pile's end: the leads held for a new list, written to. */
  writeHeld: (ids: string[]) => void;
  /** Decide opens the held email's choices in the dock's place: the sheet's own. */
  askDecide: () => void;
  /** Said once the sheet's story moved (a Take out): read it again. */
  moved: () => void;
}

/**
 * Into Sequences and back (every trip comes back): the names the address does not carry, held for the tab, and the
 * Leads address on screen now (this lead open, its search, its view) as the way back.
 */
function trip(route: string, r: SheetRun): void {
  holdTrip({
    leadId: r.leadId,
    leadName: r.name,
    listId: r.row ? r.row.searchId : null,
    listName: r.row ? r.row.searchName || null : null,
  });
  navigate(sequenceRouteBack(route, routeOfPath(window.location.pathname)));
}

/** A sequence's record, with the way back to this lead. */
export const openRecord = (rootId: string, r: Pick<SheetRun, "leadId" | "name" | "row">): void =>
  trip(sequenceRoute(rootId), r as SheetRun);

/** A new sequence for this lead: on the open list where it has none yet, else on a list of the lead's own. */
export function newSequenceFor(r: Pick<SheetRun, "leadId" | "name" | "row" | "listId">, version: string | null): void {
  const forList = !version && r.listId ? { list: r.listId } : { lead: r.leadId };
  trip(sequenceNewLeadsRoute({ for: forList, version }), r as SheetRun);
}

/** Take out of the sequence they are in, by their id: the leave verb, its receipt, and Put back its undo. */
export async function takeOut(r: Pick<SheetRun, "leadId" | "name" | "track" | "flash" | "moved">): Promise<void> {
  if (!r.track) return;
  await pressed(
    "sequence_leave",
    { sequence_id: r.track.rootId, lead_ids: [r.leadId], name: r.name },
    r.flash,
    r.moved,
  );
}

/** An add out of a pile: the door, and what it said, in a toast. */
async function addOne(r: SheetRun) {
  const to = r.aim.target;
  if (!to) return;
  const res = await reachOuts.addLeads(to.rootId, [r.leadId]);
  if (!res.ok) return r.flash(refusalToast(res, "It could not be added"));
  const answer: ReachOutAddDto = res.data;
  const words = reachOuts.addWords(answer, to.name);
  r.flash(answer.added ? { msg: LEAD_PILE_SAID.add(r.name, to.name) } : { tone: "warn", msg: words.text });
  // Its answer for this lead has changed: on it now, so asked afresh.
  r.aim.reset();
}

/** Later out of a pile: its search's door, and what it said. */
async function laterOne(r: SheetRun) {
  const searchId = r.row ? r.row.searchId : null;
  if (!searchId) return;
  const res = await laterLead(searchId, r.leadId);
  if (!res.ok) return r.flash(refusalToast(res, "That did not go through"));
  r.flash({ msg: LEAD_PILE_SAID.later(r.name, null) });
}

/** The sequence a press opens: the one they are in, the other one that has them, or the search's own. */
const sequenceOf = (r: SheetRun): string | null =>
  r.track ? r.track.rootId : (r.check && r.check.chain_id) || (r.searchWrites ? r.searchWrites.rootId : null);

/** A decision on the lead: the pile's act in a pile, else the lead's own door. */
async function decide(act: "later" | "add" | "keep" | "exclude", r: SheetRun) {
  if (r.pile && r.pile.on && r.row) return r.pile.act(r.row, act);
  if (act === "later") return laterOne(r);
  if (act === "add") return addOne(r);
  if (!r.on) return;
  return act === "keep" ? r.on.onKeep(r.leadId) : r.on.onExclude(r.leadId);
}

/** The pile's end: the later ones, the way out, the held written to, the sequence opened. */
function endAct(act: LeadSheetAct, r: SheetRun) {
  const pile = r.pile;
  if (!pile) return;
  if (act === "later_again") return pile.setPass("later");
  if (act === "leave") return pile.stop();
  if (act === "write_held") return r.writeHeld(pile.held);
  const to = r.aim.target;
  pile.stop();
  if (to) trip(sequenceRoute(to.rootId), r);
}

/** Where a press goes that opens something: a sequence's record, the thread they wrote in, or the person they became. */
function openAct(act: "sequence" | "thread" | "approve", r: SheetRun) {
  if (act === "sequence" || act === "approve") {
    const root = sequenceOf(r);
    if (root) trip(sequenceRoute(root), r);
    return;
  }
  if (r.threadTo) return navigate(r.threadTo);
  if (r.contactId && r.on) r.on.onOpenPerson(r.contactId);
}

/** A press of the rail. */
export async function runSheetAct(act: LeadSheetAct, r: SheetRun): Promise<void> {
  switch (act) {
    case "later":
    case "add":
    case "keep":
    case "exclude":
      return void (await decide(act, r));
    case "hold":
      return void (r.pile && r.row ? await r.pile.act(r.row, "hold") : undefined);
    case "next":
      return r.pile && r.pile.on && r.row ? r.pile.skip(r.row) : r.next ? r.next() : undefined;
    case "sequence":
    case "thread":
    case "approve":
      return openAct(act, r);
    case "decide":
      return r.askDecide();
    case "open_draft":
      return navigate(r.place && r.place.runId ? runSheetRoute(r.place.runId) : TO_SEND_ROUTE);
    case "new_sequence":
      return newSequenceFor(r, null);
    case "stop":
      return r.askStop();
    case "later_again":
    case "leave":
    case "write_held":
    case "open_target":
      return endAct(act, r);
    default:
      return lookAct(act, r);
  }
}

/**
 * Put back, or back to Ready: the add door answered for where the lead stood ("already worked"), so once the move lands
 * it is asked afresh, and the sheet never says a thing the move just undid.
 */
async function reopened(r: SheetRun, move: unknown) {
  await move;
  r.aim.reset();
  await r.aim.check([r.leadId]);
}

/** The acts the lead's own panel always had: Not a fit's reasons, the call, the draft, Put back, back to Ready. */
function lookAct(act: LeadSheetAct, r: SheetRun) {
  const on = r.on;
  if (!on) return;
  if (act === "not_a_fit") return on.onNotAFit();
  if (act === "call") return on.onCall(r.leadId);
  if (act === "draft") return void on.onDraft(r.leadId);
  if (act === "put_back") return void reopened(r, on.onPutBack(r.leadId));
  if (act === "ready") return void reopened(r, on.onStage("ready"));
}
