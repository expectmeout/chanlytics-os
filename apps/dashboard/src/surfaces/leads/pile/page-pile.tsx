/**
 * The pile on the Leads page (the lead workbench, 00426): whether it is on for the search the address names, the lead
 * that is up, what the lead sheet draws of it (its line, its mode, Add them all, its end), the door into it under the
 * search, the keys its one listener hands it, and, on a desk, the sheet following the lead that is up. The lead itself
 * is the lead sheet's, as every lead opened on Leads is (sheet/sheet.tsx): the rows stay where they stand.
 *
 * The door is offered under a search whose leads no sequence of its own writes to (a search with one is written to as
 * its leads are found: there is nothing to decide but Not a fit, which the sheet offers too), and under any search's
 * Needs review, whose leads a Keep sends on; to a member who may act. A sequence's Add leads names where the adds go
 * (pileAsk): the door says so, and with no search open the page asks for one.
 *
 * While the pile is on, the add door is asked, dry, about the leads open in it (sheet/use-aim.ts), so each card says why
 * before Add is pressed, and a lead no email can go to has Call in Add's place.
 */
import { useEffect, useRef, useState } from "react";
import {
  LEAD_SHEET_WORDS,
  leadCardBulkOf,
  leadPileProgressOf,
  type LeadCardBulkVM,
  type LeadClass,
  type LeadRowVM,
  type LeadSearchDto,
} from "@chanlytics/contracts";
import { PILE_NEW_LIST, pileAsk, type PileAsk } from "../../campaigns/reach-out/surface";
import { canDo } from "../../legacy-verbs";
import type { SheetPileView } from "../sheet/sheet";
import { pressSheetKey, type SheetKey } from "../sheet/keys";
import type { LeadAim } from "../sheet/use-aim";
import type { LeadsSurface } from "../surface";
import { leadCardBulkLeadsOf, leadCardWorkspace } from "./card";
import { LeadPileAsk, LeadPileDoor } from "./door";
import { usePileUp, type LeadPile } from "./use-pile";

/** What the page's one listener hands the pile: a press of the rail by its key, Undo, and the way out. */
interface PileKeys {
  press: (key: SheetKey) => void;
  undo: () => void;
  leave: () => void;
}

const NO_ROWS: readonly LeadRowVM[] = [];

/** A sequence a pile was asked to add to, still standing (not a new list of the pile's own). */
const askedSequence = (asked: PileAsk | null): PileAsk | null => (asked && asked.id !== PILE_NEW_LIST ? asked : null);

/**
 * The door into the pile, or with a sequence's Add leads standing and no search open, the line asking for one. A Ready
 * pile is offered where no sequence of the search's own writes to it; Needs review is, under any search.
 */
function pileDoorOf(a: PileViewArgs, asked: PileAsk | null, letGo: () => void) {
  const { pile, openSearch } = a;
  if (pile.on) return null;
  const named = askedSequence(asked);
  if (!openSearch) return named ? <LeadPileAsk name={named.name} onLetGo={letGo} /> : null;
  const cls: LeadClass = a.cls === "review" ? "review" : "qualified";
  const offered = a.cls !== "excluded" && (cls === "review" || !a.hasChain);
  if (!offered || !canDo(cls === "review" ? "find" : "approve")) return null;
  return (
    <LeadPileDoor
      onStart={() => void pile.start(openSearch.id, cls)}
      target={named && cls === "qualified" ? named.name : undefined}
    />
  );
}

interface PileViewArgs {
  pile: LeadPile;
  aim: LeadAim;
  leads: LeadsSurface;
  openSearch: LeadSearchDto | null;
  cls: LeadClass | null;
  /** The open search has a reach-out of its own. */
  hasChain: boolean;
  phone: boolean;
  setPeekId: (id: string | null) => void;
}

/** The end of the pile, as the sheet says it: what happened, in rows, and what comes next. */
/**
 * The end of a pile: every lead it went through (added, set aside and put off), a row for each kind that happened, and
 * the note on what comes next only where something was added (a batch waits for the OK only then).
 */
function pileEndOf(pile: LeadPile, target: string | null, later: number) {
  const kept = target ? pile.tally.added : pile.held.length;
  const rows = [
    { icon: "plus", t: target ? LEAD_SHEET_WORDS.endAdded(target) : LEAD_SHEET_WORDS.endHeld, n: kept },
    { icon: "clock", t: LEAD_SHEET_WORDS.endLater, n: later },
    { icon: "x", t: LEAD_SHEET_WORDS.endNotFit, n: pile.tally.notFit },
  ];
  return {
    title: LEAD_SHEET_WORDS.endTitle(kept + pile.tally.notFit + later),
    rows: rows.filter((r) => r.n > 0),
    note: kept === 0 ? "" : target ? LEAD_SHEET_WORDS.endNote : LEAD_SHEET_WORDS.endNoteFirst,
  };
}

export function useLeadPileView(a: PileViewArgs) {
  const { pile, aim, leads, openSearch, phone } = a;
  const on = pile.on && !!openSearch && pile.searchId === openSearch.id;
  const { up, open, later } = usePileUp(on ? leads.rows : NO_ROWS, pile);
  // A sequence's Add leads, standing until a pile starts (which takes it) or the page lets it go.
  const [asked, setAsked] = useState<PileAsk | null>(() => pileAsk.peek());
  const searchKey = openSearch ? openSearch.id : null;
  useEffect(() => setAsked(pileAsk.peek()), [searchKey, pile.on]);
  // On a desk the sheet follows the lead that is up, once each time one comes up, so a sheet the owner closed stays
  // closed until the next.
  const lastUp = useRef<string | null>(null);
  const upId = up ? up.id : null;
  useEffect(() => {
    if (!on || phone) {
      lastUp.current = null;
      return;
    }
    if (upId && upId !== lastUp.current) {
      lastUp.current = upId;
      a.setPeekId(upId);
    }
  }, [on, phone, upId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The add door's answers for the leads open in a Ready pile, asked once each as they come in.
  const target = aim.target;
  const asking = on && pile.cls === "qualified" && target ? open.map((r) => r.id).join(",") : "";
  useEffect(() => {
    if (asking) void aim.check(asking.split(","));
  }, [asking, target ? target.rootId : null]); // eslint-disable-line react-hooks/exhaustive-deps
  const door = pileDoorOf(a, asked, () => {
    pileAsk.take();
    setAsked(null);
  });
  // Add them all: the leads open in this pass, as the door answered for them, in buckets; the press adds those that go.
  // Its door counts only those that would go, and shows only where two or more would (one is the dock's own Add).
  const bulkVm: LeadCardBulkVM | null =
    on && pile.cls === "qualified" && target && open.length > 1
      ? leadCardBulkOf({
          chain: target.chain,
          leads: leadCardBulkLeadsOf(open, aim.checkOf),
          workspace: leadCardWorkspace(),
        })
      : null;
  const bulk: SheetPileView["bulk"] =
    bulkVm && bulkVm.ids.length > 1
      ? {
          n: bulkVm.ids.length,
          vm: () => bulkVm,
          add: (ids) => void pile.addAll(open.filter((r) => ids.includes(r.id))),
        }
      : null;
  // Counted from the rows on the page, which move as a press is made, never from the read that follows it.
  const progress = leads.pile ? leadPileProgressOf(leads.pile, { left: open.length, later }) : null;
  const view: SheetPileView | null =
    on && openSearch
      ? {
          pile,
          // A pile with no sequence chosen is still a list's (its sheet asks where they go), unless it is a new list of its
          // own, or no sequence takes leads you add at all.
          facts: {
            mode: target || (!aim.newList && (aim.targets ?? []).length > 0) ? "list" : "first",
            later,
            held: pile.held.length,
            added: pile.tally.added,
          },
          progress: { words: progress ? progress.text : "", share: progress ? progress.share : 0 },
          searchName: openSearch.name,
          bulk,
          next: up ? up.name : null,
          end: pileEndOf(pile, target ? target.name : null, later),
        }
      : null;
  const keys: PileKeys | null = on ? { press: pressSheetKey, undo: () => void pile.undo(), leave: pile.stop } : null;
  return { on, up, view, door, keys };
}
