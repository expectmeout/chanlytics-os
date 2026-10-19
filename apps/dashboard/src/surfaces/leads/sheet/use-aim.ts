/**
 * Where Add goes, for the lead sheet, the pile and the bulk bar alike (the canvas's one road, 18 Oct 2026): the pick,
 * kept on the search (00459 lead_searches.adds_to, pressed through `lead_search_aim`), so a desk, a phone and a teammate
 * agree; the sequences to leads it can be (GET sequences, the list's one cached read); the pick's record, whose words the
 * card's email and the rail's preview are filled from; and the add door's dry answers for the leads asked about with it
 * (00426 reach_out_add, the one predicate), so a card says why before Add is pressed.
 *
 * The pick is this search's: the one chosen on it, else the sequence whose own list the search is, else none (the dock
 * says Add to a sequence, which opens the picker; never a guess). A list of leads with no search open keeps it for the
 * page alone.
 */
import { useRef, useState } from "react";
import {
  LEAD_LIST_MAX,
  type LeadCardCheck,
  type LeadSearchDto,
  type ReachOutAddDto,
  type ReachOutChainDto,
  type SequenceRowDto,
} from "@chanlytics/contracts";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { useSequenceRead } from "../../campaigns/sequences/use-record";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { sequenceVerbs as verbs } from "../../campaigns/sequences/verbs";

/** The pick: a sequence to leads that has not ended, by its id and name, with its row, list and words. */
export interface AimTarget {
  rootId: string;
  name: string;
  row: SequenceRowDto;
  /** The list its leads are on: the pile's read orders by it. */
  listId: string | null;
  /** Its steps' words (the record's chain), once its record is read. */
  chain: ReachOutChainDto | null;
}

/** The add door's answers for one sequence, by lead: why each would not go, or null where it would. */
interface AimChecks {
  rootId: string;
  by: ReadonlyMap<string, LeadCardCheck>;
}

const readList = () => verbs.list();
const peekList = () => verbs.peekList();

/** The sequences to leads Add can go to: those that have not ended, the newest first. */
const leadSequencesOf = (rows: readonly SequenceRowDto[]) =>
  rows
    .filter((r) => r.starts === "leads" && r.state !== "ended")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

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
 * The add door's answers for the pick: asked, dry, about the leads not yet asked (at most a list's worth at once). An
 * answer that does not come leaves them unasked; the press still asks. Another pick asks afresh.
 */
function useAimChecks(rootId: string | null) {
  const [checks, setChecks] = useState<AimChecks | null>(null);
  const asked = useRef(new Set<string>());
  const check = async (ids: readonly string[]) => {
    if (!rootId) return;
    const ask = ids.filter((id) => !asked.current.has(`${rootId}:${id}`)).slice(0, LEAD_LIST_MAX);
    if (!ask.length) return;
    for (const id of ask) asked.current.add(`${rootId}:${id}`);
    const r = await reachOuts.checkAdd(rootId, ask);
    if (r.ok) setChecks((was) => checksWith(was, rootId, ask, r.data));
    else for (const id of ask) asked.current.delete(`${rootId}:${id}`);
  };
  const checkOf = (leadId: string): LeadCardCheck | undefined =>
    rootId && checks && checks.rootId === rootId ? checks.by.get(leadId) : undefined;
  const reset = () => {
    asked.current.clear();
    setChecks(null);
  };
  return { check, checkOf, reset };
}

export function useLeadAim({ searches, searchId }: { searches: readonly LeadSearchDto[]; searchId: string | null }) {
  const list = useSequenceRead("all", readList, peekList);
  const rows = list.state === "read" ? leadSequencesOf(list.data.sequences) : null;
  // What this page chose, by search, before the search's read says so.
  const [chosen, setChosen] = useState<Readonly<Record<string, string | null>>>({});
  const key = searchId ?? "";
  const search = searchId ? (searches.find((s) => s.id === searchId) ?? null) : null;
  const kept = key in chosen ? chosen[key] : (search?.adds_to ?? null);
  // Else the sequence whose own list the open search is: a list's sequence is no guess.
  const own = searchId && rows ? (rows.find((r) => r.first?.search_id === searchId)?.id ?? null) : null;
  const pickId = kept ?? (key in chosen ? null : own);
  const row = pickId && rows ? (rows.find((r) => r.id === pickId) ?? null) : null;
  const rec = useSequenceRead(row ? row.id : null, verbs.record, verbs.peekRecord);
  const chain = rec.state === "read" && row && rec.data.sequence.id === row.id ? (rec.data.chain ?? null) : null;
  const target: AimTarget | null = row
    ? { rootId: row.id, name: row.name, row, listId: row.first?.search_id ?? null, chain }
    : null;
  const checks = useAimChecks(target ? target.rootId : null);

  /** The pick for this search, kept on it (00459 lead_search_aim): said by the add that follows, so said nowhere here. */
  const choose = (sequenceId: string | null) => {
    setChosen((was) => ({ ...was, [key]: sequenceId }));
    if (!searchId) return;
    const name = rows?.find((r) => r.id === sequenceId)?.name ?? null;
    void commitVerb("lead_search_aim", { search_id: searchId, sequence_id: sequenceId, name, was: pickId });
  };

  return {
    /** The sequences to leads Add can go to; null until the list is read. */
    targets: rows,
    target,
    choose,
    check: checks.check,
    checkOf: checks.checkOf,
    reset: checks.reset,
  };
}
export type LeadAim = ReturnType<typeof useLeadAim>;
