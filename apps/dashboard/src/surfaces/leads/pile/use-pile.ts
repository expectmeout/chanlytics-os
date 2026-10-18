/**
 * The pile's state and acts (the lead workbench, 00426): which search is being gone through and in which pass, and what
 * was done, three deep, for Undo. Where its adds go is the lead sheet's one choice (sheet/use-aim.ts: Change, "used for
 * the rest of this pile"), or a new list of the pile's own, held and written to together at the end. The order is the
 * database's (leads_page's pile sort, read while the pile is on); which lead is up is the first of them still open in
 * this pass (contracts leadPileOpen), less the ones decided here a moment ago, so a press moves on at once and its
 * re-read only confirms it. Every act is a door that already exists: an add (reach_out_add), Later (lead_member_later),
 * Not a fit (the stage door), Keep and Leave out (the member doors); each answers its undo. Next moves past a lead
 * there is nothing to decide on, writing nothing.
 *
 * What a press did is the pile's own line (`said`), never a toast over the next card; a door that refuses still says so
 * as a toast, since the lead stays.
 */
import { useMemo, useState } from "react";
import {
  LEAD_PILE_SAID,
  leadPileOpen,
  type LeadClass,
  type LeadNotAFitWhy,
  type LeadPileAct,
  type LeadRowVM,
  type ReachOutAddDto,
} from "@chanlytics/contracts";
import { pileAsk, reachOuts } from "../../campaigns/reach-out/surface";
import { refusalToast } from "../../legacy-verbs";
import type { Flash } from "../../people/types";
import type { AimTarget, LeadAim } from "../sheet/use-aim";
import { excludeLead, keepLead, laterLead, setLeadStage, undoLeadOperation } from "../surface";

/** One thing done in the pile: the leads it moved past, the act, and the operation that undoes it (none for a hold). */
interface PileDone {
  leadIds: string[];
  act: LeadPileAct | "next";
  op: { id: string; version: number } | null;
}

/** How deep Undo reaches back. */
const UNDO_DEPTH = 3;

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

/** The other doors a press goes through: Later, Keep, Leave out, or Not a fit with its why. */
const pileDoorFor = (searchId: string, row: LeadRowVM, a: LeadPileAct, why?: LeadNotAFitWhy) =>
  a === "later"
    ? laterLead(searchId, row.id)
    : a === "keep"
      ? keepLead(searchId, row.id)
      : a === "exclude"
        ? excludeLead(searchId, row.id)
        : setLeadStage(row.id, { kind: "not_a_fit", why: why ?? "other" });

export function useLeadPile({ flash, aim }: { flash: Flash; aim: LeadAim }) {
  const [searchId, setSearchId] = useState<string | null>(null);
  const [cls, setCls] = useState<LeadClass>("qualified");
  const [pass, setPass] = useState<"first" | "later">("first");
  const [held, setHeld] = useState<string[]>([]);
  const [done, setDone] = useState<PileDone[]>([]);
  // Decided here a moment ago: moved past at once, before the re-read that says so lands.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // What the last press did, said in the pile's own line; and the reason a Not a fit was last given, marked among five.
  const [said, setSaid] = useState<string | null>(null);
  const [lastWhy, setLastWhy] = useState<LeadNotAFitWhy | null>(null);
  // How many were decided each way in this pile, for its end: added, held, later and not a fit.
  const [tally, setTally] = useState({ added: 0, notFit: 0 });

  const start = async (search: string, klass: LeadClass) => {
    setSearchId(search);
    setCls(klass);
    setPass("first");
    setHeld([]);
    setDone([]);
    setGone(new Set());
    setSaid(null);
    setTally({ added: 0, notFit: 0 });
    aim.reset();
    // A sequence's Add leads (Sequences, a list's door) names where this pass's adds go; New message's Leads you add, a
    // list of the pile's own (held, then Write to the N); else the one chosen for this search, else the list's own.
    await aim.load({ asked: pileAsk.take() });
  };
  const stop = () => setSearchId(null);
  const decided = (leadIds: string[], act: PileDone["act"], op: PileDone["op"]) => {
    // A Later moves the row at once by itself (its patch writes later_at), and must come back in the later pass: only
    // an act the row does not show at once (an add, which the re-read says) is moved past here.
    if (act !== "later") setGone((g) => new Set([...g, ...leadIds]));
    setDone((d) => [...d, { leadIds, act, op }].slice(-UNDO_DEPTH));
  };

  /** An add, of one lead or of several: its door, its words, and on to the next. */
  const addOf = async (rows: readonly LeadRowVM[], to: AimTarget) => {
    const ids = rows.map((r) => r.id);
    const r = await reachOuts.addLeads(to.rootId, ids);
    if (!r.ok) return flash(refusalToast(r, "It could not be added"));
    const answer: ReachOutAddDto = r.data;
    const words = reachOuts.addWords(answer, to.name);
    if (!answer.added) return flash({ tone: "warn", msg: words.text });
    const one = rows.length === 1 ? rows[0] : null;
    setSaid(one ? LEAD_PILE_SAID.add(one.name, to.name) : words.text);
    setTally((t) => ({ ...t, added: t.added + answer.added }));
    decided(joinedOf(ids, answer), "add", opOf(answer));
  };

  /** An act on the lead that is up: its door, then on to the next. A door that refuses says why, and the lead stays. */
  const act = async (row: LeadRowVM, a: LeadPileAct, why?: LeadNotAFitWhy) => {
    if (busy || !searchId) return;
    if (a === "hold") {
      setHeld((h) => (h.includes(row.id) ? h : [...h, row.id]));
      setSaid(LEAD_PILE_SAID.hold(row.name, null));
      return decided([row.id], a, null);
    }
    setBusy(true);
    try {
      if (a === "add") return aim.target ? await addOf([row], aim.target) : undefined;
      const r = await pileDoorFor(searchId, row, a, why);
      if (!r.ok) return flash(refusalToast(r, "That did not go through"));
      if (a === "not_a_fit") {
        if (why) setLastWhy(why);
        setTally((t) => ({ ...t, notFit: t.notFit + 1 }));
      }
      setSaid(LEAD_PILE_SAID[a](row.name, null));
      decided([row.id], a, opOf(r.data));
    } finally {
      setBusy(false);
    }
  };

  /** Next: past a lead there is nothing to decide on (in a sequence already, talking), writing nothing. */
  const skip = (row: LeadRowVM) => {
    if (busy || !searchId) return;
    decided([row.id], "next", null);
  };

  /** Add them all: the leads the bulk popover says would go (contracts leadCardBulkOf), in one add, one Undo. */
  const addAll = async (rows: readonly LeadRowVM[]) => {
    if (busy || !searchId || !aim.target || !rows.length) return;
    setBusy(true);
    try {
      await addOf(rows, aim.target);
    } finally {
      setBusy(false);
    }
  };

  /** Undo the last thing done: a lead held is let go, a Next walked back; any other act, its door's undo (00426). */
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
    if (last.act === "add") aim.reset();
    back();
  };

  return {
    on: !!searchId,
    searchId,
    cls,
    pass,
    setPass,
    held,
    gone,
    busy,
    canUndo: done.length > 0,
    /** The newest thing Undo takes back, in words: "Undo · Added Luxe Lane". */
    undoWords: done.length ? (said ?? null) : null,
    said,
    lastWhy,
    tally,
    start,
    stop,
    act,
    skip,
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
