/* global React, Icon, FailedRead */
// Today's first band and its third: the standing line above the work, and the day's own card under it.
//
// The standing line says the day and the time the business keeps, and whether its lines are up: one line, where a
// hero with a greeting, a headline the queue says again, four sentences, a chip repeating the queue's count, an arc
// and six stat cards used to stand (on a phone the first thing that needed a person started 679px down).
//
// The card is about the day: four figures from the view model, each with the clause under it and the why behind it
// on hover, focus or a tap, with one door; then the lines that are not numbers (a reply that never reached anyone,
// a review that landed, what ran, the receipts); then the last seven days in one line with the
// one door to Reports on the page. Every sentence with a number is contracts' (toTodayVM, todayPeriodLine,
// todayRunWords); this file draws them. A borrowed read that failed says so where its line would be (FailedRead).
const useTcTick = (key) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const names = key.split(",");
    names.forEach((n) => window.addEventListener(n, bump));
    return () => names.forEach((n) => window.removeEventListener(n, bump));
  }, [key]);
};

// A surface as the bridge published it; in the standalone mockup only, as the sample holds it (legacy-bridge/
// today-sample.ts publishes window.__TODAY_SAMPLE, the way Reports reads window.__reportsSample). The sample never sets
// the bridge's own names: the mockup's other pages switch to their real variants on those. Today's other files read
// through this too (window.todaySurface), and fall back to the global itself where this file is not loaded (a test).
const todaySurface = (key) => (window[key] !== undefined ? window[key] : window.__DEMO_MODE && window.__TODAY_SAMPLE ? window.__TODAY_SAMPLE[key] : undefined);

// A playbook's run or a broadcast that went out today, with what it has earned so far. The runs that wait for a word,
// and the ones under a Stop, are rows of the queue (dashboard-a-command.jsx). Today, and the time it went, are the
// business's (window.__clock), not the browser's; the counts are contracts' words (todayRunWords).
const RunsDone = ({ nav }) => {
  useTcTick("surface:broadcasts");
  const B = todaySurface("__BROADCASTS");
  const all = (B && B.rows) || [];
  const C = todaySurface("__clock");
  const done = all.filter((r) => (r.state === "sent" || r.state === "sending") && r.started_at && C.dayKey(Date.parse(r.started_at)) === C.dayKey(Date.now())).slice(0, 2);
  const timeOf = (iso) => C.time(Date.parse(iso));
  return done.map((r) => {
    const w = window.__today.runs(r).done;
    return (
      <div key={`run-${r.id}`} className="brief-beat" data-testid="brief-run-done">
        <span className="mark brief-beat-glyph"><Icon name="bolt" size={13} /></span>
        <span className="brief-beat-text">
          <b>{r.playbook_id ? r.audience.label : r.name}</b> {r.playbook_id ? "ran" : "went out"} at {timeOf(r.started_at)}: {w.counts}{w.still ? " · still sending" : ""}
        </span>
        <button className="brief-chip" onClick={() => nav(`broadcasts/run:${r.id}`)}>Open <Icon name="arrow-right" size={10} /></button>
      </div>
    );
  });
};

// What is left to set up, as one card above the queue in its column (the first run's Today card, canvas R10 and P9):
// while a step is open, the one row that opens the first run; after, Setup's own optional rows in the order they help
// most, each with its act and a Skip this person keeps on every device (their saved view). Gone once nothing is left.
// Every word is contracts' (first-run.ts setupCardOf, through window.__firstRun); the rows are Setup's own, drawn as the
// card's compact rows (setup.jsx SetupRows look="card", SetupCardRow). On a phone only the next row shows, with its
// one button (mobile.css).
const TodaySetup = () => {
  useTcTick("surface:setup");
  // The card's toast, lent to its rows: a Skip or a Hide can take the card away while its Undo is still up.
  const [toastNode, flash] = window.usePPToast();
  const S = window.__SETUP;
  const F = window.__firstRun;
  const card = S && F ? F.todayCard(S.vm) : null;
  if (!card) return toastNode;
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const put = (ids, on) => window.__setup.later(ids, on);
  const hide = async () => {
    const ids = card.rows.map((r) => r.id);
    const r = await put(ids, true);
    if (!r.ok) return flash(window.refusalToast(r, "Not saved"));
    flash({
      msg: <>{card.hide.said}</>,
      undo: () => put(ids, false).then((u) => { if (!u.ok) flash(window.refusalToast(u, "Not saved")); }),
    });
  };
  return (
    <section className="tq today-setup" data-testid="today-setup">
      <div className="setup-card-head">
        <span className="setup-card-title">{card.title}<span className="setup-card-left" data-testid="today-setup-left">{card.left}</span></span>
        {card.hide ? (
          <button type="button" className="setup-card-skip today-setup-hide" onClick={hide} data-testid="today-setup-hide">{card.hide.put}</button>
        ) : null}
      </div>
      {card.start ? (
        <div className="tq-list">
          <window.SetupCardRow
            tone="warn"
            stateWords={card.start.status}
            name={card.start.name}
            sentence={card.start.sentence}
            cta={{ label: card.start.cta, kind: "primary", onClick: () => nav(card.start.to) }}
            testid="today-setup-start"
            ctaTestid="today-setup-go"
          />
        </div>
      ) : (
        <window.SetupRows S={S} rows={card.rows} look="card" primary={card.rows[0].id} later={card.skip} flash={flash} testid="today-setup-rows" />
      )}
      {toastNode}
    </section>
  );
};

// A review on Google, the morning it lands: first seen in the last day and a half, written recently, not part of the
// first read (contracts/google.ts reviewIsNew). From the Google surface, which boots with the rest. Gone once it is
// old news.
const ReviewLine = ({ nav }) => {
  useTcTick("surface:google");
  const G = window.__GOOGLE;
  if (!G || !G.dto.listing || !window.__google) return null;
  const line = window.__google.vm(G.dto, 30).todayLine;
  if (!line) return null;
  return (
    <div className="brief-beat" data-testid="brief-review">
      <span className="mark brief-beat-glyph"><Icon name="star" size={13} /></span>
      <span className="brief-beat-text">{line.text}</span>
      <button className="brief-chip" onClick={() => nav(line.to)}>Open Reports <Icon name="arrow-right" size={10} /></button>
    </div>
  );
};

// Above the work, only while a line is down or the workspace is paused (contracts `standing.alert`): the one thing on
// Today that cannot wait for the card under the work. With every line up nothing stands here. The standing line that
// said the date, the time, the workspace and "3 of 3 lines connected" went (Ruben, 23 Sep): the queue says its own
// good news, and the clock is the device's.
const TodayAlert = ({ vm }) => {
  const { alert } = vm.standing;
  if (!alert) return null;
  return (
    <div className="today-alert" role="alert" data-testid="today-alert">
      {/* Its own dot, red with a ring: never the coral live-dot, which is the agent's live state (components.css). */}
      <span className="today-alert-dot" aria-hidden="true" />
      <span>{alert}</span>
    </div>
  );
};

const HeroBrief = () => {
  useTcTick("surface:today");
  return window.TODAY_DATA ? <TodayAlert vm={window.TODAY_DATA} /> : null;
};

// One figure: the number, its word and the clause under it. With a receipt it is a button: hover opens the receipt,
// Enter or Space and a tap toggle it, Escape closes it. The receipt itself is drawn by the card as the last child of
// the row of figures (TodayReceipt), so a desktop anchors it under this figure by index and a phone lays it under the
// row. A figure with nothing to add is not a button.
const TodayFigure = ({ f, i, open, setOpen }) => {
  const has = !!f.receipt;
  const on = has && open === f.id;
  const body = (
    <>
      <span className="tc-fig-n tabular">{f.value}</span>
      <span className="tc-fig-w">{f.label}</span>
      <span className="tc-fig-m">{f.meta}</span>
    </>
  );
  return (
    <div className={`tc-fig${on ? " open" : ""}`} onMouseEnter={has ? () => setOpen(f.id) : undefined} data-testid={`today-figure-${f.id}`} data-i={i}>
      {has ? (
        <button
          type="button"
          className="tc-fig-btn"
          aria-expanded={on}
          aria-controls={on ? `today-receipt-${f.id}` : undefined}
          onClick={() => setOpen(on ? null : f.id)}
          onFocus={() => setOpen(f.id)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(null); }}
        >
          {body}
        </button>
      ) : (
        <div className="tc-fig-btn">{body}</div>
      )}
    </div>
  );
};

// The open figure's receipt: its why and one door. Under its figure on a desktop (`--i` places it), under the row on
// a phone (dashboard-a-v2.css .tc-receipt). It adds to the figure and never repeats its number: contracts proves that,
// so nothing an owner needs lives only behind a hover.
const TodayReceipt = ({ f, i, last, nav }) => (
  <div className="tc-receipt" role="dialog" id={`today-receipt-${f.id}`} aria-label={`Why ${f.value} ${f.label}`} style={{ "--i": i }} data-last={last ? "true" : undefined} data-testid={`today-receipt-${f.id}`}>
    <p className="tc-receipt-t">{f.receipt.text}</p>
    {f.receipt.door && (
      <button type="button" className="tc-receipt-door" onClick={() => nav(f.receipt.door.to)}>
        {f.receipt.door.label} <Icon name="arrow-right" size={10} />
      </button>
    )}
  </div>
);

const TodayCard = () => {
  useTcTick("surface:today,surface:reports");
  const [open, setOpen] = React.useState(null);
  const vm = window.TODAY_DATA;
  if (!vm) return null;
  const { recap, quiet, figures } = vm;
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const R = todaySurface("__REPORTS");
  const period = R && window.__today ? window.__today.periodLine(R) : null;
  // Not read yet is not failed: the foot is silent while Reports loads and says so when its read failed.
  const reportsFailed = !R && !!(window.__surfaceFailed && window.__surfaceFailed("reports"));
  return (
    <section className="today-card" data-testid="today-card" aria-labelledby="today-card-title">
      <div className="tc-head">
        <h2 className="tc-title" id="today-card-title">{recap ? recap.label : "Today so far"}</h2>
        {/* No figures to hang the proof on (a quiet day, or no traffic while an escalation waits, which is the
            reference workspace's own state): nothing came in, and the proof the lines are listening. On a day with
            traffic the proof is the messages figure's clause. */}
        {!figures && <span className="tc-line" data-testid="today-quiet-line">{quiet ? quiet.headline : recap ? recap.line : "Nothing has come in yet today."} {vm.proof}</span>}
      </div>
      {/* The row of figures owns the open receipt: leaving the row closes it (the receipt is inside the row, so moving
          onto it does not), and so does focus leaving the row. */}
      {figures && (
        <div
          className="tc-figs"
          data-testid="today-figures"
          onMouseLeave={() => setOpen(null)}
          onBlur={(e) => { if (e.relatedTarget && e.currentTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(null); }}
        >
          {figures.map((f, i) => <TodayFigure key={f.id} f={f} i={i} open={open} setOpen={setOpen} />)}
          {figures.map((f, i) => (open === f.id && f.receipt ? <TodayReceipt key={`r-${f.id}`} f={f} i={i} last={i === figures.length - 1} nav={nav} /> : null))}
        </div>
      )}
      {/* The lines that are not numbers. thread.spec reads a failed reply here by this testid and .brief-beat. */}
      <div className="brief-beats tc-beats" data-testid="today-recap">
        {quiet && (vm.standing.chips.length > 0 || quiet.launchpad) && (
          <div className="brief-beat" data-testid="brief-quiet-proof">
            <span className="mark brief-beat-glyph"><Icon name="check" size={13} /></span>
            <span className="brief-beat-text">
              {quiet.proof.filter((pr) => pr.label !== "Checked").map((pr) => `${pr.label}: ${pr.value}`).join(" · ")}
            </span>
            {quiet.launchpad && <button className="brief-chip" onClick={() => nav(quiet.launchpad.to)}>{quiet.launchpad.label}</button>}
          </div>
        )}
        <ReviewLine nav={nav} />
        {/* Everything the figures do not carry, crucially a reply that failed to deliver: the one line that must never be quiet. */}
        {(recap ? recap.sentences : []).filter((sn) => !sn.traffic).map((sn, i) => (
          <div key={`sn-${i}`} className="brief-beat">
            <span className="mark brief-beat-glyph"><Icon name={sn.warn ? "alert" : "info"} size={13} /></span>
            <span className="brief-beat-text" style={sn.warn ? { color: "var(--danger-ink)" } : undefined}>{sn.text}</span>
            {sn.warn && (
              <button className="brief-chip" onClick={() => nav(sn.to || "inbox")}>See the thread <Icon name="arrow-right" size={10} /></button>
            )}
          </div>
        ))}
        <RunsDone nav={nav} />
        {vm.callsRead === false && <FailedRead kind="line" what="the phone line's calls" body="The day's other numbers are current." surface="today" testid="brief-calls-failed" />}
        {(recap ? recap.receipts : []).map((r, i) => (
          <div key={i} className="brief-beat" data-testid="brief-receipt">
            <span className="mark brief-beat-glyph"><Icon name="check" size={13} /></span>
            <span className="brief-beat-text">{r.at}: {r.text}</span>
            <button className="brief-chip" onClick={() => nav(r.to)}>Open <Icon name="arrow-right" size={10} /></button>
          </div>
        ))}
      </div>
      {(period || reportsFailed) && (
        <div className="tc-foot">
          {period ? (
            <>
              <span className="tc-foot-text" data-testid="today-period">{period.text}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => nav(period.to)}>Open Reports <Icon name="arrow-right" size={11} /></button>
            </>
          ) : (
            <FailedRead kind="line" what="Reports" body="The day's own numbers above are current." surface="reports" testid="today-period-failed" />
          )}
        </div>
      )}
    </section>
  );
};

Object.assign(window, { HeroBrief, TodayCard, TodaySetup, todaySurface });
