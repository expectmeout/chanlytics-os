/**
 * Not today, one rule wherever Today says it (8 Nov 2026): a row set aside rests a week for the member, kept in their saved
 * view (`views.ask_found`), says so in the toast with the day it comes back, and the toast's Undo brings it back. Ask found's
 * rows rested so; a review rested until the tab closed, and came back with no word of why. The rests pressed this visit are
 * kept by the row state: a second press before the next read writes over the first's, not the read's.
 */
import {
  ASK_FOUND_VIEW,
  NEED_YOU_WORDS as W,
  dayInZone,
  isRested,
  restEndsDay,
  restedWith,
  restedWithout,
  usableZone,
  type AskRested,
} from "@chanlytics/contracts";
import { saveView } from "../../people/people-detail";
import { surfaceValue } from "../../surface-values";
import { workspaceClock, type Flash } from "../shell";
import { useRowState } from "./row-state";

const REST_STATE = "today-rests";
const NOT_READ: AskRested = {};

/** The business's day, YYYY-MM-DD: what a rest runs out against, where the morning has not said it. */
const dayToday = (): string => dayInZone(usableZone(workspaceClock()?.zone()), Date.now()).key;

/** What a row's Not today is handed: what it says, and what puts its row back as its Undo is pressed. */
export interface RestPress {
  key: string;
  flash: (f: Flash) => void;
  onUndone?: () => void;
}

/** The member's rests as they stand this visit, whether a row rests, and the one press that rests it. */
export function useRests() {
  const [pressed, setPressed] = useRowState<AskRested | null>(REST_STATE, "rests", null);
  const morning = surfaceValue("ask_morning")?.dto ?? null;
  const read = morning?.rested ?? NOT_READ;
  const today = morning?.day ?? dayToday();
  const change = (next: (was: AskRested) => AskRested) => {
    let now: AskRested = {};
    setPressed((was) => {
      now = next(was ?? read);
      return now;
    });
    return saveView(ASK_FOUND_VIEW, { rested: now });
  };
  const rest = async ({ key, flash, onUndone }: RestPress): Promise<void> => {
    const put = await change((was) => restedWith(was, key, today));
    if (!put.ok) {
      flash({ tone: "danger", msg: <>{put.message}</> });
      return;
    }
    flash({
      msg: <>{W.restedUntil(restEndsDay(usableZone(workspaceClock()?.zone()), Date.now()))}</>,
      undo: async () => {
        const back = await change((was) => restedWithout(was, key, today));
        if (!back.ok) {
          flash({ tone: "danger", msg: <>{back.message}</> });
          return;
        }
        onUndone?.();
      },
    });
  };
  const rested = pressed ?? read;
  return { rested, today, rest, rests: (key: string) => isRested(rested, key, today) };
}

/** A review's key among the rests: Ask found's rows keep theirs, and the two never meet. */
export const reviewRestKey = (id: string): string => `review:${id}`;
