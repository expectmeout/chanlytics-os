/**
 * A part of Today hands AI the questions its lines ask (Today, calm, D10): said as the part draws them, taken back as it
 * leaves, so AI opened from Today offers questions about what the page shows now (bridge/ask/page-asks.ts holds them).
 */
import { useEffect, useRef } from "react";
import { setTodayAsks, type TodayAsk, type TodayAskPart } from "@/bridge/ask/page-asks";

/** Say this part's questions, in its lines' order; a line with no question hands null and is left out. */
export function useTodayAsks(part: TodayAskPart, asks: ReadonlyArray<TodayAsk | null>): void {
  // Said by their words, so a draw that asks the same things says nothing again.
  const kept = asks.filter((a): a is TodayAsk => a !== null);
  const latest = useRef(kept);
  latest.current = kept;
  const words = JSON.stringify(kept);
  useEffect(() => {
    setTodayAsks(part, latest.current);
    return () => setTodayAsks(part, []);
  }, [part, words]);
}

/** A question whose row says the words asked. */
export const todayAskOf = (words: string): TodayAsk => ({ label: words, q: words });
