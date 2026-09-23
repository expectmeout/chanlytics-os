/* global React, Icon */
// Chanlytics — Sidebar v3
// Workspace menu (top) → New Chat → nav → (demo agents) → the shell's one
// status line → account menu (foot). Two popovers and a rail. Every word
// about a person comes from contracts/identity.ts through the bridge, and
// everything the menus can do — switch, sign out, theme — goes through the
// shell (window.__shell) rather than a second copy of it here.

const NAV_PRIMARY = [
  { id: "home",     icon: "home",     label: "Today",       hint: "Live brief" },
  { id: "inbox",    icon: "inbox",    label: "Inbox",       urgent: true },
];

// Flat nav — merged surfaces are views (SurfaceTabs), not places.
//
// Conversations is NOT an item here. It and the Inbox read the SAME table:
// surface-data.ts inboxOverride (:261) and conversationsOverride (:400) each
// await read("GET conversations") — the Inbox joins escalations, Conversations
// joins calls. Two nav items over one dataset asked the owner to guess which
// one held a message, so they checked both. One door, three views, in the
// SurfaceTabs strip: Needs you · Conversations · Live.
const NAV_WORK = [
  { id: "people",        icon: "users",    label: "People" },
  { id: "calendar",      icon: "calendar", label: "Calendar" },
  { id: "campaigns",     icon: "bolt",     label: "Campaigns" },
];

// Agents (fleet, store, studio, tasks) is the mockup's: hidden outside a demo
// session, with the rest of the mockup — see surface-registry.ts.
const NAV_INTEL = [
  { id: "agents",  icon: "agents",      label: "Agents", demoOnly: true },
  { id: "reports", icon: "trending-up", label: "Reports" },
];

const NAV_FOOT = [
  { id: "admin", icon: "settings", label: "Settings" },
];

const ACTIVE_AGENTS_DEFAULT = [
  { id: "phone",  glyph: "P", name: "Phone Rep",     status: "active",    task: "On call · Selena Cho · 0:42" },
  { id: "ig",     glyph: "I", name: "Chat Agent",    status: "active",    task: "Drafting reply · @marcus_lee" },
  { id: "sms",    glyph: "S", name: "SMS Agent",     status: "scheduled", task: "Birthday offer · 5:00pm" },
  { id: "email",  glyph: "E", name: "Email Agent",   status: "idle",      task: "Last action 3m ago" },
  { id: "qual",   glyph: "Q", name: "Qualifier",     status: "idle",      task: "Waiting for new leads" },
  { id: "rev",    glyph: "R", name: "Review Bot",    status: "scheduled", task: "Auto-send tmrw 10:00am" },
  { id: "obj",    glyph: "O", name: "Objection Coach", status: "idle",    task: "Standby" },
  { id: "rec",    glyph: "X", name: "Recovery Agent", status: "idle",     task: "3 cold leads queued" },
];

// Stable ranking: active → scheduled → idle → paused, then alphabetical
const STATUS_RANK = { active: 0, scheduled: 1, idle: 2, paused: 3 };
const sortAgents = (list) => [...list].sort((a, b) =>
  (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || a.name.localeCompare(b.name)
);

// Session overlay: FL_STORE pauses + LM_STORE call endings reshape the strip
const sbOverlay = (a) => {
  let next = a;
  const regId = window.CHANLY ? window.CHANLY.agentIdFor(a.name) : a.id;
  const st = window.FL_STORE && window.FL_STORE.statuses && window.FL_STORE.statuses[regId];
  if (st === "paused") next = { ...next, status: "paused", task: "Paused by you — resume in Fleet" };
  if (a.glyph === "P" && window.LM_STORE && window.LM_STORE.isEnded("lc-selena") && /Selena/.test(a.task)) {
    next = { ...next, status: st === "paused" ? "paused" : "idle", task: st === "paused" ? next.task : "Wrapped call · Selena Cho · summary in Conversations" };
  }
  return next;
};

// Seed-honest needs count: live threads in "needs" minus session decisions
const sbNeedsCount = () => {
  const threads = ((window.INBOX_DATA || {}).THREADS) || [];
  return threads.filter(t => {
    // A real thread counts when it needs you, the badge's rule (needsYou): this counted a teammate's thread (I2).
    // The Inbox owns that rule (ixWaitsOnYou), so a reply about to send counts in both places, or in neither.
    if (t.real) return window.ixWaitsOnYou ? window.ixWaitsOnYou(t) : !!t.needsYou;
    if (t.state !== "needs" && !(t.state === "escalated" && !t.takenOver)) return false;
    const rec = window.IX_STORE && window.IX_STORE.get(t.id);
    return !(rec && (rec.kind === "decided" || rec.kind === "snoozed"));
  }).length;
};

// Credits: shared billing source (Settings › Billing top-ups move this)
const sbCredits = () => {
  const b = window.__BILLING;
  if (!b) return "5,350";
  return (b.creditsTotal + b.topup - b.creditsUsed).toLocaleString();
};

const SidebarRow = ({ item, active, parentActive, onNavigate, depth = 0, expanded, onToggle, badges = {}, collapsed = false }) => {
  const badge = badges[item.id] !== undefined ? badges[item.id] : item.badge;
  const tip = item.id === "inbox" ? "Decisions waiting on you — agents hold until you call it" : item.id === "people" ? "Leads ready for you to call" : null;
  return (
  <>
    <div
      className={`nav-item ${active === item.id ? "active" : ""} ${parentActive === item.id ? "parent-active" : ""} ${item.urgent ? "urgent" : ""}`}
      style={collapsed ? undefined : { paddingLeft: 10 + depth * 16 }}
      onClick={(e) => { if (item.expandable) { onToggle(item.id); } else { onNavigate(item.id); } }}
      data-tip={collapsed ? (badge ? `${item.label} · ${badge}` : item.label) : undefined}
      data-tip-side="right"
      aria-current={active === item.id ? "page" : undefined}
    >
      {item.icon && <Icon name={item.icon} />}
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.hint && <span className="nav-hint">{item.hint}</span>}
      {badge ? (collapsed
        ? <span className={`nav-dot ${item.urgent ? "urgent" : ""}`} aria-label={`${badge} ${item.label}`} />
        : <span className={`nav-badge tally${item.urgent ? " urgent tally-warn" : ""}`} data-tip={tip || undefined}>{badge}</span>) : null}
      {!collapsed && item.expandable && (
        <Icon name="chevron" size={11} style={{
          marginLeft: badge ? 4 : "auto",
          transform: expanded ? "rotate(90deg)" : "none",
          transition: "transform 160ms",
          color: "var(--ink-faint)"
        }} />
      )}
    </div>
    {!collapsed && item.expandable && expanded && item.children?.map((c) => (
      <div
        key={c.id}
        className={`nav-item nav-sub ${active === c.id ? "active" : ""}`}
        style={{ paddingLeft: 38 }}
        onClick={() => onNavigate(c.id)}
      >
        <span>{c.label}</span>
        {c.badge && <span className="nav-badge tally">{c.badge}</span>}
      </div>
    ))}
  </>
  );
};

// Identity comes from window.__ME (written by the seam's workspace override).
// Falls back to the seeded persona only in demo mode; signed in with no
// identity yet we say so rather than borrow someone else's name.
const sbMe = () => window.__ME || null;
// The workspace being VIEWED, not the first one alphabetically.
//
// Every data surface and Settings resolve by __ACTIVE_WORKSPACE; membership
// order and name order diverge the moment anyone belongs to two workspaces,
// and the result is one business's name standing over another's
// conversations. A boot that has not resolved the active workspace yet shows
// "Workspace" until it has, never the first name on the list.
const sbWorkspace = () => {
  const all = window.__WORKSPACES || [];
  return all.find((w) => w.id === window.__ACTIVE_WORKSPACE) || null;
};
const sbWorkspaceName = () => {
  const ws = sbWorkspace();
  if (ws && ws.name) return ws.name;
  return window.__DEMO_MODE ? "Chanlytics Sales" : "Workspace";
};
const sbMarkOf = (n) => {
  const w = String(n || "").split(/[\s@._-]+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || "—";
};
const sbWorkspaceMark = () => sbMarkOf(sbWorkspaceName());
// The person, in the words contracts/identity.ts gives: the name they gave,
// else "Your account" — never a name invented from the email. The demo keeps
// its persona; signed in with no identity yet, we say so.
const sbWho = () => {
  const me = sbMe();
  if (!me) return window.__DEMO_MODE ? { name: "Sarah Chen", email: "sales@chanlytics.com", initials: "SC", role: "Owner", named: true } : { name: "Your account", email: "Signed in", initials: "—", role: "", named: false };
  const w = window.__identity.words(me);
  return { name: w.name, email: w.email, initials: w.initials, role: w.role, named: w.named };
};

// ---- Menus ---------------------------------------------------------------
// A menu anchored to its trigger but drawn on the page, not inside the
// sidebar (which clips), so the rail can open one as well. Escape and the
// backdrop close it; the position is taken when it opens.
const useSbMenu = () => {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState(null);
  const ref = React.useRef(null);
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setRect({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width });
    }
    setOpen((v) => !v);
  };
  const close = () => setOpen(false);
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return { open, rect, ref, toggle, close };
};

const sbMenuStyle = (rect, { collapsed, side }) => {
  if (!rect) return {};
  const width = collapsed ? 240 : Math.max(220, Math.round(rect.width));
  const left = collapsed ? Math.round(rect.right) + 6 : Math.round(rect.left);
  return side === "up"
    ? { left, bottom: Math.round(window.innerHeight - rect.top) + 6, width }
    : { left, top: Math.round(rect.bottom) + 6, width };
};

const SbMenu = ({ menu, side = "down", collapsed, label, testid, children }) => menu.open ? (
  <>
    <div className="more-backdrop" onClick={(e) => { e.stopPropagation(); menu.close(); }} />
    <div className="more-menu sb-menu" role="menu" aria-label={label} style={sbMenuStyle(menu.rect, { collapsed, side })} onClick={(e) => e.stopPropagation()} data-testid={testid}>
      {children}
    </div>
  </>
) : null;

// The workspaces this account belongs to, the one being viewed checked, the
// caller's role beside it, ⌘1–9 when there is a choice, and the door to its
// settings. Switching goes through the shell, which re-runs every surface.
const WorkspaceMenu = ({ onNavigate, close }) => {
  const all = window.__WORKSPACES || (window.__DEMO_MODE ? [{ id: "demo", name: sbWorkspaceName() }] : []);
  const active = sbWorkspace() || (window.__DEMO_MODE ? all[0] : null) || null;
  const role = sbWho().role;
  const hotkey = (i) => (all.length > 1 && window.__chrome ? window.__chrome.workspaceHotkey(i) : null);
  return (
    <>
      <div className="more-header">{all.length > 1 ? "Workspaces" : "Workspace"}</div>
      {all.map((w, i) => {
        const current = !!active && w.id === active.id;
        return (
          <button
            key={w.id}
            className={`more-item sb-ws ${current ? "active" : ""}`}
            role="menuitemradio"
            aria-checked={current}
            data-testid="sb-ws-item"
            onClick={() => { close(); if (!current && window.__shell) window.__shell.switchWorkspace(w.id); }}
          >
            <span className="sb-ws-mark">{sbMarkOf(w.name)}</span>
            <span className="more-item-label">{w.name}{current && role ? <span className="sb-ws-role">{role}</span> : null}</span>
            {hotkey(i) && <span className="more-item-meta kbd">{hotkey(i)}</span>}
            {current && <Icon name="check" size={12} />}
          </button>
        );
      })}
      <div className="more-divider" />
      {!window.__DEMO_MODE && window.__shell && (
        <button className="more-item" role="menuitem" onClick={() => { close(); window.__shell.createWorkspace(); }} data-testid="sb-ws-new">
          <Icon name="plus" size={13} /><span className="more-item-label">New workspace</span>
        </button>
      )}
      <button className="more-item" role="menuitem" onClick={() => { close(); onNavigate("admin"); }}>
        <Icon name="settings" size={13} /><span className="more-item-label">Workspace settings</span>
      </button>
    </>
  );
};

// The account: who you are, the doors to your name and your alerts, the
// theme, the shortcuts sheet, and sign out. Alerts on this device reuse the
// bell's own switch (the notifications bridge), not a second one.
const UserMenu = ({ who, themePref, onTheme, onNavigate, close, flash }) => {
  const real = !window.__DEMO_MODE && window.__notifs ? window.__notifs : null;
  const [alerts, setAlerts] = React.useState(() => (real ? real.alerts() : null));
  const themes = window.__chrome ? window.__chrome.themes : [];
  const toggleAlerts = async () => {
    if (!real) return;
    await real.setAlerts(!alerts.on);
    const next = real.alerts();
    setAlerts(next);
    flash({ tone: next.permission === "denied" ? "warn" : "info", msg: next.on ? <>This device will be alerted when something needs you</> : next.permission === "denied" ? <>Alerts are blocked in your browser settings</> : <>Alerts off on this device</> });
  };
  const signOut = () => {
    close();
    if (window.__DEMO_MODE || !window.__shell) { flash({ tone: "info", msg: <>Nothing to sign out of in the demo.</> }); return; }
    window.__shell.signOut();
  };
  return (
    <>
      <div className="sb-menu-head" data-testid="sb-me">
        <div className="avatar">{who.initials}</div>
        <div className="who">
          <div className="name">{who.name}</div>
          <div className="email">{who.email}</div>
        </div>
        {who.role && <span className="pill sb-role" data-testid="sb-me-role">{who.role}</span>}
      </div>
      <div className="more-divider" />
      <button className="more-item" role="menuitem" onClick={() => { close(); onNavigate("admin/profile"); }} data-testid="sb-me-name">
        <Icon name="user" size={13} /><span className="more-item-label">Your name</span>{!who.named && <span className="more-item-meta">Not set</span>}
      </button>
      <button className="more-item" role="menuitem" onClick={() => { close(); onNavigate("admin/notifications"); }}>
        <Icon name="bell" size={13} /><span className="more-item-label">Notification settings</span>
      </button>
      {alerts && alerts.can && alerts.permission !== "denied" && (
        <button className="more-item" role="menuitemcheckbox" aria-checked={!!alerts.on} onClick={toggleAlerts} data-testid="sb-me-alerts">
          <Icon name={alerts.on ? "check" : "dot"} size={13} /><span className="more-item-label">Alert this device</span><span className="more-item-meta">{alerts.on ? "On" : "Off"}</span>
        </button>
      )}
      <div className="more-divider" />
      <div className="more-header">Theme</div>
      <div className="sb-theme-seg" role="radiogroup" aria-label="Theme">
        {themes.map((t) => (
          <button key={t.id} role="radio" aria-checked={themePref === t.id} className={`sb-theme-opt ${themePref === t.id ? "active" : ""}`} onClick={() => onTheme(t.id)} data-testid={`sb-theme-${t.id}`}>
            <Icon name={t.icon} size={12} />{t.label}
          </button>
        ))}
      </div>
      <div className="more-divider" />
      <button className="more-item" role="menuitem" onClick={() => { close(); window.dispatchEvent(new CustomEvent("shortcuts:open")); }} data-testid="sb-me-shortcuts">
        <Icon name="keyboard" size={13} /><span className="more-item-label">Keyboard shortcuts</span><span className="more-item-meta kbd">?</span>
      </button>
      <button className="more-item danger" role="menuitem" onClick={signOut} data-testid="sb-signout">
        <Icon name="logout" size={13} /><span className="more-item-label">Sign out</span>
      </button>
    </>
  );
};

const Sidebar = ({
  active = "home",
  onNavigate = () => {},
  onNewChat = () => {},
  onClose = null,
  agents = ACTIVE_AGENTS_DEFAULT,
  badges = {},
  collapsed = false,
  onToggleCollapse = () => {},
  themePref = "dark",
  onTheme = () => {},
}) => {
  const [, setTick] = React.useState(0);
  const [needs, setNeeds] = React.useState(sbNeedsCount);
  const [toastNode, flash] = window.usePPToast();
  const wsMenu = useSbMenu();
  const meMenu = useSbMenu();

  // Live session overlays: fleet pauses, ended calls, decisions, inbox counts, billing, identity
  React.useEffect(() => {
    const bump = () => setTick(n => n + 1);
    const onCounts = (e) => setNeeds(e.detail && typeof e.detail.needs === "number" ? e.detail.needs : sbNeedsCount());
    const onDecisions = () => setNeeds(sbNeedsCount());
    window.addEventListener("fleet:status", bump);
    window.addEventListener("live:ended", bump);
    window.addEventListener("billing:changed", bump);
    window.addEventListener("inbox:counts", onCounts);
    window.addEventListener("inbox:decisions", onDecisions);
    window.addEventListener("me:changed", bump);
    window.addEventListener("surface:workspace", bump);
    return () => {
      window.removeEventListener("me:changed", bump);
      window.removeEventListener("surface:workspace", bump);
      window.removeEventListener("fleet:status", bump);
      window.removeEventListener("live:ended", bump);
      window.removeEventListener("billing:changed", bump);
      window.removeEventListener("inbox:counts", onCounts);
      window.removeEventListener("inbox:decisions", onDecisions);
    };
  }, []);

  const liveAgents = agents.map(sbOverlay);
  const who = sbWho();

  // Computed badges — seed-honest counts; caller-supplied badges win
  const computedBadges = {
    inbox: needs > 0 ? String(needs) : null,
    // The seeded LEADS are the mockup's, so the count is demo-only; a real
    // workspace's leads are the scope of People at clients/leads.
    people: window.__DEMO_MODE ? (String(((window.LEADS || []).filter(l => l.stage === "ready").length) || "") || null) : null,
    ...badges,
  };

  // Swipe-to-close (mobile drawer) — simple left-swipe threshold, no drag-follow. This, a tap on the backdrop,
  // Escape and picking a destination are how the drawer closes: it has no bar of its own, because the desktop's
  // sidebar has none and the two are one sidebar.
  const touchX = React.useRef(null);
  const onTouchStart = (e) => { touchX.current = e.touches && e.touches[0] ? e.touches[0].clientX : null; };
  const onTouchEnd = (e) => {
    if (touchX.current == null || !onClose) return;
    const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : touchX.current;
    if (touchX.current - endX > 48) onClose();
    touchX.current = null;
  };
  // Route id -> flat nav id (merged surfaces highlight their group)
  const groupMap = {
    people: ["clients", "leads", "segments", "pipeline"],
    // Conversations and Live highlight the Inbox: they are its views, not their own place.
    inbox: ["inbox", "conversations", "live", "calls", "chats", "email"],
    campaigns: ["outbound", "content", "broadcasts", "messages"],
    agents: ["fleet", "store", "studio", "tasks"],
  };
  const effActive = (() => {
    for (const [k, kids] of Object.entries(groupMap)) if (kids.includes(active)) return k;
    return active;
  })();
  const expanded = {}; const toggle = () => {}; const parentActive = null;

  const renderGroup = (items, label) => (
    <div className="sidebar-section">
      {label && !collapsed && <div className="sidebar-label">{label}</div>}
      {items.map((it) => (
        <SidebarRow
          key={it.id}
          item={it}
          active={effActive}
          parentActive={parentActive}
          onNavigate={onNavigate}
          expanded={expanded[it.id]}
          onToggle={toggle}
          badges={computedBadges}
          collapsed={collapsed}
        />
      ))}
    </div>
  );

  const workspaceCount = (window.__WORKSPACES || []).length;

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} data-testid="sidebar">
      {/* Workspace — the menu's trigger */}
      <button
        type="button"
        className="sb-team"
        ref={wsMenu.ref}
        onClick={wsMenu.toggle}
        aria-haspopup="menu"
        aria-expanded={wsMenu.open}
        data-tip={collapsed ? sbWorkspaceName() : undefined}
        data-tip-side="right"
        data-testid="sb-workspace"
      >
        <div className="sb-team-mark">{sbWorkspaceMark()}</div>
        <div className="sb-team-body">
          <div className="sb-team-name">{sbWorkspaceName()}</div>
          {window.__DEMO_MODE ? <div className="sb-team-plan">Professional</div> : who.role ? <div className="sb-team-plan">{who.role}{workspaceCount > 1 ? ` · ${workspaceCount} workspaces` : ""}</div> : null}
        </div>
        <Icon name="chevrons" size={14} style={{ color: "var(--ink-dim)" }} />
      </button>
      <SbMenu menu={wsMenu} side="down" collapsed={collapsed} label="Workspaces" testid="sb-workspace-menu">
        <WorkspaceMenu onNavigate={onNavigate} close={wsMenu.close} />
      </SbMenu>

      {/* New Chat — primary CTA. Opens Ask, gated the same way the topbar is. */}
      <div className="sb-newchat">
        <button
          className="btn btn-primary"
          style={{ width: "100%", height: 32, justifyContent: "center" }}
          onClick={onNewChat}
          title="Start a new Ask thread"
          data-tip={collapsed ? "New Chat" : undefined}
          data-tip-side="right"
          data-testid="sb-newchat"
        >
          <Icon name="plus" size={13} />
          {!collapsed && "New Chat"}
        </button>
      </div>

      {/* Scrollable nav region — grows/shrinks with the agents block */}
      <div className="sb-nav-scroll">
        {renderGroup(NAV_PRIMARY)}
        {renderGroup(NAV_WORK, "Workspace")}
        {renderGroup(window.__DEMO_MODE ? NAV_INTEL : NAV_INTEL.filter((i) => !i.demoOnly), "Intelligence")}
        {renderGroup(NAV_FOOT)}
      </div>

      {/* Active Agents — demo only. The seeded roster claims eight agents doing
          live work; the real product runs two, and the Fleet surface that would
          show them honestly is a later slice. */}
      {window.__DEMO_MODE && !collapsed && <div className="sb-agents">
        <div className="sb-agents-head">
          <span className="sidebar-label" style={{ padding: 0 }}>Agents</span>
          <span className="sb-agents-count">
            {liveAgents.filter(a => a.status === "active").length > 0 && <span className="live-dot" style={{ width: 5, height: 5 }} />}
            {liveAgents.filter(a => a.status === "active").length} live
            <span className="sb-agents-sep">·</span>
            {liveAgents.length}
          </span>
        </div>
        <div className="sb-agents-scroll">
          {sortAgents(liveAgents).map((a) => (
            <div className={`sb-agent ${a.status === "paused" ? "sb-agent-paused" : ""}`} key={a.id} title={`${a.name} — ${a.task}`} onClick={() => onNavigate(`fleet/${window.CHANLY ? window.CHANLY.agentIdFor(a.name) : a.id}`)}>
              <div className={`agent-avatar ${a.status === "active" ? "active" : ""}`} style={{ width: 22, height: 22, fontSize: 10, opacity: a.status === "paused" ? 0.55 : 1 }}>
                {a.glyph}
              </div>
              <div className="sb-agent-body">
                <div className="sb-agent-name">
                  {a.name}
                  {a.status === "active" && <span className="live-dot" style={{ width: 6, height: 6 }} />}
                  {a.status === "paused" && <Icon name="pause" size={9} style={{ color: "var(--warn)" }} />}
                </div>
                <div className="sb-agent-task">{a.task}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="sb-agents-foot" onClick={() => onNavigate("store")}>
          <Icon name="plus" size={11} />
          <span>Hire from store</span>
          <span className="sb-agents-foot-meta">
            {(((window.STORE_DATA || {}).STORE_TEMPLATES) || []).filter(t => !t.installed).length || 6} new
          </span>
        </button>
      </div>}

      {/* The foot: the rail toggle and the account. The shell's status is the line under the top bar (topbar.jsx). */}
      <div className="sidebar-foot">
        <button
          type="button"
          className="sb-collapse"
          onClick={onToggleCollapse}
          data-tip={collapsed ? "Expand the sidebar (⌘B)" : undefined}
          data-tip-side="right"
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          data-testid="sb-collapse"
        >
          <Icon name="sidebar" size={14} />
          <span className="sb-collapse-label">Collapse</span>
          <span className="kbd sb-collapse-label">⌘B</span>
        </button>
        <button
          type="button"
          className="user-chip"
          ref={meMenu.ref}
          onClick={meMenu.toggle}
          aria-haspopup="menu"
          aria-expanded={meMenu.open}
          data-tip={collapsed ? who.name : undefined}
          data-tip-side="right"
          data-testid="sb-account"
        >
          <div className="avatar">{who.initials}</div>
          <div className="who">
            <div className="name">{who.name}</div>
            <div className="email">{who.email}</div>
          </div>
          {window.__DEMO_MODE && !collapsed && <div className="user-credits mono tabular">{sbCredits()}</div>}
        </button>
        <SbMenu menu={meMenu} side="up" collapsed={collapsed} label="Account" testid="sb-account-menu">
          <UserMenu who={who} themePref={themePref} onTheme={onTheme} onNavigate={onNavigate} close={meMenu.close} flash={flash} />
        </SbMenu>
      </div>
      {toastNode}
    </aside>
  );
};

window.Sidebar = Sidebar;
window.ACTIVE_AGENTS_DEFAULT = ACTIVE_AGENTS_DEFAULT;
// Published for inbox-counts.test.mjs, which counts the sidebar's first number on its own.
window.sbNeedsCount = sbNeedsCount;
