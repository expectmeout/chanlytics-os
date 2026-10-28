/**
 * The sidebar (moved from legacy/components/sidebar.jsx, the one-system plan's step 7b): the workspace's menu at the top,
 * the nav, the demo's agents, then the rail's toggle and the account's menu at the foot. Every word about a person comes
 * from contracts' identity rules through the bridge (sidebar-who.tsx), and everything the menus can do goes through the
 * shell (sidebar-menus.tsx). The frame's JSX draws it by its old name (`Sidebar`, published by frame-globals.ts) until the
 * frame itself is TypeScript (step 7e). Drawn as the JSX drew it, raw buttons and all, until the frame's kit step (eslint
 * KIT_PENDING); its inline styles and its nav's clickable rows moved with it, none new.
 */
import { useEffect, useState } from "react";
import { routeDoor } from "../../frame-doors";
import type { LegacyFlash } from "../../legacy-verbs";
import { frameGlyph, isDemoFrame } from "../frame-window";
import { NAV_INTEL, NAV_PRIMARY, NAV_WORK, type NavItem } from "../places";
import { NAV_ROUTE } from "../shell-routes";
import { SbMenu, UserMenu, WorkspaceMenu, useSbMenu } from "./sidebar-menus";
import { SbWorkspaceFace, sbTeamSub, sbWho, sbWorkspace, sbWorkspaceName, type SbWho } from "./sidebar-who";

type Badges = Record<string, string | number | null | undefined>;

interface SbAgent {
  id: string;
  glyph: string;
  name: string;
  status: string;
  task: string;
}

const ACTIVE_AGENTS_DEFAULT: readonly SbAgent[] = [
  { id: "phone", glyph: "P", name: "Phone Rep", status: "active", task: "On call · Selena Cho · 0:42" },
  { id: "ig", glyph: "I", name: "Chat Agent", status: "active", task: "Drafting reply · @marcus_lee" },
  { id: "sms", glyph: "S", name: "SMS Agent", status: "scheduled", task: "Birthday offer · 5:00pm" },
  { id: "email", glyph: "E", name: "Email Agent", status: "idle", task: "Last action 3m ago" },
  { id: "qual", glyph: "Q", name: "Qualifier", status: "idle", task: "Waiting for new leads" },
  { id: "rev", glyph: "R", name: "Review Bot", status: "scheduled", task: "Auto-send tmrw 10:00am" },
  { id: "obj", glyph: "O", name: "Objection Coach", status: "idle", task: "Standby" },
  { id: "rec", glyph: "X", name: "Recovery Agent", status: "idle", task: "3 cold leads queued" },
];

// Stable ranking: active → scheduled → idle → paused, then alphabetical.
const STATUS_RANK: Readonly<Partial<Record<string, number>>> = { active: 0, scheduled: 1, idle: 2, paused: 3 };
/** A status's rank; one the list does not name sorts by name alone, as the JSX's NaN did. */
const rankOf = (status: string) => STATUS_RANK[status] ?? Number.NaN;
const sortAgents = (list: readonly SbAgent[]) =>
  [...list].sort((a, b) => rankOf(a.status) - rankOf(b.status) || a.name.localeCompare(b.name));

/** The demo's agent ids by name (the mockup's registry), where the frame has one. */
const agentIdOf = (a: SbAgent): string => {
  const chanly = Reflect.get(window, "CHANLY") as { agentIdFor?: (name: string) => string } | undefined;
  return chanly && chanly.agentIdFor ? chanly.agentIdFor(a.name) : a.id;
};

// Session overlay: FL_STORE pauses reshape the strip (the demo's).
const sbOverlay = (a: SbAgent): SbAgent => {
  const st = window.FL_STORE && window.FL_STORE.statuses && window.FL_STORE.statuses[agentIdOf(a)];
  return st === "paused" ? { ...a, status: "paused", task: "Paused by you — resume in Fleet" } : a;
};

const rowTip = (id: string) =>
  id === "inbox"
    ? "Decisions waiting on you — agents hold until you call it"
    : id === "people"
      ? "Leads ready for you to call"
      : null;

/** A row's count: a dot in the rail, a tally beside the words. */
function RowBadge({ item, badge, collapsed }: { item: NavItem; badge: string | number; collapsed: boolean }) {
  if (collapsed)
    return <span className={`nav-dot ${item.urgent ? "urgent" : ""}`} aria-label={`${badge} ${item.label}`} />;
  return (
    <span
      className={`nav-badge tally${item.urgent ? " urgent tally-warn" : ""}`}
      data-tip={rowTip(item.id) || undefined}
    >
      {badge}
    </span>
  );
}

interface RowProps {
  item: NavItem;
  active: string;
  parentActive: string | null;
  onNavigate: (to: string) => void;
  depth?: number;
  expanded?: boolean;
  onToggle: (id: string) => void;
  badges?: Badges;
  collapsed?: boolean;
}

/** An expandable row's open children, under it. */
function RowChildren({ item, active, onNavigate }: Pick<RowProps, "item" | "active" | "onNavigate">) {
  return (
    <>
      {item.children?.map((c) => (
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
}

function SidebarRow({
  item,
  active,
  parentActive,
  onNavigate,
  depth = 0,
  expanded,
  onToggle,
  badges = {},
  collapsed = false,
}: RowProps) {
  const Glyph = frameGlyph();
  const badge = badges[item.id] !== undefined ? badges[item.id] : item.badge;
  const tip = collapsed ? (badge ? `${item.label} · ${badge}` : item.label) : undefined;
  const open = !collapsed && item.expandable;
  // A place is a door (frame-doors.ts routeDoor): Tab reaches it, Enter opens it, and a middle press or a new tab opens its
  // address. Every row was a div that only a pointer could press (27 Oct 2026). The shell's own way there stays the press.
  const route = item.expandable ? null : NAV_ROUTE[item.id] || null;
  const door = route ? routeDoor(route, () => onNavigate(item.id)) : null;
  return (
    <>
      <a
        className={`nav-item ${active === item.id ? "active" : ""} ${parentActive === item.id ? "parent-active" : ""} ${item.urgent ? "urgent" : ""}`}
        style={collapsed ? undefined : { paddingLeft: 10 + depth * 16 }}
        href={door ? door.href : undefined}
        onClick={door ? door.onClick : () => onToggle(item.id)}
        onFocus={door ? door.onFocus : undefined}
        aria-label={tip}
        data-tip={tip}
        data-tip-side="right"
        aria-current={active === item.id ? "page" : undefined}
        data-nav={item.id}
      >
        {item.icon && <Glyph name={item.icon} />}
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && item.hint && <span className="nav-hint">{item.hint}</span>}
        {badge ? <RowBadge item={item} badge={badge} collapsed={collapsed} /> : null}
        {open && (
          <Glyph
            name="chevron"
            size={11}
            style={{
              marginLeft: badge ? 4 : "auto",
              transform: expanded ? "rotate(90deg)" : "none",
              transition: "transform 160ms",
              color: "var(--ink-faint)",
            }}
          />
        )}
      </a>
      {open && expanded && <RowChildren item={item} active={active} onNavigate={onNavigate} />}
    </>
  );
}

// Route id -> flat nav id (merged surfaces highlight their group). Conversations and Live highlight the Inbox: they are
// its views, not their own place.
const GROUP_MAP: Record<string, readonly string[]> = {
  people: ["clients", "leads", "segments", "pipeline"],
  inbox: ["inbox", "conversations", "live", "calls", "chats", "email"],
  campaigns: ["campaigns", "outbound", "content", "broadcasts", "messages"],
  agents: ["fleet", "store", "studio", "tasks"],
};
const groupOf = (active: string) => {
  for (const [k, kids] of Object.entries(GROUP_MAP)) if (kids.includes(active)) return k;
  return active;
};

/** The nav's three groups, the item for the route lit (its group's, for a merged surface). */
function SidebarNav({
  active,
  onNavigate,
  badges,
  collapsed,
}: {
  active: string;
  onNavigate: (to: string) => void;
  badges: Badges;
  collapsed: boolean;
}) {
  const effActive = groupOf(active);
  const expanded: Record<string, boolean> = {};
  const toggle = () => {};
  const renderGroup = (items: readonly NavItem[], label?: string) => (
    <div className="sidebar-section">
      {label && !collapsed && <div className="sidebar-label">{label}</div>}
      {items.map((it) => (
        <SidebarRow
          key={it.id}
          item={it}
          active={effActive}
          parentActive={null}
          onNavigate={onNavigate}
          expanded={expanded[it.id]}
          onToggle={toggle}
          badges={badges}
          collapsed={collapsed}
        />
      ))}
    </div>
  );
  // Scrollable nav region, which grows and shrinks with the agents block. Ask has one door, the top bar's (the Line, D8).
  return (
    <nav className="sb-nav-scroll" aria-label="Pages">
      {renderGroup(NAV_PRIMARY)}
      {renderGroup(NAV_WORK, "Workspace")}
      {renderGroup(isDemoFrame() ? NAV_INTEL : NAV_INTEL.filter((i) => !i.demoOnly), "Intelligence")}
    </nav>
  );
}

/** One of the demo's agents: its glyph, name, state and task; a press opens it in the Fleet. */
function SbAgentRow({ a, onNavigate }: { a: SbAgent; onNavigate: (to: string) => void }) {
  const Glyph = frameGlyph();
  return (
    <div
      className={`sb-agent ${a.status === "paused" ? "sb-agent-paused" : ""}`}
      title={`${a.name} — ${a.task}`}
      onClick={() => onNavigate(`fleet/${window.CHANLY ? agentIdOf(a) : a.id}`)}
    >
      <div
        className={`agent-avatar ${a.status === "active" ? "active" : ""}`}
        style={{ width: 22, height: 22, fontSize: 10, opacity: a.status === "paused" ? 0.55 : 1 }}
      >
        {a.glyph}
      </div>
      <div className="sb-agent-body">
        <div className="sb-agent-name">
          {a.name}
          {a.status === "active" && <span className="live-dot" style={{ width: 6, height: 6 }} />}
          {a.status === "paused" && <Glyph name="pause" size={9} style={{ color: "var(--warn)" }} />}
        </div>
        <div className="sb-agent-task">{a.task}</div>
      </div>
    </div>
  );
}

/**
 * Active Agents, demo only. The seeded roster claims eight agents doing live work; the real product runs two, and the Fleet
 * surface that would show them honestly is a later slice.
 */
function SidebarAgents({ agents, onNavigate }: { agents: readonly SbAgent[]; onNavigate: (to: string) => void }) {
  const Glyph = frameGlyph();
  const live = agents.filter((a) => a.status === "active").length;
  const fresh = ((window.STORE_DATA || {}).STORE_TEMPLATES || []).filter((t) => !t.installed).length || 6;
  return (
    <div className="sb-agents">
      <div className="sb-agents-head">
        <span className="sidebar-label" style={{ padding: 0 }}>
          Agents
        </span>
        <span className="sb-agents-count">
          {live > 0 && <span className="live-dot" style={{ width: 5, height: 5 }} />}
          {live} live
          <span className="sb-agents-sep">·</span>
          {agents.length}
        </span>
      </div>
      <div className="sb-agents-scroll">
        {sortAgents(agents).map((a) => (
          <SbAgentRow key={a.id} a={a} onNavigate={onNavigate} />
        ))}
      </div>
      <button className="sb-agents-foot" onClick={() => onNavigate("store")}>
        <Glyph name="plus" size={11} />
        <span>Hire from store</span>
        <span className="sb-agents-foot-meta">{fresh} new</span>
      </button>
    </div>
  );
}

/** The account row's second line: the role in Glass (the canvases' sidebar), the address in Classic. */
const sbAccountSub = (look: string | undefined, who: SbWho) => (look === "glass" && who.role ? who.role : who.email);

interface FootProps {
  who: SbWho;
  collapsed: boolean;
  onToggleCollapse: () => void;
  themePref: string;
  onTheme: (id: string) => void;
  look?: string;
  onLook?: (id: string) => void;
  onNavigate: (to: string) => void;
  flash: (p: LegacyFlash) => void;
}

/** The foot: the rail's toggle and the account. The shell's status is the line under the top bar (frame/topbar.tsx). */
function SidebarFoot({ who, collapsed, onToggleCollapse, onNavigate, flash, ...appearance }: FootProps) {
  const Glyph = frameGlyph();
  const meMenu = useSbMenu();
  return (
    <div className="sidebar-foot">
      <button
        type="button"
        className="sb-collapse"
        onClick={onToggleCollapse}
        data-tip={collapsed ? "Expand the sidebar" : undefined}
        data-tip-side="right"
        aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
        data-testid="sb-collapse"
      >
        <Glyph name="sidebar" size={14} />
        <span className="sb-collapse-label">Collapse</span>
      </button>
      <button
        type="button"
        className="user-chip sb-account"
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
          <div className="email">{sbAccountSub(appearance.look, who)}</div>
        </div>
        <Glyph name="chevrons" size={14} className="sb-chev" />
      </button>
      <SbMenu menu={meMenu} side="up" label="Account" testid="sb-account-menu">
        <UserMenu who={who} onNavigate={onNavigate} close={meMenu.close} flash={flash} {...appearance} />
      </SbMenu>
    </div>
  );
}

/** The workspace's row, which opens its menu. */
function SidebarWorkspace({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: (to: string) => void }) {
  const Glyph = frameGlyph();
  const wsMenu = useSbMenu();
  return (
    <>
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
        <SbWorkspaceFace ws={sbWorkspace()} className="sb-team-mark" />
        <div className="sb-team-body">
          <div className="sb-team-name">{sbWorkspaceName()}</div>
          {sbTeamSub()}
        </div>
        <Glyph name="chevrons" size={14} style={{ color: "var(--ink-dim)" }} />
      </button>
      <SbMenu menu={wsMenu} side="down" label="Workspaces" testid="sb-workspace-menu">
        <WorkspaceMenu onNavigate={onNavigate} close={wsMenu.close} />
      </SbMenu>
    </>
  );
}

interface SidebarProps {
  active?: string;
  onNavigate?: (to: string) => void;
  onClose?: (() => void) | null;
  agents?: readonly SbAgent[];
  badges?: Badges;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  themePref?: string;
  onTheme?: (id: string) => void;
  look?: string;
  onLook?: (id: string) => void;
}

// What redraws the sidebar: who is looking and which workspace (the workspace read). A fleet pause is the demo's own strip
// of agents (FL_STORE, the Agents pages), so only a demo session hears it. What needs you is not counted here: the frame
// hands the Inbox's badge in (`badges`), made by the one selector every surface reads (surfaces/needs-you.ts).
function useSidebarRedraws() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    if (isDemoFrame()) window.addEventListener("fleet:status", bump);
    window.addEventListener("surface:workspace", bump);
    return () => {
      window.removeEventListener("surface:workspace", bump);
      window.removeEventListener("fleet:status", bump);
    };
  }, []);
}

// On a phone the drawer slides back under the thumb (kit/motion/swipe.ts touchSwipe onAway): it follows the finger to the
// left, the page behind lightens with it, and let go past a third or with a flick it goes, short of that it settles.
// Nothing opens it by a swipe: from the screen's edge that is the phone's own back, so opening stays the tab bar's More.
const drawerSwipeOf = (onClose: (() => void) | null) =>
  onClose && window.touchSwipe
    ? window.touchSwipe({
        onAway: onClose,
        when: () => !!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches),
      })
    : {};

// The seeded LEADS are the mockup's, so the count is demo-only; a real workspace's leads are the scope of People.
const demoReadyLeads = () =>
  isDemoFrame() ? String((window.LEADS || []).filter((l) => l.stage === "ready").length || "") || null : null;

export function Sidebar({
  active = "home",
  onNavigate = () => {},
  onClose = null,
  agents = ACTIVE_AGENTS_DEFAULT,
  badges = {},
  collapsed = false,
  onToggleCollapse = () => {},
  themePref = "dark",
  onTheme = () => {},
  look,
  onLook,
}: SidebarProps) {
  useSidebarRedraws();
  const [toastNode, flash] = (window.usePPToast as NonNullable<Window["usePPToast"]>)();
  const who = sbWho();
  // Computed badges, seed-honest counts; the caller's win.
  const computedBadges: Badges = { people: demoReadyLeads(), ...badges };
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} {...drawerSwipeOf(onClose)} data-testid="sidebar">
      <SidebarWorkspace collapsed={collapsed} onNavigate={onNavigate} />
      <SidebarNav active={active} onNavigate={onNavigate} badges={computedBadges} collapsed={collapsed} />
      {isDemoFrame() && !collapsed && <SidebarAgents agents={agents.map(sbOverlay)} onNavigate={onNavigate} />}
      <SidebarFoot
        who={who}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        themePref={themePref}
        onTheme={onTheme}
        look={look}
        onLook={onLook}
        onNavigate={onNavigate}
        flash={flash}
      />
      {toastNode}
    </aside>
  );
}
