/**
 * The sidebar (moved from legacy/components/sidebar.jsx, the one-system plan's step 7b): the workspace's menu at the top,
 * the nav, then the rail's toggle and the account's menu at the foot. Every word about a person comes
 * from contracts' identity rules through the bridge (sidebar-who.tsx), and everything the menus can do goes through the
 * shell (sidebar-menus.tsx). The frame imports it. Drawn as the JSX drew it, raw buttons and all, until the frame's kit step (eslint
 * KIT_PENDING); its inline styles and its nav's clickable rows moved with it, none new.
 */
import { useEffect, useState } from "react";
import { routeDoor } from "../../frame-doors";
import { useFrameToast, type FrameFlash } from "../../frame-verbs";
import { NAV_INTEL, NAV_PRIMARY, NAV_WORK, placeLit, type NavItem } from "../places";
import { NAV_ROUTE } from "../shell-routes";
import { SbMenu, UserMenu, WorkspaceMenu, useSbMenu } from "./sidebar-menus";
import { SbWorkspaceFace, sbTeamSub, sbWho, sbWorkspace, sbWorkspaceName, type SbWho } from "./sidebar-who";
import { Icon } from "../../kit/icon/icon";
import { touchSwipe } from "../../kit/motion/swipe";

type Badges = Record<string, string | number | null | undefined>;

const rowTip = (id: string) =>
  id === "inbox"
    ? // What the count is, in five words at most (docs/words.md, Tooltip): it said "agents hold until you call it".
      "Conversations that need you"
    : id === "people"
      ? "Leads ready for you to call"
      : null;

/** A row's count: a dot in the rail, a tally beside the words. */
function RowBadge({ item, badge, collapsed }: { item: NavItem; badge: string | number; collapsed: boolean }) {
  if (collapsed)
    return <span className={`nav-dot ${item.urgent ? "urgent" : ""}`} aria-label={`${badge} ${item.label}`} />;
  return (
    <span
      className={`nav-count tally tally-fill${item.urgent ? " urgent tally-warn" : ""}`}
      data-tip={rowTip(item.id) || undefined}
    >
      {badge}
    </span>
  );
}

interface RowProps {
  item: NavItem;
  active: string;
  onNavigate: (to: string) => void;
  badges?: Badges;
  collapsed?: boolean;
}

/** A place of the nav: no place has rows under it (the folding rows and their chevron went, never drawn, 25 Nov 2026). */
function SidebarRow({ item, active, onNavigate, badges = {}, collapsed = false }: RowProps) {
  const badge = badges[item.id] !== undefined ? badges[item.id] : item.badge;
  const tip = collapsed ? (badge ? `${item.label} · ${badge}` : item.label) : undefined;
  // A place is a door (frame-doors.ts routeDoor): Tab reaches it, Enter opens it, and a middle press or a new tab opens its
  // address. Every row was a div that only a pointer could press (27 Oct 2026). The shell's own way there stays the press.
  const route = NAV_ROUTE[item.id] || null;
  const door = route ? routeDoor(route, () => onNavigate(item.id)) : null;
  return (
    <a
      className={`nav-item ${active === item.id ? "active" : ""} ${item.urgent ? "urgent" : ""}`}
      href={door ? door.href : undefined}
      onClick={door ? door.onClick : undefined}
      onFocus={door ? door.onFocus : undefined}
      aria-label={tip}
      data-tip={tip}
      data-tip-side="right"
      aria-current={active === item.id ? "page" : undefined}
      data-nav={item.id}
    >
      {item.icon && <Icon name={item.icon} />}
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.hint && <span className="nav-hint">{item.hint}</span>}
      {badge ? <RowBadge item={item} badge={badge} collapsed={collapsed} /> : null}
    </a>
  );
}

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
  const effActive = placeLit(active);
  const renderGroup = (items: readonly NavItem[], label?: string) => (
    <div className="sidebar-section">
      {label && !collapsed && <div className="sidebar-label">{label}</div>}
      {items.map((it) => (
        <SidebarRow
          key={it.id}
          item={it}
          active={effActive}
          onNavigate={onNavigate}
          badges={badges}
          collapsed={collapsed}
        />
      ))}
    </div>
  );
  // Scrollable nav region. Ask has one door, the top bar's (the Line, D8).
  return (
    <nav className="sb-nav-scroll" aria-label="Pages">
      {renderGroup(NAV_PRIMARY)}
      {renderGroup(NAV_WORK, "Workspace")}
      {renderGroup(NAV_INTEL, "Intelligence")}
    </nav>
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
  flash: (p: FrameFlash) => void;
}

/** The foot: the rail's toggle and the account. The shell's status is the line under the top bar (frame/topbar.tsx). */
function SidebarFoot({ who, collapsed, onToggleCollapse, onNavigate, flash, ...appearance }: FootProps) {
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
        <Icon name="sidebar" size={14} />
        <span className="sb-collapse-label">Collapse</span>
      </button>
      <button
        type="button"
        className="sb-account"
        ref={meMenu.ref}
        onClick={meMenu.toggle}
        aria-haspopup="menu"
        aria-expanded={meMenu.open}
        data-tip={collapsed ? who.name : undefined}
        data-tip-side="right"
        data-testid="sb-account"
      >
        <span className="face face-sm">{who.initials}</span>
        <div className="who">
          <div className="name">{who.name}</div>
          <div className="email">{sbAccountSub(appearance.look, who)}</div>
        </div>
        <Icon name="chevrons" size={14} className="sb-chev" />
      </button>
      <SbMenu menu={meMenu} side="up" label="Account" testid="sb-account-menu">
        <UserMenu who={who} onNavigate={onNavigate} close={meMenu.close} flash={flash} {...appearance} />
      </SbMenu>
    </div>
  );
}

/** The workspace's row, which opens its menu. */
function SidebarWorkspace({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: (to: string) => void }) {
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
        <SbWorkspaceFace ws={sbWorkspace()} className="face face-sm face-tile" />
        <div className="sb-team-body">
          <div className="sb-team-name">{sbWorkspaceName()}</div>
          {sbTeamSub()}
        </div>
        <Icon name="chevrons" size={14} className="sb-team-chev" />
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
  badges?: Badges;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  themePref?: string;
  onTheme?: (id: string) => void;
  look?: string;
  onLook?: (id: string) => void;
}

// What redraws the sidebar: who is looking and which workspace (the workspace read). What needs you is not counted here:
// the frame hands the Inbox's badge in (`badges`), made by the one selector every surface reads (surfaces/needs-you.ts).
function useSidebarRedraws() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("surface:workspace", bump);
    return () => window.removeEventListener("surface:workspace", bump);
  }, []);
}

// On a phone the drawer slides back under the thumb (kit/motion/swipe.ts touchSwipe onAway): it follows the finger to the
// left, the page behind lightens with it, and let go past a third or with a flick it goes, short of that it settles.
// Nothing opens it by a swipe: from the screen's edge that is the phone's own back, so opening stays the tab bar's More.
const drawerSwipeOf = (onClose: (() => void) | null) =>
  onClose
    ? touchSwipe({
        onAway: onClose,
        when: () => !!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches),
      })
    : {};

export function Sidebar({
  active = "home",
  onNavigate = () => {},
  onClose = null,
  badges = {},
  collapsed = false,
  onToggleCollapse = () => {},
  themePref = "dark",
  onTheme = () => {},
  look,
  onLook,
}: SidebarProps) {
  useSidebarRedraws();
  const [toastNode, flash] = useFrameToast();
  const who = sbWho();
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} {...drawerSwipeOf(onClose)} data-testid="sidebar">
      <SidebarWorkspace collapsed={collapsed} onNavigate={onNavigate} />
      <SidebarNav active={active} onNavigate={onNavigate} badges={badges} collapsed={collapsed} />
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
