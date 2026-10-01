/**
 * Today's queue (moved from pages/dashboard-a-command.jsx, decision 0015, step 4): everything that asks for a person,
 * in one row grammar (the kit's AttnRow), the longest wait first: WhatsApp handoffs, callers who need a call back,
 * reply windows closing, calls worth an ear (contracts today.ts queue), and the playbook runs that wait for a word or
 * sit under a Stop (the broadcasts surface, queue-runs.tsx). A call in progress rides above the list while it lasts.
 * The first row carries the page's one primary verb; the rest wear theirs quietly. Every sentence with a number is
 * contracts' (todayRunWords, todayRunsSub, todayRunApproved).
 *
 * It was Agent Command: a seeded bar with Now/Soon buckets, an insight line, decision rows with Approve/Decline, and
 * a count badge over a list that already says its count. The seed left with the mockup's stand-in: the mockup drew
 * this page from its sample (legacy-bridge/today-sample.ts), which is gone.
 */
import type { ReactElement } from "react";
import type { TodayQueueRowVM, TodayVM } from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { useLook } from "../../kit/look/look";
import { inboxVerb } from "../../inbox/verbs";
import { surfaceValue } from "../../surface-values";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, canDo, gate, refusalFlash, surfaceFailed, useMoved, useToast } from "../shell";
import { liveClock, useLiveNow } from "./live-now";
import { broadcastsRead, runRows, runsPending, type Nav, type Say, type VerbKind } from "./queue-runs";

export const AgentCommand = () => {
  useMoved("today");
  const vm = surfaceValue("today");
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

/** A person's row's second verb: its words, and which of the two it is. */
type Also = NonNullable<TodayQueueRowVM["also"]>;

/**
 * A person's second verb, snooze or resolve, on its thread. What it returns is the caller's (the tests await it), so it
 * is typed as nothing React would read.
 */
const queueVerb: (flash: Say, r: TodayQueueRowVM, also: Also) => unknown = async (flash, r, also) => {
  if (!canDo("approve")) return;
  const which = also.verb;
  // Said the moment the server takes it, not after the Inbox, the threads and Today are read again behind it
  // (the row itself leaves with that re-read: the server owns the thread).
  let said = false;
  const done = () => {
    said = true;
    flash({
      msg:
        which === "snooze" ? (
          <>
            <b>{r.who}</b> snoozed: hidden until they wake or reply
          </>
        ) : (
          <>
            <b>{r.who}</b>: done, the receptionist has the thread back
          </>
        ),
    });
  };
  const res = await inboxVerb(
    { conversationId: also.conversationId, escalationId: also.escalationId, who: r.who },
    which,
    {},
    { onAccepted: done },
  );
  if (!res.ok) flash(refusalFlash(res, which === "snooze" ? "Not snoozed" : "Not resolved"));
  else if (!said) done();
};

/** The people the card draws: each with its one verb, and a second, quiet one where the state asks a second thing. */
function personRows(rows: TodayQueueRowVM[], nav: Nav, flash: Say, verbKind: VerbKind) {
  return rows.map((r) => {
    const also = r.also;
    return (
      <AttnRow
        key={r.id}
        initials={r.initials}
        glyph={r.channel === "Phone" && /^[+\d(]/.test(r.who) ? "phone" : null}
        name={r.who}
        meta={`${r.channel}, ${r.when}`}
        sentence={r.sentence}
        quoted={r.quoted}
        status={r.status}
        tone={r.tone}
        cta={{ label: r.cta.label, kind: verbKind(), onClick: () => nav(r.cta.to) }}
        also={
          also
            ? {
                label: also.label,
                onClick: () => queueVerb(flash, r, also),
                gate: gate("approve", also.verb === "snooze" ? "snooze a conversation" : "resolve a conversation"),
                testid: `queue-${also.verb}`,
              }
            : null
        }
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
function queueHead(vm: TodayVM, runsCount: number, nav: Nav, head: { glass: boolean; count: number }) {
  return (
    <div className="tq-head">
      {head.glass && (
        <span className="tq-num tabular" data-testid="today-queue-count">
          {head.count}
        </span>
      )}
      <span className="tq-title">Need you</span>
      <span className="tq-sub">
        {[...vm.queue.parts, TODAY_HELPERS.runsSub(runsCount)].filter(Boolean).join(" · ") || vm.queue.empty.sub}
      </span>
      <button type="button" className="tq-open" onClick={() => nav("inbox")}>
        Open Inbox
        {head.glass && <Icon name="arrow-right" size={11} />}
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
          what="the playbook runs"
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

/** What the card could not hold, said with the door to it. */
function queueFoot(rowsCut: number, runsCut: number, nav: Nav) {
  return (
    (rowsCut > 0 || runsCut > 0) && (
      <div className="tq-foot">
        <span>
          {[
            rowsCut > 0 ? `${rowsCut} more in the Inbox` : "",
            runsCut > 0 ? `${runsCut} more run${runsCut === 1 ? "" : "s"} in Campaigns` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <button className="cl-attn-cta ghost" onClick={() => nav(rowsCut > 0 ? "inbox" : "broadcasts")}>
          See all
        </button>
      </div>
    )
  );
}

const TodayQueue = ({ vm }: { vm: TodayVM }) => {
  useMoved("broadcasts");
  const glass = useLook() === "glass";
  const [toastNode, ppFlash] = useToast();
  const nav: Nav = (to) => appNavigate(to);
  // A handoff whose thread's reply to a reach-out was read is that reply's row (contracts withReplies, PR 8).
  const rows = TODAY_HELPERS.withReplies(vm.queue.rows);
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
  const drawn = personRows(rows.slice(0, peopleRoom), nav, ppFlash, verbKind);
  // A person who has been waiting comes before a run waiting for a word, so runs take only what is left.
  const {
    drawn: runs,
    count: runsCount,
    cut: runsCut,
  } = runRows(nav, ppFlash, verbKind, Math.max(0, CARD_MAX - drawn.length));
  // What the card could not hold is counted, never dropped: the rows past the cap and the ones the view
  // model already counted for the Inbox are the same kind of thing to a reader.
  const rowsCut = rows.length - drawn.length + vm.queue.more;
  const total = rows.length + runsCount + vm.queue.more;
  return (
    <section className="tq today-queue" data-testid="today-queue">
      {/* No count over the rows: the sentence says what they hold, and the rows are right under it. */}
      {queueHead(vm, runsCount, nav, { glass, count: total })}
      <LiveRail nav={nav} />
      {queueList(vm, drawn, runs, total)}
      {queueFoot(rowsCut, runsCut, nav)}
      {toastNode}
    </section>
  );
};
