/* global React */
// Today — the operator's morning brief, rendered from window.TODAY_DATA only.
//
// This file replaces the mockup's DashboardA composition (HeroBrief +
// AgentCommand + NowPlayingRail + TrustReview + SegmentPulse + AgentFleet).
// Those regions rendered revenue, appointments, conversion, an 8-agent fleet
// and an approval queue — none of which exist in this product. They were
// deleted rather than restyled, because a restyled fabrication is still a
// fabrication.
//
// TODAY_DATA is written by the Slice 4 seam override. It is deliberately NOT
// seeded: when the fetch fails the global is undefined and this page says so,
// instead of falling back to invented numbers. Read inside the component body
// (never at module scope) so a later write is picked up on re-render.

const TD_ARROW = "→";

const TdRow = ({ to, children, className = "" }) => (
  <button
    type="button"
    className={`td-row ${className}`}
    onClick={() => to && window.appNavigate && window.appNavigate(to)}
  >
    {children}
  </button>
);

const TdSection = ({ label, count, hint, children }) => (
  <section className="td-section">
    <div className="td-section-head">
      <h2 className="td-section-label">
        {label}
        {typeof count === "number" && count > 0 ? <span className="td-count">{count}</span> : null}
      </h2>
      {hint ? <p className="td-section-hint">{hint}</p> : null}
    </div>
    {children}
  </section>
);

const TodayPage = () => {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const bump = () => force((n) => n + 1);
    window.addEventListener("surface:today", bump);
    return () => window.removeEventListener("surface:today", bump);
  }, []);

  const vm = window.TODAY_DATA;

  // No payload at all — the app has never successfully reached the workspace.
  // This is the state that must never be mistaken for a quiet morning.
  if (!vm) {
    return (
      <div className="td">
        <div className="td-standing">
          <p className="td-eyebrow">Today</p>
          <h1 className="td-headline">Can&rsquo;t reach your workspace right now.</h1>
          <p className="td-detail">
            This isn&rsquo;t a quiet morning, it&rsquo;s a connection problem. Retrying automatically.
          </p>
        </div>
      </div>
    );
  }

  const { standing, needsYou, windowClosing, recap, calls, launchpad, quiet, updatedAt } = vm;

  return (
    <div className="td">
      {/* ---- A. Standing: what time is it, is anything broken, what matters ---- */}
      <div className={`td-standing td-tone-${standing.tone}`}>
        <p className="td-eyebrow">{standing.eyebrow}</p>
        {standing.alert ? (
          <div className="td-alert" role="alert">
            <span className="td-alert-dot" aria-hidden="true" />
            {standing.alert}
          </div>
        ) : null}
        <p className="td-greeting">{standing.greeting}</p>
        <h1 className="td-headline">{standing.headline}</h1>
        {standing.detail ? <p className="td-detail">{standing.detail}</p> : null}
        <div className="td-chips">
          {standing.chips.map((c) => (
            <span key={c.text} className={`td-chip ${c.ok ? "is-ok" : "is-down"}`}>
              <span className="td-chip-dot" aria-hidden="true" />
              {c.text}
            </span>
          ))}
        </div>
      </div>

      {/* ---- Quiet day: proof we're listening, not a row of zeroes ---- */}
      {quiet ? (
        <section className="td-quiet">
          <p className="td-quiet-sub">{quiet.sub}</p>
          <dl className="td-proof">
            {quiet.proof.map((p) => (
              <div key={p.label} className="td-proof-item">
                <dt>{p.label}</dt>
                <dd>{p.value}</dd>
              </div>
            ))}
          </dl>
          {quiet.launchpad ? (
            <button
              type="button"
              className="td-link"
              onClick={() => window.appNavigate && window.appNavigate(quiet.launchpad.to)}
            >
              {quiet.launchpad.label}
            </button>
          ) : null}
        </section>
      ) : null}

      {/* ---- B. Needs you ---- */}
      {needsYou ? (
        <TdSection label="Needs you" count={needsYou.count} hint={needsYou.hint}>
          {needsYou.rows.length ? (
            <ul className="td-list">
              {needsYou.rows.map((r) => (
                <li key={r.id}>
                  <TdRow to={r.to} className="td-need">
                    <span className="td-need-top">
                      <span className="td-who">{r.who}</span>
                      <span className="td-reason">{r.reason}</span>
                      <span className={`td-waited ${r.warn ? "is-warn" : ""}`}>waited {r.waited}</span>
                    </span>
                    {r.quote ? <span className="td-quote">&ldquo;{r.quote}&rdquo;</span> : null}
                    <span className="td-meta">
                      {r.meta}
                      {r.windowNote ? <span className="td-window"> · {r.windowNote}</span> : null}
                    </span>
                    <span className="td-cta">Open and reply {TD_ARROW}</span>
                  </TdRow>
                </li>
              ))}
            </ul>
          ) : (
            <p className="td-empty">{needsYou.empty}</p>
          )}
        </TdSection>
      ) : null}

      {/* ---- C. Reply window closing (only when something actually is) ---- */}
      {windowClosing ? (
        <TdSection label={windowClosing.label} hint={windowClosing.hint}>
          <ul className="td-list">
            {windowClosing.rows.map((r) => (
              <li key={r.id}>
                <TdRow to={r.to} className="td-thin">
                  <span className="td-thin-text">{r.text}</span>
                  <span className="td-cta">Open thread {TD_ARROW}</span>
                </TdRow>
              </li>
            ))}
          </ul>
        </TdSection>
      ) : null}

      {/* ---- D. Recap: four measured facts, no deltas, no sparklines ---- */}
      {recap ? (
        <TdSection label={recap.label}>
          {recap.sentences.map((s) => (
            <p key={s} className="td-sentence">
              {s}
            </p>
          ))}
          <dl className="td-facts">
            {recap.facts.map((f) => (
              <div key={f.label} className="td-fact">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
                {f.hint ? <p className="td-fact-hint">{f.hint}</p> : null}
              </div>
            ))}
          </dl>
          {recap.receipts.length ? (
            <ul className="td-receipts">
              {recap.receipts.map((r) => (
                <li key={`${r.at}-${r.text}`}>
                  <TdRow to={r.to} className="td-receipt">
                    <span className="td-receipt-at">{r.at}</span>
                    <span className="td-receipt-text">{r.text}</span>
                  </TdRow>
                </li>
              ))}
            </ul>
          ) : null}
        </TdSection>
      ) : null}

      {/* ---- E. Calls: aggregate always, rows only for the ones needing an ear ---- */}
      {calls ? (
        <TdSection label="Calls">
          <p className="td-sentence">{calls.line}</p>
          {calls.rows.length ? (
            <ul className="td-list">
              {calls.rows.map((c) => (
                <li key={c.id}>
                  <TdRow to={c.to} className="td-thin">
                    <span className="td-thin-text">
                      <span className="td-who">{c.who}</span>
                      <span className="td-meta">
                        {c.at}
                        {c.duration ? ` · ${c.duration}` : ""} · {c.note}
                      </span>
                    </span>
                    <span className="td-cta">Open call {TD_ARROW}</span>
                  </TdRow>
                </li>
              ))}
            </ul>
          ) : (
            <p className="td-empty td-quiet-note">Nothing flagged. Listen to any of them from Conversations.</p>
          )}
        </TdSection>
      ) : null}

      {/* ---- F. Launchpad: never a dead end ---- */}
      <footer className="td-foot">
        <div className="td-foot-links">
          {launchpad.map((l) => (
            <button
              key={l.to}
              type="button"
              className="td-link"
              onClick={() => window.appNavigate && window.appNavigate(l.to)}
            >
              {l.label} {TD_ARROW}
            </button>
          ))}
        </div>
        <p className="td-updated">Last updated {updatedAt} · updates automatically</p>
      </footer>
    </div>
  );
};

// The shell renders DashboardA for the "today" route; this replaces it.
window.DashboardA = TodayPage;
window.TodayPage = TodayPage;
