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
import type { TodayDayVM, TodayFigureVM } from "@chanlytics/contracts";

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
  /** What the card's press does, after why AI held it (Working for you, W20). */
  card: {
    drafted: "Its reply is written for you to read.",
    cantCall: "AI can’t call them back for you.",
  },
  /** The next person who waits, at the foot of a conversation's sheet once yours is answered (W4), and its press. */
  next: "Next",
  open: "Open",
  /**
   * A line held (W11): its acts, and what each said once done; and someone new while a hand is busy (W23), said and placed
   * once the hand is free.
   */
  held: {
    close: "Close",
    done: "Done",
    later: "Not now",
    ask: "Ask AI about this",
    arrived: (n: number): string => `${n} new · placed when you’re done`,
  },
  /** The page's last line, once nothing is left to do. */
  end: "That’s everything.",
  /** Keys on a desk (W12): the sheet ? opens, each key with what it does, in the order a hand meets them. */
  keys: {
    title: "Keys",
    list: [
      ["J K", "Move between lines"],
      ["Enter", "Open the line"],
      ["E", "Done"],
      ["N", "Not now"],
      ["/", "Ask AI about this"],
      ["Esc", "Close"],
      ["?", "Show these keys"],
    ] as const,
  },
  /** Where the card stood, for a beat, as the last thing waiting is done (W6). */
  cleared: "Nothing needs you.",
  /**
   * Once the day is over (Working for you, W5): the page's end while AI answers, the head's word for what waits, and the one
   * line what can wait for morning folds into, with what it holds under it.
   */
  evening: {
    end: "That’s everything. AI is on until you’re back.",
    rest: "The rest waits for morning.",
    morning: "Waiting for morning",
    found: (n: number): string => `${some(n, "thing AI found", "things AI found")}`,
    setup: "setting up",
    more: "Content and your lists",
  },
  /**
   * What the page says while it cannot be sure it shows everything (Working for you, W18, calm/quiet.ts): still checking,
   * behind since a time, a read that failed, a line down. A healthy day says none of them.
   */
  quiet: {
    checking: "Checking who needs you.",
    behind: (time: string | null): string => (time ? `As of ${time}, catching up.` : "Catching up."),
    // Problems in plain words (W17): what happened, and that it mends itself (calm/quiet.ts useCatchUp asks again).
    unread: "Some of it couldn’t be read, so there may be more. Today tries again by itself.",
    lineDown: "While a line is down, this may not be everything.",
  },
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
 * The day ahead in facts, the head's sentence where nobody waits (Working for you, W15): "4 booked today, the first at 10
 * AM." before the first visit, "2 more booked, the next at 2:30 PM." after it. Only today's visits, those still standing,
 * all-day entries left out; null with none ahead, and the head says what it said. No word for the day (a light Monday)
 * until four weeks of the business's own history can back one.
 */
export function dayAheadWords(day: TodayDayVM | null): string | null {
  const items = day?.frames.find((f) => f.today)?.items.filter((i) => !i.allDay) ?? [];
  const ahead = items.filter((i) => i.phase === "next" || i.phase === "later");
  const [next] = ahead;
  if (!next) return null;
  const started = items.some((i) => i.phase === "past" || i.phase === "now");
  return started
    ? `${ahead.length} more booked, the next at ${next.start}.`
    : `${ahead.length} booked today, the first at ${next.start}.`;
}

/** How many of the same weekday before today a usual day is taken from: four weeks of the business's own history. */
const USUAL_WEEKS = 4;
const WEEK_DAYS = 7;

/**
 * A day against a usual one (Working for you, W8): "More than a usual Tuesday" where AI answered more today than on each of
 * the four Tuesdays before it. Said only with all four in the business's own history, each with something answered (a
 * day before the business was here counts nothing, and is no usual day), so it is never a guess; and never said of a
 * quieter day. `answered` is the period's days, oldest first, today last (reports headline `perDay`).
 */
export function usualDayWords(answered: readonly number[], weekday: string): string | null {
  const today = answered.length - 1;
  if (today - USUAL_WEEKS * WEEK_DAYS < 0) return null;
  const before = Array.from({ length: USUAL_WEEKS }, (_, k) => answered[today - (k + 1) * WEEK_DAYS] ?? 0);
  if (before.some((n) => n <= 0)) return null;
  return (answered[today] ?? 0) > Math.max(...before) ? `More than a usual ${weekday}` : null;
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
