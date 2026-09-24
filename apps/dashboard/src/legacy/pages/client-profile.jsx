/* global React, Icon, CLIENTS, ChannelGlyph, TempBar, ClientTag, MoreMenu, Confirm, EmptyState, FailedRead */
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
// Open lead referencing this client — the dupe loop's client-side door, and the
// mockup's alone: a real workspace's converted lead says where it came from on
// the profile itself ("A lead you found", people.ts came_from), and its leads
// live in the scope of People, never at an address of their own.
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
  const openLead = window.__DEMO_MODE ? cpLeadFor(c) : null;
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
                    <button className="chip" data-tip={openLead.dupe ? `${openLead.dupe.reason} — open the lead` : "This person also has an open lead — click to open it"} onClick={() => window.CHANLY.nav(window.CHANLY.R.lead(openLead.id))}>
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
            <div className="cl-prof-attr"><span className="cl-prof-attr-key">Staff</span><span className="cl-prof-attr-val">{c.therapist}</span></div>
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
                <button key={s.id} className="chip" data-tip={s.query} onClick={() => window.CHANLY.nav(window.CHANLY.R.segment(s.id))}>
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
// The name as the owner gives it. A number is what most people arrive as, so for
// a person with no name yet the control is the invitation ("Name them"), always
// visible; a person who has a name shows a quiet pencil beside it. The pencil
// used to show on hover alone, which a phone never has. Enter saves, Escape leaves.
const PersonName = ({ p, canEdit, flash }) => {
  const [editing, setEditing] = useStateP(false);
  const [value, setValue] = useStateP("");
  const [busy, setBusy] = useStateP(false);
  const open = () => { setValue(p.givenName || ""); setEditing(true); };
  const save = async () => {
    if (!window.__setPersonDetails || busy) return;
    const next = value.trim();
    if (next === (p.givenName || "")) { setEditing(false); return; }
    setBusy(true);
    const r = await window.__setPersonDetails(p.id, { name: next });
    setBusy(false);
    if (!r.ok) { flash({ tone: "danger", msg: <>{r.message || "Could not save the name."}</> }); return; }
    setEditing(false);
    flash({ msg: next ? <>Named <b>{next}</b></> : <>Name cleared — {p.phone ? "the number" : p.email ? "their email address" : "nothing"} shows again</> });
  };
  if (!editing) {
    const unnamed = !p.givenName;
    return (
      <div className="cl-prof-name-row">
        <h1 className="cl-prof-name">{p.name}</h1>
        {canEdit && (
          <button
            type="button"
            className={`cl-prof-rename ${unnamed ? "is-plain" : ""}`}
            title={unnamed ? "Give them a name" : "Rename"}
            aria-label={unnamed ? "Give them a name" : "Rename"}
            onClick={open}
            data-testid="person-rename"
          >
            <Icon name="edit" size={11} />
            {unnamed && <span className="cl-prof-rename-word">Name them</span>}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="cl-prof-name-row editing">
      <input
        className="cl-prof-name-input"
        autoFocus
        value={value}
        placeholder="Their name"
        maxLength={80}
        disabled={busy}
        aria-label="Their name"
        data-testid="person-name-input"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      />
      <span className="cl-prof-name-acts">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save} data-testid="person-name-save">{busy ? "Saving…" : "Save"}</button>
      </span>
    </div>
  );
};

// The person's email address, in the About list where the number is: said
// once, and changed where it is said. Someone who may change it sees the
// address with a quiet pencil, or "Add an email" when there is none; someone
// who may not sees the address, or no row at all. What is wrong with a typed
// address is said under the field before a round trip (whyNotAnEmail), and the
// door's own refusal -- another person here already has it -- is said there too.
const PersonEmail = ({ p, canEdit, flash }) => {
  const [editing, setEditing] = useStateP(false);
  const [value, setValue] = useStateP("");
  const [busy, setBusy] = useStateP(false);
  const [problem, setProblem] = useStateP(null);
  useEffectP(() => { setEditing(false); setProblem(null); }, [p.id, p.email]);
  const open = () => { setValue(p.email || ""); setProblem(null); setEditing(true); };
  const save = async () => {
    if (!window.__setPersonDetails || busy) return;
    const next = value.trim();
    if (next.toLowerCase() === (p.email || "")) { setEditing(false); return; }
    const why = next && window.__whyNotAnEmail ? window.__whyNotAnEmail(next) : null;
    if (why) { setProblem(why); return; }
    setBusy(true);
    const r = await window.__setPersonDetails(p.id, { email: next });
    setBusy(false);
    if (!r.ok) { setProblem(r.message || "Could not save the address."); return; }
    setEditing(false);
    flash({ msg: next ? <>Email address saved</> : <>Email address removed</> });
  };
  if (!editing) {
    return (
      <span className="cl-prof-email" data-testid="person-email">
        {p.email && <span className="cl-prof-email-val">{p.email}</span>}
        {canEdit && (
          <button
            type="button"
            className={`cl-prof-rename ${p.email ? "" : "is-plain"}`}
            title={p.email ? "Change the email address" : "Add an email address"}
            aria-label={p.email ? "Change the email address" : "Add an email address"}
            onClick={open}
            data-testid="person-email-edit"
          >
            <Icon name="edit" size={11} />
            {!p.email && <span className="cl-prof-rename-word">Add an email</span>}
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="cl-prof-email editing" data-testid="person-email">
      <input
        className="cl-prof-email-input"
        type="email"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        value={value}
        placeholder="name@example.com"
        maxLength={254}
        disabled={busy}
        aria-label="Their email address"
        aria-invalid={problem ? "true" : undefined}
        data-testid="person-email-input"
        onChange={(e) => { setValue(e.target.value); setProblem(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      />
      {problem && <span className="cl-prof-email-problem" role="alert" data-testid="person-email-problem">{problem}</span>}
      <span className="cl-prof-name-acts">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save} data-testid="person-email-save">{busy ? "Saving…" : "Save"}</button>
      </span>
    </span>
  );
};

// A person's notes (0007): each one dated and signed, newest first, the receptionist's suggestions above them until
// someone keeps or dismisses them. A member writes one, optionally for a teammate ("For Maria") and optionally for the
// team only (the receptionist never reads it); its author changes it; its author or an owner deletes it. A note may
// have a day (0007, amended): then it is a step, the team's only, with a Done box anyone who acts may tick, and done
// it says who did it and when. Every word is contracts' (NOTE_WORDS, personNotesVM, stepDays, through
// window.__personNotes); the page re-reads the person after a write.
const NOTE_FALLBACK_WORDS = {
  placeholder: "Add a note…", add: "Add note", save: "Save", cancel: "Cancel", edit: "Edit", remove: "Delete",
  askRemove: "Delete this note?", more: "More for this note", edited: "edited",
  forAnyone: "For anyone", forLabel: "For", teamOnly: "Team only", teamOnlyHint: "The receptionist won't read it",
  readsHint: "The receptionist uses notes as facts and never reads them aloud.", none: "No notes yet.",
  suggested: "Suggested by the receptionist", keep: "Keep", dismiss: "Dismiss", added: "Note added",
  saved: "Note saved", removed: "Note deleted", kept: "Kept", dismissed: "Dismissed",
  showAll: (n) => `Show all ${n}`, showFewer: "Show fewer", left: (n) => `${n} left`,
};
const NOTES_SHOWN = 3;

// Who a note is for and whether the receptionist reads it: the composer's and the editor's two controls, one shape.
const NoteAudience = ({ team, forId, teamOnly, onFor, onTeamOnly, disabled, W, lockTeam = false }) => (
  <span className="cl-prof-note-aud">
    {team.length > 1 && (
      <select
        className="cl-prof-note-for"
        value={forId || ""}
        disabled={disabled}
        aria-label={W.forLabel}
        data-testid="person-note-for"
        onChange={(e) => onFor(e.target.value || null)}
      >
        <option value="">{W.forAnyone}</option>
        {team.map((m) => <option key={m.id} value={m.id}>{`${W.forLabel} ${m.me ? "me" : m.name}`}</option>)}
      </select>
    )}
    <label className="cl-prof-note-team" title={lockTeam ? W.stepTeamOnly : W.teamOnlyHint}>
      <input type="checkbox" checked={!!teamOnly || lockTeam} disabled={disabled || lockTeam} onChange={(e) => onTeamOnly(e.target.checked)} data-testid="person-note-team-only" />
      <span>{W.teamOnly}</span>
    </label>
  </span>
);

// A note's day (0007, amended): with one, the note is a step, and the team's. The days are the picker's (contracts
// stepDays); Pick a day opens the date field, and the first choice takes the day away. Hookless.
const NoteDay = ({ day, picking, days, onDay, disabled, W }) => {
  const listed = !!day && days.some((c) => c.key === day);
  return (
    <span className="cl-prof-note-day">
      <select
        className="cl-prof-note-for"
        value={picking || (day && !listed) ? "pick" : day || ""}
        disabled={disabled}
        aria-label={W.due}
        data-testid="person-note-day"
        onChange={(e) => onDay(e.target.value === "pick" ? { picking: true, day } : { picking: false, day: e.target.value || null })}
      >
        <option value="">{day || picking ? W.noDay : W.addDay}</option>
        {days.map((c) => <option key={c.key} value={c.key} title={c.title}>{c.label}</option>)}
      </select>
      {picking || (day && !listed) ? (
        <input
          type="date"
          className="cl-prof-note-for cl-prof-note-date"
          value={day || ""}
          disabled={disabled}
          aria-label={W.pickDay}
          data-testid="person-note-date"
          onChange={(e) => onDay({ picking: true, day: e.target.value || null })}
        />
      ) : null}
    </span>
  );
};

const PersonNotes = ({ p, canEdit, isOwner, flash, onChanged }) => {
  const N = window.__personNotes || null;
  const W = (N && N.words) || NOTE_FALLBACK_WORDS;
  const MAX = (N && N.max) || 600;
  const notes = p.noteList || [];
  const team = p.noteTeam || [];
  const tz = window.__clock && window.__clock.zone ? window.__clock.zone() : "UTC";
  const days = N && N.days ? N.days(Date.now(), tz) : [];
  const stepping = !!(N && N.days && N.done);
  const EMPTY = { text: "", forId: null, teamOnly: false, day: null, picking: false };
  const [draft, setDraft] = useStateP(EMPTY);
  const [editing, setEditing] = useStateP(null);
  const [asking, setAsking] = useStateP(null);
  const [busy, setBusy] = useStateP(false);
  const [all, setAll] = useStateP(false);
  useEffectP(() => { setDraft(EMPTY); setEditing(null); setAsking(null); }, [p.id]);

  const run = async (fn, done, action = null) => {
    if (!N || busy) return false;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r || !r.ok) { flash({ tone: "danger", msg: <>{(r && r.message) || "Could not save this note."}</> }); return false; }
    flash({ msg: <>{done}</>, ...(action ? { action } : {}) });
    onChanged();
    return true;
  };
  const add = async () => {
    const text = draft.text.trim();
    // Pick a day with none picked yet: nothing is added, from the button or the keyboard, until one is.
    if (!text || (draft.picking && !draft.day)) return;
    const day = draft.day;
    const ok = await run(
      () => N.write(p.id, { body: text, for_user_id: draft.forId, team_only: draft.teamOnly || !!day, ...(day ? { due_on: day } : {}) }),
      day ? W.stepAdded : W.added,
    );
    if (ok) setDraft(EMPTY);
  };
  const saveEdit = async () => {
    const text = editing.text.trim();
    if (!text || (editing.picking && !editing.day)) return;
    const day = editing.day;
    const ok = await run(
      () => N.write(p.id, {
        body: text,
        for_user_id: editing.forId,
        team_only: editing.teamOnly || !!day,
        note_id: editing.id,
        version: editing.version,
        // A day kept or changed is sent; one taken away is cleared, and a note that never had one says nothing of it.
        ...(day ? { due_on: day } : editing.hadDay ? { clear_due: true } : {}),
      }),
      day ? W.stepSaved : W.saved,
    );
    if (ok) setEditing(null);
  };
  const remove = async (n) => {
    const ok = await run(() => N.remove(p.id, n.id), W.removed);
    if (ok) setAsking(null);
  };
  const decide = (n, keep) => run(() => N.decide(p.id, { note_id: n.id, keep }), keep ? W.kept : W.dismissed);
  // A step done, or open again, by anyone who acts. Done, the toast offers the next one, on the same deal.
  const toggleDone = (n) => {
    const done = !n.step.done;
    const next = done && window.openStepSheet ? { label: W.setTheNext, onClick: () => window.openStepSheet({ personId: p.id, dealId: n.dealId }) } : null;
    return run(() => N.done(p.id, n.id, done, n.version), done ? W.stepDone : W.stepReopened, next);
  };

  const waiting = notes.filter((n) => n.suggested);
  const kept = notes.filter((n) => !n.suggested);
  const shown = all ? kept : kept.slice(0, NOTES_SHOWN);
  const left = MAX - draft.text.length;

  const noteRow = (n) => {
    if (editing && editing.id === n.id) {
      return (
        <li key={n.id} className="cl-pnote is-editing" data-testid="person-note">
          <textarea
            className="cl-prof-note-input"
            value={editing.text}
            rows={3}
            maxLength={MAX}
            disabled={busy}
            aria-label={W.edit}
            data-testid="person-note-edit-input"
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }}
          />
          <div className="cl-prof-note-bar">
            <NoteAudience team={team} forId={editing.forId} teamOnly={editing.teamOnly} disabled={busy} W={W} lockTeam={!!editing.day}
              onFor={(forId) => setEditing({ ...editing, forId })} onTeamOnly={(teamOnly) => setEditing({ ...editing, teamOnly })} />
            {stepping ? <NoteDay day={editing.day} picking={editing.picking} days={days} disabled={busy} W={W} onDay={(d) => setEditing({ ...editing, ...d })} /> : null}
            <span className="cl-prof-name-acts">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(null)}>{W.cancel}</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || !editing.text.trim() || (editing.picking && !editing.day)} onClick={saveEdit} data-testid="person-note-save">{W.save}</button>
            </span>
          </div>
        </li>
      );
    }
    const mayRemove = canEdit && (n.mine || isOwner);
    const acts = [
      ...(canEdit && n.mine ? [{ label: W.edit, icon: "edit", onClick: () => {
        const day = n.step ? n.step.day.day : null;
        setEditing({ id: n.id, text: n.body, forId: n.forUserId, teamOnly: n.teamOnly, version: n.version, day, hadDay: !!day, picking: !!day && !days.some((c) => c.key === day) });
      } }] : []),
      ...(mayRemove ? [{ label: W.remove, icon: "x", danger: true, onClick: () => setAsking(n.id) }] : []),
    ];
    return (
      <li key={n.id} className={`cl-pnote${n.forMe ? " is-for-me" : ""}${n.step ? " is-step" : ""}${n.step && n.step.done ? " is-done" : ""}`} data-testid="person-note">
        {n.step ? (
          <div className="cl-prof-note-step">
            {canEdit && stepping ? (
              <label className="cl-prof-note-done-hit">
                <input
                  type="checkbox"
                  className="cl-prof-note-done"
                  checked={n.step.done}
                  disabled={busy}
                  aria-label={n.step.done ? `${W.undo}: ${n.body}` : `${W.done}: ${n.body}`}
                  onChange={() => toggleDone(n)}
                  data-testid="person-note-done"
                />
              </label>
            ) : null}
            <div className="cl-prof-note-body">{n.body}</div>
          </div>
        ) : (
          <div className="cl-prof-note-body">{n.body}</div>
        )}
        <div className="cl-prof-note-meta">
          {n.step ? (
            <span className="cl-prof-note-due" data-due={n.step.done ? "done" : n.step.due} data-testid="person-note-due">
              {n.step.done ? n.step.doneWords : n.step.words}
            </span>
          ) : null}
          <span className="cl-prof-note-who">{n.who}</span>
          <span title={n.whenFull}>{n.when}</span>
          {n.edited && <span>{W.edited}</span>}
          {n.forWho && <span className="cl-prof-note-for-who">{n.forWho}</span>}
          {n.teamOnly && !n.step && <span className="cl-prof-note-lock" title={W.teamOnlyHint}><Icon name="lock" size={10} /> {W.teamOnly}</span>}
          {acts.length > 0 && asking !== n.id && (
            <span className="cl-prof-note-more">
              <MoreMenu items={acts} title={W.more} size={12} escape btnClass="btn btn-ghost btn-icon btn-sm" />
            </span>
          )}
        </div>
        {asking === n.id && (
          <div className="cl-prof-note-ask" role="alert">
            <span>{W.askRemove}</span>
            <span className="cl-prof-name-acts">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setAsking(null)}>{W.cancel}</button>
              <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => remove(n)} data-testid="person-note-remove">{W.remove}</button>
            </span>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="cl-prof-notes" data-testid="person-notes">
      {canEdit && N && (
        <div className={`cl-prof-note-compose${draft.text ? " is-open" : ""}`}>
          <textarea
            className="cl-prof-note-input"
            value={draft.text}
            rows={draft.text ? 3 : 1}
            maxLength={MAX}
            disabled={busy}
            placeholder={W.placeholder}
            aria-label={W.placeholder}
            data-testid="person-notes-input"
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add(); }}
          />
          {draft.text && (
            <div className="cl-prof-note-bar">
              <NoteAudience team={team} forId={draft.forId} teamOnly={draft.teamOnly} disabled={busy} W={W} lockTeam={!!draft.day}
                onFor={(forId) => setDraft({ ...draft, forId })} onTeamOnly={(teamOnly) => setDraft({ ...draft, teamOnly })} />
              {stepping ? <NoteDay day={draft.day} picking={draft.picking} days={days} disabled={busy} W={W} onDay={(d) => setDraft({ ...draft, ...d })} /> : null}
              <span className="cl-prof-name-acts">
                {left < 60 && <span className="cl-prof-aut-hint">{W.left(left)}</span>}
                <button type="button" className="btn btn-sm btn-primary" disabled={busy || !draft.text.trim() || (draft.picking && !draft.day)} onClick={add} data-testid="person-notes-save">{W.add}</button>
              </span>
            </div>
          )}
        </div>
      )}
      {waiting.length > 0 && (
        <ul className="cl-prof-note-list">
          {waiting.map((n) => (
            <li key={n.id} className="cl-pnote is-suggested" data-testid="person-note-suggested">
              <div className="cl-prof-note-meta">
                <span className="cl-prof-note-who"><Icon name="sparkle" size={10} /> {W.suggested}</span>
                {n.from && <span>{n.from}</span>}
                <span title={n.whenFull}>{n.when}</span>
              </div>
              <div className="cl-prof-note-body">{n.body}</div>
              {canEdit && (
                <div className="cl-prof-note-decide">
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => decide(n, true)} data-testid="person-note-keep">{W.keep}</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => decide(n, false)} data-testid="person-note-dismiss">{W.dismiss}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {kept.length > 0
        ? <ul className="cl-prof-note-list">{shown.map(noteRow)}</ul>
        : waiting.length === 0 && !canEdit && <div className="cl-prof-aut-hint">{W.none}</div>}
      {kept.length > NOTES_SHOWN && (
        <button type="button" className="cl-bucket-link cl-prof-note-all" onClick={(e) => (window.holdStill ? window.holdStill(e && e.currentTarget, () => setAll(!all)) : setAll(!all))} data-testid="person-notes-all">
          {all ? W.showFewer : W.showAll(kept.length)}
        </button>
      )}
      <div className="cl-prof-aut-hint cl-prof-note-rule">{W.readsHint}</div>
    </div>
  );
};

// The person's saved lists, read from the People surface; a change goes
// through window.__lists and the surface is re-fetched, so the chips are the
// server's. Owner or operator may change them.
const PersonLists = ({ personId, canEdit, first, flash, smart = [] }) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  useEffectP(() => {
    window.addEventListener("surface:clients", bump);
    return () => window.removeEventListener("surface:clients", bump);
  }, []);
  const [busy, setBusy] = useStateP(false);
  const saved = (window.__PEOPLE && window.__PEOPLE.saved) || [];
  const on = saved.filter((s) => s.ids.includes(personId));
  // A smart list's rule says who is on it: it is shown when it holds for them, and never offered to put them on.
  const off = saved.filter((s) => s.byHand && !s.ids.includes(personId));
  const who = first === "them" ? "This person" : first;
  const change = async (fn, msg) => {
    if (!window.__lists || busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { flash({ tone: "danger", msg: <>{r.message || "Could not change the list."}</> }); return; }
    flash({ msg });
  };
  // Not read yet is not "no lists": a profile opened straight from a link reads People after the person, and says so
  // until it lands (surface:clients redraws this).
  if (!window.__PEOPLE) {
    return <div className="cl-prof-aut-hint" role="status" aria-busy="true" data-testid="person-lists-reading">Reading…</div>;
  }
  // Lists that could not be read are not "no lists": the read failed, and the rest of the profile stands.
  if (window.__PEOPLE.savedRead === false) {
    return <FailedRead kind="line" what="their lists" surface="people" testid="person-lists-failed" />;
  }
  // The lists that keep themselves current and have them on today (contracts PersonVM.smartLists): each opens on People.
  // No cross: nobody is taken off a list that is a rule. A list is a name, not a state: the one chip, in no tone.
  const smartChips = smart.map((l) => (
    <span key={l.id} className="chip chip-wrap" data-testid="person-smart-chip">
      <button type="button" onClick={() => window.CHANLY.nav(window.CHANLY.R.clientSeg(l.id))} title={`${l.label} keeps itself current — open it on People`}>{l.label}</button>
    </span>
  ));
  if (saved.length === 0) {
    // "The People rail" is not on a phone; the Lists page is, from here.
    // The lists live on People: the door lands there with the New list box open (clients/new-list, app-shell.jsx).
    return (
      <div className="cl-prof-lists">
        {smartChips.length > 0 && <div className="cl-tag-stack cl-prof-list-chips">{smartChips}</div>}
        <div className="cl-prof-aut-hint">
          {smartChips.length > 0 ? "No lists of your own yet." : "No lists yet."}{" "}
          <button type="button" className="cl-bucket-link" onClick={() => window.CHANLY.nav("clients/new-list")} data-testid="person-lists-make">Make one on People <Icon name="arrow-right" size={10} /></button>
        </div>
      </div>
    );
  }
  return (
    <div className="cl-prof-lists">
      <div className="cl-tag-stack cl-prof-list-chips">
        {smartChips}
        {on.map((s) => (
          <span key={s.id} className="chip chip-wrap" data-testid="person-list-chip">
            <button type="button" onClick={() => window.CHANLY.nav(`clients/list:${s.id}`)} title={`Open ${s.name} on People`} data-testid="person-list-open">{s.name}</button>
            {canEdit && s.byHand && (
              <button
                type="button"
                className="chip-x"
                title={`Take ${who} off ${s.name}`}
                aria-label={`Take ${who} off ${s.name}`}
                disabled={busy}
                onClick={() => change(() => window.__lists.drop(s.id, [personId]), <><b>{who}</b> is off <b>{s.name}</b></>)}
              >
                <Icon name="x" size={9} />
              </button>
            )}
          </span>
        ))}
        {on.length === 0 && smartChips.length === 0 && <span className="cl-prof-aut-hint">On no list yet.</span>}
      </div>
      {/* A quiet link under the chips, as "Add an email" is, not a button among them. Its menu escapes the card
          (MoreMenu escape): the card clips what crosses its rounded edge, and the menu opened cut off at its foot. It
          hangs from the link's left edge, and above it where the window has more room there. */}
      {canEdit && off.length > 0 && (
        <MoreMenu
          btnClass="cl-prof-rename is-plain cl-prof-list-add"
          label={<><Icon name="plus" size={11} /> Add to a list</>}
          title="Add to a list"
          align="left"
          escape
          testid="person-list-add"
          items={[
            ...off.map((s) => ({
              label: s.name,
              icon: "filter",
              onClick: () => change(() => window.__lists.add(s.id, [personId]), <><b>{who}</b> is on <b>{s.name}</b></>),
            })),
          ]}
        />
      )}
    </div>
  );
};

// Fetched on open through the bridge courier (window.__personDetail): every
// message, call, escalation and operator decision for this contact, mapped in
// contracts where the rule is tested. The frame is the seeded profile's; the
// six money cells became six measured facts, the agent queue became what the
// receptionist is doing right now, and the timeline is the record itself.

// Newer than this many rows waits behind one press. The Inbox is the whole thread; a profile that drew a
// year of messages ran to five screens on a phone, with everything the owner can write underneath.
const TL_CAP = 20;

// The timeline narrows by kind (contracts TIMELINE_FILTERS, through the bridge's window.__timeline): All, then
// only the kinds this person's record holds. The choice is the page's, so this stays a plain function of its
// props. A filter holds still (data-bits holdStill): on a phone, where History ends the page, a shorter list made
// the page shorter and the strip jumped from under the thumb, 439px for Visits. A row that has somewhere to go IS the door -- the whole row, as a link, with the time as plain text.
// Every message row used to hide its door in the time itself (a button that looked like a timestamp, underlined
// on hover only), and on a touch screen the 44px floor on every button made each of those timestamps a 44px
// line, so every row wore 27px of air.
const PersonTimeline = ({ items, initials, filter = "all", onFilter = null, showAll = false, onShowAll = null }) => {
  let lastDay = null;
  const kit = window.__timeline;
  const shown = kit ? kit.filter(items, filter) : items;
  const offered = kit && onFilter ? kit.filters.filter((f) => f.id === "all" || items.some((i) => (f.kinds || []).includes(i.kind))) : [];
  // A fold of three rows is not worth a press.
  const visible = showAll || shown.length <= TL_CAP + 3 ? shown : shown.slice(0, TL_CAP);
  const older = shown.length - visible.length;
  // A row's door is the app's one link (data-bits routeDoor): its hash route in the href, so a new tab or a long press
  // opens it, and the app's own way there on a plain press. NOT window.__href: that is the bridge's API URL builder
  // ("GET contacts/export" → a route table → `.path`), and handed a route it threw, and the whole pane with it.
  return (
    <>
      {offered.length > 2 && (
        <div className="cl-tabs cl-tl-filters" role="group" aria-label="Show on the timeline">
          {offered.map((f) => (
            <button key={f.id} type="button" className={`cl-tab ${filter === f.id ? "active" : ""}`} aria-pressed={filter === f.id} onClick={(e) => (window.holdStill ? window.holdStill(e && e.currentTarget, () => onFilter(f.id)) : onFilter(f.id))} data-testid={`timeline-filter-${f.id}`}>{f.label}</button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState kind="line" className="empty-center" title="Nothing recorded yet." />
      ) : (
        <div className="cl-prof-timeline">
          {visible.map((e) => {
            // The day sits above the rail line, on the page's own ground: the line ran through "TODAY".
            const dayHead = e.day !== lastDay ? <div className="cl-tl-day">{e.day}</div> : null;
            lastDay = e.day;
            const markClass = e.kind === "customer" ? "client" : e.kind === "receptionist" || e.kind === "you" ? "agent" : e.kind === "call" || e.kind === "visit" ? "session" : "event";
            const mark =
              e.kind === "customer" ? initials
              : e.kind === "receptionist" ? <Icon name="sparkle" size={12} />
              : e.kind === "you" ? "You"
              : e.kind === "call" ? <Icon name="phone" size={12} />
              : e.kind === "visit" ? <Icon name="calendar" size={12} />
              : e.kind === "deal" ? <Icon name="deal" size={12} />
              : e.kind === "escalation" ? <Icon name="alert" size={11} />
              : e.kind === "consent" ? <Icon name="shield" size={11} />
              : <Icon name="dot" size={10} />;
            const body = (
              <>
                <div className={`cl-tl-mark ${markClass}`}>{mark}</div>
                <div className="cl-tl-body">
                  <div className="cl-tl-head">
                    <span className="cl-tl-who">{e.who}</span>
                    <span className="cl-tl-time">{e.time}</span>
                  </div>
                  <div className={`cl-tl-text ${e.kind === "customer" ? "" : "muted"}`}>{e.text}</div>
                  {e.sub && <div className="cl-tl-sub">{e.sub}</div>}
                </div>
                {e.link && <span className="cl-tl-go" aria-hidden="true"><Icon name="arrow-right" size={11} /></span>}
              </>
            );
            return (
              <React.Fragment key={e.id}>
                {dayHead}
                {e.link ? (
                  <a className="cl-tl-row cl-tl-row-door" {...window.routeDoor(e.link.to)} title={e.link.label} data-testid="timeline-open">{body}</a>
                ) : (
                  <div className="cl-tl-row">{body}</div>
                )}
              </React.Fragment>
            );
          })}
          {older > 0 && (
            <button type="button" className="cl-bucket-link cl-tl-older" onClick={onShowAll} data-testid="timeline-older">
              Show {older} older <Icon name="chevron-down" size={10} />
            </button>
          )}
        </div>
      )}
    </>
  );
};

/**
 * ONE of the two consent questions: three buttons, then "how did they tell you?",
 * then a line saying what is on record.
 *
 * It is a component because there are two of these now and they must look
 * identical — the carriers' requirement (error 30913) is that a person can give
 * one and not the other, and a reader can only see that if the two asks are
 * plainly the same kind of control. The /yes page renders the same pair from
 * `consentPageVM().asks`; this is the desk-side equivalent for an answer given in
 * person, on the phone, or on a signed form.
 *
 * Its own `pick` state, so arming one ask never arms the other. An armed button
 * is drawn as armed (dashed), never as the answer on record: nothing is written
 * until the how is chosen, and `aria-pressed` follows the record alone.
 *
 * A spoken way is written the moment it is chosen. A written way first names its
 * evidence (00137): "their own message" is one of the messages they sent, chosen
 * from `messages` (contracts ownMessagesOf), and a sign-up form carries a note
 * saying which form, or where they wrote when it was somewhere Chanlytics does
 * not see.
 */
// `yesSources` narrows the ways a YES may have been given, for the ask that has to
// be written (offers); a no keeps every source, because a no is honoured however
// it is said. `why` is the explanation a reader may want and never needs in the
// way: one line behind a tap. `lockedNote` is appended when the ask is locked; the
// page passes null and says the role once for the whole rail.
const ConsentAsk = ({ label, value, sources, yesSources, yesHow, canRecord, hint, why = null, onRecord, testid, lockedNote = "Only an owner or operator can change this.", messages = [], bare = false }) => {
  // `way` is a written way waiting for its evidence: the message, or the form's note.
  const [st, setSt] = useStateP({ busy: false, error: null, pick: null, way: null, note: "" });
  const pick = (state) => {
    if (state === "unknown") {
      // "Not asked" is a reset and needs no source, so it is written straight
      // away — and only when it would change something.
      if (value !== "unknown") record("unknown", null);
      return;
    }
    setSt((c) => ({ ...c, pick: c.pick === state ? null : state, way: null, note: "", error: null }));
  };
  const record = async (consent, source, evidence = null) => {
    if (st.busy) return;
    setSt({ busy: true, error: null, pick: null, way: null, note: "" });
    const r = await onRecord(consent, source, evidence);
    if (!r || !r.ok) { setSt({ busy: false, error: (r && r.message) || "Could not record this.", pick: null, way: null, note: "" }); return; }
    setSt({ busy: false, error: null, pick: null, way: null, note: "" });
  };
  const choose = (source) => {
    if (source === "customer_message" || source === "form") { setSt((c) => ({ ...c, way: source, error: null })); return; }
    record(st.pick, source);
  };
  const note = st.note.trim();
  const recordForm = () => { if (note) record(st.pick, "form", { note }); };
  const close = () => setSt({ busy: false, error: null, pick: null, way: null, note: "" });
  return (
    <div className={bare ? "cl-prof-consent" : "cl-prof-rail-section"} data-testid={testid}>
      {bare ? null : <div className="cl-prof-rail-label">{label}</div>}
      <div className="cl-prof-autonomy" role="group" aria-label={label}>
        {[["opted_in", "Yes"], ["unknown", "Not asked"], ["opted_out", "No"]].map(([sv, text]) => (
          <button
            key={sv}
            type="button"
            className={`cl-prof-aut-seg ${value === sv ? "active" : ""} ${st.pick === sv ? "armed" : ""}`}
            aria-pressed={value === sv}
            disabled={!canRecord || st.busy}
            onClick={() => pick(sv)}
          >
            {text}
          </button>
        ))}
      </div>
      {st.pick && (
        <div className="cl-prof-how" data-testid={`${testid}-how`}>
          {st.way === "customer_message" ? (
            <>
              <div className="cl-prof-aut-hint">Which message? Choose the one where they said it.</div>
              {messages.length > 0 ? (
                <div className="cl-prof-msgs" role="group" aria-label="Their messages">
                  {messages.map((m) => (
                    <button key={m.id} type="button" className="cl-prof-msg" disabled={st.busy} onClick={() => record(st.pick, "customer_message", { message_id: m.id })} data-testid={`${testid}-message`}>
                      <span className="cl-prof-msg-words">“{m.words}”</span>
                      <span className="cl-prof-msg-meta">{m.via ? `${m.via} · ` : ""}{m.when}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="cl-prof-aut-hint">Nothing they've written to you is here to choose.</div>
              )}
              <div className="cl-prof-aut-hint" data-testid={`${testid}-elsewhere`}>
                Wrote to you somewhere Chanlytics doesn't see?{" "}
                <button type="button" className="cl-bucket-link" disabled={st.busy} onClick={() => setSt((c) => ({ ...c, way: "form", error: null }))}>Record a sign-up form</button>
                {" "}and say where in the note.
              </div>
              <div className="cl-prof-how-chips">
                <button type="button" className="cl-bucket-link" disabled={st.busy} onClick={close}>Cancel</button>
              </div>
            </>
          ) : st.way === "form" ? (
            <>
              <div className="cl-prof-aut-hint">Which form, or where did they write to you? The note is kept with their answer.</div>
              <div className="cl-prof-note">
                <input
                  autoFocus
                  value={st.note}
                  maxLength={200}
                  placeholder="Slip 12, or on Instagram"
                  aria-label="Which form, or where they wrote to you"
                  disabled={st.busy}
                  data-testid={`${testid}-note`}
                  onChange={(e) => setSt((c) => ({ ...c, note: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") recordForm(); if (e.key === "Escape") close(); }}
                />
                <button type="button" className="btn btn-sm btn-primary" disabled={st.busy || !note} onClick={recordForm} data-testid={`${testid}-note-save`}>Record</button>
                <button type="button" className="cl-bucket-link" disabled={st.busy} onClick={close}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="cl-prof-aut-hint">{st.pick === "opted_in" && yesHow ? yesHow : "How did they tell you?"}</div>
              <div className="cl-prof-how-chips">
                {(st.pick === "opted_in" && yesSources ? yesSources : sources).map((so) => (
                  <button key={so.id} type="button" className="cl-prof-how-chip" disabled={st.busy} onClick={() => choose(so.id)}>{so.label}</button>
                ))}
                <button type="button" className="cl-bucket-link" disabled={st.busy} onClick={close}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="cl-prof-aut-hint">
        {hint}
        {!canRecord && lockedNote ? ` ${lockedNote}` : ""}
      </div>
      {why && (
        <details className="cl-prof-why">
          <summary>{why.label} <Icon name="chevron-down" size={10} /></summary>
          <div className="cl-prof-aut-hint">{why.text}</div>
        </details>
      )}
      <window.FieldError message={st.error} testid={testid ? `${testid}-error` : null} />
    </div>
  );
};

// The frame around a page that has no person to draw yet (loading, missing, a
// failed read): the same hero, with no rail column -- the two-column grid drew an
// empty 320px column and a stray hairline beside "Loading…".
const PersonProfileFrame = ({ onBack, children }) => (
  <div className="cl-profile cl-profile--solo">
    <div className="cl-prof-page">
      <div className="cl-prof-hero">
        <button type="button" className="cl-prof-back" onClick={onBack} aria-label="Back to People">
          <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} />
          <span className="cl-prof-back-word">People</span>
        </button>
        {children}
      </div>
    </div>
  </div>
);

// Where the record kit is not loaded (a unit harness that draws this page alone): folds that never open, drawn closed.
const PERSON_NO_FOLD = { open: false, request: () => {}, close: () => {} };

const ClientProfileReal = ({ id, onBack = () => {} }) => {
  // The person this tab already holds is the FIRST draw, not the second: seeded in the effect below, a reload painted
  // one frame of the head alone before the page it already had (people-detail.ts keeps them in the tab).
  const [st, setSt] = useStateP(() => ({
    loading: true,
    vm: window.__peekPerson ? window.__peekPerson(id) : null,
    missing: false,
    error: null,
  }));
  const [toastNode, ppFlash] = window.usePPToast();
  // "Delete this person" is a typed-name confirmation, not a click: it erases
  // messages, media and recordings and cannot be undone. The one Confirm
  // draws it; the typed text and the match stay here, with the record.
  const [del, setDel] = useStateP({ open: false, typed: "", busy: false, error: null });
  const [rm, setRm] = useStateP({ busy: false, error: null });
  // What the timeline shows, and whether the fold is open; the timeline itself stays a plain function of its props.
  const [tlFilter, setTlFilter] = useStateP("all");
  const [tlAll, setTlAll] = useStateP(false);
  // The card's editors (the record kit's folds): one open at a time, anywhere in the app, and a sheet on a phone.
  const foldOf = (fid) => (window.useRecordFold ? window.useRecordFold(fid) : PERSON_NO_FOLD);
  const rmFold = foldOf("person-receptionist");
  const visitFold = foldOf("person-visit");
  const offersFold = foldOf("person-offers");
  const load = React.useCallback(() => {
    if (!window.__personDetail) return;
    // Held from the last time this tab opened them, so going back to the list
    // and in again does not put "Loading..." over a page that is already known.
    const held = window.__peekPerson ? window.__peekPerson(id) : null;
    setSt((s) => (held && !s.vm ? { loading: true, vm: held, missing: false, error: null } : { ...s, loading: !s.vm, error: null }));
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
  // A deal recorded or moved in the sheet (components/deal-sheet.jsx), from here or from their thread, and a step
  // set, changed or done from the step sheet or the deal card (components/step-sheet.jsx): read them again.
  useEffectP(() => {
    const onDeal = (e) => { if (e && e.detail && e.detail.personId === id) load(); };
    window.addEventListener("deal:recorded", onDeal);
    window.addEventListener("note:saved", onDeal);
    return () => {
      window.removeEventListener("deal:recorded", onDeal);
      window.removeEventListener("note:saved", onDeal);
    };
  }, [id, load]);

  const { vm, loading, missing, error } = st;
  if (missing) return (
    <PersonProfileFrame onBack={onBack}>
      <EmptyState kind="page" glyph="user" title="This person is not in your workspace" body="They may have been deleted." />
    </PersonProfileFrame>
  );
  if (!vm) {
    // A person the tab does not hold yet is nothing of theirs until their whole page is in: the pane the shell draws for
    // any page on its way, `Reading…` after the standard's beat, and then the page, all of it at once. It opened on their
    // People row's name and number first, and the rest landed a moment later under it (Ruben, 24 Sep: "the header part
    // still loads first for a split second"). People and the Pipeline read the people on screen ahead
    // (people-detail.ts warmPeople), and every door to a person reads them as it is reached, so most opens are held.
    if (loading) return <div className="route-reading" aria-busy="true" role="status" data-testid="person-reading">Reading…</div>;
    return (
      <PersonProfileFrame onBack={onBack}>
        <FailedRead kind="card" what="this person" why={error} onRetry={load} testid="person-failed" />
      </PersonProfileFrame>
    );
  }

  const p = vm;
  // Where the proposal follow-up has them in hand (0006), their People row says so: the deal card then says when its
  // run goes, and leads with no nudge of its own. People unread, the card says what it said.
  const peopleRow = window.__PEOPLE && window.__PEOPLE.rows ? window.__PEOPLE.rows.find((r) => r.id === id) : null;
  const dealP = peopleRow && peopleRow.followUp ? { ...p, followUp: peopleRow.followUp } : p;
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
  // Contracts' words (PERSON_MODE_WORDS, through the chrome bridge): the ones the bulk menu and a pill say.
  const rmWord = (m) => (window.__chrome && window.__chrome.state ? window.__chrome.state("mode", m).label : m);
  const rmPerson = p.receptionistMode.person;
  const rmEffective = rmPerson || p.receptionistMode.workspace;
  const setMode = async (mode) => {
    if (!window.__setPersonReceptionist || rm.busy) return;
    setRm({ busy: true, error: null });
    const r = await window.__setPersonReceptionist(p.id, mode);
    if (!r.ok) { setRm({ busy: false, error: r.message || "Could not change this." }); return; }
    setRm({ busy: false, error: null });
    rmFold.close();
    ppFlash({
      msg: mode === "inherit"
        ? <><b>{first === "them" ? "This person" : first}</b> follows the workspace again</>
        : <>Receptionist for <b>{first === "them" ? "this person" : first}</b>: {rmWord(mode)}</>,
    });
    load();
  };
  // The customer's two answers, recorded by whoever heard them. A yes or a no is
  // not written until the page knows how it was given; "not asked" is a reset and
  // needs no source.
  const CS_SOURCES = window.__consentSources || [
    { id: "in_person", label: "In person" }, { id: "phone", label: "On the phone" },
    { id: "form", label: "Sign-up form" }, { id: "customer_message", label: "Their own message" },
  ];
  // A yes to OFFERS is written or it is not recorded (00100): a sign-up form they
  // signed, or their own message. The fallback is the same rule, for a page opened
  // before the bridge installs it.
  const OFFERS_YES = window.__offersYesSources || CS_SOURCES.filter((s) => s.id === "form" || s.id === "customer_message");
  // What to ask when the yes is spoken. The campaign files this sentence as the
  // way a yes is given in person or on the phone (contracts verbalOptInScript),
  // so the desk is shown the same words a reviewer reads; without the bridge
  // the prompt stays the plain one.
  const ws = (window.__WORKSPACES || []).find((w) => w.id === window.__ACTIVE_WORKSPACE) || null;
  const askScript = typeof window.__verbalOptInScript === "function" ? window.__verbalOptInScript((ws && ws.name) || "") : null;
  // One recorder per door. Both reload the person afterwards rather than assuming,
  // because the lists and the Consent column are computed from the row. A written
  // way carries its evidence: the message they sent, or the form's note.
  const recordFor = (purpose) => async (consent, source, evidence) => {
    const send = purpose === "marketing" ? window.__setPersonMarketingConsent : window.__setPersonConsent;
    if (!send) return { ok: false, message: "That cannot be recorded here." };
    const r = await send(p.id, source ? { consent, source, ...evidence } : { consent });
    if (!r.ok) return r;
    ppFlash({
      msg: purpose === "marketing"
        ? (consent === "opted_in" ? <><b>{who}</b> said yes to offers and news</>
          : consent === "opted_out" ? <><b>{who}</b> said no to offers — messages about their own visit still reach them</>
          : <><b>{who}</b> has not been asked about offers</>)
        : (consent === "opted_in" ? <><b>{who}</b> said yes to messages about their visit</>
          : consent === "opted_out" ? <><b>{who}</b> said stop — nothing goes out to them at all</>
          : <><b>{who}</b> is back to "not asked"</>),
    });
    load();
    return r;
  };
  // An answer recorded from its fold closes the fold, and its row says the answer.
  const recordAndClose = (purpose, fold) => async (consent, source, evidence) => {
    const r = await recordFor(purpose)(consent, source, evidence);
    if (r && r.ok) fold.close();
    return r;
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
  // Nobody is called "+1": a person known only by number is "them" in copy,
  // and the line under their name does not say the number twice.
  const phoneOnly = /^[+\d(]/.test(p.name);
  const first = phoneOnly ? "them" : p.name.split(" ")[0];
  // After `first`, not above it. The recorders above read `who` only when a button
  // is pressed, but it was DECLARED above `first` itself -- a const read before its
  // line runs -- so every real profile threw the moment its person loaded (#313).
  const who = first === "them" ? "This person" : first;
  // The one line under the name: their channels, their number (unless the number is their name) and since when.
  // The contract's words (contracts PERSON_CHANNEL_WORDS). This line made its own
  // two-way copy -- WhatsApp, else "Phone" -- so an email-only person was
  // introduced as "Phone since Sep 17".
  const channelWords = p.channelWords;
  const sinceWords = p.since ? p.since.charAt(0).toLowerCase() + p.since.slice(1) : "";
  // Each part keeps its words together, so a narrow screen breaks the line between parts, never inside "Sep 3".
  const idLine = [channelWords, phoneOnly ? null : p.phone, sinceWords].filter(Boolean);
  // The action lives in Right now, beside what needs doing. Its own button is the thread in every state that
  // has one, except a person who opted out: the header's Open thread was their only way in, so it falls back to it.
  const threadCta = p.rightNow.cta || (p.openThread ? { label: "Open the thread", to: p.openThread } : null);
  // About holds what the line under the name does not. The six-cell strip that sat above Right now said first
  // contact, the channels, the counts and the next visit again, beside a rail that said them too; its counts and
  // its day door move here. History leads, whatever else the row holds. The proposal is the deal's (0008): its link,
  // whether it went and the day it stands until are the Deal section's, said once, there.
  const said = new Set(["Phone", "Channels", "First contact", "Proposal"]);
  const count = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;
  // Ten seconds on the phone is not "1 min".
  const callTime = p.callSeconds >= 60 ? `${Math.round(p.callSeconds / 60)} min` : `${p.callSeconds} s`;
  const history = {
    k: "History",
    v: `${count(p.threads, "conversation")}${p.escalations ? `, ${p.escalations} needed you` : ""} · ${count(p.calls, "call")}${p.calls ? `, ${callTime}` : ""}`,
  };
  // The address is the one About fact that is changed here, so its row is its
  // control (PersonEmail). Someone who may change it gets the row even when it
  // is empty, because that row is where an address is added; someone who may
  // not gets it only when there is one.
  const aboutFacts = p.about.filter((a) => !said.has(a.k));
  if (canRecord && !aboutFacts.some((a) => a.k === "Email")) aboutFacts.unshift({ k: "Email", v: "" });
  const aboutRows = [history, ...aboutFacts];
  // The role, said once for the rail: every locked control used to say it again under itself.
  const roleNote = !canRecord ? "You can read this page; an owner or operator changes it." : null;
  // The page's one primary act is their thread. Everything else it can do for them is the More menu: which acts, their
  // words and who may press them are contracts' (personActs); the page keeps what its reader's role allows and does them.
  // A send opens their thread with the words ready; nothing is sent from here. It was a button of its own, "Send the
  // booking-link template", beside a thread button that went to the same place. A send with no words (the deal card's,
  // where only an approved message can go) opens the thread and leaves its box alone: the thread offers those.
  const openWith = (text) => {
    if (text) {
      try { sessionStorage.setItem("chanlytics-compose", JSON.stringify({ threadId: p.openThread.replace(/^inbox\//, ""), text })); } catch { /* nothing to carry */ }
    }
    window.CHANLY.nav(p.openThread);
  };
  const copyOut = (text, what) => {
    try { if (navigator.clipboard) navigator.clipboard.writeText(text); } catch { /* a browser that will not */ }
    ppFlash({ msg: <>Copied {what} <b>{text}</b></> });
  };
  const doAct = {
    booking: () => (p.bookingLinkAction.ready ? openWith(`Here's the link to book your appointment: ${p.bookingLink}`) : window.CHANLY.nav(p.openThread)),
    proposal: () => openWith(window.__proposalMessage(p.proposal.url)),
    // The member's own phone rings them, as a lead is called; never the receptionist.
    call: () => { window.location.href = `tel:${String(p.phone || "").replace(/[^\d+]/g, "")}`; },
    "copy-phone": () => copyOut(p.phone, "the number"),
    "copy-email": () => copyOut(p.email, "the email"),
    delete: () => setDel({ open: true, typed: "", busy: false, error: null }),
  };
  const ACT_ICON = { booking: "calendar", proposal: "send", call: "phone", "copy-phone": "copy", "copy-email": "mail", delete: "x" };
  const acts = (p.acts || []).filter((a) => a.needs === "any" || (a.needs === "record" ? canRecord : isOwner));
  // A few words each, a line between the groups, and what an act does on hover: a sentence beside every label was a
  // block of wrapped words cut off at the menu's edge.
  const more = acts.flatMap((a, i) => [
    ...(i > 0 && acts[i - 1].group !== a.group ? [{ divider: true }] : []),
    { label: a.label, title: a.hint || undefined, icon: ACT_ICON[a.id], danger: !!a.danger, onClick: doAct[a.id] },
  ]);
  // Their visits ahead are Coming up, above what has happened: the calendar's future sat at the top of the timeline,
  // over the conversation it followed.
  const comingUp = p.comingUp || [];
  const past = p.timeline.filter((t) => !t.ahead);
  // The card's three rows, each drawn at rest and, while its editor is a sheet on a phone, behind it.
  const rmRow = window.RecordRow ? (
    <window.RecordRow
      id="person-receptionist"
      label="Receptionist"
      value={rmWord(rmEffective)}
      source={rmPerson ? null : "workspace"}
      act={isOwner ? { label: "Change", onClick: rmFold.request } : null}
    />
  ) : null;
  const visitRow = window.RecordRow ? (
    <window.RecordRow
      id="person-visit"
      label="Visit messages"
      value={p.consent.answerLabel}
      act={canRecord ? { label: "Change", onClick: visitFold.request } : null}
    />
  ) : null;
  const offersRow = window.RecordRow ? (
    <window.RecordRow
      id="person-offers"
      label="Offers & news"
      value={p.consent.marketingLabel}
      act={canRecord && p.consent.state !== "opted_out" ? { label: "Change", onClick: offersFold.request } : null}
    />
  ) : null;
  return (
    <div className="cl-profile">
      <div className="cl-prof-page">
        <div className="cl-prof-hero">
          {/* On a phone the word goes and the arrow takes a thumb's width: the top bar says People over it. */}
          <button type="button" className="cl-prof-back" onClick={onBack} aria-label="Back to People">
            <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} />
            <span className="cl-prof-back-word">People</span>
          </button>
          {/* Who they are and where they stand, said once: the name, the line under it, the standing's word with the
              sentence of what happens next, and the page's acts beside them. Right now was a card of its own under the
              name, 188px tall on a phone for one word and one sentence. */}
          <div className="cl-prof-id">
            <div className="cl-prof-avatar" aria-hidden="true">{p.initials}</div>
            <div className="cl-prof-titles">
              {/* The name, and beside it where they stand: a dot and the standing's word, its sentence on hover. The
                  sentence is said under the line only when it asks for something: "New messages are answered
                  automatically" under every answered person said nothing. */}
              <div className="cl-prof-name-line">
                <PersonName p={p} canEdit={canRecord} flash={ppFlash} />
                <span className="cl-prof-now" data-tone={tone} data-testid="person-now" title={p.rightNow.detail}>
                  <StatePill kind="standing" value={tone} testid="person-standing" />
                </span>
              </div>
              {idLine.length > 0 && (
                <div className="cl-prof-meta cl-prof-idline" data-testid="person-id-line">
                  <div className="cl-prof-idline-run">{idLine.map((part) => <span key={part} className="cl-prof-meta-part">{part}</span>)}</div>
                </div>
              )}
              {tone !== "answering" && <div className="cl-prof-now-why" data-testid="person-now-why">{p.rightNow.detail}</div>}
              {/* The page is the copy this tab kept (people-detail.ts) and reading it again failed: said, quietly, where it
                  is read, so a copy from before a reload is never taken for now. */}
              {error && <FailedRead kind="line" what="the latest for them" why={error} body="What is here is from earlier." onRetry={load} testid="person-stale" />}
            </div>
          </div>
          <div className="cl-prof-queue-actions">
              {threadCta && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => window.CHANLY.nav(threadCta.to)} data-testid="person-open-thread">
                  {threadCta.label}
                </button>
              )}
              {/* Words, not three dots: a ⋯ was too quiet to be found, and it held one thing. */}
              {more.length > 0 && <MoreMenu label="More" title={`More for ${who}`} btnClass="btn btn-sm" items={more} testid="person-more" />}
          </div>
          {del.open && (
            <div className="cl-prof-danger">
              <Confirm
                block
                danger
                typed={p.name}
                value={del.typed}
                onType={(v) => setDel((d) => ({ ...d, typed: v }))}
                ready={typedMatches}
                question="Delete this person?"
                detail={<>Removes their messages, media and recordings from Chanlytics and stops any reply still queued. This cannot be undone. Type <b>{p.name}</b> to confirm.</>}
                yes="Delete this person"
                busyLabel="Deleting…"
                busy={del.busy}
                error={del.error}
                onYes={confirmDelete}
                onNo={closeDelete}
                testid="delete"
              />
            </div>
          )}
        </div>

        <div className="cl-prof-body">
          {/* Their deal (0008), first, where the work with them is: a card per open deal and its one next act, or one
              quiet line. Nothing where deals are off. Its sends are the More menu's own path (openWith). */}
          {window.PersonDealCard ? <window.PersonDealCard p={dealP} canRecord={canRecord} onCompose={openWith} flash={ppFlash} /> : null}
          {comingUp.length > 0 && (
            <section className="cl-prof-section cl-prof-up" aria-labelledby="person-coming-up-title" data-testid="person-coming-up">
              <h2 className="cl-prof-section-title" id="person-coming-up-title">Coming up</h2>
              <div className="cl-prof-up-list">
                {comingUp.map((v) => (
                  <button key={v.id} type="button" className="cl-prof-up-visit" onClick={() => window.CHANLY.nav(v.to)} data-testid="person-visit-ahead">
                    <span className="cl-prof-up-leaf" aria-hidden="true">
                      <span className="cl-prof-up-month">{v.month}</span>
                      <span className="cl-prof-up-date">{v.date}</span>
                    </span>
                    <span className="cl-prof-up-words">
                      <span className="cl-prof-up-title">{v.title}</span>
                      <span className="cl-prof-up-when">{v.day} · {v.time}{v.byName ? " · by name" : ""}</span>
                    </span>
                    <span className="cl-prof-up-go" aria-hidden="true"><Icon name="chevron" size={12} /></span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="cl-prof-section cl-prof-history" aria-labelledby="person-history-title">
            <div className="cl-prof-section-head">
              <h2 className="cl-prof-section-title" id="person-history-title">History</h2>
            </div>
            <PersonTimeline items={past} initials={p.initials} filter={tlFilter} onFilter={setTlFilter} showAll={tlAll} onShowAll={() => setTlAll(true)} />
          </section>

          <aside className="cl-prof-rail" aria-label={`About ${who === "This person" ? "this person" : who}`}>
            {roleNote && <div className="cl-prof-rail-note" data-testid="person-role-note">{roleNote}</div>}
            <div className="cl-prof-rail-section">
              <div className="cl-prof-rail-label">About</div>
              <div className="cl-prof-attr-list">
                {aboutRows.map((a) => (
                  <div className="cl-prof-attr" key={a.k}>
                    <span className="cl-prof-attr-key">{a.k}</span>
                    <span className="cl-prof-attr-val">
                      {a.k === "Email" ? <PersonEmail p={p} canEdit={canRecord} flash={ppFlash} /> : a.v}
                      {/* The next visit opens its day on the Calendar; the row opened nothing. */}
                      {a.k === "Next visit" && p.nextVisitDate && (
                        <button type="button" className="cl-bucket-link cl-prof-attr-door" onClick={() => window.CHANLY.nav(`calendar/${p.nextVisitDate}`)} data-testid="fact-next-visit">Open the day <Icon name="arrow-right" size={10} /></button>
                      )}
                      {/* The way back to where the finder found them: the lead, open over Leads. */}
                      {a.k === "Added" && p.lead && (
                        <button type="button" className="cl-bucket-link cl-prof-attr-door" onClick={() => window.CHANLY.nav(p.lead.to)} title={p.lead.name} data-testid="fact-lead">Open the lead <Icon name="arrow-right" size={10} /></button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* What the page changes about them, each one line: its label, where it stands, and Change, which opens its
                editor under the row (a sheet on a phone). The three were stacked controls with a paragraph under each,
                1,249px of rail. The record kit's row and fold, as Settings › Business draws them; these save as they are
                chosen, so their folds carry no Save, only Close. */}
            {/* Each row stays in the card behind its sheet on a phone (`behind`), as Settings › Business keeps its rows:
                taken out, the card was a row shorter under the wash, and everything under it moved up and back down. */}
            <div className="cl-prof-rec" data-testid="person-settings">
              {rmFold.open ? null : rmRow}
              <window.RecordFold wide id="person-receptionist" label="Receptionist" open={rmFold.open} onCancel={rmFold.close} behind={rmRow}>
                <div data-testid="receptionist-mode">
                  <div className="cl-prof-autonomy" role="group" aria-label={`Receptionist for ${first === "them" ? "this person" : first}`}>
                    {["auto", "ask", "never"].map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`cl-prof-aut-seg ${rmEffective === m ? "active" : ""}`}
                        aria-pressed={rmEffective === m}
                        disabled={!isOwner || rm.busy}
                        onClick={() => setMode(m)}
                      >
                        {rmWord(m)}
                      </button>
                    ))}
                  </div>
                  <div className="cl-prof-aut-hint">
                    {rmPerson
                      ? (rmPerson === "auto" ? "Answers this person automatically — set for them alone."
                        : rmPerson === "ask" ? "Every message from this person waits for you before anything is sent."
                        : "The receptionist stays out of their WhatsApp thread — their messages come straight to you, and it won't text them after a call. It still answers the phone.")
                      : `Following the workspace${p.receptionistMode.workspace ? ` (${rmWord(p.receptionistMode.workspace)})` : ""}.`}
                    {!isOwner && canRecord && " Only an owner can change this."}
                  </div>
                  {rmPerson && isOwner && (
                    <button type="button" className="cl-bucket-link" disabled={rm.busy} onClick={() => setMode("inherit")}>
                      {rmWord("inherit")} <Icon name="arrow-right" size={10} />
                    </button>
                  )}
                  <window.FieldError message={rm.error} testid="receptionist-mode-error" />
                </div>
              </window.RecordFold>
              {/*
                TWO ASKS, the same pair the public /yes page renders. One control that
                said "Offers by WhatsApp" and wrote the conversational column is what
                made a signed marketing consent impossible to record: the profile then
                claimed offers could go out, and the composer refused every one of them.
              */}
              {visitFold.open ? null : visitRow}
              <window.RecordFold wide id="person-visit" label="Visit messages" open={visitFold.open} onCancel={visitFold.close} behind={visitRow}>
                <ConsentAsk
                  bare
                  testid="consent-control"
                  label="Messages about their visit"
                  value={p.consent.state}
                  sources={CS_SOURCES}
                  yesHow={askScript ? `How did they tell you? In person or on the phone, ask in these words: “${askScript}”` : undefined}
                  canRecord={canRecord}
                  lockedNote={null}
                  messages={p.ownMessages}
                  onRecord={recordAndClose("conversational", visitFold)}
                  hint={
                    p.consent.state === "opted_in"
                      ? `Yes — ${p.consent.sub}. Reminders and confirmations about their own visit may go to them.`
                      : p.consent.state === "opted_out"
                        ? (p.consent.source === "customer_message"
                            ? `${p.consent.sub}. This stops everything, offers included. Record a yes only if they have asked again themselves.`
                            : `No — ${p.consent.sub}. Nothing goes out to them, offers included.`)
                        : "No answer recorded. A reply to something they wrote is always fine; anything we start needs their yes."
                  }
                />
              </window.RecordFold>
              {offersFold.open ? null : offersRow}
              <window.RecordFold wide id="person-offers" label="Offers & news" open={offersFold.open} onCancel={offersFold.close} behind={offersRow}>
                <ConsentAsk
                  bare
                  testid="consent-marketing"
                  label="Offers and news"
                  value={p.consent.marketing}
                  sources={CS_SOURCES}
                  yesSources={OFFERS_YES}
                  yesHow="How did they give it in writing? A spoken yes is not enough for offers."
                  canRecord={canRecord && p.consent.state !== "opted_out"}
                  lockedNote={null}
                  messages={p.ownMessages}
                  onRecord={recordAndClose("marketing", offersFold)}
                  hint={
                    p.consent.state === "opted_out"
                      ? "They asked us to stop, which stops offers too. Nothing to record here until that changes."
                      : p.consent.marketing === "opted_in"
                        ? `Yes — ${p.consent.marketingSub}. This is the answer a broadcast needs.`
                        : p.consent.marketing === "opted_out"
                          ? `No — ${p.consent.marketingSub}. Messages about their own visit still reach them.`
                          : "Not asked. Separate and optional — the one answer a broadcast may be sent on."
                  }
                  why={p.consent.state !== "opted_out" && p.consent.marketing === "unknown" ? {
                    label: "Why in writing?",
                    text: <>The carriers require it: their own message, or a sign-up form they signed — <button type="button" className="cl-bucket-link" onClick={() => window.CHANLY.nav("broadcasts")}>print one from Broadcasts</button>.</>,
                  } : null}
                />
              </window.RecordFold>
            </div>
            <div className="cl-prof-rail-section">
              <div className="cl-prof-rail-label">{window.__personNotes ? window.__personNotes.words.title : "Notes"}</div>
              <PersonNotes p={p} canEdit={canRecord} isOwner={isOwner} flash={ppFlash} onChanged={load} />
            </div>
            <div className="cl-prof-rail-section" data-testid="person-lists">
              <div className="cl-prof-rail-label">Lists</div>
              <PersonLists personId={p.id} canEdit={canRecord} first={first} flash={ppFlash} smart={p.smartLists || []} />
            </div>
            {/* What a playbook or a broadcast sent them, and what came of it: each row opens the run's own report. */}
            {p.campaigns && p.campaigns.length > 0 && (
              <div className="cl-prof-rail-section" data-testid="person-campaigns">
                <div className="cl-prof-rail-label">Campaigns</div>
                <div className="cl-prof-attr-list">
                  {p.campaigns.map((c) => (
                    <button key={c.id} type="button" className="cl-prof-attr cl-prof-run" onClick={() => window.CHANLY.nav(c.to)} data-testid="person-campaign">
                      <span className="cl-prof-attr-key">{c.when}</span>
                      <span className="cl-prof-attr-val">
                        <span className="cl-prof-run-title">{c.title}</span>
                        <span className="cl-prof-run-out" data-tone={c.tone}>{c.line}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
      {toastNode}
    </div>
  );
};

// A real workspace fetches the person; the seeded profile keeps the demo.
// `real`: the shell knows this is a real workspace before People's rows land. A person's page no longer waits for the
// list (surface-registry.ts routeSurfaceFor), so asked by __PEOPLE alone it drew the mockup's seeded profile until then.
const ClientProfile = ({ real = false, ...props }) => (window.__PEOPLE || real ? <ClientProfileReal {...props} /> : <ClientProfileSeed {...props} />);

window.ClientProfile = ClientProfile;
// Published for the same reason `PlatformLine` is: "does this control write the
// column it is labelled for" is exactly the property that was broken here, and a
// source scan answers it badly. consent-door.test.mjs renders it.
window.ConsentAsk = ConsentAsk;
// Drawn on its own by people-honest.test.mjs.
window.PersonLists = PersonLists;
window.PersonNotes = PersonNotes;
