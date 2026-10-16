/**
 * The pile's state and acts (the lead workbench, 00426): which search is being gone through and in which pass, the
 * reach-out its adds go to (or a new list, held and written to together at the end), and what was done, three deep, for
 * Undo. The order is the database's (leads_page's pile sort, read while the pile is on); which lead is up is the first
 * of them still open in this pass (contracts leadPileOpen), less the ones decided here a moment ago, so a press moves on
 * at once and its re-read only confirms it. Every act is a door that already exists: an add (reach_out_add), Later
 * (lead_member_later), Not a fit (the stage door), Keep and Leave out (the member doors); each answers its undo.
 */
import { useMemo, useState } from "react";
import {
  isLeadList,
  leadPileOpen,
  type LeadClass,
  type LeadNotAFitWhy,
  type LeadPileAct,
  type LeadRowVM,
  type LeadSearchDto,
  type ReachOutAddDto,
  type ReachOutChainDto,
} from "@chanlytics/contracts";
import { PILE_NEW_LIST, PILE_TARGET_KEY, reachOuts } from "../../campaigns/reach-out/surface";
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

/** One thing done in the pile: the lead, the act, and the operation that undoes it (none for a lead held). */
interface PileDone {
  leadId: string;
  act: LeadPileAct;
  op: { id: string; version: number } | null;
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

/** The reach-out a drawer's Add leads named for the next pass (Campaigns, people.tsx), read once and let go. */
function preferredTarget(): string | null {
  try {
    const id = window.sessionStorage.getItem(PILE_TARGET_KEY);
    window.sessionStorage.removeItem(PILE_TARGET_KEY);
    return id;
  } catch {
    return null;
  }
}

/** A door's answer, as the pile reads it: the operation it made, if any. */
const opOf = (data: unknown): PileDone["op"] => {
  const d = data && typeof data === "object" ? (data as { op_id?: unknown; version?: unknown }) : {};
  return typeof d.op_id === "string" && typeof d.version === "number" ? { id: d.op_id, version: d.version } : null;
};

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

  const start = async (search: string, klass: LeadClass) => {
    setSearchId(search);
    setCls(klass);
    setPass("first");
    setHeld([]);
    setDone([]);
    setGone(new Set());
    setAsking(false);
    const chains = await reachOuts.chainsNow();
    const all = pileTargetsOf(chains ?? [], searches);
    setTargets(all);
    // A reach-out's Add leads (Campaigns, people.tsx) names where this pass's adds go; New message's Leads you add, a
    // list of the pile's own (held, then Write to the N); else the newest list-fed one.
    const asked = preferredTarget();
    setTarget(asked === PILE_NEW_LIST ? null : (all.find((t) => t.rootId === asked) ?? all[0] ?? null));
  };
  const stop = () => {
    setSearchId(null);
    setAsking(false);
  };
  const decided = (leadId: string, act: LeadPileAct, op: PileDone["op"]) => {
    // A Later moves the row at once by itself (its patch writes later_at), and must come back in the later pass: only
    // an act the row does not show at once (an add, which the re-read says) is moved past here.
    if (act !== "later") setGone((g) => new Set([...g, leadId]));
    setDone((d) => [...d, { leadId, act, op }].slice(-UNDO_DEPTH));
  };

  /** An act on the lead that is up: its door, then on to the next. A door that refuses says why, and the lead stays. */
  const act = async (row: LeadRowVM, a: LeadPileAct, why?: LeadNotAFitWhy) => {
    if (busy || !searchId) return;
    if (a === "not_a_fit" && !why) return setAsking(true);
    setAsking(false);
    if (a === "hold") {
      setHeld((h) => (h.includes(row.id) ? h : [...h, row.id]));
      return decided(row.id, a, null);
    }
    setBusy(true);
    try {
      if (a === "add" && target) {
        const r = await reachOuts.addLeads(target.rootId, [row.id]);
        if (!r.ok) return flash(refusalToast(r, "It could not be added"));
        const answer: ReachOutAddDto = r.data;
        const said = reachOuts.addWords(answer, target.name);
        if (!answer.added) return flash({ tone: "warn", msg: said.text });
        flash({ msg: said.text });
        return decided(row.id, a, opOf(answer));
      }
      const r =
        a === "later"
          ? await laterLead(searchId, row.id)
          : a === "keep"
            ? await keepLead(searchId, row.id)
            : a === "exclude"
              ? await excludeLead(searchId, row.id)
              : await setLeadStage(row.id, { kind: "not_a_fit", why: why ?? "other" });
      if (!r.ok) return flash(refusalToast(r, "That did not go through"));
      decided(row.id, a, opOf(r.data));
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
      setGone((g) => new Set([...g].filter((id) => id !== last.leadId)));
    };
    if (last.act === "hold") {
      setHeld((h) => h.filter((id) => id !== last.leadId));
      return back();
    }
    if (!last.op) return back();
    setBusy(true);
    const u = await undoLeadOperation(last.op.id, last.op.version).finally(() => setBusy(false));
    if (!u.ok) return flash(refusalToast(u, "Nothing was put back"));
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
    start,
    stop,
    act,
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
    return { up: now[0] ?? null, left: now.length, later: pile.pass === "first" ? open("later").length : 0 };
  }, [rows, pile.cls, pile.pass, pile.gone, pile.held]);
}
