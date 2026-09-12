/* global React, Icon, StatStrip, StatCell, Confirm */
// Chanlytics — Live, on a real workspace.
//
// The mockup's console (live-monitor.jsx) promised Live Listen, Take Over and
// End Call over an invented caller. The phone provider's own dashboard has all
// three; its API has two -- a sentence into the call, and an end -- and keeps
// the audio and the microphone to itself. So this page shows what is true:
// the calls in progress under the heartbeat rule, a clock running from each
// call's real start, the transcript when the provider sends turns and an
// honest wait when it does not, and the calls that just ended with their
// summary as it arrives. The seeded console stays for demo sessions only.
//
// Reads window.__LIVE (written by liveOverride in the bridge) and re-renders
// on "surface:live". Three writes: a whisper -- a sentence only the
// receptionist hears -- an end, and a hand-over, which is the transfer a
// caller gets when they ask for a person, asked for by the owner.

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

// The call's state as the one pill draws it: live is the accent, the rest are
// plain, and the words are the label map's.
const LrPill = ({ c }) => {
  const value = c.live ? "live" : c.missed ? "missed" : c.stale ? "stale" : "ended";
  return <StatePill kind="call" value={value} title={c.stale ? "Marked live by the phone provider, but silent past the heartbeat. Checked within five minutes." : null} />;
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
            )
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
      : c.recordingState === "purged" ? "Recording removed on schedule"
      : c.recordingState === "failed" ? "Recording couldn't be saved"
        : c.summaryState === "pending" ? "Recording on its way"
          : "No recording";

// A sentence only the receptionist hears, worked into its next answer. The
// listen-in stayed in the demo: the provider streams the transcript, never
// the audio, so the words below are what you follow.
// Speech recognition in the browser, where it exists (Chrome, Edge, Safari;
// not Firefox). The owner is usually listening to the call, not typing:
// hold the button, say the whisper, let go — the words are transcribed on
// the device and sent as text like any other whisper. Nothing is recorded
// or uploaded; the browser's own recogniser does the work.
const lrRecognizer = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

const LrWhisper = ({ c }) => {
  const [text, setText] = useLrState("");
  const [busy, setBusy] = useLrState(false);
  const [last, setLast] = useLrState(null);
  const [listening, setListening] = useLrState(false);
  const recRef = useLrRef(null);
  const heardRef = useLrRef("");
  const [toastNode, flash] = window.usePPToast();
  const canTalk = !!lrRecognizer();

  const send = async (words) => {
    const t = String(words ?? text).trim();
    if (!t || busy || !window.__whisperCall) return;
    setBusy(true);
    // No nudge to speak: a whisper is kept in mind and used when it fits,
    // which may be the next answer or a later one. Forcing a response now
    // would make a conditional whisper ("if they mention X…") come out early.
    const r = await window.__whisperCall(c.callId, t, false);
    setBusy(false);
    if (r.ok) {
      setLast(t);
      setText("");
      flash({ msg: <>Whispered — the receptionist works it into its next answer</> });
    } else {
      flash({ tone: "danger", msg: <>Not whispered — {r.message}</> });
    }
  };

  // Hold to talk. Press starts the recogniser; release stops it; what was
  // heard is sent on its own once the recogniser has finished, so a whisper
  // said aloud never waits for a click. Interim words show in the box as
  // they come, so the owner sees what will be sent.
  const startTalking = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const SR = lrRecognizer();
    if (!SR || listening || busy) return;
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    heardRef.current = "";
    rec.onresult = (ev) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      heardRef.current = finals.trim();
      setText((finals + interim).trim());
    };
    rec.onerror = (ev) => {
      setListening(false);
      recRef.current = null;
      if (ev && ev.error === "not-allowed") flash({ tone: "warn", msg: <>The browser needs microphone permission to whisper by voice.</> });
      else if (ev && ev.error !== "aborted" && ev.error !== "no-speech") flash({ tone: "warn", msg: <>Couldn&rsquo;t hear you — try again or type it.</> });
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const heard = heardRef.current;
      heardRef.current = "";
      if (heard) send(heard);
    };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); recRef.current = null; }
  };
  const stopTalking = () => {
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { /* already stopped */ } }
  };

  return (
    <div className="lm-whisper" data-testid="live-whisper">
      <div className="lm-whisper-label">Whisper to the receptionist</div>
      <div className="lm-whisper-row">
        <input
          className="set-input"
          value={text}
          maxLength={500}
          placeholder={listening ? "Listening…" : "Tell them the owner can see them at 4:30 today"}
          aria-label="Whisper to the receptionist"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
          disabled={busy}
        />
        {canTalk && (
          <button
            type="button"
            className={`btn btn-sm lm-talk ${listening ? "on" : ""}`}
            data-testid="live-whisper-talk"
            aria-pressed={listening}
            title="Hold and say the whisper; it is sent when you let go"
            onPointerDown={startTalking}
            onPointerUp={stopTalking}
            onPointerLeave={stopTalking}
            onPointerCancel={stopTalking}
            onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) startTalking(e); }}
            onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") stopTalking(); }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={busy}
            {...window.gate("approve")}
          >
            <Icon name="wave" size={12} /> {listening ? "Listening… let go to send" : "Hold to talk"}
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => send()} disabled={busy || listening || !text.trim()} {...window.gate("approve")}>
          {busy ? "Sending…" : "Whisper"}
        </button>
      </div>
      <div className="lm-whisper-hint">
        {last
          ? <>Last whispered: &ldquo;{last}&rdquo;</>
          : <>Only the receptionist hears it. It keeps it in mind and uses it in its own words when it fits — never word for word, and never against its rules: it will not quote a price or confirm a booking because you whispered one. The caller never hears your words.{canTalk ? " Hold the button and say it, or type it." : ""}</>}
      </div>
      {toastNode}
    </div>
  );
};

// What the provider's API offers over a hosted agent's live call, besides a
// sentence into it: stopping it, and telling the receptionist something NOW.
// The second is the hand-over -- the receptionist is told the owner is
// picking up and transfers the caller to the business's own line with the
// tool it already has, so the owner's phone rings the way it does when a
// caller asks for a person. The line is a fact the workspace keeps in
// Settings; without one the button says so and the server refuses besides.
// Ending a call is armed first: the caller is cut off, and there is no undo.
const LrControls = ({ c }) => {
  const [busy, setBusy] = useLrState(null);
  const [arm, setArm] = useLrState(false);
  const [toastNode, flash] = window.usePPToast();
  const facts = (window.__FACTS && window.__FACTS.facts) || {};
  const line = (facts.handoff_number && facts.handoff_number.value) || null;
  const handOver = async () => {
    if (busy || !window.__handOverCall) return;
    setBusy("hand");
    const r = await window.__handOverCall(c.callId);
    setBusy(null);
    if (r.ok) flash({ msg: <>Asked the receptionist to pass the call to {r.line || line || "the business's line"} — it should ring in a moment</> });
    else flash({ tone: "danger", msg: <>Not passed — {r.message}</> });
  };
  const end = async () => {
    if (busy || !window.__endCall) return;
    setArm(false);
    setBusy("end");
    const r = await window.__endCall(c.callId);
    setBusy(null);
    if (r.ok) flash({ msg: <>Call ended</> });
    else flash({ tone: "danger", msg: <>Not ended — {r.message}</> });
  };
  return (
    <div className="lm-call-controls" data-testid="live-controls">
      <button
        className="btn btn-sm"
        onClick={handOver}
        disabled={!!busy || !line}
        title={line ? `Rings ${line}, the business's own line` : "Add the business's own line under Settings to pass calls to it"}
        data-testid="live-hand-over"
        {...window.gate("approve")}
      >
        <Icon name="phone" size={12} /> {busy === "hand" ? "Passing…" : "Pass the call to me"}
      </button>
      {arm ? (
        <Confirm question="End the call?" detail="The caller is cut off." yes="Yes, end it" busyLabel="Ending…" danger busy={busy === "end"} onYes={end} onNo={() => setArm(false)} testid="live-end" />
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setArm(true)} disabled={!!busy} data-testid="live-end" {...window.gate("approve")}>
          {busy === "end" ? "Ending…" : "End the call"}
        </button>
      )}
      {toastNode}
    </div>
  );
};

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
          {c.live && <LrControls c={c} />}
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
          <div className="lm-waiting">
            <Icon name="phone" size={16} />
            <div>
              The receptionist is on the line with {c.whoShort}. It opens with the greeting; the phone provider sends the words after the first exchange, and they appear here turn by turn.
            </div>
          </div>
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
      {c.live && <LrWhisper c={c} />}
      {/* A transcript grows to fill the panel on its own. Everything else
          needs the spacer to keep the footer at the bottom — and it sits
          AFTER the whisper box, which used to be pushed below the fold by a
          spacer inside the waiting state, where nobody found it. */}
      {!(c.live && c.transcript.length) && <div className="lm-spacer" />}

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
  // Insurance while a call is up: realtime carries each turn (proved on the
  // deployed page), but a channel that drops silently after a sleep would
  // leave a live transcript frozen with no sign. One re-read every 8 s, only
  // while a call is live, costs one calls fetch and cannot be wrong.
  useLrEffect(() => {
    if (!hasLive || !window.__refreshLive) return undefined;
    const t = window.setInterval(() => { window.__refreshLive(); }, 8000);
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
            Calls on your line as they happen. The receptionist answers; you follow the words, whisper it a line if you need to, and read the summary the moment a call ends.
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
