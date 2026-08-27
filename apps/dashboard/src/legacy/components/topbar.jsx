/* global React, Icon, usePPToast */
// Chanlytics — Top bar (unified) + typed notifications popover.
// Popover pattern adopted from the legacy repo's notification-action-card:
// every notification carries contextual actions that deep-link into the OS.
// Session-aware: thread-linked notifications overlay IX_STORE (decided →
// resolved), integration nags overlay INT_STORE (fixed → confirmed).

const TB_NOTIFS = [
  { id: "n1", icon: "alert", tone: "accent", unread: true, time: "2m", threadId: "th-aisha-refund",
    title: "Aisha Khan — refund request", message: "Phone Rep holds a 4:30 resolution-call slot — needs your go.",
    actions: [{ label: "Decide", to: "inbox/th-aisha-refund", primary: true }, { label: "Open client", to: "clients/c-aisha" }] },
  { id: "n-trust", icon: "trending-up", tone: "accent", unread: true, time: "9m",
    title: "Email Agent is earning more autonomy",
    message: "7 clean approvals in a row on Re-engage — 3 more unlocks the veto window (drafts send unless you stop them).",
    actions: [{ label: "Review agent", to: "fleet/email-agent", primary: true }, { label: "Policy matrix", to: "admin/autonomy" }] },
  { id: "n2", icon: "phone", tone: "ok", unread: true, time: "12m",
    title: "Call completed — Maya Rodriguez", message: "Booked deep tissue 60 (+$280) · referral mentioned.",
    actions: [{ label: "Transcript", to: "conversations/cv-maya-call", primary: true }] },
  { id: "n-seg1", icon: "users", tone: "warn", unread: true, time: "28m", seg: { dir: "in" },
    title: "Drifting VIPs — Yuki Tanaka entered", message: "30 days since her last visit. VIP drift watch started — outreach paused until May 1 per her ask.",
    actions: [{ label: "Open list", to: "segments/drifting-vips", primary: true }, { label: "Client", to: "clients/c-yuki" }] },
  { id: "n3", icon: "x", tone: "danger", unread: true, time: "1h", intId: "gmail",
    title: "Task failed — nurture send", message: "Gmail token expiring; send queued until reauthorized.",
    actions: [{ label: "Reconnect", to: "admin/integrations", primary: true }, { label: "View task", to: "tasks" }] },
  { id: "n4", icon: "calendar", tone: "warn", unread: false, time: "2h",
    title: "No-show risk — Priya Shah", message: "Rescheduled 2× · 2:45 PM hot stone today.",
    actions: [{ label: "Calendar", to: "calendar/a-priya", primary: true }] },
  { id: "n-seg2", icon: "users", tone: "ok", unread: false, time: "6h", seg: { dir: "out" },
    title: "Lapsed 60+ — Sam Rivera left", message: "Booked after win-back touch 2 (+$120). Recovery Agent closed the sequence.",
    actions: [{ label: "Open list", to: "segments/lapsed-60", primary: true }, { label: "In Reports", to: "reports" }] },
  { id: "n5", icon: "deal", tone: "ok", unread: false, time: "1d",
    title: "Deal won — Amy Goldberg", message: "12-pack renewal · $900.",
    actions: [{ label: "Pipeline", to: "pipeline", primary: true }] },
  { id: "n6", icon: "shield", tone: "", unread: false, time: "2d",
    title: "Milestone — Phone Rep", message: "Earned booking auto-approval after 10 clean approvals.",
    actions: [{ label: "View agent", to: "fleet/phone-rep", primary: true }] },
];

// Session overlay — the bell reflects what you've already handled
const tbOverlay = (n) => {
  if (n.threadId && window.IX_STORE) {
    const rec = window.IX_STORE.get(n.threadId);
    if (rec && rec.kind === "decided") {
      return {
        ...n, unread: false, icon: rec.declined ? "x" : "check", tone: rec.declined ? "" : "ok",
        title: n.title.split(" — ")[0] + " — " + (rec.declined ? "declined" : "decided"),
        message: `You chose “${rec.action}” at ${rec.at} — the agent is executing.`,
        actions: [{ label: "View thread", to: `inbox/${n.threadId}`, primary: true }],
      };
    }
  }
  if (n.intId && window.INT_STORE && window.INT_STORE.isFixed(n.intId)) {
    return {
      ...n, unread: false, icon: "check", tone: "ok",
      title: "Gmail reconnected ✓",
      message: "Email Agent is releasing Noah's day-14 nurture — sends today.",
      actions: [{ label: "View task", to: "tasks", primary: true }],
    };
  }
  return n;
};

const NotifPopover = ({ items, onAction, onReadAll, onDismiss, onClose }) => {
  const fresh = items.filter(n => n.unread);
  const earlier = items.filter(n => !n.unread);
  const row = (n) => (
    <div key={n.id} className={`tbn-item ${n.unread ? "unread" : ""}`}>
      <button className="tbn-x" title="Dismiss" aria-label={`Dismiss “${n.title}”`} onClick={() => onDismiss(n.id)}>
        <Icon name="x" size={10} />
      </button>
      {n.unread && <span className="tbn-dot" />}
      <span className={`tbn-icon ${n.tone}`}><Icon name={n.icon} size={13} /></span>
      <div className="tbn-body">
        <div className="tbn-line1">
          <span className="tbn-item-title">{n.title}</span>
          {n.seg && <span className={`sp-dir ${n.seg.dir}`} style={{ fontSize: 9.5, padding: "1px 6px", minWidth: 0 }}>{n.seg.dir === "in" ? "entered" : "left"}</span>}
          <span className="tbn-time tabular">{n.time}</span>
        </div>
        <div className="tbn-msg">{n.message}</div>
        <div className="tbn-actions">
          {n.actions.map(a => (
            <button key={a.label} className={`btn btn-sm ${a.primary ? "" : "btn-ghost"}`} onClick={() => onAction(n.id, a.to)}>
              {a.label}{a.primary && <Icon name="arrow-right" size={10} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
  return (
    <>
      <div className="tbn-backdrop" onClick={onClose} />
      <div className="tbn-pop" role="dialog" aria-label="Notifications">
        <header className="tbn-head">
          <span className="tbn-title">Notifications</span>
          {fresh.length > 0 && <span className="tbn-count tabular">{fresh.length} new</span>}
          <button className="tbn-readall" onClick={onReadAll}>Mark all read</button>
        </header>
        <div className="tbn-list">
          {items.length === 0 && (
            <div className="tbn-empty">
              <Icon name="check" size={18} />
              <span>All caught up</span>
            </div>
          )}
          {fresh.length > 0 && <div className="tbn-sec">New</div>}
          {fresh.map(row)}
          {earlier.length > 0 && <div className="tbn-sec">Earlier</div>}
          {earlier.map(row)}
        </div>
      </div>
    </>
  );
};

const Topbar = ({
  crumbs = [],
  theme = "light",
  onTheme = () => {},
  onAsk = () => {},
  onMenu = () => {},
  right = null,
}) => {
  const [notifs, setNotifs] = React.useState(TB_NOTIFS);
  const [openNotifs, setOpenNotifs] = React.useState(false);
  const [ping, setPing] = React.useState(false);
  const pingKey = React.useRef(null);
  const [toastNode, flash] = usePPToast();
  const [, setTick] = React.useState(0);

  // Live overlay — decisions and integration fixes flip bell items;
  // ending the live call and listing-review outcomes PUSH session notifications
  React.useEffect(() => {
    const bump = () => setTick(n => n + 1);
    const onEnded = () => setNotifs(list => list.some(n => n.id === "n-live-end") ? list : [{
      id: "n-live-end", icon: "phone", tone: "ok", unread: true, time: "now",
      title: "Call ended — Selena Cho", message: "Phone Rep wrapped and booked Swedish 60 today 11:30 ($180).",
      actions: [{ label: "Transcript", to: "conversations/cv-selena-live", primary: true }, { label: "Calendar", to: "calendar/a-selena" }],
    }, ...list]);
    // Listing review outcomes: rejection lands in the bell; the fix closes the loop
    const onListing = (e) => {
      const id = e.detail && e.detail.id;
      const l = ((window.STORE_DATA || {}).STORE_LISTINGS || []).find(x => x.id === id);
      if (!l) return;
      const nid = "n-lst-" + id;
      if (l.status === "rejected") {
        const item = {
          id: nid, icon: "x", tone: "danger", unread: true, time: "now",
          title: `Listing rejected — ${l.name}`,
          message: l.rejectReason || "Review failed — see the checklist in Studio.",
          actions: [{ label: "Fix in Studio", to: "studio", primary: true }, { label: "Your listings", to: "store" }],
        };
        setNotifs(list => {
          const i = list.findIndex(n => n.id === nid);
          if (i >= 0) { const next = [...list]; next[i] = item; return next; }
          return [item, ...list];
        });
      } else if (l.status === "listed") {
        // Only close the loop for listings the bell flagged as rejected
        setNotifs(list => {
          const i = list.findIndex(n => n.id === nid);
          if (i < 0) return list;
          const next = [...list];
          next[i] = {
            id: nid, icon: "check", tone: "ok", unread: true, time: "now",
            title: `Listed — ${l.name}`,
            message: "Passed all 5 review checks after your fix — live in the Store.",
            actions: [{ label: "Your listings", to: "store", primary: true }],
          };
          return next;
        });
      }
    };
    // Commit moments across all four flows push into the bell:
    // lead conversion (flow 1), broadcast/batch sends (flow 3) — decisions (flow 2)
    // overlay in place, listings (flow 4) are handled below.
    const onLeadConv = (e) => {
      const d = e.detail || {};
      setNotifs(list => list.some(n => n.id === "n-lead-" + d.leadId) ? list : [{
        id: "n-lead-" + d.leadId, icon: "deal", tone: "ok", unread: true, time: "now",
        title: `Lead converted — ${d.name}`,
        message: "Client record created · entered New this month.",
        actions: [{ label: "Open client", to: d.clientId ? "clients/" + d.clientId : "clients", primary: true }, { label: "Leads", to: "leads" }],
      }, ...list]);
    };
    const onBcSent = (e) => {
      const d = e.detail || {};
      setNotifs(list => [{
        id: "n-bc-" + Date.now(), icon: "chat", tone: "ok", unread: true, time: "now",
        title: `Broadcast queued — ${d.name}`,
        message: `${d.count} recipients over ${d.channel} — replies land in Conversations.`,
        actions: [{ label: d.segId ? "Open segment" : "Broadcasts", to: d.segId ? "segments/" + d.segId : "broadcasts", primary: true }, { label: "Conversations", to: "conversations" }],
      }, ...list]);
    };
    const onObApproved = (e) => {
      const d = e.detail || {};
      setNotifs(list => list.some(n => n.id === "n-ob-" + d.id) ? list : [{
        id: "n-ob-" + d.id, icon: "mail", tone: "ok", unread: true, time: "now",
        title: `Batch approved — ${d.name}`,
        message: `${d.count} sends queued — SMS Agent handles delivery and reports back in Tasks.`,
        actions: [{ label: "In Tasks", to: "tasks", primary: true }],
      }, ...list]);
    };
    const onLeadArr = (e) => {
      const d = e.detail || {};
      if (d.phase === "arrived") {
        setNotifs(list => list.some(n => n.id === "n-lead-arr") ? list : [{
          id: "n-lead-arr", icon: "phone", tone: "accent", unread: true, time: "now",
          title: "New lead — Riley Nguyen",
          message: "Missed call → texted back. SMS Agent answered in 9s; Qualifier is scoring intent.",
          actions: [{ label: "Open lead", to: "leads/ld-riley", primary: true }, { label: "All leads", to: "leads" }],
        }, ...list]);
      } else if (d.phase === "scored") {
        setNotifs(list => list.map(n => n.id === "n-lead-arr" ? {
          ...n, icon: "sparkle", unread: true, time: "now",
          title: "Lead scored 78 — Riley Nguyen",
          message: "Qualifier: prenatal cert is the constraint — Emma has Thu 2:00 open. Books itself when she confirms.",
        } : n));
      }
    };
    const onHandoff = (e) => {
      const d = e.detail || {};
      setNotifs(list => list.some(n => n.id === "n-ho-" + d.agentId) ? list : [{
        id: "n-ho-" + d.agentId, icon: "agents", tone: "accent", unread: true, time: "now",
        title: `Handoff — ${d.kind}`,
        message: `Found 3 items low; reorder drafts attached — routed to ${d.route} per your handoff map.`,
        actions: [{ label: "In Tasks", to: "tasks", primary: true }, { label: "Its card", to: "fleet/" + d.agentId }],
      }, ...list]);
    };
    window.addEventListener("inbox:decisions", bump);
    window.addEventListener("integrations:changed", bump);
    window.addEventListener("live:ended", onEnded);
    window.addEventListener("store:listing", onListing);
    window.addEventListener("leads:converted", onLeadConv);
    window.addEventListener("broadcasts:sent", onBcSent);
    window.addEventListener("outbound:approved", onObApproved);
    window.addEventListener("leads:arrived", onLeadArr);
    window.addEventListener("fleet:handoff", onHandoff);
    // The one scripted inbound moment — DEMO_MODE only (never over real data)
    const arrT = window.__DEMO_MODE ? setTimeout(() => { if (window.LD_STORE) window.LD_STORE.arrive(); }, 18000) : null;
    return () => {
      if (arrT) clearTimeout(arrT);
      window.removeEventListener("inbox:decisions", bump);
      window.removeEventListener("integrations:changed", bump);
      window.removeEventListener("live:ended", onEnded);
      window.removeEventListener("store:listing", onListing);
      window.removeEventListener("leads:converted", onLeadConv);
      window.removeEventListener("broadcasts:sent", onBcSent);
      window.removeEventListener("outbound:approved", onObApproved);
      window.removeEventListener("leads:arrived", onLeadArr);
      window.removeEventListener("fleet:handoff", onHandoff);
    };
  }, []);

  const [, prBump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("presence:changed", prBump);
    return () => window.removeEventListener("presence:changed", prBump);
  }, []);

  // "What changed while you were away" — the presence payoff (#19)
  const prevAwayRef = React.useRef(!!(window.PR_STORE && window.PR_STORE.away));
  React.useEffect(() => {
    const onPr = () => {
      const nowAway = !!(window.PR_STORE && window.PR_STORE.away);
      if (prevAwayRef.current && !nowAway) {
        const T = ((window.INBOX_DATA || {}).THREADS) || [];
        const dec = (id) => window.IX_STORE && window.IX_STORE.get(id);
        const needs = T.filter(t => t.state === "needs" && !dec(t.id)).length;
        const held = T.filter(t => t.veto && !dec(t.id)).length;
        flash({ msg: <>Welcome back — <b>{held} send{held === 1 ? "" : "s"}</b> stayed frozen, <b>{needs} decision{needs === 1 ? "" : "s"}</b> waiting. Timers are running again.</> });
      }
      prevAwayRef.current = nowAway;
    };
    window.addEventListener("presence:changed", onPr);
    return () => window.removeEventListener("presence:changed", onPr);
  }, []);

  // The seeded notification feed is demo theater — "Aisha's refund", a trust
  // milestone, a Gmail outage — none of it happened. Outside demo we show no
  // count rather than a badge promising five things to read that don't exist.
  const shown = window.__DEMO_MODE ? notifs.map(tbOverlay) : [];
  const unread = shown.filter(n => n.unread).length;

  React.useEffect(() => {
    if (!openNotifs) return;
    const onKey = (e) => e.key === "Escape" && setOpenNotifs(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNotifs]);

  // Bell swings once when a session push lands (or an item updates in place)
  React.useEffect(() => {
    const f = notifs[0] || notifs.find(n => n.time === "now");
    if (!f || f.time !== "now") return;
    const key = f.id + "|" + f.title;
    if (pingKey.current === key) return;
    pingKey.current = key;
    setPing(true);
    const t = setTimeout(() => setPing(false), 1200);
    return () => clearTimeout(t);
  }, [notifs]);

  const act = (id, to) => {
    setNotifs(list => list.map(n => n.id === id ? { ...n, unread: false } : n));
    setOpenNotifs(false);
    if (to) window.CHANLY.nav(to);
  };

  const readAll = () => {
    const prev = notifs;
    setNotifs(list => list.map(n => ({ ...n, unread: false })));
    flash({ msg: <>All notifications marked read</>, undo: () => setNotifs(prev) });
  };

  const dismiss = (id) => {
    const idx = notifs.findIndex(n => n.id === id);
    const item = notifs[idx];
    if (!item) return;
    setNotifs(list => list.filter(n => n.id !== id));
    flash({
      msg: <>Dismissed <b>“{item.title.split(" — ")[0]}”</b></>,
      undo: () => setNotifs(list => {
        const next = [...list];
        next.splice(Math.min(idx, next.length), 0, item);
        return next;
      }),
    });
  };

  return (
    <div className="topbar">
      <button className="btn btn-ghost btn-icon btn-sm tb-menu" title="Menu" onClick={onMenu}>
        <Icon name="menu" />
      </button>
      <div className="crumbs">
        {crumbs.map((c, i) => {
          const label = typeof c === "string" ? c : c.label;
          const to = typeof c === "string" ? null : c.to;
          const last = i === crumbs.length - 1;
          return (
            <React.Fragment key={i}>
              {i > 0 && <span className="crumb-sep">/</span>}
              {to && !last
                ? <button className="crumb-link" onClick={() => window.CHANLY.nav(to)}>{label}</button>
                : <span className={last ? "crumb-active" : ""}>{label}</span>}
            </React.Fragment>
          );
        })}
      </div>

      <div className="topbar-spacer" />

      {/* ⌘K is already stubbed outside demo, but this button still opened the
          overlay — which answers "$1,840 booked against a $4,200 pace" from
          seed data, on every surface including the live ones. Until Ask has a
          real engine, it says so instead of inventing an answer. */}
      <button
        className="tb-ask"
        onClick={window.__DEMO_MODE ? onAsk : undefined}
        disabled={!window.__DEMO_MODE}
        title={window.__DEMO_MODE ? "Ask Chanlytics (⌘K)" : "Ask isn't connected to your data yet"}
      >
        <Icon name="sparkle" size={13} />
        <span className="tb-ask-label">Ask Chanlytics</span>
        {window.__DEMO_MODE ? <span className="kbd">⌘K</span> : <span className="kbd">Soon</span>}
      </button>

      {right}

      <div className="tbn-wrap">
        <MoreMenu
          btnClass="btn btn-ghost btn-sm tb-presence"
          title="Presence — gates transfers and veto timers"
          label={<><span className={`tb-pres-dot ${window.PR_STORE.away ? "away" : window.PR_STORE.transfers ? "" : "off"}`}></span> {window.PR_STORE.away ? "Away" : "Available"}</>}
          items={[
            { header: window.PR_STORE.away ? "Away — veto timers paused · holding line" : "Available — timers run · transfers " + (window.PR_STORE.transfers ? "on" : "off") },
            { label: "Available", icon: "check", onClick: () => window.PR_STORE.setAway(false), meta: window.PR_STORE.away ? "" : "current" },
            { label: "Away", icon: "pause", onClick: () => window.PR_STORE.setAway(true), meta: window.PR_STORE.away ? "current" : "" },
            { divider: true },
            { label: window.PR_STORE.transfers ? "Transfers: on" : "Transfers: off", icon: "phone", meta: window.PR_STORE.away ? "holding line while Away" : "click to flip", onClick: () => window.PR_STORE.setTransfers(!window.PR_STORE.transfers) },
          ]}
        />
        <button
          className={`btn btn-ghost btn-icon btn-sm tb-bell ${ping ? "ping" : ""}`}
          data-tip={unread > 0 ? `${unread} unread — what agents did while you weren't looking` : "What agents did while you weren't looking"}
          data-tip-side="bottom"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          aria-haspopup="dialog"
          aria-expanded={openNotifs}
          onClick={() => setOpenNotifs(v => !v)}
        >
          <Icon name="bell" />
          {unread > 0 && <span className="tb-bell-badge tabular">{unread}</span>}
        </button>
        {openNotifs && (
          <NotifPopover
            items={shown}
            onAction={act}
            onReadAll={readAll}
            onDismiss={dismiss}
            onClose={() => setOpenNotifs(false)}
          />
        )}
      </div>

      {toastNode}

      <button
        className="btn btn-ghost btn-icon btn-sm"
        title={theme === "light" ? "Switch to dark" : "Switch to light"}
        onClick={() => onTheme(theme === "light" ? "dark" : "light")}
      >
        <Icon name={theme === "light" ? "moon" : "sun"} />
      </button>
    </div>
  );
};

window.Topbar = Topbar;
