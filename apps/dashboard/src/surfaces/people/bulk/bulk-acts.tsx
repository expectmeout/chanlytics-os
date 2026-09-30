/**
 * What a selection can become: people on a list, a yes on record, a note, a receptionist mode, a file (moved from
 * legacy/pages/people.jsx PeopleBulkBar, decision 0015). Adding to a list and recording a yes are owner-or-operator on
 * the server; the bar shows what the role allows and says why when it does not. Each act is a closure over the bar's
 * context, made once per draw, as they were.
 */
import type { ReactNode } from "react";
import { CONSENT_SOURCES, offersYesRefusal } from "@chanlytics/contracts";
import { mayAtLeast, refusalToast } from "../../legacy-verbs";
import type { ReceptionistMany } from "../people-detail";
import {
  appendPersonNotesMany,
  setPersonConsentMany,
  setPersonMarketingConsentMany,
  setPersonReceptionistMany,
} from "../people-detail";
import { lists } from "../people-lists";
import { plMakeListWith, plUndoList } from "../lists/doors";
import { PL_BATCH, plCsv } from "../words";
import { downloadCsv } from "./download";
import type { BulkCtx, BulkProps, BulkState } from "./bulk-state";
import type { SavedList } from "../types";

/** What the bar works out of its props each draw: who is picked and shown, the fifty a press takes, and the yes sources. */
export function bulkCtx(props: BulkProps, st: BulkState): BulkCtx {
  const { sel, rows, acts } = props;
  // What is shown and selected, in the order shown. A person the view no longer shows -- a refresh moved them out of Needs
  // you, say -- is not counted, exported or written to.
  const picked = rows.filter((p) => sel.has(p.id));
  const ids = picked.map((p) => p.id);
  // Fifty at a press: the batch doors take fifty, and a bigger selection keeps the rest selected, said so.
  const batch = ids.slice(0, PL_BATCH);
  const rest = ids.slice(PL_BATCH);
  const restWords = rest.length ? ` · ${rest.length} more still selected — fifty at a time` : "";
  return {
    ...props,
    st,
    keeps: (a) => !acts || acts.includes(a),
    picked,
    ids,
    batch,
    rest,
    restWords,
    isOwner: mayAtLeast("owner"),
    sources: CONSENT_SOURCES.filter((s) => s.id !== "customer_message"),
    // A yes to offers is written (00100), so the only way a desk records one for a whole selection is the form they signed.
    offersSources: CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null).filter(
      (s) => s.id !== "customer_message",
    ),
  };
}

type Outcome = { ok: boolean; message?: string };

/** Runs one act that answers ok or not: busy while it is out, its refusal said, its words said when it took. */
function bulkRun(b: BulkCtx) {
  const { st, flash } = b;
  const { busy, setBusy } = st;
  return async <T extends Outcome>(
    fn: () => Promise<T>,
    done: (r: T) => ReactNode,
    after: ((r: T) => void) | null = null,
  ) => {
    if (busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message || "That did not go through."}</> });
      return;
    }
    flash({ msg: done(r) });
    if (after) after(r);
  };
}
type Run = ReturnType<typeof bulkRun>;

/** People onto a list: an add that says who it really added, a new list made and filled, and the list open left. */
function listActs(b: BulkCtx, run: Run) {
  const { st, flash, ids, batch, rest, restWords, onKeep, onClear, onSheet, activeSaved } = b;
  const { busy, setBusy, setNaming, name, setName } = st;
  // Who an add really adds: the people already on the list stay out of the count and out of the Undo, which takes off
  // only the people this put on.
  const addTo = async (list: SavedList) => {
    if (busy) return;
    const before = new Set(list.members || list.ids);
    const added = ids.filter((id) => !before.has(id));
    if (!added.length) {
      flash({
        tone: "info",
        msg: (
          <>
            Everyone selected is already on <b>{list.name}</b>
          </>
        ),
      });
      return;
    }
    setBusy(true);
    const r = await lists.add(list.id, added);
    setBusy(false);
    if (!r.ok) {
      flash(refusalToast(r, `Not added to ${list.name}`));
      return;
    }
    const already = ids.length - added.length;
    flash({
      msg: (
        <>
          {added.length} added to <b>{list.name}</b>
          {already ? ` · ${already} already on it` : ""}
        </>
      ),
      undo: async () => {
        const u = await lists.drop(list.id, added);
        if (!u.ok) flash(refusalToast(u, `Still on ${list.name}`));
      },
    });
  };
  const createAndAdd = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const made = await plMakeListWith(n, ids);
    if (!made.ok) {
      setBusy(false);
      flash({ tone: "danger", msg: <>{made.message || "Could not make the list."}</> });
      return;
    }
    const { filled, id } = made;
    setBusy(false);
    setNaming(false);
    setName("");
    onSheet(null);
    flash(
      filled.ok
        ? {
            msg: (
              <>
                {ids.length} on the new list <b>{n}</b>
              </>
            ),
            undo: () => plUndoList(id, n, flash),
          }
        : refusalToast(filled, id ? `${n} was not made` : "Not added to the new list"),
    );
  };
  // With a list kept by hand open, the selection can leave it; the people stay.
  const dropFromList = () => {
    if (!activeSaved) return undefined;
    const from = activeSaved;
    return run(
      () => lists.drop(from.id, batch),
      () => (
        <>
          {batch.length} taken off <b>{from.name}</b>
          {restWords}
        </>
      ),
      () => {
        if (rest.length) onKeep(rest);
        else onClear();
      },
    );
  };
  return { addTo, createAndAdd, dropFromList };
}

/** A yes recorded for a whole class at once -- and WHICH yes, because they are two separate answers and only one of them puts a person on a broadcast. */
function yesActs(b: BulkCtx, run: Run) {
  const { st, batch, rest, restWords, onKeep, onSheet } = b;
  const { busy, slips, setSlips, slipsNote, setSlipsNote } = st;
  const keepRest = () => {
    if (rest.length) onKeep(rest);
  };
  const yes = (
    purpose: "conversational" | "marketing",
    source: { id: string; label: string },
    note2: string | null = null,
  ) => {
    const send = purpose === "marketing" ? setPersonMarketingConsentMany : setPersonConsentMany;
    return run(
      () =>
        send(
          batch,
          note2 ? { consent: "opted_in", source: source.id, note: note2 } : { consent: "opted_in", source: source.id },
        ),
      (r) => (
        <>
          {purpose === "marketing" ? "A yes to offers" : "A yes to messages"} on record for <b>{r.done}</b>
          {r.failed ? ` · ${r.failed} not recorded` : ""} · {source.label.toLowerCase()}
          {restWords}
        </>
      ),
      keepRest,
    );
  };
  const yesBy = (purpose: "conversational" | "marketing", s: { id: string; label: string }) =>
    s.id === "form"
      ? () => {
          setSlips({ purpose, source: s });
          setSlipsNote("");
        }
      : () => yes(purpose, s);
  const closeSlips = () => {
    setSlips(null);
    setSlipsNote("");
    onSheet(null);
  };
  const recordSlips = () => {
    const line = slipsNote.trim();
    if (!line || !slips || busy) return undefined;
    closeSlips();
    return yes(slips.purpose, slips.source, line);
  };
  return { yes, yesBy, closeSlips, recordSlips };
}

/** A mode for the receptionist and a note for the selection, one request each; and the selection as a file. */
function personActs(b: BulkCtx) {
  const { st, flash, batch, rest, restWords, onKeep, onClear, onSheet, picked } = b;
  const { busy, setBusy, setNoting, note, setNote } = st;
  const exportCsv = () => {
    downloadCsv(`people-${new Date().toISOString().slice(0, 10)}.csv`, plCsv(picked));
    flash({ msg: <>{picked.length} exported as a CSV</> });
  };
  const receptionist = async (m: { id: ReceptionistMany; label: string }) => {
    setBusy(true);
    const r = await setPersonReceptionistMany(batch, m.id);
    setBusy(false);
    flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok ? (
        <>
          Receptionist: <b>{m.label}</b> for {r.done} {r.done === 1 ? "person" : "people"}
          {restWords}
        </>
      ) : (
        <>{r.message}</>
      ),
    });
    if (r.ok) {
      if (rest.length) onKeep(rest);
      else onClear();
    }
  };
  const addNote = async () => {
    const line = note.trim();
    if (!line || busy) return;
    setBusy(true);
    const r = await appendPersonNotesMany(batch, line);
    setBusy(false);
    flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok ? (
        <>
          Noted on {r.done} {r.done === 1 ? "person" : "people"}: <b>{line}</b>
          {restWords}
        </>
      ) : (
        <>{r.message}</>
      ),
    });
    if (r.ok) {
      setNoting(false);
      setNote("");
      onSheet(null);
      if (rest.length) onKeep(rest);
      else onClear();
    }
  };
  return { exportCsv, receptionist, addNote };
}

/** The bar's acts, over one draw's context. */
export function bulkActs(b: BulkCtx) {
  const run = bulkRun(b);
  return { ...listActs(b, run), ...yesActs(b, run), ...personActs(b) };
}
export type BulkActs = ReturnType<typeof bulkActs>;
