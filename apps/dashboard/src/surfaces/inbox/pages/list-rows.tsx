/**
 * One row of the Inbox list, and the words of confidence (moved from pages/inbox-list.jsx, decision 0015, step 3): who,
 * the pills, the one time, what was said, and what is under it. Plain functions returning JSX, called by the list, so the
 * row has the nodes it always had.
 */
import type { ThreadMoveKey } from "@chanlytics/contracts";
import {
  countdownClock,
  heldPill,
  holdToDoOf,
  personFaceOf,
  PITCH_TODO,
  THREAD_PANE_WORDS,
  waitedSaid,
} from "@chanlytics/contracts";
import { Face } from "../../kit/face/face";
import { RowGap } from "../../kit/rows/row-gap";
import { useShownRows, type ShownRows } from "../../kit/rows/shown-rows";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { StoppedMark } from "../../kit/pill/stopped-mark";
import { holderName } from "../../holder-names";
import { CONF } from "../constants";
import { ixMoveOf, ixMoveWaited, ixWaitSaid } from "../rules";
import type { ListCtx } from "./inbox-list";
import { pickBox } from "./pick";
import { ReplyChip } from "../thread/reply-strip";
import { threadDraftNow } from "../thread/kept-draft";
import { useDraftsMoved } from "../../today/need-you/drafts";
import { channelIconOf } from "../thread/timeline";
import { inboxData } from "../store";
import { threadUnread } from "../../seen";
import { businessTrailFor } from "../../people/business-trail";
import type { RealThread, Thread } from "../types";

/**
 * The words a row says and the wire they came on: what they asked where a person is needed (their last words, or what
 * the call left behind), anywhere else the last thing that happened. The wire is one badge on the face (rowWire): the
 * row drew a glyph for every wire the thread had used beside the words, and WhatsApp and a text are both the chat
 * bubble, so a person on both with a call read bubble, bubble, phone beside the words of the call. Every wire is said
 * once, in words, in the thread's header. A seeded thread has no such fact, and wears its first wire.
 */
function rowSaidOn(t: Thread): { text: string; wire: string } {
  if (!t.real) return { text: t.preview, wire: t.primaryChannel };
  const said = t.ask && t.ask.text ? { text: t.ask.text, wire: t.ask.channel } : null;
  const wire = said ? said.wire : (t.previewChannel ?? t.primaryChannel);
  // An email is said by what it is about, as a mailbox's row says it (the thread canvas's list, 1 Nov 2026): its first
  // lines were a greeting and the sender's name.
  if (wire === "email" && t.emailSubject) return { text: t.emailSubject, wire };
  return said ?? { text: t.preview, wire };
}

/**
 * The wire a row's words came on, worn by the face as a badge at its foot (inbox.css .ix-thread-wire), named for a screen
 * reader; none where the face is that wire's glyph already (someone known by their address alone, by email).
 */
function rowWire(wire: string, who: string) {
  if (personFaceOf(who).glyph === channelIconOf(wire)) return null;
  return (
    <span className="ix-thread-wire" role="img" aria-label={inboxData().CHANNEL_LABELS[wire] || wire}>
      <Icon name={channelIconOf(wire)} size={10} />
    </span>
  );
}

/**
 * How long the row's move has stood, in the one family (8d, 3h, 40m), where the thread has a next move to wait on, and what
 * the bare figure means: a real thread's by the rule, by the clock it is drawn at; a seeded one's as the mockup wrote it.
 */
function rowWaited(t: Thread): { figure: string; said: string } | null {
  if (t.real) {
    const move = ixMoveOf(t);
    const figure = move.list === "escalated" || move.list === "waiting" ? ixMoveWaited(t, move) : null;
    return figure ? { figure, said: ixWaitSaid(move, figure) } : null;
  }
  const waitingMin = t.waitingMin ?? 0;
  if (t.state !== "escalated" || waitingMin <= 0) return null;
  const figure = t.waited || `${waitingMin}m`;
  return { figure, said: waitedSaid(figure) };
}

/**
 * One time on a row: how long its move has stood, in the one family (8d, 3h, 40m); when a snoozed thread wakes; or else
 * when it last moved. A waiting row said "waiting 12m" beside "5:51 PM".
 */
function rowTime(t: Thread, sending: number | null) {
  if (sending != null) {
    return (
      <span className="pill pill-accent ix-wait ix-sending tabular">
        <span className="ix-veto-dot" aria-hidden="true" /> {THREAD_PANE_WORDS.sendsIn} {countdownClock(sending)}
      </span>
    );
  }
  // How long they have waited, the bare figure in the mono face at the row's right (the thread canvas's list, 1 Nov
  // 2026): what the row asks of you is said in the coral under it, so the wait is no second signal.
  const waited = rowWaited(t);
  if (waited) {
    // The figure for the eye, and the whole of it for a screen reader, which read "2h" alone as nothing.
    return (
      <>
        <span className="ix-thread-time ix-thread-wait tabular" title={waited.said} aria-hidden="true">
          {waited.figure}
        </span>
        <span className="ix-wait-said">{waited.said}</span>
      </>
    );
  }
  if (t.state === "snoozed" && t.wake) {
    return (
      <span className="pill ix-wait tabular">
        <Icon name="clock" size={9} /> {t.wake}
      </span>
    );
  }
  return <span className="ix-thread-time tabular">{t.lastAt}</span>;
}

/**
 * What is under a row's words: the agent, how sure it is, the tags and what the person is worth. A real thread's
 * receptionist is its wire's ("WhatsApp Receptionist"), which the face's badge already says, so a real row never names
 * it: the mockup's agents differ by name, and a seeded row still says which where they do.
 */
function rowFoot(L: ListCtx, t: Thread) {
  const agentNamed = L.multipleAgents && !t.real;
  const confidence = t.confidence ?? 0;
  const value = t.value ?? 0;
  const footed = agentNamed || confidence > 0 || (t.tags || []).length > 0 || value > 0;
  return (
    footed && (
      <div className="ix-thread-foot">
        {agentNamed && (
          <span className="ix-thread-agent">
            <span>{t.agent.name}</span>
          </span>
        )}
        {confidence > 0 && (
          <span className="ix-thread-conf">
            <ConfidenceDots level={confidence} />
          </span>
        )}
        {t.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="ix-tag">
            {tag}
          </span>
        ))}
        {value > 0 && <span className="ix-thread-value tabular">${value.toLocaleString()} LTV</span>}
      </div>
    )
  );
}

/** The business a named person works at, dim after their name (0052), giving way before the name does. */
function rowTrail(t: Thread) {
  const trail = t.real ? businessTrailFor(t.clientId) : null;
  return trail ? (
    <span className="ix-thread-trail" data-testid="thread-business">
      · {trail}
    </span>
  ) : null;
}

/** The words a row's list or its time says already, or that no row wears: a pill would say nothing more. */
const ROW_NO_PILL: ReadonlySet<ThreadMoveKey> = new Set<ThreadMoveKey>([
  "answered",
  "call",
  "nothing",
  "stopped",
  "snoozed",
  "aside",
  "sending",
]);

/** A real thread's pill: whose move it is, in the tone map's word and colour, and no pill where its list has said it. */
function rowMovePill(L: ListCtx, t: RealThread) {
  const { move } = ixMoveOf(t);
  // Needs you only on a thread that does, and not again in the list that already says it (I2); a search spans the lists,
  // so a row there always says.
  if (move === "needs_you")
    return L.searching || !(L.inNeedsBucket || L.activeBucket === "escalated") ? (
      <StatePill kind="thread" value="escalated" className="ix-state-pill" testid="thread-state" />
    ) : null;
  // A teammate has it: say whose, never Needs you.
  if (move === "theirs")
    return (
      <StatePill
        kind="thread"
        value="theirs"
        label={heldPill("theirs", holderName(t.assigneeUserId))}
        className="ix-state-pill ix-name-pill"
        testid="thread-theirs"
      />
    );
  // A thread you have is yours to answer, not waiting on you (I2).
  if (move === "yours")
    return <StatePill kind="thread" value="yours" className="ix-state-pill" testid="thread-yours" />;
  return ROW_NO_PILL.has(move) ? null : (
    <StatePill kind="thread" value={move} className="ix-state-pill" testid="thread-last-word" />
  );
}

/** A row's first line: who, the pill and the one time. */
function rowLine1(L: ListCtx, t: Thread) {
  const { inNeedsBucket, searching, sendingIn } = L;
  // A seeded thread keeps the mockup's: a pill in the buckets that do not say it already.
  const seededPill = !t.real && (searching || !inNeedsBucket) && t.state === "escalated" && !t.claimedByOther;
  // The seconds before a reply of its own goes out: the row's one time while they run.
  const sending = t.real ? sendingIn(t.id) : null;
  return (
    <div className="ix-thread-line1">
      <span className="ix-thread-who">{t.who}</span>
      {rowTrail(t)}
      {t.pinned && <Icon name="pin" size={10} />}
      <div className="ix-thread-meta" data-gives={t.real && ixMoveOf(t).move === "theirs" ? true : undefined}>
        {/* They asked to stop: said beside the name, where the owner picks who to answer, not first at a reply box that
            will not take the words (D1-stop-unseen). */}
        {t.real && t.optedOut && <StoppedMark className="ix-state-pill" testid="thread-stopped" />}
        {seededPill && <StatePill kind="thread" value="escalated" className="ix-state-pill" testid="thread-state" />}
        {t.real && rowMovePill(L, t)}
        <ReplyChip thread={t} />
        {/* One time on a row: how long they have waited, in the one family (8d, 3h, 40m) and amber only
            when it is waiting on you; when a snoozed thread wakes; or else when it last moved. A waiting
            row said "waiting 12m" beside "5:51 PM". */}
        {rowTime(t, sending)}
      </div>
    </div>
  );
}

/**
 * What a row asks of you, its last line in the coral (the thread canvas's list, 1 Nov 2026): the hold's act ("Call back",
 * "Confirm a time"), and "Draft ready" where one is; only on a thread that needs you. It
 * stood over their words as the reason's label, a sentence over a sentence. A flagged thread you or a teammate have says
 * the reason there instead, quietly: the pill beside the name says whose it is.
 */
function rowToDo(t: Thread) {
  if (!t.real) return null;
  const { move, list } = ixMoveOf(t);
  // A thread's one draft says whether its reply is ready to use; set aside, it is asked whether they are a customer at all;
  // words that never left go again as they were, and whoever nobody has answered is owed a reply. A campaign's send that
  // failed stands in Handled, and asks nothing: its run reports it.
  const drafted = () => threadDraftNow(t).state === "ready";
  const todo = t.setAside
    ? PITCH_TODO
    : move === "failed" && list === "escalated"
      ? THREAD_PANE_WORDS.sendAgain
      : move === "unanswered" || move === "wrote_again"
        ? holdToDoOf("reply", drafted())
        : move === "needs_you"
          ? holdToDoOf(t.holdAct, drafted())
          : null;
  if (todo)
    return (
      <div className="ix-thread-todo" data-testid="thread-todo">
        {todo}
      </div>
    );
  // A flagged thread someone has: why it was flagged, in the quiet ink, where the to-do would stand.
  return t.subject ? <div className="ix-thread-subject">{t.subject}</div> : null;
}

/** A row's body: the line of who, what you chose, the words, what it asks of you and the foot. */
function rowBody(L: ListCtx, t: Thread, words: { text: string }) {
  return (
    <div className="ix-thread-body">
      {rowLine1(L, t)}
      {/* A seeded thread's reason stands over its words, as the demo wrote it; a real one says what to do under them. */}
      {!t.real && t.subject && <div className="ix-thread-subject">{t.subject}</div>}
      {t.resolution && (
        <div className={`ix-thread-resolution ${t.resolution.declined ? "declined" : ""}`}>
          <Icon name={t.resolution.declined ? "x" : "check"} size={10} />
          You: {t.resolution.action} · {t.resolution.at}
        </div>
      )}
      {words.text && (
        <div className="ix-thread-line3">
          <span className="ix-thread-preview">{words.text}</span>
        </div>
      )}
      {rowToDo(t)}
      {rowFoot(L, t)}
    </div>
  );
}

/**
 * The Inbox's rows drawn: the ones on screen and a few either side (kit/rows/shown-rows.ts), and the open one and its
 * neighbours wherever they are, so the arrows and J/K that walk them find each (pick.tsx pickKeys).
 */
export function useShownThreads(visible: readonly Thread[], openId: string | null, density: string): ShownRows {
  // A row's last line reads its thread's draft (rowToDo), so the rows are drawn again as one lands.
  useDraftsMoved();
  const open = visible.findIndex((t) => t.id === openId);
  return useShownRows({
    count: visible.length,
    estimate: density === "compact" ? 56 : 76,
    keyOf: (i) => visible[i]?.id ?? String(i),
    keep: open >= 0 ? [open - 1, open, open + 1] : [0],
  });
}

/** The rows `useShownThreads` says, and the room of the others. */
export function threadRows(L: ListCtx, shown: ShownRows) {
  return shown.parts.map((part) => {
    if (part.kind === "gap") return <RowGap key={part.key} height={part.height} />;
    const t = L.visible[part.index];
    return t ? threadRow(L, t, part.index, { measure: shown.measure, of: L.visible.length }) : null;
  });
}

/**
 * One row. `place`, where it is one of a list's (threadRows): what measures it once drawn, and how many rows the list has,
 * so it says its place in all of them to a screen reader.
 */
function threadRow(L: ListCtx, t: Thread, i: number, place?: { measure: (el: Element | null) => void; of: number }) {
  const { activeThreadId, selected, tabStopId, onSelectThread, onToggleSelect, onRowKey } = L;
  const isActive = activeThreadId === t.id;
  const isSelected = selected.includes(t.id);
  // What they asked, where a person is needed: their last words, or what the call left behind. The row showed
  // the last message there, often the receptionist's holding reply. Anywhere else, the last thing that happened.
  const words = rowSaidOn(t);
  return (
    <div
      key={t.id}
      className={`ix-thread ${isActive ? "active" : ""} ${isSelected ? "selected" : ""} ${threadUnread(t) ? "unread" : ""} pri-${t.priority?.toLowerCase()}`}
      role="option"
      aria-selected={isSelected}
      aria-current={isActive ? "true" : undefined}
      // Its place in the list, which draws only the rows near the screen (useShownThreads): a screen reader counts them all.
      aria-setsize={place?.of}
      aria-posinset={place ? i + 1 : undefined}
      tabIndex={t.id === tabStopId ? 0 : -1}
      data-thread-id={t.id}
      ref={place?.measure}
      data-index={i}
      onClick={() => onSelectThread(t.id)}
      onKeyDown={(e) => onRowKey(e, i)}
    >
      {/* The mouse's box: the row itself says selected, and Space picks it. */}
      {pickBox({ picked: isSelected, onToggle: () => onToggleSelect(t.id) })}

      {/* The one face (the kit's, by contracts' personFaceOf), with the wire of the words as a badge at its foot. */}
      <span className="ix-thread-lead">
        <Face person={{ name: t.who, initials: t.avatar }} priority={t.priority} className="ix-thread-pic" />
        {rowWire(words.wire, t.who)}
      </span>

      {rowBody(L, t, words)}
    </div>
  );
}

const ConfidenceDots = ({ level }: { level: number }) => {
  const filled = level >= CONF.SAFE ? 3 : level >= CONF.MED ? 2 : 1;
  const tone = filled === 3 ? "high" : filled === 2 ? "med" : "low";
  // Humans get language; the 0–1 float stays in the data
  const word = filled === 3 ? "Safe to send" : filled === 2 ? "Wants your eyes" : "Needs you";
  return (
    <span
      className={`conf-word conf-${tone}`}
      data-tip={`${Math.round(level * 100)}% confident — 80%+ counts as safe for bulk approve`}
    >
      {word}
    </span>
  );
};
