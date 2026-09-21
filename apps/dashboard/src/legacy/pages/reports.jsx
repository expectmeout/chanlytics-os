/* global React, Icon, EmptyState, ChartCard, BarChart, RptSection, ReportsSections */
// Chanlytics, Reports: the page shell. One row above everything (the period, its days and the Ask door), then the
// sections (reports-sections.jsx), then Google's reviews. A real workspace draws the bridge's own numbers
// (window.__REPORTS); a demo session draws the same page from the sample (window.__reportsSample, which the mockup's
// server builds from legacy-bridge/reports-sample.ts); without either, the page says what Reports reads.

const { useState: useRpState } = React;

const useReports = () => {
  const [, tick] = useRpState(0);
  React.useEffect(() => {
    const bump = () => tick((n) => n + 1);
    window.addEventListener("surface:reports", bump);
    return () => window.removeEventListener("surface:reports", bump);
  }, []);
  return window.__REPORTS;
};

// A number, what it is, and one line of what it holds. It also drew a seven-point sparkline beside a number the chart
// below plots properly, and a delta that claimed percentages on counts of two -- "+100% vs prior 7 days" is 2 to 4,
// and "-100%" is a zero. The view model still carries both: Ask reads the change. Today draws its week with this tile,
// and so do Google's tiles below; the Reports strip itself is reports-sections.jsx's RptTiles.
const RpTile = ({ t }) => (
  <div className="rp2-tile" data-tile={t.id}>
    <div className="rp2-tile-label" title={t.label}>{t.label}</div>
    <div className="rp2-tile-value">{t.value}</div>
    <div className="rp2-tile-meta" title={t.meta}>{t.meta}</div>
  </div>
);

// An answer to a review, on Google, in the business's own words: a link
// under the review, a few lines, Send. Google keeps one reply per review,
// so sending again replaces it. Shown only when the Business Profile is
// connected and the review came through it.
// The composer under a review. Under Ask (and Auto, for one the receptionist
// has not reached), opening it asks the receptionist for a draft first, so a
// reply is one tap: read, change anything, send. Under Never the box opens
// empty and nothing is asked.
const ReviewReply = ({ r, mode }) => {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(r.replyText || "");
  const [busy, setBusy] = React.useState(false);
  const [drafting, setDrafting] = React.useState(false);
  // null · "yes" (the words in the box are the receptionist's) · a sentence saying why there is none
  const [drafted, setDrafted] = React.useState(null);
  const [toastNode, flash] = window.usePPToast();
  const openIt = async () => {
    setOpen(true);
    if (r.replied || mode === "never" || !window.__google || !window.__google.draft) return;
    setDrafting(true);
    const d = await window.__google.draft(r.id);
    setDrafting(false);
    if (d.ok) { setText(d.text); setDrafted("yes"); }
    else setDrafted(d.message || "No draft this time — write the reply yourself.");
  };
  const send = async () => {
    if (!window.__google || busy || drafting || !text.trim()) return;
    setBusy(true);
    const res = await window.__google.reply(r.id, text);
    setBusy(false);
    flash({ tone: res.ok ? "ok" : "danger", msg: res.ok ? <>Your reply is on Google, under the review.</> : <>{res.message}</> });
    if (res.ok) setOpen(false);
  };
  return (
    <div className="rp2-review-reply">
      {r.replied && !open && <p className="rp2-review-replytext"><b>You replied:</b> {r.replyText}</p>}
      {!open ? (
        <button className="cl-bucket-link" onClick={openIt} data-testid="google-reply">{r.replied ? "Change the reply" : "Reply"}</button>
      ) : (
        <div className="rp2-review-composer" data-testid="google-reply-composer">
          <textarea className="rp2-review-textarea" rows={3} value={text} maxLength={4096} disabled={drafting} onChange={(e) => { setText(e.target.value); if (drafted === "yes") setDrafted(null); }} placeholder={drafting ? "The receptionist is writing a draft…" : "Thank them, or answer them — it appears on Google under the review, in the business's name."} data-testid="google-reply-text" />
          {drafted === "yes" && <span className="rp2-review-drafted" data-testid="google-reply-drafted">Drafted by the receptionist — change anything, then send.</span>}
          {drafted && drafted !== "yes" && <span className="rp2-review-drafted dim" data-testid="google-reply-undrafted">{drafted}</span>}
          <div className="bc-chips">
            <button className="btn btn-primary btn-sm" onClick={send} disabled={busy || drafting || !text.trim()} data-testid="google-reply-send">{busy ? "Sending…" : "Send to Google"}</button>
            <button className="cl-bucket-link" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {toastNode}
    </div>
  );
};


// Google reviews: the listing as the edge last read it, over the period above. Four measured tiles, the ratings
// gained day by day (the count is the tiles'; the card draws its days, with their table), and the latest reviews with
// their words: the five Google shows first, and said so. Nothing linked: an honest card that leads to Setup. Nothing
// at all when this deployment cannot look listings up.
//
// Both cards take the whole row, one above the other. Beside each other, a list of five reviews set the row's height
// and a period of days that gained one rating apiece was stretched to match it, which is a picture of nothing. A run
// of days wants width; the reviews want a readable measure, which reports.css gives them in columns.
const RP_GAINED = { gained: { label: "Ratings gained", color: "var(--chart-1)" } };
const GoogleSection = ({ days }) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:google", bump);
    return () => window.removeEventListener("surface:google", bump);
  }, []);
  const G = window.__GOOGLE;
  if (!G || (!G.dto.ready.places && !G.dto.ready.profile && !G.dto.listing) || !window.__google) return null;
  const vm = window.__google.vm(G.dto, days);
  const operator = window.canDo ? window.canDo("approve") : false;
  if (!vm.listing) {
    return (
      <RptSection title="Google reviews">
        <div className="rpt-grid">
          <ChartCard className="rpt-span-12" title="Your listing on Google" testid="google-none">
            <EmptyState kind="line" title="Find your business on Google once." body="Its rating, its count and its newest reviews show here for the period, with a line on Today and a row on the bell when one lands." action={{ label: "Find it on Setup", to: "admin/setup" }} />
          </ChartCard>
        </div>
      </RptSection>
    );
  }
  const L = vm.listing;
  return (
    <RptSection title="Google reviews" meta={`${L.name} · ${L.checked.charAt(0).toLowerCase()}${L.checked.slice(1)}`}>
      <div className="rp2-tiles rp2-strip-google four" data-testid="google-tiles">{vm.tiles.map((t) => <RpTile key={t.id} t={t} />)}</div>
      <div className="rpt-grid">
        <ChartCard className="rpt-span-12" title="Ratings gained, day by day" testid="chart-google-gained" config={RP_GAINED}
          takeaway={vm.gained.total === null ? "Needs a second day of reading." : null}
          twin={{ data: vm.gained.points, keys: ["gained"], first: "Day" }}>
          {vm.gained.points.length && vm.gained.total !== null ? (
            <BarChart data={vm.gained.points} keys={["gained"]} config={RP_GAINED} height={150} yTicks={2} animKey={days}
              ariaLabel="Ratings gained per day, by Google's count. The arrow keys read each day."
              describe={(d) => `${d.label}: ${d.gained} ${d.gained === 1 ? "rating" : "ratings"} gained`} />
          ) : <EmptyState kind="line" title="The count is read once a day; the first difference shows after the second read." />}
        </ChartCard>
        <ChartCard className="rpt-span-12" title="Latest reviews" testid="chart-google-latest" table={vm.table}
          takeaway={vm.latest.length ? (vm.reply.words ? `${vm.source} · ${vm.reply.words}` : vm.source) : null}>
          {vm.latest.length ? (
            <div className="rp2-reviews">
              {vm.latest.map((r) => (
                <div key={r.id} className={"rp2-review" + (r.isNew ? " is-new" : "")} data-testid="google-review">
                  <div className="rp2-review-head">
                    <span className="rp2-review-stars" aria-label={`${r.rating == null ? 0 : r.rating} of 5`}>{r.stars}</span>
                    <span className="rp2-review-who">{r.author}</span>
                    <span className="rp2-review-when">{r.when}{r.isNew ? " · new" : ""}{r.replied ? " · replied" : ""}</span>
                  </div>
                  {r.text ? <p className="rp2-review-text">{r.text}</p> : <p className="rp2-review-text dim">A rating without words.</p>}
                  {vm.canReply && operator && r.fromProfile
                    ? <ReviewReply r={r} mode={vm.reply.mode} />
                    : r.replied ? <p className="rp2-review-replytext"><b>Replied:</b> {r.replyText}</p> : null}
                </div>
              ))}
            </div>
          ) : <EmptyState kind="line" title="Google shows no written reviews for this listing yet." />}
        </ChartCard>
      </div>
    </RptSection>
  );
};

const RP2_RANGES = [[7, "7 days"], [30, "30 days"], [90, "90 days"]];

const ReportsPage = () => {
  const live = useReports();
  // A demo's own period: the sample answers at once, so the tabs switch it here.
  const [sampleDays, setSampleDays] = useRpState(30);
  const [busy, setBusy] = useRpState(false);
  // The period that failed to load, if any: the page keeps the old one and says so, instead of dimming forever and
  // switching later on its own.
  const [failed, setFailed] = useRpState(null);
  const fetchedAt = live ? live.fetchedAt : 0;
  React.useEffect(() => { setBusy(false); }, [fetchedAt]);
  const R = live || (window.__DEMO_MODE && window.__reportsSample ? window.__reportsSample(sampleDays) : null);
  if (!R) {
    return (
      <div className="rpt" data-testid="reports-none">
        <div className="rpt-inner">
          <EmptyState kind="page" glyph="wave" title="Reports reads a workspace's own numbers" body="Open a workspace to see what its receptionist answered, who reached it, and what its campaigns sent." />
        </div>
      </div>
    );
  }
  const vm = R.vm;
  const pick = async (days) => {
    // One period at a time: while one loads the tabs hold, rather than start a second load over the first.
    if (busy || days === R.days) return;
    if (!live) { setSampleDays(days); return; }
    if (!window.__setReportDays) return;
    setBusy(true);
    setFailed(null);
    const ok = await window.__setReportDays(days);
    if (!ok) {
      setBusy(false);
      setFailed(days);
    }
  };
  return (
    <div className="rpt" data-testid={live ? "reports-real" : "reports-sample"}>
      <div className="rpt-inner">
        {/* One row above everything: the period, the days it covers, and a door to ask about them. The top bar says
            Reports; the page does not title itself. */}
        <div className="rpt-head">
          <div className="rpt-range" role="group" aria-label="Period">
            {RP2_RANGES.map(([d, l]) => (
              <button key={d} type="button" className={R.days === d ? "on" : ""} aria-pressed={R.days === d} aria-disabled={busy} onClick={() => pick(d)}>{l}</button>
            ))}
          </div>
          <span className="rpt-dates" title={`Days follow ${vm.timezone}`}>{vm.since} to {vm.until}</span>
          {failed && (
            <span className="rpt-failed" role="status" aria-live="polite">Couldn't load {(RP2_RANGES.find(([d]) => d === failed) || [])[1]}. Still showing {vm.rangeLabel}.</span>
          )}
          <button type="button" className="rpt-ask" aria-label="Ask about this period" onClick={() => window.askAbout && window.askAbout({ prompt: `What stood out in my last ${vm.rangeLabel}?` })} data-testid="reports-ask">
            <Icon name="sparkle" size={13} /><span className="rpt-ask-label">Ask about this period</span>
          </button>
        </div>
        <div className={`rpt-body${busy ? " is-loading" : ""}`} aria-busy={busy ? "true" : "false"}>
          <ReportsSections R={R} pick={pick} />
          <GoogleSection days={R.days} />
        </div>
      </div>
    </div>
  );
};

window.ReportsPage = ReportsPage;
// Today draws the period with the same tile.
Object.assign(window, { RpTile });
