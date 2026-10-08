/**
 * Where the Inbox stands, said to the frame's head in Glass (the plan's step 5.4, canvases I1 and I2): how many threads
 * wait on you, and either the oldest's hour or the drafts on their way. The frame draws the head (kit/head/frame-head.tsx)
 * with the page's name and the date; the page says only the sentence. The same head stands over Conversations, which
 * is the same surface's other tab.
 *
 * The sentence is counted from the threads the page holds, by the rules the sidebar's badge and the tabs read
 * (rules.ts), so no two of them say different numbers.
 */
import type { ReactNode } from "react";
import { MIN_MS, tzSince } from "@chanlytics/contracts";
import { useMinute } from "../../kit/head/dateline";
import { useStanding } from "../../kit/head/standing";
import { useSurface } from "../../use-surface";
import { ixSending, ixWaitsOnYou } from "../rules";
import { clockZone } from "../shell";
import { inboxData } from "../store";
import type { Thread } from "../types";

/**
 * When a thread's wait began, epoch ms: the escalation's own time on a real thread, which does not move with the clock,
 * else the minutes its row says it has waited (a seeded thread has no escalation to read). Null for a thread with no
 * wait yet, such as a reply counting down.
 */
const waitBegan = (t: Thread, nowMs: number): number | null =>
  t.escalatedAtMs ?? (t.waitingMin ? nowMs - t.waitingMin * MIN_MS : null);

/**
 * Where the Inbox stands, in one line: "4 need you · the oldest since 2:26 PM", or with replies counting down to send,
 * "5 need you · 1 draft on its way", or "Nothing needs you". A draft on its way is a thread that waits on you for its
 * seconds, so it is among the ones who need you. The oldest's time says its day when it is not today, as Today's
 * headline says the same wait ("since yesterday 8:00 AM"): a bare hour read as this morning's on a wait of three days.
 */
export function inboxStanding(threads: Thread[], nowMs: number, zone: string): string {
  const waiting = threads.filter((t) => ixWaitsOnYou(t, nowMs));
  const drafts = waiting.filter((t) => ixSending(t, nowMs)).length;
  const began = waiting.map((t) => waitBegan(t, nowMs)).filter((ms): ms is number => ms !== null);
  const first = waiting.length ? `${waiting.length} need you` : "Nothing needs you";
  if (drafts) return `${first} · ${drafts} ${drafts === 1 ? "draft" : "drafts"} on its way`;
  if (began.length) {
    const since = tzSince(new Date(Math.min(...began)).toISOString(), zone, new Date(nowMs));
    return since ? `${first} · the oldest since ${since}` : first;
  }
  return first;
}

/**
 * The Inbox's standing, said to the frame's head as the page draws (in Glass the frame draws it; Classic has no head),
 * with the page's one act at the right of the row of views (New conversation, new-conversation/act.tsx).
 */
export function useInboxStanding(act?: ReactNode): void {
  useSurface("inbox");
  const now = useMinute();
  // A thread opens beside the list, never over it, so the head has no way back above the name (canvas I1).
  useStanding({ title: "Inbox", sentence: inboxStanding(inboxData().THREADS, now, clockZone()), back: null, act });
}
