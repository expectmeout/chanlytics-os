/**
 * The pile on the Leads page (the lead workbench, 00426): whether it is on for the search the address names, the lead
 * that is up and its card, what the page draws (on a desk the pile where the rows stand, on a phone its sheet over
 * them; or the door into it under the search), the keys its one listener hands it, and, on a desk, the peek following
 * the lead that is up so its details stand beside it.
 *
 * The door is offered under a search whose leads no sequence of its own writes to (a search with one is written to as
 * its leads are found: there is nothing to decide but Not a fit, which the rows already offer), to a member who may act.
 */
import { useEffect, useRef } from "react";
import { leadPileRailOf, type LeadClass, type LeadRowVM, type LeadSearchDto } from "@chanlytics/contracts";
import { canDo } from "../../legacy-verbs";
import type { LeadsSurface } from "../surface";
import { leadCardFor } from "./card";
import { LeadPileDoor, LeadPileView, pileAddBlocked, type PileViewProps } from "./pile";
import { usePileUp, type LeadPile } from "./use-pile";

/** What the page's one listener hands the pile: a press of the rail by its key, Undo, and the way out. */
interface PileKeys {
  press: (key: "a" | "l" | "n") => void;
  undo: () => void;
  leave: () => void;
}

const NO_ROWS: readonly LeadRowVM[] = [];

export function useLeadPileView(a: {
  pile: LeadPile;
  leads: LeadsSurface;
  openSearch: LeadSearchDto | null;
  cls: LeadClass | null;
  /** The open search has a reach-out of its own. */
  hasChain: boolean;
  phone: boolean;
  setPeekId: (id: string | null) => void;
  writeHeld: (ids: string[]) => void;
}) {
  const { pile, leads, openSearch, phone } = a;
  const on = pile.on && !!openSearch && pile.searchId === openSearch.id;
  const { up, later } = usePileUp(on ? leads.rows : NO_ROWS, pile);
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
  // A pile of what is Ready, or of Needs review; Left out is not a pile (Put back is the row's own).
  const cls: LeadClass = a.cls === "review" ? "review" : "qualified";
  const door =
    !on && openSearch && !a.hasChain && a.cls !== "excluded" && canDo("approve") ? (
      <LeadPileDoor onStart={() => void pile.start(openSearch.id, cls)} />
    ) : null;
  // The card of the lead that is up: its reason, its marks and the first email of the sequence its adds go to.
  const card = on && up ? leadCardFor(up, pile.target ? pile.target.chain : null, leads.tz) : null;
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
        }
      : null;
  const keys: PileKeys | null = on
    ? {
        press: (key) => {
          const slot = leadPileRailOf({ cls: pile.cls, target: pile.target ? pile.target.name : null }).find(
            (s) => s.key === key,
          );
          // A key does what its press does: Add that would come to nothing is off for it too.
          if (slot && slot.act === "add" && pileAddBlocked(card)) return;
          if (up && slot && canDo(slot.right)) void pile.act(up, slot.act);
        },
        undo: () => void pile.undo(),
        leave: pile.stop,
      }
    : null;
  // A desk draws the pile where the rows stand; a phone's is a sheet over them, which the scope draws with the peek's
  // acts its tabs share (scope.tsx).
  return { on, node: view && !phone ? <LeadPileView {...view} /> : null, sheet: phone ? view : null, door, keys };
}
