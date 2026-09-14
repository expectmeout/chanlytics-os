/* global React, Icon, FailedRead */
// Hero brief — sits at the top of Dashboard A.
// Replaces the flat greeting+sub with a structured editorial block:
//   eyebrow timestamp · big sentence · three anchor stats (revenue/appts/response) · forecast line
// The progress arc visualizes pace toward EOD revenue target.

// Slice 4: when the seam has written window.TODAY_DATA (the real morning
// brief), the SAME hero renders real numbers; otherwise the seeded mockup
// stands, exactly like every other unflipped surface. Design is shared —
// only the data source branches.
// A playbook's run that waited for a person: the sweep found people and the
// class is set to ask. Read from the Broadcasts surface, which boots with the
// rest, so Today needs no fetch of its own. Approve here, or open Playbooks.
const RunsDone = ({ nav }) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:broadcasts", bump);
    return () => window.removeEventListener("surface:broadcasts", bump);
  }, []);
  const all = (window.__BROADCASTS && window.__BROADCASTS.rows) || [];
  // What went out today — a playbook's run or a broadcast — with what it has
  // earned so far. The runs that wait for a word, and the ones under a Stop,
  // are rows of the queue (dashboard-a-command.jsx).
  // Today, and the time it went, are the business's (window.__clock), not the browser's.
  const C = window.__clock;
  const done = all.filter((r) => (r.state === "sent" || r.state === "sending") && r.started_at && C.dayKey(Date.parse(r.started_at)) === C.dayKey(Date.now())).slice(0, 2);
  const timeOf = (iso) => C.time(Date.parse(iso));
  return done.map((r) => (
    <div key={`run-${r.id}`} className="brief-beat" data-testid="brief-run-done">
      <span className="brief-beat-dot" style={{ background: "var(--ok)" }} />
      <span className="brief-beat-text">
        <b>{r.playbook_id ? r.audience.label : r.name}</b> {r.playbook_id ? "ran" : "went out"} at {timeOf(r.started_at)} — {r.counts.sent} sent{r.counts.replied ? `, ${r.counts.replied} replied` : ""}{r.state === "sending" ? " · still sending" : ""}
      </span>
      <button className="brief-chip" onClick={() => nav("broadcasts")}>Open <Icon name="arrow-right" size={10} /></button>
    </div>
  ));
};

// The day's facts beside the recap's — appointments today, what is booked
// ahead — from the calendar and People surfaces the page already holds
// (contracts/today.ts todayDayFacts, published by the bridge). The day
// itself is the module beside the queue (dashboard-a-day.jsx).
const DayFacts = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const names = ["surface:calendar", "surface:people"];
    names.forEach((n) => window.addEventListener(n, bump));
    return () => names.forEach((n) => window.removeEventListener(n, bump));
  }, []);
  const C = window.__CALENDAR;
  const P = window.__PEOPLE;
  if (!window.__today) return null;
  const facts = window.__today.facts(C ? C.vm : null, P ? P.aggregates : null);
  return facts.map((f, i) => <StatCell key={`day-${i}`} label={f.label} value={f.value} valueSize={22} meta={f.hint} />);
};

// Setup's one line while something on the Setup page is open — the count and
// the next verb, from the Setup surface (contracts/setup.ts). Rows the owner
// put off for later are not counted. Gone the moment everything is ready.
const SetupLine = ({ nav }) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:setup", bump);
    return () => window.removeEventListener("surface:setup", bump);
  }, []);
  const S = window.__SETUP;
  if (!S || !S.vm.line) return null;
  return (
    <div className="brief-beat" data-testid="brief-setup">
      <span className="brief-beat-dot" style={S.vm.readiness.answering ? undefined : { background: "var(--accent)" }} />
      <span className="brief-beat-text">{S.vm.line}</span>
      <button className="brief-chip" onClick={() => nav("admin/setup")}>Open Setup <Icon name="arrow-right" size={10} /></button>
    </div>
  );
};

// A review on Google, the morning it lands: first seen in the last day and
// a half, written recently, not part of the first read (contracts/google.ts
// reviewIsNew). From the Google surface, which boots with the rest. Gone
// once it is old news.
const ReviewLine = ({ nav }) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:google", bump);
    return () => window.removeEventListener("surface:google", bump);
  }, []);
  const G = window.__GOOGLE;
  if (!G || !G.dto.listing || !window.__google) return null;
  const line = window.__google.vm(G.dto, 30).todayLine;
  if (!line) return null;
  return (
    <div className="brief-beat" data-testid="brief-review">
      <span className="brief-beat-dot" style={{ background: "var(--ok)" }} />
      <span className="brief-beat-text">{line.text}</span>
      <button className="brief-chip" onClick={() => nav(line.to)}>Open Reports <Icon name="arrow-right" size={10} /></button>
    </div>
  );
};

const HeroBrief = () => {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const bump = () => force((n) => n + 1);
    window.addEventListener("surface:today", bump);
    return () => window.removeEventListener("surface:today", bump);
  }, []);
  return window.TODAY_DATA ? <HeroBriefReal vm={window.TODAY_DATA} /> : <HeroBriefSeed />;
};

const HeroBriefReal = ({ vm }) => {
  // The rows — who needs you, a caller to call back, a closing window, a call
  // worth an ear, a call in progress — are the queue's (dashboard-a-command.jsx).
  // The hero keeps what the queue cannot say: the day in sentences.
  const { standing, needsYou, recap, pulse, quiet } = vm;
  const [toastNode] = window.usePPToast();
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const up = standing.chips.filter((c) => c.ok).length;
  const total = standing.chips.length;
  const waiting = needsYou ? needsYou.count : 0;

  return (
    <header className="brief">
      <div className="brief-meta">
        <span className="brief-eyebrow">{standing.eyebrow}</span>
        <span className="brief-eyebrow-sep">·</span>
        <span className="brief-eyebrow">
          <span className="live-dot" style={up < total ? { background: "var(--danger)" } : undefined} /> {total > 0 ? `${up} of ${total} ${total === 1 ? "line" : "lines"} connected` : "no channels connected yet"}
        </span>
        <div className="brief-meta-spacer" />
      </div>

      <div className="brief-body">
        <div className="brief-narrative">
          <h1 className="brief-headline">
            <span className="brief-greeting">{standing.greeting}</span>{" "}
            <span className="brief-sub" style={standing.alert ? { color: "var(--danger)" } : undefined}>
              {standing.alert || standing.headline}
            </span>
          </h1>
          <div className="brief-beats">
            {standing.detail && !standing.alert && (
              <div className="brief-beat">
                <span className="brief-beat-dot" />
                <span className="brief-beat-text">{standing.detail}</span>
              </div>
            )}
            <SetupLine nav={nav} />
            <ReviewLine nav={nav} />
            {quiet && (
              <div className="brief-beat">
                <span className="brief-beat-dot" style={{ background: "var(--ok)" }} />
                <span className="brief-beat-text">{quiet.sub}</span>
              </div>
            )}
            {/* Narrative the headline doesn't carry — crucially the one line
                that must never be silent: a reply that failed to deliver. It
                was computed by the VM from day one and never rendered, so a
                dead send was invisible on the very surface built to say
                "everything is fine". */}
            {(recap ? recap.sentences : []).map((sn, i) => (
              <div key={`sn-${i}`} className="brief-beat">
                <span className="brief-beat-dot" style={sn.warn ? { background: "var(--danger)" } : undefined} />
                <span className="brief-beat-text" style={sn.warn ? { color: "var(--danger)" } : undefined}>{sn.text}</span>
                {sn.warn && (
                  <button className="brief-chip" onClick={() => nav("inbox")}>See the thread <Icon name="arrow-right" size={10} /></button>
                )}
              </div>
            ))}
            <RunsDone nav={nav} />
            {vm.callsRead === false && <FailedRead kind="line" what="the phone line's calls" body="The day's other numbers are current." surface="today" testid="brief-calls-failed" />}
            {(recap ? recap.receipts.slice(0, 1) : []).map((r, i) => (
              <div key={i} className="brief-beat">
                <span className="brief-beat-dot" style={{ background: "var(--ok)" }} />
                <span className="brief-beat-text">{r.at} — {r.text}</span>
                <button className="brief-chip" onClick={() => nav(r.to)}>Open <Icon name="arrow-right" size={10} /></button>
              </div>
            ))}
            <button className="brief-forecast brief-inbox-link" onClick={() => nav("inbox")}>
              <Icon name="inbox" size={13} style={{ color: waiting > 0 ? "var(--accent)" : standing.alert ? "var(--danger)" : "var(--ok)" }} />
              {/* While a line is down nothing reassures: the alert above is the truth, and an empty queue is not "nothing needs you". */}
              <span>{waiting > 0 ? `${waiting} need you` : standing.alert ? "Nothing waiting in the Inbox — new messages go unanswered until the line is back" : "Queue clear — nothing needs you"}</span>
              <Icon name="arrow-right" size={11} style={{ color: "var(--ink-faint)" }} />
            </button>
          </div>
        </div>

        {pulse && (
          <div className="brief-pulse">
            <PulseArc
              pct={Math.min(100, Math.round((pulse.num / pulse.den) * 100))}
              value={String(pulse.num)}
              target={`${pulse.den} message${pulse.den === 1 ? "" : "s"}`}
              suffix="answered"
            />
          </div>
        )}
      </div>

      <StatStrip>
        {(recap ? recap.facts : []).map((f, i) => (
          <StatCell key={i} label={f.label} value={f.value} valueSize={22} meta={f.hint} />
        ))}
        <DayFacts />
      </StatStrip>
      {toastNode}
    </header>
  );
};

const HeroBriefSeed = () => {
  const { MORNING_BRIEF, TODAY_KPIS, AGENT_FLEET } = window.CHANLY_DATA;
  const { headline, body, forecast, pulse } = MORNING_BRIEF;
  const pct = Math.min(100, Math.round((pulse.revenue / pulse.target) * 100));
  const [, setTick] = React.useState(0);

  // Live: decisions shrink "waiting on you"; fleet pauses shrink the live count
  React.useEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("inbox:decisions", bump);
    window.addEventListener("fleet:status", bump);
    return () => { window.removeEventListener("inbox:decisions", bump); window.removeEventListener("fleet:status", bump); };
  }, []);

  const statusOf = (a) => (window.FL_STORE && window.FL_STORE.statuses[window.CHANLY.agentIdFor(a.name)]) || a.status;
  const liveAgents = AGENT_FLEET.filter(a => statusOf(a) === "active").length;
  const totalAgents = AGENT_FLEET.length;
  // Same source + math as the sidebar badge (IX_STORE._broadcast): needs THREADS minus decisions.
  const waiting = (window.THREADS || []).filter((t) =>
    t.state === "needs" && !(window.IX_STORE && window.IX_STORE.get(t.id))
  ).length;

  // Greeting follows the seed clock — IX_NOW is 12:04, past noon
  const seedHour = parseInt(String(window.CHANLY.IX_NOW).split(":")[0], 10);
  const greeting = seedHour < 12 ? "Good morning" : seedHour < 17 ? "Good afternoon" : "Good evening";

  // Pick the three most important KPIs for the anchor row (drop conversion to keep rhythm clean)
  const anchors = [TODAY_KPIS[0], TODAY_KPIS[1], TODAY_KPIS[3]];

  return (
    <header className="brief">
      <div className="brief-meta">
        <span className="brief-eyebrow">{window.CHANLY.SEED_TODAY.toLocaleDateString("en-US", { weekday: "long" })} · {window.CHANLY.SEED_TODAY.toLocaleDateString("en-US", { month: "long", day: "numeric" })} · {window.CHANLY.IX_NOW}</span>
        <span className="brief-eyebrow-sep">·</span>
        <span className="brief-eyebrow">
          <span className="live-dot" /> {liveAgents} of {totalAgents} agents live
        </span>
        <div className="brief-meta-spacer" />
      </div>

      <div className="brief-body">
        <div className="brief-narrative">
          <h1 className="brief-headline">
            <span className="brief-greeting">{greeting}, Sarah.</span>{" "}
            <span className="brief-sub">{body.split(". ")[0]}.</span>
          </h1>
          <BriefBeats forecast={forecast} waiting={waiting} />
        </div>

        <div className="brief-pulse">
          <PulseArc pct={pct} value={`$${pulse.revenue.toLocaleString()}`} target={`$${pulse.target.toLocaleString()}`} />
        </div>
      </div>

      <StatStrip>
        {anchors.map((k, i) => (
          <StatCell
            key={i}
            label={k.label}
            value={k.value}
            valueSize={22}
            meta={`${k.delta >= 0 ? "↑" : "↓"} ${Math.abs(k.delta)}% · ${k.unit}`}
            metaTone={k.delta >= 0 ? "pos" : "neg"}
            spark={k.spark}
          />
        ))}
      </StatStrip>
    </header>
  );
};

// Half-arc gauge. Seeded: pace toward the revenue target. Real: the share of
// today's messages the receptionist answered on its own.
const PulseArc = ({ pct, value, target, suffix = "pace" }) => {
  const r = 64, c = 2 * Math.PI * r;
  const dash = (pct / 100) * (c * 0.5); // half-circle
  // Dot rides the arc itself (polar coords around center 80,80)
  const theta = Math.PI * (1 - pct / 100);
  const dotX = 80 + r * Math.cos(theta);
  const dotY = 80 - r * Math.sin(theta);
  return (
    <div className="pulse-arc">
      <svg width="160" height="92" viewBox="0 0 160 92">
        <path d={`M 16 80 A ${r} ${r} 0 0 1 144 80`} stroke="var(--line)" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path
          d={`M 16 80 A ${r} ${r} 0 0 1 144 80`}
          stroke="var(--accent)" strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
        <circle cx={dotX} cy={dotY} r="3" fill="var(--accent)" />
      </svg>
      <div className="pulse-arc-readout">
        <div className="pulse-arc-value tabular">{value}</div>
        <div className="pulse-arc-of">of {target} {suffix}</div>
      </div>
    </div>
  );
};

// The brief speaks in sentences with inline decisions — not stat cells (#14)
const BriefBeats = ({ forecast, waiting }) => {
  const [, setBb] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setBb(n => n + 1);
    window.addEventListener("inbox:decisions", bump);
    return () => window.removeEventListener("inbox:decisions", bump);
  }, []);
  const dec = (id) => window.IX_STORE && window.IX_STORE.get(id);
  const decide = (threadId, action) => {
    if (!(window.canDo && window.canDo("approve"))) return;
    window.IX_STORE.set(threadId, { action, at: window.CHANLY.IX_NOW, kind: "decided" });
  };
  const beats = [
    {
      id: "th-aisha-refund",
      text: <>Aisha wants her $120 fee refunded — refunds are yours, so the plan books her with you at <b>4:30</b>.</>,
      chip: "Approve the plan", action: "Resolution call — today 4:30",
      doneText: "Booked — she talks to you at 4:30",
    },
    {
      id: "th-jordan-discount",
      text: <>Jordan (Maya's referral) asked for her 20% rate — the intro-call offer is drafted with <b>two slots</b>.</>,
      chip: "Send the offer", action: "Offer the slots",
      doneText: "Sent — Phone Rep offers the slots",
    },
    { id: null, text: <>{forecast}</>, chip: "What's driving it", to: "reports" },
  ];
  return (
    <div className="brief-beats">
      {beats.map((b, i) => {
        const d = b.id ? dec(b.id) : null;
        return (
          <div key={i} className="brief-beat">
            <span className="brief-beat-dot" />
            <span className="brief-beat-text">{b.text}</span>
            {b.to && (
              <button className="brief-chip" onClick={() => window.CHANLY.nav(b.to)}>{b.chip} <Icon name="arrow-right" size={10} /></button>
            )}
            {b.id && !d && (
              <span className="brief-beat-acts">
                <button className="brief-chip primary" onClick={() => decide(b.id, b.action)} {...window.gate("approve")}>{b.chip}</button>
                <button className="brief-chip" onClick={() => window.CHANLY.nav("inbox/" + b.id)}>Review</button>
              </span>
            )}
            {b.id && d && d.kind === "decided" && (
              <span className="brief-beat-done"><Icon name="check" size={10} /> {b.doneText}</span>
            )}
          </div>
        );
      })}
      <button className="brief-forecast brief-inbox-link" onClick={() => window.CHANLY.nav("inbox")}>
        <Icon name="inbox" size={13} style={{ color: waiting > 0 ? "var(--accent)" : "var(--ok)" }} />
        <span>{waiting > 0 ? `${waiting} waiting on you` : "Queue clear — all decided"}</span>
        <Icon name="arrow-right" size={11} style={{ color: "var(--ink-faint)" }} />
      </button>
    </div>
  );
};

window.HeroBrief = HeroBrief;
