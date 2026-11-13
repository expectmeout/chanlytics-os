/**
 * Today's helpers, computed in contracts from the surfaces the page already holds — the calendar, the playbooks, the
 * people, Reports, the bell, the broadcasts, the readings of reach-out replies — so the page composes and never derives.
 * The page imports them; nothing reads them off `window`.
 */
import {
  dealPaceOf,
  poolRowOf,
  todayDay,
  todayDayNote,
  todayHeadLine,
  todaySteps,
  todayStepsSub,
  withSteps,
  todayVisitsAsked,
  todayVisitsSub,
  withVisitsAsked,
  todayRunWords,
  todayRunsSub,
  todayLateRunsSub,
  todayDraftsSub,
  todayRunApproved,
  type PersonRowVM,
  type ReachOutRepliesDto,
  type TodayNoReplyVM,
  type TodayPeopleDto,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import type { PeopleSurface } from "../people/surface";
import { holderName } from "../holder-names";
import { meNow } from "../frame-verbs";
import { todayBriefWords } from "./brief-words";
import { todayLeaks, type PeopleListsLike } from "./leaks";
import { keptTodayPeople } from "./people-read";
import { todayPeriodLine } from "./period";
import { withReplies, withoutWrongPerson } from "@/surfaces/campaigns/reach-out/reply-today";
import { borrowed, workspaceClock } from "./shell";

/** The readings of reach-out replies as the Inbox's surface holds them (reach-out/replies.ts); none when unread. */
const readings = () => (window as Window & { __REPLIES?: ReachOutRepliesDto | null }).__REPLIES?.replies ?? [];

export const TODAY_HELPERS = {
  day: todayDay,
  // The head's one sentence after the greeting, on a desk and a phone alike (the redesign of 1 Nov 2026).
  headLine: todayHeadLine,
  dayNote: todayDayNote,
  // The brief's words in Glass (canvas E3): who needs you, the day, what came in, the runs waiting.
  briefWords: todayBriefWords,
  periodLine: todayPeriodLine,
  runs: todayRunWords,
  runsSub: todayRunsSub,
  // The runs too late to approve, and the replies counting down to send (which have no row): the head's own words for them.
  lateRunsSub: todayLateRunsSub,
  draftsSub: todayDraftsSub,
  runApproved: todayRunApproved,
  leaks: todayLeaks,
  // The steps due (0007, amended): the block, its words in To do's line, and To do's rows with them among them.
  steps: todaySteps,
  stepsSub: todayStepsSub,
  withSteps,
  // Yesterday's visits nobody has marked (0047): the block, its words in To do's line, and To do's rows with them among them.
  visitsAsked: todayVisitsAsked,
  visitsSub: todayVisitsSub,
  withVisitsAsked,
  // The queue's handoffs whose thread's reply to a reach-out was read, as that reply's row (Reach out Part 5, PR 8).
  withReplies: (rows: TodayQueueRowVM[]) => withReplies(rows, readings()),
  // Who is waiting with nothing back, less a reply read as a wrong person: nobody there is to answer (contracts
  // withoutWrongPerson), over the same readings as the queue's, so the page asks for the replies once.
  withoutWrongPerson: (waiting: TodayNoReplyVM[]) => withoutWrongPerson(waiting, readings()),
};

/* ------------------------------------------------------------------ People, as Today reads it */

/** What Today reads of People: the lists, how many there are, the rows its checks and steps read, and when they were made. */
type TodayPeople = PeopleListsLike & { rows: readonly PersonRowVM[]; fetchedAt: number };

/**
 * Today's first read of People as rows (people-read.ts, contracts today/people.ts), for the member `viewer` at `now` in the
 * workspace's zone: each row as People's page makes it (poolRowOf, with where the proposal follow-up stands for them as the
 * read judged it: contracts peopleRowOf), its lists as counted, and the pace. Null where People holds more than one page:
 * the page then waits for the book, as it did.
 */
function peopleOfFirstRead(
  dto: TodayPeopleDto,
  as: { tz: string; now: Date; viewer: string | null },
): TodayPeople | null {
  if (!dto.whole) return null;
  const pace = dealPaceOf(dto.deal_pace);
  return {
    lists: dto.lists,
    aggregates: { total: dto.total },
    rows: dto.people.map((p) => {
      const row = poolRowOf(p, { ...as, ready: dto.channels_ready, names: holderName });
      const stand = dto.follow_ups[p.id];
      return stand ? { ...row, followUp: stand } : row;
    }),
    fetchedAt: as.now.getTime(),
    dealPace: pace,
  };
}

/** Each first read made into rows once: the checks are worked out once a read and a minute (zones/found.tsx rulesOf). */
const rowsOfRead = new WeakMap<TodayPeopleDto, TodayPeople | null>();

/**
 * People as Today reads it: People's book where the tab holds it, else what Today's first read carried of it, made into rows
 * the way People's page makes its own; null while neither is in. Ask found's checks (zones/found.tsx), To do's steps due
 * (zones/queue-steps.tsx) and the desk's foot read it here, so each stands in Today's first draw and says, once the book is
 * in, what it said before it: the same rows, lists and checks (Today knows its shape at its first draw, 13 Nov 2026). The
 * book is what moves afterwards (a step done, a teammate's note): People is read again, and this answers it.
 */
export function peopleForToday(): TodayPeople | PeopleSurface | null {
  const book = borrowed<PeopleSurface>("__PEOPLE");
  if (book) return book;
  const dto = keptTodayPeople();
  const zone = workspaceClock()?.zone;
  if (!dto || !zone) return null;
  let people = rowsOfRead.get(dto);
  if (people === undefined) {
    people = peopleOfFirstRead(dto, { tz: zone(), now: new Date(), viewer: meNow()?.id ?? null });
    rowsOfRead.set(dto, people);
  }
  return people;
}
