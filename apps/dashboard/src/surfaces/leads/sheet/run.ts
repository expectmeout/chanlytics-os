/**
 * What a press of the lead sheet does (contracts LeadSheetAct), through the doors that already exist and the sequence's
 * own verbs (the canvas's "one set of verbs": sequence_add, sequence_move, run, sequence_send_decide, sequence_leave,
 * through `pressed`, so a press here and one on the record say one receipt and keep one undo). In a pile its own acts
 * (use-pile.ts: its Undo, its line, the card turning); out of one the lead's own (peek/acts.tsx, the stage and the call)
 * or the add and Later doors said in a toast. A trip into Sequences carries the way back to this lead (contracts
 * sequenceRouteBack; trip.ts holds the names), and Take out is the sequence's own leave, whose undo is Put back, which a
 * lead who left has on the sheet too, for as long as its place can come back.
 */
import {
  addressOf,
  routeOfPath,
  sequenceRoute,
  sequenceRouteBack,
  type HoldDoor,
  type LeadNotAFitWhy,
  type LeadRowVM,
  type LeadSheetSlotVM,
  type SequencePlaceDto,
  type SequenceTab,
} from "@chanlytics/contracts";
import { undoVerb } from "@/legacy-bridge/verbs/commit";
import { holdTrip } from "../../campaigns/sequences/trip";
import { pressed } from "../../campaigns/sequences/verbs";
import { navigate, refusalToast } from "../../legacy-verbs";
import type { Flash, PeekActs } from "../peek/types";
import type { LeadPile } from "../pile/use-pile";
import { laterLead, setLeadStage, undoLeadOperation } from "../surface";
import { notFitToast } from "./not-fit";
import type { LeadAim } from "./use-aim";

/** What a press reads: the lead, the acts and the pile, where its adds go, and where it stands. */
export interface SheetRun {
  row: LeadRowVM | null;
  leadId: string;
  name: string;
  contactId: string | null;
  on: PeekActs | null;
  pile: LeadPile | null;
  aim: LeadAim;
  flash: Flash;
  place: SequencePlaceDto | null;
  /** The sequence that has them, where it is not the pick. */
  elsewhere: { id: string | null; name: string } | null;
  /** The page's walk to the next row, out of a pile. */
  next: (() => void) | null;
  /** The picker, a step of the same sheet. */
  openPicker: () => void;
  /** The dock's own ask: They wrote back…. */
  askSaid: () => void;
  /** Said once their place moved: read it again. */
  moved: () => void;
  /** The sheet is over another page (a record): its record is that page, and its adds have no pile. */
  over: boolean;
}

/**
 * Into Sequences and back (every trip comes back): the names the address does not carry, held for the tab, and the
 * Leads address on screen now (this lead open, its search, its view) as the way back. The record opens at Leads, their
 * row lit (trip.ts).
 */
export function openRecordFor(
  r: Pick<SheetRun, "leadId" | "name" | "row">,
  sequenceId: string,
  tab: SequenceTab = "people",
): void {
  holdTrip({
    leadId: r.leadId,
    leadName: r.name,
    listId: r.row ? r.row.searchId : null,
    listName: r.row ? r.row.searchName || null : null,
  });
  navigate(sequenceRouteBack(sequenceRoute(sequenceId, tab), routeOfPath(window.location.pathname)));
}

/** Take out of the sequence their place stands in: the leave verb (by their place, or off its list), Put back its undo. */
export async function takeOut(r: Pick<SheetRun, "leadId" | "name" | "place" | "flash" | "moved">): Promise<void> {
  const place = r.place;
  if (!place) return;
  const enrollment = place.place.enrollment_id;
  await pressed(
    "sequence_leave",
    {
      sequence_id: place.sequence.id,
      enrollment_ids: enrollment ? [enrollment] : [],
      lead_ids: enrollment ? [] : [r.leadId],
      name: r.name,
    },
    r.flash,
    r.moved,
  );
}

/** Add to the pick out of a pile: the sequence's add verb, its receipt (a draft says so) and its undo. */
async function addOne(r: SheetRun) {
  const to = r.aim.target;
  if (!to) return r.openPicker();
  await pressed(
    "sequence_add",
    { sequence_id: to.rootId, lead_ids: [r.leadId], name: to.name, lead_name: r.name, draft: to.row.state === "draft" },
    r.flash,
    () => {
      r.aim.reset();
      r.moved();
    },
  );
}

/** Move to the pick: out of the sequence that has them, into the pick, while nothing was sent to them. */
async function moveOne(r: SheetRun) {
  const to = r.aim.target;
  if (!to) return;
  await pressed(
    "sequence_move",
    { sequence_id: to.rootId, lead_id: r.leadId, name: to.name, lead_name: r.name },
    r.flash,
    () => {
      r.aim.reset();
      r.moved();
    },
  );
}

/** Later out of a pile: its search's door, and what it said. */
async function laterOne(r: SheetRun) {
  const searchId = r.row ? r.row.searchId : null;
  if (!searchId) return;
  const res = await laterLead(searchId, r.leadId);
  if (!res.ok) return r.flash(refusalToast(res, "That did not go through"));
  r.flash({ msg: `${r.name} is for later` });
}

/**
 * Not a fit, at once (the canvas: one tap, the reason after): the stage door with no reason given, and a toast that asks
 * why (optional) beside Undo. In a pile the pile's own act, which moves to the next.
 */
async function notFitOne(r: SheetRun) {
  if (r.pile && r.pile.on && r.row) {
    const row = r.row;
    const done = await r.pile.act(row, "not_a_fit", "other");
    if (done)
      r.flash(
        notFitToast(
          r.name,
          (why) => void r.pile?.notFitWhy(row, why),
          () => r.pile?.undoNotFit(row),
        ),
      );
    return;
  }
  const res = await setLeadStage(r.leadId, { kind: "not_a_fit", why: "other" });
  if (!res.ok) return r.flash(refusalToast(res, "That did not go through"));
  // The act Undo takes back: the tap's, then the reason's. A reason is the tap taken back and made again with it, as the
  // pile's is (use-pile.ts giveWhy): written over the tap, it moved the lead's version, and the tap's Undo was refused as
  // changed, the lead left set aside (the nightly, 25 Oct 2026). Undo waits for a reason on its way: pressed before the
  // reason's answer it named the tap, already taken back, and was refused with the lead still aside (1 Nov 2026).
  let last: { op: string | null; version: number } = { op: res.data.op_id, version: res.data.version };
  let giving: Promise<void> | null = null;
  const giveWhy = async (why: LeadNotAFitWhy) => {
    if (last.op) {
      const u = await undoLeadOperation(last.op, last.version);
      if (!u.ok) return r.flash(refusalToast(u, "The reason was not kept"));
      last = { ...last, op: null };
    }
    const again = await setLeadStage(r.leadId, { kind: "not_a_fit", why });
    if (!again.ok) return r.flash(refusalToast(again, "The reason was not kept"));
    last = { op: again.data.op_id, version: again.data.version };
    r.moved();
  };
  const undo = async () => {
    await giving;
    if (!last.op) return;
    const u = await undoLeadOperation(last.op, last.version);
    if (!u.ok) r.flash(refusalToast(u, "Nothing was put back"));
    r.moved();
  };
  r.flash(
    notFitToast(
      r.name,
      (why) => {
        giving = giveWhy(why);
      },
      last.op ? undo : null,
    ),
  );
  r.moved();
}

/** A decision on the lead: the pile's act in a pile, else the lead's own door. */
async function decide(act: "later" | "add" | "keep" | "exclude", r: SheetRun) {
  if (r.pile && r.pile.on && r.row) {
    if (act === "add" && !r.aim.target) return r.openPicker();
    return void (await r.pile.act(r.row, act));
  }
  if (act === "later") return laterOne(r);
  if (act === "add") return addOne(r);
  if (!r.on) return;
  return act === "keep" ? r.on.onKeep(r.leadId) : r.on.onExclude(r.leadId);
}

/** Approve the batch their step waits in, in place: the run's own verb, as the record's dock presses it. */
async function approveOne(r: SheetRun) {
  const place = r.place;
  if (!place || !place.place.batch_id) return;
  await pressed(
    "run",
    { broadcast_id: place.place.batch_id, verb: "approve", name: place.sequence.name },
    r.flash,
    r.moved,
  );
}

/** An answer to their email: the decide verb a held email's row and the record press, its door named. */
export async function decideEmail(r: SheetRun, door: HoldDoor): Promise<void> {
  const row = r.place ? r.place.place : null;
  if (!row || !row.send_id) return;
  await pressed(
    "sequence_send_decide",
    { send_id: row.send_id, decision: door, name: r.name, run_id: row.batch_id },
    r.flash,
    r.moved,
  );
}

/** Put back: the undo of the leave that took them out, with its receipt (Take out's own). */
async function returnOne(r: SheetRun) {
  const leave = r.place ? r.place.put_back : null;
  if (!leave || !r.place) return;
  const done = await undoVerb("sequence_leave", { sequence_id: r.place.sequence.id, decision_id: leave.decision_id });
  r.flash(done.ok ? { tone: "ok", msg: done.receipt } : refusalToast(done));
  r.moved();
}

/** Where a press goes that opens something: the sequence's record, the thread they wrote in, or the person. */
function openAct(act: "sequence" | "thread", r: SheetRun) {
  if (act === "sequence") {
    const id = r.elsewhere ? r.elsewhere.id : r.place ? r.place.sequence.id : null;
    if (id) openRecordFor(r, id);
    return;
  }
  const conversation = r.place && r.place.place.reply ? r.place.place.reply.conversation_id : null;
  if (conversation) return navigate(addressOf({ kind: "conversation", id: conversation }));
  if (r.contactId && r.on) r.on.onOpenPerson(r.contactId);
}

/** A press of the dock. */
export async function runSheetAct(s: Pick<LeadSheetSlotVM, "act" | "door">, r: SheetRun): Promise<void> {
  const { act } = s;
  switch (act) {
    case "not_a_fit":
      return notFitOne(r);
    case "later":
    case "add":
    case "keep":
    case "exclude":
      return void (await decide(act, r));
    case "pick":
      return r.openPicker();
    case "move":
      return moveOne(r);
    case "next":
      return r.pile && r.pile.on && r.row ? r.pile.skip(r.row) : r.next ? r.next() : undefined;
    case "sequence":
    case "thread":
      return openAct(act, r);
    case "approve":
      return approveOne(r);
    case "decide":
      return s.door ? decideEmail(r, s.door) : undefined;
    case "take_out":
      return takeOut(r);
    case "return":
      return returnOne(r);
    case "they_wrote":
      return r.askSaid();
    case "call":
      return r.on ? r.on.onCall(r.leadId) : undefined;
    case "put_back":
      return void (r.on ? await r.on.onPutBack(r.leadId) : undefined);
    case "ready":
      return void (r.on ? await r.on.onStage("ready") : undefined);
  }
}
