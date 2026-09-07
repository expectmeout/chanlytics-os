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
  const vm = window.__today.day(C.vm, P ? P.rows : null, window.__PEOPLE || null);
  if (!vm.frames.length) return null;
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const open = (b) => nav(b.person ? `clients/${b.person.id}` : "calendar");
  // The channel a known person uses, as People knows it: a chat, or calls only.
  const peopleRows = window.__PEOPLE ? window.__PEOPLE.rows : [];
  const glyphFor = (b) => {
    if (!b.person) return null;
    const r = peopleRows.find((x) => x.id === b.person.id);
    return !r ? null : r.hasChat ? "chat" : r.calls > 0 ? "phone" : null;
  };
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
              : d.summary && <span className="td-frame-note tabular">{d.summary.booked}{d.summary.flagged && <> · <b className="warn">{d.summary.flagged}</b></>}</span>}
          </div>
          {/* The schedule as the mockup drew it, with only what the calendar and
              People hold: the start in a column, a rail with the now marker,
              the name first (the title when nobody is named), the service and
              its length under it, a red line when that person's thread needs
              someone. Long words wrap in their own column; nothing is squeezed. */}
          {d.items.length > 0 ? (
            <div className="td-items">
              {d.items.map((b) => {
                const glyph = glyphFor(b);
                return (
                  <button key={b.id} className={`td-item ${b.phase}${b.flag ? " flagged" : ""}`} onClick={() => open(b)} title={`${b.time}${b.person ? ` · open ${b.person.name}` : " · open the Calendar"}`} data-testid="today-day-item" data-phase={b.phase}>
                    <span className="td-item-time">{b.start}</span>
                    <span className="td-item-rail" aria-hidden="true" />
                    <span className="td-item-body">
                      <span className="td-item-title">{b.person ? b.person.name : b.title}</span>
                      {(b.person || b.dur) && <span className="td-item-sub">{b.person ? `${b.title}${b.dur ? ` · ${b.dur}` : ""}` : b.dur}</span>}
                      {b.flag && <span className="td-item-flag">{b.flag}</span>}
                    </span>
                    {glyph && <span className="td-item-glyph"><Icon name={glyph} size={11} /></span>}
                  </button>
                );
              })}
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
