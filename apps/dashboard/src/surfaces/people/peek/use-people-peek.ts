/**
 * A person peeked at over People's list on a desk (canvas A, PEEK-01), as the Pipeline and Leads keep theirs: a row's press
 * opens it and takes the cursor, J and K walk the rows and the peek follows the cursor, Esc closes it (hooks/keyboard.ts
 * KeyDoors), and the address says it (contracts peopleRoute, `clients/<view>:p-<id>`). When the ADDRESS moved (a link,
 * Back, the first draw) the page follows it; when the PAGE moved it says so: opening pushes an entry, walking replaces it,
 * and closing goes back to the entry the opening made, or replaces where the person came with the address.
 *
 * A phone opens the person's page instead (its rows have no room beside them): a peek's address that arrives on a phone
 * is replaced by the person's page.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { peopleRoute, personTabRoute } from "@chanlytics/contracts";
import type { PersonRowVM } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { personDeletedHere, warmPerson } from "../people-detail";
import { walkIn } from "../walk";
import { usePeekRead } from "./use-peek-read";

/** Focus moves into the peek as it opens and back to the cursor's row as it closes, so Tab carries on from there. */
function personPeekFocus(peekId: string | null, cursor: string | null): void {
  const doc = window.document;
  if (!doc || !doc.getElementById) return;
  const el = peekId ? doc.getElementById("people-peek-close") : cursor && doc.getElementById(`person-${cursor}`);
  if (el && el.focus) el.focus({ preventScroll: true });
}

interface PeekFacts {
  /** The person the address names over the view, or null. */
  addrPeek: string | null;
  /** The view's token (peopleViewToken): null for Everyone. */
  view: string | null;
  phone: boolean;
  /** The rows the view shows, in their order: what the arrows walk. */
  shownIds: readonly string[];
  cursor: string | null;
  setCursor: (id: string | null) => void;
  nav: (to: string, opts?: { replace?: boolean }) => void;
  /** Every row People holds: a peeked person filtered out of view still has theirs. */
  rows: readonly PersonRowVM[];
}

/** Says the peek in the address, and follows the address where it moved by itself. */
function usePeekAddress(f: PeekFacts, peekId: string | null, open: (id: string) => void, close: () => void) {
  const { addrPeek, view, nav, phone } = f;
  const viewRoute = peopleRoute({ view });
  const at = useRef<{
    view: string | undefined;
    peek: string | null | undefined;
    asked: string | null;
    pushed: boolean;
  }>({ view: undefined, peek: undefined, asked: null, pushed: false });
  useEffect(() => {
    // A phone opens the person's page instead (usePeoplePeek): the address is not the peek's there.
    if (phone) return;
    const a = at.current;
    // Someone deleted from their page, which Back left by this entry: the view, with nobody peeked at (personDeletedHere).
    // Asked before whether the address moved: the list is held hidden under the person's page (people-route.tsx), so the
    // address it comes back to is the one it last saw, and only its effects running again say it is back.
    if (addrPeek && personDeletedHere(addrPeek)) {
      Object.assign(a, { view: viewRoute, peek: null, asked: null, pushed: false });
      if (peekId) close();
      nav(viewRoute, { replace: true });
      return;
    }
    if (a.view !== viewRoute || a.peek !== addrPeek) {
      a.view = viewRoute;
      a.peek = addrPeek;
      a.asked = null;
      if (!addrPeek) a.pushed = false;
      // The person the address names takes the cursor too, or the cursor this tab kept would walk the peek off them.
      if (peekId !== addrPeek) {
        if (addrPeek) open(addrPeek);
        else close();
      }
      return;
    }
    if (peekId === addrPeek) return;
    const want = peopleRoute({ view, peek: peekId });
    // Said once: the shell follows a push in its next draw, and every draw until then finds the address as it was.
    if (a.asked === want) return;
    a.asked = want;
    if (peekId && !addrPeek && !a.pushed) {
      a.pushed = true;
      nav(want);
    } else if (!peekId && a.pushed && window.history && window.history.back) {
      a.pushed = false;
      window.history.back();
    } else nav(want, { replace: true });
  }, [viewRoute, addrPeek, peekId, phone]); // eslint-disable-line react-hooks/exhaustive-deps -- the address moving, or the peek, is what it answers
}

/** People's peek: who is open, the doors that open, walk and close it, where they stand in the view, and their read. */
export function usePeoplePeek(f: PeekFacts) {
  const { phone, shownIds, cursor, setCursor, rows, addrPeek } = f;
  const [peekId, setPeekId] = useState<string | null>(null);
  const openPeek = useCallback(
    (id: string) => {
      setPeekId(id);
      setCursor(id);
    },
    [setCursor],
  );
  const closePeek = useCallback(() => setPeekId(null), []);
  const stepPeek = (to: string) => openPeek(to);
  usePeekAddress(f, peekId, openPeek, closePeek);
  // The peek follows the row cursor while it is open (J and K, the arrows), as the lead's does.
  useEffect(() => {
    if (peekId && cursor && cursor !== peekId) setPeekId(cursor);
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps -- the cursor moving is the only reason
  useEffect(() => {
    personPeekFocus(peekId, cursor);
  }, [peekId]); // eslint-disable-line react-hooks/exhaustive-deps -- focus moves as the peek opens or closes
  // A phone has no room beside its rows: a peek closes, and one the address brought opens the person's page in its place.
  useEffect(() => {
    if (!phone) return;
    if (peekId) setPeekId(null);
    if (addrPeek) navigate(personTabRoute(addrPeek, "overview"), { replace: true });
  }, [phone, addrPeek]); // eslint-disable-line react-hooks/exhaustive-deps -- the width and the address are what it answers
  const shownPeek = phone ? null : peekId;
  const walk = shownPeek ? walkIn(shownIds, shownPeek) : null;
  // The people either side are read ahead, so a step opens on a person the tab already holds.
  const prev = walk?.prev ?? null;
  const next = walk?.next ?? null;
  useEffect(() => {
    if (prev) void warmPerson(prev);
    if (next) void warmPerson(next);
  }, [prev, next]);
  const read = usePeekRead(shownPeek);
  return {
    peekId: shownPeek,
    openPeek,
    closePeek,
    stepPeek,
    peekWalk: walk,
    peekRow: shownPeek ? (rows.find((r) => r.id === shownPeek) ?? null) : null,
    peekPerson: read.person,
    peekFailed: read.failed,
    peekMissing: read.missing,
    peekRetry: read.retry,
  };
}
