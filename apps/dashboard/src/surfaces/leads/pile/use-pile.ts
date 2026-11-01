/**
 * The pile's state and acts (the lead workbench, 00426; one road, 00459): which search is being gone through and in which
 * pass, and what was done, three deep, for Undo. Where its adds go is the search's pick (sheet/use-aim.ts, kept on the
 * search), made or changed in the picker, a step of the sheet. To decide is the pile (the lead-to-sequence canvas's
 * Presses board): opening a lead to decide on starts it there (`from`), and a decision opens the next row below it, in the
 * order the rows stand on the page, so nothing moves under the owner. Which lead is up is the first still open in this
 * pass (contracts leadPileOpen) from that row on, less the ones decided here a moment ago, so a press moves on at once and
 * its re-read only confirms it. Every act is a door that
 * already exists: an add (the sequence's add door, POST sequences/:id/leads), Later (lead_member_later), Not a fit (the
 * stage door, its reason given after in the toast), Keep and Leave out (the member doors); each answers its undo. Next
 * moves past a lead there is nothing to decide on, writing nothing. What it added is kept by sequence, for its end.
 *
 * What a press did is the pile's own line (`said`), never a toast over the next card; a door that refuses still says so
 * as a toast, since the lead stays; Not a fit's toast asks why.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LEAD_PILE_SAID,
  leadPileOpen,
  type LeadClass,
  type LeadNotAFitWhy,
  type LeadPileAct,
  type LeadRowVM,
  type ReachOutAddDto,
} from "@chanlytics/contracts";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
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

/** How many were decided each way in a pile, for its end: added (and to which sequence) and not a fit. */
type PileTally = { added: number; notFit: number; to: Readonly<Record<string, number>> };

/**
 * A pile as it stands: its search and pass, the row it was opened on (it walks on from there) and how many it has moved
 * past, the leads held, what was done (three deep, for Undo), those decided here a moment ago (moved past at once, before
 * the re-read that says so lands), what the last press did and the reason a Not a fit was last given, and its tally.
 */
interface PileKept {
  searchId: string | null;
  cls: LeadClass;
  from: string | null;
  count: number;
  pass: "first" | "later";
  held: string[];
  done: PileDone[];
  gone: ReadonlySet<string>;
  said: string | null;
  lastWhy: LeadNotAFitWhy | null;
  tally: PileTally;
}

/** No pile: none on, nothing done. */
const FRESH: PileKept = {
  searchId: null,
  cls: "qualified",
  from: null,
  count: 0,
  pass: "first",
  held: [],
  done: [],
  gone: new Set(),
  said: null,
  lastWhy: null,
  tally: { added: 0, notFit: 0, to: {} },
};

/** The pile Leads let go of on Write the emails, for this tab: taken up once when Leads opens again, on the way back. */
let keptPile: PileKept | null = null;
/** Write the emails was pressed: the pile is kept as Leads goes, for the record's way back to its end. */
let keepOnLeaving = false;

/** Keep the pile for the way back: Write the emails leaves for the draft's record, whose Back returns to the end. */
export const keepPileForTheWayBack = (): void => {
  keepOnLeaving = true;
};

/** The pile's state, one value: taken up from the one Leads last let go of, and left for the next as this one goes. */
function usePileState() {
  const [p, setP] = useState<PileKept>(() => keptPile ?? FRESH);
  // The pile as it stands, whichever draw asks: a toast outlives the draw that made it, and what it reads is what stands.
  const now = useRef(p);
  // Taken once as Leads opens; kept again only as Write the emails leaves.
  useEffect(() => {
    keptPile = null;
    return () => {
      keptPile = keepOnLeaving && now.current.searchId ? now.current : null;
      keepOnLeaving = false;
    };
  }, []);
  const put = (patch: Partial<PileKept> | ((x: PileKept) => Partial<PileKept>)) => {
    now.current = { ...now.current, ...(typeof patch === "function" ? patch(now.current) : patch) };
    setP(now.current);
  };
  return { p, now, put };
}

type PilePut = ReturnType<typeof usePileState>["put"];
type PileNow = ReturnType<typeof usePileState>["now"];

/** The Not a fit on a lead, while the pile still holds it (three deep). */
const notFitOf = (done: readonly PileDone[], leadId: string) =>
  done.filter((d) => d.act === "not_a_fit" && d.leadIds.includes(leadId)).at(-1) ?? null;

/**
 * Not a fit's reason, given after the press (the toast's): its mark undone and made again with the reason, so the pile's
 * Undo takes back the one that stands. Refused after the mark was undone, nothing stands, and Undo names nothing.
 */
async function giveWhy(pile: { now: PileNow; put: PilePut; flash: Flash }, row: LeadRowVM, why: LeadNotAFitWhy) {
  const { now, put, flash } = pile;
  const was = notFitOf(now.current.done, row.id);
  if (was && was.op) {
    const u = await undoLeadOperation(was.op.id, was.op.version);
    if (!u.ok) return flash(refusalToast(u, "The reason was not kept"));
  }
  const r = await setLeadStage(row.id, { kind: "not_a_fit", why });
  const op = r.ok ? opOf(r.data) : null;
  put((x) => ({ ...(r.ok ? { lastWhy: why } : {}), done: x.done.map((d) => (d === was ? { ...d, op } : d)) }));
  if (!r.ok) flash(refusalToast(r, "The reason was not kept"));
}

/** Take one thing done back: a lead held is let go, a Next walked back; any other act, its door's undo (00426). */
async function takeBack(
  pile: { put: PilePut; flash: Flash; aim: LeadAim; setBusy: (busy: boolean) => void },
  last: PileDone,
) {
  const { put, flash, aim, setBusy } = pile;
  const back = () =>
    put((x) => ({
      done: x.done.filter((d) => d !== last),
      gone: new Set([...x.gone].filter((id) => !last.leadIds.includes(id))),
      count: last.act === "later" ? x.count : Math.max(0, x.count - last.leadIds.length),
      said: null,
    }));
  if (!last.op) return back();
  setBusy(true);
  const u = await undoLeadOperation(last.op.id, last.op.version).finally(() => setBusy(false));
  if (!u.ok) return flash(refusalToast(u, "Nothing was put back"));
  // An add taken back: its leads would go again, so the door's answer for them is asked afresh.
  if (last.act === "add") aim.reset();
  back();
}

export function useLeadPile({ flash, aim }: { flash: Flash; aim: LeadAim }) {
  const { p, now, put } = usePileState();
  const [busy, setBusy] = useState(false);
  // A reason on its way (giveWhy): Undo waits for it, and takes back what it leaves standing, never the mark it undid.
  const giving = useRef<Promise<void> | null>(null);
  const { searchId, done } = p;

  const start = (search: string, klass: LeadClass, at: string | null = null) => {
    put({ ...FRESH, searchId: search, cls: klass, from: at });
    aim.reset();
    // A sequence's Add leads (its record) names where this pass's adds go: it becomes the search's pick.
    const asked = pileAsk.take();
    if (asked && asked.id) aim.choose(asked.id);
  };
  const stop = () => {
    keptPile = null;
    put({ searchId: null });
  };
  // A Later moves the row at once by itself (its patch writes later_at), and must come back in the later pass: only an
  // act the row does not show at once (an add, which the re-read says) is moved past here, and counted.
  const decided = (leadIds: string[], act: PileDone["act"], op: PileDone["op"]) =>
    put((x) => ({
      ...(act !== "later" ? { gone: new Set([...x.gone, ...leadIds]), count: x.count + leadIds.length } : {}),
      done: [...x.done, { leadIds, act, op }].slice(-UNDO_DEPTH),
    }));

  /** An add, of one lead or of several, to a sequence: its door, its words, and on to the next. True when any joined. */
  const addOf = async (rows: readonly LeadRowVM[], to: Pick<AimTarget, "rootId" | "name">): Promise<boolean> => {
    const ids = rows.map((r) => r.id);
    // The sequences' own add verb (its door and its undo, as the sheet's and Ask's): the pile says what it did itself.
    const r = await commitVerb("sequence_add", { sequence_id: to.rootId, lead_ids: ids, name: to.name });
    if (!r.ok) {
      flash(refusalToast(r, "It could not be added"));
      return false;
    }
    const answer = r.data as ReachOutAddDto;
    const words = reachOuts.addWords(answer, to.name);
    if (!answer.added) {
      flash({ tone: "warn", msg: words.text });
      return false;
    }
    const one = rows.length === 1 ? rows[0] : null;
    put((x) => ({
      said: one ? LEAD_PILE_SAID.add(one.name, to.name) : words.text,
      tally: {
        ...x.tally,
        added: x.tally.added + answer.added,
        to: { ...x.tally.to, [to.rootId]: (x.tally.to[to.rootId] ?? 0) + answer.added },
      },
    }));
    decided(joinedOf(ids, answer), "add", opOf(answer));
    return true;
  };

  /**
   * An act on the lead that is up: its door, then on to the next. A door that refuses says why, and the lead stays. An
   * add goes to the pick, or to the sequence the picker named (`to`). True when it went through.
   */
  const act = async (
    row: LeadRowVM,
    a: LeadPileAct,
    why?: LeadNotAFitWhy,
    to?: Pick<AimTarget, "rootId" | "name">,
  ): Promise<boolean> => {
    if (busy || !searchId || a === "hold") return false;
    setBusy(true);
    try {
      if (a === "add") {
        const target = to ?? aim.target;
        return target ? await addOf([row], target) : false;
      }
      const r = await pileDoorFor(searchId, row, a, why);
      if (!r.ok) {
        flash(refusalToast(r, "That did not go through"));
        return false;
      }
      const notFit = a === "not_a_fit";
      put((x) => ({
        said: LEAD_PILE_SAID[a](row.name, null),
        ...(notFit && why && why !== "other" ? { lastWhy: why } : {}),
        ...(notFit ? { tally: { ...x.tally, notFit: x.tally.notFit + 1 } } : {}),
      }));
      decided([row.id], a, opOf(r.data));
      return true;
    } finally {
      setBusy(false);
    }
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

  const backing = { put, flash, aim, setBusy };

  /** Undo the last thing done. */
  const undo = async () => {
    await giving.current;
    const last = now.current.done.at(-1);
    if (last && !busy) await takeBack(backing, last);
  };

  /** The toast's Undo: the Not a fit it says, whatever was done since. The pile keeps three, so it can have gone. */
  const undoNotFit = async (row: LeadRowVM) => {
    await giving.current;
    const last = notFitOf(now.current.done, row.id);
    if (!last) return flash({ tone: "warn", msg: "Nothing was put back" });
    await takeBack(backing, last);
  };

  return {
    ...p,
    on: !!searchId,
    setPass: (pass: "first" | "later") => put({ pass }),
    busy,
    canUndo: done.length > 0,
    /** The newest thing Undo takes back, in words: "Undo · Added Luxe Lane". */
    undoWords: done.length ? (p.said ?? null) : null,
    start,
    stop,
    /** Another lead to decide on opened while the pile is on: it walks on from there. */
    anchor: (at: string) => put({ from: at }),
    act,
    addOf,
    notFitWhy: (row: LeadRowVM, why: LeadNotAFitWhy) => {
      giving.current = giveWhy({ now, put, flash }, row, why);
    },
    /** Next: past a lead there is nothing to decide on (in a sequence already, talking), writing nothing. */
    skip: (row: LeadRowVM) => {
      if (!busy && searchId) decided([row.id], "next", null);
    },
    addAll,
    undo,
    undoNotFit,
  };
}
export type LeadPile = ReturnType<typeof useLeadPile>;

/**
 * The lead that is up: the first still open in this pass and not decided here a moment ago, from the row the pile was
 * opened on (those above it come after the ones below).
 */
export function usePileUp(rows: readonly LeadRowVM[], pile: LeadPile) {
  return useMemo(() => {
    const at = new Map(rows.map((r, i) => [r.id, i]));
    const anchor = pile.from ? (at.get(pile.from) ?? 0) : 0;
    const open = (pass: "first" | "later") => {
      const all = rows.filter(
        (r) => leadPileOpen(r, { cls: pile.cls, pass }) && !pile.gone.has(r.id) && !pile.held.includes(r.id),
      );
      const below = all.filter((r) => (at.get(r.id) ?? 0) >= anchor);
      return below.length === all.length ? all : [...below, ...all.filter((r) => (at.get(r.id) ?? 0) < anchor)];
    };
    const now = open(pile.pass);
    return { up: now[0] ?? null, open: now, left: now.length, later: pile.pass === "first" ? open("later").length : 0 };
  }, [rows, pile.cls, pile.pass, pile.gone, pile.held, pile.from]);
}
