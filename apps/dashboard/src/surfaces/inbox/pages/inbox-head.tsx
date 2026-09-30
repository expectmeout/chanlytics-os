/**
 * Where the Inbox stands, said to the frame's head in Glass (the plan's step 5.4, canvases I1 and I2): how many threads
 * wait on you, and either the oldest's hour or the drafts on their way. The frame draws the head (kit/head/frame-head.tsx)
 * with the page's name and the date; the page says only the sentence. The same head stands over Conversations, which
 * is the same surface's other tab.
 *
 * The sentence is counted from the threads the page holds, by the rules the sidebar's badge and the tabs read
 * (rules.ts), so no two of them say different numbers.
 */
import { MIN_MS } from "@chanlytics/contracts";
import { useMinute } from "../../kit/head/dateline";
import { useStanding } from "../../kit/head/standing";
import { useSurface } from "../../use-surface";
import { ixSending, ixWaitsOnYou } from "../rules";
import { clockZone } from "../shell";
import { inboxData } from "../store";
import type { Thread } from "../types";

/**
 * Where the Inbox stands, in one line: "4 need you · the oldest since 2:26 PM", or with replies counting down to send,
 * "5 need you · 1 draft on its way", or "Nothing needs you". A draft on its way is a thread that waits on you for its
 * seconds, so it is among the ones who need you.
 */
export function inboxStanding(threads: Thread[], nowMs: number, zone: string): string {
  const waiting = threads.filter((t) => ixWaitsOnYou(t, nowMs));
  const drafts = waiting.filter((t) => ixSending(t, nowMs)).length;
  const oldestMin = Math.max(0, ...waiting.map((t) => t.waitingMin ?? 0));
  const first = waiting.length ? `${waiting.length} need you` : "Nothing needs you";
  if (drafts) return `${first} · ${drafts} ${drafts === 1 ? "draft" : "drafts"} on its way`;
  if (waiting.length && oldestMin > 0) {
    const since = new Date(nowMs - oldestMin * MIN_MS).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
    });
    return `${first} · the oldest since ${since}`;
  }
  return first;
}

/** The Inbox's standing, said to the frame's head as the page draws (in Glass the frame draws it; Classic has no head). */
export function useInboxStanding(): void {
  useSurface("inbox");
  const now = useMinute();
  useStanding({ title: "Inbox", sentence: inboxStanding(inboxData().THREADS, now, clockZone()) });
}
