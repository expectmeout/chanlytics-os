/**
 * A part of Today hands AI the questions its lines ask (Today, calm, D10): said as the part draws them, taken back as it
 * leaves, so AI opened from Today offers questions about what the page shows now (bridge/ask/page-asks.ts holds them).
 */
import { useEffect } from "react";
import type { TodayAsk } from "@chanlytics/contracts";
import { setTodayAsks, type TodayAskPart } from "@/bridge/ask/page-asks";

/** Say this part's questions, in its lines' order; a line with no question hands null and is left out. */
export function useTodayAsks(part: TodayAskPart, asks: ReadonlyArray<TodayAsk | null>): void {
  // By their words, so a draw that asks the same things says nothing again.
  const words = JSON.stringify(asks.filter((a): a is TodayAsk => a !== null));
  useEffect(() => {
    setTodayAsks(part, JSON.parse(words) as TodayAsk[]);
    return () => setTodayAsks(part, []);
  }, [part, words]);
}

/** A question whose row says the words asked. */
export const askOf = (words: string): TodayAsk => ({ label: words, q: words });
