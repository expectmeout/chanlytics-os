/**
 * Today's lines, in words (Today, calm, 19 Nov 2026, D2 and D3): under the page's one card everything else is a line, what
 * it is in a few words and one quieter line under it. Here are the two lines no part of the page said before: what the day
 * came to so far, which the four figures said as four numbers, and Content, which was a strip of pictures. A zero is not
 * said: a fact of nothing is left out, and a line with nothing to say is no line (null). A count that could not be read
 * is not said either, never drawn as a zero.
 *
 * Each fact is said as the read counts it: the messages are the ones AI answered, the calls are every call of the day
 * (one that reached voicemail is a call, and nobody answered it), so the calls are never said as answered.
 *
 * Today's own words (the surface's model, as CLAUDE.md has a page keep what no other tree says): the dashboard alone
 * reads them. The questions AI opens on from them are the bridge's (bridge/ask/page-asks.ts), where AI reads them too.
 */
import type { TodayFigureVM } from "@chanlytics/contracts";

/** A line's two sentences: what it is, and the quieter line under it, null where it has none. */
interface TodayLineWords {
  title: string;
  sub: string | null;
}

const some = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The words of Today's lines, and of its end. */
export const TODAY_LINE_WORDS = {
  /** What AI answered, which leads the day's line where there is any. */
  answered: (n: number): string => `AI answered ${some(n, "message", "messages")}`,
  /** Each of the day's other counts, as it leads the line (`first`) and as it stands under it. */
  calls: (n: number, first: boolean): string => `${some(n, "call", "calls")}${first ? " today" : ""}`,
  booked: (n: number, first: boolean): string => `${n} booked${first ? " today" : ""}`,
  fresh: (n: number, first: boolean): string => `${some(n, "new person", "new people")}${first ? " today" : ""}`,
  /** Content: the week's new pieces, videos said as videos where they all are. */
  videos: (n: number): string => `${some(n, "new video", "new videos")} this week`,
  pieces: (n: number): string => `${n} new this week`,
  making: (n: number): string => `${some(n, "video", "videos")} being made`,
  newest: (name: string): string => `Newest: ${name}`,
  /**
   * The one line for everything past the lines Today names (D16): its name, each kind left as it stands under the name,
   * and as the door it opens to once the line is pressed.
   */
  also: "Also on your list",
  moreWaiting: (n: number): string => `${n} more waiting`,
  toDo: (n: number): string => `${n} to do`,
  toMark: (n: number): string => `${n} to mark`,
  older: (n: number): string => `${n} older`,
  olderThanAWeek: (n: number): string => `${n} older than a week`,
  setAside: (n: number): string => `${n} set aside by AI`,
  /** What AI found past the lines drawn (D20): how many more, on the line that opens them. */
  foundMore: (n: number): string => `${n} more AI found`,
  /** The day's line once the day has turned (D19): when tomorrow starts, who is first under it. */
  tomorrowStarts: (when: string): string => `Tomorrow starts at ${when}`,
  /**
   * An open hour with nothing to press, said on the day's line (the second look, L3): its time and how long, from its own
   * title ("Open · 30 min" at 9 AM is "Open at 9 AM, 30 min").
   */
  openAt: (time: string, title: string): string => {
    const [, long] = title.split(" · ");
    return long ? `Open at ${time}, ${long}` : `Open at ${time}`;
  },
  /** What was finished while the page has been open, for a reader: the name of the list its lines stand in. */
  doneHere: "Done just now",
  /**
   * The questions AI opens on from Today (D10), each written from a line the page shows: who waits, the day, the
   * week's new pieces, what AI answered. What AI found asks its own, written beside its head (today/leaks.ts).
   */
  asks: {
    person: (name: string): string => `What does ${name} want?`,
    day: "What is left of today?",
    tomorrow: "What is on tomorrow?",
    videos: "Which video should I post first?",
    pieces: "What should I post first?",
    did: "What did AI answer today?",
  },
  /** The page's last line, once nothing is left to do. */
  end: "That’s everything.",
} as const;

/** How many lines of who waits Today names under its card (D16): past them, one line counts what is left. */
export const TODAY_NAMED_MAX = 3;

/** What is left past the lines Today names, by kind. */
export interface TodayAlsoCounts {
  /** People and asks that need you, past the named. */
  waiting: number;
  /** The team's to-dos due, and the reviews to answer. */
  toDo: number;
  /** The visits nobody has marked. */
  toMark: number;
  /** Whoever has waited past a week. */
  older: number;
  /** What AI set aside as not a customer's: it waits on nobody, so the line says it only where nothing else is left. */
  setAside: number;
}

/**
 * The one line for what is left (D16): its name, and how many of each kind under it, the kinds in the page's own order.
 * Null with nothing left at all.
 */
export function alsoWords(left: TodayAlsoCounts): TodayLineWords | null {
  const parts = [
    left.waiting > 0 ? TODAY_LINE_WORDS.moreWaiting(left.waiting) : null,
    left.toDo > 0 ? TODAY_LINE_WORDS.toDo(left.toDo) : null,
    left.toMark > 0 ? TODAY_LINE_WORDS.toMark(left.toMark) : null,
    left.older > 0 ? TODAY_LINE_WORDS.older(left.older) : null,
  ].filter((part): part is string => part !== null);
  if (parts.length) return { title: TODAY_LINE_WORDS.also, sub: parts.join(" · ") };
  return left.setAside > 0 ? { title: TODAY_LINE_WORDS.also, sub: TODAY_LINE_WORDS.setAside(left.setAside) } : null;
}

/** A figure's count where it was read and is more than nothing; null for a zero and for a count that could not be read. */
function figureCountOf(figures: readonly TodayFigureVM[], id: TodayFigureVM["id"]): number | null {
  const value = figures.find((f) => f.id === id)?.value ?? null;
  return value !== null && value > 0 ? value : null;
}

/**
 * What the day came to so far, one line (D3): what AI answered first, then the calls, what was booked and who is new,
 * each only where there is any. The first of them is the line, the rest stand under it. Null on a day with nothing yet.
 * A number is said once (D18): a count the head's sentence has already said (`said`: once the day has turned, what was
 * booked and what AI answered) is left out here, and a line with nothing else to say is no line.
 */
export function dayCameToWords(
  all: readonly TodayFigureVM[],
  saidAbove: ReadonlyArray<TodayFigureVM["id"]>,
): TodayLineWords | null {
  const figures = all.filter((figure) => !saidAbove.includes(figure.id));
  const answered = figureCountOf(figures, "answered");
  const facts: Array<(first: boolean) => string> = [];
  if (answered !== null) facts.push(() => TODAY_LINE_WORDS.answered(answered));
  const calls = figureCountOf(figures, "calls");
  if (calls !== null) facts.push((first) => TODAY_LINE_WORDS.calls(calls, first));
  const booked = figureCountOf(figures, "booked");
  if (booked !== null) facts.push((first) => TODAY_LINE_WORDS.booked(booked, first));
  const fresh = figureCountOf(figures, "new");
  if (fresh !== null) facts.push((first) => TODAY_LINE_WORDS.fresh(fresh, first));
  const [lead, ...rest] = facts;
  if (!lead) return null;
  return { title: lead(true), sub: rest.length ? rest.map((say) => say(false)).join(" · ") : null };
}

/**
 * Content, one line (D2): how many pieces the week made, the newest by its name under it; or, with none yet, how many
 * videos are being made. `count` is the pieces Today's read holds, `newest` the first of them as the page says its name.
 * Null with nothing made and nothing being made.
 */
export function contentWords(week: {
  count: number;
  allVideos: boolean;
  newest: string | null;
  making: number;
}): TodayLineWords | null {
  if (week.count > 0) {
    return {
      title: week.allVideos ? TODAY_LINE_WORDS.videos(week.count) : TODAY_LINE_WORDS.pieces(week.count),
      sub: week.newest ? TODAY_LINE_WORDS.newest(week.newest) : null,
    };
  }
  return week.making > 0 ? { title: TODAY_LINE_WORDS.making(week.making), sub: null } : null;
}
