/* global React, Icon, FailedRead, AgendaItem, AgendaItems, AgendaOpen, useSurface */
// The day: today and tomorrow from the calendar the receptionist reads — who
// is coming and when, what is open, what is closed — and the visit
// playbooks' line. Reads the calendar and playbooks surfaces the page already
// holds, and People for a visit that needs someone and a person's channel --
// People lands last on a cold boot (surface-registry.ts ROUTE_DRAWS), so the
// card redraws on it too; the words are contracts/today.ts todayDay, published
// by the bridge as window.__today. Silent without a feed -- that is the Calendar page's
// card to make -- but never silent about a feed it HAS and could not read.
// An appointment opens its person when the calendar names one, else the
// Calendar; nothing is booked or changed from here. Five rows at most, the
// rest a line to the Calendar (contracts TODAY_DAY_MAX); a calendar read that
// failed says so where the day would be.
//
// At its head, the steps due (0007, amended): whose next step's day has come
// or gone, the oldest first, three at most and a line to People's Steps due
// for the rest (contracts todaySteps, TODAY_STEPS_MAX). In every workspace,
// calendar or not: with no day to draw, the panel is the steps alone.
// The bridge's surface, or the mockup's sample of it (dashboard-a-brief.jsx todaySurface); the global itself where that file is not loaded.
const tdSurface = (key) => (window.todaySurface ? window.todaySurface(key) : window[key]);

// The steps due, as contracts says them, in the day's own frame: each opens its person. Hookless.
const TodaySteps = ({ vm, nav }) => (
  <div className="td-frame td-steps" data-testid="today-steps">
    <div className="td-frame-head"><span className="td-frame-label">{vm.title}</span></div>
    <ul className="td-steps-list">
      {vm.items.map((s) => (
        <li key={s.personId}>
          <button type="button" className="td-step" onClick={() => nav(`clients/${s.personId}`)} data-testid="today-step">
            <span className="td-step-who">{s.name}</span>
            <span className="td-step-words">{s.words}</span>
            {s.forWho ? <span className="td-step-for">{s.forWho}</span> : null}
            <span className="td-step-when" data-due={s.due}>{s.when}</span>
          </button>
        </li>
      ))}
    </ul>
    {vm.more ? (
      <button type="button" className="td-day-more" onClick={() => nav(vm.more.to)} data-testid="today-steps-more">
        <span>{vm.more.words}</span>
        <Icon name="arrow-right" size={10} />
      </button>
    ) : null}
  </div>
);

const TodayDay = () => {
  useSurface(["calendar", "playbooks", "people"]);
  const C = tdSurface("__CALENDAR");
  const P = tdSurface("__PLAYBOOKS");
  const people = tdSurface("__PEOPLE");
  const go = (to) => window.appNavigate && window.appNavigate(to);
  const tz = window.__clock && window.__clock.zone ? window.__clock.zone() : "UTC";
  // Judged as every page judges a step: at the moment People's rows were published, as its own Steps due is.
  const stepsVm = people && window.__today && window.__today.steps ? window.__today.steps(people.rows, people.fetchedAt || Date.now(), tz) : null;
  const steps = stepsVm ? <TodaySteps vm={stepsVm} nav={go} /> : null;
  // No day to draw: the panel is the steps alone, where any are due.
  const stepsOnly = steps ? <section className="td-day" data-testid="today-day-steps">{steps}</section> : null;
  // The read failed, and the module would otherwise be silent about it: FailedRead, with the one Retry, where the day goes.
  if (!C && window.__surfaceFailed && window.__surfaceFailed("calendar")) {
    return (
      <section className="td-day" data-testid="today-day-failed">
        {steps}
        <FailedRead kind="card" what="the calendar" body="The queue and the day's numbers are current." surface="calendar" testid="today-day-failed-read" />
      </section>
    );
  }
  if (!C || !C.vm || !window.__today) return stepsOnly;
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  // A calendar IS connected and could not be read. This returned null, and the card was simply not there --
  // a working day and a broken feed looked identical, which is how a bad address went two rounds unnoticed.
  // It says so now, where the day goes, in the feed's own words, with the one Retry and the door to the
  // address. The numbers beside it are from other reads and are still true, so the card says that too.
  if (C.vm.feed.state === "unavailable") {
    return (
      <section className="td-day" data-testid="today-day-unreadable">
        {steps}
        <FailedRead
          kind="card"
          what="the calendar"
          why={C.vm.feed.problem}
          body="The queue and the day's numbers are current."
          surface="calendar"
          also={{ label: "Open Calendar", onClick: () => nav("calendar"), testid: "today-day-unreadable-open" }}
          testid="today-day-unreadable-read"
        />
      </section>
    );
  }
  // No calendar connected: silent on purpose. Nothing has failed, there is nothing to retry, and the invitation
  // to connect one is the Calendar page's card to make -- not a fault reported on a page about today's work.
  if (C.vm.feed.state !== "ok") return stepsOnly;
  const vm = window.__today.day(C.vm, P ? P.rows : null, people || null);
  if (!vm.frames.length) return stepsOnly;
  const open = (b) => nav(b.person ? `clients/${b.person.id}` : "calendar");
  // The channel a known person uses, as People knows it: a chat, or calls only.
  const peopleRows = people ? people.rows : [];
  const glyphFor = (b) => {
    if (!b.person) return null;
    const r = peopleRows.find((x) => x.id === b.person.id);
    return !r ? null : r.hasChat ? "chat" : r.calls > 0 ? "phone" : null;
  };
  return (
    <section className="td-day" data-testid="today-day">
      <div className="td-day-head">
        <span className="td-day-title">The day</span>
        <span className="td-day-sub">{vm.nextOpening ? `next open time ${vm.nextOpening}` : ""}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => nav("calendar")}>Open Calendar <Icon name="arrow-right" size={11} /></button>
      </div>
      {steps}
      {vm.frames.map((d) => (
        <div key={d.key} className={`td-frame ${d.today ? "today" : ""}`} data-testid="today-day-frame">
          <div className="td-frame-head">
            <span className="td-frame-label">{d.label}</span>
            {d.closed.yes
              ? <span className="td-frame-note">Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>
              : d.summary && <span className="td-frame-note tabular">{d.summary.booked}{d.summary.flagged && <> · <b className="warn">{d.summary.flagged}</b></>}</span>}
          </div>
          {/* The one row every list of appointments wears (components/day-agenda.jsx): the start in a column, a
              rail with the now marker, who it is for with what it is for and how long under them, and a red line
              when that person's thread needs someone. Nobody matched means the service is the headline itself.
              `service` is the title with the person's name taken out of it, so the row says them once. */}
          {d.items.length > 0 ? (
            <AgendaItems>
              {d.items.map((b) => (
                <AgendaItem
                  key={b.id}
                  time={b.start}
                  name={b.person ? b.person.name : b.service}
                  service={b.person ? b.service : null}
                  dur={b.dur}
                  flag={b.flag}
                  glyph={glyphFor(b)}
                  phase={b.phase}
                  onOpen={() => open(b)}
                  hint={`${b.time}${b.person ? ` · open ${b.person.name}` : " · open the Calendar"}`}
                  testid="today-day-item"
                />
              ))}
            </AgendaItems>
          ) : (!d.closed.yes && <div className="td-empty">Nothing on the calendar.</div>)}
          {/* The cap's tail: contracts says how many the five rows left out. */}
          {d.more > 0 && (
            <button className="td-day-more" onClick={() => nav("calendar")} data-testid="today-day-more">
              <span>{d.moreLine}</span>
              <Icon name="arrow-right" size={10} />
            </button>
          )}
          {d.open.length > 0 && (
            <AgendaOpen>
              {d.open.map((w) => <span key={w} className="ag-window">{w}</span>)}
            </AgendaOpen>
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
