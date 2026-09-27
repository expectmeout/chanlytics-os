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
import type { ConversationDto, EscalationDto, CallDto } from "../conversations/viewmodels";
import type { LeadSearchDto } from "../leads/leads";
import {
  todayAskFacts,
  todayHeadline,
  todayQueueEmpty,
  todayQuietDay,
  todaySentences,
  todayStanding,
  todayTrafficLine,
} from "./today-bands";
import { todayFacts } from "./today-facts";
import { figuresOf, todayProof } from "./today-figures";
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
import type { TodayVM } from "./today-vm";

/* ------------------------------ the brief ---------------------------------- */

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
): TodayVM {
  const f = todayFacts({ metrics: m, conversations, escalations, calls, now, searches });
  const { chips, lines, alert } = todayStanding(f);
  const eyebrow = `${f.datePart} · ${f.clock} · ${m.workspace.name}`;
  const proof = todayProof(f.live, f.tz, now);
  const noReply = todayNoReply(f);
  const facts = todayAskFacts(f);
  const empty = todayQueueEmpty(f);

  /* ---- the quiet day: prove we are listening, don't show a row of zeroes ---- */
  if (f.traffic === 0 && f.needsYouCount === 0 && !alert) {
    return {
      standing: {
        eyebrow,
        chips,
        lines,
        alert: null,
        headline: "Nothing has come in yet today.",
        detail: null,
        tone: "calm",
      },
      needsYou: null,
      windowClosing: null,
      recap: { label: "Today so far", line: "Nothing has come in yet today.", sentences: [], facts, receipts: [] },
      figures: null,
      proof,
      noReply,
      calls: null,
      callsRead: f.callsRead,
      queue: { rows: [], more: 0, parts: [], empty, waiting: 0 },
      quiet: todayQuietDay(f, proof),
    };
  }

  const needsYou = todayNeedsYou(f);
  const { headline, detail, tone } = todayHeadline(f, alert, needsYou.rows);
  const callRows = todayCallRows(f);
  return {
    standing: { eyebrow, chips, lines, alert, headline, detail, tone },
    needsYou,
    windowClosing: todayWindowClosing(f),
    recap: {
      label: "Today so far",
      line: todayTrafficLine(f),
      sentences: todaySentences(f, tone, alert),
      facts,
      receipts: todayReceipts(f),
    },
    figures: figuresOf(m, conversations, f.callsInWindow, escalations, f.tz, now),
    proof,
    noReply,
    callsRead: f.callsRead,
    calls: todayCalls(f, callRows),
    queue: todayQueue(f, callRows, empty),
    quiet: null,
  };
}
