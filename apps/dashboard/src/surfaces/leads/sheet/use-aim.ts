/**
 * Where Add goes, for the lead sheet and the pile alike (canvas B: "Change, in place · used for the rest of this pile"):
 * the sequences fed by a list, read once the sheet first needs them, the one chosen, and the add door's dry answers for
 * the leads asked about with it (00426 reach_out_add with p_dry: the one predicate, reach_out_why_not), so a card says
 * why before Add is pressed. One choice and one cache, so the pile's adds and a lead opened from the rows agree.
 *
 * The choice is the open search's: a sequence's Add leads names the one (pileAsk), or a new list of the pile's own; else
 * the one chosen for this search before (a pile keeps the last one chosen: the refined canvas's decision 04, kept per
 * search on this browser); else the list's own sequence where the open search is a list. Else none: the sheet says
 * "Choose where they go", never a guess that carries a bookshop's sequence onto a salon search. A sequence fed by its own
 * search writes to every ready lead it finds and is never offered.
 */
import { useRef, useState } from "react";
import {
  LEAD_LIST_MAX,
  isLeadList,
  type LeadCardCheck,
  type LeadSearchDto,
  type ReachOutAddDto,
  type ReachOutChainDto,
} from "@chanlytics/contracts";
import { PILE_NEW_LIST, reachOuts, type PileAsk } from "../../campaigns/reach-out/surface";

/** A sequence fed by a list, by its first step, and that list; and the sequence as its read answered it. */
export interface AimTarget {
  rootId: string;
  name: string;
  listId: string;
  chain: ReachOutChainDto;
}

/** The add door's answers for one sequence, by lead: why each would not go, or null where it would. */
interface AimChecks {
  rootId: string;
  by: ReadonlyMap<string, LeadCardCheck>;
}

/** Where this viewer last sent Add for a search, by its sequence: read and kept in a try, so blocked storage keeps nothing. */
const aimKey = (searchId: string) => `leads.aim:${searchId}`;
const keptAim = (searchId: string | null): string | null => {
  if (!searchId) return null;
  try {
    return window.localStorage.getItem(aimKey(searchId));
  } catch {
    return null;
  }
};
const keepAim = (searchId: string | null, rootId: string): void => {
  if (!searchId) return;
  try {
    window.localStorage.setItem(aimKey(searchId), rootId);
  } catch {
    // Kept for this page alone.
  }
};

/** The sequences fed by a list: the newest first. A chain says what feeds it (00426). */
const targetsOf = (chains: readonly ReachOutChainDto[], searches: readonly LeadSearchDto[]): AimTarget[] =>
  chains
    .filter(
      (c) =>
        c.search && (c.fed_by ? c.fed_by === "list" : isLeadList(searches.find((s) => s.id === c.search?.id) ?? null)),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((c) => ({ rootId: c.root_id, name: c.name, listId: c.search?.id ?? "", chain: c }));

/** The checks kept for this sequence, with the door's answer for the leads just asked laid over them. */
function checksWith(was: AimChecks | null, rootId: string, asked: readonly string[], answer: ReachOutAddDto) {
  const by = new Map(was && was.rootId === rootId ? was.by : []);
  const out = new Map(
    answer.leads.map((l) => [l.lead_id, { why: l.why, chain_id: l.chain_id, chain_name: l.chain_name }]),
  );
  for (const id of asked) by.set(id, out.get(id) ?? null);
  return { rootId, by };
}

/**
 * The add door's answers for the chosen sequence: asked, dry, about the leads not yet asked (at most a list's worth at
 * once). An answer that does not come leaves them unasked; the press still asks. Another sequence asks afresh.
 */
function useAimChecks(target: AimTarget | null) {
  const [checks, setChecks] = useState<AimChecks | null>(null);
  // Asked already, answered or on its way, by sequence and lead: a lead is asked about once.
  const asked = useRef(new Set<string>());
  const check = async (ids: readonly string[]) => {
    if (!target) return;
    const rootId = target.rootId;
    const ask = ids.filter((id) => !asked.current.has(`${rootId}:${id}`)).slice(0, LEAD_LIST_MAX);
    if (!ask.length) return;
    for (const id of ask) asked.current.add(`${rootId}:${id}`);
    const r = await reachOuts.checkAdd(rootId, ask);
    if (r.ok) setChecks((was) => checksWith(was, rootId, ask, r.data));
    else for (const id of ask) asked.current.delete(`${rootId}:${id}`);
  };
  const checkOf = (leadId: string): LeadCardCheck | undefined =>
    target && checks && checks.rootId === target.rootId ? checks.by.get(leadId) : undefined;
  const reset = () => {
    asked.current.clear();
    setChecks(null);
  };
  return { check, checkOf, reset };
}

export function useLeadAim({ searches, searchId }: { searches: readonly LeadSearchDto[]; searchId: string | null }) {
  const [targets, setTargets] = useState<AimTarget[] | null>(null);
  // What this page chose, by search: a sequence's first step by its id, or the pile's own new list (PILE_NEW_LIST).
  const [picked, setPicked] = useState<Readonly<Record<string, string>>>({});
  const loading = useRef(false);
  const key = searchId ?? "";
  // This search's choice: made on this page, else kept from before, else the list's own sequence where it is a list.
  const pick: string | null = picked[key] ?? keptAim(searchId);
  const newList = pick === PILE_NEW_LIST;
  const all = targets ?? [];
  const target = newList
    ? null
    : ((pick ? all.find((t) => t.rootId === pick) : undefined) ??
      (searchId ? all.find((t) => t.listId === searchId) : undefined) ??
      null);
  const checks = useAimChecks(target);
  const pickFor = (p: string) => setPicked((was) => ({ ...was, [key]: p }));

  /** Read the sequences fed by a list; a sequence's Add leads names this search's choice, or a new list of the pile's own. */
  const load = async (p: { asked?: PileAsk | null } = {}) => {
    if (loading.current) return;
    loading.current = true;
    const chains = await reachOuts.chainsNow().finally(() => {
      loading.current = false;
    });
    setTargets(targetsOf(chains ?? [], searches));
    if (p.asked) pickFor(p.asked.id);
  };

  return {
    targets,
    target,
    /** This search's adds go to a new list of the pile's own (New message's Leads you add), not a sequence. */
    newList,
    /** Change: the sequence the adds go to now, for this search's leads, kept for it on this browser. */
    choose: (rootId: string) => {
      keepAim(searchId, rootId);
      pickFor(rootId);
    },
    load,
    check: checks.check,
    checkOf: checks.checkOf,
    reset: checks.reset,
  };
}
export type LeadAim = ReturnType<typeof useLeadAim>;
