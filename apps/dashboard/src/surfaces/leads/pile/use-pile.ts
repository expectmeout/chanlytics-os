/**
 * The pile's state and acts (the lead workbench, 00426): which search is being gone through and in which pass, the
 * reach-out its adds go to (or a new list, held and written to together at the end), and what was done, three deep, for
 * Undo. The order is the database's (leads_page's pile sort, read while the pile is on); which lead is up is the first
 * of them still open in this pass (contracts leadPileOpen), less the ones decided here a moment ago, so a press moves on
 * at once and its re-read only confirms it. Every act is a door that already exists: an add (reach_out_add), Later
 * (lead_member_later), Not a fit (the stage door), Keep and Leave out (the member doors); each answers its undo.
 *
 * Whether an add would go is the add's own door's to say (reach_out_add, dry: the one predicate, reach_out_why_not):
 * asked once for the leads open in the pile, in one batch per sequence, as they come in, and kept here by lead, so the
 * card says why before Add is pressed. What a press did is the pile's own line (`said`), never a toast over the next
 * card; a door that refuses still says so as a toast, since the lead stays.
 */
import { useMemo, useRef, useState } from "react";
import {
  LEAD_LIST_MAX,
  LEAD_PILE_SAID,
  isLeadList,
  leadPileOpen,
  type LeadCardCheck,
  type LeadClass,
  type LeadNotAFitWhy,
  type LeadPileAct,
  type LeadRowVM,
  type LeadSearchDto,
  type ReachOutAddDto,
  type ReachOutChainDto,
} from "@chanlytics/contracts";
import { PILE_NEW_LIST, pileAsk, reachOuts } from "../../campaigns/reach-out/surface";
import { refusalToast } from "../../legacy-verbs";
import type { Flash } from "../../people/types";
import { excludeLead, keepLead, laterLead, setLeadStage, undoLeadOperation } from "../surface";

/**
 * Where the pile's adds go: a sequence fed by a list, by its first step, and that list; and the sequence as its read
 * answered it, whose first email the card fills for the lead that is up.
 */
interface PileTarget {
  rootId: string;
  name: string;
  listId: string;
  chain: ReachOutChainDto;
}

/** One thing done in the pile: the leads it moved past, the act, and the operation that undoes it (none for a hold). */
interface PileDone {
  leadIds: string[];
  act: LeadPileAct;
  op: { id: string; version: number } | null;
}

/** The add door's answers for one sequence, by lead: why each would not go, or null where it would. */
interface PileChecks {
  rootId: string;
  by: ReadonlyMap<string, LeadCardCheck>;
}

/** How deep Undo reaches back. */
const UNDO_DEPTH = 3;

/** The reach-outs fed by a list, as the pile's targets: the newest first. A chain says what feeds it (00426). */
const pileTargetsOf = (chains: readonly ReachOutChainDto[], searches: readonly LeadSearchDto[]): PileTarget[] =>
  chains
    .filter(
      (c) =>
        c.search && (c.fed_by ? c.fed_by === "list" : isLeadList(searches.find((s) => s.id === c.search?.id) ?? null)),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((c) => ({ rootId: c.root_id, name: c.name, listId: c.search?.id ?? "", chain: c }));

/** A door's answer, as the pile reads it: the operation it made, if any. */
const opOf = (data: unknown): PileDone["op"] => {
  const d = data && typeof data === "object" ? (data as { op_id?: unknown; version?: unknown }) : {};
  return typeof d.op_id === "string" && typeof d.version === "number" ? { id: d.op_id, version: d.version } : null;
};

/** The leads an add left out, by id: the rest of those asked for joined. */
const joinedOf = (asked: readonly string[], answer: ReachOutAddDto): string[] => {
  const out = new Set(answer.leads.map((l) => l.lead_id));
  return asked.filter((id) => !out.has(id));
};

/** The checks kept for this sequence, with the door's answer for the leads just asked laid over them. */
function checksWith(was: PileChecks | null, rootId: string, asked: readonly string[], answer: ReachOutAddDto) {
  const by = new Map(was && was.rootId === rootId ? was.by : []);
  const out = new Map(answer.leads.map((l) => [l.lead_id, { why: l.why, chain_name: l.chain_name }]));
  for (const id of asked) by.set(id, out.get(id) ?? null);
  return { rootId, by };
}

/**
 * The add door's answers for the pile's sequence: asked, dry, about the leads not yet asked (at most a list's worth at
 * once), so the card of each says why before Add is pressed. An answer that does not come leaves them unasked; the
 * press still asks. Another sequence asks afresh.
 */
function usePileChecks(target: PileTarget | null) {
  const [checks, setChecks] = useState<PileChecks | null>(null);
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

export function useLeadPile({ searches, flash }: { searches: readonly LeadSearchDto[]; flash: Flash }) {
  const [searchId, setSearchId] = useState<string | null>(null);
  const [cls, setCls] = useState<LeadClass>("qualified");
  const [pass, setPass] = useState<"first" | "later">("first");
  const [targets, setTargets] = useState<PileTarget[] | null>(null);
  const [target, setTarget] = useState<PileTarget | null>(null);
  const [held, setHeld] = useState<string[]>([]);
  const [done, setDone] = useState<PileDone[]>([]);
  // Decided here a moment ago: moved past at once, before the re-read that says so lands.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const checks = usePileChecks(target);
  // What the last press did, said in the pile's own line; and the reason a Not a fit was last given, marked among five.
  const [said, setSaid] = useState<string | null>(null);
  const [lastWhy, setLastWhy] = useState<LeadNotAFitWhy | null>(null);

  const start = async (search: string, klass: LeadClass) => {
    setSearchId(search);
    setCls(klass);
    setPass("first");
    setHeld([]);
    setDone([]);
    setGone(new Set());
    setAsking(false);
    setSaid(null);
    checks.reset();
    const chains = await reachOuts.chainsNow();
    const all = pileTargetsOf(chains ?? [], searches);
    setTargets(all);
    // A sequence's Add leads (Sequences, a list's door) names where this pass's adds go; New message's Leads you add, a
    // list of the pile's own (held, then Write to the N); else the newest list-fed one.
    const asked = pileAsk.take();
    setTarget(asked?.id === PILE_NEW_LIST ? null : (all.find((t) => t.rootId === asked?.id) ?? all[0] ?? null));
  };
  const stop = () => {
    setSearchId(null);
    setAsking(false);
  };
  const decided = (leadIds: string[], act: LeadPileAct, op: PileDone["op"]) => {
    // A Later moves the row at once by itself (its patch writes later_at), and must come back in the later pass: only
    // an act the row does not show at once (an add, which the re-read says) is moved past here.
    if (act !== "later") setGone((g) => new Set([...g, ...leadIds]));
    setDone((d) => [...d, { leadIds, act, op }].slice(-UNDO_DEPTH));
  };

  /** An add, of one lead or of several: its door, its words, and on to the next. */
  const addOf = async (rows: readonly LeadRowVM[], to: PileTarget) => {
    const ids = rows.map((r) => r.id);
    const r = await reachOuts.addLeads(to.rootId, ids);
    if (!r.ok) return flash(refusalToast(r, "It could not be added"));
    const answer: ReachOutAddDto = r.data;
    const words = reachOuts.addWords(answer, to.name);
    if (!answer.added) return flash({ tone: "warn", msg: words.text });
    const one = rows.length === 1 ? rows[0] : null;
    setSaid(one ? LEAD_PILE_SAID.add(one.name, to.name) : words.text);
    decided(joinedOf(ids, answer), "add", opOf(answer));
  };

  /** An act on the lead that is up: its door, then on to the next. A door that refuses says why, and the lead stays. */
  const act = async (row: LeadRowVM, a: LeadPileAct, why?: LeadNotAFitWhy) => {
    if (busy || !searchId) return;
    if (a === "not_a_fit" && !why) return setAsking(true);
    setAsking(false);
    if (a === "hold") {
      setHeld((h) => (h.includes(row.id) ? h : [...h, row.id]));
      setSaid(LEAD_PILE_SAID.hold(row.name, null));
      return decided([row.id], a, null);
    }
    setBusy(true);
    try {
      if (a === "add" && target) return await addOf([row], target);
      const r =
        a === "later"
          ? await laterLead(searchId, row.id)
          : a === "keep"
            ? await keepLead(searchId, row.id)
            : a === "exclude"
              ? await excludeLead(searchId, row.id)
              : await setLeadStage(row.id, { kind: "not_a_fit", why: why ?? "other" });
      if (!r.ok) return flash(refusalToast(r, "That did not go through"));
      if (a === "not_a_fit" && why) setLastWhy(why);
      setSaid(LEAD_PILE_SAID[a](row.name, null));
      decided([row.id], a, opOf(r.data));
    } finally {
      setBusy(false);
    }
  };

  /** Add them all: the leads the bulk sheet says would go (contracts leadCardBulkOf), in one add, one Undo. */
  const addAll = async (rows: readonly LeadRowVM[]) => {
    if (busy || !searchId || !target || !rows.length) return;
    setBusy(true);
    try {
      await addOf(rows, target);
    } finally {
      setBusy(false);
    }
  };

  /** Undo the last thing done: a lead held is let go; any other act, its door's undo (00426: the operator's own). */
  const undo = async () => {
    const last = done.at(-1);
    if (!last || busy) return;
    const back = () => {
      setDone((d) => d.slice(0, -1));
      setGone((g) => new Set([...g].filter((id) => !last.leadIds.includes(id))));
      setSaid(null);
    };
    if (last.act === "hold") {
      setHeld((h) => h.filter((id) => !last.leadIds.includes(id)));
      return back();
    }
    if (!last.op) return back();
    setBusy(true);
    const u = await undoLeadOperation(last.op.id, last.op.version).finally(() => setBusy(false));
    if (!u.ok) return flash(refusalToast(u, "Nothing was put back"));
    // An add taken back: its leads would go again, so the door's answer for them is asked afresh.
    if (last.act === "add") checks.reset();
    back();
  };

  return {
    on: !!searchId,
    searchId,
    cls,
    pass,
    setPass,
    targets,
    target,
    setTarget,
    held,
    gone,
    asking,
    setAsking,
    busy,
    canUndo: done.length > 0,
    said,
    lastWhy,
    check: checks.check,
    checkOf: checks.checkOf,
    start,
    stop,
    act,
    addAll,
    undo,
  };
}
export type LeadPile = ReturnType<typeof useLeadPile>;

/** The lead that is up: the first of the database's order still open in this pass and not decided here a moment ago. */
export function usePileUp(rows: readonly LeadRowVM[], pile: LeadPile) {
  return useMemo(() => {
    const open = (pass: "first" | "later") =>
      rows.filter((r) => leadPileOpen(r, { cls: pile.cls, pass }) && !pile.gone.has(r.id) && !pile.held.includes(r.id));
    const now = open(pile.pass);
    return { up: now[0] ?? null, open: now, left: now.length, later: pile.pass === "first" ? open("later").length : 0 };
  }, [rows, pile.cls, pile.pass, pile.gone, pile.held]);
}
