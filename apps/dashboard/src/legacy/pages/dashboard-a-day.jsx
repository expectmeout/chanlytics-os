/* global React, Icon */
// The day: today and tomorrow from the calendar the receptionist reads — who
// is coming and when, what is open, what is closed — and the visit
// playbooks' line. Reads the calendar and playbooks surfaces the page already
// holds; the words are contracts/today.ts todayDay, published by the bridge
// as window.__today. Silent without a feed: that is the Calendar page's card.
// An appointment opens its person when the calendar names one, else the
// Calendar; nothing is booked or changed from here.
const useTdTick = (key) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const names = key.split(",");
    names.forEach((n) => window.addEventListener(n, bump));
    return () => names.forEach((n) => window.removeEventListener(n, bump));
  }, [key]);
};

const TodayDay = () => {
  useTdTick("surface:calendar,surface:playbooks");
  const C = window.__CALENDAR;
  const P = window.__PLAYBOOKS;
  if (!C || !C.vm || C.vm.feed.state !== "ok" || !window.__today) return null;
  const vm = window.__today.day(C.vm, P ? P.rows : null);
  if (!vm.frames.length) return null;
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const open = (b) => nav(b.person ? `clients/${b.person.id}` : "calendar");
  return (
    <section className="td-day" data-testid="today-day">
      <div className="td-day-head">
        <span className="td-day-title">The day</span>
        <span className="td-day-sub">{vm.nextOpening ? `next opening ${vm.nextOpening}` : ""}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => nav("calendar")}>Open Calendar <Icon name="arrow-right" size={11} /></button>
      </div>
      {vm.frames.map((d) => (
        <div key={d.key} className={`td-frame ${d.today ? "today" : ""}`} data-testid="today-day-frame">
          <div className="td-frame-head">
            <span className="td-frame-label">{d.label}</span>
            {d.closed.yes
              ? <span className="td-frame-note">Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>
              : d.items.length > 0 && <span className="td-frame-note tabular">{d.items.length} booked</span>}
          </div>
          {/* Time beside, title and person stacked: a long title wraps under
              itself instead of into a three-line column, and a long name
              never squeezes the title. The column is 320px wide; the words
              on it are whatever the business's calendar says. */}
          {d.items.length > 0 ? (
            <div className="td-items">
              {d.items.map((b) => (
                <button key={b.id} className="td-item" onClick={() => open(b)} title={b.person ? `Open ${b.person.name}` : "Open the Calendar"} data-testid="today-day-item">
                  <span className="td-item-time tabular">{b.allDay ? "All day" : b.time}</span>
                  <span className="td-item-title">{b.title}</span>
                  {b.person && <span className="td-item-person">{b.person.name}</span>}
                </button>
              ))}
            </div>
          ) : (!d.closed.yes && <div className="td-empty">Nothing on the calendar.</div>)}
          {d.open.length > 0 && (
            <div className="td-open">
              <span className="td-open-label">Open</span>
              {d.open.map((w) => <span key={w} className="td-window">{w}</span>)}
            </div>
          )}
        </div>
      ))}
      {vm.reminders && (
        <button className="td-day-foot" onClick={() => nav(vm.reminders.to)} data-testid="today-day-reminders">
          <Icon name="bolt" size={11} />
          <span>{vm.reminders.text}</span>
          <Icon name="arrow-right" size={10} />
        </button>
      )}
    </section>
  );
};

window.TodayDay = TodayDay;
