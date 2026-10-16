/**
 * The pile on the Leads page (the lead workbench, 00426): whether it is on for the search the address names, the lead
 * that is up and its card, what the page draws (on a desk the pile where the rows stand, on a phone its sheet over
 * them; or the door into it under the search), the keys its one listener hands it, and, on a desk, the peek following
 * the lead that is up so its details stand beside it.
 *
 * The door is offered under a search whose leads no sequence of its own writes to (a search with one is written to as
 * its leads are found: there is nothing to decide but Not a fit, which the rows already offer), and under any search's
 * Needs review, whose leads a Keep sends on; to a member who may act. A sequence's Add leads names where the adds go
 * (pileAsk): the door says so, and with no search open the page asks for one.
 *
 * While the pile is on, the add door is asked, dry, about the leads open in it (use-pile.ts check), so each card says
 * why before Add is pressed, and a lead no email can go to has Call in Add's place.
 */
import { useEffect, useRef, useState } from "react";
import {
  leadCardBulkOf,
  leadPileRailOf,
  type LeadCardBulkVM,
  type LeadClass,
  type LeadRowVM,
  type LeadSearchDto,
} from "@chanlytics/contracts";
import { PILE_NEW_LIST, pileAsk, type PileAsk } from "../../campaigns/reach-out/surface";
import { canDo } from "../../legacy-verbs";
import type { LeadsSurface } from "../surface";
import { leadCardBulkLeadsOf, leadCardFor, leadCardWorkspace } from "./card";
import { LeadPileAsk, LeadPileDoor, LeadPileView, pileAddBlocked, pileCalls, type PileViewProps } from "./pile";
import { usePileUp, type LeadPile } from "./use-pile";

/** What the page's one listener hands the pile: a press of the rail by its key, Undo, and the way out. */
interface PileKeys {
  press: (key: "a" | "l" | "n") => void;
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
  leads: LeadsSurface;
  openSearch: LeadSearchDto | null;
  cls: LeadClass | null;
  /** The open search has a reach-out of its own. */
  hasChain: boolean;
  phone: boolean;
  setPeekId: (id: string | null) => void;
  writeHeld: (ids: string[]) => void;
  /** The page's call: the owner's own phone dials, and the peek asks how it went (acts.tsx callLead). */
  call: (id: string) => void;
}

export function useLeadPileView(a: PileViewArgs) {
  const { pile, leads, openSearch, phone } = a;
  const on = pile.on && !!openSearch && pile.searchId === openSearch.id;
  const { up, open, later } = usePileUp(on ? leads.rows : NO_ROWS, pile);
  // A sequence's Add leads, standing until a pile starts (which takes it) or the page lets it go.
  const [asked, setAsked] = useState<PileAsk | null>(() => pileAsk.peek());
  const searchKey = openSearch ? openSearch.id : null;
  useEffect(() => setAsked(pileAsk.peek()), [searchKey, pile.on]);
  // On a desk the lead's details are the peek beside the pile: it follows the lead that is up, once each time one comes
  // up, so a peek the owner closed stays closed until the next.
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
  const target = pile.target;
  const asking = on && pile.cls === "qualified" && target ? open.map((r) => r.id).join(",") : "";
  useEffect(() => {
    if (asking) void pile.check(asking.split(","));
  }, [asking, target ? target.rootId : null]); // eslint-disable-line react-hooks/exhaustive-deps
  const door = pileDoorOf(a, asked, () => {
    pileAsk.take();
    setAsked(null);
  });
  // The card of the lead that is up: its reason, its marks and the first email of the sequence its adds go to.
  const card = on && up ? leadCardFor(up, target ? target.chain : null, leads.tz, pile.checkOf(up.id)) : null;
  // On a phone the call's question is the pile sheet's own, so the peek does not open over it.
  const call = (id: string) => {
    a.call(id);
    if (phone) a.setPeekId(null);
  };
  // Add them all: the leads open in this pass, as the door answered for them, in buckets; the press adds those that go.
  const bulk: PileViewProps["bulk"] =
    on && pile.cls === "qualified" && target && open.length > 1
      ? {
          n: open.length,
          vm: (): LeadCardBulkVM =>
            leadCardBulkOf({
              chain: target.chain,
              leads: leadCardBulkLeadsOf(open, pile.checkOf),
              workspace: leadCardWorkspace(),
            }),
          add: (ids) => void pile.addAll(open.filter((r) => ids.includes(r.id))),
        }
      : null;
  const view: PileViewProps | null =
    on && openSearch
      ? {
          pile,
          up,
          later,
          counts: leads.pile,
          searchName: openSearch.name,
          card,
          onWriteHeld: a.writeHeld,
          onCall: call,
          bulk,
        }
      : null;
  const keys: PileKeys | null = on
    ? {
        press: (key) => {
          const slot = leadPileRailOf({
            cls: pile.cls,
            target: target ? target.name : null,
            call: pileCalls(card),
          }).find((s) => s.key === key);
          if (!up || !slot || !canDo(slot.right)) return;
          // A key does what its press does: Add that would come to nothing is off for it too, and a call dials.
          if (slot.act === "call") return call(up.id);
          if (slot.act === "add" && pileAddBlocked(card)) return;
          void pile.act(up, slot.act);
        },
        undo: () => void pile.undo(),
        leave: pile.stop,
      }
    : null;
  // A desk draws the pile where the rows stand; a phone's is a sheet over them, which the scope draws with the peek's
  // acts its tabs share (scope.tsx).
  return { on, node: view && !phone ? <LeadPileView {...view} /> : null, sheet: phone ? view : null, door, keys };
}
