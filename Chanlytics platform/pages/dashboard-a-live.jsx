/* global React, Icon */
// Now-playing rail — sits in the right column of Dashboard A.
// Three stacked sections:
//   1) Live ticker — what's happening RIGHT NOW (auto-pulsing)
//   2) Today's schedule — with risk dots and per-row prep status
//   3) Next 4 hours forecast — flag-aware

const NowPlayingRail = () => {
  const { LIVE_TICKER, TODAY_SCHEDULE, NEXT_FOUR_HOURS } = window.CHANLY_DATA;
  const [showAllSched, setShowAllSched] = React.useState(false);
  const [toastNode, ppFlash] = window.usePPToast();
  const [, setTick] = React.useState(0);

  // Decisions flip schedule risk chips live; veto countdowns tick every second
  React.useEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("inbox:decisions", bump);
    window.addEventListener("presence:changed", bump);
    if (window.VW_UTIL) window.VW_UTIL.seed(window.THREADS);
    const iv = window.setInterval(bump, 1000);
    return () => { window.removeEventListener("inbox:decisions", bump); window.removeEventListener("presence:changed", bump); window.clearInterval(iv); };
  }, []);

  // Sending soon — the countdown drafts (most time-critical state in the product)
  const vetoLive = (window.THREADS || []).filter((t) => t.veto && window.VW_UTIL && window.VW_UTIL.remaining(t.id) != null);
  const soonest = [...vetoLive].sort((a, b) => window.VW_UTIL.remaining(a.id) - window.VW_UTIL.remaining(b.id))[0];
  const away = window.PR_STORE && window.PR_STORE.away;

  const channelIcon = (c) => c === "phone" ? "phone" : c === "instagram" ? "instagram" : c === "mail" ? "mail" : "chat";

  // Compute risk + cap. Schedule is the most likely thing to balloon for power users.
  const SCHED_CAP = 6;
  const visibleSched = showAllSched ? TODAY_SCHEDULE : TODAY_SCHEDULE.slice(0, SCHED_CAP);
  const atRiskCount = TODAY_SCHEDULE.filter(s => s.risk).length;
  const flaggedCount = NEXT_FOUR_HOURS.events.filter(e => e.flag).length;

  return (
    <aside className="rail">
      {/* === LIVE TICKER === */}
      <section className="rail-section rail-live">
        <header className="rail-head">
          <span className="rail-head-label">
            <span className="live-dot" /> Live
          </span>
          <span className="rail-head-meta">auto-updating</span>
        </header>
        {vetoLive.length > 0 && (
          <div className="rail-veto">
            <span className="live-dot" style={{ background: "var(--warn)", flexShrink: 0 }} />
            <span className="rail-veto-text">
              {away
                ? <><b>{vetoLive.length} draft{vetoLive.length === 1 ? "" : "s"}</b> paused — you're away</>
                : <><b>{vetoLive.length} draft{vetoLive.length === 1 ? "" : "s"}</b> sending soon{soonest && <> — {window.VW_UTIL.remaining(soonest.id)}s</>}</>}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => soonest && window.CHANLY.nav(window.CHANLY.R.thread(soonest.id))}>Review</button>
            <button className="btn btn-sm" onClick={() => {
              window.VW_UTIL.holdAll(vetoLive.map((t) => t.id));
              setTick((n) => n + 1);
              ppFlash({ msg: <><b>{vetoLive.length} draft{vetoLive.length === 1 ? "" : "s"}</b> held — manual send from Inbox</> });
            }}>{vetoLive.length === 1 ? "Hold" : "Hold all"}</button>
          </div>
        )}
        <div className="rail-ticker">
          {LIVE_TICKER.slice(0, 5).map((t, i) => (
            <div
              key={i}
              className={`tick ${t.state}`}
              onClick={() => t.state === "live" ? window.CHANLY.nav("live") : t.to && window.CHANLY.nav(t.to)}
              style={(t.state === "live" || t.to) ? { cursor: "pointer" } : undefined}
            >
              <span className="tick-time mono">{t.time}</span>
              <span className="tick-rail">
                {t.state === "live"
                  ? <span className="live-dot" />
                  : <span className="tick-dot" />}
              </span>
              <span className="tick-body">
                <span className="tick-glyph">
                  <span className={`agent-avatar ${t.state === "live" ? "active" : ""}`} style={{ width: 16, height: 16, fontSize: 8.5 }}>
                    {t.glyph}
                  </span>
                  <Icon name={channelIcon(t.channel)} size={10} style={{ color: "var(--ink-dim)" }} />
                </span>
                <span className="tick-text">
                  <strong>{t.agent}</strong> {t.verb} <span className="muted">{t.target}</span>
                </span>
                {t.state === "live" && (
                  <span className="tick-pill"><span className="live-dot" style={{ width: 4, height: 4 }} /> {t.duration}</span>
                )}
                {t.value && (
                  <span className="tick-value mono">+${t.value}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* === TODAY'S SCHEDULE === */}
      <section className="rail-section">
        <header className="rail-head">
          <span className="rail-head-label">Today's schedule</span>
          <span className="rail-head-meta">
            {TODAY_SCHEDULE.length} appts
            {atRiskCount > 0 && <> · <span style={{ color: "var(--accent)" }}>{atRiskCount} at risk</span></>}
          </span>
        </header>
        <div className="rail-sched">
          {visibleSched.map((s, i) => (
            <div key={i} className={`sch ${s.status}`} onClick={() => window.CHANLY.nav(s.apptId ? window.CHANLY.R.appt(s.apptId) : "calendar")} style={{ cursor: "pointer" }}>
              <span className="sch-time mono">{s.time}</span>
              <span className="sch-spine">
                {s.status === "live" && <span className="live-dot" style={{ position: "absolute" }} />}
              </span>
              <span className="sch-body">
                <span className="sch-line">
                  <span className="sch-who">{s.who}</span>
                  {s.visits > 0 && <span className="sch-visits mono">·&nbsp;{s.visits}v</span>}
                  {(() => {
                    const dec = s.threadId && window.IX_STORE && window.IX_STORE.get(s.threadId);
                    if (dec && dec.kind === "decided") {
                      return (
                        <span className="sch-risk ok" data-tip="Decided — open the thread for the receipt" onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(window.CHANLY.R.thread(s.threadId)); }}>
                          <Icon name={dec.declined ? "x" : "check"} size={9} />
                          {dec.declined ? "Declined" : "Approved — confirmed"}
                        </span>
                      );
                    }
                    if (!s.risk) return null;
                    return (
                      <span
                        className={`sch-risk ${s.threadId ? "linkable" : ""}`}
                        data-tip={s.threadId ? "Linked to an Inbox thread — click to decide" : undefined}
                        onClick={s.threadId ? (e) => { e.stopPropagation(); window.CHANLY.nav(window.CHANLY.R.thread(s.threadId)); } : undefined}
                      >
                        <span className="sch-risk-dot" />
                        {s.risk}
                      </span>
                    );
                  })()}
                </span>
                <span className="sch-what">{s.what}</span>
              </span>
              <span className={`agent-avatar ${s.status === "live" ? "active" : ""}`} style={{ width: 18, height: 18, fontSize: 9 }}>{s.agent}</span>
            </div>
          ))}
          {TODAY_SCHEDULE.length > SCHED_CAP && (
            <button className="rail-more" onClick={() => setShowAllSched(v => !v)}>
              {showAllSched
                ? <><Icon name="chevron-up" size={11} /> Collapse</>
                : <><Icon name="chevron-down" size={11} /> Show {TODAY_SCHEDULE.length - SCHED_CAP} more</>
              }
            </button>
          )}
        </div>
      </section>

      {/* === NEXT 4 HOURS === */}
      <section className="rail-section rail-forecast">
        <header className="rail-head">
          <span className="rail-head-label">Next 4 hours</span>
          <span className="rail-head-meta tabular">+${NEXT_FOUR_HOURS.expectedRevenue} expected</span>
        </header>
        <div className="rail-fcast-stats">
          <div className="rail-fcast-stat">
            <span className="rail-fcast-num tabular">{NEXT_FOUR_HOURS.appointments}</span>
            <span className="rail-fcast-lbl">appts</span>
          </div>
          <div className="rail-fcast-stat">
            <span className="rail-fcast-num tabular">{NEXT_FOUR_HOURS.followUps}</span>
            <span className="rail-fcast-lbl">follow-ups</span>
          </div>
          <div className="rail-fcast-stat">
            <span className="rail-fcast-num tabular">{flaggedCount}</span>
            <span className="rail-fcast-lbl">flagged</span>
          </div>
        </div>
        <div className="rail-fcast-list">
          {NEXT_FOUR_HOURS.events.map((e, i) => (
            <div
              key={i}
              className={`rail-fcast-item ${e.flag ? "flagged" : ""} ${e.to ? "linkable" : ""}`}
              onClick={e.to ? () => window.CHANLY.nav(e.to) : undefined}
            >
              <span className="rail-fcast-time mono">{e.time}</span>
              <span className="rail-fcast-what">{e.what}</span>
              {e.flag && <span className="rail-fcast-flag">{e.flag}</span>}
            </div>
          ))}
        </div>
      </section>
      {toastNode}
    </aside>
  );
};

window.NowPlayingRail = NowPlayingRail;
