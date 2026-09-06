/* global React, Icon, StatStrip, StatCell */
// Calendar, real: the owner's calendar as the receptionist reads it. Four
// ways to look at the same truth — a week and a day on the seeded page's
// board (hours down, days across), a month of counts, and an agenda — where
// every block is the feed's, every band is the business's own hours and
// closures, and every dashed window is a time the receptionist would offer
// a caller, computed by the same function the phone tool uses. Settings
// speaks here too: the hours, the closures ahead, the booking rules, the
// services and how long they take, each a click from where it is edited.
// Nothing is booked, moved or cancelled here: the booking link does that.

const useCalendar = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:calendar", bump);
    return () => window.removeEventListener("surface:calendar", bump);
  }, []);
  return window.__CALENDAR;
};

const CR_HOUR_PX = 64;
const CR_VIEWS = [["week", "Week"], ["day", "Day"], ["month", "Month"], ["agenda", "Agenda"]];
const crHour = (t) => {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  const ap = h >= 12 && h < 24 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""} ${ap}`;
};
// Day keys, in the browser: the same arithmetic the contracts use.
const crShift = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
};
const crMonday = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return crShift(key, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
};
const crMonthSpan = (key) => ({ from: crMonday(`${key.slice(0, 7)}-01`), days: 42 });
const crShiftMonth = (key, n) => {
  const [y, m] = key.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
};
const crPeople = (n) => `${n} ${n === 1 ? "appointment" : "appointments"}`;

// One taken block from the feed. Neutral, never an agent's colour: the
// calendar did not say who booked it, only that the time is taken.
const CrBlock = ({ b, hours, onOpen, wide }) => {
  const y = (Math.max(hours.start, b.t) - hours.start) * CR_HOUR_PX;
  const h = Math.max(22, (Math.min(hours.end, b.t + b.dur / 60) - Math.max(hours.start, b.t)) * CR_HOUR_PX - 2);
  return (
    <button className="cal-appt feed" style={{ top: y, height: h }} onClick={() => onOpen(b)} title={`${b.title} · ${b.time}`} data-testid="cal-block">
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

// The month: six weeks of counts. A day says how much is taken and how
// many windows are open; closed days say why. Click a day to see it.
const CrMonth = ({ vm, monthKey, feedOk, fit, onDay }) => {
  const rows = [];
  for (let i = 0; i < vm.days.length; i += 7) rows.push(vm.days.slice(i, i + 7));
  return (
    <div className="cal-month" data-testid="cal-month">
      <div className="cal-month-head">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}</div>
      {rows.map((row, r) => (
        <div key={r} className="cal-month-row">
          {row.map((d) => {
            const taken = d.blocks.length + d.allDay.length;
            const open = d.windows.filter(fit).length;
            const inMonth = d.key.slice(0, 7) === monthKey;
            return (
              <button key={d.key} className={`cal-month-cell ${inMonth ? "" : "muted"} ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.closed.yes ? "closed" : ""}`} onClick={() => onDay(d.key)} title={d.long} data-testid="cal-month-cell">
                <span className="cal-month-num tabular">{d.dayNum}</span>
                {d.closed.yes && <span className="cal-month-closed">{d.closed.note ? `Closed · ${d.closed.note}` : "Closed"}</span>}
                {!d.closed.yes && feedOk && (
                  <span className="cal-month-counts">
                    {taken > 0 && <span className="cal-month-taken">{taken} taken</span>}
                    {open > 0 && !d.past && <span className="cal-month-open">{open} open</span>}
                    {taken === 0 && (open === 0 || d.past) && <span className="cal-month-none">—</span>}
                  </span>
                )}
                {d.allDay.slice(0, 2).map((b) => <span key={b.id} className="cal-month-allday" title={b.title}>{b.title}</span>)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// The agenda: the next days as a list — what is taken, then what the
// receptionist would offer — the way a phone-first owner reads a day.
const CrAgenda = ({ vm, feedOk, fit, service, onOpen }) => (
  <div className="cal-agenda" data-testid="cal-agenda">
    {vm.days.map((d) => {
      const windows = d.windows.filter(fit);
      const items = [...d.allDay, ...d.blocks];
      return (
        <div key={d.key} className={`cal-agenda-day ${d.today ? "today" : ""} ${d.past ? "past" : ""}`} data-testid="cal-agenda-day">
          <div className="cal-agenda-head">
            <span className="cal-dow">{d.dow}</span>
            <span className="cal-date tabular">{d.date}</span>
            {d.today && <span className="cal-today-chip">Today</span>}
            {d.closed.yes && <span className="cal-closed-chip">Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>}
          </div>
          {items.length > 0 && (
            <div className="cal-agenda-items">
              {items.map((b) => (
                <button key={b.id} className="cal-agenda-item" onClick={() => onOpen(b, d)}>
                  <span className="cal-agenda-time tabular">{b.time}</span>
                  <span className="cal-agenda-title">{b.title}</span>
                  {b.person && <span className="cal-agenda-person">{b.person.name}</span>}
                </button>
              ))}
            </div>
          )}
          {!d.closed.yes && feedOk && items.length === 0 && <div className="cal-agenda-empty">Nothing on the calendar.</div>}
          {!d.closed.yes && feedOk && !d.past && (
            <div className="cal-agenda-open">
              <span className="cal-agenda-open-label">Open{service ? ` for ${service.name}` : ""}:</span>
              {windows.length ? windows.map((w) => <span key={w.label} className="cal-agenda-window">{w.label}</span>) : <span className="cal-agenda-none">{service && service.consultFirst ? "the receptionist books a consultation for this, not the service" : "nothing the receptionist would offer"}</span>}
            </div>
          )}
        </div>
      );
    })}
  </div>
);

const CalendarReal = () => {
  const C = useCalendar();
  const [view, setView] = React.useState("week");
  const [dayKey, setDayKey] = React.useState(null);
  const [openId, setOpenId] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [serviceName, setServiceName] = React.useState("");
  const [toastNode, flash] = window.usePPToast();
  const fetchedAt = C ? C.fetchedAt : 0;
  React.useEffect(() => { setBusy(false); }, [fetchedAt]);
  if (!C) return null;
  const vm = C.vm;
  const feedOk = vm.feed.state === "ok";
  const hours = vm.hours;
  const gridH = (hours.end - hours.start) * CR_HOUR_PX;
  const ticks = [];
  for (let h = hours.start; h < hours.end; h++) ticks.push(h);
  const spanDays = vm.days.length;
  const anchor = dayKey && vm.days.some((d) => d.key === dayKey) ? dayKey : (vm.days.find((d) => d.today) || vm.days[0] || { key: vm.from }).key;
  const monthKey = (spanDays >= 28 ? crShift(vm.from, 7) : vm.from).slice(0, 7);
  const service = vm.services.find((s) => s.name === serviceName) || null;
  // Windows that fit the service asked for — the same rule the assistant applies for "for a balayage".
  const fit = (w) => !service || !service.duration || w.dur >= service.duration;

  const go = async (from, days) => {
    if (!window.__calendar || busy) return;
    setBusy(true);
    const ok = await window.__calendar.goTo(from, days);
    if (!ok) { setBusy(false); flash({ msg: <>That span could not be read — still showing {vm.rangeLabel}.</> }); }
  };
  const pick = (v) => {
    setView(v);
    if (v === "month" && spanDays < 28) go(crMonthSpan(anchor).from, 42);
    else if ((v === "week" || v === "day") && spanDays !== 7) go(crMonday(anchor), 7);
    else if (v === "agenda" && (vm.from !== vm.today || spanDays !== 14)) go(vm.today, 14);
  };
  const shift = (n) => {
    if (view === "month") go(crMonthSpan(crShiftMonth(`${monthKey}-01`, n)).from, 42);
    else if (view === "agenda") go(crShift(vm.from, 14 * n), 14);
    else go(crShift(vm.from, 7 * n), 7);
  };
  const today = () => {
    setDayKey(vm.today);
    if (view === "month") go(crMonthSpan(vm.today).from, 42);
    else if (view === "agenda") go(vm.today, 14);
    else go(null, 7);
  };
  const jump = (key) => {
    if (!key) return;
    setDayKey(key);
    if (view === "month") go(crMonthSpan(key).from, 42);
    else if (view === "agenda") go(key, 14);
    else go(crMonday(key), 7);
  };
  const openDay = (key) => { setDayKey(key); setView("day"); if (spanDays !== 7 || !vm.days.some((d) => d.key === key)) go(crMonday(key), 7); };

  const shown = view === "day" ? vm.days.filter((d) => d.key === anchor).slice(0, 1) : vm.days.slice(0, 7);
  const label = view === "day" && shown[0] ? `${shown[0].dow} · ${shown[0].date}` : view === "month" ? vm.monthLabel : vm.rangeLabel;
  const statLabel = view === "day" && shown[0] ? shown[0].dow : view === "month" ? "This month" : view === "agenda" ? "Next 14 days" : "This week";
  const statEvents = view === "day" && shown[0] ? shown[0].blocks.length + shown[0].allDay.length : vm.stats.events;
  const statWindows = view === "day" && shown[0] ? shown[0].windows.filter(fit).length : vm.days.reduce((a, d) => a + d.windows.filter(fit).length, 0);
  const openBlock = openId ? vm.days.flatMap((d) => [...d.blocks, ...d.allDay].map((b) => ({ b, d }))).find((x) => x.b.id === openId) : null;
  const todayInSpan = vm.days.some((d) => d.today);

  return (
    <div className="calendar" data-testid="calendar-real">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Calendar</div>
          <div className="cl-page-sub">Your calendar as the receptionist reads it — what is taken, when you are open, and the times it would offer a caller. Booking happens through your link, whichever tool is behind it.</div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label={statLabel} value={statEvents} meta={vm.feed.present ? "on your calendar" : "no calendar connected"} />
          <StatCell label="Open windows" tip="Times the receptionist would offer, after your hours, closures, booking rules and what is taken" value={feedOk ? statWindows : "—"} meta={feedOk ? (service ? `that fit ${service.name}` : "it would offer these") : "needs the calendar"} />
          <StatCell label="Next opening" value={feedOk ? vm.stats.next : "—"} meta={feedOk ? vm.rules.replace(/^Offers times /, "") : "needs the calendar"} />
        </StatStrip>
      </div>

      <div className="cl-controls">
        <div className="cal-weeklabel">
          <button className="btn btn-ghost btn-icon btn-sm cal-nav" title="Previous" aria-label="Previous" onClick={() => shift(-1)} disabled={busy} data-testid="cal-prev">‹</button>
          <span className="cal-week-range" data-testid="cal-range">{label}</span>
          <button className="btn btn-ghost btn-icon btn-sm cal-nav" title="Next" aria-label="Next" onClick={() => shift(1)} disabled={busy} data-testid="cal-next">›</button>
          {!todayInSpan && <button className="btn btn-ghost btn-sm" onClick={today} disabled={busy}>Today</button>}
          <input className="cal-jump" type="date" aria-label="Go to a date" onChange={(e) => jump(e.target.value)} disabled={busy} data-testid="cal-jump" />
          <div className="cl-tabs">
            {CR_VIEWS.map(([id, l]) => <button key={id} className={`cl-tab ${view === id ? "active" : ""}`} onClick={() => pick(id)} data-testid={`cal-view-${id}`}>{l}</button>)}
          </div>
        </div>
        <div className="cl-controls-right">
          {vm.services.length > 0 && (
            <select className="tpl-select cal-service" value={serviceName} onChange={(e) => setServiceName(e.target.value)} aria-label="Windows that fit a service" data-testid="cal-service">
              <option value="">Any service</option>
              {vm.services.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}
            </select>
          )}
          <span className={`cal-feed-chip ${vm.feed.state}`} data-testid="cal-feed">
            <span className="cal-sync-dot" />
            {vm.feed.line}
          </span>
        </div>
      </div>

      <div className="cal-rules" data-testid="cal-rules">
        <span className="cal-rules-group">
          <span className="cal-rules-label">Hours</span>
          {vm.hoursLines.length ? vm.hoursLines.join(" · ") : "not set yet"}
        </span>
        <span className="cal-rules-group">
          <span className="cal-rules-label">Closed</span>
          {vm.closuresAhead.length ? vm.closuresAhead.map((c) => `${c.label}${c.note ? ` ${c.note}` : ""}`).join(" · ") : "no closures ahead"}
        </span>
        <span className="cal-rules-group">
          <span className="cal-rules-label">Rules</span>
          {vm.rules.replace(/^Offers times /, "")}
        </span>
        <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("workspace"))}>Edit in Settings <Icon name="arrow-right" size={10} /></button>
      </div>
      {service && service.consultFirst && (
        <div className="cal-feed-card" data-testid="cal-consult-note">
          <Icon name="shield" size={14} />
          <span><b>{service.name} needs a consultation first.</b> The receptionist does not offer times for it; it offers the consultation and sends the booking link.</span>
        </div>
      )}

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

      {view === "month" && <CrMonth vm={vm} monthKey={monthKey} feedOk={feedOk} fit={fit} onDay={openDay} />}
      {view === "agenda" && <CrAgenda vm={vm} feedOk={feedOk} fit={fit} service={service} onOpen={(b) => setOpenId(b.id)} />}

      {(view === "week" || view === "day") && (
        <div className="cal-scroll">
          <div className={`cal-grid ${view === "day" ? "cal-grid-day" : ""}`}>
            <div className="cal-corner" />
            {shown.map((d) => (
              <div key={d.key} className={`cal-dayhead ${d.today ? "today" : ""} ${view === "week" ? "clickable" : ""}`} title={view === "week" ? `Open ${d.dow} in Day view` : undefined} onClick={() => { if (view === "week") openDay(d.key); }} data-testid="cal-dayhead">
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
                {d.windows.filter(fit).map((w, i) => <CrWindow key={i} w={w} hours={hours} />)}
                {d.blocks.map((b) => <CrBlock key={b.id} b={b} hours={hours} onOpen={(x) => setOpenId(x.id)} wide={view === "day"} />)}
                {d.today && vm.now !== null && vm.now >= hours.start && vm.now <= hours.end && (
                  <div className="cal-nowline" style={{ top: (vm.now - hours.start) * CR_HOUR_PX }}><span className="cal-nowdot" /></div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cal-legend" data-testid="cal-legend">
        <span><i className="cal-legend-swatch taken" /> Taken, from your calendar</span>
        <span><i className="cal-legend-swatch open" /> Open — the receptionist would offer it{service ? ` for ${service.name}` : ""}</span>
        <span><i className="cal-legend-swatch closed" /> Outside your hours, or closed</span>
        <span className="cal-legend-rules">times in {vm.timezone}</span>
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
