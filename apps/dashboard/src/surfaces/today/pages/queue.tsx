/**
 * Today's queue (moved from pages/dashboard-a-command.jsx, decision 0015, step 4): everything that asks for a person,
 * in one row grammar (the kit's AttnRow), the longest wait first: WhatsApp handoffs, callers who need a call back,
 * reply windows closing, calls worth an ear (contracts today.ts queue), a person's next step once its day has come
 * (0007: queue-steps.tsx), yesterday's visits nobody has said whether they came to (0047: queue-visits.tsx), and the
 * runs that wait for a word, the very rows the Inbox's Needs you draws (surfaces/waits/wait-rows.tsx: the Campaigns wiring
 * review's rule D). A call in progress rides above the list while it lasts.
 * The first row carries the page's one primary verb; the rest wear theirs quietly. Every sentence with a number is
 * contracts' (todayRunWords, todayRunsSub, todayRunApproved).
 *
 * It was Agent Command: a seeded bar with Now/Soon buckets, an insight line, decision rows with Approve/Decline, and
 * a count badge over a list that already says its count. The seed left with the mockup's stand-in: the mockup drew
 * this page from its sample (legacy-bridge/today-sample.ts), which is gone.
 */
import { useEffect, useLayoutEffect, useState, type ReactElement } from "react";
import {
  DEFAULT_TIMEZONE,
  NEED_YOU_WORDS,
  isPersonRow,
  needYouSay,
  needsYouCount,
  verbForRoute,
  waitingRunsDoor,
  type AppointmentWord,
  type AskMorningCard,
  type GoogleReviewDto,
  type TodayQueueRowVM,
  type TodayVM,
} from "@chanlytics/contracts";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { needsYouOnToday, useNeedsYouParts } from "../../needs-you";
import { surfaceValue } from "../../surface-values";
import { usePartShown } from "../../use-surface";
import { askMorningOverride } from "../ask-morning-surface";
import { queueHoldsCoral } from "../queue-coral";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, canDo, doorGlyph, surfaceFailed, useMoved, useToast, workspaceClock } from "../shell";
import { useDayVm } from "./day";
import { liveClock, useLiveNow } from "./live-now";
import { broadcastsRead, runsPending, useRunsActing } from "../../waits/run-acts";
import { waitRows, type Nav, type VerbKind } from "../../waits/wait-rows";
import { dueSteps, stepDone, stepsLeft } from "./queue-steps";
import { askedVisits, visitsLeft } from "./queue-visits";
import { useDraftCounts, wantDrafts, type DraftWant } from "../need-you/drafts";
import { ideaRows, needYouRows, reviewRows, type NeedYouExtrasCtx, type NeedYouRowsCtx } from "../need-you/people-rows";
import { reviewsToAnswer } from "../need-you/reviews";
import { draftWantOf, worksInPlace } from "../need-you/rows";
import { clearRowStates } from "../need-you/row-state";
import { WalkSheet, type WalkAt } from "../need-you/walk-sheet";
import { useTodayOnPhone } from "../phone";
import { TODAY_HEAD_ID } from "../phone/head";
import { TodayToDo, useToDoCount } from "../phone/to-do";

export const AgentCommand = () => {
  useMoved("today");
  const vm = surfaceValue("today");
  // Today's first part: the page is READY when its queue is drawn (client/page-speed.ts).
  usePartShown("today", "queue", !!vm);
  return vm ? <TodayQueue vm={vm} /> : null;
};

// The call in progress, above the list while it lasts (Classic; Glass says it in the strip, strip.tsx, and hides this rail).
const LiveRail = ({ nav }: { nav: Nav }) => {
  const { live, nowMs } = useLiveNow();
  if (!live.length) return null;
  return live.map((c) => {
    const last = [...c.transcript].reverse().find((t) => t.speaker !== "whisper");
    const elapsed = Math.max(0, Math.floor((nowMs - (c.startedAtMs || nowMs)) / 1000));
    return (
      <div key={c.callId} className="tq-live" data-testid="brief-live-call">
        <span className="live-dot" />
        <span className="tq-live-text">
          <b>{c.who}</b> is on the line · {liveClock(elapsed)}
          {last ? (
            <span className="tq-live-last">
              {" · "}
              {last.speaker === "client" ? c.whoShort : "Receptionist"}: &ldquo;{last.text.slice(0, 90)}&rdquo;
            </span>
          ) : null}
        </span>
        {/* The call's own door (live/<callId>): Live's list opens on the oldest call, which may not be this one. */}
        <button className="cl-attn-cta primary" onClick={() => nav(`live/${c.callId}`)}>
          Open Live
        </button>
      </div>
    );
  });
};

// Runs the queue draws before it counts the rest: a run waiting for a word needs a decision, so those come first; a
// run about to send is Going today's (going-today.tsx). On a busy day four runs under six people put "Nothing sends until you say so" three
// hundred pixels below the fold, said four times.
/**
 * What the card draws, people and runs together. Today is a summary: past four rows it stops being one.
 *
 * Three of the four are people and the fourth is kept for a run, because a run waiting for a word is a
 * decision no other row can stand in for -- three people waiting used to take every seat, and Approve left
 * the page on the day it mattered. When no run wants the seat a fourth person has it; a reserved row is only
 * worth reserving while something needs it.
 *
 * The CAP IS HERE, not in contracts: TodayVM.queue.rows stays the whole queue the view model built, so the
 * four kinds still merge into one list by longest wait, and While you were away still knows every row the
 * queue holds when it decides what not to say twice. This only decides how many of them fit on the card.
 */
const CARD_MAX = 4;
const PEOPLE_MAX = 3;

/** What the head says and where its door goes: the count, and each part said in its own words. */
interface QueueHeadFacts {
  count: number;
  steps: number;
  visits: number;
  word: AppointmentWord;
  /** Replies counting down to send, which have no row. */
  sends: number;
  /** Runs waiting for a word that can still send them, and runs too late to approve (which wait on nobody). */
  runs: { waiting: number; late: number };
  door: { to: string; label: string };
}

/**
 * The head: the title, what the rows hold in words (contracts', with the replies on their way and the runs waiting), and
 * the door to where what waits is: the Inbox, or the run or Sent when only runs wait (the wiring's second audit, S7-2). In
 * Glass the count stands before the title as its canvas draws it (E3), and the door carries its arrow. "Nothing needs
 * you" is said only under a count of none.
 */
function queueHead(vm: TodayVM, nav: Nav, head: QueueHeadFacts) {
  return (
    <div className="tq-head">
      <span className="tq-num tabular" data-testid="today-queue-count">
        {head.count}
      </span>
      <span className="tq-title">Need you</span>
      <span className="tq-sub">
        {[
          ...vm.queue.parts,
          TODAY_HELPERS.draftsSub(head.sends),
          head.steps > 0 ? TODAY_HELPERS.stepsSub(head.steps) : "",
          head.visits > 0 ? TODAY_HELPERS.visitsSub(head.visits, head.word) : "",
          TODAY_HELPERS.runsSub(head.runs.waiting),
          TODAY_HELPERS.lateRunsSub(head.runs.late),
        ]
          .filter(Boolean)
          .join(" · ") || (head.count === 0 ? vm.queue.empty.sub : "")}
      </span>
      <button type="button" className="tq-open" onClick={() => nav(head.door.to)} data-testid="today-queue-door">
        {head.door.label}
        <Icon name={doorGlyph()} size={11} />
      </button>
    </div>
  );
}

/**
 * The rows, the runs, and what stands where they would be: a read that failed, or what an empty queue means, said only
 * when nothing waits either (a held send has no row, and "all caught up" was drawn under a count of one: S7-1).
 */
function queueList(
  vm: TodayVM,
  drawn: ReactElement[],
  runs: ReactElement[],
  { total, waiting, phone = false }: { total: number; waiting: number; phone?: boolean },
) {
  return (
    <div className="tq-list">
      {drawn}
      {runs}
      {/* The broadcasts read failed: the rows above stand, and the runs that may be waiting are said to be unread. */}
      {!broadcastsRead() && surfaceFailed("broadcasts") && (
        <FailedRead
          kind="line"
          className="tq-failed"
          what="the campaign runs"
          body="The rows above are current."
          surface="broadcasts"
          testid="today-runs-failed"
        />
      )}
      {/* What an empty queue means is a sentence about the wires, so contracts says it: a dark line, no line, a line
          the receptionist does not answer (email), or the receptionist holding the floor. Not under Ask's ideas or a
          review to answer: the card holds something, and the head says the queue is empty. */}
      {/* On a phone the head says it ("Nothing needs you"), and a line that is down stands under it (phone/warnings.tsx). */}
      {total === 0 && waiting === 0 && drawn.length === 0 && !phone && (
        <EmptyState
          kind="line"
          glyph={vm.queue.empty.glyph}
          tone={vm.queue.empty.tone || undefined}
          title={vm.queue.empty.title}
          testid={vm.queue.empty.testid}
        />
      )}
    </div>
  );
}

/**
 * What the card could not hold, said with the door to it. In Glass the foot stands whatever was cut, as E3 draws it,
 * and says so when the card holds everything: the Inbox has nothing more that needs a person.
 */
function queueFoot(
  cut: { rows: number; runs: number; steps: number; visits: number; sends: number },
  doors: { steps: string | null; visits: string | null; word: AppointmentWord },
  nav: Nav,
) {
  // The replies counting down have no row on the card: the Inbox holds them, and the foot says so (S7-1).
  const sends = TODAY_HELPERS.draftsSub(cut.sends);
  const parts = [
    cut.rows > 0 ? NEED_YOU_WORDS.more(cut.rows) : "",
    sends ? `${sends} in the Inbox` : "",
    // The runs the card had no room for wait in Needs you, the whole list (the Campaigns wiring review's rule D).
    cut.runs > 0 ? `${cut.runs} more run${cut.runs === 1 ? "" : "s"} in the Inbox` : "",
  ].filter(Boolean);
  // The steps cut are their own door, People's Steps due (the list the row for the rest opens), and the visits to mark that
  // were cut are the Calendar's, on yesterday: "See all" goes to the Inbox, where people and runs wait, and a step or a
  // visit is neither.
  const steps = cut.steps > 0 && doors.steps ? doors.steps : null;
  const visits = cut.visits > 0 && doors.visits ? doors.visits : null;
  return (
    <div className="tq-foot">
      <span>
        {parts.join(" · ") || (steps || visits ? "" : "Nothing more in the Inbox")}
        {parts.length > 0 && steps ? " · " : ""}
        {steps && (
          <Button variant="quiet" size="text" onClick={() => nav(steps)} data-testid="today-queue-steps-cut">
            {TODAY_HELPERS.stepsFoot(cut.steps)}
          </Button>
        )}
        {(parts.length > 0 || steps) && visits ? " · " : ""}
        {visits && (
          <Button variant="quiet" size="text" onClick={() => nav(visits)} data-testid="today-queue-visits-cut">
            {TODAY_HELPERS.visitsFoot(cut.visits, doors.word)}
          </Button>
        )}
      </span>
      <button className="cl-attn-cta ghost" onClick={() => nav("inbox")}>
        {NEED_YOU_WORDS.seeAll}
      </button>
    </div>
  );
}

/** How often Ask's morning is read again while Ask writes it: a turn takes up to two minutes. */
const MORNING_POLL_MS = 8_000;
/** How many of Ask's ideas and reviews to answer the card draws after the people: the rest wait in Ask and on Reports. */
const EXTRAS_MAX = 2;

/** A row acted on this visit, and where it stood: it keeps its place on the card whatever the next read says. */
type Kept = Record<string, { row: TodayQueueRowVM; at: number }>;

/**
 * The rows as read, with each one acted on this visit as it was kept (a held reply stopped reads "Held for you") and,
 * where the read no longer has it, put back where it stood: its receipt and its undo stay there. A thread kept under one
 * row stands for itself for the visit: the read's other row of it (a held reply stopped reads again as its closing window)
 * is not drawn a second time.
 */
function withKept(rows: readonly TodayQueueRowVM[], kept: Kept): TodayQueueRowVM[] {
  const threads = new Set(Object.values(kept).flatMap(({ row }) => (row.conversationId ? [row.conversationId] : [])));
  const out = rows.flatMap((r) => {
    const k = kept[r.id];
    if (k) return [k.row];
    return r.conversationId && threads.has(r.conversationId) ? [] : [r];
  });
  for (const { row, at } of Object.values(kept).sort((x, y) => x.at - y.at)) {
    if (!out.some((r) => r.id === row.id)) out.splice(Math.min(at, out.length), 0, row);
  }
  return out;
}

/**
 * Ask's one line over the rows (decision 0071): what it prepared for the rows drawn, then the one thing that cannot wait;
 * its mark in the accent while it writes. Nothing where it prepared nothing.
 */
function AskSays({
  wants,
  rows,
  may,
}: {
  wants: readonly DraftWant[];
  rows: readonly TodayQueueRowVM[];
  may: boolean;
}) {
  const counts = useDraftCounts(wants, may);
  const firstWindow = rows.find((r) => r.kind === "window")?.who ?? null;
  const line = needYouSay({ ...counts, firstWindow, held: rows.filter((r) => r.kind === "held").length });
  if (!line) return null;
  const writing = counts.writing > 0 && counts.replies + counts.briefs === 0;
  return (
    <p className="ny-say" data-testid="today-queue-ask">
      <span className="ny-three" data-live={writing || undefined} aria-hidden="true">
        <Icon name="three" size={14} />
      </span>
      <span>{line}</span>
    </p>
  );
}

/** The extras as read, with each acted on this visit first and in its place: its receipt and its undo stay there. */
function withKeptExtras<T>(read: readonly T[], kept: readonly T[], idOf: (t: T) => string): T[] {
  return [...kept, ...read.filter((t) => !kept.some((k) => idOf(k) === idOf(t)))];
}

/**
 * Ask's ideas from its morning, then the reviews to answer: after the people, a few, never in the count of who needs
 * you. One approved, answered or set aside leaves its next read, so it is kept in its place for the visit.
 */
function useExtras(ctx: NeedYouRowsCtx): ReactElement[] {
  const [keptIdeas, setKeptIdeas] = useState<readonly AskMorningCard[]>([]);
  const [keptReviews, setKeptReviews] = useState<readonly GoogleReviewDto[]>([]);
  const morning = surfaceValue("ask_morning")?.dto ?? null;
  useMorningWait(morning?.state === "writing");
  const ideas = withKeptExtras(morning?.offered ? morning.cards : [], keptIdeas, (k) => k.id).slice(0, EXTRAS_MAX);
  const reviews = withKeptExtras(reviewsToAnswer(surfaceValue("google")), keptReviews, (r) => r.id).slice(
    0,
    Math.max(0, EXTRAS_MAX - ideas.length),
  );
  const c: NeedYouExtrasCtx = {
    ...ctx,
    kept: new Set([...ctx.kept, ...keptIdeas.map((k) => k.id), ...keptReviews.map((r) => `q-r-${r.id}`)]),
    keepIdea: (card) => setKeptIdeas((was) => (was.some((k) => k.id === card.id) ? was : [...was, card])),
    keepReview: (review) => setKeptReviews((was) => (was.some((r) => r.id === review.id) ? was : [...was, review])),
  };
  return [
    ...ideaRows(ideas, { messageId: morning?.message_id ?? null, threadId: morning?.thread_id ?? null }, c),
    ...reviewRows(reviews, c),
  ];
}

/** Ask's morning read again every few seconds while it writes; the surface stops the wait when it lands. */
function useMorningWait(writing: boolean) {
  useEffect(() => {
    if (!writing) return;
    const id = setInterval(() => void refreshSurfaces([askMorningOverride]), MORNING_POLL_MS);
    return () => clearInterval(id);
  }, [writing]);
}

/** The drafts these rows want written ahead (rows.tsx draftWantOf): a reply, or a call back's brief. */
const draftWantsOf = (rows: readonly TodayQueueRowVM[]) => rows.map(draftWantOf).filter((w): w is DraftWant => !!w);

/** The drafts the drawn rows want, asked for once per set: kept ones read, missing ones written by a member who acts. */
function useDraftsAhead(wants: readonly DraftWant[], may: boolean) {
  const key = wants.map((w) => `${w.conversationId}:${w.kind}:${w.forMessageId ?? ""}`).join("|");
  useEffect(() => {
    if (wants.length) void wantDrafts(wants, may);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked for by its key: a row drawn again with the same threads and messages asks nothing
  }, [key, may]);
}

/**
 * On a phone (the phone canvas, 28 Oct 2026): the steps and the visits are To do's (phone/to-do.tsx), Ask's ideas and the
 * reviews Ask found's (phone/ask-found.tsx), the head is the page's (phone/head.tsx), and a row opened walks the list in a sheet.
 * What each row came to is kept by the row for the visit (row-state.ts): it goes as Today does.
 */
function usePhoneQueue() {
  const phone = useTodayOnPhone();
  const [walk, setWalk] = useState<WalkAt>(null);
  // To do stands in this pane under the people (phone/to-do.tsx): with nobody waiting the pane is drawn for it alone.
  const toDo = useToDoCount();
  useEffect(() => () => clearRowStates(), []);
  return { phone, walk, setWalk, toDo };
}

/** The walk through the rows the card draws, on a phone: the sheet, and To do's to-dos for its end. Called, not drawn. */
function queueWalk(
  shown: readonly TodayQueueRowVM[],
  { walk, setWalk }: { walk: WalkAt; setWalk: (at: WalkAt) => void },
  ctx: NeedYouRowsCtx,
  todos: number,
) {
  return (
    <WalkSheet
      rows={shown.filter(worksInPlace)}
      at={walk}
      onAt={setWalk}
      kept={ctx.kept}
      work={{ may: ctx.may, tz: ctx.tz, flash: ctx.flash, keep: ctx.keep }}
      word={ctx.word}
      todos={todos}
      onToDo={() => {
        setWalk(null);
        document.querySelector('[data-testid="today-todo"]')?.scrollIntoView({ block: "start" });
      }}
    />
  );
}

const TodayQueue = ({ vm }: { vm: TodayVM }) => {
  // People too: a person's next step come due is a row (queue-steps.tsx), read from People's rows. The Calendar too: yesterday's
  // visits nobody has marked are rows (queue-visits.tsx), read from its blocks, which `useDayVm` hears as the day's card does. And
  // the replies to a reach-out: a reply read is its own row, not a plain one that needs you (contracts withReplies; the wiring's
  // second audit, W-campaign-run-template-reachout-7). Ask's morning and Google's reviews are rows too (decision 0071). Today
  // owns those reads, so this redraws and reads nothing.
  useMoved(["broadcasts", "people", "calendar", "reach_out_replies", "ask_morning", "google"]);
  // What needs you, by its parts, as the badge counts them: null until the Inbox has been read (redrawn when a part moves).
  const live = useNeedsYouParts();
  const [toastNode, ppFlash] = useToast();
  // The steps marked done here, gone from the card at once while People is read again behind the verb.
  const [done, setDone] = useState<readonly string[]>([]);
  // The rows acted on this visit (a reply sent, a thread snoozed, a visit marked), kept in their place; the rows opened.
  const [kept, setKept] = useState<Kept>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const { phone, walk, setWalk, toDo } = usePhoneQueue();
  // The runs with an Approve or a Cancel on its way: their buttons wait for the server (S9-10).
  const acting = useRunsActing();
  const nav: Nav = (to) => appNavigate(to);
  const may = canDo("approve");
  const tz = workspaceClock()?.zone() ?? DEFAULT_TIMEZONE;
  // A handoff whose thread's reply to a reach-out was read is that reply's row (contracts withReplies, PR 8); a person's
  // next step come due is a row of its own, after everyone waiting (contracts withSteps, 0007), and so is each of
  // yesterday's visits nobody has said whether they came to, after the steps (contracts withVisitsAsked, 0047).
  const steps = dueSteps();
  const word: AppointmentWord = useDayVm()?.word ?? "appointment";
  const visits = askedVisits(word);
  const read = phone
    ? TODAY_HELPERS.withReplies(vm.queue.rows)
    : TODAY_HELPERS.withVisitsAsked(TODAY_HELPERS.withSteps(TODAY_HELPERS.withReplies(vm.queue.rows), steps), visits);
  // A step marked done leaves the card at once, kept or not: its toast holds the Undo.
  const rows = withKept(read, kept).filter((r) => !(r.step && done.includes(r.step.note_id)));
  // One primary verb on the page: the first open row's. Every other verb is drawn, quietly.
  let primaryLeft = true;
  const verbKind: VerbKind = () => {
    const k = primaryLeft ? "primary" : "ghost";
    primaryLeft = false;
    return k;
  };
  // The run's seat, held only while a run wants it (CARD_MAX).
  const wants = runsPending();
  const peopleRoom = wants.waiting.length + wants.late.length > 0 ? PEOPLE_MAX : CARD_MAX;
  const shown = rows.slice(0, peopleRoom);
  const ctx: NeedYouRowsCtx = {
    nav,
    verbKind,
    may,
    tz,
    flash: ppFlash,
    keep: (row) =>
      setKept((was) => ({ ...was, [row.id]: { row, at: was[row.id]?.at ?? rows.findIndex((r) => r.id === row.id) } })),
    kept: new Set(Object.keys(kept)),
    expanded,
    expand: (id) => setExpanded((was) => new Set([...was, id])),
    word,
    stepDone: (r) =>
      void stepDone(r, ppFlash, {
        hide: (noteId) => setDone((was) => [...was, noteId]),
        show: (noteId) => setDone((was) => was.filter((id) => id !== noteId)),
      }),
    phone: phone ? { walk: setWalk } : null,
  };
  const drawn = needYouRows(shown, ctx);
  // The drafts the drawn rows want, written ahead (asked for once per set, by their key).
  useDraftsAhead(draftWantsOf(shown), may);
  // Ask's line says what it prepared for the rows still open: one acted on this visit is said in its own row.
  const open = shown.filter((r) => !kept[r.id]);
  // On a phone they are Ask found's, so here they ask for no coral and are not drawn.
  const extras = useExtras(phone ? { ...ctx, verbKind: () => "ghost" } : ctx);
  // A person who has been waiting comes before a run waiting for a word, so runs take only what is left.
  const {
    drawn: runs,
    count: runsCount,
    cut: runsCut,
  } = waitRows({ nav, flash: ppFlash, verbKind, acting }, Math.max(0, CARD_MAX - drawn.length));
  // Every row has asked for its act by now: whether one took the coral, for the setup card above (queue-coral.ts).
  const holdsCoral = !primaryLeft;
  useLayoutEffect(() => {
    queueHoldsCoral(holdsCoral);
  }, [holdsCoral]);
  useLayoutEffect(() => () => queueHoldsCoral(false), []);
  const parts = needsYouOnToday(vm, live);
  // What the card could not hold is counted, never dropped: the rows past the cap and the ones the view
  // model already counted for the Inbox are the same kind of thing to a reader. The PEOPLE among them, since the foot
  // names the Inbox: it said "28 more in the Inbox" counting four calls and a search that live elsewhere, and the
  // head's sentence already says those (the 2 Oct 2026 audit).
  const rowsCut = rows.slice(drawn.length).filter(isPersonRow).length + vm.queue.more_people;
  // The steps due the card did not draw are counted the same way, with their own door (People's Steps due).
  const left = stepsLeft(steps, done, shown);
  // And the visits to mark the card did not draw, with the Calendar on yesterday as their door.
  const toMark = visitsLeft(visits, [], shown);
  const total = rows.length + runsCount + vm.queue.more;
  // The head's number is the one every surface says of what needs you (needs-you.ts): the Inbox's badge, the strip's tab, the
  // tab's title and the phone's. What waits on a person is a hold nobody has taken, a reply counting down and a run waiting for
  // a word, under a title that says "Need you"; a reply window closing, a search that stopped to ask, a call worth a listen,
  // a step due and a visit to mark are said in the sub-line beside it, each in its own words (the head counted the calls too,
  // so it read 24 over 19: the 2 Oct 2026 audit). Until the Inbox has been read, it is Today's own copy of the same threads
  // (the brief's holds and sends) and the runs on this card (needsYouOnToday).
  const waiting = needsYouCount(parts);
  // Where the door goes: the Inbox while a person waits, else, when only runs wait, the run (one), To send (every one
  // waiting waits for its owner to send its emails) or Needs you (contracts waitingRunsDoor).
  const doorTo = parts.holds + parts.sends === 0 && parts.runs > 0 ? waitingRunsDoor(wants.waiting) : "inbox";
  const door = {
    to: doorTo,
    label: doorTo === "inbox" ? NEED_YOU_WORDS.door : (verbForRoute(doorTo) ?? NEED_YOU_WORDS.door),
  };
  // A reply counting down has a row now (decision 0071): the head's line says only those it does not draw. One stopped on
  // this visit is kept in its place but counts down no more, so it is not taken from what the Inbox still counts.
  const sendsUndrawn = Math.max(0, parts.sends - open.filter((r) => r.kind === "held").length);
  // On a phone, nothing to draw is no pane at all: the head has said so.
  if (phone && drawn.length === 0 && runs.length === 0 && toDo === 0) return toastNode;
  return (
    <section
      className="tq today-queue"
      data-testid="today-queue"
      data-phone={phone || undefined}
      aria-labelledby={phone ? TODAY_HEAD_ID : undefined}
    >
      {/* No count over the rows: the sentence says what they hold, and the rows are right under it. On a phone the page's
          head is theirs (phone/head.tsx), and what the card could not hold is the Inbox tab's. */}
      {!phone &&
        queueHead(vm, nav, {
          count: waiting,
          steps: left.due,
          visits: toMark.due,
          word,
          sends: sendsUndrawn,
          runs: { waiting: wants.waiting.length, late: wants.late.length },
          door,
        })}
      {/* On a phone each card says what Ask prepared for it, and the head's line is the one line over them. */}
      {!phone && <AskSays wants={draftWantsOf(open)} rows={open} may={may} />}
      <LiveRail nav={nav} />
      {queueList(vm, phone ? drawn : [...drawn, ...extras], runs, { total, waiting, phone })}
      {phone ? <TodayToDo queueHolds={holdsCoral} /> : null}
      {phone ? queueWalk(shown, { walk, setWalk }, ctx, toDo) : null}
      {!phone &&
        queueFoot(
          { rows: rowsCut, runs: runsCut, steps: left.cut, visits: toMark.cut, sends: sendsUndrawn },
          { steps: steps ? steps.to : null, visits: visits ? visits.to : null, word },
          nav,
        )}
      {toastNode}
    </section>
  );
};
