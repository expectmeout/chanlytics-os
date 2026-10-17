/**
 * What a press of the lead sheet's rail does (contracts LeadSheetAct), through the doors that already exist. In a pile
 * the pile's own acts (use-pile.ts: its Undo, its line, the card turning); out of one the lead's own: the peek's acts
 * (peek/acts.tsx: Not a fit's reasons, Keep, Leave out, Put back, the stage, the call, the draft), or the add and Later
 * doors said in a toast, and Next the page's own walk to the next row. Nothing here writes a sentence of its own.
 */
import {
  LEAD_PILE_SAID,
  sequenceRoute,
  type LeadCardCheck,
  type LeadRowVM,
  type LeadSheetAct,
  type LeadSheetTrackVM,
  type ReachOutAddDto,
} from "@chanlytics/contracts";
import { reachOuts } from "../../campaigns/reach-out/surface";
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
  if (to) navigate(sequenceRoute(to.rootId, "people"));
}

/** Where a press goes that opens something: a sequence, the thread they wrote in, or the person they became. */
function openAct(act: "sequence" | "thread", r: SheetRun) {
  if (act === "sequence") {
    const root = sequenceOf(r);
    if (root) navigate(sequenceRoute(root, "people"));
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
      return openAct(act, r);
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

/** The acts the lead's own panel always had: Not a fit's reasons, the call, the draft, Put back, back to Ready. */
function lookAct(act: LeadSheetAct, r: SheetRun) {
  const on = r.on;
  if (!on) return;
  if (act === "not_a_fit") return on.onNotAFit();
  if (act === "call") return on.onCall(r.leadId);
  if (act === "draft") return void on.onDraft(r.leadId);
  if (act === "put_back") return void on.onPutBack(r.leadId);
  if (act === "ready") return void on.onStage("ready");
}
