/**
 * Today's helpers, computed in contracts from the surfaces the page already holds — the calendar, the playbooks, the
 * people, Reports, the bell, the broadcasts, the readings of reach-out replies — so the page composes and never derives.
 * The page imports them; nothing reads them off `window`.
 */
import {
  todayDay,
  todayAwayGrouped,
  todayBriefWords,
  todaySteps,
  todayStepsFoot,
  todayStepsSub,
  withSteps,
  todayVisitsAsked,
  todayVisitsFoot,
  todayVisitsSub,
  withVisitsAsked,
  todayLeaks,
  todayPeriodLine,
  todayRunWords,
  todayRunsSub,
  todayLateRunsSub,
  todayDraftsSub,
  todayRunApproved,
  withReplies,
  withoutWrongPerson,
  type ReachOutRepliesDto,
  type TodayNoReplyVM,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";

/** The readings of reach-out replies as the Inbox's surface holds them (reach-out/replies.ts); none when unread. */
const readings = () => (window as Window & { __REPLIES?: ReachOutRepliesDto | null }).__REPLIES?.replies ?? [];

export const TODAY_HELPERS = {
  day: todayDay,
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
  awayGrouped: todayAwayGrouped,
  // The steps due (0007, amended): the block, its words in the queue's head and foot, and the queue's rows with them among them.
  steps: todaySteps,
  stepsSub: todayStepsSub,
  stepsFoot: todayStepsFoot,
  withSteps,
  // Yesterday's visits nobody has marked (0047): the block, its words in the queue's head and foot, and the queue's rows with them among them.
  visitsAsked: todayVisitsAsked,
  visitsSub: todayVisitsSub,
  visitsFoot: todayVisitsFoot,
  withVisitsAsked,
  // The queue's handoffs whose thread's reply to a reach-out was read, as that reply's row (Reach out Part 5, PR 8).
  withReplies: (rows: TodayQueueRowVM[]) => withReplies(rows, readings()),
  // Who is waiting with nothing back, less a reply read as a wrong person: nobody there is to answer (contracts
  // withoutWrongPerson), over the same readings as the queue's, so the page asks for the replies once.
  withoutWrongPerson: (waiting: TodayNoReplyVM[]) => withoutWrongPerson(waiting, readings()),
};
