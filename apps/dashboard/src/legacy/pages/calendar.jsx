/* global React, Icon, StatStrip, StatCell, CALENDAR_DATA, SetToggle */
// Chanlytics — Calendar (power-user build)
// Dozens of inboxes, many agents, one board: filter by booking agent,
// drag blocks to new times (with confirmation — an agent notifies the client),
// and set the global availability rules every agent abides by.

const { useState: useCalState, useMemo: useCalMemo, useEffect: useCalEffect, useRef: useCalRef } = React;

const HOUR_PX = 64;
const fmtHour = (h) => {
  const whole = Math.floor(h), min = Math.round((h - whole) * 60);
  const ampm = whole >= 12 ? "PM" : "AM";
  const display = whole > 12 ? whole - 12 : whole === 0 ? 12 : whole;
  return min === 0 ? `${display}:00 ${ampm}` : `${display}:${String(min).padStart(2, "0")} ${ampm}`;
};
const AGENT_NAME = Object.fromEntries(window.CHANLY.agents().map(a => [a.glyph, a.name])); // FLEET_ROSTER is the registry
const MOVABLE = ["pending", "confirmed", "tentative", "risk"];

const calCap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Real open slots — gaps in THIS therapist's day within availability rules.
// dayAppts must be the overridden, unfiltered board for that day.
const computeOpenSlots = (dow, avail, dayAppts, a, CAL_HOURS) => {
  const win = avail[dow] && avail[dow].on ? avail[dow] : null;
  if (!win) return [];
  const durH = a.dur / 60;
  const lo = Math.max(CAL_HOURS.start, win.start);
  const hi = Math.min(CAL_HOURS.end, win.end);
  const busy = dayAppts
    .filter(x => x.id !== a.id && x.status !== "cancelled" && x.therapist === a.therapist)
    .map(x => [x.t, x.t + x.dur / 60]);
  const slots = [];
  for (let t = lo; t + durH <= hi && slots.length < 3; t += 0.25) {
    if (Math.abs(t - a.t) < 0.01) continue;
    if (busy.some(([s, e]) => t < e && t + durH > s)) continue;
    slots.push({ t, label: `${fmtHour(t)} · ${calCap(a.therapist)}` });
    t += Math.max(0.75, durH) - 0.25; // space suggestions out
  }
  return slots;
};

const CAL_SOURCES = [
  { id: "work", label: "Work", src: "Google" },
  { id: "personal", label: "Personal", src: "Google" },
  { id: "staff", label: "Staff room", src: "iCal" },
];

const DEFAULT_AVAIL = {
  Mon: { on: true, start: 9, end: 18 }, Tue: { on: true, start: 9, end: 18 },
  Wed: { on: true, start: 9, end: 18 }, Thu: { on: true, start: 9, end: 18 },
  Fri: { on: true, start: 9, end: 18 }, Sat: { on: true, start: 10, end: 17 },
  Sun: { on: true, start: 9, end: 18 },
};

// ---------- Appointment block (draggable when movable) ----------
const ApptBlock = ({ a, onOpen, drag, onDragStart, wide = false }) => {
  const { CAL_HOURS } = window.CALENDAR_DATA;
  const isDragging = drag && drag.id === a.id;
  const t = isDragging ? drag.previewT : a.t;
  const top = (t - CAL_HOURS.start) * HOUR_PX;
  const height = Math.max(30, (a.dur / 60) * HOUR_PX - 3);
  // A conflict resolves the moment its Inbox thread is decided (interrupt spine)
  const resolvedRec = a.status === "conflict" && window.IX_STORE && window.IX_STORE.get ? window.IX_STORE.get(a.threadId) : null;
  const status = resolvedRec ? "confirmed" : a.status;
  const movable = MOVABLE.includes(status);
  const noteText = resolvedRec ? `Resolved · ${resolvedRec.action}` : a.note;
  return (
    <button
      className={`cal-appt is-${status} ${isDragging ? "dragging" : ""} ${movable ? "movable" : ""}`}
      style={{ top, height, ...(status === "conflict" ? { left: 12 } : {}) }}
      onClick={() => { if (!(drag && drag.moved)) onOpen(a.id); }}
      onPointerDown={(e) => movable && onDragStart(e, a)}
      data-tip={noteText || undefined}
    >
      {isDragging && <span className="cal-drag-chip mono tabular">{fmtHour(t)}</span>}
      <span className="cal-appt-line1">
        {status === "live" && <span className="live-dot" style={{ width: 5, height: 5 }} />}
        {status === "risk" && <span className="cal-risk-dot" />}
        {status === "conflict" && <span className="cal-conflict-dot" />}
        <span className="cal-appt-who">{a.who}</span>
        <span className="agent-avatar cal-appt-agent">{a.agent}</span>
        {wide && <span className="cal-appt-agentname">{AGENT_NAME[a.agent] || ""}</span>}
      </span>
      <span className="cal-appt-service">{a.service}</span>
      {noteText && (height > 56 || wide) && <span className="cal-appt-note">{noteText}</span>}
    </button>
  );
};

// ---------- Availability rules (all agents abide) ----------
const AvailabilityModal = ({ avail, setAvail, onClose }) => {
  const hours = [];
  for (let h = 7; h <= 20; h++) hours.push(h);
  const set = (day, patch) => setAvail(a => ({ ...a, [day]: { ...a[day], ...patch } }));
  return (
    <div className="ask-overlay" onClick={onClose}>
      <div className="ask-modal cal-ev" onClick={(e) => e.stopPropagation()}>
        <header className="st-modal-head">
          <span className="st-tile lg installed"><Icon name="shield" size={16} /></span>
          <div className="st-card-titles">
            <span className="st-modal-name">Booking availability</span>
            <span className="st-card-role">The free/busy rules every agent follows, on every connected calendar</span>
          </div>
        </header>
        <section className="st-modal-section">
          {Object.entries(avail).map(([day, w]) => (
            <div key={day} className="cal-av-row">
              <span className="cal-av-day">{day}</span>
              <SetToggle on={w.on} onChange={(v) => set(day, { on: v })} />
              {w.on ? (
                <span className="cal-av-range">
                  <select className="cal-av-select" value={w.start} onChange={(e) => set(day, { start: +e.target.value })}>
                    {hours.filter(h => h < w.end).map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
                  </select>
                  <span className="cal-av-to">to</span>
                  <select className="cal-av-select" value={w.end} onChange={(e) => set(day, { end: +e.target.value })}>
                    {hours.filter(h => h > w.start).map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
                  </select>
                </span>
              ) : (
                <span className="cal-av-closed">Closed — agents won't offer this day</span>
              )}
            </div>
          ))}
        </section>
        <footer className="st-modal-foot">
          <span className="cal-av-foot-note"><Icon name="agents" size={11} /> Applies to all 8 agents and syncs as busy time to Google + iCal</span>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
};

// ---------- Event panel ----------
const EventPanel = ({ a, day, onClose, onMove, onCancel, onConfirmReq, slots = [] }) => {
  const [mode, setMode] = useCalState(null);
  if (!a) return null;
  const first = a.who.split(" ")[0];
  const movable = MOVABLE.includes(a.status);
  const isPast = a.status === "done" || a.status === "noshow";
  const conflictResolved = a.status === "conflict" && window.IX_STORE && window.IX_STORE.get(a.threadId);

  const statusPill =
    a.status === "conflict" ? (conflictResolved ? <span className="pill pill-ok"><Icon name="check" size={10} />Resolved</span> : <span className="pill pill-danger">Double-booked</span>)
    : a.status === "live" ? <span className="pill pill-accent"><span className="live-dot" style={{ width: 5, height: 5 }} />Live</span>
    : a.status === "done" ? <span className="pill pill-ok">Completed</span>
    : a.status === "noshow" ? <span className="pill pill-danger">No-show</span>
    : a.status === "cancelled" ? <span className="pill">Cancelled</span>
    : a.status === "pending" ? <span className="pill pill-warn">Pending approval</span>
    : a.status === "risk" ? <span className="pill pill-warn">No-show risk</span>
    : a.status === "tentative" ? <span className="pill">Tentative</span>
    : <span className="pill pill-ok">Confirmed</span>;

  return (
    <div className="ask-overlay" onClick={onClose}>
      <div className="ask-modal cal-ev" onClick={(e) => e.stopPropagation()}>
        <header className="st-modal-head">
          <span className="cv-head-avatar">{a.who.split(" ").map(w => w[0]).slice(0, 2).join("")}</span>
          <div className="st-card-titles">
            <span className="st-modal-name">{a.who}</span>
            <span className="st-card-role">{a.service}</span>
          </div>
          {statusPill}
        </header>

        <section className="st-modal-section">
          <div className="cl-prof-attr-list">
            <div className="cl-prof-attr"><span className="cl-prof-attr-key">When</span>
              <span className="cl-prof-attr-val">{day.dow} {day.date} · {fmtHour(a.t)} – {fmtHour(a.t + a.dur / 60)}</span></div>
            <div className="cl-prof-attr"><span className="cl-prof-attr-key">Therapist</span>
              <span className="cl-prof-attr-val" style={{ textTransform: "capitalize" }}>{a.therapist}</span></div>
            <div className="cl-prof-attr"><span className="cl-prof-attr-key">Booked by</span>
              <span className="cl-prof-attr-val cal-ev-agent">
                <span className="agent-avatar" style={{ width: 16, height: 16, fontSize: 8.5 }}>{a.agent}</span>
                {AGENT_NAME[a.agent] || "Agent"}{a.bookedVia ? ` · ${a.bookedVia}` : ""}{a.bookedVia ? <> <PolicyChip cls="book" /></> : null}
              </span></div>
            <div className="cl-prof-attr"><span className="cl-prof-attr-key">Synced to</span>
              <span className="cl-prof-attr-val cal-ev-sync">
                <span className="st-chip"><Icon name="calendar" size={10} /> Google</span>
                <span className="st-chip"><Icon name="calendar" size={10} /> iCal</span>
                <span className="cal-ev-sync-note">two-way</span>
              </span></div>
          </div>
          {a.status === "conflict" && !conflictResolved && (
            <div className="cal-ev-flash" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="shield" size={11} />
              <span style={{ flex: 1 }}>{calCap(a.therapist)} is double-booked at {fmtHour(a.t)} — this slot is also held. Choose who moves in the Inbox.</span>
            </div>
          )}
          {a.note && !a.movedNote && !a.cancelNote && a.status !== "conflict" && <div className="cal-ev-note">{a.note}</div>}
          {a.movedNote && <div className="cal-ev-flash ok"><Icon name="check" size={11} /> {a.movedNote}</div>}
          {a.cancelNote && <div className="cal-ev-flash"><Icon name="wave" size={11} /> {a.cancelNote}</div>}
          {a.confirmSent && <div className="cal-ev-flash ok"><Icon name="check" size={11} /> Confirmation request sent — SMS Agent will chase a reply</div>}
          {a.clientId && ((window.SEGMENT_META || {})["high-no-show"]?.members || []).some(m => m.id === a.clientId) && (
            <div className="cal-ev-flash" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="shield" size={11} />
              <span style={{ flex: 1 }}>In “Multiple no-shows” — deposit required before rebooking (your guardrail)</span>
              <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.segment("high-no-show"))}>
                View list <Icon name="arrow-right" size={10} />
              </button>
            </div>
          )}
        </section>

        {mode === "move" && (
          <section className="st-modal-section">
            <div className="st-modal-label">Open slots {day.today ? "today" : day.dow} · or drag the block right on the grid</div>
            <div className="cal-ev-slots">
              {slots.map(s => (
                <button key={s.t} className="cal-ev-slot" onClick={() => { onMove(a.id, s.t, s.label); setMode(null); }}>
                  <Icon name="calendar" size={12} />
                  {s.label}
                </button>
              ))}
              {slots.length === 0 && (
                <span className="cal-ev-cancel-hint">No open {calCap(a.therapist)} slots left within booking hours — ask an agent to offer other days.</span>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => window.askAbout({
              prompt: "Find another time for this appointment",
              answer: slots.length > 0
                ? `${calCap(a.therapist)} has ${slots.map(s => s.label.split(" · ")[0]).join(", ")} open ${day.today ? "today" : day.dow} within your booking hours. I can offer the client ${slots.length === 1 ? "it" : "all " + slots.length} and book whichever they pick — confirmation and both calendars update automatically.`
                : `${calCap(a.therapist)} is fully booked ${day.today ? "today" : day.dow}. Nearest matches this week: Tue 11:00am and Thu 4:15pm — I can offer both and book whichever the client picks.`,
              links: [{ label: "Open Calendar", to: "calendar" }],
            })}>
              <Icon name="sparkle" size={12} /> Ask an agent to find another time
            </button>
          </section>
        )}

        {mode === "cancel" && (
          <section className="st-modal-section">
            <div className="cal-ev-cancelbox">
              <div className="cal-ev-cancel-title">Cancel {first}'s {a.service}?</div>
              <div className="cal-ev-cancel-hint">
                Within 24 hours — your deposit policy applies. Waitlist Filler will offer the slot immediately.
              </div>
              <div className="st-modal-foot-actions" style={{ marginTop: 10 }}>
                <button className="btn btn-sm" onClick={() => setMode(null)}>Keep it</button>
                <button className="btn btn-sm lm-end" onClick={() => { onCancel(a.id); setMode(null); }}>
                  <Icon name="x" size={12} /> Cancel appointment
                </button>
              </div>
            </div>
          </section>
        )}

        <footer className="st-modal-foot">
          <div className="cal-ev-foot-left">
            {a.clientId && (
              <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.client(a.clientId))}>
                <Icon name="users" size={12} /> Open client
              </button>
            )}
            {(a.status === "done" || a.cvId) && (
              <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(a.cvId ? `conversations/${a.cvId}` : "conversations")}>
                <Icon name="chat" size={12} /> {a.cvId ? "Transcript" : "Conversations"}
              </button>
            )}
          </div>
          <div className="st-modal-foot-actions">
            {a.status === "live" && (
              <button className="btn btn-primary btn-sm" onClick={() => window.CHANLY.nav("live")}>
                <Icon name="headphones" size={12} /> Open Live Monitor
              </button>
            )}
            {a.threadId && (() => {
              const rec = window.IX_STORE && window.IX_STORE.get(a.threadId);
              if (rec && rec.kind === "decided") {
                return (
                  <button className="btn btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.thread(a.threadId))}>
                    <Icon name="check" size={12} style={{ color: "var(--ok)" }} /> Decided “{rec.action}” — view thread
                  </button>
                );
              }
              return (
                <button className="btn btn-primary btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.thread(a.threadId))}>
                  {a.verdict ? "Record the verdict" : a.status === "noshow" ? "Refund decision in Inbox" : a.status === "conflict" ? "Resolve the conflict" : "Review in Inbox"} <Icon name="arrow-right" size={11} />
                </button>
              );
            })()}
            {(a.status === "tentative" || a.status === "risk") && !a.confirmSent && (
              <button className="btn btn-sm" onClick={() => onConfirmReq(a.id)}>
                <Icon name="check" size={12} /> Request confirmation
              </button>
            )}
            {movable && mode !== "move" && (
              <button className="btn btn-sm" onClick={() => setMode("move")}>
                <Icon name="calendar" size={12} /> Move
              </button>
            )}
            {movable && mode !== "cancel" && (
              <button className="btn btn-ghost btn-sm lm-end" onClick={() => setMode("cancel")}>Cancel…</button>
            )}
            {(isPast || a.status === "cancelled" || a.status === "live") && (
              <button className="btn btn-sm" onClick={onClose}>Close</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

// ---------- Page ----------
const CalendarPage = ({ initialApptId = null }) => {
  const { CAL_WEEK, CAL_HOURS, CAL_THERAPISTS, CAL_NOW, SERVICE_PRICE } = window.CALENDAR_DATA;
  const [therapist, setTherapist] = useCalState("all");
  const [agentFilter, setAgentFilter] = useCalState("all");
  const [view, setView] = useCalState("week");                                   // week | day
  const [dayIdx, setDayIdx] = useCalState(() => Math.max(0, CAL_WEEK.findIndex(d => d.today)));
  const [openId, setOpenId] = useCalState(initialApptId);
  useCalEffect(() => {
    if (initialApptId && CAL_WEEK.some(d => d.appts.some(a => a.id === initialApptId))) {
      setOpenId(initialApptId);
      setDayIdx(Math.max(0, CAL_WEEK.findIndex(d => d.appts.some(a => a.id === initialApptId))));
    }
  }, [initialApptId]);
  const [overrides, setOverrides] = useCalState({});
  const [syncing, setSyncing] = useCalState(false);
  const [avail, setAvail] = useCalState(DEFAULT_AVAIL);
  const [availOpen, setAvailOpen] = useCalState(false);
  const [calSel, setCalSel] = useCalState({ work: true, personal: false, staff: true });
  const [calPickOpen, setCalPickOpen] = useCalState(false);
  const [drag, setDrag] = useCalState(null);
  const [pendingMove, setPendingMove] = useCalState(null);
  const [toastNode, ppFlash] = window.usePPToast();
  const [, setTick] = useCalState(0);
  const dragRef = useCalRef(null);
  dragRef.current = drag;

  // Decisions elsewhere (Inbox/Today/Tasks) flip appointment CTAs live
  useCalEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("inbox:decisions", bump);
    return () => window.removeEventListener("inbox:decisions", bump);
  }, []);

  const flash = (msg, undo = null) => ppFlash({ msg, undo });

  const hours = [];
  for (let h = CAL_HOURS.start; h < CAL_HOURS.end; h++) hours.push(h);
  const gridH = (CAL_HOURS.end - CAL_HOURS.start) * HOUR_PX;

  const week = useCalMemo(() =>
    CAL_WEEK.map(d => ({
      ...d,
      appts: d.appts
        .map(a => ({ ...a, ...(overrides[a.id] || {}) }))
        .filter(a => (therapist === "all" || a.therapist === therapist) &&
                     (agentFilter === "all" || a.agent === agentFilter)),
    })), [therapist, agentFilter, overrides]);

  const agentChips = useCalMemo(() => {
    // Live board: overrides applied, session-cancelled excluded (matches week stats)
    const all = CAL_WEEK.flatMap(d => d.appts)
      .map(a => ({ ...a, ...(overrides[a.id] || {}) }))
      .filter(a => a.status !== "cancelled");
    const glyphs = [...new Set(all.map(a => a.agent))];
    return [{ id: "all", label: "All agents", count: all.length }]
      .concat(glyphs.map(g => ({ id: g, label: AGENT_NAME[g] || g, count: all.filter(a => a.agent === g).length })));
  }, [overrides]);

  const shown = view === "day" ? week.slice(dayIdx, dayIdx + 1) : week;
  const openDayFor = (d) => { const i = CAL_WEEK.findIndex(x => x.date === d.date); if (i >= 0) { setDayIdx(i); setView("day"); } };

  const allAppts = week.flatMap(d => d.appts.map(a => ({ a, day: d })));
  const open = allAppts.find(x => x.a.id === openId);

  // ---- drag & drop (vertical, snap 15 min, clamp to availability) ----
  const startDrag = (e, a) => {
    e.preventDefault();
    const dayOfAppt = CAL_WEEK.find(d => d.appts.some(x => x.id === a.id));
    setDrag({ id: a.id, origT: a.t, startY: e.clientY, dur: a.dur, dow: dayOfAppt ? dayOfAppt.dow : "Sun", previewT: a.t, moved: false });
  };
  useCalEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const d = dragRef.current; if (!d) return;
      const deltaT = (e.clientY - d.startY) / HOUR_PX;
      const win = avail[d.dow] && avail[d.dow].on ? avail[d.dow] : { start: CAL_HOURS.start, end: CAL_HOURS.end };
      const lo = Math.max(CAL_HOURS.start, win.start);
      const hi = Math.min(CAL_HOURS.end, win.end) - d.dur / 60;
      const snapped = Math.min(hi, Math.max(lo, Math.round((d.origT + deltaT) * 4) / 4));
      setDrag(prev => prev && { ...prev, previewT: snapped, moved: prev.moved || Math.abs(snapped - prev.origT) >= 0.25 });
    };
    const onUp = () => {
      const d = dragRef.current; if (!d) return;
      if (d.moved && Math.abs(d.previewT - d.origT) >= 0.25) {
        const appt = CAL_WEEK.flatMap(x => x.appts).find(x => x.id === d.id);
        setPendingMove({ id: d.id, who: appt ? appt.who : "", from: d.origT, t: d.previewT });
      }
      setTimeout(() => setDrag(null), 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [!!drag, avail]);

  // Overrides stay page-local by design: a moved/cancelled block doesn't
  // surface on other pages (Clients' next-visit column is seed data), so no
  // session store — the toast+undo contract still applies (CLAUDE.md).
  const move = (id, t, label) => {
    const prev = overrides[id];
    const appt = CAL_WEEK.flatMap(x => x.appts).find(x => x.id === id);
    setOverrides(o => ({
      ...o,
      [id]: {
        ...(o[id] || {}),
        t,
        note: null,
        movedNote: `Moved to ${label || fmtHour(t)} — SMS Agent is notifying the client; Google + iCal updated`,
      },
    }));
    flash(
      <><b>{appt ? appt.who : "Appointment"}</b> moved to {label || fmtHour(t)} — SMS Agent is notifying them</>,
      () => setOverrides(o => { const n = { ...o }; if (prev) n[id] = prev; else delete n[id]; return n; })
    );
  };
  const cancel = (id) => {
    const prev = overrides[id];
    const appt = CAL_WEEK.flatMap(x => x.appts).find(x => x.id === id);
    setOverrides(o => ({
      ...o,
      [id]: { ...(o[id] || {}), status: "cancelled", note: null, cancelNote: "Cancelled — Waitlist Filler is offering this slot to 3 matches" },
    }));
    flash(
      <><b>{appt ? appt.who : "Appointment"}</b> cancelled — Waitlist Filler is offering the slot</>,
      () => setOverrides(o => { const n = { ...o }; if (prev) n[id] = prev; else delete n[id]; return n; })
    );
  };
  const confirmReq = (id) => {
    const prev = overrides[id];
    const appt = CAL_WEEK.flatMap(x => x.appts).find(x => x.id === id);
    setOverrides(o => ({ ...o, [id]: { ...(o[id] || {}), confirmSent: true } }));
    flash(
      <>Confirmation request sent to <b>{appt ? appt.who : "client"}</b> — SMS Agent will chase a reply</>,
      () => setOverrides(o => { const n = { ...o }; if (prev) n[id] = prev; else delete n[id]; return n; })
    );
  };
  const refresh = () => { setSyncing(true); setTimeout(() => setSyncing(false), 900); };

  const todayAppts = week.find(d => d.today)?.appts || [];
  const atRisk = todayAppts.filter(a => (a.status === "risk" || a.status === "tentative") && !a.confirmSent).length;
  const conflictsToday = todayAppts.filter(a => a.status === "conflict" && !(window.IX_STORE && window.IX_STORE.get && window.IX_STORE.get(a.threadId)));

  // Honest week stats — computed from the (overridden) board + availability rules
  const weekAppts = week.flatMap(d => d.appts).filter(a => a.status !== "cancelled");
  const bookedDollars = weekAppts.reduce((sum, a) => sum + ((SERVICE_PRICE || {})[a.service] || 0), 0);
  const bookedHours = weekAppts.reduce((sum, a) => sum + a.dur / 60, 0);
  const openHours = Object.values(avail).reduce((sum, w) => sum + (w.on ? Math.max(0, Math.min(w.end, CAL_HOURS.end) - Math.max(w.start, CAL_HOURS.start)) : 0), 0);
  const utilization = openHours > 0 ? Math.round((bookedHours / openHours) * 100) : 0;

  const unavailBands = (dow) => {
    const w = avail[dow];
    if (!w) return null;
    if (!w.on) return <div className="cal-unavail full"><span>Closed</span></div>;
    return (
      <>
        {w.start > CAL_HOURS.start && (
          <div className="cal-unavail" style={{ top: 0, height: (w.start - CAL_HOURS.start) * HOUR_PX }} />
        )}
        {w.end < CAL_HOURS.end && (
          <div className="cal-unavail" style={{ top: (w.end - CAL_HOURS.start) * HOUR_PX, height: (CAL_HOURS.end - w.end) * HOUR_PX }} />
        )}
      </>
    );
  };

  return (
    <div className="calendar">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Calendar</div>
          <div className="cl-page-sub">
            Every agent books into one board. Drag to move (with confirmation), filter by who booked it, and set the hours all agents obey.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="This week" value={weekAppts.length} meta={`${window.CHANLY.fmtMoney(bookedDollars)} booked`} />
          <StatCell label="Utilization" tip="Booked hours ÷ open hours · this week" value={`${utilization}%`} meta={`${Math.round(bookedHours)}h of ${openHours}h open`} />
          <StatCell label="At risk today" tip="Today's appointments still unconfirmed or with a no-show pattern" value={atRisk} meta={atRisk > 0 ? "confirmations pending" : "all confirmed"} metaTone={atRisk > 0 ? "neg" : "pos"} />
        </StatStrip>
      </div>

      <div className="cl-controls">
        <div className="cal-weeklabel">
          <span className="cal-week-range">{view === "day" && shown[0] ? `${shown[0].dow} · ${shown[0].date}` : `${CAL_WEEK[0].date} – ${CAL_WEEK[CAL_WEEK.length - 1].date.replace(/^[A-Za-z]+ /, "")}`}</span>
          <div className="cl-tabs">
            <button className={`cl-tab ${view === "week" ? "active" : ""}`} onClick={() => setView("week")}>Week</button>
            <button className={`cl-tab ${view === "day" ? "active" : ""}`} onClick={() => setView("day")}>Day</button>
          </div>
        </div>
        <div className="cl-controls-right">
          <div className="fleet-filter" title="Filter by booking agent">
            {agentChips.map(c => (
              <button key={c.id} className={`fleet-filter-chip ${agentFilter === c.id ? "active" : ""}`} onClick={() => setAgentFilter(c.id)}>
                {c.id === "all" ? c.label : <span className="cal-agent-chip"><span className="agent-avatar" style={{ width: 15, height: 15, fontSize: 8.5 }}>{c.id}</span>{c.label.split(" ")[0]}</span>}
                <span className="fleet-filter-count tally">{c.count}</span>
              </button>
            ))}
          </div>
          <div className="fleet-filter" title="Filter by therapist">
            {CAL_THERAPISTS.map(t => (
              <button key={t.id} className={`fleet-filter-chip ${therapist === t.id ? "active" : ""}`} onClick={() => setTherapist(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => setAvailOpen(true)}>
            <Icon name="shield" size={12} /> Availability
          </button>
        </div>
      </div>

      <div className="cal-sync">
        <span className="cal-sync-chip"><span className="cal-sync-dot" /> Google Calendar</span>
        <span className="cal-sync-chip"><span className="cal-sync-dot" /> Apple iCal</span>
        <span className="cal-sync-meta">
          Two-way sync · {Object.values(calSel).filter(Boolean).length} of {CAL_SOURCES.length} calendars · updated {syncing ? "now" : "2 min ago"}
        </span>
        <span className="cal-sync-spacer" />
        <span className="cal-pick-wrap">
          <button className="btn btn-ghost btn-sm" onClick={() => setCalPickOpen(v => !v)}>
            <Icon name="calendar" size={12} /> Calendars
          </button>
          {calPickOpen && (
            <>
              <div className="tbn-backdrop" onClick={() => setCalPickOpen(false)} />
              <div className="tbn-pop cal-pick">
                <header className="tbn-head"><span className="tbn-title">Synced calendars</span></header>
                {CAL_SOURCES.map(s => (
                  <div key={s.id} className="cal-pick-row">
                    <SetToggle on={!!calSel[s.id]} onChange={(v) => setCalSel(m => ({ ...m, [s.id]: v }))} />
                    <span className="cal-pick-body">
                      <span className="cal-pick-label">{s.label}</span>
                      <span className="cal-pick-src">{s.src} · two-way</span>
                    </span>
                    <span className={`pill ${calSel[s.id] ? "pill-ok" : ""}`}>{calSel[s.id] ? "Syncing" : "Private"}</span>
                  </div>
                ))}
                <div className="cal-pick-note">
                  Unchecked calendars stay private — agents can't see or book into them. Your availability still syncs out as busy time.
                </div>
              </div>
            </>
          )}
        </span>
        <button className={`btn btn-ghost btn-icon btn-sm ${syncing ? "cal-syncing" : ""}`} title="Sync now" onClick={refresh}>
          <Icon name="refresh" size={13} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("integrations"))}>
          Manage <Icon name="arrow-right" size={11} />
        </button>
      </div>

      {conflictsToday.length > 0 && (
        <div className="cal-conflict-bar">
          <Icon name="shield" size={13} />
          <span><b>{conflictsToday.length} double-booking{conflictsToday.length > 1 ? "s" : ""}</b> today — two agents booked the same therapist and time. Nothing was auto-resolved.</span>
          <button className="btn btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.thread(conflictsToday[0].threadId))}>Resolve in Inbox <Icon name="arrow-right" size={11} /></button>
        </div>
      )}

      <div className="cal-scroll">
        <div className={`cal-grid ${view === "day" ? "cal-grid-day" : ""}`}>
          <div className="cal-corner" />
          {shown.map(d => (
            <div
              key={d.date}
              className={`cal-dayhead ${d.today ? "today" : ""} ${view === "week" ? "clickable" : ""}`}
              title={view === "week" ? `Open ${d.dow} in Day view` : undefined}
              onClick={() => view === "week" && openDayFor(d)}
            >
              <span className="cal-dow">{d.dow}</span>
              <span className="cal-date tabular">{d.date}</span>
              {d.today && <span className="cal-today-chip">Today</span>}
            </div>
          ))}
          <div className="cal-gutter" style={{ height: gridH }}>
            {hours.map(h => (
              <span key={h} className="cal-hour tabular" style={{ top: (h - CAL_HOURS.start) * HOUR_PX }}>{fmtHour(h).replace(":00", "")}</span>
            ))}
          </div>
          {shown.map(d => (
            <div key={d.date} className={`cal-col ${d.today ? "today" : ""}`} style={{ height: gridH }}>
              {unavailBands(d.dow)}
              {d.appts.map(a => (
                <ApptBlock key={a.id} a={a} onOpen={setOpenId} drag={drag} onDragStart={startDrag} wide={view === "day"} />
              ))}
              {d.today && (
                <div className="cal-nowline" style={{ top: (CAL_NOW - CAL_HOURS.start) * HOUR_PX }}>
                  <span className="cal-nowdot" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {open && (
        <EventPanel
          a={open.a}
          day={open.day}
          onClose={() => setOpenId(null)}
          onMove={move}
          onCancel={cancel}
          onConfirmReq={confirmReq}
          slots={computeOpenSlots(
            open.day.dow,
            avail,
            (CAL_WEEK.find(d => d.date === open.day.date) || { appts: [] }).appts.map(x => ({ ...x, ...(overrides[x.id] || {}) })),
            open.a,
            CAL_HOURS
          )}
        />
      )}

      {availOpen && <AvailabilityModal avail={avail} setAvail={setAvail} onClose={() => setAvailOpen(false)} />}

      {pendingMove && (
        <div className="ask-overlay" onClick={() => setPendingMove(null)}>
          <div className="ask-modal cal-ev cal-move-confirm" onClick={(e) => e.stopPropagation()}>
            <section className="st-modal-section">
              <div className="st-modal-name">Move {pendingMove.who} to {fmtHour(pendingMove.t)}?</div>
              <div className="cal-ev-cancel-hint" style={{ marginTop: 6 }}>
                Was {fmtHour(pendingMove.from)}. SMS Agent will notify the client and update Google + iCal.
              </div>
            </section>
            <footer className="st-modal-foot">
              <span />
              <div className="st-modal-foot-actions">
                <button className="btn btn-sm" onClick={() => setPendingMove(null)}>Keep original</button>
                <button className="btn btn-primary btn-sm" onClick={() => { move(pendingMove.id, pendingMove.t); setPendingMove(null); }}>
                  <Icon name="check" size={12} /> Confirm move
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {toastNode}
    </div>
  );
};

// A real workspace renders its own calendar (calendar-real.jsx); the seeded page keeps the demo.
window.CalendarSeed = CalendarPage;
