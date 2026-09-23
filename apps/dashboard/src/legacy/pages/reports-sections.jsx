/* global React, Icon, EmptyState, FailedRead, ChartCard, SegmentBar, BarChart, BarList, LineChart, PieChart, RadarChart, RadialChart, HeatStrip, ckSecondsLabel */
// Chanlytics, Reports: everything under the period row (reports.jsx draws the row, then this, then Google's reviews).
// The page answers an owner's questions in order: is the receptionist handling my customers (the hero, Worth knowing,
// the tiles, "The receptionist"), who are they and where and when do they reach me ("Your customers"), and what did
// the campaigns send ("Campaigns"). It draws the contracts view models the bridge publishes (window.__REPORTS) with
// the chart kit. Every sentence beside a number is the view model's (vm.lines, cm.lines, the booking's words, the
// facts): this file says each number once and composes no claim about the numbers of its own.

const { useState: useRptState, useEffect: useRptEffect } = React;

const rptNav = (to) => (window.CHANLY && window.CHANLY.nav ? window.CHANLY.nav(to) : undefined);
const rptPlural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

// A phone's page draws the meters smaller; kept current as the window changes size.
const useRptPhone = () => {
  const q = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 760px)") : null;
  const [phone, setPhone] = useRptState(!!(q && q.matches));
  useRptEffect(() => {
    if (!q || !q.addEventListener) return undefined;
    const on = (e) => setPhone(e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return phone;
};

// Series in the shadcn config shape: a label and a colour token per key. Ink blue is the one data hue; unanswered
// wears the warn status with its icon; a channel keeps its colour whatever its rank.
const RPT_ANSWERED = {
  ai: { label: "Receptionist", color: "var(--chart-1)" },
  you: { label: "You", color: "var(--chart-1-soft)" },
  none: { label: "Unanswered", color: "var(--warn)", icon: "alert" },
};
const RPT_CHANNELS = {
  whatsapp: { label: "WhatsApp", color: "var(--chart-cat-1)" },
  voice: { label: "Calls", color: "var(--chart-cat-2)" },
  email: { label: "Email", color: "var(--chart-cat-3)" },
  sms: { label: "SMS", color: "var(--chart-cat-4)" },
  instagram: { label: "Instagram", color: "var(--chart-cat-5)" },
};
const RPT_CALLS = { calls: { label: "Calls", color: "var(--chart-1)" } };
const RPT_SENT = { sent: { label: "Sent", color: "var(--chart-1)" } };
const RPT_REPLY = { p50: { label: "Median reply", color: "var(--chart-1)", shape: "line" } };
// This period under `key`, and the period before when there is one, named as the view model names them.
const rptPeriods = (vm, key, before) => ({
  [key]: { label: vm.period.now, color: "var(--chart-1)", shape: "line" },
  ...(before ? { prior: { label: vm.period.before, color: "var(--chart-prior)", shape: "line" } } : {}),
});
// Reply times are ordered, fastest first and darkest (the ordinal ink ramp); a caller's mood wears its status.
const rptSpread = (buckets) => Object.fromEntries(buckets.map((b, i) => [b.id, { label: b.label, color: `var(--chart-ramp-${5 - i})` }]));
const rptMood = (rows) => Object.fromEntries(rows.map((r) => [r.id, { label: r.label, color: r.tone === "ok" ? "var(--ok)" : r.tone === "danger" ? "var(--danger)" : "var(--chart-prior)" }]));

const RptSection = ({ title, meta = null, testid = null, children }) => (
  <section className="rpt-section" aria-label={title} data-testid={testid || undefined}>
    <header className="rpt-section-head">
      <h2 className="rpt-section-title">{title}</h2>
      {meta && <span className="rpt-section-meta">{meta}</span>}
    </header>
    {children}
  </section>
);

// The headline: the receptionist's part of the answered as a meter, the period before as a tick on its ring.
const RptHero = ({ vm, phone }) => {
  const a = vm.answered;
  const pct = a.share == null ? null : Math.round(a.share * 100);
  return (
    <section className="ck-card rpt-hero" data-testid="reports-hero">
      <RadialChart value={a.share || 0} marker={a.priorShare} size={phone ? 96 : 112} thickness={10}
        ariaLabel={pct == null ? "Nothing to answer in this period" : `The receptionist answered ${pct}% of customer messages`}>
        {pct != null && <span className="rpt-hero-number">{pct}%</span>}
      </RadialChart>
      <div className="rpt-hero-copy">
        <p className="rpt-hero-lead">answered by your receptionist</p>
        <p className="rpt-hero-line">{vm.lines.hero}</p>
        {vm.lines.heroBefore && <p className="rpt-hero-compare"><i className="rpt-tick" aria-hidden="true" />{vm.lines.heroBefore}</p>}
      </div>
    </section>
  );
};

// Worth knowing: what the bridge's reportFacts() found, in its order, one line each. A fact with a door is one
// button, the whole row its target; the full sentence rides in its title for a line cut short.
const RptFacts = ({ facts }) => (
  <section className="ck-card rpt-facts" data-testid="reports-facts">
    <h2 className="ck-card-title rpt-facts-title">Worth knowing</h2>
    {facts.length ? (
      <ul className="rpt-fact-list">
        {facts.map((f) => {
          const said = f.sub ? `${f.text}, ${f.sub}` : f.text;
          const body = (
            <>
              <span className="mark rpt-fact-icon" aria-hidden="true"><Icon name={f.icon} size={13} /></span>
              <span className="rpt-fact-copy">
                <span className="rpt-fact-text">{f.text}</span>
                {f.sub && <span className="rpt-fact-sub">{f.sub}</span>}
              </span>
              {f.door && <span className="rpt-fact-door">{f.door.label}<Icon name="arrow-right" size={12} /></span>}
            </>
          );
          return (
            <li key={f.id} className={`rpt-fact${f.tone ? ` is-${f.tone}` : ""}`} data-fact={f.id}>
              {f.door
                ? <button type="button" className="rpt-fact-row" title={said} onClick={() => rptNav(f.door.to)}>{body}</button>
                : <div className="rpt-fact-row" title={said}>{body}</div>}
            </li>
          );
        })}
      </ul>
    ) : <p className="rpt-fact-quiet">A quiet period. Nothing stood out.</p>}
  </section>
);

// The strip: three of the receptionist's counts, the one conversion and the handovers, each with the period before
// in counts beside its value. The answered share and the reply time are the hero's.
const RptTiles = ({ vm, booking }) => {
  const by = Object.fromEntries(vm.tiles.map((t) => [t.id, t]));
  const booked = booking && booking.present
    ? { id: "booked", label: "Booked", value: String(booking.booked), meta: booking.asked ? `of ${booking.asked} who asked` : "nobody asked", compare: null }
    : { id: "booked", label: "Booked", value: "—", meta: booking && booking.calendar === "unavailable" ? "the calendar could not be read" : "no calendar to read", compare: null };
  const tiles = [by.messages, by.calls, by.people, booked, by.needed].filter(Boolean);
  return (
    <dl className="rpt-tiles" data-testid="reports-tiles">
      {tiles.map((t) => (
        <div className="rpt-tile" key={t.id} data-tile={t.id}>
          <dt className="rpt-tile-label">{t.label}</dt>
          <dd className="rpt-tile-value">{t.value}{t.compare && <span className="rpt-tile-compare">{t.compare}</span>}</dd>
          <dd className="rpt-tile-meta" title={t.meta}>{t.meta}</dd>
        </div>
      ))}
    </dl>
  );
};

// Asked, then booked: the share as a meter, beside the booking view model's own words for what it is of (the count
// is the tile's), and under a hairline the same share's other side -- who asked and still has no time on the
// calendar, which is the half an owner can act on. Both sentences are the view model's (`words`, `rest`). No
// calendar: its sentence and the door to Settings. A calendar that could not be read is a failed read, not a missing
// calendar. Nobody asked: its words.
const RptBooked = ({ bk, phone }) => {
  if (!bk || bk.calendar === "none") {
    return <EmptyState kind="line" title={bk ? bk.sub : "Connect your calendar under Settings › Business to see who booked."} action={{ label: "Open Settings", to: "admin/workspace" }} />;
  }
  if (bk.calendar === "unavailable") return <FailedRead kind="line" what="your calendar" surface="reports" />;
  if (bk.pct == null) return <EmptyState kind="line" title={bk.headline} body={bk.sub} />;
  return (
    <div className="rpt-booked">
      <div className="rpt-booked-share">
        <RadialChart value={bk.pct / 100} size={phone ? 96 : 112} thickness={10} ariaLabel={`${bk.pct}% ${bk.words}`}>
          <span className="rpt-booked-number">{bk.pct}%</span>
        </RadialChart>
        <p className="rpt-booked-copy">{bk.words}.</p>
      </div>
      {bk.rest && (
        <p className={`rpt-booked-rest${bk.unbooked ? "" : " is-done"}`} data-testid="booked-rest">
          <Icon name={bk.unbooked ? "calendar" : "check"} size={13} />
          <span>
            {bk.rest}
            {/* People already keeps a list of its own for these people, so the door is that list and not the page of
                everyone: __listRoute lands on it, or on People itself where the lists have not loaded. The door wears
                the list's name rather than "See them", because the list counts its own month and this card counts the
                period above: the same people, near enough to go and look, not the same set to the person. */}
            {bk.unbooked > 0 && <button type="button" className="cl-bucket-link" title="People's own list of who wrote or called this month and has never been on the calendar" onClick={() => rptNav(window.__listRoute ? window.__listRoute("asked_never_booked") : "clients")} data-testid="booked-rest-door">Asked, never booked</button>}
          </span>
        </p>
      )}
    </div>
  );
};

// The period's sources: a playbook's runs together, a broadcast alone; shares are of each one's own sent. The name is
// the row's door, to the playbook's card or the broadcast's own page.
const RptSources = ({ rows }) => {
  if (!rows.length) return <EmptyState kind="line" title="No broadcast or playbook run reached anyone in this period." />;
  const title = (s) => (window.__starters && s.templateName ? window.__starters.title(s.templateName) : s.template);
  return (
    <div className="ck-table-wrap rpt-sources">
      <table className="ck-table">
        <thead><tr><th>Source</th><th className="num">Sent</th><th className="num">Delivered</th><th className="num">Wrote back</th><th className="num">Last</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} data-testid="source-row">
              <td>
                <button type="button" className="rpt-src" onClick={() => rptNav(s.kind === "broadcast" ? `broadcasts/run:${s.id}` : `outbound/${s.id}`)} data-testid="source-open">{s.name}</button>
                <span className="rpt-src-meta">{s.kindLabel}{s.kind === "playbook" ? ` · ${rptPlural(s.runs, "run")}` : ""}{title(s) ? ` · ${title(s)}` : ""}</span>
              </td>
              <td className="num">{s.sent}</td>
              <td className="num">{s.deliveredPct == null ? "—" : `${s.deliveredPct}%`}</td>
              <td className="num">{s.repliedPct == null ? "—" : `${s.repliedPct}%`} <span className="rpt-dim">({s.replied})</span></td>
              <td className="num rpt-dim">{s.lastLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Everything the period row scopes. R is the published surface ({ vm, campaigns, booking, facts, days }); pick(days)
// is the row's own period switch, for the empty period's door.
const ReportsSections = ({ R, pick }) => {
  const vm = R.vm;
  const cm = R.campaigns || null;
  const days = R.days;
  const phone = useRptPhone();
  const t = vm.answered.totals;
  const channels = vm.channels || [];
  const reached = channels.reduce((s, c) => s + c.value, 0);
  const peopleBefore = vm.people.cumulative.prior;
  const avg = vm.week.unit === "average";
  const weekNames = avg ? vm.week.long.map((d) => `An average ${d}`) : vm.week.long;
  const rhythm = rptPeriods(vm, "now", !!vm.week.prior);
  const people = rptPeriods(vm, "total", !!peopleBefore);
  const before = vm.period.before.toLowerCase();
  const sentPct = (n) => (cm && cm.totals.sent ? Math.round((n / cm.totals.sent) * 100) : 0);
  // Deals (0004, 0008): one cohort, the proposals of the period, and beside it the stock. The headline says how many
  // went out; the card draws what became of them in the kit's bars, each outcome's count and its share of the cohort,
  // said there and nowhere else (a sentence of the same counts would say each twice); the lines beside it say what the
  // bars cannot -- how long a yes took, where the new clients came from, why people passed, what is still open -- each
  // only when it has something; the clients now close the section under the one hairline. Every word is contracts'
  // DealReportVM. Drawn wherever deals are on and a deal was ever recorded, whatever came in this period: an engagement
  // is agreed in a call or a meeting as often as in a message, so a quiet month for the receptionist is not a month
  // without clients.
  const dl = R.deals && R.deals.present ? R.deals : null;
  const dealLines = dl && dl.lines.length ? (
    <ul className={`rpt-deals-lines${dl.outcomes ? " rpt-span-7" : ""}`} data-testid="rpt-deals-lines">
      {dl.lines.map((l) => <li key={l.id} data-line={l.id}>{l.text}</li>)}
    </ul>
  ) : null;
  const deals = dl ? (
    <RptSection title="Deals" testid="rpt-deals">
      <div className="rpt-deals">
        <p className="rpt-deals-headline" data-testid="rpt-deals-headline">{dl.headline}</p>
        {dl.outcomes ? (
          <div className="rpt-grid">
            <ChartCard className="rpt-span-5" title={dl.outcomes.title} testid="rpt-deals-outcomes">
              <BarList max={dl.outcomes.max} rows={dl.outcomes.rows} />
            </ChartCard>
            {dealLines}
          </div>
        ) : dealLines}
        <p className="rpt-booked-rest" data-testid="rpt-deals-stock">{dl.stock}</p>
      </div>
    </RptSection>
  ) : null;
  return (
    <>
      <section className="rpt-grid rpt-top" aria-label="This period">
        <RptHero vm={vm} phone={phone} />
        {!vm.empty && <RptFacts facts={R.facts || []} />}
      </section>
      <RptTiles vm={vm} booking={R.booking || null} />

      {vm.empty ? (
        <>
          <EmptyState kind="card" glyph="wave" title="Nothing came in" testid="reports-empty"
            body={`Nobody wrote or called between ${vm.since} and ${vm.until}.`}
            action={days !== 90 ? { label: "Look at 90 days", onClick: () => pick(90) } : null} />
          {deals}
        </>
      ) : (
        <>
          <RptSection title="The receptionist">
            <div className="rpt-grid">
              <ChartCard className="rpt-span-8" title="Who answered, day by day" testid="chart-answered" takeaway={vm.lines.answered}
                config={RPT_ANSWERED} legend={t.in ? { values: { ai: t.ai, you: t.you, none: t.none } } : false} table={vm.table}>
                {t.in ? (
                  <BarChart data={vm.answered.points} keys={["ai", "you", "none"]} config={RPT_ANSWERED} height={188} animKey={days}
                    ariaLabel="Customer messages per day, split by who answered. The arrow keys read each day."
                    tipNote={(d) => rptPlural(d.in, "customer message")}
                    describe={(d) => `${d.label}: ${rptPlural(d.in, "customer message")}, ${d.ai} answered by the receptionist, ${d.you} by you, ${d.none} unanswered`} />
                ) : <EmptyState kind="line" title="No customer messages in this period, so the receptionist had nothing to answer by text. Calls are below." />}
              </ChartCard>
              <ChartCard className="rpt-span-4" title="How fast it answers" testid="chart-reply" takeaway={vm.lines.reply} config={RPT_REPLY}
                table={vm.speed
                  ? { columns: [vm.speed.unit === "week" ? "Week of" : "Day", "Median reply", "Slowest tenth", "Replies"], rows: vm.speed.points.map((p) => [p.label, p.p50 == null ? null : p.p50Label, p.p90 == null ? null : p.p90Label, p.count]) }
                  : { columns: ["Reply time", "Replies"], rows: vm.replyTime.buckets.map((b) => [b.label, b.value]) }}>
                {vm.replyTime.count ? (
                  <>
                    {vm.speed && (
                      <LineChart data={vm.speed.points} keys={[{ key: "p50" }]} config={RPT_REPLY} scale="seconds" yFormat={ckSecondsLabel}
                        reference={{ value: 60, label: "1 min" }} height={122} animKey={days}
                        ariaLabel={`The receptionist's median reply, a ${vm.speed.unit} at a time. The arrow keys read each ${vm.speed.unit}.`}
                        tip={(d) => ({ title: vm.speed.unit === "week" ? `Week of ${d.label}` : d.label, rows: d.p50 == null ? [] : [
                          { key: "p50", label: "median reply", value: d.p50Label },
                          { key: "p90", color: "var(--chart-prior)", label: "slowest tenth", value: d.p90Label },
                        ], note: d.p50 == null ? "No replies" : rptPlural(d.count, "reply", "replies") })}
                        describe={(d) => (d.p50 == null ? `${d.label}: no replies` : `${d.label}: median reply ${d.p50Label}, slowest tenth ${d.p90Label}`)} />
                    )}
                    <SegmentBar title="Every reply, by how long it took" testid="reply-spread"
                      rows={vm.replyTime.buckets.map((b) => ({ key: b.id, value: b.value }))} config={rptSpread(vm.replyTime.buckets)} />
                  </>
                ) : <EmptyState kind="line" title="No receptionist replies in this period to time." />}
              </ChartCard>
            </div>
            <div className="rpt-grid">
              <ChartCard className="rpt-span-4" title="Why it stopped" testid="chart-reasons" table={{ columns: ["Reason", "Times"], rows: vm.reasons.map((r) => [r.label, r.value]) }}>
                {vm.reasons.length
                  ? <BarList rows={vm.reasons.map((r) => ({ id: r.id, label: r.label, value: r.value }))} onPick={() => rptNav("inbox")} />
                  : <EmptyState kind="line" title={t.you === 0 && t.none === 0
                    ? "It never stopped in this period: every message was answered without you."
                    : "It never stopped in this period, though some messages were answered by you or by nobody (see above)."} />}
              </ChartCard>
              <ChartCard className="rpt-span-4" title="Calls" testid="chart-calls" takeaway={vm.lines.calls} config={RPT_CALLS}
                table={{ columns: ["Day", "Calls", "Seconds on the phone"], rows: vm.calls.points.map((p) => [p.label, p.calls, p.callSeconds]) }}>
                {vm.calls.total ? (
                  <>
                    <BarChart data={vm.calls.points} keys={["calls"]} config={RPT_CALLS} height="fill" floor={128} yTicks={2} animKey={days}
                      ariaLabel="Calls per day. The arrow keys read each day." describe={(d) => `${d.label}: ${rptPlural(d.calls, "call")}`} />
                    <SegmentBar title="Caller mood, as the voice provider read it" testid="caller-mood" small
                      rows={vm.calls.sentiments.map((r) => ({ key: r.id, value: r.value }))} config={rptMood(vm.calls.sentiments)} />
                  </>
                ) : <EmptyState kind="line" title="Nobody phoned in this period." />}
              </ChartCard>
              <ChartCard className="rpt-span-4" title="Asked, then booked" testid="chart-booking">
                <RptBooked bk={R.booking || null} phone={phone} />
              </ChartCard>
            </div>
          </RptSection>

          {/* Drawn only where deals are on and a deal was ever recorded, so a workspace whose customers book never grows a section of zeros. */}
          {deals}

          <RptSection title="Your customers">
            <div className="rpt-grid">
              <ChartCard className="rpt-span-4" title="Where they reach you" testid="chart-channels" takeaway={vm.lines.channels} config={RPT_CHANNELS} legend={false}
                table={channels.length ? { columns: ["Channel", vm.period.now, vm.period.before], rows: channels.map((c) => [c.label, c.value, c.prior]) } : null}>
                {reached ? (
                  <>
                    <PieChart data={channels.map((c) => ({ key: c.key, value: c.value }))} config={RPT_CHANNELS} center={{ value: reached, label: "messages and calls" }}
                      size="fill" floor={138} thickness={16} ariaLabel="Messages and calls by channel. The arrow keys read each channel." />
                    {/* The same split the period before, in the same colours: the donut says where they reach you now,
                        this says whether that is a change. Its own counts, which no tile and no legend above give. */}
                    <SegmentBar title={vm.period.before} testid="channels-before" small
                      rows={channels.map((c) => ({ key: c.key, value: c.prior }))} config={RPT_CHANNELS} />
                  </>
                ) : <EmptyState kind="line" title={vm.channels ? "Nothing to split by channel in this period." : "Not counted for this period yet."} />}
              </ChartCard>
              <ChartCard className="rpt-span-4" title="When they reach you" testid="chart-rhythm" takeaway={vm.lines.rhythm} config={rhythm}
                table={{ columns: ["When", vm.period.now, vm.period.before], rows: [
                  ...weekNames.map((d, i) => [d, vm.week.current[i], vm.week.prior ? vm.week.prior[i] : null]),
                  ...(vm.hours ? vm.hours.values.map((v, h) => [`${vm.hours.labels[h]} to ${vm.hours.labels[(h + 1) % 24]}`, v, null]) : []),
                ] }}>
                <RadarChart axes={vm.week.axes} names={weekNames} config={rhythm} height={190} animKey={days}
                  series={[{ key: "now", values: vm.week.current }, ...(vm.week.prior ? [{ key: "prior", values: vm.week.prior, fill: false }] : [])]}
                  ariaLabel={`Messages and calls by day of the week${avg ? ", on an average day" : ""}. The arrow keys read each day.`} />
                {vm.hours && (
                  <div className="rpt-hours">
                    <span className="ck-segbar-title">By hour of the day</span>
                    <HeatStrip values={vm.hours.values} labels={vm.hours.labels} unit="messages and calls"
                      ariaLabel="Messages and calls by hour of the day. The arrow keys read each hour." />
                  </div>
                )}
              </ChartCard>
              <ChartCard className="rpt-span-4" title="New people, adding up" testid="chart-people" config={people}
                table={{ columns: ["Day", "New people"], rows: vm.people.points.map((p) => [p.label, p.newPeople]) }}>
                {vm.people.total ? (
                  <LineChart data={vm.people.cumulative.points} keys={[{ key: "total", fill: true }]} prior={peopleBefore} config={people} height="fill" floor={176} animKey={days}
                    ariaLabel="New people added up over the period, beside the period before. The arrow keys read each day."
                    tip={(d, i, ctx) => ({ title: d.label, rows: [
                      { key: "total", label: "so far", value: d.total },
                      ...(ctx.prior != null ? [{ key: "prior", label: `by this day, ${before}`, value: ctx.prior }] : []),
                    ], note: d.newPeople ? `${rptPlural(d.newPeople, "new person", "new people")} that day` : null })}
                    describe={(d, i, ctx) => `${d.label}: ${d.total} so far${ctx.prior != null ? `, ${ctx.prior} by this day ${before}` : ""}`} />
                ) : <EmptyState kind="line" title="Nobody new wrote or called in this period." />}
              </ChartCard>
            </div>
          </RptSection>
        </>
      )}

      <RptSection title="Campaigns" meta="what your broadcasts and playbooks sent">
        {!cm ? (
          <FailedRead kind="card" what="the campaign numbers" body="The receptionist's own numbers above are current." surface="reports" testid="chart-campaigns" />
        ) : cm.empty ? (
          <EmptyState kind="card" glyph="wave" title="Nothing went out" testid="chart-campaigns"
            body={`No broadcast or playbook run reached anyone between ${vm.since} and ${vm.until}, and nobody said yes or asked to stop.`}
            action={{ label: "Open Broadcasts", to: "broadcasts" }} />
        ) : (
          <div className="rpt-grid">
            <ChartCard className="rpt-span-5" title="From sent to replied" testid="chart-funnel" takeaway={cm.lines.funnel}>
              {cm.totals.sent ? (
                <BarList max={cm.totals.sent} rows={[
                  { id: "sent", label: "Sent", value: cm.totals.sent, color: "var(--chart-ramp-5)" },
                  { id: "delivered", label: "Delivered", value: cm.totals.delivered, display: `${cm.totals.delivered}  ${sentPct(cm.totals.delivered)}%`, color: "var(--chart-ramp-4)" },
                  { id: "replied", label: "Wrote back", value: cm.totals.replied, display: `${cm.totals.replied}  ${sentPct(cm.totals.replied)}%`, color: "var(--chart-ramp-3)" },
                ]} />
              ) : <EmptyState kind="line" title="No message went out in this period." />}
            </ChartCard>
            <ChartCard className="rpt-span-7" title="Sent, day by day" testid="chart-campaigns" takeaway={cm.lines.sent} config={RPT_SENT} table={cm.table}>
              {cm.totals.sent ? (
                <BarChart data={cm.points} keys={["sent"]} config={RPT_SENT} height={150} yTicks={2} animKey={days}
                  ariaLabel="Campaign messages sent per day. The arrow keys read each day."
                  tipNote={(d) => (d.replied ? `${d.replied} wrote back` : null)} describe={(d) => `${d.label}: ${d.sent} sent`} />
              ) : <EmptyState kind="line" title="No message went out in this period; the yeses and stops are the people's own." />}
            </ChartCard>
            <ChartCard className="rpt-span-12" title="By playbook and broadcast" testid="chart-sources" switchable={false}
              table={{ columns: ["Source", "Kind", "Runs", "Sent", "Delivered", "Replied"], rows: cm.sources.map((x) => [x.name, x.kindLabel, x.runs, x.sent, x.delivered, x.replied]) }}>
              <RptSources rows={cm.sources} />
            </ChartCard>
          </div>
        )}
      </RptSection>
    </>
  );
};

Object.assign(window, { ReportsSections, RptSection });
