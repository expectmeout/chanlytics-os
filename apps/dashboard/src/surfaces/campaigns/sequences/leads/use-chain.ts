/**
 * A sequence to leads as its record writes it (the lead-to-sequence canvas's Build boards: the draft is the record, saved
 * as you change it): the chain held while it is changed, each change saved a moment after the last through the chain's
 * own save (PUT sequences/:id/chain: every word checked, new words sending what waits back to the check), and the record
 * read again after. New steps take the ids the save gave them, so the next save changes them rather than adding more.
 * While a sheet holds it (`hold`), what the record reads back is not taken, so a word being typed is never put back; once
 * let go, the chain is the record's again.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  firstNameOf,
  reachOutChainBodyOf,
  reachOutDraftOf,
  type ReachOutChainDto,
  type ReachOutDraft,
  type SequenceRecordDto,
} from "@chanlytics/contracts";
import { reachOuts } from "../../reach-out/surface";
import { meNow, refusalToast, type LegacyFlash } from "../../../legacy-verbs";

/** How long after the last change a save goes: long enough for a word, short enough to feel kept. */
const SAVE_AFTER_MS = 700;

/** Where the chain's save stands. */
export type ChainSaving = "saved" | "saving" | "failed";

/** The draft a chain opens as, signed with the member's first name where it names no one. */
function chainDraftOf(chain: ReachOutChainDto): ReachOutDraft {
  return reachOutDraftOf({ chain, searchName: chain.name, signedBy: firstNameOf(meNow()?.display_name ?? null, null) });
}

export interface LeadChain {
  draft: ReachOutDraft;
  /** The chain as read, beside the draft: its mailboxes and pace. */
  chain: ReachOutChainDto;
  /** A change, saved a moment after the last. */
  edit: (change: (d: ReachOutDraft) => ReachOutDraft) => void;
  /** The auto-add switch: the search new ready leads join from, or none. Saved at once. */
  setSource: (searchId: string | null) => void;
  saving: ChainSaving;
  /** Save now what waits: the steps' ids as saved, in order, or null where the save was refused. */
  flush: () => Promise<Array<string | null> | null>;
  /** A sheet holds it while it is written: what the record reads back is not taken until it lets go. */
  hold: (on: boolean) => void;
}

export function useLeadChain(
  rec: SequenceRecordDto,
  flash: (f: LegacyFlash) => void,
  moved: () => void,
): LeadChain | null {
  const chain = rec.chain ?? null;
  const [draft, setDraft] = useState<ReachOutDraft | null>(() => (chain ? chainDraftOf(chain) : null));
  const [saving, setSaving] = useState<ChainSaving>("saved");
  const [held, setHeld] = useState(false);
  // What waits to go: the draft as last changed and the auto-add switch, sent together by the next save.
  const pending = useRef<{ draft: ReachOutDraft | null; source: string | null | undefined }>({
    draft: null,
    source: undefined,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(true);
  // The draft as it stands, for a save that answers with its steps' ids.
  const latest = useRef<ReachOutDraft | null>(draft);
  latest.current = draft;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // The record read again: its chain is the draft's, unless a sheet holds it or a change waits to go.
  useEffect(() => {
    if (!chain || held || timer.current || pending.current.draft) return;
    setDraft(chainDraftOf(chain));
  }, [chain, held]);

  const id = rec.sequence.id;
  const name = rec.sequence.name;
  const save = useCallback(async (): Promise<Array<string | null> | null> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { draft: d, source } = pending.current;
    pending.current = { draft: null, source: undefined };
    if (!d && source === undefined) return latest.current?.steps.map((s) => s.id) ?? null;
    const base = d ?? latest.current ?? (chain ? chainDraftOf(chain) : null);
    if (!base) return null;
    setSaving("saving");
    // The name is the record's (renamed from its head), never the one this draft opened with.
    const { search_id: _list, ...body } = reachOutChainBodyOf({ ...base, name }, id);
    const r = await reachOuts.saveChain(id, { ...body, ...(source !== undefined ? { source_search_id: source } : {}) });
    if (!r.ok) {
      if (live.current) setSaving("failed");
      flash(refusalToast(r));
      return null;
    }
    // New steps take the ids the save gave them, in order, so the next save changes them; a draft changed while it was
    // saved by a step more or less is left to the next save.
    const ids = r.data.step_ids;
    const same = (n: ReachOutDraft | null) => !!n && n.steps.length === base.steps.length;
    if (live.current) {
      setDraft((now) =>
        now && same(now) ? { ...now, steps: now.steps.map((s, i) => ({ ...s, id: s.id ?? ids[i] ?? null })) } : now,
      );
      setSaving("saved");
    }
    moved();
    return base.steps.map((s, i) => s.id ?? ids[i] ?? null);
  }, [chain, flash, id, moved, name]);

  const later = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_AFTER_MS);
  }, [save]);

  if (!chain || !draft) return null;
  return {
    draft,
    chain,
    edit: (change) => {
      setDraft((now) => {
        const next = change(now ?? chainDraftOf(chain));
        pending.current.draft = next;
        return next;
      });
      later();
    },
    setSource: (searchId) => {
      pending.current.source = searchId;
      void save();
    },
    saving,
    flush: save,
    hold: setHeld,
  };
}
