/* global React, Icon */
// Below the queue and the day: the last period as Reports counts it, where
// people are on the way to a booking, and what happened while the owner was
// away. Each reads a surface the page already holds — Reports, People, the
// bell — and the words are contracts/today.ts todayWeek / todayJourney /
// todayAway through window.__today. Nothing is computed on the page; every
// number here is the same number on the page it links to.
const useTwTick = (key) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const names = key.split(",");
    names.forEach((n) => window.addEventListener(n, bump));
    return () => names.forEach((n) => window.removeEventListener(n, bump));
  }, [key]);
};

const twNav = (to) => window.appNavigate && window.appNavigate(to);

// The period: Reports' own tiles (the range the owner chose there), the
// offers' line and the booking line.
const TodayWeek = () => {
  useTwTick("surface:reports");
  const R = window.__REPORTS;
  const Tile = window.RpTile;
  if (!R || !window.__today || !Tile) return null;
  const vm = window.__today.week(R);
  if (!vm) return null;
  return (
    <section className="tsec tw" data-testid="today-week">
      <div className="tsec-head">
        <span className="tsec-title">{vm.label}</span>
        <span className="tsec-sub">{vm.sub}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => twNav("reports")}>Open Reports <Icon name="arrow-right" size={11} /></button>
      </div>
      <div className="rp2-tiles">{vm.tiles.map((t) => <Tile key={t.id} t={t} />)}</div>
      <div className="tsec-lines">
        {vm.lines.map((l) => (
          <button key={l.id} className="tsec-line" onClick={() => twNav(l.to)} data-testid={`today-week-${l.id}`}>
            <Icon name={l.id === "campaigns" ? "bolt" : "calendar"} size={11} />
            <span>{l.text}</span>
            <Icon name="arrow-right" size={10} />
          </button>
        ))}
      </div>
    </section>
  );
};

// Where people are on the way to a booking: People's journey lists with
// their counts; a row opens the list, its step opens where the step leads.
const TodayJourney = () => {
  useTwTick("surface:people");
  const P = window.__PEOPLE;
  if (!P || !window.__today) return null;
  const vm = window.__today.journey(P);
  if (!vm) return null;
  return (
    <section className="tsec tj" data-testid="today-journey">
      <div className="tsec-head">
        <span className="tsec-title">Where people are</span>
        <span className="tsec-sub">on the way to a booking</span>
        <button className="btn btn-ghost btn-sm" onClick={() => twNav("clients")}>Open People <Icon name="arrow-right" size={11} /></button>
      </div>
      <div className="tj-list">
        {vm.rows.map((r) => (
          <div key={r.id} className="tj-row" data-testid="today-journey-row">
            <button className="tj-open" onClick={() => twNav(r.to)} title={`Open the ${r.label} list`}>
              <span className="tj-label">{r.label}</span>
              <span className="tj-count tabular">{r.count}</span>
            </button>
            {r.act && <button className="btn btn-ghost btn-sm" onClick={() => twNav(r.act.to)}>{r.act.label}</button>}
          </div>
        ))}
      </div>
      {vm.note && <div className="tsec-note">{vm.note}</div>}
    </section>
  );
};

// What happened while the owner was away: the bell's unread rows, the same
// rows with the same verbs — read on open, dismiss, mark all read.
const TodayAway = () => {
  const api = !window.__DEMO_MODE && window.__notifs ? window.__notifs : null;
  const [rows, setRows] = React.useState(() => (api ? api.feed() : []));
  React.useEffect(() => {
    if (!api) return undefined;
    const refresh = () => setRows(api.feed());
    refresh();
    return api.onChange(refresh);
  }, [api]);
  if (!api || !window.__today) return null;
  const vm = window.__today.away(rows, 5);
  const total = vm.rows.length + vm.more;
  const open = (n, to) => { api.read(n.id); twNav(to); };
  return (
    <section className="tsec ta" data-testid="today-away">
      <div className="tsec-head">
        <span className="tsec-title">While you were away</span>
        <span className={`tq-count ${total ? "" : "calm"}`}>{total}</span>
        <span className="tsec-sub">{total ? "since you last looked" : "nothing new since you last looked"}</span>
        {total > 0 && <button className="btn btn-ghost btn-sm" onClick={() => api.seenAll()}>Mark all read</button>}
      </div>
      {vm.rows.length === 0 ? (
        <div className="tq-empty" data-testid="today-away-empty"><Icon name="check" size={14} /> All caught up.</div>
      ) : (
        <div className="ta-list">
          {vm.rows.map((n) => (
            <div key={n.id} className="tbn-item unread" data-testid="today-away-row">
              <span className={`tbn-icon ${n.tone}`}><Icon name={n.icon} size={13} /></span>
              <div className="tbn-body">
                <div className="tbn-line1">
                  <span className="tbn-item-title">{n.title}</span>
                  <span className="tbn-time tabular">{n.time}</span>
                </div>
                <div className="tbn-msg">{n.message}</div>
                <div className="tbn-actions">
                  {n.actions.map((a) => (
                    <button key={a.label} className={`btn btn-sm ${a.primary ? "" : "btn-ghost"}`} onClick={() => open(n, a.to)}>
                      {a.label}{a.primary && <Icon name="arrow-right" size={10} />}
                    </button>
                  ))}
                  <button className="btn btn-sm btn-ghost" onClick={() => api.dismiss(n.id)}>Dismiss</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {vm.more > 0 && <div className="tq-foot"><span>{vm.more} more in the bell</span></div>}
    </section>
  );
};

Object.assign(window, { TodayWeek, TodayJourney, TodayAway });
