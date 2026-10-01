/**
 * The reach-out sheet's state (moved from legacy/pages/reach-out/reach-out-sheet.jsx, decision 0015): the draft, kept in
 * the tab while it is changed, the caret of the field last focused, and the search's reach.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ReachOutChainDto,
  ReachOutDraft,
  ReachOutDraftStep,
  ReachOutReachDto,
  ReachOutSlot,
} from "@chanlytics/contracts";
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

/** Where the caret was in a step's words, when a field last took focus or a selection. */
interface Caret {
  n: number;
  field: "subject" | "body";
  at: number | null;
}

/** The sheet's state: the draft (kept in the tab while changed), the caret of the field last focused, the reach. */
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
  const caret = useRef<Caret>({ n: 0, field: "body", at: null });
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
  const slot = (s: ReachOutSlot) => {
    const c = caret.current;
    const step = draft.steps[c.n] || draft.steps[0];
    const put = W.insertSlotAt(String(step[c.field] || ""), c.at, s);
    caret.current = { ...c, at: put.caret };
    editStep(c.n, { [c.field]: put.text });
  };
  return {
    draft,
    setDraft,
    work,
    reach,
    editStep,
    slot,
    focus: (n: number, field: Caret["field"], at: number | null) => {
      caret.current = { n, field, at };
    },
  };
}
