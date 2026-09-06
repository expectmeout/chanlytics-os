/* global React, Icon, StatStrip, StatCell */
// Calendar, real: the owner's calendar as the receptionist reads it.
//
// One loaded window of days, four views sliced from it. The page keeps two
// things: the view and the day it looks at (the anchor). Everything else is
// derived — the span a view needs, the frames it draws, the numbers in the
// strip — and a view's SHAPE comes from dates alone (seven columns, forty-two
// cells, fourteen rows) while its CONTENT comes from the window, so a switch
// is instant and a read that is still landing changes nothing but the words
// inside. Only a move outside the window reads again.
//
// Every block is the feed's, every band is the business's hours and
// closures, every dashed window is a time the receptionist would offer a
// caller — the same function the phone tool uses. Nothing is booked, moved
// or cancelled here: the booking link does that.

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
const crShift = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
};
const crMonthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 1, 12)));
};
const crShiftMonth = (key, n) => {
  const [y, m] = key.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
};
const crTyping = () => { const el = document.activeElement; return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); };

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

// One appointment: who it is for (by a phone in the event, else a whole
// name), what the calendar wrote, and the one rule — nothing changes here.
const CrPanel = ({ b, day, source, onFlash, onClose }) => {
  const contacts = b.contacts || { phones: [], emails: [] };
  const e164 = contacts.e164 || [];
  const found = [...contacts.phones, ...contacts.emails];
  const [adding, setAdding] = React.useState(false);
  const canEdit = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  // Get-or-create by phone, with the name the calendar gave; consent untouched.
  // The board is re-read afterwards, so this same panel then shows the person.
  const add = async () => {
    if (!window.__addPerson || adding || !e164.length) return;
    setAdding(true);
    const r = await window.__addPerson({ phone: e164[0], name: b.guess || null, source: "calendar" });
    setAdding(false);
    if (!r.ok) { onFlash({ msg: <>Could not add them — {r.message}</> }); return; }
    onFlash({ msg: <>{r.existed ? "Already in People" : "Added to People"}: <b>{b.guess || contacts.phones[0]}</b></> });
  };
  return (
    <div className="ask-overlay" onClick={onClose}>
      <div className="ask-modal cal-ev" onClick={(e) => e.stopPropagation()} data-testid="cal-panel">
        <section className="st-modal-section">
          <div className="st-modal-name">{b.title}</div>
          <div className="cal-ev-cancel-hint" style={{ marginTop: 4 }}>{day.long} · {b.time}</div>
          {b.person ? (
            <div className="cal-ev-who" data-testid="cal-panel-person">
              <Icon name="users" size={12} /> <b>{b.person.name}</b> is in People
              {b.person.via && <span className="cal-ev-via">matched by {b.person.via}</span>}
            </div>
          ) : found.length > 0 ? (
            <div className="cal-ev-who" data-testid="cal-panel-contact">
              <Icon name="users" size={12} /> Not in People yet
              <span className="cal-ev-via">{found.join(" · ")}</span>
              {canEdit && e164.length > 0 && (
                <button className="btn btn-primary btn-sm cal-ev-add" disabled={adding} onClick={add} data-testid="cal-panel-add">
                  {adding ? "Adding…" : `Add ${b.guess || contacts.phones[0]} to People`}
                </button>
              )}
            </div>
          ) : null}
          {b.location && <div className="cal-ev-detail" data-testid="cal-panel-where"><span className="cal-ev-detail-key">Where</span><span>{b.location}</span></div>}
          {b.description && <div className="cal-ev-desc" data-testid="cal-panel-desc">{b.description}</div>}
          <div className="cal-ev-note">From {source}. The receptionist treats this time as taken; to change or cancel it, edit it there.</div>
        </section>
        <footer className="st-modal-foot">
          <div className="cal-ev-foot-left">
            {b.person && (
              <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(`clients/${b.person.id}`)}>
                Open in People <Icon name="arrow-right" size={10} />
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
};

// The board: hours down, days across. Seven columns in Week, one in Day.
const CrBoard = ({ frames, hours, now, wide, fit, onDay, onOpen }) => {
  const gridH = (hours.end - hours.start) * CR_HOUR_PX;
  const ticks = [];
  for (let h = hours.start; h < hours.end; h++) ticks.push(h);
  return (
    <div className="cal-scroll">
      <div className={`cal-grid ${wide ? "cal-grid-day" : ""}`}>
        <div className="cal-corner" />
        {frames.map((d) => (
          <div key={d.key} className={`cal-dayhead ${d.today ? "today" : ""} ${!wide ? "clickable" : ""}`} title={!wide ? `Open ${d.dow} in Day view` : undefined} onClick={() => { if (!wide) onDay(d.key); }} data-testid="cal-dayhead">
            <span className="cal-dow">{d.dow}</span>
            <span className="cal-date tabular">{d.date}</span>
            {d.today && <span className="cal-today-chip">Today</span>}
            {d.closed.yes && <span className="cal-closed-chip" title={d.closed.note || ""}>Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>}
            {d.allDay.map((b) => (
              <button key={b.id} className="cal-allday" onClick={() => onOpen(b)} title={b.title}>{b.title}</button>
            ))}
          </div>
        ))}
        <div className="cal-gutter" style={{ height: gridH }}>
          {ticks.map((h) => (
            <span key={h} className="cal-hour tabular" style={{ top: (h - hours.start) * CR_HOUR_PX }}>{crHour(h).replace(":00", "")}</span>
          ))}
        </div>
        {frames.map((d) => (
          <div key={d.key} className={`cal-col ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.loading ? "loading" : ""}`} style={{ height: gridH }} data-testid="cal-col">
            {d.bands.map((b, i) => (
              <div key={i} className={`cal-unavail ${b.from <= hours.start && b.to >= hours.end ? "full" : ""}`} style={{ top: (b.from - hours.start) * CR_HOUR_PX, height: (b.to - b.from) * CR_HOUR_PX }}>
                {b.label && <span>{b.label}</span>}
              </div>
            ))}
            {d.windows.filter(fit).map((w, i) => <CrWindow key={i} w={w} hours={hours} />)}
            {d.blocks.map((b) => <CrBlock key={b.id} b={b} hours={hours} onOpen={onOpen} wide={wide} />)}
            {d.today && now !== null && now >= hours.start && now <= hours.end && (
              <div className="cal-nowline" style={{ top: (now - hours.start) * CR_HOUR_PX }}><span className="cal-nowdot" /></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// The month: six weeks of counts. A day says how much is taken and how
// many windows are open; closed days say why. Click a day to see it.
const CrMonth = ({ frames, monthKey, feedOk, fit, onDay }) => {
  const rows = [];
  for (let i = 0; i < frames.length; i += 7) rows.push(frames.slice(i, i + 7));
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
              <button key={d.key} className={`cal-month-cell ${inMonth ? "" : "muted"} ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.closed.yes ? "closed" : ""} ${d.loading ? "loading" : ""}`} onClick={() => onDay(d.key)} title={d.long} data-testid="cal-month-cell">
                <span className="cal-month-num tabular">{d.dayNum}</span>
                {d.closed.yes && <span className="cal-month-closed">{d.closed.note ? `Closed · ${d.closed.note}` : "Closed"}</span>}
                {!d.closed.yes && !d.loading && feedOk && (
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

// The agenda: days as a list — what is taken, then what the receptionist
// would offer — the way a phone-first owner reads a day.
const CrAgenda = ({ frames, feedOk, fit, service, onOpen }) => (
  <div className="cal-agenda" data-testid="cal-agenda">
    {frames.map((d) => {
      const windows = d.windows.filter(fit);
      const items = [...d.allDay, ...d.blocks];
      return (
        <div key={d.key} className={`cal-agenda-day ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.loading ? "loading" : ""}`} data-testid="cal-agenda-day">
          <div className="cal-agenda-head">
            <span className="cal-dow">{d.dow}</span>
            <span className="cal-date tabular">{d.date}</span>
            {d.today && <span className="cal-today-chip">Today</span>}
            {d.closed.yes && <span className="cal-closed-chip">Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>}
          </div>
          {items.length > 0 && (
            <div className="cal-agenda-items">
              {items.map((b) => (
                <button key={b.id} className="cal-agenda-item" onClick={() => onOpen(b)}>
                  <span className="cal-agenda-time tabular">{b.time}</span>
                  <span className="cal-agenda-title">{b.title}</span>
                  {b.person && <span className="cal-agenda-person">{b.person.name}</span>}
                </button>
              ))}
            </div>
          )}
          {!d.loading && !d.closed.yes && feedOk && items.length === 0 && <div className="cal-agenda-empty">Nothing on the calendar.</div>}
          {!d.loading && !d.closed.yes && feedOk && !d.past && (
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
  const [anchorKey, setAnchorKey] = React.useState(null);
  const [openId, setOpenId] = React.useState(null);
  const [pending, setPending] = React.useState(false);
  const [serviceName, setServiceName] = React.useState("");
  const [toastNode, flash] = window.usePPToast();
  const vm = C ? C.vm : null;
  const cal = window.__calendar;
  const anchor = anchorKey || (vm ? vm.today : null);

  // What the view needs, from the anchor alone; whether the window has it.
  const span = vm && cal ? cal.spanFor(view, anchor) : null;
  const covered = !!(vm && cal && span && cal.covers(vm.days, span.from, span.days));

  // Read only when the window does not cover the view. The frames below
  // already have their shape, so nothing jumps when the read lands.
  React.useEffect(() => {
    if (!vm || !cal) return undefined;
    if (covered) { setPending(false); return undefined; }
    let on = true;
    setPending(true);
    cal.ensure(view, anchor).then((ok) => {
      if (!on) return;
      setPending(false);
      if (!ok) flash({ msg: <>Those days could not be read right now.</> });
    });
    return () => { on = false; };
  }, [view, anchor, covered]); // eslint-disable-line react-hooks/exhaustive-deps

  // ← → move, T is today — unless the person is typing.
  React.useEffect(() => {
    const onKey = (e) => {
      if (!vm || e.metaKey || e.ctrlKey || e.altKey || crTyping()) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
      else if (e.key === "t" || e.key === "T") { e.preventDefault(); setAnchorKey(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!vm || !cal) return null;

  const byKey = new Map(vm.days.map((d) => [d.key, d]));
  const frames = [];
  for (let i = 0; i < span.days; i++) {
    const k = crShift(span.from, i);
    frames.push(byKey.get(k) || { ...cal.frameOf(k, vm.today), loading: true, closed: { yes: false, note: null }, bands: [], blocks: [], allDay: [], windows: [] });
  }
  const shown = view === "day" ? frames.filter((f) => f.key === anchor) : frames;
  const feedOk = vm.feed.state === "ok";
  const service = vm.services.find((s) => s.name === serviceName) || null;
  const fit = (w) => !service || !service.duration || w.dur >= service.duration;
  const monthKey = view === "month" ? anchor.slice(0, 7) : null;

  const move = (n) => {
    if (view === "month") setAnchorKey(crShiftMonth(anchor, n));
    else if (view === "agenda") setAnchorKey(crShift(anchor, 14 * n));
    else setAnchorKey(crShift(anchor, 7 * n));
  };
  const openDay = (key) => { setAnchorKey(key); setView("day"); };
  const first = frames[0];
  const last = frames[frames.length - 1];
  const label = view === "day" && shown[0] ? `${shown[0].dow} · ${shown[0].date}` : view === "month" ? crMonthLabel(anchor) : `${first.date} – ${last.key.slice(0, 7) === first.key.slice(0, 7) ? last.date.replace(/^[A-Za-z]+ /, "") : last.date}`;
  const statLabel = view === "day" && shown[0] ? shown[0].dow : view === "month" ? "This month" : view === "agenda" ? "Next 14 days" : "This week";
  const scope = view === "month" ? frames.filter((f) => f.key.slice(0, 7) === monthKey) : shown;
  const statEvents = scope.reduce((a, d) => a + d.blocks.length + d.allDay.length, 0);
  const statWindows = scope.reduce((a, d) => a + d.windows.filter(fit).length, 0);
  const openBlock = openId ? vm.days.flatMap((d) => [...d.blocks, ...d.allDay].map((b) => ({ b, d }))).find((x) => x.b.id === openId) : null;
  const onToday = view === "month" ? anchor.slice(0, 7) === vm.today.slice(0, 7) : view === "week" ? shown.some((d) => d.today) : anchor === vm.today;

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
          <button className="btn btn-ghost btn-icon btn-sm cal-nav" title="Previous (←)" aria-label="Previous" onClick={() => move(-1)} data-testid="cal-prev">‹</button>
          <span className="cal-week-range" data-testid="cal-range">{label}</span>
          <button className="btn btn-ghost btn-icon btn-sm cal-nav" title="Next (→)" aria-label="Next" onClick={() => move(1)} data-testid="cal-next">›</button>
          <button className="btn btn-ghost btn-sm cal-today-btn" title="Today (T)" onClick={() => setAnchorKey(null)} disabled={onToday} data-testid="cal-today">Today</button>
          <input className="cal-jump" type="date" aria-label="Go to a date" onChange={(e) => { if (e.target.value) setAnchorKey(e.target.value); }} data-testid="cal-jump" />
          <div className="cl-tabs">
            {CR_VIEWS.map(([id, l]) => <button key={id} className={`cl-tab ${view === id ? "active" : ""}`} aria-pressed={view === id} onClick={() => setView(id)} data-testid={`cal-view-${id}`}>{l}</button>)}
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

      <div key={view} className={`cal-body ${pending ? "is-loading" : ""}`} aria-busy={pending ? "true" : "false"} data-testid="cal-body">
        {view === "month" && <CrMonth frames={frames} monthKey={monthKey} feedOk={feedOk} fit={fit} onDay={openDay} />}
        {view === "agenda" && <CrAgenda frames={frames} feedOk={feedOk} fit={fit} service={service} onOpen={(b) => setOpenId(b.id)} />}
        {(view === "week" || view === "day") && <CrBoard frames={shown} hours={vm.hours} now={vm.now} wide={view === "day"} fit={fit} onDay={openDay} onOpen={(b) => setOpenId(b.id)} />}
      </div>

      <div className="cal-legend" data-testid="cal-legend">
        <span><i className="cal-legend-swatch taken" /> Taken, from your calendar</span>
        <span><i className="cal-legend-swatch open" /> Open — the receptionist would offer it{service ? ` for ${service.name}` : ""}</span>
        <span><i className="cal-legend-swatch closed" /> Outside your hours, or closed</span>
        <span className="cal-legend-rules">← → move · T today · times in {vm.timezone}</span>
      </div>

      {openBlock && <CrPanel b={openBlock.b} day={openBlock.d} source={vm.feed.source || "your calendar"} onFlash={flash} onClose={() => setOpenId(null)} />}
      {toastNode}
    </div>
  );
};

window.CalendarPage = (props) => {
  const Seed = window.CalendarSeed;
  if (window.__CALENDAR) return <CalendarReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};
