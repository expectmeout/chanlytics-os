/* global React, Icon, usePPToast, useSurface */
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

// On a phone the notes are a sheet from the bottom, as every other sheet there is (components.css, the bell's sheet).
const tbnPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
/**
 * The bell's notes: each one a single press that does what it says, two lines and a time, the way the Inbox's rows
 * read. Every note used to carry its own 44px row of boxed buttons ("Open Leads", "Open the Inbox") saying where
 * the press on it would have gone anyway, a 12px title wrapped to two lines, and a count beside the head that the
 * sections already said: on the salon's phone, 48 notes at 114 to 182px each, a list 6,677px long (25 Sep). Notes of
 * one kind are said once ("9 calls", contracts bellSections through the bell's own `sections`) and open with a press.
 */
const tbnVerb = (n) => (n.actions || []).find((a) => a.primary) || (n.actions || [])[0] || null;
const tbnSections = (items) => {
  if (window.__notifs && window.__notifs.sections) return window.__notifs.sections(items);
  // The mockup's own bell has no grouping: its notes stand one to a line, new above earlier.
  const one = (n) => ({ key: n.id, row: n, count: 1, title: null, members: [n] });
  return [
    { label: "New", lines: items.filter((n) => n.unread).map(one) },
    { label: "Earlier", lines: items.filter((n) => !n.unread).map(one) },
  ].filter((s) => s.lines.length > 0);
};

// A dismissed note folds shut over this long (components.css .tbn-slot), so the notes under it glide up, then it goes.
const TBN_FOLD_MS = 200;
const tbnReduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

const NotifPopover = ({ items, onAction, onReadAll, onDismiss, onRead = null, onClose, alerts = null, onAlerts = () => {} }) => {
  const [openGroup, setOpenGroup] = React.useState(null);
  // A note on its way out: dismissed by its × or slid away by a thumb, its slot folds shut (its height measured, then
  // none, over components.css's transition), then it goes; at once under reduced motion. Undo brings it back open.
  const slotEls = React.useRef(new Map());
  const [going, setGoing] = React.useState(null);
  const fold = (id) => {
    const el = slotEls.current.get(id);
    const now = tbnReduced();
    if (el && el.style && !now) {
      el.style.height = `${el.offsetHeight}px`;
      void el.offsetWidth;
      el.style.height = "0px";
    }
    setGoing(id);
    setTimeout(() => {
      onDismiss(id);
      setGoing((g) => (g === id ? null : g));
      if (el && el.style) el.style.height = "";
    }, now ? 0 : TBN_FOLD_MS);
  };
  // A note marked read under the thumb (slid right) keeps its place while the sheet is open, rather than jumping down
  // to Earlier: the sections are worked out as if it were still unread, and it is drawn as it is. The sheet is drawn
  // anew each time it opens, and regroups then.
  const readHere = React.useRef(new Set());
  const asIs = new Map(items.map((n) => [n.id, n]));
  const read = (id) => {
    readHere.current.add(id);
    if (onRead) onRead(id);
  };
  const note = (n0, inGroup) => {
    const n = asIs.get(n0.id) || n0;
    const verb = tbnVerb(n);
    // On a phone a thumb slides the note (data-bits touchSwipe): left over Dismiss, right over Mark read while it is
    // unread. The read note comes back read; the dismissed one stays aside while its slot folds.
    const swipe = window.touchSwipe
      ? window.touchSwipe({ onAway: () => fold(n.id), onBack: n.unread && onRead ? () => read(n.id) : null, when: tbnPhone })
      : {};
    return (
      <div
        key={n.id}
        className="tbn-slot"
        data-going={going === n.id ? "true" : undefined}
        ref={(el) => { if (el) slotEls.current.set(n.id, el); else slotEls.current.delete(n.id); }}
      >
        <div className="tbn-slot-in">
          <span className="tbn-ground tbn-ground-read" aria-hidden="true">{n.unread ? "Mark read" : ""}</span>
          <span className="tbn-ground tbn-ground-dismiss" aria-hidden="true">Dismiss</span>
          <div className={`tbn-item${n.unread ? " unread" : ""}${inGroup ? " in-group" : ""}`} data-tone={n.tone} {...swipe}>
            <button
              type="button"
              className="tbn-open"
              aria-label={verb ? `${verb.label}: ${n.title}` : n.title}
              onClick={() => onAction(n.id, verb ? verb.to : null)}
            >
              {n.unread && <span className="tbn-dot" />}
              {/* The mark says what kind of note this is, never its tone: a warning's title says that (components.css). */}
              {!inGroup && <span className="mark tbn-icon"><Icon name={n.icon} size={13} /></span>}
              <span className="tbn-body">
                <span className="tbn-line1">
                  <span className="tbn-item-title">{n.title}</span>
                  <span className="tbn-time tabular">{n.time}</span>
                </span>
                {n.message && <span className="tbn-msg">{n.message}</span>}
              </span>
            </button>
            <button className="tbn-x" title="Dismiss" aria-label={`Dismiss “${n.title}”`} onClick={() => fold(n.id)}>
              <Icon name="x" size={10} />
            </button>
          </div>
        </div>
      </div>
    );
  };
  const line = (l) => {
    if (l.count < 2) return note(l.row, false);
    const open = openGroup === l.key;
    const unread = l.members.some((m) => (asIs.get(m.id) || m).unread);
    return (
      <div key={l.key} className={`tbn-group${open ? " open" : ""}`} data-testid="bell-group">
        <div className={`tbn-item tbn-item-group${unread ? " unread" : ""}`} data-tone={l.row.tone}>
          <button
            type="button"
            className="tbn-open"
            aria-expanded={open}
            aria-label={`${l.title}: ${open ? "hide them" : "show them"}`}
            onClick={(e) => (window.holdStill || ((_, f) => f()))(e && e.currentTarget, () => setOpenGroup(open ? null : l.key))}
          >
            {unread && <span className="tbn-dot" />}
            <span className="mark tbn-icon"><Icon name={l.row.icon} size={13} /></span>
            <span className="tbn-body">
              <span className="tbn-line1">
                <span className="tbn-item-title">{l.title}</span>
                <span className="tbn-time tabular">{l.row.time}</span>
              </span>
              <span className="tbn-msg">{l.row.title}</span>
            </span>
            <span className="tbn-chev" aria-hidden="true"><Icon name="chevron-down" size={12} /></span>
          </button>
        </div>
        {open && l.members.map((m) => note(m, true))}
      </div>
    );
  };
  const sections = tbnSections(items.map((n) => (readHere.current.has(n.id) ? { ...n, unread: true } : n)));
  return (
    <>
      <div className="tbn-backdrop" onClick={onClose} />
      {/* Its handle says it can be pulled: a thumb pulls it down, and it goes the way it came (data-bits touchSwipe,
          leaving). A popover under the bell on a wider screen, where neither moves it. */}
      <div
        className="tbn-pop"
        role="dialog"
        aria-label="Notifications"
        ref={window.leaving ? window.leaving("bell") : undefined}
        {...(window.touchSwipe ? window.touchSwipe({ onDown: onClose, when: tbnPhone }) : {})}
      >
        <div className="tbn-handle" aria-hidden="true" />
        <header className="tbn-head">
          <span className="tbn-title">Notifications</span>
          {items.some((n) => n.unread) && <button className="tbn-readall" onClick={onReadAll}>Mark all read</button>}
        </header>
        <div className="tbn-list">
          {items.length === 0 && (
            <div className="tbn-empty">
              <Icon name="check" size={18} />
              <span>All caught up</span>
            </div>
          )}
          {sections.map((sec) => (
            <React.Fragment key={sec.label}>
              <div className="tbn-sec">{sec.label}</div>
              {sec.lines.map(line)}
            </React.Fragment>
          ))}
        </div>
        {/* Device alerts, outside a demo: a system notification when something
            new needs the owner while the app is in the background. */}
        {alerts && (
          <footer className="tbn-foot" data-testid="notif-alerts">
            {!alerts.can ? (
              <span className="tbn-foot-note">This browser can't show alerts.</span>
            ) : alerts.permission === "denied" ? (
              <span className="tbn-foot-note">Alerts are blocked in your browser settings.</span>
            ) : (
              <button
                type="button"
                className={`tbn-alert-switch ${alerts.on ? "on" : ""}`}
                role="switch"
                aria-checked={alerts.on}
                onClick={() => onAlerts(!alerts.on)}
              >
                <span className="tbn-alert-dot" aria-hidden="true" />
                {alerts.on ? "Alerting this device when something needs you" : "Alert this device when something needs you"}
              </button>
            )}
          </footer>
        )}
      </div>
    </>
  );
};

const Topbar = ({
  crumbs = [],
  theme = "light",
  themePref = theme,
  onTheme = () => {},
  onAsk = () => {},
  onMenu = () => {},
  right = null,
}) => {
  // The Ask button's icon: the three (components/ask-face.jsx), or the sparkle where they are not loaded.
  const TbFace = window.AskFace || null;
  const [notifs, setNotifs] = React.useState(TB_NOTIFS);
  // Outside a demo the bell reads the workspace's own rows through the bridge
  // (legacy-bridge/notifications.ts): who needs you, a draft waiting, a
  // missed call, an open invitation. Read state is this device's.
  const real = !window.__DEMO_MODE && window.__notifs ? window.__notifs : null;
  const [realRows, setRealRows] = React.useState(() => (real ? real.feed() : []));
  const [alertState, setAlertState] = React.useState(() => (real ? real.alerts() : null));
  React.useEffect(() => {
    if (!real) return undefined;
    const refresh = () => { setRealRows(real.feed()); setAlertState(real.alerts()); };
    refresh();
    return real.onChange(refresh);
  }, [real]);
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
        actions: [{ label: "Open client", to: d.clientId ? "clients/" + d.clientId : "clients", primary: true }, { label: "Leads", to: "clients/leads" }],
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
          actions: [{ label: "All leads", to: "clients/leads", primary: true }],
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
        flash({ tone: "info", msg: <>Welcome back — <b>{held} send{held === 1 ? "" : "s"}</b> stayed frozen, <b>{needs} decision{needs === 1 ? "" : "s"}</b> waiting. Timers are running again.</> });
      }
      prevAwayRef.current = nowAway;
    };
    window.addEventListener("presence:changed", onPr);
    return () => window.removeEventListener("presence:changed", onPr);
  }, []);

  // The seeded notification feed is demo theater — "Aisha's refund", a trust
  // milestone, a Gmail outage — none of it happened. Outside demo we show no
  // count rather than a badge promising five things to read that don't exist.
  const shown = real ? realRows : window.__DEMO_MODE ? notifs.map(tbOverlay) : [];
  const unread = shown.filter(n => n.unread).length;

  // The bell swings when something new needs you (real feed).
  const prevUnread = React.useRef(unread);
  React.useEffect(() => {
    if (!real) return undefined;
    if (unread > prevUnread.current) {
      setPing(true);
      const t = setTimeout(() => setPing(false), 1200);
      prevUnread.current = unread;
      return () => clearTimeout(t);
    }
    prevUnread.current = unread;
    return undefined;
  }, [unread, real]);

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
    if (real) real.read(id);
    else setNotifs(list => list.map(n => n.id === id ? { ...n, unread: false } : n));
    setOpenNotifs(false);
    if (to) window.CHANLY.nav(to);
  };

  const onAlerts = async (on) => {
    if (!real) return;
    const r = await real.setAlerts(on);
    setAlertState(real.alerts());
    flash({
      msg: r.on
        ? <>This device will be alerted when something needs you</>
        : r.permission === "denied"
          ? <>Alerts are blocked in your browser settings</>
          : <>Alerts off on this device</>,
    });
  };

  const readAll = () => {
    if (real) { real.seenAll(); flash({ msg: <>All caught up</> }); return; }
    const prev = notifs;
    setNotifs(list => list.map(n => ({ ...n, unread: false })));
    flash({ msg: <>All notifications marked read</>, undo: () => setNotifs(prev) });
  };

  // A note marked read where it stands (a thumb slid it right): the bridge's mark, or the seeded note's flag.
  const read = (id) => {
    if (real) real.read(id);
    else setNotifs(list => list.map(n => n.id === id ? { ...n, unread: false } : n));
  };

  const dismiss = (id) => {
    if (real) {
      const item = realRows.find(n => n.id === id);
      real.dismiss(id);
      flash({ msg: <>Dismissed <b>“{item ? item.title : "notification"}”</b></>, undo: () => real.restore(id) });
      return;
    }
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

  // The theme button steps through the preference, System included, and says which is on and what a press makes it
  // (N19). The shell's words decide; the standalone mockup, without them, keeps its light and dark flip.
  const chromeWords = window.__chrome;
  const themeNext = chromeWords && chromeWords.nextTheme ? chromeWords.nextTheme(themePref) : theme === "light" ? "dark" : "light";
  const themeSaid = chromeWords && chromeWords.themeButton
    ? chromeWords.themeButton(themePref)
    : { icon: theme === "light" ? "moon" : "sun", label: theme === "light" ? "Switch to dark" : "Switch to light" };

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
              {/* A crumb may carry the page's own way there (`go`): a person's People is their page's Back, to the list
                  they were opened from with its place, as the arrow on the page was. */}
              {to && !last
                ? <button className="crumb-link" onClick={() => (c.go ? c.go() : window.CHANLY.nav(to))} aria-label={c.go ? `Back to ${label}` : undefined}>{label}</button>
                : <span className={last ? "crumb-active" : ""}>{label}</span>}
            </React.Fragment>
          );
        })}
      </div>

      <div className="topbar-spacer" />

      {/* Ask reads the workspace as the signed-in person (ask-real.jsx); in a
          demo it answers the seed world. Either way the button opens it. Its
          icon is the three (ask-face.jsx), Ask's face: ink at rest, coral and
          moving while Ask listens, reads or answers, on every page. */}
      <button className="tb-ask" onClick={onAsk} title="Ask Chanlytics (⌘K)" data-testid="tb-ask">
        {TbFace
          ? <TbFace className="tb-ask-face" testId="tb-ask-face" />
          : <Icon name="sparkle" size={13} />}
        <span className="tb-ask-label">Ask Chanlytics</span>
        <span className="kbd">⌘K</span>
      </button>

      {right}

      <div className="tbn-wrap">
        {/* Presence is the mockup's: a real workspace has no away timer or transfer line yet, so the control would change nothing. */}
        {window.__DEMO_MODE && (
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
        )}
        <button
          className={`btn btn-ghost btn-icon btn-sm tb-bell ${ping ? "ping" : ""}`}
          data-tip={real
            ? (unread > 0 ? `${unread} new — what needs you` : "Nothing needs you right now")
            : (unread > 0 ? `${unread} unread — what agents did while you weren't looking` : "What agents did while you weren't looking")}
          data-tip-side="bottom"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          aria-haspopup="dialog"
          aria-expanded={openNotifs}
          onClick={() => setOpenNotifs(v => !v)}
        >
          <Icon name="bell" />
          {unread > 0 && <span className="tb-bell-badge tally tally-icon">{unread}</span>}
        </button>
        {openNotifs && (
          <NotifPopover
            items={shown}
            onAction={act}
            onReadAll={readAll}
            onDismiss={dismiss}
            onRead={read}
            onClose={() => setOpenNotifs(false)}
            alerts={real ? alertState : null}
            onAlerts={onAlerts}
          />
        )}
        <button
          className="btn btn-ghost btn-icon btn-sm tb-theme"
          title={themeSaid.label}
          aria-label={themeSaid.label}
          onClick={() => onTheme(themeNext)}
        >
          <Icon name={themeSaid.icon} />
        </button>
      </div>

      {toastNode}
    </div>
  );
};

window.Topbar = Topbar;

// The shell's one line, under the top bar: this device offline, the
// receptionist paused, a newer build, surfaces that stopped refreshing, the
// live feed not coming through -- one at a time, with the one press that
// helps. Which one, its words and its press are contracts' (chrome.ts
// shellStatusLine); the status is the bridge's (legacy-bridge/shell.ts). It
// used to be a line at the sidebar's foot, which a phone keeps in its drawer
// and the rail cut to an icon. The live region stays mounted while all is
// well, so the next change is announced.
const SHELL_STATUS_ICON = { offline: "alert", paused: "pause", stale: "sparkle", degraded: "clock", disconnected: "bolt" };
/**
 * The live-call bar: who is on the phone right now, and how long.
 *
 * A call in progress is the most time-critical thing this product knows, and it
 * is true for minutes a week — so it took a permanent slot in the phone tab bar
 * that was empty the rest of the time, in 60px that could not hold either of the
 * two controls a live call actually has. It is a bar across the top while it is
 * happening instead, on a phone and on a desk, and a press opens Live, where
 * handing over and ending ask before they act.
 *
 * The rule for "still up" is contracts' (liveStillUp), the same one the Live
 * page and the tab strip's pulse apply between refreshes.
 */
const LiveCallBar = () => {
  const [, tick] = React.useReducer((n) => n + 1, 0);
  // Drawn again when the calls are read again (the live surface's own signal), or a call is ended here.
  useSurface("live");
  React.useEffect(() => {
    window.addEventListener("live:ended", tick);
    return () => window.removeEventListener("live:ended", tick);
  }, []);
  const bar = window.__chrome && window.__chrome.liveBar ? window.__chrome.liveBar(window.__LIVE, Date.now()) : null;
  // A second, so the clock reads like a clock, and only while a call is up: it ran every second of every session,
  // redrawing a bar that said nothing, under a comment that said otherwise.
  const up = !!bar;
  React.useEffect(() => {
    if (!up) return undefined;
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [up]);
  if (!bar) return null;
  const open = () => window.CHANLY && window.CHANLY.nav(bar.callId ? `live/${bar.callId}` : "live");
  return (
    <button type="button" className="live-bar" onClick={open} data-testid="live-bar">
      <span className="live-dot" aria-hidden="true" />
      <span className="live-bar-text">{bar.text}</span>
      {bar.sinceMs !== null && <span className="live-bar-clock tabular">{window.__chrome.fmtClock ? window.__chrome.fmtClock(Math.floor(bar.sinceMs / 1000)) : ""}</span>}
      {bar.checking && <span className="live-bar-checking">still marked live · checking</span>}
      <span className="live-bar-go"><Icon name="arrow-right" size={12} /></span>
    </button>
  );
};

const ShellStatusBar = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    window.addEventListener("shell:status", bump);
    window.addEventListener("surface:billing", bump);
    return () => { window.removeEventListener("shell:status", bump); window.removeEventListener("surface:billing", bump); };
  }, []);
  // The pause rides with the billing surface: the webhook writes the row, the surface repaints, the line says so.
  const B = window.__BILLING_ACCOUNT;
  const paused = !!(B && window.__billing && window.__billing.vm(B.dto).paused);
  const line = window.__chrome ? window.__chrome.statusLine({ ...(window.__SHELL_STATUS || { stale: false, degraded: [] }), paused }) : null;
  const press = () => {
    if (!line) return;
    if (line.action === "billing") { if (window.CHANLY) window.CHANLY.nav("admin/billing"); return; }
    if (line.action === "reload") { window.location.reload(); return; }
    // Busy, not disabled: the focus stays on the button, and a second press waits for the first read.
    if (line.action === "retry" && window.__shell && !busy) {
      setBusy(true);
      Promise.resolve(window.__shell.retry()).catch(() => {}).then(() => setBusy(false));
    }
  };
  return (
    <div className="shell-status-slot" role="status" aria-live="polite">
      {line && (
        <div className={`shell-status tone-${line.tone}`} data-kind={line.kind} data-testid="shell-status">
          <Icon name={SHELL_STATUS_ICON[line.kind] || "alert"} size={13} />
          <span className="shell-status-words">
            <span className="shell-status-text">{line.text}</span>
            {line.detail && <span className="shell-status-detail">{line.detail}</span>}
          </span>
          {line.cta && (
            <button type="button" className="btn btn-sm shell-status-cta" onClick={press} aria-busy={busy || undefined} data-testid="shell-status-cta">
              {busy && line.busy ? line.busy : line.cta}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

window.LiveCallBar = LiveCallBar;
window.ShellStatusBar = ShellStatusBar;
window.NotifPopover = NotifPopover; // drawn on its own by bell-rows.test
