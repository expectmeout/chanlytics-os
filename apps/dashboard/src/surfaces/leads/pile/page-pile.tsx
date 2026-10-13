/**
 * The pile on the Leads page (the lead workbench, 00426): whether it is on for the search the address names, the lead
 * that is up, what the page draws (the pile where the rows stand, or the door into it under the search), the keys its
 * one listener hands it, and, on a desk, the peek following the lead that is up so its details stand beside it.
 *
 * The door is offered under a search whose leads no reach-out of its own writes to (a search with one is written to as
 * its leads are found: there is nothing to decide but Not a fit, which the rows already offer), to a member who may act.
 */
import { useEffect, useRef } from "react";
import { leadPileRailOf, type LeadClass, type LeadRowVM, type LeadSearchDto } from "@chanlytics/contracts";
import { canDo } from "../../legacy-verbs";
import type { LeadsSurface } from "../surface";
import { LeadPileDoor, LeadPileView } from "./pile";
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
  const node =
    on && openSearch ? (
      <LeadPileView
        pile={pile}
        up={up}
        later={later}
        counts={leads.pile}
        searchName={openSearch.name}
        phone={phone}
        onDetails={(id) => a.setPeekId(id)}
        onWriteHeld={a.writeHeld}
      />
    ) : null;
  const keys: PileKeys | null = on
    ? {
        press: (key) => {
          const slot = leadPileRailOf({ cls: pile.cls, target: pile.target ? pile.target.name : null }).find(
            (s) => s.key === key,
          );
          if (up && slot && canDo(slot.right)) void pile.act(up, slot.act);
        },
        undo: () => void pile.undo(),
        leave: pile.stop,
      }
    : null;
  return { on, node, door, keys };
}
