/**
 * The reach-out sheet's state (moved from legacy/pages/reach-out/reach-out-sheet.jsx, decision 0015): the draft, kept in
 * the tab while it is changed, and the search's reach. Where a slot goes in is each step's own (sheet-fields.tsx: the
 * editor's seats), not the sheet's.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReachOutChainDto, ReachOutDraft, ReachOutDraftStep, ReachOutReachDto } from "@chanlytics/contracts";
import { meNow } from "../../legacy-verbs";
import { tabDraft, useLegacyUnsavedWork } from "../../legacy-parts";
import { reachOuts } from "./surface";

type Words = typeof reachOuts.words;

interface DraftOptions {
  search: { id: string; name: string };
  chain: ReachOutChainDto | null;
  includeUnconfirmed: boolean;
  onClose: () => void;
}

/** The sheet's state: the draft (kept in the tab while changed) and the reach. */
export function useReachOutDraft(W: Words, { search, chain, includeUnconfirmed, onClose }: DraftOptions) {
  const me: NonNullable<ReturnType<typeof meNow>> = meNow() || {};
  const opened = useMemo(
    () =>
      W.reachOutDraftOf({
        chain,
        searchName: search.name,
        signedBy: W.firstNameOf(me.display_name, null),
        includeUnconfirmed,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what it opened as, read once
    [chain, search.name],
  );
  const key = chain ? chain.root_id : `new:${search.id}`;
  // A draft kept in the tab comes back as it was typed, but who it writes to is the door's: the door said which.
  const [draft, setDraft] = useState<ReachOutDraft>(() => {
    const kept = tabDraft("reach-out", key) as ReachOutDraft | null;
    return kept ? (chain ? kept : { ...kept, include_unconfirmed: opened.include_unconfirmed }) : opened;
  });
  const work = useLegacyUnsavedWork("reach-out", key, {
    value: draft,
    dirty: JSON.stringify(draft) !== JSON.stringify(opened),
    onLeave: onClose,
  });
  const [reach, setReach] = useState<ReachOutReachDto | null>(null);
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
    void reachOuts.reach(search.id).then((r) => {
      if (live) setReach(r);
    });
    return () => {
      live = false;
    };
  }, [search.id]);
  const editStep = (n: number, patch: Partial<ReachOutDraftStep>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, i) => (i === n ? { ...s, ...patch } : s)) }));
  return { draft, setDraft, work, reach, editStep };
}
