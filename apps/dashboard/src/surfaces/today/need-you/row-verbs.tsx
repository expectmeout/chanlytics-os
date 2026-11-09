/**
 * What a reply and a call back share (decision 0071): Not now, which snoozes the thread until a time on the business's clock and
 * their next message brings back sooner (00005), and Mark done, which gives the thread back to the receptionist.
 */
import { useMemo, useState } from "react";
import { NEED_YOU_WORDS as W, notNowChoices } from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/bridge/verbs/commit";
import type { WorkProps } from "./parts";
import { useRowState } from "./row-state";

/** A thread snoozed from its row, and the record its Wake sends. */
export interface Snoozed {
  back: string;
  record: Record<string, unknown>;
}

/** Not now on a thread: the snooze's choices, and what choosing one does, or a time of the page's own (Back at 4 PM). */
export function useNotNow(p: WorkProps, setSnoozed: (s: Snoozed) => void) {
  const { row, tz, flash, keep, unkeep } = p;
  // The times as they stand when the menu opens (`fresh`, its trigger's press): a Today left open all day never offers an
  // hour, or an afternoon, already gone.
  const [at, setAt] = useState(() => Date.now());
  const choices = useMemo(() => notNowChoices(tz, at), [tz, at]);
  const [busy, setBusy] = useState(false);
  const until = async (when: string, back: string) => {
    if (!row.conversationId) return;
    setBusy(true);
    // Kept before the door is asked: its refresh drops the thread from the read, and the row must stay to say so.
    keep(row);
    const r = await commitVerb("thread_verb", {
      verb: "snooze",
      conversation_id: row.conversationId,
      until: when,
      who: row.who,
    });
    setBusy(false);
    if (!r.ok) {
      unkeep(row);
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    setSnoozed({ back, record: r.undo ?? {} });
  };
  const choose = async (i: number) => {
    // The time pressed, as it stands at the press: the menu may have been drawn a while before.
    const c = notNowChoices(tz, Date.now()).find((x) => x.key === choices[i]?.key) ?? choices[i];
    if (c) await until(c.until, c.back);
  };
  const closes = row.writes?.window_closes;
  const caption = [W.backSooner(row.who), closes ? W.windowCloses(closes) : ""].filter(Boolean).join(" ");
  return { choices, choose, until, busy, caption, fresh: () => setAt(Date.now()) };
}

/**
 * Mark done on one row (2 Nov 2026: a row was let go only by Mark all done, once a week old): the hold resolved and the
 * thread the receptionist's again (core handBack, as Mark all done and a call back's Reached do), so it answers them if
 * they write; Undo takes the thread over again (the verb's own inverse). A hold's row alone, a handoff or a reach-out's
 * reply read, a call back (8 Nov 2026: its note says to mark one done, and nothing there did): a closing window and a reply
 * counting down hold nothing to give back.
 */
export function useMarkDone(work: WorkProps) {
  const { row, flash, keep, unkeep } = work;
  const [done, setDone] = useRowState<Record<string, unknown> | null>(row.id, "markedDone", null);
  const may =
    work.may && !!row.conversationId && (row.kind === "handoff" || row.kind === "reply" || row.kind === "callback");
  const mark = async () => {
    if (!row.conversationId) return;
    // Kept before the door is asked: its refresh drops the hold from the read, and the row must stay to say so.
    keep(row);
    const r = await commitVerb("thread_verb", {
      verb: row.closes ?? "hand_back",
      conversation_id: row.conversationId,
      who: row.who,
    });
    if (!r.ok) {
      unkeep(row);
      return flash({ tone: "danger", msg: <>{r.message}</> });
    }
    setDone(r.undo ?? {});
  };
  const undo = async () => {
    if (!done) return;
    const r = await undoVerb("thread_verb", done);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setDone(null);
    unkeep(row);
  };
  return { done: done !== null, mark: may ? () => void mark() : null, undo: () => void undo() };
}
