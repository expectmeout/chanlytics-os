/**
 * The peek's hooks (moved from legacy/pages/leads-real.jsx, decision 0015): its deck, the photos either side of it, the
 * cursor it follows, the question it asks once the owner is back, where focus goes as it opens and closes, and the address
 * it keeps.
 */
import { useEffect, useRef } from "react";
import { leadsRoute, type LeadRowVM } from "@chanlytics/contracts";
import { leadArmOnReturn, leadPeekFocus, leadPeekFollows, leadPhotoWarm } from "../peek/seams";
import type { Armed, ArmedSetter, DraftState, PeekMode } from "../peek/types";
import type { LeadView } from "./state";

/** How the page moves the address: a push, or a replace of the entry it is on. */
export type LeadsNav = (to: string, opts?: { replace?: boolean }) => void;

export const useLeadPeek = ({
  peekId,
  setPeekId,
  shownIds,
  leadShown,
  cursor,
  setCursor,
  peekMode,
  armed,
  setArmed,
}: {
  peekId: string | null;
  setPeekId: (id: string | null) => void;
  shownIds: readonly string[];
  leadShown: readonly LeadRowVM[];
  cursor: string | null;
  setCursor: (id: string) => void;
  peekMode: PeekMode;
  armed: Armed | null;
  setArmed: ArmedSetter;
}) => {
  // The peek's deck (D5): the lead before or after the one open, by the order on screen. It moves the cursor too, so the
  // rows behind it follow and the keyboard carries on from where the thumb left off.
  const deckMove = (step: number) => {
    const i = peekId ? shownIds.indexOf(peekId) : -1;
    const to = shownIds[step > 0 ? Math.min(shownIds.length - 1, i + 1) : Math.max(0, i - 1)];
    if (!to || to === peekId) return;
    setCursor(to);
    setPeekId(to);
  };
  // The photos either side of the lead open are asked for now, so the deck, a swipe, and J and K find them there.
  useEffect(() => {
    if (!peekId) return;
    const i = shownIds.indexOf(peekId);
    if (i < 0) return;
    for (const j of [i + 1, i - 1]) {
      const r = leadShown[j];
      if (r && r.tile) leadPhotoWarm(r.tile.band);
    }
  }, [peekId, shownIds.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // The peek follows the row cursor while it is open, so J and K walk the leads behind it -- unless it is asking a
  // question or holding a draft, which keeps it on its own lead (leadPeekFollows, Task 12).
  useEffect(() => {
    if (!peekId || !cursor || cursor === peekId || !leadPeekFollows(peekMode, armed)) return;
    setPeekId(cursor);
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  // The owner left for their own mail app or their own phone; the peek asks how it went only once they are back
  // (leadArmOnReturn). Nothing is asked while the tab is hidden, and the listeners go with the arming.
  useEffect(
    () => leadArmOnReturn(armed, setArmed),
    [armed && armed.kind, armed && armed.leadId, armed && armed.asked], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // The dialog's focus rule (leadPeekFocus): focus moves into the peek when it opens and back to the row when it closes,
  // and the row is the cursor, so Tab carries on from where the owner was.
  useEffect(() => {
    leadPeekFocus(peekId, cursor);
  }, [peekId]); // eslint-disable-line react-hooks/exhaustive-deps
  return deckMove;
};

/**
 * The lead that is open is part of the address (contracts leadsRoute, `p-`): a refresh keeps it, Back closes it, and it
 * can be sent to someone. The page's own state still draws the peek; this keeps the two saying one thing. When the ADDRESS
 * moved -- a link, Back or Forward, a rail pick, the first draw -- the page follows it, and a view that changed under an
 * open lead closes it. When the PAGE moved, it says so: opening pushes an entry, the cursor walking the peek on replaces
 * it, and closing goes back to the entry the opening made. A lead that came with the address has no entry of the page's
 * behind it, so it closes by replacing: going back would leave Leads.
 */
export const useLeadPeekAddress = (a: {
  leadView: LeadView;
  viewRoute: string;
  addrPeek: string | null;
  peekId: string | null;
  setPeekId: (id: string | null) => void;
  setCursor: (id: string) => void;
  setPeekMode: (mode: PeekMode) => void;
  setArmed: (armed: Armed | null) => void;
  setDraft: (draft: DraftState | null) => void;
  nav: LeadsNav;
}) => {
  const { leadView, viewRoute, addrPeek, peekId, nav } = a;
  const peekAddr = useRef<{
    view: string | undefined;
    peek: string | null | undefined;
    asked: string | null;
    pushed: boolean;
  }>({ view: undefined, peek: undefined, asked: null, pushed: false });
  useEffect(() => {
    const at = peekAddr.current;
    if (at.view !== viewRoute || at.peek !== addrPeek) {
      at.view = viewRoute;
      at.peek = addrPeek;
      at.asked = null;
      if (!addrPeek) at.pushed = false;
      // The lead the address names takes the cursor too: the cursor this tab kept for the view (usePlPlace) would
      // otherwise walk the peek, and the address, off it on the next draw.
      if (peekId !== addrPeek) {
        a.setPeekId(addrPeek);
        if (addrPeek) a.setCursor(addrPeek);
        a.setPeekMode("info");
        a.setArmed(null);
        a.setDraft(null);
      }
      return;
    }
    if (peekId === addrPeek) return;
    // The view's chips stay in the address under an open lead (00500): opening one narrows nothing away.
    const want = leadsRoute({
      searchId: leadView.searchId,
      list: leadView.list,
      cls: leadView.cls,
      chips: leadView.chips,
      peek: peekId,
    });
    // Said once: the shell follows a push in its next draw, and every draw until then finds the address as it was.
    if (at.asked === want) return;
    at.asked = want;
    if (peekId && !addrPeek && !at.pushed) {
      at.pushed = true;
      nav(want);
    } else if (!peekId && at.pushed && window.history && window.history.back) {
      at.pushed = false;
      window.history.back();
    } else nav(want, { replace: true });
  }, [viewRoute, addrPeek, peekId]); // eslint-disable-line react-hooks/exhaustive-deps
};
