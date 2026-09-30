/**
 * What Glass puts above the Inbox (the plan's step 5.4, canvases I1 and I2): the date and time in the business's zone,
 * the page's name, and where it stands: how many threads wait on you and either the oldest's hour or the drafts on
 * their way. Drawn by `<Glass>` in the routes, so Classic has none of it, and by the kit's PageHead. The same head stands
 * over Conversations, which is the same surface's other tab.
 *
 * The sentence is counted from the threads the page holds, by the rules the sidebar's badge and the tabs read
 * (rules.ts), so no two of them say different numbers.
 */
import { useEffect, useState } from "react";
import { MIN_MS } from "@chanlytics/contracts";
import { PageHead } from "../../kit/head/page-head";
import { useSurface } from "../../use-surface";
import { ixSending, ixWaitsOnYou } from "../rules";
import { clockZone } from "../shell";
import { inboxData } from "../store";
import type { Thread } from "../types";

/** "Friday, October 2 · 4:02 PM", in the business's zone (the head says it in capitals). */
export function inboxDateline(nowMs: number, zone: string): string {
  const at = new Date(nowMs);
  const day = at.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: zone });
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone });
  return `${day} · ${time}`;
}

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

/** The moment now, said again each minute: a date and time that stood still would be wrong by the time it was read. */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), MIN_MS);
    return () => clearInterval(tick);
  }, []);
  return now;
}

export function InboxHead() {
  useSurface("inbox");
  const now = useMinute();
  const zone = clockZone();
  return (
    <PageHead
      dateline={inboxDateline(now, zone)}
      title="Inbox"
      sentence={inboxStanding(inboxData().THREADS, now, zone)}
    />
  );
}
