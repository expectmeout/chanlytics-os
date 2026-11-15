/**
 * The next visit to mark, offered once a word is said in the sheet (the visit sheet's review, 12 Nov 2026, finding 5): the
 * header's line opened the first of them, and after an answer the sheet stood where it was, so each of the rest took a
 * close and the line again. The sheet now offers the next of them as its lead, by the rule the line counts by (contracts
 * todayVisitsAsked: the past week's, yesterday's first), and a press opens it in this one's place, as the desk's walk
 * does: the address is replaced, so a close still closes, and a phone's Back never steps back through every one marked.
 */
import { todayVisitsAsked, todayVisitsSub, type AppointmentWord, type CalendarBlockVM } from "@chanlytics/contracts";
import { CALENDAR_VISIT_SHEET_WORDS as W } from "./sheet-view";
import type { VisitCtx, VisitNext } from "./context";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import type { CalendarFrame } from "../types";

/**
 * The visits a word was said on in this tab. The board reads again behind each word, and until that read lands the one
 * just marked is still unmarked on it: without this, Next could offer back the visit it came from.
 */
const SAID = new Set<string>();

/** A word said on a visit in this tab (outcome.tsx sayHere): never offered as the next to mark again. */
export function noteSaid(markId: string): void {
  SAID.add(markId);
}

/**
 * The next of the past week's visits to mark after `open` among the days the board holds, by the line's own rule: none
 * where it is the last, where the board does not hold today, or where the block is not drawn. `go` opens it (the walk).
 */
export function nextToMarkOf(
  days: readonly CalendarFrame[],
  open: CalendarBlockVM,
  ask: { nowMs: number; word: AppointmentWord; walk: (b: CalendarBlockVM) => void },
): VisitNext | null {
  const toMark = todayVisitsAsked({ days }, ask.nowMs, ask.word, Number.POSITIVE_INFINITY);
  const left = (toMark?.items ?? []).filter((v) => v.markId !== open.visit?.id && !SAID.has(v.markId));
  const first = left.at(0);
  if (!first) return null;
  const block = days.flatMap((d) => [...d.allDay, ...d.blocks]).find((b) => b.visit?.id === first.markId);
  if (!block) return null;
  const when = [first.line.day, first.line.time].filter(Boolean).join(", ");
  return {
    label: W.next,
    aria: `${W.next}: ${first.person.name}, ${when}. ${todayVisitsSub(left.length, ask.word)}`,
    go: () => ask.walk(block),
  };
}

/**
 * The foot's lead once a word is said and another visit waits for one: its press opens that visit in this one's place.
 * "Next" and its chevron, as wide as its words, beside the visit's own act: with a name in it, three equal presses on a
 * phone cut that act's words ("Send the booking link"). Who and when are its name to a screen reader, and its tip on hover,
 * as the Message and Call circles' are: a phone shows no title=.
 */
export function NextToMark({ visit }: { visit: VisitCtx }) {
  const next = visit.next;
  if (!next) return null;
  return (
    <Button
      variant="primary"
      className="cal-visit-next"
      aria-label={next.aria}
      data-tip={next.aria}
      onClick={next.go}
      data-testid="cal-visit-next"
    >
      {next.label}
      <Icon name="chevron" size={12} />
    </Button>
  );
}
