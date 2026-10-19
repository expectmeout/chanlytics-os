/**
 * The pile on the Leads page (the lead workbench, 00426; one road, 00459): whether it is on for the search the address
 * names, the lead that is up, what the lead sheet draws of it (its line, Add them all, its end by sequence), the keys its
 * one listener hands it, and the sheet following the lead that is up. The lead itself is the lead sheet's, as every lead
 * opened on Leads is (sheet/sheet.tsx): the rows stay where they stand.
 *
 * To decide is the pile (the lead-to-sequence canvas's Presses board, "Go through the 12" cut): opening a lead to decide
 * on in a search, Ready or Needs review, starts it on that lead, for a member who may act, and each decision opens the
 * next. A sequence's Add leads names where the adds go (pileAsk): with a search open it becomes the search's pick at once;
 * with none, the page asks for one.
 *
 * While the pile is on, the add door is asked, dry, about the leads open in it (sheet/use-aim.ts), so each card says why
 * before Add is pressed, and a lead no email can go to has Call in Add's place.
 */
import { useEffect, useRef, useState } from "react";
import {
  leadCardBulkOf,
  leadPileEndOf,
  leadPileOpen,
  leadPileProgressOf,
  type LeadPileAdded,
  type LeadCardBulkVM,
  type LeadClass,
  type LeadRowVM,
  type LeadSearchDto,
} from "@chanlytics/contracts";
import { pileAsk, type PileAsk } from "../../campaigns/reach-out/surface";
import { canDo } from "../../legacy-verbs";
import type { SheetPileView } from "../sheet/sheet";
import { pressSheetKey, type SheetKey } from "../sheet/keys";
import type { LeadAim } from "../sheet/use-aim";
import type { LeadsSurface } from "../surface";
import { leadCardBulkLeadsOf, leadCardWorkspace } from "./card";
import { LeadPileAsk } from "./door";
import { usePileUp, type LeadPile } from "./use-pile";

/** What the page's one listener hands the pile: a press of the rail by its key, Undo, and the way out. */
interface PileKeys {
  press: (key: SheetKey) => void;
  undo: () => void;
  leave: () => void;
}

const NO_ROWS: readonly LeadRowVM[] = [];

/** With a sequence's Add leads standing and no search open, the line asking for one. */
function pileAskOf(a: PileViewArgs, asked: PileAsk | null, letGo: () => void) {
  if (a.pile.on || a.openSearch || !asked) return null;
  return <LeadPileAsk name={asked.name} onLetGo={letGo} />;
}

/** The pile a lead opened in this view would start: Ready's or Needs review's, where the member may act on it. */
function pileClassOf(a: PileViewArgs): LeadClass | null {
  if (!a.openSearch || a.cls === "excluded") return null;
  const cls: LeadClass = a.cls === "review" ? "review" : "qualified";
  return canDo(cls === "review" ? "find" : "approve") ? cls : null;
}

interface PileViewArgs {
  pile: LeadPile;
  aim: LeadAim;
  leads: LeadsSurface;
  openSearch: LeadSearchDto | null;
  cls: LeadClass | null;
  /** The lead open in the sheet: one to decide on starts the pile there. */
  peekId: string | null;
  setPeekId: (id: string | null) => void;
}

/**
 * The end of a pile (the canvas's PhoneEnd): each sequence it added to, with its state and its batch waiting for an OK
 * (the list's own read, use-aim.ts), how many were not a fit, and those for later.
 */
function pileEndOf(pile: LeadPile, aim: LeadAim, later: number) {
  const rows = aim.targets ?? [];
  const added: LeadPileAdded[] = Object.entries(pile.tally.to).flatMap(([id, n]) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return [];
    const b = r.needs.batches[0];
    return [{ id, name: r.name, state: r.state, n, waiting: b ? { batchId: b.id, people: b.people } : null }];
  });
  return leadPileEndOf({ added, notFit: pile.tally.notFit, later });
}

export function useLeadPileView(a: PileViewArgs) {
  const { pile, aim, leads, openSearch } = a;
  const on = pile.on && !!openSearch && pile.searchId === openSearch.id;
  const { up, open, later } = usePileUp(on ? leads.rows : NO_ROWS, pile);
  // A sequence's Add leads: with a search open it is the search's pick at once; with none it stands, asking for one.
  const [asked, setAsked] = useState<PileAsk | null>(() => pileAsk.peek());
  const searchKey = openSearch ? openSearch.id : null;
  useEffect(() => {
    const standing = pileAsk.peek();
    if (searchKey && standing && standing.id) {
      pileAsk.take();
      aim.choose(standing.id);
      setAsked(null);
      return;
    }
    setAsked(standing);
  }, [searchKey, pile.on]); // eslint-disable-line react-hooks/exhaustive-deps
  // A lead to decide on opened: the pile starts on it, or, while it is on, walks on from it.
  const klass = pileClassOf(a);
  const opened = a.peekId ? (leads.rows.find((r) => r.id === a.peekId) ?? null) : null;
  const toDecide = !!opened && !!klass && leadPileOpen(opened, { cls: klass, pass: on ? pile.pass : "first" });
  useEffect(() => {
    if (!toDecide || !openSearch || !klass || !opened) return;
    if (!on || pile.cls !== klass) pile.start(openSearch.id, klass, opened.id);
    else if (up && up.id !== opened.id) pile.anchor(opened.id);
  }, [toDecide, opened ? opened.id : null]); // eslint-disable-line react-hooks/exhaustive-deps
  // The sheet follows the lead that is up, once each time one comes up, so a sheet the owner closed stays closed until
  // the next.
  const lastUp = useRef<string | null>(null);
  const upId = up ? up.id : null;
  useEffect(() => {
    if (!on) {
      lastUp.current = null;
      return;
    }
    if (upId && upId !== lastUp.current) {
      if (lastUp.current !== null || a.peekId === upId) a.setPeekId(upId);
      lastUp.current = upId;
    }
  }, [on, upId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The add door's answers for the leads open in a Ready pile, asked once each as they come in.
  const target = aim.target;
  const asking = on && pile.cls === "qualified" && target ? open.map((r) => r.id).join(",") : "";
  useEffect(() => {
    if (asking) void aim.check(asking.split(","));
  }, [asking, target ? target.rootId : null]); // eslint-disable-line react-hooks/exhaustive-deps
  const door = pileAskOf(a, asked, () => {
    pileAsk.take();
    setAsked(null);
  });
  // Add them all: the leads open in this pass, as the door answered for them, in buckets; the press adds those that go.
  // Its door counts only those that would go, and shows only where two or more would (one is the dock's own Add).
  const bulkVm: LeadCardBulkVM | null =
    on && pile.cls === "qualified" && target && target.chain && open.length > 1
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
  // Counted from the rows on the page, which move as a press is made, never from the read that follows it: all it has
  // moved past, those left and those for later.
  const total = pile.count + open.length + later;
  const progress = on
    ? leadPileProgressOf({ total, added: 0, closed: 0, later, left: open.length }, { left: open.length, later })
    : null;
  const view: SheetPileView | null =
    on && openSearch
      ? {
          pile,
          // A pile with no sequence chosen is still a list's (its sheet asks where they go), unless it is a new list of its
          // own, or no sequence takes leads you add at all.
          facts: { later },
          progress: { words: progress ? progress.text : "", share: progress ? progress.share : 0 },
          searchName: openSearch.name,
          bulk,
          next: up ? up.name : null,
          end: pileEndOf(pile, aim, later),
        }
      : null;
  const keys: PileKeys | null = on ? { press: pressSheetKey, undo: () => void pile.undo(), leave: pile.stop } : null;
  return { on, up, view, door, keys };
}
