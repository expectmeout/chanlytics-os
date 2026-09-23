/* global React, Icon, StatePill, Confirm, EmptyState, FailedRead */
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

// The last thing the caller said, for the row's second line: what the call is about, in their words.
const lrLastSaid = (c) => {
  const said = [...(c.transcript || [])].reverse().find((t) => t.speaker === "client" && t.text);
  return said ? said.text : null;
};

// A call in progress, drawn the way the Inbox draws a conversation -- Live is a view of the same door
// (#655), and it was a table: When · Length · From, 400px wide, so pressing Live moved the list's edge
// and changed its language. The same 32px avatar with the caller's initials, the name and the running
// clock on the first line, what they last said on the second, the pill on the third.
//
// A row takes the keyboard: it is a button, so Tab reaches it; Enter or Space opens it, and the arrows
// open and focus the call beside it (`order` is every row's id as the list draws them).
const LrRow = ({ c, active, elapsed, onSelect, order = [] }) => {
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c.callId); return; }
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = order[order.indexOf(c.callId) + step];
    if (!next) return;
    onSelect(next);
    const list = e.currentTarget.closest ? e.currentTarget.closest(".lm-list") : null;
    const row = list ? list.querySelector(`[data-call-id="${next}"]`) : null;
    if (row) row.focus();
  };
  const said = lrLastSaid(c);
  return (
    <button
      type="button"
      className={`lm-row ${active ? "active" : ""}`}
      onClick={() => onSelect(c.callId)}
      onKeyDown={onKey}
      aria-current={active ? "true" : undefined}
      data-call-id={c.callId}
      data-testid="live-row"
    >
      <span className="lm-row-dot" aria-hidden="true">{c.live && !c.checking && <span className="live-dot" />}</span>
      <span className="lm-row-avatar">{c.initials}</span>
      <span className="lm-row-body">
        <span className="lm-row-line1">
          <span className="lm-row-who">{c.who}</span>
          <span className="lm-row-clock tabular">{lrClock(elapsed)}</span>
        </span>
        <span className={`lm-row-said ${said ? "" : "is-waiting"}`}>{said ? <>&ldquo;{said}&rdquo;</> : "The receptionist has picked up"}</span>
        <span className="lm-row-foot">
          <LrPill c={c} />
          <span className="lm-row-since">since {c.startedLabel}</span>
        </span>
      </span>
    </button>
  );
};

const LrLineNote = ({ line, lineRead = true }) => {
  // The channels read failed: the line's state is unknown, not absent.
  if (!lineRead) return <FailedRead kind="line" what="the phone line" body="Calls still show here; whether the line is on is unknown until it reads." surface="live" testid="live-line-failed" />;
  if (line === null) return <div className="lm-line-note">No call in progress. This workspace has no phone line yet.</div>;
  if (!line.on) return <div className="lm-line-note">No call in progress. The line is switched off — the receptionist is not picking up.</div>;
  return (
    <div className="lm-line-note">
      No call in progress. The line is on{line.number ? <> — <span className="tabular">{line.number}</span></> : null}.
    </div>
  );
};

// The list is who is on the phone right now, and nothing else. It also drew a "Recent" table of the
// last calls -- the same calls Conversations › Calls lists with their transcripts and recordings, as
// this list's own footer said. With nobody on the line it says what the line is doing and opens those.
// A finished call still opens here from a door that names it (the bar, Today): the panel shows it.
const LrList = ({ live, line, lineRead = true, activeId, elapsedOf, onSelect }) => {
  const order = live.map((c) => c.callId);
  return (
    <aside className="lm-list">
      <div className="lm-list-head">
        <span className="lm-list-label"><span className="live-dot" style={{ width: 6, height: 6, ...(live.length ? {} : { opacity: 0.35, animation: "none" }) }} /> Right now</span>
        <span className="lm-list-count tabular">{live.length} {live.length === 1 ? "call" : "calls"}</span>
      </div>
      {live.length ? (
        <div className="lm-rows">
          {live.map((c) => <LrRow key={c.callId} c={c} active={activeId === c.callId} elapsed={elapsedOf(c)} onSelect={onSelect} order={order} />)}
        </div>
      ) : (
        <LrLineNote line={line} lineRead={lineRead} />
      )}
      <button type="button" className="lm-list-door" onClick={() => window.CHANLY.nav("conversations/phone")} data-testid="live-to-calls">
        <span>Every call, with its transcript and recording, is in <b>Conversations &rsaquo; Calls</b></span>
        <Icon name="arrow-right" size={12} />
      </button>
    </aside>
  );
};

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
  // Only a line Settings has been read to lack disables the button. Before that read it said to add a line
  // the workspace may well have; the server knows the line, and refuses plainly without one.
  const noLine = !!(window.__FACTS && window.__FACTS.facts) && !line;
  const handOver = async () => {
    if (busy || !window.__handOverCall) return;
    setBusy("hand");
    const r = await window.__handOverCall(c.callId);
    setBusy(null);
    // The line the server rang: the client nests the route's answer under data, so r.line was never there.
    const rang = (r.ok && r.data && r.data.line) || line;
    if (r.ok) flash({ msg: <>Asked the receptionist to pass the call to {rang || "the business's line"} — it should ring in a moment</> });
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
        disabled={!!busy || noLine}
        title={line ? `Rings ${line}, the business's own line` : noLine ? "Add the business's own line under Settings to pass calls to it" : "Rings the business's own line, from Settings"}
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

// A link to a call that isn't among these: said in the panel, with the door to its transcript.
const LrMissing = ({ notice }) => (
  <div className="lm-banner" role="status" data-testid="live-missing">
    {notice.words} <button className="lm-link" onClick={notice.open}>Open it in Conversations</button>
  </div>
);

const LrPanel = ({ c, elapsed, nowMs = Date.now(), notice = null }) => {
  if (!c) {
    // A chosen call that is gone is the panel's whole news; "no calls on this line yet" beside it would be false.
    return (
      <div className="lm-panel">
        {notice
          ? <LrMissing notice={notice} />
          : <EmptyState kind="card" glyph="phone" title="No calls on this line yet" body="When a customer calls, the call appears here while it is happening." />}
      </div>
    );
  }
  const open = () => window.CHANLY.nav(`conversations/${c.cvId}`);
  // A call gone quiet says when it was last heard from; the checking banner below comes minutes later.
  const quietS = c.live && c.heartbeatAtMs ? Math.floor((nowMs - c.heartbeatAtMs) / 1000) : 0;
  return (
    <div className="lm-panel" key={c.callId}>
      {notice && <LrMissing notice={notice} />}
      <header className="lm-head">
        <div className="lm-head-titles">
          <div className="lm-head-name">
            {c.who}
            <LrPill c={c} />
          </div>
          <div className="lm-head-meta">
            <span>Phone receptionist</span>
            <span className="cv-dot" />
            <span className="tabular">{c.number || "Caller ID withheld"}</span>
            <span className="cv-dot" />
            <span className="tabular">
              {c.live
                ? `Started ${c.startedLabel} · ${lrClock(elapsed)}${quietS >= 15 ? ` · last heard ${quietS} s ago` : ""}`
                : c.missed
                  ? `${c.startedLabel} · never connected`
                  // The length in words: "Sep 6 · 3:10" read as a date and a time.
                  : `${c.startedLabel}${c.lengthWords ? ` · ${c.lengthWords}` : ""}`}
            </span>
          </div>
        </div>
        <div className="lm-head-actions">
          {c.live && <LrControls c={c} />}
          {c.clientId && (
            <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.client(c.clientId))}>
              <Icon name="users" size={12} /> Open profile
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
            <span>{c.direction === "inbound" ? "Inbound" : "Outbound"}{c.lengthWords ? ` · ${c.lengthWords}` : ""}</span>
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

const LiveMonitorReal = ({ initialCallId = null }) => {
  const L = useLiveSurface();
  const [nowMs, setNowMs] = useLrState(Date.now());
  // live/<callId> opens the call a door names (Today's, a bell's) rather than the one on the line, and the call open is
  // the address's: a row writes it (replaced -- Back leaves Live rather than replaying every call looked at), so a
  // refresh opens the same call and the crumbs name it. The page stays mounted across its calls (app-shell.jsx).
  // Where no shell is (the standalone harness), the choice lives for the page.
  const [picked, setPicked] = useLrState(null);
  const activeId = initialCallId || picked;
  const setActiveId = (id) => {
    setPicked(id);
    if (window.appNavigate) window.appNavigate(`live/${id}`, { replace: true });
  };
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
  const live = L.now.filter((c) => window.__chrome.liveStillUp(c, L.heartbeatMs, nowMs));
  const recent = L.recent;
  const elapsedOf = (c) => Math.max(0, Math.floor((nowMs - (c.startedAtMs || nowMs)) / 1000));
  const all = [...live, ...recent];
  // The call chosen -- by a click or a link -- or, when none was, the one on the line, else the last. A chosen call Live
  // no longer holds is said to be gone: the panel fell to whoever was on the line, End and Pass to me with it, and
  // nothing said the call on screen was not the one chosen.
  const chosen = activeId ? all.find((c) => c.callId === activeId) || null : null;
  const active = activeId ? chosen : live[0] || recent[0] || null;
  const line = L.line;
  const notice = activeId && !chosen
    ? {
        words: "That call has ended, and Live no longer holds it.",
        open: () => window.CHANLY.nav(`conversations/cv-${activeId}`),
      }
    : null;

  // No title, no sub-headline, no stat cards: the work first, like the Inbox and Conversations beside it
  // under the same strip. The three cards each said something the page says once anyway -- how many
  // are on the line (the list's head), whether the line is on (the list, when nobody is), and the last
  // call (the panel, which opens on it when nobody is on the line).
  return (
    <div className="live-monitor" data-testid="live-real">
      <div className="lm-body lm-body-rows">
        <LrList live={live} line={line} lineRead={L.lineRead !== false} activeId={active ? active.callId : null} elapsedOf={elapsedOf} onSelect={setActiveId} />
        <LrPanel c={active} elapsed={active ? elapsedOf(active) : 0} nowMs={nowMs} notice={notice} />
      </div>
    </div>
  );
};

// The route renders the real page whenever the bridge has written __LIVE; the
// mockup's console only in a session that never will (the standalone demo).
window.LiveMonitorPage = (props) => (window.__LIVE === undefined ? <LiveMonitorSeed /> : <LiveMonitorReal {...props} />);
