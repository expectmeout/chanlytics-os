/**
 * What a press of the lead sheet does (contracts LeadSheetAct), through the doors that already exist and the sequence's
 * own verbs (the canvas's "one set of verbs": sequence_add, sequence_move, run, sequence_send_decide, sequence_leave,
 * through `pressed`, so a press here and one on the record say one receipt and keep one undo). In a pile its own acts
 * (use-pile.ts: its Undo, its line, the card turning); out of one the lead's own (peek/acts.tsx, the stage and the call)
 * or the add and Later doors said in a toast. A trip into Sequences carries the way back to this lead (contracts
 * sequenceRouteBack; trip.ts holds the names), and Take out is the sequence's own leave, whose undo is Put back.
 */
import {
  addressOf,
  routeOfPath,
  sequenceRoute,
  sequenceRouteBack,
  type LeadRowVM,
  type LeadSheetAct,
  type SequencePlaceDto,
  type SequenceTab,
} from "@chanlytics/contracts";
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
  /** The dock's own asks: an email to send, and They wrote back…. */
  askToSend: () => void;
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
          () => void r.pile?.undo(),
        ),
      );
    return;
  }
  const res = await setLeadStage(r.leadId, { kind: "not_a_fit", why: "other" });
  if (!res.ok) return r.flash(refusalToast(res, "That did not go through"));
  const { op_id: op, version } = res.data;
  r.flash(
    notFitToast(
      r.name,
      (why) => void setLeadStage(r.leadId, { kind: "not_a_fit", why }),
      op ? () => void undoLeadOperation(op, version).then(r.moved) : null,
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
export async function runSheetAct(act: LeadSheetAct, r: SheetRun): Promise<void> {
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
    case "open_draft":
      return r.askToSend();
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
