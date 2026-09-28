/* global React, Icon, StatStrip, StatCell, MoreMenu */
// Campaigns › Broadcasts — one message to the right slice of the list. SMS Agent handles every reply.
// Targeting is live from People › Segments (CLIENT_SEGMENTS) — counts refresh with the lists.
// Sends + schedules follow the decision contract: pp-toast with Undo; session
// sends push into BC_HISTORY_SEED so Segments detail sees them.

const BC_PINNED = ["lapsed-60", "vip-monthly", "pkg-ending", "new-this-month"];
const bcTargets = () => ([
  {
    id: "all", label: "Everyone", kind: "all",
    count: (window.CLIENTS_AGGREGATES || {}).total || 178,
    query: "full reachable list, opt-outs excluded",
  },
  ...(window.CLIENT_SEGMENTS || []),
]);

const BC_TEMPLATES = {
  all:              "Quick note from Serenity Spa — ",
  "vip-monthly":    "You're one of our regulars, so you hear it first: ",
  "lapsed-60":      "We've missed you! Here's 20% off your next visit this month: ",
  "pkg-ending":     "Your package wraps up soon — renew this week and keep your rate: ",
  "new-this-month": "Welcome to Serenity! A little something for your next visit: ",
  "drifting-vips":  "It's been a minute — your usual spot is waiting. Want me to hold one this week? ",
  "advocates":      "Thanks for spreading the word — a little extra for your next visit: ",
};
const BC_TEMPLATE_DEFAULT = "Quick note from Serenity Spa — ";

const BC_HISTORY = [
  { name: "April win-back · 20% off",   date: "Apr 20", seg: "Lapsed 60+ days", segId: "lapsed-60",   sent: 23,  delivered: "100%", replies: 7,  booked: "+$860" },
  { name: "New therapist — meet Jay", date: "Mar 18", seg: "VIPs + regulars",  segId: "vip-monthly", sent: 64,  delivered: "100%", replies: 11, booked: "+$780" },
  { name: "Spring hours change",      date: "Apr 2",  seg: "Everyone",                              sent: 178, delivered: "99%",  replies: 4,  booked: "—" },
  { name: "Hot-stone launch",         date: "Feb 20", seg: "Everyone",                              sent: 171, delivered: "99%",  replies: 9,  booked: "+$650" },
];
window.BC_HISTORY_SEED = BC_HISTORY;

const BC_SCHED_SEED = [
  { id: "sch-may", name: "May schedule change", when: "May 1 · 9:00 AM", segId: "lena-clients", label: "Lena's clients", count: 47, channel: "SMS", paused: false },
];

const bcMoney = (s) => parseInt(String(s).replace(/[^0-9]/g, ""), 10) || 0;

const BroadcastsSeed = ({ initialSegment = null }) => {
  const targets = React.useMemo(bcTargets, []);
  const [seg, setSeg] = React.useState(() => targets.some((t) => t.id === initialSegment) ? initialSegment : "lapsed-60");
  React.useEffect(() => {
    if (initialSegment && targets.some((t) => t.id === initialSegment)) setSeg(initialSegment);
  }, [initialSegment, targets]);
  const [channel, setChannel] = React.useState("sms");
  const [text, setText] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [excluded, setExcluded] = React.useState([]);
  const [history, setHistory] = React.useState(() => [...BC_HISTORY]);      // copy — BC_HISTORY_SEED aliases BC_HISTORY
  const [scheduled, setScheduled] = React.useState(() => [...BC_SCHED_SEED]); // copy — same aliasing hazard
  const [toastNode, ppFlash] = window.usePPToast();
  const [, setBcTick] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setBcTick(n => n + 1);
    window.addEventListener("guardrails:changed", bump);
    return () => window.removeEventListener("guardrails:changed", bump);
  }, []);

  // Delivery-settle timers must not fire after unmount
  const settleTimers = React.useRef([]);
  React.useEffect(() => () => settleTimers.current.forEach((t) => window.clearTimeout(t)), []);

  const active = targets.find((s) => s.id === seg) || targets[0];
  const pinned = targets.filter((t) => t.id === "all" || BC_PINNED.includes(t.id));
  const overflow = targets.filter((t) => t.id !== "all" && !BC_PINNED.includes(t.id));
  const activeIsOverflow = overflow.some((t) => t.id === seg);
  const exclSegs = excluded.map((id) => targets.find((t) => t.id === id)).filter(Boolean);
  const bcHeldFor = (sid) => sid ? (window.CHANLY.membersOf(sid) || []).filter((m) => !window.CHANLY.canMessage(m.id)) : [];
  const compHeldList = active.id !== "all" ? bcHeldFor(active.id) : [];
  const compHeld = compHeldList.length;
  const compHeldNames = compHeldList.map((m) => { const p = [...(window.CLIENTS || []), ...(window.LEADS || [])].find((x) => x.id === m.id); return p ? p.name : m.id; }).join(", ");
  const effective = Math.max(1, active.count - exclSegs.reduce((a, s) => a + s.count, 0) - compHeld);
  const exclCandidates = targets.filter((t) => t.id !== "all" && t.id !== seg && !excluded.includes(t.id));
  const overflowItems = (kind, header) => {
    const group = overflow.filter((t) => t.kind === kind);
    return group.length ? [{ header }, ...group.map((t) => ({ label: t.label, icon: kind === "agent" ? "sparkle" : "filter", meta: String(t.count), onClick: () => setSeg(t.id) }))] : [];
  };

  const flash = (msg, undo = null) => ppFlash({ msg, undo });

  // Channel identity — who sends, from where, how it's throttled
  const CH = channel === "sms"
    ? { label: "SMS", agent: "SMS Agent", from: "the main line", throttle: "staggered over 20 min" }
    : { label: "Email", agent: "Email Agent", from: "hello@serenityspa.co", throttle: "sent in one batch" };
  const smsLen = text.length;
  const smsSegments = Math.max(1, Math.ceil(smsLen / 160));
  const creditFactor = channel === "sms" ? smsSegments : 1;

  // Computed stats — the strip follows the ledger instead of hardcoding
  const stats = React.useMemo(() => {
    const messages = history.reduce((a, h) => a + (h.sent || 0), 0);
    const withBooked = history.filter((h) => bcMoney(h.booked) > 0);
    const booked = withBooked.reduce((a, h) => a + bcMoney(h.booked), 0);
    return { count: history.length, messages, booked, campaigns: withBooked.length };
  }, [history]);

  const sendNow = (override = null) => {
    if (!window.canDo("approve")) return;
    // override: a scheduled row being sent now
    const body = override ? override.name : text;
    if (!override && !text.trim()) return;
    const rowChannel = override ? override.channel : CH.label;
    const rowAgent = rowChannel === "SMS" ? "SMS Agent" : "Email Agent";
    const row = {
      name: override ? override.name : text.slice(0, 32) + (text.length > 32 ? "…" : ""),
      date: "Just now",
      seg: override ? override.label : active.label + (exclSegs.length ? " (excl. " + exclSegs.length + ")" : ""),
      segId: override ? (override.segId || undefined) : (active.id !== "all" ? active.id : undefined),
      channel: rowChannel,
      sent: override ? Math.max(1, override.count - bcHeldFor(override.segId).length) : effective, delivered: "sending…", replies: 0, booked: "—",
    };
    setHistory((h) => [row, ...h]);
    window.BC_HISTORY_SEED.unshift(row);           // Segments detail sees session sends
    window.dispatchEvent(new CustomEvent("broadcasts:sent", { detail: { segId: row.segId || null, name: row.seg, count: row.sent, channel: rowChannel } }));
    if (!override) { setText(""); setSubject(""); }
    // Delivery settles after the throttle kicks in
    const t = window.setTimeout(() => {
      row.delivered = rowChannel === "SMS" ? "100%" : "99%";
      setHistory((h) => [...h]);
    }, 2200);
    settleTimers.current.push(t);
    flash(
      <><b>Queued to {row.seg}</b> · {row.sent} recipients — {rowAgent} sends from {rowChannel === "SMS" ? "the main line" : "hello@serenityspa.co"}, {rowChannel === "SMS" ? "staggered over 20 min" : "in one batch"}</>,
      () => {
        window.clearTimeout(t);
        setHistory((h) => h.filter((x) => x !== row));
        const i = window.BC_HISTORY_SEED.indexOf(row);
        if (i >= 0) window.BC_HISTORY_SEED.splice(i, 1);
      }
    );
  };

  const scheduleIt = (when = "Tomorrow · 9:00 AM") => {
    if (!text.trim()) return;
    const row = {
      id: "sch-" + Date.now(),
      name: text.slice(0, 32) + (text.length > 32 ? "…" : ""),
      when,
      segId: active.id !== "all" ? active.id : null,
      label: active.label,
      count: effective,
      channel: CH.label,
      paused: false,
    };
    setScheduled((s) => [row, ...s]);
    setText("");
    setSubject("");
    flash(
      <><b>Scheduled</b> — {row.when.toLowerCase()} to {row.label} · {row.count} via {row.channel}</>,
      () => setScheduled((s) => s.filter((x) => x.id !== row.id))
    );
  };

  const sendSchedNow = (row) => {
    setScheduled((s) => s.filter((x) => x.id !== row.id));
    sendNow(row);
  };

  const deleteSched = (row) => {
    const idx = scheduled.findIndex((x) => x.id === row.id);
    setScheduled((s) => s.filter((x) => x.id !== row.id));
    flash(
      <><b>{row.name}</b> deleted — nothing will send</>,
      () => setScheduled((s) => {
        const next = [...s];
        next.splice(Math.min(idx, next.length), 0, row);
        return next;
      })
    );
  };

  const draftIt = () => {
    const tpl = BC_TEMPLATES[seg] || BC_TEMPLATE_DEFAULT;
    if (text.trim() && text !== tpl) {
      const prev = text;
      setText(tpl);
      flash(<>Draft replaced your text — undo to get it back</>, () => setText(prev));
    } else {
      setText(tpl);
    }
  };

  const toggleSched = (row) => {
    const wasPaused = row.paused;
    setScheduled((s) => s.map((x) => x.id === row.id ? { ...x, paused: !wasPaused } : x));
    flash(
      <><b>{row.name}</b> {wasPaused ? "resumed" : "paused"}{wasPaused ? " — sends as planned" : " — held until you resume"}</>,
      () => setScheduled((s) => s.map((x) => x.id === row.id ? { ...x, paused: wasPaused } : x))
    );
  };

  return (
    <div className="bc-page">
      <header className="ct-head">
        <div>
          <h2 className="ct-h2">Broadcasts</h2>
          <p className="ct-sub">One message, the right slice of your list. SMS Agent staggers sends and handles every reply itself.</p>
        </div>
      </header>

      <StatStrip>
        <StatCell label="Sent · last 90 days" value={stats.count} meta={`${stats.messages.toLocaleString()} messages`} />
        <StatCell label="Delivery" tip="Delivered ÷ sent, averaged over recent sends · no-consent and DNC contacts are held back before send" value={(() => { const ns = history.map(h => parseInt(h.delivered)).filter(n => !isNaN(n)); return ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length) + "%" : "—"; })()} meta="opt-outs auto-excluded" />
        <StatCell label="Booked from broadcasts" tip="Revenue from bookings that started from a broadcast · 90d" value={`+$${stats.booked.toLocaleString()}`} meta={`across ${stats.campaigns} campaigns`} accent />
      </StatStrip>

      <section className="bc-composer">
        <div className="ct-sec-head">
          <span className="ct-sec-title">New broadcast</span>
        </div>
        <div className="bc-row">
          <span className="bc-row-label">To</span>
          <div className="bc-chips" style={{ flexWrap: "wrap" }}>
            {pinned.map((s) => (
              <button key={s.id} className={"bc-chip" + (seg === s.id ? " active" : "")} onClick={() => setSeg(s.id)}>
                {s.label} <span className="bc-chip-count tabular">{s.count}</span>
              </button>
            ))}
            {activeIsOverflow && (
              <button className="bc-chip active" onClick={() => window.CHANLY.nav(window.CHANLY.R.segment(active.id))} title={`${active.query} — open in Segments`}>
                {active.kind === "agent" && <Icon name="sparkle" size={10} />}
                {active.label} <span className="bc-chip-count tabular">{active.count}</span>
              </button>
            )}
            <MoreMenu
              btnClass="bc-chip"
              title="All segments"
              items={[
                ...overflowItems("agent", "Smart lists"),
                ...overflowItems("lead", "Lead lists"),
                ...overflowItems("manual", "Saved filters"),
                { divider: true },
                { label: "Manage segments", icon: "external", onClick: () => window.CHANLY.nav("segments") },
              ]}
            />
          </div>
        </div>
        <div className="bc-row">
          <span className="bc-row-label">Not</span>
          <div className="bc-chips" style={{ flexWrap: "wrap" }}>
            {exclSegs.map((s) => (
              <button key={s.id} className="bc-chip bc-excl" title="Remove exclusion" onClick={() => setExcluded((x) => x.filter((id) => id !== s.id))}>
                − {s.label} <span className="bc-chip-count tabular">{s.count}</span>
                <Icon name="x" size={9} />
              </button>
            ))}
            <MoreMenu
              btnClass="bc-chip"
              title="Exclude a segment"
              items={[
                { header: "Exclude from this send" },
                ...exclCandidates.map((t) => ({ label: t.label, icon: "filter", meta: String(t.count), onClick: () => setExcluded((x) => [...x, t.id]) })),
              ]}
            />
            {exclSegs.length === 0 && <span className="bc-excl-hint">No exclusions — opt-outs are always excluded</span>}
          </div>
        </div>
        <div className="bc-row">
          <span className="bc-row-label">Via</span>
          <div className="bc-chips">
            <button className={"bc-chip" + (channel === "sms" ? " active" : "")} onClick={() => setChannel("sms")}><Icon name="chat" size={11} /> SMS</button>
            <button className={"bc-chip" + (channel === "email" ? " active" : "")} onClick={() => setChannel("email")}><Icon name="mail" size={11} /> Email</button>
          </div>
        </div>
        {channel === "email" && (
          <input
            className="bc-subject"
            placeholder="Subject — Email Agent sends from hello@serenityspa.co"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        )}
        <textarea
          className="ix-composer-text"
          rows={3}
          placeholder={channel === "sms" ? "Keep it under 160 characters — SMS Agent signs it from the main line…" : "Body — short, personal, one clear ask…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="bc-meta">
          <Icon name="shield" size={11} />
          <span>
            {active.id !== "all" ? `${active.query} · ` : ""}{effective} recipients{exclSegs.length ? ` after ${exclSegs.length} exclusion${exclSegs.length === 1 ? "" : "s"} (assumes no overlap — Qualifier dedupes at send)` : ""} · ~{(effective * creditFactor).toLocaleString()} credits · {CH.throttle} · quiet hours 9pm–8am respected
          </span>
          {(() => {
            const g = (window.SEG_GUARDRAILS || []).find(x => x.segId === active.id);
            return g ? (
              <button className="fl-guard-link" data-tip={`${g.hint} — this send is bound by it · set in Settings › Autonomy`} onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("autonomy"))}>
                <Icon name="shield" size={9} /> {g.label}: {g.value}
              </button>
            ) : null;
          })()}
          <span className="bc-comp" title={compHeld > 0 ? `Held: ${compHeldNames}` : "Every send checks consent + DNC automatically"}>{compHeld > 0 ? `· ${compHeld} held back — no consent/DNC` : "· consent & DNC checked"}</span>
          {channel === "sms" && (
            <span className={"bc-count tabular" + (smsLen > 160 ? " over" : "")}>
              {smsLen}/160{smsLen > 160 ? ` · ${smsSegments} segments · ${smsSegments}× credits` : ""}
            </span>
          )}
        </div>
        <div className="bc-actions">
          <button className="btn btn-ghost btn-sm" onClick={draftIt}><Icon name="sparkle" size={11} /> Draft with Chanlytics</button>
          <span className="bc-actions-spacer" />
          <MoreMenu
            btnClass="btn btn-sm"
            title="Pick a send time"
            label="Schedule…"
            items={[
              { header: "Send later" },
              { label: "Tomorrow · 9:00 AM", icon: "clock", onClick: () => scheduleIt("Tomorrow · 9:00 AM") },
              { label: "Saturday · 10:00 AM", icon: "clock", onClick: () => scheduleIt("Sat · 10:00 AM") },
              { label: "May 1 · 9:00 AM", icon: "calendar", onClick: () => scheduleIt("May 1 · 9:00 AM") },
            ]}
          />
          <PolicyChip cls="campaign" />
          <button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={() => sendNow()} {...window.gate("approve")}>Send now</button>
        </div>
      </section>

      <section className="ct-section">
        <div className="ct-sec-head">
          <span className="ct-sec-title">Scheduled</span>
          <span className="ct-sec-meta">{scheduled.length} queued</span>
        </div>
        {scheduled.length === 0 && (
          <div className="cv-empty">
            Nothing queued — write a message above and pick a time from <b>Schedule…</b>
          </div>
        )}
        {scheduled.map((row) => (
          <div key={row.id} className="bc-sched">
            <div className="bc-sched-main">
              <span className="bc-sched-name">{row.name}</span>
              <span className="bc-sched-meta">
                {row.when} ·{" "}
                {row.segId ? (
                  <button className="bc-sched-seg" onClick={() => window.CHANLY.nav(window.CHANLY.R.segment(row.segId))}>
                    {row.label} · {row.count} <Icon name="arrow-right" size={9} />
                  </button>
                ) : (
                  <>{row.label} · {row.count}</>
                )}{" "}· {row.channel}
              </span>
            </div>
            {row.paused ? <span className="pill">Paused</span> : <span className="pill pill-info">Scheduled</span>}
            <button className="btn btn-sm" onClick={() => toggleSched(row)}>{row.paused ? "Resume" : "Pause"}</button>
            <MoreMenu items={[
              { header: row.name },
              { label: "Send now", icon: "bolt", onClick: () => sendSchedNow(row) },
              { divider: true },
              { label: "Delete", icon: "x", danger: true, onClick: () => deleteSched(row) },
            ]} />
          </div>
        ))}
      </section>

      <section className="ct-section">
        <div className="ct-sec-head">
          <span className="ct-sec-title">History</span>
          <span className="ct-sec-meta">{history.length} broadcasts</span>
        </div>
        <div className="bc-hist">
          <div className="bc-hist-row head">
            <span>Broadcast</span><span>Audience</span><span className="num">Sent</span><span className="num">Delivered</span><span className="num">Replies</span><span className="num">Booked</span>
          </div>
          {history.map((h, i) => (
            <div key={i} className="bc-hist-row">
              <span className="bc-hist-name">
                {h.channel && <Icon name={h.channel === "SMS" ? "chat" : "mail"} size={10} style={{ color: "var(--ink-faint)", marginRight: 5 }} />}
                {h.name}<span className="bc-hist-date">{h.date}</span>
              </span>
              {h.segId ? (
                <button className="bc-hist-seg chip" title="Open in Segments" onClick={() => window.CHANLY.nav(window.CHANLY.R.segment(h.segId))}>
                  <Icon name="sparkle" size={9} />{h.seg}
                </button>
              ) : (
                <span className="bc-hist-seg">{h.seg}</span>
              )}
              <span className="num tabular">{h.sent}</span>
              <span className="num tabular">{h.delivered}</span>
              <span className="num tabular">{h.replies}</span>
              <span className={"num tabular" + (h.booked !== "—" ? " ok" : "")}>{h.booked}</span>
            </div>
          ))}
        </div>
        <div className="ct-week-foot"><Icon name="chat" size={11} /> Replies never sit — SMS Agent answers, books, or escalates to your Inbox within a minute.</div>
      </section>

      {toastNode}
    </div>
  );
};

// A real workspace renders its broadcasts (pages/broadcasts.jsx); the seeded page keeps the demo, drawn by that page
// where the bridge has not fed it.
window.BroadcastsSeed = BroadcastsSeed;
