import { runDaysAt } from "../playbooks/playbook-approval.js";
import { runsThatWait } from "../waits/waits.js";
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
  todayTrafficLine
} from "./today-bands.js";
import { todayFacts } from "./today-facts.js";
import { figuresOf, quietFigures, todayProof } from "./today-figures.js";
import { todayQueue } from "./today-queue.js";
import {
  todayCallRows,
  todayCalls,
  todayNeedsYou,
  todayNoReply,
  todayReceipts,
  todayWindowClosing
} from "./today-rows.js";
const QUIET_CALM = { also: [], traffic: null, handled_all: true, answered: null };
export function toTodayVM(m, conversations, escalations, calls, now = /* @__PURE__ */ new Date(), searches = null, beside = {}) {
  const f = todayFacts({
    metrics: m,
    conversations,
    escalations,
    calls,
    now,
    searches,
    heldThreads: [...beside.heldThreads ?? []]
  });
  const runsWaiting = beside.runs ? runsThatWait(beside.runs, runDaysAt(f.tz, now)).length : null;
  const { chips, lines, alert, paused } = todayStanding(f);
  const proof = todayProof(f.live, f.tz, now);
  const noReply = todayNoReply(f);
  const facts = todayAskFacts(f);
  const empty = todayQueueEmpty(f);
  const callRows = todayCallRows(f);
  const queue = todayQueue(f, callRows, empty);
  if (f.traffic === 0 && f.needsYouCount === 0 && !alert && queue.rows.length === 0) {
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
          tone: "calm",
          calm: QUIET_CALM
        },
        runsWaiting ?? 0
      ),
      runs_waiting: runsWaiting,
      needsYou: null,
      windowClosing: null,
      recap: {
        label: "Today so far",
        line: "Nothing has come in yet today.",
        sentences: failed ? [failed] : [],
        facts,
        receipts: []
      },
      figures: null,
      zero_figures: null,
      proof,
      noReply,
      calls: null,
      callsRead: f.callsRead,
      queue: { rows: [], more: 0, more_people: 0, calls: 0, searches: 0, windows: 0, parts: [], empty },
      quiet: { ...todayQuietDay(f, proof), figures: quietFigures(f.live, f.tz, now) }
    };
  }
  const needsYou = todayNeedsYou(f);
  const head = todayHeadline(
    f,
    alert,
    needsYou.rows,
    todayAlsoWaiting({ windows: f.closingConvs.length, calls: queue.calls, searches: queue.searches })
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
      receipts: todayReceipts(f)
    },
    figures,
    // Nothing to count while someone waits (the reference workspace's own state): Glass draws the tile's four zeros.
    zero_figures: figures ? null : quietFigures(f.live, f.tz, now),
    proof,
    noReply,
    callsRead: f.callsRead,
    calls: todayCalls(f, callRows),
    queue,
    quiet: null
  };
}
