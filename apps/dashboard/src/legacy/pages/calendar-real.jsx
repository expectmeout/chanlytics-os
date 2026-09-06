/* global React, Icon, StatStrip, StatCell */
// Calendar, real: the owner's calendar as the receptionist reads it. Same
// board as the seeded page (calendar.jsx) — hours down, days across — but
// every block is the feed's, every band is the business's own hours and
// closures, and every dashed window is a time the receptionist would offer
// a caller, computed by the same function the phone tool uses. Nothing is
// booked, moved or cancelled here: the booking link does that.

const useCalendar = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:calendar", bump);
    return () => window.removeEventListener("surface:calendar", bump);
  }, []);
  return window.__CALENDAR;
};

const CR_HOUR_PX = 64;
const crHour = (t) => {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  const ap = h >= 12 && h < 24 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""} ${ap}`;
};

// One taken block from the feed. Neutral, never an agent's colour: the
// calendar did not say who booked it, only that the time is taken.
const CrBlock = ({ b, top, hours, onOpen, wide }) => {
  const y = (Math.max(hours.start, b.t) - hours.start) * CR_HOUR_PX;
  const h = Math.max(22, (Math.min(hours.end, b.t + b.dur / 60) - Math.max(hours.start, b.t)) * CR_HOUR_PX - 2);
  return (
    <button className="cal-appt feed" style={{ top: y + top, height: h }} onClick={() => onOpen(b)} title={`${b.title} · ${b.time}`} data-testid="cal-block">
      <span className="cal-appt-line1"><span className="cal-appt-who">{b.title}</span></span>
      <span className="cal-appt-service">{b.time}{wide && b.person ? ` · ${b.person.name}` : ""}</span>
    </button>
  );
};

// A window the receptionist would offer: dashed, quiet, under the blocks.
const CrWindow = ({ w, hours }) => {
  const y = (Math.max(hours.start, w.t) - hours.start) * CR_HOUR_PX;
  const h = Math.max(18, (Math.min(hours.end, w.t + w.dur / 60) - Math.max(hours.start, w.t)) * CR_HOUR_PX - 2);
  return (
    <div className="cal-open" style={{ top: y, height: h }} title={`Open · ${w.label} — the receptionist would offer this`} data-testid="cal-window">
      <span className="cal-open-label">Open · {w.label}</span>
    </div>
  );
};

const CrPanel = ({ b, day, feedLine, onClose }) => (
  <div className="ask-overlay" onClick={onClose}>
    <div className="ask-modal cal-ev" onClick={(e) => e.stopPropagation()} data-testid="cal-panel">
      <section className="st-modal-section">
        <div className="st-modal-name">{b.title}</div>
        <div className="cal-ev-cancel-hint" style={{ marginTop: 4 }}>{day.long} · {b.time}</div>
        <div className="cal-ev-note">{feedLine}. The receptionist treats this time as taken; changing it happens in your calendar, not here.</div>
      </section>
      <footer className="st-modal-foot">
        <div className="cal-ev-foot-left">
          {b.person && (
            <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(`clients/${b.person.id}`)}>
              <Icon name="users" size={12} /> {b.person.name} in People
            </button>
          )}
        </div>
        <div className="st-modal-foot-actions">
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
      </footer>
    </div>
  </div>
);

const CalendarReal = () => {
  const C = useCalendar();
  const [view, setView] = React.useState("week");
  const [dayKey, setDayKey] = React.useState(null);
  const [openId, setOpenId] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [toastNode, flash] = window.usePPToast();
  const fetchedAt = C ? C.fetchedAt : 0;
  React.useEffect(() => { setBusy(false); }, [fetchedAt]);
  if (!C) return null;
  const vm = C.vm;
  const hours = vm.hours;
  const gridH = (hours.end - hours.start) * CR_HOUR_PX;
  const ticks = [];
  for (let h = hours.start; h < hours.end; h++) ticks.push(h);

  const go = async (from) => {
    if (!window.__calendar || busy) return;
    setBusy(true);
    const ok = await window.__calendar.goToWeek(from);
    if (!ok) { setBusy(false); flash({ msg: <>That week could not be read — still showing {vm.rangeLabel}.</> }); }
  };
  const shiftWeek = (n) => {
    const [y, m, d] = vm.from.split("-").map(Number);
    const at = new Date(Date.UTC(y, m - 1, d + n * 7));
    go(`${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`);
  };
  const shown = view === "day" ? vm.days.filter((d) => d.key === (dayKey || vm.today) || (!vm.days.some((x) => x.key === (dayKey || vm.today)) && d === vm.days[0])).slice(0, 1) : vm.days;
  const openBlock = openId ? vm.days.flatMap((d) => [...d.blocks, ...d.allDay].map((b) => ({ b, d }))).find((x) => x.b.id === openId) : null;

  return (
    <div className="calendar" data-testid="calendar-real">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Calendar</div>
          <div className="cl-page-sub">Your calendar as the receptionist reads it — what is taken, when you are open, and the times it would offer a caller. Booking happens through your link, whichever tool is behind it.</div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label={view === "day" && shown[0] ? shown[0].dow : "This week"} value={view === "day" && shown[0] ? shown[0].blocks.length + shown[0].allDay.length : vm.stats.events} meta={vm.feed.present ? "on your calendar" : "no calendar connected"} />
          <StatCell label="Open windows" tip="Times the receptionist would offer, after your hours, closures, booking rules and what is taken" value={vm.feed.state === "ok" ? vm.stats.windows : "—"} meta={vm.feed.state === "ok" ? "it would offer these" : "needs the calendar"} />
          <StatCell label="Next opening" value={vm.feed.state === "ok" ? vm.stats.next : "—"} meta={vm.feed.state === "ok" ? vm.rules.replace(/^Offers times /, "") : "needs the calendar"} />
        </StatStrip>
      </div>

      <div className="cl-controls">
        <div className="cal-weeklabel">
          <button className="btn btn-ghost btn-icon btn-sm cal-nav" title="Previous week" aria-label="Previous week" onClick={() => shiftWeek(-1)} disabled={busy} data-testid="cal-prev">‹</button>
          <span className="cal-week-range" data-testid="cal-range">{view === "day" && shown[0] ? `${shown[0].dow} · ${shown[0].date}` : vm.rangeLabel}</span>
          <button className="btn btn-ghost btn-icon btn-sm cal-nav" title="Next week" aria-label="Next week" onClick={() => shiftWeek(1)} disabled={busy} data-testid="cal-next">›</button>
          {!vm.days.some((d) => d.today) && <button className="btn btn-ghost btn-sm" onClick={() => go(null)} disabled={busy}>Today</button>}
          <div className="cl-tabs">
            <button className={`cl-tab ${view === "week" ? "active" : ""}`} onClick={() => setView("week")}>Week</button>
            <button className={`cl-tab ${view === "day" ? "active" : ""}`} onClick={() => setView("day")}>Day</button>
          </div>
        </div>
        <div className="cl-controls-right">
          <span className={`cal-feed-chip ${vm.feed.state}`} data-testid="cal-feed">
            <span className="cal-sync-dot" />
            {vm.feed.line}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("workspace"))}>
            {vm.feed.present ? "Hours, closures and rules" : "Connect a calendar"} <Icon name="arrow-right" size={11} />
          </button>
        </div>
      </div>

      {vm.feed.state !== "ok" && (
        <div className="cal-feed-card" data-testid="cal-feed-card">
          <Icon name="calendar" size={14} />
          {vm.feed.state === "none" ? (
            <span>
              <b>No calendar connected.</b> Paste the private iCal address of the calendar your appointments land in — Google, Apple or Outlook; Booksy, Calendly and the rest sync into one — under Settings › Workspace.
              Until then the receptionist sends the booking link but never names an open time, and this board shows only your hours and closures.
            </span>
          ) : (
            <span><b>Your calendar could not be read right now.</b> The address is saved; the last good read is what the receptionist is using. Check the address in Settings › Workspace if this keeps happening.</span>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("workspace"))}>{vm.feed.state === "none" ? "Connect" : "Check the address"}</button>
        </div>
      )}

      <div className="cal-scroll">
        <div className={`cal-grid ${view === "day" ? "cal-grid-day" : ""}`}>
          <div className="cal-corner" />
          {shown.map((d) => (
            <div key={d.key} className={`cal-dayhead ${d.today ? "today" : ""} ${view === "week" ? "clickable" : ""}`} title={view === "week" ? `Open ${d.dow} in Day view` : undefined} onClick={() => { if (view === "week") { setDayKey(d.key); setView("day"); } }} data-testid="cal-dayhead">
              <span className="cal-dow">{d.dow}</span>
              <span className="cal-date tabular">{d.date}</span>
              {d.today && <span className="cal-today-chip">Today</span>}
              {d.closed.yes && <span className="cal-closed-chip" title={d.closed.note || ""}>Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>}
              {d.allDay.map((b) => (
                <button key={b.id} className="cal-allday" onClick={() => setOpenId(b.id)} title={b.title}>{b.title}</button>
              ))}
            </div>
          ))}
          <div className="cal-gutter" style={{ height: gridH }}>
            {ticks.map((h) => (
              <span key={h} className="cal-hour tabular" style={{ top: (h - hours.start) * CR_HOUR_PX }}>{crHour(h).replace(":00", "")}</span>
            ))}
          </div>
          {shown.map((d) => (
            <div key={d.key} className={`cal-col ${d.today ? "today" : ""} ${d.past ? "past" : ""}`} style={{ height: gridH }} data-testid="cal-col">
              {d.bands.map((b, i) => (
                <div key={i} className={`cal-unavail ${b.from <= hours.start && b.to >= hours.end ? "full" : ""}`} style={{ top: (b.from - hours.start) * CR_HOUR_PX, height: (b.to - b.from) * CR_HOUR_PX }}>
                  {b.label && <span>{b.label}</span>}
                </div>
              ))}
              {d.windows.map((w, i) => <CrWindow key={i} w={w} hours={hours} />)}
              {d.blocks.map((b) => <CrBlock key={b.id} b={b} top={0} hours={hours} onOpen={(x) => setOpenId(x.id)} wide={view === "day"} />)}
              {d.today && vm.now !== null && vm.now >= hours.start && vm.now <= hours.end && (
                <div className="cal-nowline" style={{ top: (vm.now - hours.start) * CR_HOUR_PX }}><span className="cal-nowdot" /></div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="cal-legend" data-testid="cal-legend">
        <span><i className="cal-legend-swatch taken" /> Taken, from your calendar</span>
        <span><i className="cal-legend-swatch open" /> Open — the receptionist would offer it</span>
        <span><i className="cal-legend-swatch closed" /> Outside your hours, or closed</span>
        <span className="cal-legend-rules">{vm.rules} · times in {vm.timezone}</span>
      </div>

      {openBlock && <CrPanel b={openBlock.b} day={openBlock.d} feedLine={vm.feed.line} onClose={() => setOpenId(null)} />}
      {toastNode}
    </div>
  );
};

window.CalendarPage = (props) => {
  const Seed = window.CalendarSeed;
  if (window.__CALENDAR) return <CalendarReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};
