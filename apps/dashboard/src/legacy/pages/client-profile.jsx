/* global React, Icon, CLIENTS, ChannelGlyph, TempBar, ClientTag */
// Chanlytics — Client profile page.
// The last approval surface wired into the decide engine: Aisha's queue
// approves through IX_STORE (toast + undo), overlays live decisions, and
// resolves threads/conversations dynamically by clientId.

const { useState: useStateP, useEffect: useEffectP } = React;

// ---- dynamic cross-surface resolution (threads carry clientId) ----
const cpThreadFor = (c, states = ["needs", "escalated", "drafts"]) =>
  (((window.INBOX_DATA || {}).THREADS) || []).find(t => t.clientId === c.id && states.includes(t.state)) || null;
const cpConvoFor = (c) =>
  (((window.CONVERSATIONS_DATA || {}).CONVERSATIONS) || []).find(v => v.clientId === c.id) || null;
const cpDecision = (threadId) => {
  const rec = threadId && window.IX_STORE && window.IX_STORE.get(threadId);
  return rec && rec.kind === "decided" ? rec : null;
};
// Upcoming (non-done) calendar appointment for this client — exact deep-link target
const cpApptFor = (c) => {
  const days = ((window.CALENDAR_DATA || {}).CAL_WEEK) || [];
  const appts = days.flatMap(d => d.appts || []);
  return appts.find(a => a.clientId === c.id && a.status !== "done" && a.status !== "noshow")
    || appts.filter(a => a.clientId === c.id).pop() || null;
};
// Open lead referencing this client — the dupe loop's client-side door
const cpLeadFor = (c) =>
  (window.LEADS || []).find(l => (l.clientId === c.id || (l.dupe && l.dupe.clientId === c.id)) && l.stage !== "converted" && l.stage !== "archived") || null;

// ---- session stores: per-client autonomy + muted queue items ----
// Page-local stores would reset on nav; these follow the FL_STORE pattern.
window.CP_STORE = window.CP_STORE || {
  autonomy: {},   // clientId -> "auto" | "ask" | "off"
  muted: {},      // `${clientId}:${key}` -> true
  setAutonomy(id, v) { this.autonomy[id] = v; },
  setMuted(key, v) { if (v) this.muted[key] = true; else delete this.muted[key]; },
};

const MuteBtn = ({ mkey, onFlash, label = "queued step", disabled = false }) => {
  const [, setTick] = useStateP(0);
  const muted = !!window.CP_STORE.muted[mkey];
  const toggle = () => {
    window.CP_STORE.setMuted(mkey, !muted);
    setTick(n => n + 1);
    onFlash({
      msg: muted ? <>Unmuted — the {label} is back on</> : <>Muted — agents skip this {label} for now</>,
      undo: () => { window.CP_STORE.setMuted(mkey, muted); setTick(n => n + 1); },
    });
  };
  return (
    <button className="btn btn-ghost btn-sm" onClick={toggle} disabled={disabled}>
      {muted ? "Unmute" : "Mute"}
    </button>
  );
};

const AISHA_TIMELINE = [
  { type: "agent", agent: "Phone Rep", at: "today · 11:40", text: "Drafted refund-decline + counter (credit toward next 2 visits). Holding for operator approval." },
  { type: "client", channel: "phone", at: "today · 11:38", text: "Hey — I think I need a refund. Two no-shows feels like enough penalty." },
  { type: "event", at: "Apr 26 · 11:00", text: "Marked no-show by Front Desk · 2nd this week" },
  { type: "agent", agent: "Phone Rep", at: "Apr 24 · 09:12", text: "Confirmed Tuesday 11am reschedule via SMS." },
  { type: "client", channel: "sms", at: "Apr 24 · 09:11", text: "Sorry I missed Friday — work emergency. Can I reschedule?" },
  { type: "event", at: "Apr 23 · 16:15", text: "Marked no-show by Front Desk" },
  { type: "session", at: "Apr 16 · 14:00", text: "Deep tissue 60 with Lena — completed" },
  { type: "client", channel: "phone", at: "Apr 14 · 11:02", text: "Booked Friday 4pm." },
];

// Generic timeline for clients without a scripted history — derived from their data
const timelineFor = (c) => {
  if (c.id === "c-aisha") return AISHA_TIMELINE;
  const out = [];
  if (c.agentActivity) out.push({ type: "agent", agent: c.agentActivity.agent, at: c.lastContact, text: `${c.agentActivity.verb}.` });
  if (c.lastVisit !== "—") out.push({ type: "session", at: c.lastVisit, text: `Session with ${c.therapist} — completed` });
  out.push({ type: "event", at: c.lastContact, text: `Last contact via ${c.primaryChannel}` });
  return out;
};

// Honest cadence: avg gap between visits vs. days since the last one
const cpDaysAgo = (s) => {
  if (!s || s === "—") return null;
  const M = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const [mon, d] = s.split(" ");
  if (!(mon in M)) return null;
  const now = window.CHANLY.SEED_TODAY;
  const dt = new Date(now.getFullYear(), M[mon], parseInt(d, 10));
  if (dt > now) dt.setFullYear(now.getFullYear() - 1);
  return Math.round((now - dt) / 86400000);
};
const cadenceFor = (c) => {
  if (!c.visits || c.visits < 2 || !c.joinedDays) return { value: "—", meta: "too new to tell" };
  const gapDays = c.joinedDays / c.visits;
  const value = gapDays < 10 ? "~1 wk" : `~${Math.round(gapDays / 7)} wk`;
  const since = cpDaysAgo(c.lastVisit);
  const meta = since == null ? "no visits yet" : since > gapDays * 1.35 ? "slowing" : "steady";
  return { value, meta };
};

// Generic "what happens next" queue for non-scripted clients
const GenericQueue = ({ c, onFlash, held }) => {
  const thread = cpThreadFor(c);
  const dec = thread && cpDecision(thread.id);
  const muted = !!window.CP_STORE.muted[`${c.id}:generic`];
  if (!c.agentActivity) return (
    <div className="cl-prof-queue-item">
      <div className="agent-avatar">·</div>
      <div className="cl-prof-queue-body">
        <div className="cl-prof-queue-line1"><span className="cl-prof-queue-agent">Nothing queued</span></div>
        <div className="cl-prof-queue-action">Agents are on cruise for this relationship.</div>
      </div>
    </div>
  );
  const needsYou = c.agentActivity.status === "approval" || c.agentActivity.status === "escalated";
  return (
    <div className={`cl-prof-queue-item ${c.agentActivity.status === "approval" ? "approval" : ""} ${muted || held ? "is-muted" : ""}`}>
      <div className={`agent-avatar ${(c.agentActivity.status === "approval" || c.agentActivity.status === "in-flight") && !held && !muted ? "active" : ""}`}>{c.agentActivity.glyph}</div>
      <div className="cl-prof-queue-body">
        <div className="cl-prof-queue-line1">
          <span className="cl-prof-queue-agent">{c.agentActivity.agent}</span>
          {held ? (
            <span className="cl-prof-queue-tag paused">Held · agents off</span>
          ) : muted ? (
            <span className="cl-prof-queue-tag paused">Muted · held</span>
          ) : dec ? (
            <span className="cl-prof-queue-tag decided"><Icon name="check" size={9} /> Decided · {dec.action}</span>
          ) : (
            <span className={`cl-prof-queue-tag ${c.agentActivity.status}`}>{c.agentActivity.status === "approval" ? "Awaiting you" : c.agentActivity.status === "escalated" ? "Escalated" : c.agentActivity.status === "scheduled" ? "Scheduled" : c.agentActivity.status === "in-flight" ? "In flight" : "Paused"}</span>
          )}
          {c.agentActivity.since && !dec && !held && !muted && <span className="cl-prof-queue-time">since {c.agentActivity.since}</span>}
        </div>
        <div className="cl-prof-queue-action">{held ? "Held while agents are hands-off — nothing sends" : muted ? "Muted — this step is skipped until you unmute" : dec ? `You chose “${dec.action}” at ${dec.at} — executing` : c.agentActivity.verb}{!dec && !held && !muted && c.nextWith && c.nextWith !== "—" ? ` · next: ${c.nextWith}` : ""}</div>
      </div>
      <div className="cl-prof-queue-actions">
        {needsYou || dec
          ? <button className={`btn btn-sm ${dec || held ? "" : "btn-primary"}`} onClick={() => window.CHANLY.nav(thread ? window.CHANLY.R.thread(thread.id) : "inbox")}>{dec ? "View thread" : "Review"}</button>
          : <MuteBtn mkey={`${c.id}:generic`} onFlash={onFlash} disabled={held} />}
      </div>
    </div>
  );
};

const ClientProfileSeed = ({ id = "c-aisha", onBack = () => {} }) => {
  const c = CLIENTS.find(x => x.id === id) || CLIENTS[0];
  const isAisha = c.id === "c-aisha";
  const [autonomy, setAutonomyState] = useStateP(() => window.CP_STORE.autonomy[c.id] || "ask");
  const [askText, setAskText] = useStateP("");
  const [toastNode, ppFlash] = window.usePPToast();
  const [, setTick] = useStateP(0);

  useEffectP(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("inbox:decisions", bump);
    return () => window.removeEventListener("inbox:decisions", bump);
  }, []);

  const flash = (payload) => ppFlash(payload);

  const setAutonomy = (v) => {
    const prev = autonomy;
    if (prev === v) return;
    setAutonomyState(v);
    window.CP_STORE.setAutonomy(c.id, v);
    flash({
      msg: <><b>{c.name.split(" ")[0]}</b> · agents set to {v === "auto" ? "act without asking" : v === "ask" ? "always ask first" : "hands off — manual only"}</>,
      undo: () => { setAutonomyState(prev); window.CP_STORE.setAutonomy(c.id, prev); },
    });
  };

  // Aisha's scripted decision — wired to the real engine
  const aishaThread = "th-aisha-refund";
  const aishaDec = cpDecision(aishaThread);
  const approveAisha = () => {
    const t = (((window.INBOX_DATA || {}).THREADS) || []).find(x => x.id === aishaThread);
    const action = t?.approval?.recommended || "Counter";
    if (window.IX_STORE) window.IX_STORE.set(aishaThread, { action, at: window.CHANLY.IX_NOW, kind: "decided" });
    flash({
      msg: <><b>{action}</b> approved — Phone Rep is sending Aisha the credit offer</>,
      undo: () => window.IX_STORE && window.IX_STORE.clear(aishaThread),
    });
  };

  const msgTarget = () => {
    const t = cpThreadFor(c);
    if (t) return window.CHANLY.R.thread(t.id);
    const v = cpConvoFor(c);
    if (v) return `conversations/${v.id}`;
    return "inbox";
  };

  const cadence = cadenceFor(c);
  const agentsOff = autonomy === "off";
  const appt = cpApptFor(c);
  const openLead = cpLeadFor(c);
  const smsMuted = !!window.CP_STORE.muted["c-aisha:sms-counter"];
  const recMuted = !!window.CP_STORE.muted["c-aisha:recovery-nudge"];

  return (
    <div className="cl-profile">
      <div className="cl-prof-main">
        <div className="cl-prof-hero">
          <button className="cl-prof-back" onClick={onBack}>
            <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} />
            All clients
          </button>
          <div className="cl-prof-id">
            <div className="cl-prof-avatar" data-priority={c.priority}>{c.initials}</div>
            <div className="cl-prof-titles">
              <div className="cl-prof-name">{c.name}</div>
              <div className="cl-prof-meta">
                <span>{c.visits} visits · since {Math.round(c.joinedDays/30)} mo ago</span>
                <span style={{ color: "var(--ink-faint)" }}>·</span>
                <span>{c.therapist}</span>
                <span style={{ color: "var(--ink-faint)" }}>·</span>
                <span style={{ display: "inline-flex", gap: 3 }}>
                  {c.channels.map((ch, i) => <ChannelGlyph key={i} kind={ch} primary={ch === c.primaryChannel} size={11} />)}
                </span>
                <span className="cl-tag-stack" style={{ marginLeft: 4 }}>
                  {c.tags.map(t => <ClientTag key={t}>{t}</ClientTag>)}
                  {openLead && (
                    <button className="seg-chip seg-chip--warn" data-tip={openLead.dupe ? `${openLead.dupe.reason} — open the lead` : "This person also has an open lead — click to open it"} onClick={() => window.CHANLY.nav(`leads/${openLead.id}`)}>
                      <Icon name="bolt" size={9} /> Also in Leads
                    </button>
                  )}
                </span>
              </div>
            </div>
            <div className="cl-prof-actions">
              <button className="btn btn-sm" onClick={() => window.askAbout({
                prompt: "Call " + c.name,
                answer: "Phone Rep can place it from the main line and brief you after — or patch you in live. It has the context: " + ((c.signals && c.signals[0]) || "recent activity") + ".",
                links: [{ label: "Live monitor", to: "live" }, { label: "Open Inbox", to: "inbox" }],
              })}><Icon name="phone" size={12} /> Call</button>
              <button className="btn btn-sm" onClick={() => window.CHANLY.nav(msgTarget())}><Icon name="chat" size={12} /> Message</button>
              <button className="btn btn-sm" onClick={() => window.askAbout({
                prompt: "Book " + c.name + "’s next visit",
                answer: "Their usual is with " + (c.therapist || "Lena Park") + ". Nearest matching slots: Tue 11:00am and Thu 4:15pm. Want me to offer both or lock one in?",
                links: [{ label: "Open Calendar", to: "calendar" }],
              })}><Icon name="calendar" size={12} /> Book</button>
              <MoreMenu items={[
                { header: c.name },
                { label: "Add note", icon: "edit", onClick: () => window.askAbout({ mode: "compose", prompt: "Note on " + c.name + ": " }) },
                { label: "Add tag", icon: "tag", onClick: () => window.askAbout({ mode: "compose", prompt: "Tag " + c.name + " as " }) },
                { label: "Export history", icon: "external", onClick: () => window.askAbout({ prompt: "Export " + c.name + "'s history", answer: "I can export the full cross-channel history as PDF or CSV — tell me which and I'll generate it." }) },
                { divider: true },
                { label: "Archive client", icon: "x", danger: true, onClick: () => window.askAbout({ prompt: "Archive " + c.name + "?", answer: "Archiving hides " + c.name + " from active lists but keeps all history, and agents stop proactive outreach. Reversible any time.", links: [{ label: "Open Clients", to: "clients" }] }) },
              ]} />
            </div>
          </div>

          <div className="cl-prof-narr">
            <span className="cl-prof-narr-eyebrow">The relationship</span>
            <div>
              <div className="cl-prof-narr-text">{c.narrative}</div>
              <div className="cl-prof-narr-byline">Synthesized by Chanlytics · refreshed 2 min ago</div>
            </div>
          </div>

          <StatStrip className="cl-prof-money">
            <StatCell label="LTV" value={`$${(c.ltv ?? 0).toLocaleString()}`} meta={`$${Math.round((c.ltv ?? 0) / Math.max(1, c.visits ?? 1))} avg visit`} />
            <StatCell label="Sessions left" value={c.sessionsLeft} meta={c.sessionsLeft === 0 ? "no active package" : "current pkg"} />
            <StatCell label="Last visit" value={c.lastVisit} valueSize={14} meta={`last contact ${c.lastContact}`} />
            <span className="cl-prof-next" onClick={() => window.CHANLY.nav(appt ? window.CHANLY.R.appt(appt.id) : "calendar")} title={appt ? "Open this appointment in Calendar" : "Open Calendar"} style={{ cursor: "pointer", display: "block" }}>
              <StatCell label="Next visit" value={c.nextAppt ? c.nextAppt.split(" · ")[0] : "—"} valueSize={14} meta={c.nextAppt ? c.nextAppt.split(" · ")[1] || "booked" : "none booked"} metaTone={c.nextAppt ? "" : "neg"} />
            </span>
            <StatCell label="Cadence" value={cadence.value} valueSize={14} meta={cadence.meta} metaTone={cadence.meta === "slowing" ? "neg" : ""} />
            <StatCell label="Temperature" meta={c.temp < 0.4 ? "cooling" : c.temp < 0.7 ? "steady" : "warm"}>
              <TempBar value={c.temp} sizeClass="bar-md" />
            </StatCell>
          </StatStrip>
        </div>

        {/* Agent queue */}
        <div className="cl-prof-section">
          <div className="cl-prof-section-head">
            <span className="cl-prof-section-title">What agents will do next</span>
            <span className="cl-prof-section-sub">
              {agentsOff ? "agents muted for this relationship" : isAisha ? (aishaDec ? "decided — executing" : "3 actions in flight") : c.agentActivity ? "1 action in flight" : "Nothing queued"}
            </span>
          </div>
          <div className={`cl-prof-queue ${agentsOff ? "cl-prof-queue-off" : ""}`}>
            {agentsOff && (
              <div className="cl-prof-held-banner">
                <Icon name="pause" size={11} />
                Agents are hands-off for {c.name.split(" ")[0]} — the queue is held. Nothing sends until you flip autonomy back.
              </div>
            )}
            {!isAisha && <GenericQueue c={c} onFlash={flash} held={agentsOff} />}
            {isAisha && <>
            <div className={`cl-prof-queue-item ${aishaDec ? "" : "approval"} ${agentsOff ? "is-muted" : ""}`}>
              <div className={`agent-avatar ${agentsOff ? "" : "active"}`}>P</div>
              <div className="cl-prof-queue-body">
                <div className="cl-prof-queue-line1">
                  <span className="cl-prof-queue-agent">Phone Rep</span>
                  {agentsOff
                    ? <span className="cl-prof-queue-tag paused">Held · agents off</span>
                    : aishaDec
                    ? <span className="cl-prof-queue-tag decided"><Icon name="check" size={9} /> Decided · {aishaDec.action}</span>
                    : <span className="cl-prof-queue-tag approval">Awaiting you</span>}
                  <span className="cl-prof-queue-time">{agentsOff ? "" : aishaDec ? `at ${aishaDec.at}` : "since 11:40"}</span>
                </div>
                <div className="cl-prof-queue-action">
                  {agentsOff
                    ? "Held while agents are hands-off — the draft stays parked"
                    : aishaDec
                    ? (smsMuted ? `You chose “${aishaDec.action}” — counter held (send muted)` : `You chose “${aishaDec.action}” — the counter goes out via SMS at 14:00`)
                    : "Decline refund + counter with credit toward next 2 visits ($240 LTV preserved)"}
                </div>
              </div>
              <div className="cl-prof-queue-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.thread(aishaThread))}>{aishaDec ? "View thread" : "Edit"}</button>
                {!aishaDec && <><PolicyChip cls="money" /><button className="btn btn-primary btn-sm" onClick={approveAisha} disabled={agentsOff} {...window.gate("approve")}>Approve</button></>}
              </div>
            </div>
            <div className={`cl-prof-queue-item ${agentsOff || smsMuted ? "is-muted" : ""}`}>
              <div className="agent-avatar">S</div>
              <div className="cl-prof-queue-body">
                <div className="cl-prof-queue-line1">
                  <span className="cl-prof-queue-agent">SMS Agent</span>
                  {agentsOff
                    ? <span className="cl-prof-queue-tag paused">Held · agents off</span>
                    : smsMuted
                    ? <span className="cl-prof-queue-tag paused">Muted · held</span>
                    : <span className="cl-prof-queue-tag scheduled">{aishaDec ? "Queued" : "Scheduled"}</span>}
                  {!agentsOff && !smsMuted && <span className="cl-prof-queue-time">{aishaDec ? "sending today 14:00" : "if approved → today 14:00"}</span>}
                </div>
                <div className="cl-prof-queue-action">
                  {agentsOff ? "Held while agents are hands-off" : smsMuted ? "Muted — the counter-offer won't send until you unmute" : <>Send Aisha the counter-offer{aishaDec ? "" : " once approved"}</>}
                </div>
              </div>
              <div className="cl-prof-queue-actions">
                <MuteBtn mkey="c-aisha:sms-counter" onFlash={flash} label="counter-offer send" disabled={agentsOff} />
              </div>
            </div>
            <div className={`cl-prof-queue-item ${agentsOff || recMuted ? "is-muted" : ""}`}>
              <div className="agent-avatar">X</div>
              <div className="cl-prof-queue-body">
                <div className="cl-prof-queue-line1">
                  <span className="cl-prof-queue-agent">Recovery Agent</span>
                  {agentsOff
                    ? <span className="cl-prof-queue-tag paused">Held · agents off</span>
                    : recMuted
                    ? <span className="cl-prof-queue-tag paused">Muted · held</span>
                    : <span className="cl-prof-queue-tag scheduled">Scheduled</span>}
                  {!agentsOff && !recMuted && <span className="cl-prof-queue-time">May 3 if no booking</span>}
                </div>
                <div className="cl-prof-queue-action">{agentsOff ? "Held while agents are hands-off" : recMuted ? "Muted — the nudge is skipped until you unmute" : "Trigger 2-visit credit reminder + book-now nudge"}</div>
              </div>
              <div className="cl-prof-queue-actions">
                <MuteBtn mkey="c-aisha:recovery-nudge" onFlash={flash} label="recovery nudge" disabled={agentsOff} />
              </div>
            </div>
            </>}
          </div>
        </div>

        {/* Timeline */}
        <div className="cl-prof-section">
          <div className="cl-prof-section-head">
            <span className="cl-prof-section-title">Timeline</span>
            <span className="cl-prof-section-sub">All channels · agent actions woven in</span>
          </div>
          <div className="cl-prof-timeline">
            {timelineFor(c).map((e, i) => {
              if (e.type === "client") return (
                <div className="cl-tl-row" key={i}>
                  <div className="cl-tl-mark client">{c.initials}</div>
                  <div className="cl-tl-body">
                    <div className="cl-tl-head">
                      <span className="cl-tl-who">{c.name}</span>
                      <span className="cl-tl-channel"><Icon name={e.channel === "phone" ? "phone" : e.channel === "sms" ? "chat" : "mail"} size={11} /> {e.channel}</span>
                      <span style={{ marginLeft: "auto", color: "var(--ink-faint)" }}>{e.at}</span>
                    </div>
                    <div className="cl-tl-text">{e.text}</div>
                  </div>
                </div>
              );
              if (e.type === "agent") return (
                <div className="cl-tl-row" key={i}>
                  <div className="cl-tl-mark agent">{e.agent[0]}</div>
                  <div className="cl-tl-body">
                    <div className="cl-tl-head">
                      <span className="cl-tl-who">{e.agent}</span>
                      <span style={{ color: "var(--ink-faint)" }}>· agent</span>
                      <span style={{ marginLeft: "auto", color: "var(--ink-faint)" }}>{e.at}</span>
                    </div>
                    <div className="cl-tl-text muted">{e.text}</div>
                  </div>
                </div>
              );
              if (e.type === "session") return (
                <div className="cl-tl-row" key={i}>
                  <div className="cl-tl-mark session"><Icon name="check" size={13} /></div>
                  <div className="cl-tl-body">
                    <div className="cl-tl-head">
                      <span className="cl-tl-who">Session</span>
                      <span style={{ marginLeft: "auto", color: "var(--ink-faint)" }}>{e.at}</span>
                    </div>
                    <div className="cl-tl-text muted">{e.text}</div>
                  </div>
                </div>
              );
              return (
                <div className="cl-tl-row" key={i}>
                  <div className="cl-tl-mark event"><Icon name="dot" size={10} /></div>
                  <div className="cl-tl-body">
                    <div className="cl-tl-head">
                      <span style={{ color: "var(--ink-dim)" }}>System</span>
                      <span style={{ marginLeft: "auto", color: "var(--ink-faint)" }}>{e.at}</span>
                    </div>
                    <div className="cl-tl-text muted">{e.text}</div>
                  </div>
                </div>
              );
            })}
            {cpConvoFor(c) && (
              <button className="cl-bucket-link" style={{ marginTop: 10 }} onClick={() => window.CHANLY.nav(CHANLY.R.conversation(cpConvoFor(c).id))}>
                Full transcripts in Conversations <Icon name="arrow-right" size={10} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right rail */}
      <div className="cl-prof-rail">
        <div className="cl-prof-rail-section">
          <div className="cl-prof-rail-label">About</div>
          <div className="cl-prof-attr-list">
            <div className="cl-prof-attr"><span className="cl-prof-attr-key">Source</span><span className="cl-prof-attr-val">{c.source}</span></div>
            <div className="cl-prof-attr"><span className="cl-prof-attr-key">Therapist</span><span className="cl-prof-attr-val">{c.therapist}</span></div>
            <div className="cl-prof-attr"><span className="cl-prof-attr-key">Joined</span><span className="cl-prof-attr-val">{Math.round(c.joinedDays/30)} months ago</span></div>
            <div className="cl-prof-attr"><span className="cl-prof-attr-key">Primary ch.</span><span className="cl-prof-attr-val">{c.primaryChannel}</span></div>
            {(() => { const cp2 = window.CHANLY.compliance(c.id); return (
              <div className="cl-prof-attr"><span className="cl-prof-attr-key">Consent</span><span className="cl-prof-attr-val" style={!window.CHANLY.canMessage(c.id) ? { color: "var(--danger)" } : undefined}>{cp2.dnc ? "DNC — do not message" : cp2.consent === "granted" ? `Granted${cp2.method ? ` · ${cp2.method}` : ""}${cp2.date ? ` · ${cp2.date}` : ""}` : cp2.consent}</span></div>
            ); })()}
            {c.lifetimeSpend != null && c.lifetimeSpend !== c.ltv && (
              <div className="cl-prof-attr"><span className="cl-prof-attr-key">Lifetime</span><span className="cl-prof-attr-val">${c.lifetimeSpend.toLocaleString()}</span></div>
            )}
          </div>
        </div>

        <div className="cl-prof-rail-section">
          <div className="cl-prof-rail-label">Signals</div>
          <span className="cl-tag-stack">
            {c.signals.map(s => <ClientTag key={s} signal>{s}</ClientTag>)}
          </span>
        </div>

        <div className="cl-prof-rail-section">
          <div className="cl-prof-rail-label">In segments</div>
          <span className="cl-tag-stack">
            {(() => {
              const segs = window.CHANLY.segsOf(c.id);
              return segs.length > 0 ? segs.map(s => (
                <button key={s.id} className="seg-chip" data-tip={s.query} onClick={() => window.CHANLY.nav(window.CHANLY.R.segment(s.id))}>
                  <Icon name={s.kind === "agent" ? "sparkle" : "filter"} size={9} />{s.label}
                </button>
              )) : <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>No lists yet</span>;
            })()}
          </span>
        </div>

        <div className="cl-prof-rail-section">
          <div className="cl-prof-rail-label">Agent autonomy for {c.name.split(" ")[0]}</div>
          <div className="cl-prof-autonomy">
            <button className={`cl-prof-aut-seg ${autonomy === "auto" ? "active" : ""}`} onClick={() => setAutonomy("auto")}>Auto</button>
            <button className={`cl-prof-aut-seg ${autonomy === "ask" ? "active" : ""}`} onClick={() => setAutonomy("ask")}>Always ask</button>
            <button className={`cl-prof-aut-seg ${autonomy === "off" ? "active" : ""}`} onClick={() => setAutonomy("off")}>No agents</button>
          </div>
          <div className="cl-prof-aut-hint">
            {autonomy === "auto" && "Agents act without asking for routine matters."}
            {autonomy === "ask" && "Agents draft, you approve everything before send."}
            {autonomy === "off" && "Agents won't touch this person — manual only."}
          </div>
        </div>

        <div className="cl-prof-rail-section">
          <div className="cl-prof-rail-label">Ask {c.agentActivity?.agent || "Chanlytics"} about {c.name.split(" ")[0]}</div>
          <div className="cl-prof-ask">
            <textarea
              placeholder={`What should I know before reaching out to ${c.name.split(" ")[0]}?`}
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (askText.trim()) { window.askAbout({ prompt: `${askText.trim()} (about ${c.name})` }); setAskText(""); } } }}
            />
            <div className="cl-prof-ask-chips">
              {[c.temp < 0.5 ? "Why the cooling?" : "What keeps them coming back?", "Compare to similar clients", c.temp < 0.5 ? "Best re-engagement" : "Upsell timing"].map(q => (
                <span key={q} className="cl-prof-ask-chip" onClick={() => window.askAbout({ prompt: `${q} (about ${c.name})` })}>{q}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {toastNode}
    </div>
  );
};

// ====== Real branch — one person, in full ======
// Fetched on open through the bridge courier (window.__personDetail): every
// message, call, escalation and operator decision for this contact, mapped in
// contracts where the rule is tested. The frame is the seeded profile's; the
// six money cells became six measured facts, the agent queue became what the
// receptionist is doing right now, and the timeline is the record itself.

const PP_TONE_CLASS = { escalated: "escalated", queued: "approval", snoozed: "scheduled", paused: "paused", silent: "paused", answering: "" };

const PersonTimeline = ({ items, initials }) => {
  let lastDay = null;
  return (
    <div className="cl-prof-timeline">
      {items.map((e) => {
        const dayHead = e.day !== lastDay ? <div className="cl-rail-label" style={{ margin: "10px 0 4px" }}>{e.day}</div> : null;
        lastDay = e.day;
        const markClass = e.kind === "customer" ? "client" : e.kind === "receptionist" || e.kind === "you" ? "agent" : e.kind === "call" ? "session" : "event";
        const mark =
          e.kind === "customer" ? initials
          : e.kind === "receptionist" ? "W"
          : e.kind === "you" ? "You"
          : e.kind === "call" ? <Icon name="phone" size={12} />
          : e.kind === "escalation" ? <Icon name="alert" size={11} />
          : <Icon name="dot" size={10} />;
        return (
          <React.Fragment key={e.id}>
            {dayHead}
            <div className="cl-tl-row">
              <div className={`cl-tl-mark ${markClass}`}>{mark}</div>
              <div className="cl-tl-body">
                <div className="cl-tl-head">
                  <span className="cl-tl-who">{e.who}</span>
                  {e.kind === "receptionist" && <span style={{ color: "var(--ink-faint)" }}>· receptionist</span>}
                  {e.sub && <span style={{ color: "var(--ink-faint)" }}>· {e.sub}</span>}
                  <span style={{ marginLeft: "auto", color: "var(--ink-faint)" }}>{e.time}</span>
                </div>
                <div className={`cl-tl-text ${e.kind === "customer" ? "" : "muted"}`}>
                  {e.text}
                  {e.link && (
                    <>
                      {" "}
                      <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(e.link.to)}>
                        {e.link.label} <Icon name="arrow-right" size={10} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {items.length === 0 && <div className="cl-decision-empty">Nothing recorded yet.</div>}
    </div>
  );
};

const PersonProfileFrame = ({ onBack, children }) => (
  <div className="cl-profile">
    <div className="cl-prof-main">
      <div className="cl-prof-hero">
        <button className="cl-prof-back" onClick={onBack}>
          <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} />
          All clients
        </button>
        {children}
      </div>
    </div>
  </div>
);

const ClientProfileReal = ({ id, onBack = () => {} }) => {
  const [st, setSt] = useStateP({ loading: true, vm: null, missing: false, error: null });
  const [toastNode, ppFlash] = window.usePPToast();
  // "Delete this person" is a typed-name confirmation, not a click: it erases
  // messages, media and recordings and cannot be undone.
  const [del, setDel] = useStateP({ open: false, typed: "", busy: false, error: null });
  const [rm, setRm] = useStateP({ busy: false, error: null });
  const [cs, setCs] = useStateP({ busy: false, error: null, pick: null });
  const load = React.useCallback(() => {
    if (!window.__personDetail) return;
    setSt((s) => ({ ...s, loading: !s.vm, error: null }));
    window.__personDetail(id).then(
      (vm) => setSt({ loading: false, vm, missing: vm === null, error: null }),
      (e) => setSt((s) => ({ ...s, loading: false, error: e && e.message ? e.message : "could not load this person" })),
    );
  }, [id, setSt]);
  useEffectP(() => { load(); }, [load]);
  useEffectP(() => {
    window.addEventListener("surface:clients", load);
    return () => window.removeEventListener("surface:clients", load);
  }, [load]);

  const { vm, loading, missing, error } = st;
  if (missing) return (
    <PersonProfileFrame onBack={onBack}>
      <div className="cl-decision-empty">This person is not in your workspace — they may have been deleted.</div>
    </PersonProfileFrame>
  );
  if (!vm) return (
    <PersonProfileFrame onBack={onBack}>
      <div className="cl-decision-empty" aria-busy={loading ? "true" : "false"}>
        {loading ? "Loading…" : <>Couldn't load this person — {error}. <button className="cl-bucket-link" onClick={load}>Retry</button></>}
      </div>
    </PersonProfileFrame>
  );

  const p = vm;
  const tone = p.rightNow.tone;
  const isOwner = !!(window.__ME && window.__ME.role === "owner");
  const canRecord = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  const digitsOf = (x) => String(x || "").replace(/\D/g, "");
  const typedMatches =
    del.typed.trim() === p.name ||
    (!!p.phone && digitsOf(del.typed).length >= 7 && digitsOf(del.typed) === digitsOf(p.phone));
  const closeDelete = () => setDel({ open: false, typed: "", busy: false, error: null });
  // Receptionist for this person: the person's own setting wins; "inherit"
  // removes it. Re-fetched from the server afterwards, never assumed.
  const RM_LABEL = { auto: "Answer", ask: "Ask me first", never: "Never" };
  const rmPerson = p.receptionistMode.person;
  const rmEffective = rmPerson || p.receptionistMode.workspace;
  const setMode = async (mode) => {
    if (!window.__setPersonReceptionist || rm.busy) return;
    setRm({ busy: true, error: null });
    const r = await window.__setPersonReceptionist(p.id, mode);
    if (!r.ok) { setRm({ busy: false, error: r.message || "Could not change this." }); return; }
    setRm({ busy: false, error: null });
    ppFlash({
      msg: mode === "inherit"
        ? <><b>{first === "them" ? "This person" : first}</b> follows the workspace setting again</>
        : <>Receptionist for <b>{first === "them" ? "this person" : first}</b>: {RM_LABEL[mode]}</>,
    });
    load();
  };
  // The customer's answer about offers by WhatsApp, recorded by whoever heard
  // it. A yes or a no is not written until the page knows how it was given;
  // "not asked" is a reset and needs no source.
  const CS_SOURCES = window.__consentSources || [
    { id: "in_person", label: "In person" }, { id: "phone", label: "On the phone" },
    { id: "form", label: "Sign-up form" }, { id: "customer_message", label: "Their own message" },
  ];
  const recordConsent = async (consent, source) => {
    if (!window.__setPersonConsent || cs.busy) return;
    setCs({ busy: true, error: null, pick: null });
    const r = await window.__setPersonConsent(p.id, source ? { consent, source } : { consent });
    if (!r.ok) { setCs({ busy: false, error: r.message || "Could not record this.", pick: null }); return; }
    setCs({ busy: false, error: null, pick: null });
    const who = first === "them" ? "This person" : first;
    ppFlash({
      msg: consent === "opted_in" ? <><b>{who}</b> said yes to offers by WhatsApp</>
        : consent === "opted_out" ? <><b>{who}</b> said no — nothing but replies to their own messages</>
        : <><b>{who}</b> is back to "not asked"</>,
    });
    load();
  };
  const pickConsent = (state) => {
    if (state === "unknown") {
      if (p.consent.state !== "unknown") recordConsent("unknown", null);
      return;
    }
    setCs((c) => ({ ...c, pick: c.pick === state ? null : state, error: null }));
  };
  const confirmDelete = async () => {
    if (!window.__deletePerson || !typedMatches) return;
    setDel((d) => ({ ...d, busy: true, error: null }));
    const r = await window.__deletePerson(p.id);
    if (!r.ok) {
      setDel((d) => ({ ...d, busy: false, error: r.message || "Could not delete this person." }));
      return;
    }
    ppFlash({ msg: <><b>{p.name}</b> deleted — their messages, media and recordings are gone</> });
    onBack();
  };
  // Nobody is called "+1": a person known only by number is "them" in copy
  // and their full number where a speaker is named.
  const phoneOnly = /^[+\d(]/.test(p.name);
  const first = phoneOnly ? "them" : p.name.split(" ")[0];
  const speaker = phoneOnly ? p.name : first;
  const hot = tone === "escalated" || tone === "queued";
  return (
    <div className="cl-profile">
      <div className="cl-prof-main">
        <div className="cl-prof-hero">
          <button className="cl-prof-back" onClick={onBack}>
            <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} />
            All clients
          </button>
          <div className="cl-prof-id">
            <div className="cl-prof-avatar">{p.initials}</div>
            <div className="cl-prof-titles">
              <div className="cl-prof-name">{p.name}</div>
              <div className="cl-prof-meta">
                {p.since && <><span>{p.since}</span><span style={{ color: "var(--ink-faint)" }}>·</span></>}
                <span>{p.metaLine}</span>
                <span style={{ color: "var(--ink-faint)" }}>·</span>
                <span style={{ display: "inline-flex", gap: 3 }}>
                  {p.channels.map((ch, i) => <ChannelGlyph key={ch} kind={ch === "voice" ? "phone" : "chat"} primary={i === 0} size={11} />)}
                </span>
                <span className="cl-tag-stack" style={{ marginLeft: 4 }}>
                  <ClientTag signal={p.consent.state === "opted_out"}>{p.consent.state === "opted_out" ? "Opted out" : p.consent.state === "opted_in" ? "Opted in" : "Consent unknown"}</ClientTag>
                  <ClientTag>{p.stateLabel}</ClientTag>
                </span>
              </div>
            </div>
            <div className="cl-prof-actions">
              {p.openThread && (
                <button className="btn btn-sm btn-primary" onClick={() => window.CHANLY.nav(p.openThread)}>
                  <Icon name="chat" size={12} /> Open thread
                </button>
              )}
              {window.__DEMO_MODE && <button className="btn btn-sm"><Icon name="phone" size={12} /> Call</button>}
              {window.__DEMO_MODE && <button className="btn btn-sm"><Icon name="calendar" size={12} /> Book</button>}
            </div>
          </div>
          <div className="cl-prof-narr">
            <span className="cl-prof-narr-eyebrow">Last exchange</span>
            <div>
              {p.lastExchange.customer ? (
                <div className="cl-prof-narr-text"><b>{speaker}</b> “{p.lastExchange.customer.text}” <span className="dim" style={{ fontSize: 11 }}>{p.lastExchange.customer.at}</span></div>
              ) : (
                <div className="cl-prof-narr-text">{p.calls ? "They have only phoned — the transcript is in Conversations." : "Nothing written yet."}</div>
              )}
              {p.lastExchange.reply && (
                <div className="cl-prof-narr-text"><b>{p.lastExchange.reply.who}</b> “{p.lastExchange.reply.text}” <span className="dim" style={{ fontSize: 11 }}>{p.lastExchange.reply.at}</span></div>
              )}
              <div className="cl-prof-narr-byline">Verbatim from the thread</div>
            </div>
          </div>
          <StatStrip className="cl-prof-money">
            {p.facts.map((f) => (
              <StatCell key={f.label} label={f.label} value={f.value} valueSize={typeof f.value === "string" ? 14 : undefined} meta={f.meta} metaTone={f.tone || ""} />
            ))}
          </StatStrip>
        </div>

        <div className="cl-prof-section">
          <div className="cl-prof-section-head">
            <span className="cl-prof-section-title">Right now</span>
            <span className="cl-prof-section-sub">what the receptionist is doing for {first}</span>
          </div>
          <div className="cl-prof-queue">
            <div className={`cl-prof-queue-item ${hot ? "approval" : ""}`}>
              <div className={`agent-avatar ${hot ? "active" : ""}`}>W</div>
              <div className="cl-prof-queue-body">
                <div className="cl-prof-queue-line1">
                  <span className="cl-prof-queue-agent">Receptionist</span>
                  <span className={`cl-prof-queue-tag ${PP_TONE_CLASS[tone] || ""}`}>{p.rightNow.title}</span>
                </div>
                <div className="cl-prof-queue-action">{p.rightNow.detail}</div>
              </div>
              <div className="cl-prof-queue-actions">
                {p.rightNow.cta && (
                  <button className={`btn btn-sm ${tone === "escalated" ? "btn-primary" : ""}`} onClick={() => window.CHANLY.nav(p.rightNow.cta.to)}>
                    {p.rightNow.cta.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="cl-prof-section">
          <div className="cl-prof-section-head">
            <span className="cl-prof-section-title">Timeline</span>
            <span className="cl-prof-section-sub">Messages, calls and your decisions · in true order</span>
          </div>
          <PersonTimeline items={p.timeline} initials={p.initials} />
        </div>
      </div>

      <div className="cl-prof-rail">
        <div className="cl-prof-rail-section">
          <div className="cl-prof-rail-label">About</div>
          <div className="cl-prof-attr-list">
            {p.about.map((a) => (
              <div className="cl-prof-attr" key={a.k}><span className="cl-prof-attr-key">{a.k}</span><span className="cl-prof-attr-val">{a.v}</span></div>
            ))}
          </div>
        </div>
        <div className="cl-prof-rail-section" data-testid="receptionist-mode">
          <div className="cl-prof-rail-label">Receptionist for {first === "them" ? "this person" : first}</div>
          <div className="cl-prof-autonomy">
            {["auto", "ask", "never"].map((m) => (
              <button
                key={m}
                className={`cl-prof-aut-seg ${rmEffective === m ? "active" : ""}`}
                aria-pressed={rmEffective === m}
                disabled={!isOwner || rm.busy}
                onClick={() => setMode(m)}
              >
                {RM_LABEL[m]}
              </button>
            ))}
          </div>
          <div className="cl-prof-aut-hint">
            {rmPerson
              ? (rmPerson === "auto" ? "Answers this person automatically — set for them alone."
                : rmPerson === "ask" ? "Every message from this person waits for you before anything is sent."
                : "The receptionist stays out of their WhatsApp thread — their messages come straight to you, and it won't text them after a call. It still answers the phone.")
              : `Following the workspace setting${p.receptionistMode.workspace ? ` (${RM_LABEL[p.receptionistMode.workspace]})` : ""}.`}
            {!isOwner && " Only an owner can change this."}
          </div>
          {rmPerson && isOwner && (
            <button className="cl-bucket-link" disabled={rm.busy} onClick={() => setMode("inherit")}>
              Use the workspace setting <Icon name="arrow-right" size={10} />
            </button>
          )}
          {rm.error && <div className="cl-prof-aut-hint" style={{ color: "var(--danger)" }}>{rm.error}</div>}
        </div>
        <div className="cl-prof-rail-section" data-testid="consent-control">
          <div className="cl-prof-rail-label">Offers by WhatsApp</div>
          <div className="cl-prof-autonomy">
            {[["opted_in", "Yes"], ["unknown", "Not asked"], ["opted_out", "No"]].map(([s, label]) => (
              <button
                key={s}
                className={`cl-prof-aut-seg ${(cs.pick ? cs.pick === s : p.consent.state === s) ? "active" : ""}`}
                aria-pressed={p.consent.state === s}
                disabled={!canRecord || cs.busy}
                onClick={() => pickConsent(s)}
              >
                {label}
              </button>
            ))}
          </div>
          {cs.pick && (
            <div data-testid="consent-how">
              <div className="cl-prof-aut-hint">How did {first === "them" ? "they" : first} tell you?</div>
              <div className="cl-prof-autonomy" style={{ flexWrap: "wrap" }}>
                {CS_SOURCES.map((s) => (
                  <button key={s.id} className="cl-prof-aut-seg" disabled={cs.busy} onClick={() => recordConsent(cs.pick, s.id)}>{s.label}</button>
                ))}
              </div>
              <button className="cl-bucket-link" disabled={cs.busy} onClick={() => setCs({ busy: false, error: null, pick: null })}>Cancel</button>
            </div>
          )}
          <div className="cl-prof-aut-hint">
            {p.consent.state === "opted_in"
              ? `Yes — ${p.consent.sub}. Offers and news may go to them by WhatsApp.`
              : p.consent.state === "opted_out"
                ? (p.consent.source === "customer_message"
                    ? `${p.consent.sub}. Record a yes only if they have asked again themselves.`
                    : `No — ${p.consent.sub}. Nothing but replies to their own messages.`)
                : "No answer recorded. Reminders about their own appointments are fine; offers need their yes."}
            {!canRecord && " Only an owner or operator can change this."}
          </div>
          {cs.error && <div className="cl-prof-aut-hint" style={{ color: "var(--danger)" }}>{cs.error}</div>}
        </div>
        {isOwner && (
          <div className="cl-prof-rail-section">
            <div className="cl-prof-rail-label">Danger</div>
            {!del.open ? (
              <button className="btn btn-sm" style={{ color: "var(--danger)" }} onClick={() => setDel({ open: true, typed: "", busy: false, error: null })}>
                Delete this person…
              </button>
            ) : (
              <div data-testid="delete-confirm">
                <div className="cl-prof-aut-hint" style={{ marginBottom: 8 }}>
                  Removes their messages, media and recordings from Chanlytics and stops any reply still queued. This cannot be undone. Type <b>{p.name}</b> to confirm.
                </div>
                <div className="cl-search-wrap" style={{ marginBottom: 8 }}>
                  <input
                    value={del.typed}
                    onChange={(e) => setDel((d) => ({ ...d, typed: e.target.value }))}
                    placeholder={p.name}
                    aria-label="Type the name to confirm"
                    autoFocus
                  />
                </div>
                {del.error && <div className="cl-prof-aut-hint" style={{ color: "var(--danger)", marginBottom: 8 }}>{del.error}</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-sm" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} disabled={del.busy || !typedMatches} onClick={confirmDelete}>
                    {del.busy ? "Deleting…" : "Delete"}
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={del.busy} onClick={closeDelete}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {toastNode}
    </div>
  );
};

// A real workspace fetches the person; the seeded profile keeps the demo.
const ClientProfile = (props) => (window.__PEOPLE ? <ClientProfileReal {...props} /> : <ClientProfileSeed {...props} />);

window.ClientProfile = ClientProfile;
