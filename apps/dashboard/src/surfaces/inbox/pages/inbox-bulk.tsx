/**
 * The Inbox's bulk acts (moved from pages/inbox.jsx, decision 0015, step 3): a bulk act on real threads as one act
 * through the bulk courier, with its busy state, its count, its refusals and its Undo; and the bulk bar's three acts,
 * Approve all safe, Snooze and Archive, each over the selection.
 */
import { CONF, IX_NOW } from "../constants";
import { patched, type InboxSoFar } from "./inbox-state";
import type { InboxActs } from "./inbox-acts";
import { ixRefusedWords } from "../rules";
import { canDo } from "../shell";
import { IX_STORE, OWN_VERBS } from "../store";
import type { Approval, RealThread, SeededThread, Thread } from "../types";
import { inboxBulk, type BulkVerb } from "../verbs";

/** A bulk act on real threads, as one act through the bulk courier: its busy state, its count, its refusals, its Undo. */
export const inboxRealBulk = (ix: InboxSoFar & InboxActs) => {
  const { threads, selected, setSelected, setBulkBusy, bulkRunRef, ppFlash } = ix;
  // A bulk act on real threads is one act. Each thread went through the single verb: a toast apiece on a
  // stack that keeps three, a re-read of three surfaces apiece, no count, no busy state and no Undo (the
  // wiring audit's A19). Now one ask per thread through the bulk courier and one re-read at its end, one
  // toast with the count and each refusal named, and the refused left selected to try again.
  const runBulk = async (picks: RealThread[], verb: BulkVerb) => {
    if (bulkRunRef.current) return null;
    bulkRunRef.current = true;
    setBulkBusy(verb);
    // One of your own acts: its re-read is not news for the open pane (thread-pane.tsx counts these).
    OWN_VERBS.n += 1;
    try {
      return await inboxBulk(picks, verb);
    } finally {
      OWN_VERBS.n -= 1;
      bulkRunRef.current = false;
      setBulkBusy(null);
    }
  };
  const wakeAgain = async (snoozed: RealThread[]) => {
    const r = await runBulk(snoozed, "wake");
    if (!r) return;
    ppFlash(
      r.refused.length
        ? {
            tone: "danger",
            msg: (
              <>
                <b>
                  {r.done.length} of {snoozed.length}
                </b>{" "}
                woken — {ixRefusedWords(r.refused)}
              </>
            ),
          }
        : // A snooze lets go of whoever had the thread (core snooze clears the claim and the pause), so waking it
          // brings it back to the Inbox, not back where it was (I2).
          {
            msg: (
              <>
                Snooze undone — <b>{r.done.length}</b> back in the Inbox
              </>
            ),
          },
    );
  };
  const bulkReal = async (verb: "snooze" | "archive") => {
    if (!canDo("approve")) return;
    const picks = selected
      .map((id) => threads.find((t) => t.id === id))
      .filter((t): t is RealThread => !!(t && t.real));
    const todo = picks.filter((t) => (verb === "snooze" ? t.state !== "snoozed" : !t.archived));
    if (!todo.length) {
      ppFlash({
        tone: "info",
        msg: <>{verb === "snooze" ? "Those are snoozed already" : "Those are archived already"}</>,
      });
      return;
    }
    const r = await runBulk(todo, verb);
    if (!r) return;
    setSelected(r.refused.map((x) => x.thread.id));
    const past = verb === "snooze" ? "snoozed" : "archived";
    const undo = verb === "snooze" && r.done.length ? () => wakeAgain(r.done) : null;
    if (r.refused.length) {
      ppFlash({
        tone: "danger",
        msg: (
          <>
            {r.done.length ? (
              <>
                <b>
                  {r.done.length} of {todo.length}
                </b>{" "}
                {past}
              </>
            ) : (
              <>Nothing was {past}</>
            )}{" "}
            — {ixRefusedWords(r.refused)}
          </>
        ),
        undo,
      });
    } else {
      ppFlash({
        msg:
          verb === "snooze" ? (
            <>
              <b>{r.done.length}</b> snoozed until tomorrow 10:00
            </>
          ) : (
            <>
              <b>{r.done.length}</b> archived — if they write again, they come back
            </>
          ),
        undo,
      });
    }
  };
  const isRealPick = () => selected.some((id) => threads.find((t) => t.id === id)?.real);
  return { bulkReal, isRealPick };
};

export type InboxRealBulk = ReturnType<typeof inboxRealBulk>;

/** A seeded thread whose plan may be approved in bulk: safe to send, and not yet decided. */
type SafePick = SeededThread & { approval: Approval };

/** The bulk bar's three acts: Approve all safe, Snooze and Archive, each over the selection. */
export const inboxBulkActs = (ix: InboxSoFar & InboxActs & InboxRealBulk) => {
  const { threads, selected, setSelected, flash, mutate, ppFlash, snooze, archiveThread, bulkReal, isRealPick } = ix;
  // Bulk actions
  const bulkApproveSafe = () => {
    const picks = selected.map((id) => threads.find((t) => t.id === id)).filter((t): t is Thread => !!t);
    if (!canDo("approve")) return;
    const safe = picks.filter(
      (t): t is SafePick => !!t.approval && (t.confidence ?? 0) >= CONF.SAFE && t.state !== "done",
    );
    safe.forEach((t) => {
      IX_STORE.set(t.id, { action: t.approval.recommended, at: IX_NOW, kind: "decided" });
      mutate(t.id, (x) => ({
        ...x,
        state: "done",
        unread: false,
        resolution: { action: t.approval.recommended, at: IX_NOW },
        timeline: [
          ...x.timeline,
          {
            type: "event",
            kind: "decision",
            at: IX_NOW,
            body: `You approved “${t.approval.plan.label || t.approval.recommended}” (bulk) — ${x.agent.name} is executing`,
          },
        ],
      }));
    });
    flash(
      safe.length === 0
        ? "None are safe to bulk-approve — all below 80% confidence"
        : `${safe.length} approved · ${picks.length - safe.length} need${picks.length - safe.length === 1 ? "s" : ""} individual review`,
    );
    setSelected([]);
  };
  const bulkSnooze = (): Promise<void> | void => {
    if (isRealPick()) return bulkReal("snooze");
    const prevs = selected
      .map((id) => snooze(id, "tomorrow 10:00", { silent: true }))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (prevs.length)
      ppFlash({
        msg: (
          <>
            <b>{prevs.length}</b> snoozed · wake tomorrow 10:00
          </>
        ),
        undo: () =>
          prevs.forEach((p) => {
            IX_STORE.clear(p.id);
            mutate(p.id, (x) =>
              patched(x, {
                state: p.state,
                timeline: p.timeline,
                resolution: p.resolution,
                unread: p.unread,
                wake: undefined,
              }),
            );
          }),
      });
    setSelected([]);
  };
  const bulkArchive = (): Promise<void> | void => {
    if (isRealPick()) return bulkReal("archive");
    const prevs = selected
      .map((id) => archiveThread(id, { silent: true }))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (prevs.length)
      ppFlash({
        msg: (
          <>
            <b>{prevs.length}</b> archived
          </>
        ),
        undo: () =>
          prevs.forEach((p) => {
            IX_STORE.clear(p.id);
            mutate(p.id, (x) =>
              patched(x, { state: p.state, timeline: p.timeline, resolution: p.resolution, unread: p.unread }),
            );
          }),
      });
    setSelected([]);
  };
  return { bulkApproveSafe, bulkSnooze, bulkArchive };
};
