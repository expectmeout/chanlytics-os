/**
 * The questions Today hands AI (Today, calm, 19 Nov 2026, D10): AI opens on questions written from the lines of the page
 * it was opened on. Each part of Today that draws a line says the question its line asks, as it draws (surfaces/today/calm/
 * asks.ts), and takes it back as it leaves; AI reads them as it builds what it offers (palette.ts suggestions). Held here,
 * in the bridge, since the page and AI are two surfaces and neither imports the other. Nothing is kept on the window.
 */
import type { SuggestionInput } from "@chanlytics/contracts";

/**
 * A question AI offers from a line of Today (D10): what its row says, and the words asked, which say more where the
 * line has numbers behind it (what AI found asks with its arithmetic). The shape AI's own suggestions take it in.
 */
export type TodayAsk = NonNullable<SuggestionInput["pageAsks"]>[number];

/** How many questions AI opens on from Today. */
export const TODAY_ASKS_MAX = 3;

/**
 * The questions AI opens on from Today: one for each line that has one, in the order the lines stand on the page, none
 * said twice, three at most. No line, no question: a quiet page hands AI none, and AI opens as it does anywhere.
 */
export function todayAsksOf(lines: ReadonlyArray<TodayAsk | null>): TodayAsk[] {
  const asks: TodayAsk[] = [];
  for (const line of lines) {
    if (!line || !line.label.trim() || asks.some((a) => a.label === line.label)) continue;
    asks.push(line);
    if (asks.length === TODAY_ASKS_MAX) break;
  }
  return asks;
}

/** Today's parts that write a question, in the order their lines stand on the page. */
export const TODAY_ASK_PARTS = ["waits", "day", "found", "content", "did"] as const;
export type TodayAskPart = (typeof TODAY_ASK_PARTS)[number];

const asksByPart = new Map<TodayAskPart, readonly TodayAsk[]>();

/** A part of Today says the questions its lines ask, or takes them back with none. */
export function setTodayAsks(part: TodayAskPart, asks: readonly TodayAsk[]): void {
  if (asks.length) asksByPart.set(part, asks);
  else asksByPart.delete(part);
}

/** The questions Today holds now, in the page's order, three at most; none where Today is not on screen. */
export function todayAsks(): TodayAsk[] {
  return todayAsksOf(TODAY_ASK_PARTS.flatMap((part) => asksByPart.get(part) ?? []));
}

/** The questions the page on screen hands AI as AI opens on it: Today's, and none from any other page. */
export const pageAsksOn = (surface: string | null | undefined): TodayAsk[] => (surface === "today" ? todayAsks() : []);
