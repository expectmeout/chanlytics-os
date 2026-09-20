/* global React, Icon, FailedRead */
// Below the queue and the day: the few things worth a look that no row above
// says on its own, how the day and the period are going, where people are,
// and what happened while the owner was away. Each reads a surface the page
// already holds — Reports, People, the bell — and the words are
// contracts/today.ts todayLeaks / todayWeek / todayJourney / todayAwayGrouped
// through window.__today. Nothing is computed on the page; every number here
// is the same number on the page it links to.
const useTwTick = (key) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const names = key.split(",");
    names.forEach((n) => window.addEventListener(n, bump));
    return () => names.forEach((n) => window.removeEventListener(n, bump));
  }, [key]);
};

const twNav = (to) => window.appNavigate && window.appNavigate(to);

// Worth a look: two pages read together.
//
// "18 wrote or called" lives on Reports and "17 asked, never booked" lives on
// People, and neither page can say they are the same eighteen people. This
// band is the only place on Today that puts two numbers beside each other,
// and it prints the arithmetic under every sentence so nobody has to take it
// on faith. It is gone entirely on a workspace with nothing wrong — there is
// no congratulation state.
const TodayLeaks = () => {
  useTwTick("surface:reports,surface:people");
  const R = window.__REPORTS;
  const P = window.__PEOPLE;
  if (!window.__today || !R || !P) return null;
  const rows = window.__today.leaks(R, P);
  if (!rows.length) return null;
  return (
    <section className="tsec tl" data-testid="today-leaks">
      <div className="tsec-head">
        <span className="tsec-title">Worth a look</span>
        <span className="tsec-sub">from Reports and People, read together</span>
      </div>
      <div className="tl-list">
        {rows.map((l) => (
          <div key={l.id} className={`tl-row tl-${l.tone}`} data-testid={`today-leak-${l.id}`}>
            <span className="tl-mark" aria-hidden="true" />
            <span className="tl-body">
              <span className="tl-text">{l.text}</span>
              <span className="tl-math tabular">{l.math}</span>
            </span>
            <span className="tl-acts">
              {l.also && <button className="btn btn-sm btn-ghost" onClick={() => twNav(l.also.to)}>{l.also.label}</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => twNav(l.cta.to)}>{l.cta.label} <Icon name="arrow-right" size={11} /></button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

// How it's going: the day so far, then the period in whichever of its three
// reads the owner asks for.
//
// It was two cards with two headers and the same "Open Reports" button twice,
// and the period's card put its two most valuable numbers -- what the offers
// earned, and how many of the people who asked ever booked -- in grey
// eleven-and-a-half-pixel lines under six tiles. "Asked → booked: 0 of 18 ·
// 0%" is not a footnote for a salon. Each read is a view now, with its own
// tiles, behind one control.
const TodayPulse = () => {
  useTwTick("surface:reports,surface:today,surface:calendar,surface:people");
  const R = window.__REPORTS;
  const Tile = window.RpTile;
  const Recap = window.TodayRecapBody;
  const vm = R && window.__today ? window.__today.week(R) : null;
  const hasRecap = !!window.TODAY_DATA;
  const [pick, setPick] = React.useState(null);
  if ((!vm || !Tile) && !hasRecap) return null;
  const view = vm ? (vm.views.find((v) => v.id === pick) || vm.views.find((v) => v.id === vm.initial) || vm.views[0]) : null;
  return (
    <section className="tsec tw" data-testid="today-week">
      <div className="tsec-head">
        <span className="tsec-title">How it&rsquo;s going</span>
        {vm && <span className="tsec-sub">{vm.label} · {vm.sub}</span>}
        <button className="btn btn-ghost btn-sm" onClick={() => twNav("reports")}>Open Reports <Icon name="arrow-right" size={11} /></button>
      </div>
      {hasRecap && Recap && <Recap />}
      {vm && view && (
        <div className="tw-period">
          {/* A filter, not a tab set: the flipped surfaces all say aria-pressed
              on a plain button, and a tab with no panel, no aria-controls and no
              arrow keys is worse than no role at all. */}
          <div className="tw-seg" role="group" aria-label="What to count">
            {vm.views.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.id === view.id}
                className={`tw-seg-btn ${v.id === view.id ? "active" : ""}`}
                onClick={() => setPick(v.id)}
                data-testid={`today-week-view-${v.id}`}
              >{v.label}</button>
            ))}
            {/* Only when this view lives somewhere other than the Reports door in the header above. */}
            {view.to !== "reports" && (
              <button className="tw-seg-open" onClick={() => twNav(view.to)} data-testid="today-week-open">
                {view.to === "broadcasts" ? "Open Campaigns" : "Open Calendar"} <Icon name="arrow-right" size={10} />
              </button>
            )}
          </div>
          {view.tiles.length > 0 && <div className="rp2-tiles" data-testid={`today-week-tiles-${view.id}`}>{view.tiles.map((t) => <Tile key={t.id} t={t} />)}</div>}
          {view.chips.length > 0 && (
            <div className="tw-chips" data-testid="today-week-chips">
              <span className="tw-chips-label">What stopped it</span>
              {view.chips.map((c) => (
                <span key={c.label} className="tw-chip"><b className="tabular">{c.value}</b> {c.label}</span>
              ))}
            </div>
          )}
          {/* A read that failed is its own state, said the one way the product says it (data-bits FailedRead). */}
          {view.numbersRead === false
            ? <FailedRead kind="line" className="tw-failed" what="the campaign numbers" body="The conversation and booking numbers in this card are current." surface="reports" testid="today-week-failed" />
            : view.note && <div className="tw-note" data-testid="today-week-note">{view.note}</div>}
        </div>
      )}
    </section>
  );
};

// Where people are: on the way to a booking, and who can still be reached.
// The reach lists were on People alone, which is why "7 said yes to messages,
// 0 can receive an offer" could sit there for weeks without anyone seeing it.
const TodayJourney = () => {
  useTwTick("surface:people");
  const P = window.__PEOPLE;
  if (!P || !window.__today) return null;
  const vm = window.__today.journey(P);
  if (!vm) return null;
  const groups = [
    { id: "journey", label: "On the way to a booking", rows: vm.rows },
    { id: "reach", label: "Who you can reach", rows: vm.reach },
  ].filter((g) => g.rows.length > 0);
  if (!groups.length) return null;
  return (
    <section className="tsec tj" data-testid="today-journey">
      <div className="tsec-head">
        <span className="tsec-title">Where people are</span>
        <button className="btn btn-ghost btn-sm" onClick={() => twNav("clients")}>Open People <Icon name="arrow-right" size={11} /></button>
      </div>
      <div className="tj-list">
        {groups.map((g) => (
          <React.Fragment key={g.id}>
            <div className="tj-group" data-testid={`today-journey-group-${g.id}`}>{g.label}</div>
            {g.rows.map((r) => (
              <div key={r.id} className="tj-row" data-testid="today-journey-row">
                <button className="tj-open" onClick={() => twNav(r.to)} title={`Open the ${r.label} list`}>
                  <span className="tj-label">{r.label}</span>
                  <span className={`tj-count tabular ${r.count ? "" : "none"}`}>{r.count}</span>
                </button>
                {r.act && <button className="btn btn-ghost btn-sm" onClick={() => twNav(r.act.to)}>{r.act.label}</button>}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      {vm.note && <div className="tsec-note">{vm.note}</div>}
    </section>
  );
};

// What happened while the owner was away: the bell's unread rows, as Today
// reads them.
//
// It showed the newest five, which on a real workspace was five identical
// "No conversation happened" cards from one number — while a WhatsApp quality
// downgrade and three failed jobs sat under the cap, and the three
// conversations at the top of this very page were said again here. Now a
// conversation already in the queue is dropped, like rows group and say how
// many, and a warning never sorts below good news.
//
// The head is the bell's own number, so the two badges on this screen never
// disagree, and the foot accounts for every unread row that is not drawn --
// including the ones the queue above already holds. Both sentences come from
// contracts; this file draws them.
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
  const T = window.TODAY_DATA;
  const inQueue = T ? T.queue.rows.map((r) => r.also && r.also.conversationId).filter(Boolean) : [];
  const { groups, total, foot, empty } = window.__today.awayGrouped(rows, inQueue, 5);
  // A group is read and dismissed whole: its rows say one thing, so they go together.
  const open = (g, to) => { g.ids.forEach((id) => api.read(id)); twNav(to); };
  const drop = (g) => g.ids.forEach((id) => api.dismiss(id));
  return (
    <section className="tsec ta" data-testid="today-away">
      <div className="tsec-head">
        <span className="tsec-title">While you were away</span>
        <span className={`tq-count ${total ? "" : "calm"}`}>{total}</span>
        {total > 0 && <button className="btn btn-ghost btn-sm" onClick={() => api.seenAll()}>Mark all read</button>}
      </div>
      {empty ? (
        <div className="tq-empty" data-testid="today-away-empty"><Icon name={empty.icon} size={14} /> {empty.text}</div>
      ) : (
        <div className="ta-list">
          {groups.map((g) => {
            const n = g.row;
            const act = n.actions && n.actions[0];
            return (
              <div key={n.id} className={`ta-row ${n.tone}`} data-testid="today-away-row" data-count={g.count}>
                <span className={`tbn-icon ${n.tone}`}><Icon name={n.icon} size={13} /></span>
                <button className="ta-main" onClick={() => act && open(g, act.to)} title={act ? act.label : undefined}>
                  <span className="ta-line1">
                    <span className="ta-title">{g.title || n.title}</span>
                    <span className="ta-time tabular">{n.time}</span>
                  </span>
                  <span className="ta-msg">{g.count > 1 ? `newest: ${n.title}` : n.message}</span>
                </button>
                <button className="ta-x" onClick={() => drop(g)} title={g.count > 1 ? `Dismiss all ${g.count}` : "Dismiss"} aria-label={g.count > 1 ? `Dismiss all ${g.count}` : "Dismiss"}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {foot && <div className="tq-foot"><span>{foot}</span></div>}
    </section>
  );
};

Object.assign(window, { TodayLeaks, TodayPulse, TodayJourney, TodayAway });
