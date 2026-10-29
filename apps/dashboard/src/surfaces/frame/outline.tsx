/**
 * The frame's outline: what the document draws before the app's code has run (the cold-load review, 28 Oct 2026).
 *
 * The frame is drawn by the browser alone (LegacyHost, `ssr: false`), so until its code had come and run, a cold load
 * showed a spinner on the page's ground: from 0.3 s on a desk and 0.6 to 0.8 s on a phone, until the page at 1.1 to
 * 1.3 s on a desk and 2.5 to 3 s on a phone. The outline is the frame's own chrome in the frame's own classes, so the
 * one stylesheet stands each part where the frame will: the sidebar, open or a rail, with its places; the top bar's Ask
 * and bell; on a phone the tab bar and Ask's disc. What only a read can say (the workspace, who is signed in, a count,
 * the date) is left as the room it takes, and the page is its ground. The app draws its frame over the same places and
 * this goes whole.
 *
 * Prerendered once for every address, so the two facts it is drawn by are stamped on <html> before first paint by the
 * document's head (contracts outlineBootScript): the sidebar this device keeps, and the first run, which the app draws
 * full screen and the outline as its ground alone (outline.css). Inert, so nothing in it is pressed or reached by Tab
 * before the frame is there; a screen reader hears that the workspace is loading. Pure: the server draws it.
 * e2e/shell/outline.spec.ts holds each part to the frame's.
 */
import { Icon } from "../kit/icon/icon";
import { TabBar } from "../kit/tab-bar/tab-bar";
import { NAV_GROUPS, PHONE_MORE, PHONE_TABS, type NavItem } from "./places";

/** The room of a line the frame writes from a read: its height, and nothing said. */
const ROOM = " ";
/** What a press does here: nothing, since nothing in the outline is pressed (it is inert). */
const pressesNothing = () => {};

/**
 * A place in the sidebar, as the frame's row draws it (sidebar/sidebar.tsx SidebarRow): its glyph, and its words when
 * open. The frame's row is a link to the place; this one is no door (the outline knows no workspace's address, and
 * nothing in it is pressed), so it is the row's box alone, which `.nav-item` draws whatever its tag.
 */
function OutlineRow({ item, rail }: { item: NavItem; rail: boolean }) {
  return (
    <span className={item.urgent ? "nav-item urgent" : "nav-item"} data-nav={item.id}>
      <Icon name={item.icon} />
      {!rail && <span>{item.label}</span>}
      {!rail && item.hint && <span className="nav-hint">{item.hint}</span>}
    </span>
  );
}

/**
 * The sidebar, open or a rail, as the frame draws it (sidebar/sidebar.tsx Sidebar): the workspace's row, the places in
 * their groups, the rail's toggle and the account. The demo's places and agents are a demo session's, never a load's.
 */
function OutlineSidebar({ rail }: { rail: boolean }) {
  return (
    <div className={rail ? "side-wrap rail" : "side-wrap"}>
      <aside className={rail ? "sidebar collapsed" : "sidebar"}>
        <button type="button" className="sb-team">
          <span className="sb-team-mark" />
          <div className="sb-team-body">
            <div className="sb-team-name">{ROOM}</div>
          </div>
          <Icon name="chevrons" size={14} />
        </button>
        <nav className="sb-nav-scroll">
          {NAV_GROUPS.map(({ items, label }, i) => (
            <div className="sidebar-section" key={i}>
              {label && !rail && <div className="sidebar-label">{label}</div>}
              {items
                .filter((item) => !item.demoOnly)
                .map((item) => (
                  <OutlineRow key={item.id} item={item} rail={rail} />
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="sb-collapse">
            <Icon name="sidebar" size={14} />
            <span className="sb-collapse-label">Collapse</span>
          </button>
          <button type="button" className="user-chip sb-account">
            <div className="avatar">{ROOM}</div>
            <div className="who">
              <div className="name">{ROOM}</div>
              <div className="email">{ROOM}</div>
            </div>
            <Icon name="chevrons" size={14} className="sb-chev" />
          </button>
        </div>
      </aside>
    </div>
  );
}

/** What stands over the page, as the frame draws it (shell-chrome.tsx frameTop, topbar/topbar.tsx): Ask and the bell. */
function OutlineTop() {
  return (
    <div className="frame-top" data-chrome="">
      <span className="pg-dateline-slot" />
      <header className="topbar">
        <button type="button" className="btn btn-ghost btn-icon btn-sm tb-menu" aria-label="Menu">
          <Icon name="menu" />
        </button>
        <div className="topbar-spacer" />
        <button type="button" className="tb-ask">
          <canvas className="tb-ask-face" aria-hidden="true" />
          <span className="tb-ask-label">Ask Chanlytics</span>
        </button>
        <div className="tbn-wrap">
          <button type="button" className="btn btn-ghost btn-icon btn-sm tb-bell" aria-label="Notifications">
            <Icon name="bell" />
          </button>
        </div>
      </header>
      <div className="shell-status-slot" />
    </div>
  );
}

/** The phone's foot, as the frame draws it (phone-tabs.tsx, shell-chrome.tsx phoneAsk): the tab bar, none lit, and Ask's disc. */
function OutlineFoot() {
  return (
    <>
      <TabBar
        label="Main"
        className="phone-places"
        picked={null}
        places={PHONE_TABS.map((t) => ({
          id: t.id,
          label: t.label,
          href: "#",
          glyph: <Icon name={t.icon} size={18} />,
        }))}
        onPick={pressesNothing}
        more={{
          label: PHONE_MORE.label,
          word: PHONE_MORE.word,
          glyph: <Icon name={PHONE_MORE.icon} size={18} />,
          onPress: pressesNothing,
        }}
      />
      <button type="button" className="phone-ask" data-chrome="foot" aria-label="Ask Chanlytics">
        <span className="ask-disc" aria-hidden="true" />
        <canvas className="phone-ask-face" aria-hidden="true" />
      </button>
    </>
  );
}

/** The outline, and the one sentence a screen reader hears while it stands. */
export function FrameOutline() {
  return (
    <>
      <div className="app-root frame-outline" inert aria-hidden="true">
        <div className="pg-light">
          <span />
          <span />
          <span />
        </div>
        <OutlineSidebar rail={false} />
        <OutlineSidebar rail />
        <div className="main">
          <OutlineTop />
          <OutlineFoot />
        </div>
      </div>
      <p className="rec-sr" role="status">
        Loading your workspace…
      </p>
    </>
  );
}
