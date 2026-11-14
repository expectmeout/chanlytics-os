/**
 * What Today draws from People, as Today's first read carries it (GET today/people, contracts today/people.ts): each of
 * People's lists counted, how many are in People, and the people Ask found's checks and To do's steps due can name. A read
 * Today's first draw waits for where the tab opens on Today holding none (first-draw-read.ts), so Ask found and the steps
 * stand in the first draw where they will stay: they waited for People's whole book, the last read of the page's second
 * wave, and landed 0.3 to 1.3 s after the rest of it (the load reviews of 10 and 13 Nov 2026). Its own module, apart from
 * the parts that read it (helpers.ts peopleForToday): the frame loads it with Today's surface (override.ts), which holds the draw
 * before Today's gate first opens, and only where the document's head has the read out.
 */
import type { TodayPeopleDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { firstDrawRead } from "./first-draw-read";

/** The signal the parts that read it redraw on, as an answer is kept: one that lands past the first draw's wait. */
export const TODAY_PEOPLE_HEARD = "today_people";

const peopleRead = firstDrawRead<TodayPeopleDto>(
  "today_people",
  "today/people",
  async () => (await read("GET today/people")).people,
  TODAY_PEOPLE_HEARD,
);

/** What this tab last read for the workspace on screen, or null where it holds nothing. */
export const keptTodayPeople = (): TodayPeopleDto | null => peopleRead.kept()?.value ?? null;

/** Hold Today's first draw for it, where the tab opens on Today holding none (first-draw-read.ts). */
export const holdTodayForPeople = (): void => peopleRead.hold();

/** The read now: the load's own read first, so a load never asks twice. */
export const readTodayPeople = (): Promise<TodayPeopleDto | null> => peopleRead.read();
