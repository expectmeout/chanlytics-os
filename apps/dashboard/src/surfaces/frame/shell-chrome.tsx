/**
 * The frame's chrome (moved from legacy/pages/app-shell.jsx, the one-system plan's step 7e): the sidebar (a drawer on a
 * phone), the top bar, the two lines under it, the strip, the page, the phone's tabs and ✦, and the sheets; the shared
 * viewer and the first run's full screen. Plain functions, not components: each returns the elements ChanlyticsApp always
 * returned, so a page's state and its mount are exactly where they were. The parts are the frame's own, each read first
 * by the name the frame's JSX drew it by (a test's stand-in). Drawn as the JSX drew it, raw buttons and all, until the
 * frame's kit step.
 */
import { Component } from "react";
import type { ComponentType, ErrorInfo, PointerEvent, ReactNode } from "react";
import { AskLine } from "@/legacy-bridge/ask/line";
import { REPORT_WORDS } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { FailedRead } from "../kit/empty/empty";
import { reportDoor } from "../kit/empty/report-door";
import { useHeadUnder } from "../kit/head/standing";
import type { viewDeck } from "../kit/motion/view-deck";
import type { SurfaceViews } from "../routes";
import { frameGlyph, fromGlobal, fromWindow } from "./frame-window";
import { LiveCallBar, ShellStatusBar } from "./topbar/status-bars";
import { PhoneTabs } from "./phone-tabs";
import { ReportHost } from "./report-problem";
import { ShortcutsSheet } from "./shortcuts";
import { focusPage } from "./shell-hooks";
import { NAV_ROUTE, shellAddress } from "./shell-routes";
import { Sidebar } from "./sidebar/sidebar";
import { SurfaceTabs, stripSwipe } from "./surface-tabs";
import { Topbar } from "./topbar/topbar";

// ---- Error state --------------------------------------------------------
class ShellErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  override state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(e: Error) {
    return { err: e };
  }
  // Said, not only drawn: the bridge's host hears this and sends it to the server (src/client/client-error.ts).
  override componentDidCatch(e: Error, _info?: ErrorInfo) {
    try {
      window.dispatchEvent(
        new CustomEvent("chanlytics:shell-error", { detail: { error: e, page: shellAddress().route() } }),
      );
    } catch {
      /* a report lost, never a second error */
    }
  }
  override render() {
    if (!this.state.err) return this.props.children;
    const Glyph = frameGlyph();
    return (
      <div className="soon err">
        <div className="soon-glyph">
          <Glyph name="alert" size={22} />
        </div>
        <div className="soon-title">This surface hit an error</div>
        <div className="soon-blurb">
          The rest of the OS is fine — this pane failed to render.{" "}
          {String((this.state.err && this.state.err.message) || "")}
        </div>
        <div className="soon-actions">
          <button className="btn btn-sm" onClick={() => shellAddress().go("today")}>
            <Glyph name="home" size={12} /> Back to Today
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
            Reload
          </button>
          {reportDoor.open && (
            <Button size="sm" variant="quiet" onClick={() => reportDoor.open?.("this page")}>
              {REPORT_WORDS.doorShort}
            </Button>
          )}
        </div>
      </div>
    );
  }
}

/** A real surface whose read failed: never the mockup's seeds in its place. */
function SurfaceUnavailable({ onNavigate }: { onNavigate: (to: string) => void }) {
  const Failed = fromGlobal("FailedRead", FailedRead);
  return (
    <Failed
      kind="page"
      title="Can't reach your workspace"
      body="This isn't a quiet day — the connection failed. Nothing here would be your real data, so we're not showing anything. Your messages are still being received and answered."
      onRetry={() => window.location.reload()}
      also={{ label: "Back to Today", onClick: () => onNavigate("today") }}
      testid="surface-unavailable"
    />
  );
}

// A pointer that reaches a sidebar item warms its page (workspace.ts warmRoute), so the press that follows asks the server
// for nothing. The item says which it is (sidebar/sidebar.tsx data-nav).
const sideWarm = (e: PointerEvent<HTMLDivElement>) => {
  const target = e.target as Element | null;
  const item = target && target.closest ? target.closest<HTMLElement>("[data-nav]") : null;
  const a = shellAddress();
  const nav = item && item.dataset.nav;
  if (nav && a && a.warm) a.warm(NAV_ROUTE[nav] || nav);
};

// Shared read-only viewer: chrome-less, rendered AFTER all hooks so the hook order stays identical on every route.
// Demo-gated like everything else. The report it shows is the frame's `sharedPage`, drawn by the bridge (LegacyApp).
export const sharedViewer = ({
  theme,
  look,
  navigate,
  sharedPage,
}: {
  theme: string;
  look: string;
  navigate: (to: string) => void;
  sharedPage: ReactNode;
}) => {
  const Glyph = frameGlyph();
  return (
    <div className="shared-root" data-theme={theme} data-look={look}>
      <div className="shared-banner">
        <span className="sidebar-brand-mark">C</span>
        <span className="shared-banner-title">Serenity Spa — Reports</span>
        <span className="pill">Read-only</span>
        <span className="shared-banner-meta">Shared link · expires in 7 days</span>
        <span className="cal-sync-spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("reports")}>
          Exit preview
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => navigate("today")}>
          <Glyph name="sparkle" size={12} /> Get Chanlytics
        </button>
      </div>
      <div className="shared-body">{sharedPage}</div>
    </div>
  );
};

/** Ask's Line, by the name the frame's JSX drew it by. */
const askBar = () => fromGlobal("AskBar", AskLine);

// The first run: full screen, the frame's chrome set aside, after all hooks as the shared viewer is. Its page is an App
// Router page (surfaces/setup/first-run/). Ask is the one piece of the chrome it keeps: ⌘K opens the Line over the step.
export const firstRunScreen = ({
  theme,
  look,
  routePage,
  askOpen,
  setAskOpen,
}: {
  theme: string;
  look: string;
  routePage: ReactNode;
  askOpen: boolean;
  setAskOpen: (open: boolean) => void;
}) => {
  const Bar = askBar();
  return (
    <div className="fr-shell" data-theme={theme} data-look={look}>
      {routePage}
      <Bar open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  );
};

interface HeadAt {
  glass: boolean;
  pane: boolean;
  where: "over" | "inside";
  page: string;
  param: string | null;
  views: SurfaceViews | null | undefined;
  navigate: (to: string) => void;
  primaryAction: ReactNode;
}

/**
 * The slot of the frame's head, which says whose strip of views it holds (`data-strip`): the page's, or, while a thumb
 * carries a row's page back to the list held under it, the list's, as the strip it holds then is (surface-tabs.tsx).
 */
function PageSlot({ views, children }: { views: SurfaceViews | null | undefined; children: ReactNode }) {
  const under = useHeadUnder();
  const held = under ? under.strip && under.strip.views : views;
  return (
    <div className="pg-slot" data-strip={held && held.tabs.length > 1 ? held.name : undefined}>
      {children}
    </div>
  );
}

/**
 * The frame's places for the kit's head in Glass (pg-head and pg-act, with the row of views between them; the kit draws
 * into them, surfaces/kit/head/frame-head.tsx): over the page where the page is a pane that scrolls inside itself, and at
 * the top of the page's own scroll where the page scrolls (Today). Classic draws the row of views alone, over the page.
 * Called twice, once for each place; one draws, the other draws nothing. The slot says whose views it holds (`data-strip`).
 */
const glassHead = ({ glass, pane, where, page, param, views, navigate, primaryAction }: HeadAt) => {
  const Strip = fromGlobal("SurfaceTabs", SurfaceTabs);
  if (!glass) return where === "over" ? <Strip page={page} param={param} views={views} onNavigate={navigate} /> : null;
  if ((where === "over") !== pane) return null;
  return (
    <PageSlot views={views}>
      <div className="pg-head-slot" id="pg-head" />
      <Strip page={page} param={param} views={views} onNavigate={navigate} />
      <div className="pg-act-slot">
        <span id="pg-act" />
        {primaryAction}
      </div>
    </PageSlot>
  );
};

/** What the chrome is drawn from: ChanlyticsApp's state, the route table's answer and the view's fade. */
interface ChromeAt {
  theme: string;
  themePref: string;
  onTheme: (v: string) => void;
  look: string;
  onLook?: (v: string) => void;
  sidebar: string;
  onSidebar: (v: string) => void;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  askOpen: boolean;
  setAskOpen: (open: boolean) => void;
  openAsk: () => void;
  inboxNeeds: number;
  navigate: (to: string) => void;
  onPlace: () => void;
  PhoneFace: ComponentType<{ className?: string; ground?: string; side?: number; testId?: string }> | null;
  page: string;
  param: string | null;
  views?: SurfaceViews | null;
  activeNav: string;
  crumbs: readonly unknown[];
  pane: boolean;
  primaryAction: ReactNode;
  content: ReactNode;
  viewKey: string;
  routeStay: boolean;
  routeSlide: string | null;
  routeStrip: string | null;
  routeLoading: boolean;
  readsInPlace: boolean;
  surfaceUnavailable: boolean;
  ask?: string | null;
}

/** On a phone the sidebar is a drawer; open, it is a dialog, so a page's keys hold still behind it. Not aria-modal. */
const sideWrap = (s: ChromeAt) => {
  const Side = fromGlobal("Sidebar", Sidebar);
  return (
    <div
      className={`side-wrap ${s.navOpen ? "open" : ""} ${s.sidebar === "rail" ? "rail" : ""}`}
      role={s.navOpen ? "dialog" : undefined}
      aria-label={s.navOpen ? "Navigation" : undefined}
      onPointerOver={sideWarm}
    >
      {/* The wash stands just before the drawer, where a thumb sliding the drawer away finds it to fade. */}
      {s.navOpen && <div className="nav-backdrop" role="presentation" onClick={() => s.setNavOpen(false)} />}
      <Side
        active={s.activeNav}
        badges={{ inbox: s.inboxNeeds > 0 ? String(s.inboxNeeds) : null }}
        onNavigate={(id: string) => {
          s.setNavOpen(false);
          s.navigate(NAV_ROUTE[id] || (id.includes("/") ? id : `soon/${id}`));
        }}
        onClose={() => s.setNavOpen(false)}
        collapsed={s.sidebar === "rail"}
        onToggleCollapse={() => s.onSidebar(s.sidebar === "rail" ? "open" : "rail")}
        themePref={s.themePref}
        onTheme={s.onTheme}
        look={s.look}
        onLook={s.onLook}
      />
    </div>
  );
};

/**
 * What stands over the page: no box on a desk; on a phone the one fixed over it as the window scrolls (mobile.css). In
 * Glass the top bar's row holds the date and time where the crumbs were, and the page's act moves down to the row of views.
 * It is the frame's chrome (`data-chrome`, as the tab bar and Ask's circle are): a row's page carried back by a thumb shows
 * it under the page with the list it goes back to (kit/motion/held-list.ts).
 */
const frameTop = (s: ChromeAt, glass: boolean) => {
  const Bar = fromGlobal("Topbar", Topbar);
  const Live = fromGlobal("LiveCallBar", LiveCallBar);
  const Status = fromGlobal("ShellStatusBar", ShellStatusBar);
  return (
    <div className="frame-top" data-chrome="">
      {glass && <span className="pg-dateline-slot" id="pg-dateline" />}
      <Bar
        crumbs={(glass ? [] : s.crumbs) as never[]}
        theme={s.theme}
        themePref={s.themePref}
        onTheme={s.onTheme}
        onAsk={s.askOpen ? () => s.setAskOpen(false) : s.openAsk /* open, it closes, as ⌘K does */}
        askLabel={s.ask || null}
        onMenu={() => s.setNavOpen(true)}
        right={glass ? null : s.primaryAction}
      />
      {/* A call happening right now outranks a newer build or a stale surface: it stops being true by itself. */}
      <Live />
      <Status />
      {glassHead({
        glass,
        pane: s.pane,
        where: "over",
        page: s.page,
        param: s.param,
        views: s.views,
        navigate: s.navigate,
        primaryAction: s.primaryAction,
      })}
    </div>
  );
};

type DeckView = (typeof viewDeck)["view"];

/** The view is the deck's to move: it registers as it mounts and says which side it arrives from; a phone swipes it. */
const routeMain = (s: ChromeAt, glass: boolean) => {
  const deck = fromWindow<{ view: DeckView } | null>("viewDeck", null);
  const swipe = fromWindow("stripSwipe", stripSwipe);
  return (
    <main
      id="main"
      key={s.viewKey}
      ref={deck ? deck.view("frame") : undefined}
      className={`main-scroll route-view ${s.pane ? "pane" : ""} ${s.routeStay ? "route-stay" : ""}`}
      data-strip={s.routeStrip || undefined}
      data-slide={s.routeSlide || undefined}
      aria-busy={s.routeLoading ? "true" : undefined}
      {...swipe()}
    >
      {glassHead({
        glass,
        pane: s.pane,
        where: "inside",
        page: s.page,
        param: s.param,
        views: s.views,
        navigate: s.navigate,
        primaryAction: s.primaryAction,
      })}
      <ShellErrorBoundary>
        {s.routeLoading && !s.readsInPlace ? (
          <div className="route-reading" role="status">
            Reading…
          </div>
        ) : s.surfaceUnavailable ? (
          <SurfaceUnavailable onNavigate={s.navigate} />
        ) : (
          s.content
        )}
      </ShellErrorBoundary>
    </main>
  );
};

/** The phone's tab bar, unless the native app's own stands here (`__IN_APP`, stamped before paint). */
const phoneTabs = (s: ChromeAt) =>
  !window.__IN_APP && (
    <PhoneTabs
      page={s.page}
      param={s.param}
      inboxNeeds={s.inboxNeeds}
      onNavigate={s.navigate}
      onMenu={() => s.setNavOpen(true)}
      onPlace={s.onPlace}
    />
  );

/** Ask's ✦ on a phone: the disc (ask-face.jsx AskDisc) and the three over it on the same surface. */
const phoneAsk = (s: ChromeAt) => {
  if (s.askOpen || s.navOpen) return false;
  const Glyph = frameGlyph();
  const Disc = fromWindow<ComponentType<{ testId?: string }> | null>("AskDisc", null);
  const PhoneFace = s.PhoneFace;
  return (
    <button
      type="button"
      className="phone-ask"
      data-chrome=""
      onClick={s.openAsk}
      aria-label="Ask Chanlytics"
      title="Ask Chanlytics"
      data-testid="phone-ask"
    >
      {Disc ? <Disc testId="phone-ask-disc" /> : null}
      {PhoneFace ? (
        <PhoneFace className="phone-ask-face" ground="raised" side={14} testId="phone-ask-face" />
      ) : (
        <Glyph name="sparkle" size={20} />
      )}
    </button>
  );
};

/** Ask's Line over the page. */
const askLine = (s: ChromeAt) => {
  const Bar = askBar();
  return <Bar open={s.askOpen} onClose={() => s.setAskOpen(false)} />;
};

/** The one deal sheet (0008), opened from anywhere by window.openDealSheet, and the one step sheet (0007, amended). */
const sheetHost = (name: "DealSheetHost" | "StepSheetHost") => {
  const Host = fromWindow<ComponentType | null>(name, null);
  return Host ? <Host /> : null;
};

/** The app's chrome around the route view. */
export const appChrome = (s: ChromeAt) => {
  const glass = s.look === "glass";
  const Sheet = fromGlobal("ShortcutsSheet", ShortcutsSheet);
  return (
    <div className="app-root" data-theme={s.theme} data-look={s.look}>
      {/* The first stop for Tab: a way past the sidebar and the bars to the page (drawn only while it has focus). */}
      <button type="button" className="skip-link" onClick={() => focusPage(true)}>
        Skip to the page
      </button>
      {/* Glass's three pools of light, a layer each, which a desk drifts by a transform (components.css .pg-light). */}
      {glass && (
        <div className="pg-light" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      {sideWrap(s)}
      <div className="main">
        {frameTop(s, glass)}
        {routeMain(s, glass)}
        {phoneTabs(s)}
        {phoneAsk(s)}
      </div>
      {askLine(s)}
      <Sheet />
      {/* Report a problem (decision 0066): the sheet any failed card, the error screen and Profile open. */}
      <ReportHost />
      {sheetHost("DealSheetHost")}
      {sheetHost("StepSheetHost")}
    </div>
  );
};
