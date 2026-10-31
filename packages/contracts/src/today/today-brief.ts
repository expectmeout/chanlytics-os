/**
 * Today (Slice 4): the morning brief.
 *
 * The rule that shapes every line below: a number that cannot be traced to a
 * row does not appear, and a region with nothing true to say is not rendered
 * at all rather than rendered empty. Zero traffic stated positively — with a
 * timestamp and a channel status — is reassurance; the same morning rendered
 * as four zeroes and a flat sparkline reads as a product that died overnight.
 *
 * Every clock value comes from the SERVER's tenant-local time, never the
 * browser's: the owner of a New York salon checking from Madrid must still be
 * told what time it is at the salon.
 *
 * The brief is composed here from its parts: the facts (today-facts.ts), the bands (today-bands.ts), the
 * figures (today-figures.ts), the rows (today-rows.ts) and the queue (today-queue.ts), in the shape today-vm.ts
 * declares.
 */
import type { CallDto } from "../conversations/call-dto";
import type { EscalationDto } from "../conversations/escalations";
import type { ConversationDto } from "../conversations/thread-dto";
import type { LeadSearchDto } from "../leads/leads";
import type { PreviewTriedDto } from "../previews/preview-tried";
import { runDaysAt } from "../playbooks/playbook-approval";
import { runsThatWait, type WaitingRun } from "../waits/waits";
import {
  standingWithRuns,
  todayAskFacts,
  todayAlsoWaiting,
  todayHeadline,
  todayQueueEmpty,
  todayQuietDay,
  todaySendFailure,
  todaySentences,
  todayStanding,
  todayTrafficLine,
} from "./today-bands";
import { todayFacts } from "./today-facts";
import { figuresOf, quietFigures, todayProof } from "./today-figures";
import type { MetricsSummaryDto } from "./today-metrics";
import { todayQueue } from "./today-queue";
import {
  todayCallRows,
  todayCalls,
  todayNeedsYou,
  todayNoReply,
  todayReceipts,
  todayWindowClosing,
} from "./today-rows";
import type { TodayCalmVM, TodayVM } from "./today-vm";

/* ------------------------------ the brief ---------------------------------- */

/** A quiet day's calm words: nothing else waits and nothing came in, so only a run waiting changes its head. */
const QUIET_CALM: TodayCalmVM = { also: [], traffic: null, handled_all: true, answered: null };

/**
 * What the brief may be handed beside its reads: the campaign runs that may wait for your word (GET broadcasts' rows, or
 * the waiting runs a server reads), and the threads of open holds past the newest page, read by their ids. Optional, as
 * `searches` is: a brief handed neither says the head as it did, and leaves `runs_waiting` null.
 */
interface TodayBeside {
  runs?: readonly WaitingRun[] | null;
  heldThreads?: readonly ConversationDto[] | null;
  /** The leads who tried their own receptionist lately (decision 0079): each a row. Null or absent: not read. */
  previewsTried?: readonly PreviewTriedDto[] | null;
}

/**
 * Today's brief: the facts read once, then one builder per band. The quiet day (no traffic, nobody waiting, no
 * alert) proves the lines are listening instead of drawing a row of zeroes; every other day gets the headline
 * ladder, the recap, the figures, the calls and the queue.
 */
export function toTodayVM(
  m: MetricsSummaryDto,
  conversations: ConversationDto[],
  escalations: Array<EscalationDto & { conversation_id: string }>,
  calls: CallDto[] | null,
  now = new Date(),
  // After `now`, so every caller that never read the searches stands; null is "not read", the queue says nothing.
  searches: LeadSearchDto[] | null = null,
  beside: TodayBeside = {},
): TodayVM {
  const f = todayFacts({
    metrics: m,
    conversations,
    escalations,
    calls,
    now,
    searches,
    heldThreads: [...(beside.heldThreads ?? [])],
    previewsTried: [...(beside.previewsTried ?? [])],
  });
  // The runs waiting for a word that can still send them, by the business's days (the verb's own rule): null unread.
  const runsWaiting = beside.runs ? runsThatWait(beside.runs, runDaysAt(f.tz, now)).length : null;
  const { chips, lines, alert, paused } = todayStanding(f);
  const proof = todayProof(f.live, f.tz, now);
  const noReply = todayNoReply(f);
  const facts = todayAskFacts(f);
  const empty = todayQueueEmpty(f);

  // The queue, before the head: the head's last rung says what it holds (todayAlsoWaiting), and a day is quiet only
  // with nothing in it. A search waiting on an answer on a day with no messages was a quiet day, with an empty queue.
  const callRows = todayCallRows(f);
  const queue = todayQueue(f, callRows, empty);

  /* ---- the quiet day: prove we are listening, don't show a row of zeroes ---- */
  if (f.traffic === 0 && f.needsYouCount === 0 && !alert && queue.rows.length === 0) {
    // A reply that failed is no traffic, but its line is never quiet (today-bands.ts todaySendFailure).
    const failed = todaySendFailure(f);
    return {
      // The quiet gate is about traffic, and decides the card; a run waiting still leads the head.
      standing: standingWithRuns(
        {
          chips,
          lines,
          alert: null,
          paused,
          headline: "Nothing has come in yet today.",
          detail: null,
          tone: "calm" as const,
          calm: QUIET_CALM,
        },
        runsWaiting ?? 0,
      ),
      runs_waiting: runsWaiting,
      needsYou: null,
      windowClosing: null,
      recap: {
        label: "Today so far",
        line: "Nothing has come in yet today.",
        sentences: failed ? [failed] : [],
        facts,
        receipts: [],
      },
      figures: null,
      zero_figures: null,
      proof,
      noReply,
      calls: null,
      callsRead: f.callsRead,
      queue: { rows: [], more: 0, more_people: 0, calls: 0, searches: 0, windows: 0, parts: [], empty },
      quiet: { ...todayQuietDay(f, proof), figures: quietFigures(f.live, f.tz, now) },
    };
  }

  const needsYou = todayNeedsYou(f);
  const head = todayHeadline(
    f,
    alert,
    needsYou.rows,
    todayAlsoWaiting({ windows: f.closingConvs.length, calls: queue.calls, searches: queue.searches }),
  );
  const standing = standingWithRuns({ chips, lines, alert, paused, ...head }, runsWaiting ?? 0);
  const figures = figuresOf(m, conversations, f.callsInWindow, escalations, f.tz, now);
  return {
    standing,
    runs_waiting: runsWaiting,
    needsYou,
    windowClosing: todayWindowClosing(f),
    recap: {
      label: "Today so far",
      line: todayTrafficLine(f),
      sentences: todaySentences(f, standing.tone, alert),
      facts,
      receipts: todayReceipts(f),
    },
    figures,
    // Nothing to count while someone waits (the reference workspace's own state): Glass draws the tile's four zeros.
    zero_figures: figures ? null : quietFigures(f.live, f.tz, now),
    proof,
    noReply,
    callsRead: f.callsRead,
    calls: todayCalls(f, callRows),
    queue,
    quiet: null,
  };
}
