/* global React, Icon, StatStrip, StatCell, LIVE_DATA */
// Chanlytics — Live Monitoring
// Real-time call console over our Retell backend. Live Listen, Take Over,
// End Call, and runtime context injection (additional_context + trigger_response).

const { useState: useLmState, useEffect: useLmEffect, useRef: useLmRef } = React;

const fmtDur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Whispers + your take-over lines persist per call — switching rows must not
// silently discard context you sent to a live agent.
window.LM_STORE.injections = window.LM_STORE.injections || {};   // callId -> [{kind, text}]

// ---------- Calls table (left) ----------
const LiveTable = ({ calls, activeId, onSelect, endedIds, liveSec }) => (
  <aside className="lm-list">
    <div className="lm-list-head">
      <span className="lm-list-label"><span className="live-dot" style={{ width: 6, height: 6 }} /> Live monitoring</span>
      <span className="lm-list-count tabular">{calls.filter(c => c.live && !endedIds.has(c.id)).length} active</span>
    </div>
    <table className="tbl lm-tbl">
      <thead>
        <tr><th>Time</th><th>Duration</th><th>From</th><th></th></tr>
      </thead>
      <tbody>
        {calls.map(c => {
          const ended = !c.live || endedIds.has(c.id);
          return (
            <tr key={c.id} className={activeId === c.id ? "active" : ""} onClick={() => onSelect(c.id)}>
              <td className="num dim">{c.startedAt}</td>
              <td className="num">{fmtDur(c.live && !endedIds.has(c.id) ? liveSec : c.durationSec)}</td>
              <td>
                <span className="lm-from">
                  <span className="agent-avatar" style={{ width: 16, height: 16, fontSize: 8.5 }}>{c.agent.glyph}</span>
                  {c.from}
                </span>
              </td>
              <td className="shrink">
                {ended
                  ? <span className="pill">Ended</span>
                  : <span className="pill pill-accent"><span className="live-dot" style={{ width: 5, height: 5 }} />Live</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    <div className="lm-list-foot">
      Ended calls move to <button className="lm-link" onClick={() => window.CHANLY.nav(CHANLY.R.conversation("phone"))}>Conversations</button> with summary + recording.
    </div>
  </aside>
);

// ---------- Live panel (right) ----------
const LivePanel = ({ call, ended, onEnd, onTakeOver }) => {
  const [listening, setListening] = useLmState(false);
  const [takenOver, setTakenOver] = useLmState(false);
  const [inject, setInject] = useLmState("");
  const [say, setSay] = useLmState("");
  const [injected, setInjected] = useLmState(() => [...(window.LM_STORE.injections[call.id] || [])]); // {kind: "whisper"|"applied"|"you", text}
  const [justSent, setJustSent] = useLmState(false);
  const scrollRef = useLmRef(null);
  const timersRef = useLmRef([]);

  useLmEffect(() => () => timersRef.current.forEach((t) => window.clearTimeout(t)), []);

  const pushLine = (line) => {
    setInjected(list => {
      const next = [...list, line];
      window.LM_STORE.injections[call.id] = next;
      return next;
    });
  };

  useLmEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [injected, takenOver]);

  const isLive = call.live && !ended;

  const sendContext = () => {
    if (!inject.trim()) return;
    const text = inject.trim();
    pushLine({ kind: "whisper", text });
    setInject("");
    setJustSent(true);
    const t1 = window.setTimeout(() => setJustSent(false), 1800);
    // The promise on the button: the agent visibly works the context in
    const t2 = window.setTimeout(() => {
      pushLine({ kind: "applied", text: `Actually — one more thing before we wrap. ${text.length > 72 ? text.slice(0, 72) + "…" : text}` });
    }, 1200);
    timersRef.current.push(t1, t2);
  };

  const saySend = () => {
    if (!say.trim()) return;
    pushLine({ kind: "you", text: say.trim() });
    setSay("");
  };

  return (
    <div className="lm-panel" key={call.id}>
      {/* Header */}
      <header className="lm-head">
        <div className="lm-head-titles">
          <div className="lm-head-name">
            {call.date} · {call.type}
            {isLive && <span className="pill pill-accent"><span className="live-dot" style={{ width: 5, height: 5 }} />Live</span>}
            {ended && <span className="pill">Ended</span>}
          </div>
          <div className="lm-head-meta">
            <span className="agent-avatar" style={{ width: 16, height: 16, fontSize: 8.5 }}>{call.agent.glyph}</span>
            <span>{call.agent.name}</span>
            <span className="cv-dot" />
            <span className="mono lm-callid" data-tip={call.callId}>{call.callId.slice(0, 9)}…{call.callId.slice(-3)}</span>
            <span className="cv-dot" />
            <span className="tabular">{call.fromNumber}</span>
          </div>
        </div>
        <div className="lm-head-actions">
          {call.clientId && (
            <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.client(call.clientId))}>
              <Icon name="users" size={12} /> Open client
            </button>
          )}
        </div>
      </header>

      {!call.transcript ? (
          <div className="lm-ended-note">
          <Icon name="phone" size={16} />
          <div>
            <div className="lm-ended-title">{call.conversationNote}</div>
            <button className="btn btn-sm" onClick={() => window.CHANLY.nav(call.cvId ? `conversations/${call.cvId}` : "conversations/phone")}>
              {call.cvId ? "Open the transcript" : "View in Conversations"} <Icon name="arrow-right" size={11} />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Transcription */}
          <div className="lm-transcript-label">
            Transcription
            {takenOver && <span className="lm-paused-note"><Icon name="pause" size={10} /> Paused while you're on the call</span>}
          </div>
          <div className="lm-scroll" ref={scrollRef}>
            <div className="ix-timeline lm-thread">
              {call.transcript.map((m, i) => (
                <div key={i} className={`tl-msg ${m.role === "client" ? "client" : "agent"}`}>
                  <div className="tl-msg-bubble">
                    <div className="tl-msg-meta">
                      <span>{m.role === "client" ? call.from.split(" ")[0] : call.agent.name}</span>
                      {m.tone && <span className="lm-tone">[{m.tone}]</span>}
                    </div>
                    <div className="tl-msg-body">{m.text}</div>
                  </div>
                </div>
              ))}
              {injected.map((inj, i) => {
                if (inj.kind === "applied") return (
                  <div key={`inj-${i}`} className="tl-msg agent">
                    <div className="tl-msg-bubble">
                      <div className="tl-msg-meta">
                        <span>{call.agent.name}</span>
                        <span className="lm-tone">[weaving in your context]</span>
                      </div>
                      <div className="tl-msg-body">{inj.text}</div>
                    </div>
                  </div>
                );
                if (inj.kind === "you") return (
                  <div key={`inj-${i}`} className="tl-msg agent">
                    <div className="tl-msg-bubble lm-you-bubble">
                      <div className="tl-msg-meta"><span>You</span><span className="lm-tone">[on the call]</span></div>
                      <div className="tl-msg-body">{inj.text}</div>
                    </div>
                  </div>
                );
                return (
                  <div key={`inj-${i}`} className="lm-injected">
                    <Icon name="sparkle" size={10} />
                    <span>Injected context · {inj.text}</span>
                  </div>
                );
              })}
              {takenOver && (
                <div className="tl-event lm-takeover-line">
                  <span className="tl-event-spine" />
                  <span className="tl-event-text">Call taken over by a human agent · {window.CHANLY.IX_NOW}</span>
                </div>
              )}
              {isLive && !takenOver && <div className="lm-listening-line"><span className="cv-cursor" /></div>}
            </div>
          </div>

          {/* Take-over banner + your composer — taking over without a voice is a dead end */}
          {takenOver && isLive && (
            <>
              <div className="lm-banner">
                <Icon name="headphones" size={12} />
                You've taken over the call — {call.agent.name} is standing by.
              </div>
              <div className="lm-inject">
                <input
                  className="lm-inject-input"
                  placeholder="You're live — speak to the client…"
                  value={say}
                  onChange={(e) => setSay(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saySend()}
                />
                <button className="btn btn-primary btn-sm" onClick={saySend} disabled={!say.trim()}>
                  <Icon name="wave" size={12} /> Say it
                </button>
              </div>
            </>
          )}

          {/* Inject context (Retell: additional_context + trigger_response) */}
          {isLive && !takenOver && (
            <div className="lm-inject">
              <input
                className="lm-inject-input"
                placeholder={`Whisper context to ${call.agent.name} — e.g. "Offer the scalp add-on free if she books a 6-pack"`}
                value={inject}
                onChange={(e) => setInject(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendContext()}
              />
              <button className={`btn btn-sm ${justSent ? "" : "btn-primary"}`} onClick={sendContext} disabled={justSent}>
                {justSent ? <><Icon name="check" size={12} /> Sent</> : <>Send & trigger response</>}
              </button>
            </div>
          )}

          {/* Control bar */}
          <footer className="lm-controls">
            <span className="lm-controls-who tabular">
              {call.fromNumber} &nbsp;&amp;&nbsp; {takenOver ? "You" : call.agent.name}
            </span>
            {isLive ? (
              <div className="lm-controls-actions">
                <button
                  className={`btn btn-sm ${listening ? "lm-listening" : ""}`}
                  onClick={() => setListening(v => !v)}
                  disabled={takenOver}
                >
                  <Icon name="headphones" size={12} />
                  {listening ? "Listening…" : "Live Listen"}
                  {listening && <span className="lm-eq" aria-hidden="true"><span /><span /><span /></span>}
                </button>
                <button className="btn btn-sm" onClick={() => { const next = !takenOver; setTakenOver(next); setListening(false); onTakeOver(next, call); }} {...window.gate("approve")} {...window.transferGate()}>
                  <Icon name={takenOver ? "play" : "wave"} size={12} />
                  {takenOver ? "Hand back to agent" : "Take Over"}
                </button>
                <button className="btn btn-sm lm-end" onClick={onEnd} {...window.gate("approve")}>
                  <Icon name="x" size={12} /> End Call
                </button>
              </div>
            ) : (
              <span className="lm-ended-chip">
                Call ended ·{" "}
                <button className="lm-link" onClick={() => window.CHANLY.nav(call.cvId ? `conversations/${call.cvId}` : "conversations/phone")}>
                  {call.cvId ? "open the transcript" : "summary in Conversations"}
                </button>
              </span>
            )}
          </footer>
        </>
      )}
    </div>
  );
};

// ---------- Page ----------
const LiveMonitorPage = () => {
  const { LIVE_CALLS } = window.LIVE_DATA;
  const [activeId, setActiveId] = useLmState(LIVE_CALLS.find(c => c.live)?.id || LIVE_CALLS[0].id);
  const [endedIds, setEndedIds] = useLmState(() => new Set(
    LIVE_CALLS.filter(c => window.LM_STORE && window.LM_STORE.isEnded(c.id)).map(c => c.id)
  ));
  const [liveSec, setLiveSec] = useLmState(42);
  const [toastNode, ppFlash] = window.usePPToast();
  const [sessionTakeovers, setSessionTakeovers] = useLmState(0);
  const [, lmPrBump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("presence:changed", lmPrBump);
    return () => window.removeEventListener("presence:changed", lmPrBump);
  }, []);

  const flash = (msg, links = null) => ppFlash({ msg, links });

  const call = LIVE_CALLS.find(c => c.id === activeId) || LIVE_CALLS[0];
  const anyLive = LIVE_CALLS.some(c => c.live && !endedIds.has(c.id));
  const liveCall = LIVE_CALLS.find(c => c.live && !endedIds.has(c.id));

  const endCall = () => {
    if (window.LM_STORE) window.LM_STORE.end(call.id, call.cvId);
    setEndedIds(s => new Set([...s, call.id]));
    flash(
      <>Call with <b>{call.from}</b> ended — summary + recording land in Conversations. Ended calls can't resume; the client would need to redial.</>,
      call.cvId ? [{ label: "View transcript", to: `conversations/${call.cvId}` }] : [{ label: "Conversations", to: "conversations/phone" }]
    );
  };

  const onTakeOver = (nowTaken, c) => {
    if (nowTaken) setSessionTakeovers(n => n + 1);
    flash(nowTaken
      ? <>You're on the call — <b>{c.agent.name}</b> is standing by and keeps transcribing.</>
      : <>Handed back — <b>{c.agent.name}</b> resumes with your injected context.</>);
  };

  useLmEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => setLiveSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [anyLive]);

  return (
    <div className="live-monitor">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Live monitoring</div>
          <div className="cl-page-sub">
            Watch calls as they happen. Listen in, whisper context to the agent, or take over — the client never redials.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell
            label="Active now"
            value={LIVE_CALLS.filter(c => c.live && !endedIds.has(c.id)).length}
            meta={liveCall ? `${liveCall.agent.name} on the line` : "all quiet"}
          />
          <StatCell label="Calls today" value={12} meta={`showing recent ${LIVE_CALLS.length}`} />
          <StatCell label="Take-overs" value={2 + sessionTakeovers} meta={sessionTakeovers > 0 ? `this week · +${sessionTakeovers} just now` : "this week"} />
        </StatStrip>
      </div>

      <div className="lm-body">
        <LiveTable
          calls={LIVE_CALLS}
          activeId={activeId}
          onSelect={setActiveId}
          endedIds={endedIds}
          liveSec={liveSec}
        />
        <LivePanel
          call={call}
          ended={endedIds.has(call.id)}
          onEnd={endCall}
          onTakeOver={onTakeOver}
        />
      </div>

      {toastNode}
    </div>
  );
};

window.LiveMonitorPage = LiveMonitorPage;
