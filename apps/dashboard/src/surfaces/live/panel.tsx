/**
 * Live's panel: the call chosen (moved from legacy/pages/live-monitor.jsx, decision 0015). A call in progress is its
 * transcript as the provider sends it, the whisper box and the controls; a call that ended is its summary; a link to a
 * call Live no longer holds says so, with the door to its transcript. The page draws it beside the list.
 */
import { useEffect, useRef } from "react";
import type { LiveCallVM } from "@chanlytics/contracts";
import { navigate, routeDoor } from "../legacy-verbs";
import { EmptyState } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
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
      <div className="lm-transcript-label">Transcript · as the phone provider sends it</div>
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
}

/** Who is calling and how the call stands, with the controls of a call in progress and the door to the person. */
function panelHead({ c, elapsed, quietS }: HeadProps) {
  return (
    <header className="lm-head">
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
      <div className="lm-head-actions">
        {c.live && <LrControls c={c} />}
        {c.clientId && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`clients/${c.clientId}`)}>
            <Icon name="users" size={12} /> Open profile
          </button>
        )}
      </div>
    </header>
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
      {!c.missed && (c.outcomeWords || c.followUp) && (
        <div className="lm-summary-next">
          {c.outcomeWords && <span>{c.outcomeWords}</span>}
          {c.followUp && <span>To do: {c.followUp}</span>}
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
  return (
    <footer className="lm-controls">
      <span className="lm-controls-who tabular">
        {c.number || "Caller ID withheld"} &nbsp;&amp;&nbsp; Phone receptionist
      </span>
      <span className="lm-ended-chip">
        {c.live ? (
          "The receptionist is handling this call on its own."
        ) : c.missed ? (
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
}

export const LrPanel = ({ c, elapsed, nowMs = Date.now(), notice = null }: LrPanelProps) => {
  if (!c) {
    // A chosen call that is gone is the panel's whole news; "no calls on this line yet" beside it would be false.
    return (
      <div className="lm-panel">
        {notice ? (
          <LrMissing notice={notice} />
        ) : (
          <EmptyState
            kind="card"
            glyph="phone"
            title="No calls on this line yet"
            body="When a customer calls, the call appears here while it is happening."
          />
        )}
      </div>
    );
  }
  const open = () => navigate(`conversations/${c.cvId}`);
  // A call gone quiet says when it was last heard from; the checking banner below comes minutes later.
  const quietS = c.live && c.heartbeatAtMs ? Math.floor((nowMs - c.heartbeatAtMs) / 1000) : 0;
  return (
    <div className="lm-panel" key={c.callId}>
      {notice && <LrMissing notice={notice} />}
      {panelHead({ c, elapsed, quietS })}

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
              The receptionist is on the line with {c.whoShort}. It opens with the greeting; the phone provider sends
              the words after the first exchange, and they appear here turn by turn.
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
