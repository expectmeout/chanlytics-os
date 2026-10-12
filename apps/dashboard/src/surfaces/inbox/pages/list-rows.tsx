/**
 * One row of the Inbox list, and the words of confidence (moved from pages/inbox-list.jsx, decision 0015, step 3): who,
 * the pills, the one time, what was said, and what is under it. Plain functions returning JSX, called by the list, so the
 * row has the nodes it always had.
 */
import { heldPill } from "@chanlytics/contracts";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { StoppedMark } from "../../kit/pill/stopped-mark";
import { holderName } from "../../holder-names";
import { CONF } from "../constants";
import type { ListCtx } from "./inbox-list";
import { pickBox } from "./pick";
import { ReplyChip } from "../thread/reply-strip";
import { channelIconOf } from "../thread/timeline";
import { inboxData } from "../store";
import { threadUnread } from "../../seen";
import { businessTrailFor } from "../thread/shell-thread";
import type { Thread } from "../types";

/**
 * The words a row says and the wire they came on: what they asked where a person is needed (their last words, or what
 * the call left behind), anywhere else the last thing that happened. The wire is one badge on the face (rowWire): the
 * row drew a glyph for every wire the thread had used beside the words, and WhatsApp and a text are both the chat
 * bubble, so a person on both with a call read bubble, bubble, phone beside the words of the call. Every wire is said
 * once, in words, in the thread's header. A seeded thread has no such fact, and wears its first wire.
 */
function rowSaidOn(t: Thread): { text: string; wire: string } {
  if (!t.real) return { text: t.preview, wire: t.primaryChannel };
  if (t.ask && t.ask.text) return { text: t.ask.text, wire: t.ask.channel };
  return { text: t.preview, wire: t.previewChannel ?? t.primaryChannel };
}

/** The wire a row's words came on, worn by the face as a badge at its foot (inbox.css .ix-thread-wire), named for a screen reader. */
function rowWire(wire: string) {
  return (
    <span className="ix-thread-wire" role="img" aria-label={inboxData().CHANNEL_LABELS[wire] || wire}>
      <Icon name={channelIconOf(wire)} size={9} />
    </span>
  );
}

/**
 * One time on a row: how long they have waited, in the one family (8d, 3h, 40m) and amber only
 * when it is waiting on you; when a snoozed thread wakes; or else when it last moved. A waiting
 * row said "waiting 12m" beside "5:51 PM".
 */
function rowTime(t: Thread, sending: number | null) {
  const waitingMin = t.waitingMin ?? 0;
  if (sending != null) {
    return (
      <span className="pill pill-accent ix-wait ix-sending tabular">
        <span className="ix-veto-dot" aria-hidden="true" /> sending in {sending}s
      </span>
    );
  }
  if (t.state === "escalated" && waitingMin > 0) {
    return (
      <span
        className={`pill ix-wait tabular ${waitingMin > 30 && (t.real ? t.needsYou : !t.claimedByOther) ? "pill-warn" : ""}`}
      >
        waiting {t.waited || `${waitingMin}m`}
      </span>
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

/** A row's first line: who, the pill and the one time. */
function rowLine1(L: ListCtx, t: Thread) {
  const { activeBucket, inNeedsBucket, searching, sendingIn } = L;
  // Pills hide in the needs bucket (redundant there) but ALWAYS show on
  // cross-bucket search results so actionable rows stay distinguishable
  // A real thread's states are escalated | snoozed | done (viewmodels.ts). The
  // pill and the wait chip used to look for "needs", a state no real thread
  // has, so no real thread ever showed how long it had waited.
  // Needs you only on a thread that does -- never one you or a teammate have -- and not again in the bucket
  // that already says it: the check looked for the mockup's "needs", which no real thread is in (I2).
  const inItsBucket = inNeedsBucket || (t.real && activeBucket === "escalated");
  const showStatePill =
    (searching || !inItsBucket) && t.state === "escalated" && (t.real ? t.needsYou : !t.claimedByOther);
  // The seconds before a reply of its own goes out: the row's one time while they run.
  const sending = t.real ? sendingIn(t.id) : null;
  return (
    <div className="ix-thread-line1">
      <span className="ix-thread-who">{t.who}</span>
      {rowTrail(t)}
      {t.pinned && <Icon name="pin" size={10} />}
      <div className="ix-thread-meta">
        {/* They asked to stop: said beside the name, where the owner picks who to answer, not first at a reply box that
            will not take the words (D1-stop-unseen). */}
        {t.real && t.optedOut && <StoppedMark className="ix-state-pill" testid="thread-stopped" />}
        {showStatePill && <StatePill kind="thread" value="escalated" className="ix-state-pill" testid="thread-state" />}
        {/* A teammate has it: say whose, never Needs you. */}
        {t.real && t.claimedByOther && (
          <StatePill
            kind="thread"
            value="theirs"
            label={heldPill("theirs", holderName(t.assigneeUserId))}
            className="ix-state-pill ix-name-pill"
            testid="thread-theirs"
          />
        )}
        {/* A thread you have is yours to answer, not waiting on you (I2). */}
        {t.real && t.takenOver && (
          <StatePill kind="thread" value="yours" className="ix-state-pill" testid="thread-yours" />
        )}
        <ReplyChip thread={t} />
        {/* A Handled thread whose last reply didn't send says so here, not only in the pane (I1's lastWord). */}
        {t.real && t.state === "done" && t.lastWord && t.lastWord.short && (
          <StatePill
            kind="tone"
            value={t.lastWord.tone}
            label={t.lastWord.short}
            className="ix-state-pill"
            testid="thread-last-word"
          />
        )}
        {/* One time on a row: how long they have waited, in the one family (8d, 3h, 40m) and amber only
            when it is waiting on you; when a snoozed thread wakes; or else when it last moved. A waiting
            row said "waiting 12m" beside "5:51 PM". */}
        {rowTime(t, sending)}
      </div>
    </div>
  );
}

/** A row's body: the line of who, the subject, what you chose, the words and the foot. */
function rowBody(L: ListCtx, t: Thread, words: { text: string }) {
  return (
    <div className="ix-thread-body">
      {rowLine1(L, t)}
      {t.subject && <div className="ix-thread-subject">{t.subject}</div>}
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
      {rowFoot(L, t)}
    </div>
  );
}

export function threadRow(L: ListCtx, t: Thread, i: number) {
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
      tabIndex={t.id === tabStopId ? 0 : -1}
      data-thread-id={t.id}
      onClick={() => onSelectThread(t.id)}
      onKeyDown={(e) => onRowKey(e, i)}
    >
      {/* The mouse's box: the row itself says selected, and Space picks it. */}
      {pickBox({ picked: isSelected, onToggle: () => onToggleSelect(t.id) })}

      {/* The one face (the kit's, by contracts' personFaceOf), with the wire of the words as a badge at its foot. */}
      <span className="ix-thread-lead">
        <Face person={{ name: t.who, initials: t.avatar }} priority={t.priority} className="ix-thread-pic" />
        {rowWire(words.wire)}
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
