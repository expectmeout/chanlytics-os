/**
 * The Inbox's bulk acts (moved from pages/inbox.jsx, decision 0015, step 3): a bulk act on real threads as one act
 * through the bulk courier, with its busy state, its count, its refusals and its Undo (the run is pick.tsx's, which
 * Conversations runs too); and the bulk bar's acts, Approve all safe, the reader's mark, Snooze and Archive, each over
 * the selection.
 */
import { CONF, IX_NOW } from "../constants";
import { patched, type InboxSoFar } from "./inbox-state";
import type { InboxActs } from "./inbox-acts";
import { pickMark, pickRun } from "./pick";
import { threadReading, threadUnread } from "../../seen";
import { canDo } from "../shell";
import { IX_STORE } from "../store";
import type { Approval, Picked, RealThread, SeededThread, Thread } from "../types";

/** A real thread picked, as the pick's acts read it. */
const threadPicked = (t: RealThread): Picked => ({
  id: t.id,
  who: t.who,
  conversationId: t.conversationId,
  personId: t.clientId ?? null,
  unread: threadUnread(t),
  reading: threadReading(t),
  snoozed: t.state === "snoozed",
  archived: !!t.archived,
});

/**
 * A bulk act on real threads, as one act through the bulk courier: its busy state, its count, its refusals, its Undo.
 * The run is the pick's own (pick.tsx pickRun); this hands it the Inbox's threads as the rows picked.
 */
export const inboxRealBulk = (ix: InboxSoFar & InboxActs) => {
  const { threads, selected, setSelected, setBulkBusy, bulkRunRef, ppFlash } = ix;
  const run = pickRun({ setSelected, setBusy: setBulkBusy, running: bulkRunRef, flash: ppFlash });
  const realPicks = (): Picked[] =>
    selected
      .map((id) => threads.find((t) => t.id === id))
      .filter((t): t is RealThread => !!(t && t.real))
      .map(threadPicked);
  const bulkReal = (verb: "snooze" | "archive") => run.act(realPicks(), verb);
  /** The reader's own mark over the real threads picked, as the bar offers it: null with nobody behind them. */
  const realMark = () => {
    const mark = pickMark(realPicks());
    return mark && { seen: mark.seen, press: () => run.mark(mark) };
  };
  const isRealPick = () => selected.some((id) => threads.find((t) => t.id === id)?.real);
  return { bulkReal, realMark, isRealPick };
};

export type InboxRealBulk = ReturnType<typeof inboxRealBulk>;

/** A seeded thread whose plan may be approved in bulk: safe to send, and not yet decided. */
type SafePick = SeededThread & { approval: Approval };

/** The bulk bar's acts: Approve all safe, the reader's mark, Snooze and Archive, each over the selection. */
export const inboxBulkActs = (ix: InboxSoFar & InboxActs & InboxRealBulk) => {
  const {
    threads,
    selected,
    setSelected,
    flash,
    mutate,
    ppFlash,
    snooze,
    archiveThread,
    bulkReal,
    realMark,
    isRealPick,
  } = ix;
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
  /**
   * The mark the bar offers over the selection (pick.tsx pickMark), and its press: the reader's own mark on the person
   * behind a real thread; on a seeded one the page's own flag, which every seeded thread has.
   */
  const bulkMark = (() => {
    if (isRealPick()) return realMark();
    const seeded = selected.flatMap((id) => threads.find((t) => t.id === id) ?? []);
    const mark = pickMark(seeded.map((t) => ({ personId: t.id, unread: t.unread })));
    if (!mark) return null;
    const { seen, whom } = mark;
    const press = () => {
      whom.forEach((t) => mutate(t.personId, (x) => ({ ...x, unread: !seen })));
      ppFlash({
        msg: (
          <>
            <b>{whom.length}</b> marked as {seen ? "read" : "unread"}
          </>
        ),
      });
      setSelected([]);
    };
    return { seen, press };
  })();
  return { bulkApproveSafe, bulkSnooze, bulkArchive, bulkMark };
};
