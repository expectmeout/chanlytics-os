/* global React, Icon */
// Hero brief — sits at the top of Dashboard A.
// Replaces the flat greeting+sub with a structured editorial block:
//   eyebrow timestamp · big sentence · three anchor stats (revenue/appts/response) · forecast line
// The progress arc visualizes pace toward EOD revenue target.

const HeroBrief = () => {
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

// Half-arc showing pace toward today's target
const PulseArc = ({ pct, value, target }) => {
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
        <div className="pulse-arc-of">of {target} pace</div>
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
