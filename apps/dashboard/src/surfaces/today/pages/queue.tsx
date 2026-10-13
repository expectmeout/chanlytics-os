/**
 * Today's queue (moved from pages/dashboard-a-command.jsx, decision 0015, step 4): everything that asks for a person,
 * in one row grammar (the kit's AttnRow), the longest wait first: WhatsApp handoffs, callers who need a call back,
 * reply windows closing, calls worth an ear (contracts today.ts queue), a person's next step once its day has come
 * (0007: queue-steps.tsx), yesterday's visits nobody has said whether they came to (0047: queue-visits.tsx), and the
 * playbook runs that wait for a word or
 * sit under a Stop (the broadcasts surface, queue-runs.tsx). A call in progress rides above the list while it lasts.
 * The first row carries the page's one primary verb; the rest wear theirs quietly. Every sentence with a number is
 * contracts' (todayRunWords, todayRunsSub, todayRunApproved).
 *
 * It was Agent Command: a seeded bar with Now/Soon buckets, an insight line, decision rows with Approve/Decline, and
 * a count badge over a list that already says its count. The seed left with the mockup's stand-in: the mockup drew
 * this page from its sample (legacy-bridge/today-sample.ts), which is gone.
 */
import { useState, type ReactElement } from "react";
import {
  isPersonRow,
  namesAPerson,
  needsYouCount,
  type AppointmentWord,
  type TodayQueueRowVM,
  type TodayVM,
  type VisitWord,
} from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { useNeedsYou } from "../../needs-you";
import { businessTrailFor } from "../../people/business-trail";
import { surfaceValue } from "../../surface-values";
import { usePartShown } from "../../use-surface";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, doorGlyph, surfaceFailed, useMoved, useToast } from "../shell";
import { useDayVm } from "./day";
import { liveClock, useLiveNow } from "./live-now";
import { broadcastsRead, runRows, runsPending, type Nav, type VerbKind } from "./queue-runs";
import { dueSteps, stepAct, stepDone, stepsLeft } from "./queue-steps";
import { askedVisits, visitActs, visitSay, visitsLeft } from "./queue-visits";

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
// run about to send is news. On a busy day four runs under six people put "Nothing sends until you say so" three
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

/** What a row's verb does: which button it is (the page's one primary goes first), a step's Done and a visit's word. */
interface RowActs {
  kind: VerbKind;
  done: (r: TodayQueueRowVM) => unknown;
  say: (r: TodayQueueRowVM, status: VisitWord) => unknown;
}

/**
 * The people the card draws, each with its one verb, as E3 does (Ruben, 1 Oct 2026: a second word on the row read as
 * clutter); snooze and resolve are the thread's, in the Inbox.
 */
function personRows(rows: TodayQueueRowVM[], nav: Nav, acts: RowActs) {
  const { done, say } = acts;
  const verb = { kind: acts.kind };
  return rows.map((r) => {
    // A visit to mark asks "Did they come?" with two verbs of its own, Kept and Missed, and its door is the visit on the Calendar.
    const asks = r.kind === "visit" ? visitActs(r, verb.kind(), say) : null;
    return (
      <AttnRow
        key={r.id}
        // A person wears the one face (the kit's Face, by contracts' personFaceOf): a number's or an address's glyph,
        // whichever wire they came on, else their initials. A search and the count of steps are not a person.
        {...(namesAPerson(r) ? { person: { name: r.who, initials: r.initials } } : { initials: r.initials })}
        name={r.who}
        // The business they work at, dim after their name, from People's rows (0052).
        trail={namesAPerson(r) ? businessTrailFor(r.person_id) : null}
        meta={[r.channel, r.when].filter(Boolean).join(", ")}
        sentence={r.sentence}
        quoted={r.quoted}
        status={r.status}
        tone={r.tone}
        // A step's one verb is Done, which the row's door (the person) is not; every other row's verb is its door.
        cta={
          r.kind === "step"
            ? stepAct(r, verb.kind(), done)
            : asks
              ? asks.cta
              : { label: r.cta.label, kind: verb.kind(), onClick: () => nav(r.cta.to) }
        }
        also={asks ? asks.also : null}
        onOpen={() => nav(r.cta.to)}
        testid={`queue-${r.kind}`}
      />
    );
  });
}

/**
 * The head: the title, what the rows hold in words (contracts', with the runs waiting), and the door to the Inbox. In
 * Glass the count stands before the title as its canvas draws it (E3), and the door carries its arrow.
 */
function queueHead(
  vm: TodayVM,
  runsCount: number,
  nav: Nav,
  head: { count: number; steps: number; visits: number; word: AppointmentWord },
) {
  return (
    <div className="tq-head">
      <span className="tq-num tabular" data-testid="today-queue-count">
        {head.count}
      </span>
      <span className="tq-title">Need you</span>
      <span className="tq-sub">
        {[
          ...vm.queue.parts,
          head.steps > 0 ? TODAY_HELPERS.stepsSub(head.steps) : "",
          head.visits > 0 ? TODAY_HELPERS.visitsSub(head.visits, head.word) : "",
          TODAY_HELPERS.runsSub(runsCount),
        ]
          .filter(Boolean)
          .join(" · ") || vm.queue.empty.sub}
      </span>
      <button type="button" className="tq-open" onClick={() => nav("inbox")}>
        Open Inbox
        <Icon name={doorGlyph()} size={11} />
      </button>
    </div>
  );
}

/** The rows, the runs, and what stands where they would be: a read that failed, or what an empty queue means. */
function queueList(vm: TodayVM, drawn: ReactElement[], runs: ReactElement[], total: number) {
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
          the receptionist does not answer (email), or the receptionist holding the floor. */}
      {total === 0 && (
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
  cut: { rows: number; runs: number; steps: number; visits: number },
  doors: { steps: string | null; visits: string | null; word: AppointmentWord },
  nav: Nav,
) {
  const parts = [
    cut.rows > 0 ? `${cut.rows} more in the Inbox` : "",
    cut.runs > 0 ? `${cut.runs} more run${cut.runs === 1 ? "" : "s"} in Campaigns` : "",
  ].filter(Boolean);
  // The steps cut are their own door, People's Steps due (the list the row for the rest opens), and the visits to mark that
  // were cut are the Calendar's, on yesterday: "See all" goes to the Inbox or Campaigns, where people and runs wait, and a
  // step or a visit is neither.
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
      <button
        className="cl-attn-cta ghost"
        onClick={() => nav(cut.rows === 0 && cut.runs > 0 ? "broadcasts" : "inbox")}
      >
        See all
      </button>
    </div>
  );
}

const TodayQueue = ({ vm }: { vm: TodayVM }) => {
  // People too: a person's next step come due is a row (queue-steps.tsx), read from People's rows. The Calendar too: yesterday's
  // visits nobody has marked are rows (queue-visits.tsx), read from its blocks, which `useDayVm` hears as the day's card does.
  useMoved(["broadcasts", "people", "calendar"]);
  // What needs you, as the badge says it: null until the Inbox has been read.
  const published = useNeedsYou();
  const [toastNode, ppFlash] = useToast();
  // The steps marked done here, gone from the card at once while People is read again behind the verb.
  const [done, setDone] = useState<readonly string[]>([]);
  // The visits marked here, gone from the card the same way while the Calendar is read again behind the verb.
  const [marked, setMarked] = useState<readonly string[]>([]);
  const nav: Nav = (to) => appNavigate(to);
  // A handoff whose thread's reply to a reach-out was read is that reply's row (contracts withReplies, PR 8); a person's
  // next step come due is a row of its own, after everyone waiting (contracts withSteps, 0007), and so is each of
  // yesterday's visits nobody has said whether they came to, after the steps (contracts withVisitsAsked, 0047).
  const steps = dueSteps();
  const word = useDayVm()?.word ?? "appointment";
  const visits = askedVisits(word);
  const rows = TODAY_HELPERS.withVisitsAsked(
    TODAY_HELPERS.withSteps(TODAY_HELPERS.withReplies(vm.queue.rows), steps),
    visits,
  ).filter((r) => !(r.step && done.includes(r.step.note_id)) && !(r.visit && marked.includes(r.visit.id)));
  // One primary verb on the page: the first row's. Every other verb is drawn, quietly.
  let primaryLeft = true;
  const verbKind: VerbKind = () => {
    const k = primaryLeft ? "primary" : "ghost";
    primaryLeft = false;
    return k;
  };
  // The run's seat, held only while a run wants it (CARD_MAX).
  const wants = runsPending();
  const peopleRoom = wants.waiting.length + wants.soon.length > 0 ? PEOPLE_MAX : CARD_MAX;
  const drawn = personRows(rows.slice(0, peopleRoom), nav, {
    kind: verbKind,
    done: (r) =>
      stepDone(r, ppFlash, {
        hide: (noteId) => setDone((was) => [...was, noteId]),
        show: (noteId) => setDone((was) => was.filter((id) => id !== noteId)),
      }),
    say: (r, status) => visitSay(r, status, { flash: ppFlash, hide: (markId) => setMarked((was) => [...was, markId]) }),
  });
  // A person who has been waiting comes before a run waiting for a word, so runs take only what is left.
  const {
    drawn: runs,
    count: runsCount,
    cut: runsCut,
  } = runRows(nav, ppFlash, verbKind, Math.max(0, CARD_MAX - drawn.length));
  // What the card could not hold is counted, never dropped: the rows past the cap and the ones the view
  // model already counted for the Inbox are the same kind of thing to a reader. The PEOPLE among them, since the foot
  // names the Inbox: it said "28 more in the Inbox" counting four calls and a search that live elsewhere, and the
  // head's sentence already says those (the 2 Oct 2026 audit).
  const rowsCut = rows.slice(drawn.length).filter(isPersonRow).length + vm.queue.more_people;
  // The steps due the card did not draw are counted the same way, with their own door (People's Steps due).
  const left = stepsLeft(steps, done, rows.slice(0, drawn.length));
  // And the visits to mark the card did not draw, with the Calendar on yesterday as their door.
  const toMark = visitsLeft(visits, marked, rows.slice(0, drawn.length));
  const total = rows.length + runsCount + vm.queue.more;
  // The head's number is the one every surface says of what needs you (needs-you.ts): the Inbox's badge, the strip's tab, the
  // tab's title and the phone's. What waits on a person is a hold nobody has taken, a reply counting down and a run waiting for
  // a word, under a title that says "Need you"; a reply window closing, a search that stopped to ask, a call worth a listen,
  // a step due and a visit to mark are said in the sub-line beside it, each in its own words (the head counted the calls too,
  // so it read 24 over 19: the 2 Oct 2026 audit). Until the Inbox has been read, it is Today's own copy of the same threads
  // (the headline's count, the wire rule) and the runs on this card.
  const waiting = published ?? needsYouCount({ holds: vm.needsYou?.count ?? 0, sends: 0, runs: wants.waiting.length });
  return (
    <section className="tq today-queue" data-testid="today-queue">
      {/* No count over the rows: the sentence says what they hold, and the rows are right under it. */}
      {queueHead(vm, runsCount, nav, { count: waiting, steps: left.due, visits: toMark.due, word })}
      <LiveRail nav={nav} />
      {queueList(vm, drawn, runs, total)}
      {queueFoot(
        { rows: rowsCut, runs: runsCut, steps: left.cut, visits: toMark.cut },
        { steps: steps ? steps.to : null, visits: visits ? visits.to : null, word },
        nav,
      )}
      {toastNode}
    </section>
  );
};
