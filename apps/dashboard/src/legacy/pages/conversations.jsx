/* global React, Icon, StatStrip, StatCell, CONVERSATIONS_DATA */
// Chanlytics — Conversations
// The raw communication layer: every call, chat, and email. Calls carry
// transcripts + agent summaries; the live call streams at the top.

const { useState: useCvState, useMemo: useCvMemo, useEffect: useCvEffect } = React;

const CV_ICON = { phone: "phone", sms: "chat", whatsapp: "chat", instagram: "instagram", mail: "mail" };
const CV_LABEL = { phone: "Phone", sms: "SMS", whatsapp: "WhatsApp", instagram: "Instagram", mail: "Email" };

const OutcomePill = ({ outcome, decidedAction, channel }) => {
  if (decidedAction) return <span className="pill pill-ok"><Icon name="check" size={9} />Handled · you chose {decidedAction}</span>;
  if (outcome === "live") return <span className="pill pill-accent"><span className="live-dot" style={{ width: 5, height: 5 }} />Live</span>;
  if (outcome === "booked") return <span className="pill pill-ok">Booked</span>;
  if (outcome === "escalated") return <span className="pill pill-warn">Waiting on you</span>;
  if (outcome === "handled") return <span className="pill">{channel === "phone" ? "Receptionist handled it" : "Receptionist replied"}</span>;
  return <span className="pill">Customer's turn</span>;
};

// Session-decision overlay — approval convos reflect IX_STORE state
const cvDecision = (c) => {
  if (!c || !c.threadId || !window.IX_STORE) return null;
  const rec = window.IX_STORE.get(c.threadId);
  return rec && rec.kind === "decided" ? rec : null;
};

// Live-call overlay — calls ended in the Live Monitor flip here too
const cvEnded = (c) => !!(c && c.outcome === "live" && window.LM_STORE && window.LM_STORE.isEnded(c.id));

// Live Monitor → record continuity: whispers + take-over lines you sent there
// belong in this transcript too. LM keys injections by call id (lc-*).
const CV_LM_CALL = { "cv-selena-live": "lc-selena" };
const cvInjections = (c) => {
  const callId = CV_LM_CALL[c.id];
  return (callId && window.LM_STORE && window.LM_STORE.injections && window.LM_STORE.injections[callId]) || [];
};

// Scripted tail for the live stream — arrives while you watch
const CV_LIVE_TAIL = [
  { t: "0:51", speaker: "client", text: "Perfect — and street parking is fine there?" },
  { t: "0:58", speaker: "agent", text: "There's a lot behind the building — I'll text you the entrance with your confirmation." },
];

// ---------- List row ----------
const CvRow = ({ c, active, onSelect }) => {
  const dec = cvDecision(c);
  const endedLive = cvEnded(c);
  return (
  <button className={`cv-row ${active ? "active" : ""} ${c.live && !endedLive ? "is-live" : ""}`} onClick={() => onSelect(c.id)}>
    <span className="cv-row-avatar">{c.initials.slice(0, 2)}</span>
    <span className="cv-row-body">
      <span className="cv-row-line1">
        <Icon name={CV_ICON[c.channel]} size={11} />
        <span className="cv-row-who">{c.who}</span>
        <span className="cv-row-at tabular">{c.at}</span>
      </span>
      <span className="cv-row-snippet">{c.snippet}</span>
      <span className="cv-row-foot">
        <span className="cv-row-agent">
          <span className="agent-avatar" style={{ width: 14, height: 14, fontSize: 8 }}>{c.agent.glyph}</span>
          {c.agent.name}
        </span>
        {c.duration && <span className="cv-row-dur mono tabular">{c.duration}</span>}
        <OutcomePill outcome={endedLive ? "handled" : c.outcome} decidedAction={dec ? dec.action : null} channel={c.channel} />
      </span>
    </span>
  </button>
  );
};

// ---------- Playback ----------
// Real calls stream the stored recording through a short-lived signed URL
// (the provider's permanent CDN link never reaches the browser). Seeded demo
// calls keep the original simulated scrubber.
const CvRealPlayback = ({ c }) => {
  const audioRef = React.useRef(null);
  const [playing, setPlaying] = useCvState(false);
  const [pos, setPos] = useCvState(0);
  const [dur, setDur] = useCvState(0);
  const [loading, setLoading] = useCvState(false);
  const [failed, setFailed] = useCvState(false);

  const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); return; }
    if (!el.src) {
      setLoading(true);
      try {
        const r = await fetch(c.recordingUrl);
        const j = await r.json();
        if (!j.ok || !j.data?.url) throw new Error("no url");
        el.src = j.data.url;
      } catch {
        setFailed(true); setLoading(false); return;
      }
      setLoading(false);
    }
    el.play().catch(() => setFailed(true));
  };

  const pct = dur ? (pos / dur) * 100 : 0;
  return (
    <div className="cv-playback">
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setPos(e.target.currentTime)}
        onLoadedMetadata={(e) => setDur(e.target.duration || 0)}
        onError={() => { setFailed(true); setPlaying(false); }}
      />
      <button
        className="cv-play"
        title={playing ? "Pause" : "Play recording"}
        onClick={toggle}
        disabled={loading || failed}
      >
        <Icon name={playing ? "pause" : "play"} size={13} />
      </button>
      <div className="cv-play-track"><div className="cv-play-fill" style={{ width: `${pct}%` }} /></div>
      <span className="mono tabular cv-play-time">
        {failed ? "Recording unavailable" : loading ? "Loading…" : `${fmt(pos)} / ${c.duration || fmt(dur)}`}
      </span>
    </div>
  );
};

const CvNoPlayback = ({ state }) => (
  <div className="cv-playback">
    <button className="cv-play" disabled title={state === "pending" ? "Still processing" : "No recording"}>
      <Icon name="play" size={13} />
    </button>
    <div className="cv-play-track"><div className="cv-play-fill" style={{ width: "0%" }} /></div>
    <span className="mono tabular cv-play-time">
      {state === "pending" ? "Recording still processing — check back in a minute" : "No recording for this call"}
    </span>
  </div>
);

// ---------- Simulated playback (seeded demo calls only) ----------
// ---------- Simulated playback (recorded calls) ----------
const CvPlayback = ({ c }) => {
  const [playing, setPlaying] = useCvState(false);
  const [pct, setPct] = useCvState(0);
  const [played, setPlayed] = useCvState(false);
  const rafRef = React.useRef(null);
  const durSec = React.useMemo(() => {
    const [m, s] = String(c.duration || "0:30").split(":").map(Number);
    return (m * 60 + (s || 0));
  }, [c.duration]);
  const DEMO_SPEED = Math.max(1, durSec / 12); // whole recording plays in ~12s

  useCvEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const toggle = () => {
    if (playing) { cancelAnimationFrame(rafRef.current); setPlaying(false); return; }
    if (pct >= 100) setPct(0);           // replay from the top
    setPlayed(false);
    setPlaying(true);
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000; last = now;
      setPct(p => {
        const next = p + (dt * DEMO_SPEED / durSec) * 100;
        if (next >= 100) { setPlaying(false); setPlayed(true); return 100; }  // rest at the end
        rafRef.current = requestAnimationFrame(step);
        return next;
      });
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const posSec = Math.round((pct / 100) * durSec);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="cv-playback">
      <button className="cv-play" title={playing ? "Pause" : pct >= 100 ? "Replay" : "Play recording"} onClick={toggle}>
        <Icon name={playing ? "pause" : "play"} size={13} />
      </button>
      <div className="cv-play-track"><div className="cv-play-fill" style={{ width: `${pct}%` }} /></div>
      <span className="mono tabular cv-play-time">{fmt(posSec)} / {c.duration}{played ? " · Played" : ""}</span>
    </div>
  );
};

// ---------- Viewer ----------
const CvViewer = ({ c }) => {
  const dec = cvDecision(c);
  const endedLive = cvEnded(c);
  const isLive = !!c && c.live && !endedLive;

  // Live stream sim: duration ticks + scripted lines arrive; timer-safe
  const [liveSec, setLiveSec] = useCvState(42);
  const [tailN, setTailN] = useCvState(0);
  useCvEffect(() => {
    if (!isLive || !window.__DEMO_MODE) return undefined;
    const tick = window.setInterval(() => setLiveSec(s => s + 1), 1000);
    const t1 = window.setTimeout(() => setTailN(1), 4000);
    const t2 = window.setTimeout(() => setTailN(2), 9500);
    return () => { window.clearInterval(tick); window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [isLive, c && c.id]);

  if (!c) return null;
  const isCall = c.channel === "phone";
  const realCall = !!c.real && isCall;
  const liveDur = `${Math.floor(liveSec / 60)}:${String(liveSec % 60).padStart(2, "0")}`;
  const transcript = c.transcript
    ? [...c.transcript, ...(isLive ? CV_LIVE_TAIL.slice(0, tailN) : [])]
    : null;
  const injections = isCall ? cvInjections(c) : [];
  return (
    <div className="cv-viewer" key={c.id}>
      {/* Header */}
      <header className="cv-head">
        <span className="cv-head-avatar">{c.initials.slice(0, 2)}</span>
        <div className="cv-head-titles">
          <div className="cv-head-name">
            {c.who}
            <OutcomePill outcome={endedLive ? "handled" : c.outcome} decidedAction={dec ? dec.action : null} channel={c.channel} />
          </div>
          <div className="cv-head-meta">
            <Icon name={CV_ICON[c.channel]} size={11} />
            <span>{CV_LABEL[c.channel]}</span>
            <span className="cv-dot" />
            <span>{isLive ? "In progress" : endedLive ? "Ended just now" : c.at}</span>
            {c.duration && <><span className="cv-dot" /><span className="mono tabular">{isLive ? liveDur : c.duration}</span></>}
            <span className="cv-dot" />
            <span>{c.agent.name}</span>
          </div>
        </div>
        <div className="cv-head-actions">
          {c.threadId && (
            <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(`inbox/${c.threadId}`)}>
              <Icon name="inbox" size={12} /> View thread in Inbox
            </button>
          )}
          {c.clientId && (
            <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.client(c.clientId))}>
              <Icon name="users" size={12} /> Open client
            </button>
          )}
          {c.approval && (
            dec ? (
              <button className="btn btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.thread(c.threadId))}>
                <Icon name="check" size={12} style={{ color: "var(--ok)" }} /> Decided “{dec.action}” — view thread
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => window.CHANLY.nav(c.threadId ? window.CHANLY.R.thread(c.threadId) : "inbox")}>
                Review in Inbox <Icon name="arrow-right" size={11} />
              </button>
            )
          )}
          <MoreMenu items={[
            { header: "Thread" },
            ...(c.threadId ? [{ label: dec ? `View thread · decided “${dec.action}”` : "View thread in Inbox", icon: "inbox", onClick: () => window.CHANLY.nav(window.CHANLY.R.thread(c.threadId)) }] : []),
            { label: "Export transcript", icon: "external", onClick: () => window.askAbout({ prompt: "Export this transcript", answer: "I can export it as PDF or CSV — which would you like?" }) },
            { divider: true },
            { label: "Assign to an agent", icon: "sparkle", onClick: () => window.askAbout({ mode: "compose", prompt: "Assign this thread to " }) },
          ]} />
        </div>
      </header>

      <div className="cv-scroll">
        {/* Summary */}
        <div className="cv-summary">
          <div className="cv-summary-eyebrow">
            <Icon name={c.channel === "phone" ? "phone" : "chat"} size={11} />
            {c.channel === "phone" ? "What happened on this call" : `Latest from ${c.whoShort || String(c.who || "").split(" ")[0]}`}
            {c.policyClass && <PolicyChip cls={c.policyClass} className="cv-pol" />}
          </div>
          <div className="cv-summary-headline">{c.summary.headline}</div>
          <ul className="cv-summary-bullets">
            {c.summary.bullets.map((b, i) => (
              <li key={i}><span className="cv-bullet-dot" /><span>{b}</span></li>
            ))}
          </ul>
          {c.summary.value !== undefined && (
            <span className={`cv-summary-value tabular ${c.summary.value >= 0 ? "pos" : "neg"}`}>
              {c.summary.value >= 0 ? "+" : "−"}${Math.abs(c.summary.value).toLocaleString()} {c.summary.value >= 0 ? "booked" : "at stake"}
            </span>
          )}
        </div>

        {/* Playback (recorded calls) / live bar */}
        {isCall && !isLive && (realCall
          ? (c.recordingState === "ready"
              ? <CvRealPlayback c={c} />
              : <CvNoPlayback state={c.recordingState} />)
          : <CvPlayback c={c} />)}
        {isLive && (
          <div className="cv-playback live">
            <span className="live-dot" />
            <span className="cv-live-label">Live transcription</span>
            <span className="mono tabular cv-play-time">{liveDur}</span>
            <button className="btn btn-sm" onClick={() => window.CHANLY.nav("live")}>
              <Icon name="headphones" size={12} /> Listen in
            </button>
          </div>
        )}

        {/* Transcript (calls) */}
        {transcript && (
          <div className="cv-transcript">
            {transcript.map((line, i) => (
              <div key={i} className={`cv-line ${line.speaker}`}>
                <span className="cv-line-t mono tabular">{line.t}</span>
                <span className="cv-line-speaker">{line.speaker === "agent" ? c.agent.name : (c.whoShort || c.who.split(" ")[0])}</span>
                <span className="cv-line-text">
                  {line.text}
                  {isLive && i === transcript.length - 1 && <span className="cv-cursor" />}
                </span>
              </div>
            ))}
            {injections.map((inj, i) => (
              inj.kind === "you" ? (
                <div key={`inj-${i}`} className="cv-line agent cv-line-you">
                  <span className="cv-line-t mono tabular">—</span>
                  <span className="cv-line-speaker">You</span>
                  <span className="cv-line-text">{inj.text}</span>
                </div>
              ) : inj.kind === "applied" ? (
                <div key={`inj-${i}`} className={`cv-line agent`}>
                  <span className="cv-line-t mono tabular">—</span>
                  <span className="cv-line-speaker">{c.agent.name}</span>
                  <span className="cv-line-text">{inj.text}</span>
                </div>
              ) : (
                <div key={`inj-${i}`} className="cv-line-note">
                  <Icon name="sparkle" size={10} />
                  <span>Context you injected mid-call · {inj.text}</span>
                </div>
              )
            ))}
          </div>
        )}

        {/* Messages (chats / email) */}
        {c.messages && (
          <div className="ix-timeline cv-messages">
            {c.messages.map((m, i) => (
              /* `undelivered` is not styling for its own sake: this pane is
                 where an operator reads back what their receptionist said, and
                 a message that never left has to be legible as one. */
              <div key={i} className={`tl-msg ${m.from === "client" ? "client" : "agent"}${m.reachedCustomer === false ? " undelivered" : ""}`}>
                <div className="tl-msg-bubble">
                  <div className="tl-msg-meta">
                    <Icon name={CV_ICON[c.channel]} size={10} />
                    <span>{CV_LABEL[c.channel]}</span>
                    <span className="tl-msg-time tabular">{m.at}</span>
                    {m.statusLabel && <span className="cv-msg-status">· {m.statusLabel}</span>}
                  </div>
                  <div className="tl-msg-body">{m.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- Page ----------
const ConversationsPage = ({ channel = "all", initialId = null }) => {
  const { CONVERSATIONS, CV_CHANNELS } = window.CONVERSATIONS_DATA;
  const [query, setQuery] = useCvState("");
  const [selectedId, setSelectedId] = useCvState(initialId);
  const [tick, setTick] = useCvState(0);

  // Deep-link follows later navigations; decisions flip pills live
  useCvEffect(() => { if (initialId) setSelectedId(initialId); }, [initialId]);
  useCvEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("inbox:decisions", bump);
    window.addEventListener("live:ended", bump);
    window.addEventListener("surface:conversations", bump); // SurfaceData seam: real-data swap + realtime refresh
    return () => { window.removeEventListener("inbox:decisions", bump); window.removeEventListener("live:ended", bump); window.removeEventListener("surface:conversations", bump); };
  }, []);

  const matchesChannel = (c) =>
    channel === "all" ? true :
    channel === "phone" ? c.channel === "phone" :
    channel === "chats" ? (c.channel === "instagram" || c.channel === "sms" || c.channel === "whatsapp") :
    c.channel === "mail";

  const visible = useCvMemo(() => {
    let list = CONVERSATIONS.filter(matchesChannel);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(c =>
        c.who.toLowerCase().includes(q) ||
        c.snippet.toLowerCase().includes(q) ||
        (c.summary && (c.summary.headline + " " + c.summary.bullets.join(" ")).toLowerCase().includes(q)) ||
        (c.transcript || []).some(l => l.text.toLowerCase().includes(q)) ||
        (c.messages || []).some(m => m.text.toLowerCase().includes(q))
      );
    }
    return list;
  }, [channel, query, tick]); // tick: the SurfaceData swap replaces the array identity

  // Keep selection valid within the filtered list
  const selected = visible.find(c => c.id === selectedId) || visible[0];
  useCvEffect(() => { if (!initialId) setSelectedId(null); }, [channel]);

  const counts = useCvMemo(() => ({
    all: CONVERSATIONS.length,
    phone: CONVERSATIONS.filter(c => c.channel === "phone").length,
    chats: CONVERSATIONS.filter(c => c.channel === "instagram" || c.channel === "sms" || c.channel === "whatsapp").length,
    mail: CONVERSATIONS.filter(c => c.channel === "mail").length,
  }), [tick]); // tick: counts read the swapped global too

  return (
    <div className="conversations">
      <aside className="cv-list">
        <div className="cv-list-head">
          <div className="cl-search-wrap">
            <Icon name="search" size={13} />
            <input placeholder="Search names, transcripts, messages…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="cv-filters">
          <div className="fleet-filter">
            {CV_CHANNELS.map(ch => (
              <button
                key={ch.id}
                className={`fleet-filter-chip ${channel === ch.id ? "active" : ""}`}
                onClick={() => window.CHANLY.nav(ch.id === "all" ? "conversations" : `conversations/${ch.id}`)}
              >
                {ch.label}
                <span className="fleet-filter-count tabular">{counts[ch.id]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="cv-rows">
          {visible.map(c => (
            <CvRow key={c.id} c={c} active={selected?.id === c.id} onSelect={setSelectedId} />
          ))}
          {visible.length === 0 && (
            <div className="cv-empty">
              <div>No conversations match{query.trim() ? ` “${query.trim()}”` : " this channel"}.</div>
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--ink-faint)" }}>Search spans names, transcripts, and messages.</div>
              {query.trim() && (
                <button className="cl-bucket-link" style={{ marginTop: 8 }} onClick={() => setQuery("")}>
                  Clear search <Icon name="arrow-right" size={10} />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {selected ? <CvViewer c={selected} /> : (
        <div className="ix-empty-state">
          <div className="ix-empty-glyph"><Icon name="chat" size={28} /></div>
          <div className="ix-empty-title">No conversation selected</div>
        </div>
      )}
    </div>
  );
};

window.ConversationsPage = ConversationsPage;
