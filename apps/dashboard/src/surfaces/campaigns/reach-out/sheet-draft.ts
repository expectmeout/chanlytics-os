/**
 * The reach-out sheet's state (moved from legacy/pages/reach-out/reach-out-sheet.jsx, decision 0015): the draft, kept in
 * the tab while it is changed, and the search's reach. Where a slot goes in is each step's own (sheet-fields.tsx: the
 * editor's seats), not the sheet's.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReachOutChainDto, ReachOutDraft, ReachOutDraftStep, ReachOutReachDto } from "@chanlytics/contracts";
import { meNow } from "../../legacy-verbs";
import { tabDraft, useUnsavedWork } from "../../kit/record/work";
import { useReadAgain } from "./read-again";
import { reachOuts } from "./surface";

type Words = typeof reachOuts.words;

interface DraftOptions {
  search: { id: string; name: string };
  chain: ReachOutChainDto | null;
  includeUnconfirmed: boolean;
  onClose: () => void;
  /** A list of its own, made as it starts (a new sequence for a lead, or a version): the leads it holds, and the one it copies. */
  onList?: { leadIds: readonly string[]; name: string; from: ReachOutChainDto | null } | null;
}

/** The sheet's state: the draft (kept in the tab while changed) and the reach. */
export function useReachOutDraft(
  W: Words,
  { search, chain, includeUnconfirmed, onClose, onList = null }: DraftOptions,
) {
  const me: NonNullable<ReturnType<typeof meNow>> = meNow() || {};
  const signedBy = W.firstNameOf(me.display_name, null);
  const opened = useMemo(
    () =>
      onList && onList.from
        ? W.reachOutVersionDraftOf(onList.from, onList.name, signedBy)
        : onList
          ? { ...W.reachOutDraftOf({ chain: null, searchName: onList.name, signedBy }), name: onList.name }
          : W.reachOutDraftOf({ chain, searchName: search.name, signedBy, includeUnconfirmed }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what it opened as, read once
    [chain, search.name, onList ? onList.from : null],
  );
  // A list of its own has no search yet: its draft is kept by whom it is for, and the sequence it copies.
  const key = chain
    ? chain.root_id
    : onList
      ? `list:${onList.from ? onList.from.root_id : "new"}:${onList.leadIds.join(",")}`
      : `new:${search.id}`;
  // A draft kept in the tab comes back as it was typed, but who it writes to is the door's: the door said which.
  const [draft, setDraft] = useState<ReachOutDraft>(() => {
    const kept = tabDraft("reach-out", key) as ReachOutDraft | null;
    return kept ? (chain ? kept : { ...kept, include_unconfirmed: opened.include_unconfirmed }) : opened;
  });
  const work = useUnsavedWork("reach-out", key, {
    value: draft,
    dirty: JSON.stringify(draft) !== JSON.stringify(opened),
    onLeave: onClose,
  });
  // The search's reach: what this tab last read painted at once, read again behind as the sheet opens and as Leads or the
  // reach-outs move while it is open (read-again.ts; the wiring's second audit, X2-1). A read again that fails keeps it.
  const [reach, setReach] = useState<ReachOutReachDto | null>(() => reachOuts.reachHeld(search.id));
  const moved = useReadAgain(search.id || null);
  const [, setLanded] = useState(0);
  useEffect(() => {
    const landed = () => setLanded((n) => n + 1);
    for (const ev of ["surface:setup", "surface:settings"]) window.addEventListener(ev, landed);
    return () => {
      for (const ev of ["surface:setup", "surface:settings"]) window.removeEventListener(ev, landed);
    };
  }, []);
  useEffect(() => {
    let live = true;
    // A list made as it starts has nothing to count yet: who it holds is said by name.
    if (!search.id) return;
    void reachOuts.reach(search.id).then((r) => {
      if (live && r) setReach(r);
    });
    return () => {
      live = false;
    };
  }, [search.id, moved]);
  const editStep = (n: number, patch: Partial<ReachOutDraftStep>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, i) => (i === n ? { ...s, ...patch } : s)) }));
  return { draft, setDraft, work, reach, editStep };
}
