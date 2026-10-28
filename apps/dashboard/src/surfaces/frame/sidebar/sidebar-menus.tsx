/**
 * The sidebar's two menus, the workspace's and the account's (moved from legacy/components/sidebar.jsx, the one-system
 * plan's step 7b). A menu is anchored to its trigger but drawn at the app's root, not inside the sidebar (which clips),
 * so the rail can open one as well; Escape and the backdrop close it, and its place is taken when it opens. Everything the
 * menus can do (switch, sign out, the theme) goes through the shell (`__shell`), never a second copy of it here. Drawn as
 * the JSX drew them, raw buttons and all, until the frame's kit step (eslint KIT_PENDING).
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { LegacyFlash } from "../../legacy-verbs";
import { warmSettingsPane } from "../../settings/frame/pane-reads";
import { frameBell, frameChrome, frameGlyph, framePortal, isDemoFrame } from "../frame-window";
import {
  SbWorkspaceFace,
  sbWho,
  sbWorkspace,
  sbWorkspaceName,
  sbWorkspaceRole,
  sbWorkspaces,
  sbWorkspacesRead,
  type SbWho,
} from "./sidebar-who";

interface MenuRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  /** The sidebar's own right side: a menu that opens beside it starts there, not at its trigger's. */
  edge: number;
}

interface SbMenuState {
  open: boolean;
  rect: MenuRect | null;
  ref: RefObject<HTMLButtonElement | null>;
  toggle: () => void;
  close: () => void;
}

/**
 * The panes of Settings the menus open (the workspace's "Workspace settings", the account's Settings, Profile and
 * Notifications), warmed as a menu opens, as the phone's drawer warms the pages only it leads to (shell-hooks.ts
 * DRAWER_ONLY). On a desk the menus are the way to Settings, and a press there waited for its page from the server: 11
 * of 16 moves to it, 1.7 s at the median, where every other page moved in 0.2 (page_vitals, 14-28 Oct 2026).
 */
const MENU_PANES = ["workspace", "profile", "notifications"] as const;

/** A menu's open state, its place (taken as it opens) and its trigger; Escape closes it. Opened, it warms Settings. */
export function useSbMenu(): SbMenuState {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<MenuRect | null>(null);
  const ref = useRef<HTMLButtonElement | null>(null);
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const bar = ref.current.closest ? ref.current.closest(".sidebar") : null;
      setRect({
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        edge: bar ? bar.getBoundingClientRect().right : r.right,
      });
    }
    setOpen((v) => !v);
  };
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return undefined;
    MENU_PANES.forEach(warmSettingsPane);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return { open, rect, ref, toggle, close };
}

/** Where the sidebar stands beside the page: a desk. Under it the sidebar is a drawer, and its menus are sheets. */
const SB_BESIDE_QUERY = "(min-width: 901px)";
const sbBeside = () => !!(window.matchMedia && window.matchMedia(SB_BESIDE_QUERY).matches);
/** How far a menu beside the sidebar lies over its edge: a little, so it reads as the sidebar's own. */
const SB_OVERLAP_PX = 8;
const SB_MENU_WIDTH = 264;
const SB_MENU_MARGIN = 8;

// On a desk a menu opens beside the sidebar, over its edge by SB_OVERLAP_PX: the workspace's from the top of its row
// (`side` "down"), the account's with its foot on its row's ("up"). Over the row, the account's covered every place in
// the sidebar (Ruben, 7 Oct 2026). On a phone it is placed by the stylesheet, as a sheet from the screen's foot
// (components.css `[data-sb-place]`): it took its place from its row, and a row read while the drawer was still
// sliding in put the menu off the screen.
const sbMenuStyle = (rect: MenuRect | null, side: "up" | "down"): CSSProperties => {
  if (!rect || !sbBeside()) return {};
  const left = Math.round(rect.edge) - SB_OVERLAP_PX;
  return side === "up"
    ? {
        left,
        bottom: Math.max(SB_MENU_MARGIN, Math.round(window.innerHeight - rect.bottom)),
        width: SB_MENU_WIDTH,
      }
    : { left, top: Math.max(SB_MENU_MARGIN, Math.round(rect.top)), width: SB_MENU_WIDTH };
};

// Drawn at the app's root, not inside the sidebar: a phone's drawer is moved by a transform, and a fixed box inside a
// transformed one is placed and cut off by it (Ruben, 7 Oct 2026). The root carries the theme. Where there is no
// document to draw into (a test's stub), in place.
const sbMenuRoot = (menu: SbMenuState): Element | null => {
  const from = menu.ref.current;
  const root = from && from.closest ? from.closest(".app-root") : null;
  return root && framePortal() ? root : null;
};

// At the foot (a phone's action sheet) a pull down from its top lets the menu go, following the finger, as every sheet's
// does (kit/motion/swipe.ts touchSwipe; Ruben, 8 Oct 2026). The touch stays the menu's own: it is drawn at the app's root
// and is still the drawer's child to React, and the drawer reads a swipe across as its own close.
const sbMenuPull = (menu: SbMenuState) => {
  if (!window.touchSwipe) return {};
  const pull = window.touchSwipe({ onDown: menu.close, when: () => !sbBeside() });
  const own =
    <E extends { stopPropagation?: () => void }>(handle: ((e: E) => void) | undefined) =>
    (e: E) => {
      if (e && e.stopPropagation) e.stopPropagation();
      if (handle) handle(e);
    };
  return {
    onTouchStart: own(pull.onTouchStart),
    onTouchMove: own(pull.onTouchMove),
    onTouchEnd: own(pull.onTouchEnd),
    onTouchCancel: own(pull.onTouchCancel),
  };
};

export function SbMenu({
  menu,
  side = "down",
  label,
  testid,
  children,
}: {
  menu: SbMenuState;
  side?: "up" | "down";
  label: string;
  testid: string;
  children: ReactNode;
}) {
  if (!menu.open) return null;
  const place = sbBeside() ? "beside" : "foot";
  const drawn = (
    <>
      <div
        className="more-backdrop"
        role="presentation"
        data-sb-wash={place}
        onClick={(e) => {
          e.stopPropagation();
          menu.close();
        }}
      />
      <div
        className="more-menu sb-menu"
        role="menu"
        aria-label={label}
        {...sbMenuPull(menu)}
        data-sb-place={place}
        style={sbMenuStyle(menu.rect, side)}
        onClick={(e) => e.stopPropagation()}
        data-testid={testid}
      >
        {children}
      </div>
    </>
  );
  const root = sbMenuRoot(menu);
  const portal = framePortal();
  return root && portal ? portal(drawn, root) : drawn;
}

// The workspaces this account belongs to, the one being viewed checked, the caller's role beside it, and the door to its
// settings. Switching goes through the shell, which re-runs every surface. ⌘1–9 switch too (app-shell.tsx); the ? sheet
// says so, and nothing here draws a key.
export function WorkspaceMenu({ onNavigate, close }: { onNavigate: (to: string) => void; close: () => void }) {
  const Glyph = frameGlyph();
  const all = sbWorkspacesRead() ? sbWorkspaces() : isDemoFrame() ? [{ id: "demo", name: sbWorkspaceName() }] : [];
  const active = sbWorkspace() || (isDemoFrame() ? all[0] : null) || null;
  const role = sbWho().role;
  return (
    <>
      <div className="more-header">{all.length > 1 ? "Workspaces" : "Workspace"}</div>
      {all.map((w) => {
        const current = !!active && w.id === active.id;
        const roleWords = sbWorkspaceRole(w, current, role);
        return (
          <button
            key={w.id}
            className={`more-item sb-ws ${current ? "active" : ""}`}
            role="menuitemradio"
            aria-checked={current}
            data-testid="sb-ws-item"
            onClick={() => {
              close();
              if (!current && window.__shell) window.__shell.switchWorkspace(w.id);
            }}
          >
            <SbWorkspaceFace ws={w} className="sb-ws-mark" />
            <span className="more-item-label">
              {w.name}
              {roleWords ? <span className="sb-ws-role">{roleWords}</span> : null}
            </span>
            {current && <Glyph name="check" size={12} />}
          </button>
        );
      })}
      <div className="more-divider" />
      {!isDemoFrame() && window.__shell && (
        <button
          className="more-item"
          role="menuitem"
          onClick={() => {
            close();
            window.__shell?.createWorkspace();
          }}
          data-testid="sb-ws-new"
        >
          <Glyph name="plus" size={13} />
          <span className="more-item-label">New workspace</span>
        </button>
      )}
      <button
        className="more-item"
        role="menuitem"
        onClick={() => {
          close();
          onNavigate("admin");
        }}
      >
        <Glyph name="cog" size={13} />
        <span className="more-item-label">Workspace settings</span>
      </button>
    </>
  );
}

interface UserMenuProps {
  who: SbWho;
  themePref: string;
  onTheme: (id: string) => void;
  look?: string;
  onLook?: (id: string) => void;
  onNavigate: (to: string) => void;
  close: () => void;
  flash: (p: LegacyFlash) => void;
}

/** Who you are, at the menu's head. */
function UserMenuHead({ who }: { who: SbWho }) {
  return (
    <div className="sb-menu-head" data-testid="sb-me">
      <div className="avatar">{who.initials}</div>
      <div className="who">
        <div className="name">{who.name}</div>
        <div className="email">{who.email}</div>
      </div>
      {who.role && (
        <span className="chip sb-role" data-testid="sb-me-role">
          {who.role}
        </span>
      )}
    </div>
  );
}

/**
 * The doors, widest first: the workspace's settings, then the two that are yours. Settings stood in the sidebar's own list as
 * its last place (Ruben, 7 Oct 2026: it is a thing you set, not a place you work in). Whether this device is alerted is said
 * beside Notifications where it is not: the switch is the bell's and that page's.
 */
function UserMenuDoors({ who, onNavigate, close }: Pick<UserMenuProps, "who" | "onNavigate" | "close">) {
  const Glyph = frameGlyph();
  const bell = frameBell();
  const real = !isDemoFrame() && bell ? bell : null;
  const alerts = real ? real.alerts() : null;
  const go = (to: string) => () => {
    close();
    onNavigate(to);
  };
  return (
    <>
      <button className="more-item" role="menuitem" onClick={go("admin")} data-testid="sb-me-settings">
        <Glyph name="cog" size={13} />
        <span className="more-item-label">Settings</span>
      </button>
      <button className="more-item" role="menuitem" onClick={go("admin/profile")} data-testid="sb-me-name">
        <Glyph name="user" size={13} />
        <span className="more-item-label">Profile</span>
        {!who.named && <span className="more-item-meta">Add your name</span>}
      </button>
      <button
        className="more-item"
        role="menuitem"
        onClick={go("admin/notifications")}
        data-testid="sb-me-notifications"
      >
        <Glyph name="bell" size={13} />
        <span className="more-item-label">Notifications</span>
        {alerts && alerts.can && !alerts.on && (
          <span className="more-item-meta" data-testid="sb-me-alerts">
            Off on this device
          </span>
        )}
      </button>
    </>
  );
}

/** The theme and the look, each a row of choices; the look only once the chrome offers it (contracts LOOK_OFFERED). */
function UserMenuLooks({
  themePref,
  onTheme,
  look,
  onLook,
}: Pick<UserMenuProps, "themePref" | "onTheme" | "look" | "onLook">) {
  const Glyph = frameGlyph();
  const chrome = frameChrome();
  const themes = chrome ? chrome.themes : [];
  const looks = chrome && chrome.lookOffered ? chrome.looks : [];
  return (
    <>
      <div className="more-header">Appearance</div>
      <div className="sb-theme-seg" role="radiogroup" aria-label="Theme">
        {themes.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={themePref === t.id}
            className={`sb-theme-opt ${themePref === t.id ? "active" : ""}`}
            onClick={() => onTheme(t.id)}
            data-testid={`sb-theme-${t.id}`}
          >
            <Glyph name={t.icon} size={12} />
            {t.label}
          </button>
        ))}
      </div>
      {looks.length > 0 && (
        <>
          <div className="more-header">Look</div>
          {/* .sb-theme-seg is the theme's three columns: step 5.5, which offers the look, sizes it for two. */}
          <div className="sb-theme-seg" role="radiogroup" aria-label="Look">
            {looks.map((l) => (
              <button
                key={l.id}
                role="radio"
                aria-checked={look === l.id}
                className={`sb-theme-opt ${look === l.id ? "active" : ""}`}
                onClick={() => onLook && onLook(l.id)}
                data-testid={`sb-look-${l.id}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// The account: who you are, the doors to Settings, your profile and your notifications, the theme and the look, the Keyboard
// shortcuts sheet on a desk (a pointer's door to it: the sheet opens on ? for a hand on the keys, and a phone needs no keys;
// Ruben, 23 Sep 2026), and sign out.
export function UserMenu(props: UserMenuProps) {
  const { close, flash } = props;
  const Glyph = frameGlyph();
  const signOut = () => {
    close();
    if (isDemoFrame() || !window.__shell) {
      flash({ tone: "info", msg: <>Nothing to sign out of in the demo.</> });
      return;
    }
    window.__shell.signOut();
  };
  return (
    <>
      <UserMenuHead who={props.who} />
      <div className="more-divider" />
      <UserMenuDoors who={props.who} onNavigate={props.onNavigate} close={close} />
      <div className="more-divider" />
      <UserMenuLooks themePref={props.themePref} onTheme={props.onTheme} look={props.look} onLook={props.onLook} />
      <div className="more-divider" />
      {/* The sheet registers its opener (shortcuts.tsx openShortcuts), so this is a call and not a window event; the row's
          words name no key, the sheet is the one place a key is drawn. */}
      {sbBeside() && window.openShortcuts && (
        <button
          className="more-item"
          role="menuitem"
          onClick={() => {
            close();
            window.openShortcuts?.();
          }}
          data-testid="sb-me-shortcuts"
        >
          <Glyph name="keyboard" size={13} />
          <span className="more-item-label">Keyboard shortcuts</span>
        </button>
      )}
      <button className="more-item danger" role="menuitem" onClick={signOut} data-testid="sb-signout">
        <Glyph name="logout" size={13} />
        <span className="more-item-label">Sign out</span>
      </button>
    </>
  );
}
