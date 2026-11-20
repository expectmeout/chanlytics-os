/**
 * The questions Today hands AI (Today, calm, 19 Nov 2026, D10): AI opens on questions written from the lines of the page
 * it was opened on. Each part of Today that draws a line says the question its line asks, as it draws (surfaces/today/calm/
 * asks.ts), and takes it back as it leaves; AI reads them as it builds what it offers (palette.ts suggestions). Held here,
 * in the bridge, since the page and AI are two surfaces and neither imports the other. Nothing is kept on the window.
 */
import { todayAsksOf, type TodayAsk } from "@chanlytics/contracts";

/** Today's parts that write a question, in the order their lines stand on the page. */
export const TODAY_ASK_PARTS = ["waits", "day", "found", "content", "did"] as const;
export type TodayAskPart = (typeof TODAY_ASK_PARTS)[number];

const said = new Map<TodayAskPart, readonly TodayAsk[]>();

/** A part of Today says the questions its lines ask, or takes them back with none. */
export function setTodayAsks(part: TodayAskPart, asks: readonly TodayAsk[]): void {
  if (asks.length) said.set(part, asks);
  else said.delete(part);
}

/** The questions Today holds now, in the page's order, three at most; none where Today is not on screen. */
export function todayAsks(): TodayAsk[] {
  return todayAsksOf(TODAY_ASK_PARTS.flatMap((part) => said.get(part) ?? []));
}
