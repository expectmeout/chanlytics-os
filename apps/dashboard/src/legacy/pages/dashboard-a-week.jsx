/* global React, Icon, FailedRead, StatePill */
// Below the day's card: the few things worth a look that no row above says on its own, and what happened while the
// owner was away. Each reads a surface the page already holds (Reports, People, the bell) and the words are
// contracts/today.ts todayLeaks / todayAwayGrouped through window.__today. Nothing is computed on the page; every
// number here is the same number on the page it links to. The period card and the journey that stood here are gone:
// the period is one line at the foot of the day's card, and the reach list's one fact is a row below.
const useTwTick = (key) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const names = key.split(",");
    names.forEach((n) => window.addEventListener(n, bump));
    return () => names.forEach((n) => window.removeEventListener(n, bump));
  }, [key]);
};

const twNav = (to) => window.appNavigate && window.appNavigate(to);
const twFailed = (key) => !!(window.__surfaceFailed && window.__surfaceFailed(key));
// The bridge's surface, or the mockup's sample of it (dashboard-a-brief.jsx todaySurface); the global itself where that file is not loaded.
const twSurface = (key) => (window.todaySurface ? window.todaySurface(key) : window[key]);

// Worth a look: two pages read together.
//
// "18 wrote or called" lives on Reports and "17 asked, never booked" lives on People, and neither page can say they
// are the same eighteen people. This band is the only place on Today that puts two numbers beside each other, and
// it prints the arithmetic under every sentence so nobody has to take it on faith. Each row wears its tone once, as the
// one pill with a word in it (never colour alone), names who is waiting where the page holds them, and offers Ask its own facts:
// "Ask why" asks the row's sentence, so Ask grounds the answer in what it can read. It is gone entirely on a
// workspace with nothing wrong: there is no congratulation state. A third problem is a line, never silence.
//
// On a phone the arithmetic is a receipt, not a decision, so it waits behind the sentence: the sentence is a button
// that shows it, the way the day's figures show theirs, and "Ask why" carries it anyway. The words stay in the DOM
// (hidden), so Ask, the tests and a phone run read the same line. Width is read as the Calendar reads it (crPhone).
const twPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
const TodayLeaks = () => {
  useTwTick("surface:reports,surface:clients,surface:today");
  const [open, setOpen] = React.useState(null);
  const R = twSurface("__REPORTS");
  const P = twSurface("__PEOPLE");
  const T = window.TODAY_DATA;
  if (!window.__today) return null;
  const broke = (!R && twFailed("reports")) ? ["Reports", "reports"] : (!P && twFailed("people")) ? ["People", "people"] : null;
  if (broke) {
    return (
      <section className="tsec tl" data-testid="today-leaks">
        <div className="tsec-head"><span className="tsec-title">Worth a look</span></div>
        <FailedRead kind="line" className="tl-failed" what={broke[0]} body="The queue and the day's card are current." surface={broke[1]} testid="today-leaks-failed" />
      </section>
    );
  }
  if (!R || !P) return null;
  const { rows, moreLine } = window.__today.leaks(R, P, T ? T.noReply : []);
  if (!rows.length) return null;
  const phone = twPhone();
  return (
    <section className="tsec tl" data-testid="today-leaks">
      <div className="tsec-head">
        <span className="tsec-title">Worth a look</span>
      </div>
      <div className="tl-list">
        {rows.map((l) => (
          <div key={l.id} className={`tl-row tl-${l.tone}`} data-testid={`today-leak-${l.id}`}>
            {/* The row's tone, once: the one pill, in the row's corner (dashboard-a-v2.css), so every sentence starts at
                one edge and the pills stand in one column. First in the markup, so a reader hears it before the sentence. */}
            <StatePill kind="tone" value={l.tone} label={l.tag} className="tl-tag" />
            {phone ? (
              <button type="button" className="tl-text tl-text-door" aria-expanded={open === l.id} aria-controls={`today-leak-math-${l.id}`} onClick={() => setOpen(open === l.id ? null : l.id)} data-testid={`today-leak-text-${l.id}`}>{l.text}</button>
            ) : (
              <span className="tl-text">{l.text}</span>
            )}
            {/* The foot: the arithmetic, who the row names, and its doors at the right, on one line where there is room. */}
            <div className="tl-foot">
              <span className="tl-math tabular" id={`today-leak-math-${l.id}`} hidden={phone && open !== l.id}>{l.math}</span>
              {/* Who the row names, and the lead that says who they are: on the unanswered row, who is waiting right now, from
                  the threads Today holds (not the count's own subjects: the count is Reports' over its period); on the
                  consultations row, the count's own people (0008). The words are contracts'. A person is a name, so each
                  is the one chip. */}
              {l.people.length > 0 && (
                <span className="tl-people">
                  {l.peopleLead && <span className="tl-people-lead">{l.peopleLead}</span>}
                  {l.people.map((p) => <button key={p.id} type="button" className="chip tl-person" onClick={() => twNav(p.to)} title={p.title}>{p.name}</button>)}
                </span>
              )}
              {/* The doors are words: Ask why quiet, the row's own door in ink with its arrow. */}
              <span className="tl-acts">
                <button type="button" className="tl-act" onClick={() => window.askAbout && window.askAbout({ prompt: l.ask })} data-testid={`today-leak-ask-${l.id}`}>Ask why</button>
                {l.also && <button type="button" className="tl-act" onClick={() => twNav(l.also.to)}>{l.also.label}</button>}
                <button type="button" className="tl-act tl-act-go" onClick={() => twNav(l.cta.to)}>{l.cta.label} <Icon name="arrow-right" size={11} /></button>
              </span>
            </div>
          </div>
        ))}
      </div>
      {moreLine && <div className="tsec-note" data-testid="today-leaks-more">{moreLine}</div>}
    </section>
  );
};

// What happened while the owner was away: the bell's unread rows, as Today reads them.
//
// It showed the newest five, which on a real workspace was five identical "No conversation happened" cards from one
// number, while a WhatsApp quality downgrade and three failed jobs sat under the cap, and the three conversations at
// the top of this very page were said again here. A row about anything the queue above holds (a handoff's thread, a
// call-back's call, a closing window's thread, a call worth a listen) is dropped, like rows group and say how many,
// and a warning never sorts below good news.
//
// The head is the bell's own number, so the two badges on this screen never disagree, and the foot accounts for
// every unread row that is not drawn, including the ones the queue above already holds. Both sentences come from
// contracts; this file draws them. It draws wherever a bell is published: the mockup's sample publishes one too.
const TodayAway = () => {
  const api = twSurface("__notifs") || null;
  const [rows, setRows] = React.useState(() => (api ? api.feed() : []));
  React.useEffect(() => {
    if (!api) return undefined;
    const refresh = () => setRows(api.feed());
    refresh();
    return api.onChange(refresh);
  }, [api]);
  if (!api || !window.__today) return null;
  const T = window.TODAY_DATA;
  // What each queue row is about: its thread, its call, or both (contracts AwayQueueRef), and the runs the
  // queue draws, by name: a run held for a word is a row up there, and the bell's "is ready" is about the same run.
  const B = window.todaySurface ? window.todaySurface("__BROADCASTS") : null;
  const runsDrawn = ((B && B.rows) || []).filter((r) => r.state === "pending_approval").slice(0, 3);
  const inQueue = [
    ...(T ? T.queue.rows.map((r) => ({ conversationId: r.conversationId, callId: r.callId })) : []),
    ...runsDrawn.map((r) => ({ runLabel: r.audience.label })),
  ];
  const { groups, total, foot, empty } = window.__today.awayGrouped(rows, inQueue, 5);
  // A group is read and dismissed whole: its rows say one thing, so they go together.
  const open = (g, to) => { g.ids.forEach((id) => api.read(id)); twNav(to); };
  const drop = (g) => g.ids.forEach((id) => api.dismiss(id));
  return (
    <section className="tsec ta" data-testid="today-away">
      <div className="tsec-head">
        <span className="tsec-title">While you were away</span>
        <span className={`tq-count ${total ? "" : "calm"}`}>{total}</span>
        {/* The page's last section: as its rows go, the page holds still under the thumb (data-bits holdStill). */}
        {total > 0 && <button className="btn btn-ghost btn-sm" onClick={(e) => (window.holdStill ? window.holdStill(e && e.currentTarget, () => api.seenAll()) : api.seenAll())}>Mark all read</button>}
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
                <span className="mark tbn-icon"><Icon name={n.icon} size={13} /></span>
                <button className="ta-main" onClick={() => act && open(g, act.to)} title={act ? act.label : undefined}>
                  <span className="ta-line1">
                    <span className="ta-title">{g.title || n.title}</span>
                    <span className="ta-time tabular">{n.time}</span>
                  </span>
                  <span className="ta-msg">{g.count > 1 ? `newest: ${n.title}` : n.message}</span>
                </button>
                <button className="ta-x" onClick={(e) => (window.holdStill ? window.holdStill(e && e.currentTarget, () => drop(g)) : drop(g))} title={g.count > 1 ? `Dismiss all ${g.count}` : "Dismiss"} aria-label={g.count > 1 ? `Dismiss all ${g.count}` : "Dismiss"}>
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

Object.assign(window, { TodayLeaks, TodayAway });
