/**
 * The calls on the line right now, as the Live surface holds them and the heartbeat rule keeps them (Live's own rule,
 * re-applied between refreshes): the queue's rail in Classic (queue.tsx LiveRail) and the strip in Glass (strip.tsx)
 * read the one list, ticking once a second while a call is up.
 */
import { useEffect, useState } from "react";
import type { LiveVM } from "@chanlytics/contracts";
import { borrowed, useMoved } from "../shell";

/** The heartbeat rule's clock: a call's elapsed time moves once a second while a call is up. */
const TICK_MS = 1000;

type LiveCall = LiveVM["now"][number];

/** "1:12": a call's elapsed seconds as the rail and the strip say them. */
export const liveClock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The calls up now, and the moment they are read against. */
export function useLiveNow(): { live: LiveCall[]; nowMs: number } {
  useMoved("live");
  const [nowMs, setNowMs] = useState(Date.now());
  const L = borrowed<LiveVM>("__LIVE");
  const live = L ? L.now.filter((c) => nowMs - (c.heartbeatAtMs || c.startedAtMs || 0) < L.heartbeatMs) : [];
  const count = live.length;
  useEffect(() => {
    if (!count) return undefined;
    const t = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, [count]);
  return { live, nowMs };
}
