/* global React, Icon, StatStrip, StatCell */
// Chanlytics — Live, on a real workspace.
//
// The mockup's console (live-monitor.jsx) promised Live Listen, Take Over and
// End Call over an invented caller. The phone provider offers none of those
// for a hosted agent, so this page shows what is true: the calls in progress
// under the heartbeat rule, a clock running from each call's real start, the
// transcript when the provider sends turns and an honest wait when it does
// not, and the calls that just ended with their summary as it arrives. The
// seeded console stays for demo sessions only.
//
// Reads window.__LIVE (written by liveOverride in the bridge) and re-renders
// on "surface:live". No writes: nothing here changes a call.

const { useState: useLrState, useEffect: useLrEffect, useReducer: useLrReducer, useRef: useLrRef } = React;

// The mockup's page, as it was before this file took the route.
const LiveMonitorSeed = window.LiveMonitorPage;

const lrClock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

const useLiveSurface = () => {
  const [, bump] = useLrReducer((n) => n + 1, 0);
  useLrEffect(() => {
    window.addEventListener("surface:live", bump);
    return () => window.removeEventListener("surface:live", bump);
  }, []);
  return window.__LIVE;
};

const LrPill = ({ c }) => {
  if (c.live) return <span className="pill pill-accent"><span className="live-dot" style={{ width: 5, height: 5 }} />Live</span>;
  if (c.missed) return <span className="pill">Never connected</span>;
  if (c.stale) return <span className="pill" title="Marked live by the phone provider, but silent past the heartbeat. Checked within five minutes.">No word from the provider</span>;
  return <span className="pill">Ended</span>;
};

const LrRow = ({ c, active, elapsed, onSelect }) => (
  <tr className={active ? "active" : ""} onClick={() => onSelect(c.callId)} data-testid={c.live ? "live-row" : "recent-row"}>
    <td className="num dim">{c.startedLabel}</td>
    <td className="num">{c.live ? lrClock(elapsed) : (c.duration || "—")}</td>
    <td>
      <span className="lm-from">
        <span className="agent-avatar" style={{ width: 16, height: 16, fontSize: 8.5 }}>P</span>
        {c.who}
      </span>
    </td>
    <td className="shrink"><LrPill c={c} /></td>
  </tr>
);

const LrLineNote = ({ line }) => {
  if (line === null) return <div className="lm-line-note">No call in progress. This workspace has no phone line yet.</div>;
  if (!line.on) return <div className="lm-line-note">No call in progress. The line is switched off — the receptionist is not picking up.</div>;
  return (
    <div className="lm-line-note">
      No call in progress. The line is on{line.number ? <> — <span className="tabular">{line.number}</span></> : null}.
    </div>
  );
};

const LrList = ({ live, recent, line, activeId, elapsedOf, onSelect }) => (
  <aside className="lm-list">
    <div className="lm-list-head">
      <span className="lm-list-label"><span className="live-dot" style={{ width: 6, height: 6, ...(live.length ? {} : { opacity: 0.35, animation: "none" }) }} /> Right now</span>
      <span className="lm-list-count tabular">{live.length} {live.length === 1 ? "call" : "calls"}</span>
    </div>
    {live.length ? (
      <table className="tbl lm-tbl">
        <thead><tr><th>Started</th><th>Elapsed</th><th>From</th><th></th></tr></thead>
        <tbody>
          {live.map((c) => <LrRow key={c.callId} c={c} active={activeId === c.callId} elapsed={elapsedOf(c)} onSelect={onSelect} />)}
        </tbody>
      </table>
    ) : (
      <LrLineNote line={line} />
    )}
    <div className="lm-list-head lm-section-head">
      <span className="lm-list-label">Recent</span>
      <span className="lm-list-count tabular">{recent.length ? `last ${recent.length}` : "none yet"}</span>
    </div>
    {recent.length > 0 && (
      <table className="tbl lm-tbl">
        <thead><tr><th>When</th><th>Length</th><th>From</th><th></th></tr></thead>
        <tbody>
          {recent.map((c) => <LrRow key={c.callId} c={c} active={activeId === c.callId} elapsed={0} onSelect={onSelect} />)}
        </tbody>
      </table>
    )}
    <div className="lm-list-foot">
      Every call is also a row in <button className="lm-link" onClick={() => window.CHANLY.nav("conversations/phone")}>Conversations</button>, with its transcript and recording.
    </div>
  </aside>
);

const LrTranscript = ({ c }) => {
  const scrollRef = useLrRef(null);
  useLrEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [c.callId, c.transcript.length]);
  return (
    <>
      <div className="lm-transcript-label">Transcript · as the phone provider sends it</div>
      <div className="lm-scroll" ref={scrollRef}>
        <div className="ix-timeline lm-thread">
          {c.transcript.map((m, i) => (
            <div key={i} className={`tl-msg ${m.speaker === "client" ? "client" : "agent"}`}>
              <div className="tl-msg-bubble">
                <div className="tl-msg-meta">
                  <span>{m.speaker === "client" ? c.whoShort : "Phone receptionist"}</span>
                  <span className="mono">{m.t}</span>
                </div>
                <div className="tl-msg-body">{m.text}</div>
              </div>
            </div>
          ))}
          <div className="lm-listening-line"><span className="cv-cursor" /></div>
        </div>
      </div>
    </>
  );
};

const lrRecordingLine = (c) =>
  c.recordingState === "ready" ? "Recording saved"
    : c.recordingState === "pending" ? "Recording still processing"
      : c.recordingState === "failed" ? "Recording couldn't be saved"
        : c.summaryState === "pending" ? "Recording on its way"
          : "No recording";

const LrPanel = ({ c, elapsed }) => {
  if (!c) {
    return (
      <div className="lm-panel">
        <div className="lm-ended-note">
          <Icon name="phone" size={16} />
          <div className="lm-ended-title">No calls on this line yet. When a customer calls, the call appears here while it is happening.</div>
        </div>
      </div>
    );
  }
  const open = () => window.CHANLY.nav(`conversations/${c.cvId}`);
  return (
    <div className="lm-panel" key={c.callId}>
      <header className="lm-head">
        <div className="lm-head-titles">
          <div className="lm-head-name">
            {c.who}
            <LrPill c={c} />
          </div>
          <div className="lm-head-meta">
            <span className="agent-avatar" style={{ width: 16, height: 16, fontSize: 8.5 }}>P</span>
            <span>Phone receptionist</span>
            <span className="cv-dot" />
            <span className="tabular">{c.number || "Caller ID withheld"}</span>
            <span className="cv-dot" />
            <span className="tabular">
              {c.live
                ? `Started ${c.startedLabel} · ${lrClock(elapsed)}`
                : c.missed
                  ? `${c.startedLabel} · never connected`
                  : `${c.startedLabel}${c.duration ? ` · ${c.duration}` : ""}`}
            </span>
          </div>
        </div>
        <div className="lm-head-actions">
          {c.clientId && (
            <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.client(c.clientId))}>
              <Icon name="users" size={12} /> Open client
            </button>
          )}
        </div>
      </header>

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
          <>
            <div className="lm-waiting">
              <Icon name="phone" size={16} />
              <div>
                The receptionist is on the line with {c.whoShort}. Nothing has been said yet; the words appear here as the phone provider sends them.
              </div>
            </div>
            <div className="lm-spacer" />
          </>
        )
      ) : (
        <div className="lm-summary" data-testid="live-summary">
          <div className="lm-summary-title">
            {c.missed
              ? "The call never connected."
              : c.summaryState === "ready"
                ? c.summary
                : c.summaryState === "pending"
                  ? "Summary on its way from the voice provider."
                  : "No summary from the voice provider for this call."}
          </div>
          <div className="lm-summary-meta">
            <span>{c.direction === "inbound" ? "Inbound" : "Outbound"}{c.duration ? ` · ${c.duration}` : ""}</span>
            {c.endedHow && <span>Ended: {c.endedHow}</span>}
            {c.sentiment && <span>Caller mood: {c.sentiment} — the voice provider's own read</span>}
            {!c.missed && <span>{lrRecordingLine(c)}</span>}
          </div>
          {!c.missed && (
            <div className="lm-summary-actions">
              <button className="btn btn-sm" onClick={open}>Open the transcript <Icon name="arrow-right" size={11} /></button>
            </div>
          )}
        </div>
      )}
      {!c.live && <div className="lm-spacer" />}

      <footer className="lm-controls">
        <span className="lm-controls-who tabular">{c.number || "Caller ID withheld"} &nbsp;&amp;&nbsp; Phone receptionist</span>
        <span className="lm-ended-chip">
          {c.live
            ? "The receptionist is handling this call on its own."
            : c.missed
              ? "Nothing to review."
              : c.stale
                ? "Marked live by the phone provider, but silent — it is checked within five minutes."
                : <>Call ended · <button className="lm-link" onClick={open}>open the transcript</button></>}
        </span>
      </footer>
    </div>
  );
};

const LiveMonitorReal = () => {
  const L = useLiveSurface();
  const [nowMs, setNowMs] = useLrState(Date.now());
  const [activeId, setActiveId] = useLrState(null);
  const hasLive = !!(L && L.now.length);

  // One clock, only while a call is up.
  useLrEffect(() => {
    if (!hasLive) return undefined;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [hasLive]);
  useLrEffect(() => { setNowMs(Date.now()); }, [L && L.fetchedAtMs]);

  if (!L) return null;

  // The heartbeat rule, re-applied between refreshes: a call nobody has heard
  // from for heartbeatMs stops being live here even before the next fetch.
  const live = L.now.filter((c) => nowMs - (c.heartbeatAtMs || c.startedAtMs || 0) < L.heartbeatMs);
  const recent = L.recent;
  const elapsedOf = (c) => Math.max(0, Math.floor((nowMs - (c.startedAtMs || nowMs)) / 1000));
  const all = [...live, ...recent];
  const active = all.find((c) => c.callId === activeId) || live[0] || recent[0] || null;
  const line = L.line;

  return (
    <div className="live-monitor" data-testid="live-real">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Live</div>
          <div className="cl-page-sub">
            Calls on your line as they happen. The receptionist answers; you watch, and read the summary the moment a call ends.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="On the line now" value={live.length} meta={live[0] ? `since ${live[0].startedLabel}` : "all quiet"} />
          <StatCell
            label="Your line"
            value={line && line.number ? line.number : "—"}
            meta={line ? (line.on ? "on — the receptionist picks up" : "switched off") : "no phone line yet"}
          />
          <StatCell label="Last call" value={recent[0] ? recent[0].startedLabel : "—"} meta={recent[0] ? recent[0].who : "none yet"} />
        </StatStrip>
      </div>

      <div className="lm-body">
        <LrList live={live} recent={recent} line={line} activeId={active ? active.callId : null} elapsedOf={elapsedOf} onSelect={setActiveId} />
        <LrPanel c={active} elapsed={active ? elapsedOf(active) : 0} />
      </div>
    </div>
  );
};

// The route renders the real page whenever the bridge has written __LIVE; the
// mockup's console only in a session that never will (the standalone demo).
window.LiveMonitorPage = () => (window.__LIVE === undefined ? <LiveMonitorSeed /> : <LiveMonitorReal />);
