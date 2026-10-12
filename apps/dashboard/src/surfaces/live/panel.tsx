/**
 * Live's panel: the call chosen (moved from legacy/pages/live-monitor.jsx, decision 0015). A call in progress is its
 * transcript as the provider sends it, the whisper box and the controls; a call that ended is its summary; a link to a
 * call Live no longer holds says so, with the door to its transcript. The page draws it beside the list.
 */
import { useEffect, useRef } from "react";
import { callNoteLines, type LiveCallVM } from "@chanlytics/contracts";
import { navigate, routeDoor } from "../legacy-verbs";
import { EmptyState } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { Face } from "../kit/face/face";
import { StoppedMark } from "../kit/pill/stopped-mark";
import { LrPill, lrClock } from "./call-parts";
import { LrControls } from "./controls";
import { LrWhisper } from "./whisper";

const LrTranscript = ({ c }: { c: LiveCallVM }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [c.callId, c.transcript.length]);
  return (
    <>
      <div className="lm-transcript-label" title="As the phone provider sends it">
        Live transcript
      </div>
      <div className="lm-scroll" ref={scrollRef}>
        <div className="ix-timeline lm-thread">
          {c.transcript.map((m, i) =>
            m.speaker === "whisper" ? (
              // The owner's own words, where they landed in the call — so it
              // is plain whether the agent's next line acted on them.
              <div key={i} className="lm-whisper-line" data-testid="live-whisper-line">
                <span className="lm-whisper-line-label">You whispered</span>
                <span className="lm-whisper-line-text">&ldquo;{m.text}&rdquo;</span>
              </div>
            ) : m.speaker === "platform" ? (
              // Chanlytics spoke, not the owner: a correction, or the
              // hand-over. Said as what it was, never as the owner's words.
              <div key={i} className="lm-whisper-line" data-testid="live-platform-line">
                <span className="lm-whisper-line-label">Chanlytics told the receptionist</span>
                <span className="lm-whisper-line-text">{m.text}</span>
              </div>
            ) : (
              <div key={i} className={`tl-msg ${m.speaker === "client" ? "client" : "agent"}`}>
                <div className="tl-msg-bubble">
                  <div className="tl-msg-meta">
                    <span>{m.speaker === "client" ? c.whoShort : "Phone receptionist"}</span>
                    <span className="mono">{m.t}</span>
                  </div>
                  <div className="tl-msg-body">{m.text}</div>
                </div>
              </div>
            ),
          )}
          <div className="lm-listening-line">
            <span className="cv-cursor" />
          </div>
        </div>
      </div>
    </>
  );
};

const lrRecordingLine = (c: LiveCallVM) =>
  c.recordingState === "ready"
    ? "Recording saved"
    : c.recordingState === "pending"
      ? "Recording still processing"
      : c.recordingState === "purged"
        ? "Recording removed on schedule"
        : c.recordingState === "failed"
          ? "Recording couldn't be saved"
          : c.summaryState === "pending"
            ? "Recording on its way"
            : "No recording";

/** What the panel says of a call it was asked for and Live no longer holds, and the door to that call's transcript. */
interface Notice {
  words: string;
  open: () => void;
}

// A link to a call that isn't among these: said in the panel, with the door to its transcript.
const LrMissing = ({ notice }: { notice: Notice }) => (
  <div className="lm-banner" role="status" data-testid="live-missing">
    {notice.words}{" "}
    <button className="lm-link" onClick={notice.open}>
      Open it in Conversations
    </button>
  </div>
);

interface HeadProps {
  c: LiveCallVM;
  elapsed: number;
  quietS: number;
  /** A phone's way back to the calls, where a call in progress takes the screen as a thread does; none on a desk. */
  onBack?: (() => void) | null;
}

/**
 * Who is calling and how the call stands, with the door to the person; a call in progress adds its clock, and its
 * controls stand in a bar of their own under the head, with one short line on who has the call.
 */
function panelHead({ c, elapsed, quietS, onBack = null }: HeadProps) {
  return (
    <>
      <header className="lm-head capsule">
        {/* A phone's thread has its arrow, as the Inbox's has (CSS draws it there alone). */}
        {onBack && (
          <button
            type="button"
            className="lm-back"
            aria-label="Back to the calls"
            data-testid="lm-back"
            onClick={onBack}
          >
            <span aria-hidden="true">&larr;</span>
          </button>
        )}
        <div className="lm-head-titles">
          {/* Who is calling opens their page, and their number rings them from a phone: the words were plain text beside
              an Open profile button, and a number read off the screen to be typed again. */}
          <div className="lm-head-name">
            {c.clientId ? (
              <a
                className="lm-head-who"
                {...routeDoor(`clients/${c.clientId}`)}
                title={`Open ${c.who} in People`}
                data-testid="lm-head-person"
              >
                {c.who}
              </a>
            ) : (
              c.who
            )}
            {/* Before the call's pill, which a phone's header leaves out as the last of the line (live.css). */}
            {c.stopped && <StoppedMark testid="lm-head-stopped" />}
            <LrPill c={c} />
          </div>
          <div className="lm-head-meta">
            <span>Phone receptionist</span>
            <span className="cv-dot" />
            {c.number ? (
              <a
                className="tabular lm-head-tel"
                href={`tel:${String(c.number).replace(/[^\d+]/g, "")}`}
                title={`Call ${c.number}`}
              >
                {c.number}
              </a>
            ) : (
              <span className="tabular">Caller ID withheld</span>
            )}
            <span className="cv-dot" />
            <span className="tabular">
              {c.live
                ? `Started ${c.startedLabel} · ${lrClock(elapsed)}${quietS >= 15 ? ` · last heard ${quietS} s ago` : ""}`
                : c.missed
                  ? `${c.startedLabel} · never connected`
                  : // The length in words: "Sep 6 · 3:10" read as a date and a time.
                    `${c.startedLabel}${c.lengthWords ? ` · ${c.lengthWords}` : ""}`}
            </span>
          </div>
        </div>
        {/* The caller's face, the one a thread's header wears (the kit's Face): where they have a page it is the door to it, and
          a photo of them or their company's logo goes here once members can add one. */}
        {c.clientId ? (
          <a
            className="lm-head-door"
            {...routeDoor(`clients/${c.clientId}`)}
            title={`Open ${c.who} in People`}
            aria-label={`Open ${c.who}'s profile`}
            data-testid="lm-head-avatar"
          >
            <Face person={{ name: c.who, initials: c.initials }} size="lg" />
          </a>
        ) : (
          <Face person={{ name: c.who, initials: c.initials }} size="lg" className="lm-head-door" />
        )}
        {/* The clock a thread's header gives its standing: the live dot and the call's length, running. */}
        {c.live && (
          <span className="lm-head-clock tabular" aria-hidden="true" data-testid="lm-head-clock">
            <span className="live-dot lm-pulse" />
            {lrClock(elapsed)}
          </span>
        )}
      </header>
      {c.live && (
        <div className="lm-head-actions">
          <span className="lm-live-note" title="The receptionist is handling this call on its own.">
            <span className="live-dot lm-pulse" aria-hidden="true" />
            {quietS >= 15 ? `Last heard ${quietS} s ago` : "Handling it"}
          </span>
          <LrControls c={c} />
        </div>
      )}
    </>
  );
}

interface SummaryProps {
  c: LiveCallVM;
  open: () => void;
}

/** A call that ended: what the caller wanted, what came of it, and the door to its transcript. */
function panelSummary({ c, open }: SummaryProps) {
  return (
    <div className="lm-summary" data-testid="live-summary">
      {/* What the caller wanted leads, in the analysis's words, as Conversations does; the phone
              provider's summary is the fallback. */}
      <div className="lm-summary-title">
        {c.missed
          ? "The call never connected."
          : c.wanted
            ? c.wanted
            : c.summaryState === "ready"
              ? c.summary
              : c.summaryState === "pending"
                ? "Summary on its way from the voice provider."
                : "No summary from the voice provider for this call."}
      </div>
      {!c.missed && (c.outcomeWords || callNoteLines(c.notes).length > 0) && (
        <div className="lm-summary-next">
          {c.outcomeWords && <span>{c.outcomeWords}</span>}
          {callNoteLines(c.notes).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
      <div className="lm-summary-meta">
        <span>
          {c.direction === "inbound" ? "Inbound" : "Outbound"}
          {c.lengthWords ? ` · ${c.lengthWords}` : ""}
        </span>
        {c.endedHow && <span>Ended: {c.endedHow}</span>}
        {c.sentiment && <span>Caller mood: {c.sentiment} — the voice provider's own read</span>}
        {!c.missed && <span>{lrRecordingLine(c)}</span>}
      </div>
      {!c.missed && (
        <div className="lm-summary-actions">
          <button className="btn btn-sm" onClick={open}>
            Open the transcript <Icon name="arrow-right" size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

/** The panel's foot: who is on the call, and what is being done about it. */
function panelFoot({ c, open }: SummaryProps) {
  // A call in progress says who has it in the bar under the head; the foot is for the one that is over.
  if (c.live) return null;
  return (
    <footer className={`lm-controls${c.stale ? "" : " is-over"}`}>
      <span className="lm-controls-who tabular">
        {c.number || "Caller ID withheld"} &nbsp;&amp;&nbsp; Phone receptionist
      </span>
      <span className="lm-ended-chip">
        {c.missed ? (
          "Nothing to review."
        ) : c.stale ? (
          "Marked live by the phone provider, but silent — it is checked within five minutes."
        ) : (
          <>
            Call ended ·{" "}
            <button className="lm-link" onClick={open}>
              open the transcript
            </button>
          </>
        )}
      </span>
    </footer>
  );
}

interface LrPanelProps {
  c: LiveCallVM | null;
  elapsed: number;
  nowMs?: number;
  notice?: Notice | null;
  /** The way back to the calls on a phone, where a live call is a thread of its own. */
  onBack?: (() => void) | null;
}

export const LrPanel = ({ c, elapsed, nowMs = Date.now(), notice = null, onBack = null }: LrPanelProps) => {
  if (!c) {
    // A chosen call that is gone is the panel's whole news; "nothing on the line" beside it would say less than is true.
    return (
      <div className="lm-panel lm-call">
        {notice ? (
          <LrMissing notice={notice} />
        ) : (
          <EmptyState
            kind="card"
            glyph="phone"
            title="Nothing on the line"
            body="When a customer calls, you can follow the call here while it is happening."
          />
        )}
      </div>
    );
  }
  const open = () => navigate(`conversations/${c.cvId}`);
  // A call gone quiet says when it was last heard from; the checking banner below comes minutes later.
  const quietS = c.live && c.heartbeatAtMs ? Math.floor((nowMs - c.heartbeatAtMs) / 1000) : 0;
  return (
    <div className="lm-panel lm-call" key={c.callId}>
      {notice && <LrMissing notice={notice} />}
      {panelHead({ c, elapsed, quietS, onBack })}

      {c.live && c.checking && (
        <div className="lm-banner" data-testid="live-checking">
          <span className="live-dot" style={{ width: 6, height: 6, background: "var(--warn)" }} />
          Still marked live — {c.checkingWhy}. It is checked with the phone provider within five minutes.
        </div>
      )}

      {c.live ? (
        c.transcript.length ? (
          <LrTranscript c={c} />
        ) : (
          <div className="lm-waiting">
            <Icon name="phone" size={16} />
            <div>
              On the line with {c.whoShort}, opening with the greeting. The words appear here turn by turn after the
              first exchange.
            </div>
          </div>
        )
      ) : (
        panelSummary({ c, open })
      )}
      {c.live && <LrWhisper c={c} />}
      {/* A transcript grows to fill the panel on its own. Everything else
          needs the spacer to keep the footer at the bottom — and it sits
          AFTER the whisper box, which used to be pushed below the fold by a
          spacer inside the waiting state, where nobody found it. */}
      {!(c.live && c.transcript.length) && <div className="lm-spacer" />}

      {panelFoot({ c, open })}
    </div>
  );
};
