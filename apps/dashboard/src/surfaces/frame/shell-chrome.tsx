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
import { askDockRef } from "@/bridge/ask/dock";
import { AskLine } from "@/bridge/ask/line";
import { AskDisc } from "../kit/face/ask-face";
import { IN_APP_CLASS, REPORT_WORDS } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { FailedRead } from "../kit/empty/empty";
import { reportDoor } from "../kit/empty/report-door";
import { useHeadUnder } from "../kit/head/standing";
import { headSlotDrawn } from "../kit/head/frame-head";
import type { viewDeck } from "../kit/motion/view-deck";
import { LeaveHost } from "../kit/record/leave-ask";
import type { SurfaceViews } from "../routes";
import { frameGlyph, fromGlobal, fromWindow } from "./frame-window";
import { BriefPlaying, LiveCallBar, NextVisitBar, ShellStatusBar, UnmarkedVisitsBar } from "./topbar/status-bars";
import { markLeftFrom, PhoneAskFace } from "./phone-ask-face";
import { PhoneTabs } from "./phone-tabs";
import { ReportHost } from "./report-problem";
import { ShortcutsSheet } from "./shortcuts";
import { focusPage } from "./shell-hooks";
import { NAV_ROUTE, shellAddress } from "./shell-routes";
import { Sidebar } from "./sidebar/sidebar";
import { SurfaceTabs, stripNameOf, stripSwipe, stripViewRef } from "./surface-tabs";
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
        {/* What broke is the report's (componentDidCatch, above), for Health: a person is never shown an error's own text (docs/words.md). */}
        <div className="soon-title">This page didn&apos;t load</div>
        <div className="soon-blurb">Reload it, or go to Today.</div>
        <div className="soon-actions">
          <button className="btn btn-sm" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => shellAddress().go("today")}>
            <Glyph name="home" size={12} /> Go to Today
          </button>
          {reportDoor.open && (
            <Button size="sm" variant="quiet" onClick={() => reportDoor.open?.("this page", "wrong")}>
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
      body="This isn't a quiet day. Chanlytics couldn't connect, so nothing is shown rather than the wrong numbers. Your messages are still being received and answered."
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
// Demo-gated like everything else. The report it shows is the frame's `sharedPage`, drawn by the bridge (FrameApp).
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
        <span className="shared-banner-title">Serenity Spa · Reports</span>
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
 * The slot of the frame's head, which says whose strip of views it holds (`data-strip`): the page's own or its group's
 * (surface-tabs.tsx stripNameOf), or, while a thumb carries a row's page back to the list held under it, the list's, as the
 * strip it holds then is.
 */
function PageSlot({
  page,
  views,
  children,
}: {
  page: string;
  views: SurfaceViews | null | undefined;
  children: ReactNode;
}) {
  const under = useHeadUnder();
  const held = under ? under.strip : { page, views };
  return (
    <div className="pg-slot" data-strip={(held && stripNameOf(held.page, held.views)) ?? undefined}>
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
    <PageSlot page={page} views={views}>
      {/* Told as it is drawn, so the head is drawn into it in the same commit (frame-head.tsx headSlotDrawn). */}
      <div className="pg-head-slot" id="pg-head" ref={headSlotDrawn} />
      <Strip page={page} param={param} views={views} onNavigate={navigate} />
      <div className="pg-act-slot">
        <span id="pg-act" />
        {primaryAction}
      </div>
      {/* What the page stands under its views, in the frame's top with them (the Calendar's bar on a phone). */}
      <div className="pg-under-slot" id="pg-under" />
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
  /** AI's Line says it is drawn on the phone's bar (bridge/ask/dock.ts). */
  askDocked: boolean;
  setAskOpen: (open: boolean) => void;
  openAsk: () => void;
  inboxNeeds: number;
  navigate: (to: string) => void;
  onPlace: () => void;
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
  routeLanded: boolean;
  routeSlide: string | null;
  routeStrip: string | null;
  routeLoading: boolean;
  readsInPlace: boolean;
  surfaceUnavailable: boolean;
  ask?: string | null;
  /** The page draws its own head (route-table.tsx): its reading pane takes the screen over as the page will. */
  ownHead?: boolean;
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
    <div className="frame-top" data-chrome="" inert={askDocked(s) || undefined}>
      {glass && <span className="pg-dateline-slot" id="pg-dateline" />}
      <Bar
        crumbs={(glass ? [] : s.crumbs) as Parameters<typeof Topbar>[0]["crumbs"]}
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
      {/* Your brief while it plays, in the call's place while no call is up (the call outranks it, and ends it). */}
      <BriefPlaying />
      {/* Yesterday's visits to mark, in the call's place while no call is up (the call outranks it: components.css). */}
      <UnmarkedVisitsBar page={s.page} />
      {/* What is next on the day, beside the bell, while neither is up (both outrank it: components.css). */}
      <NextVisitBar page={s.page} />
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
      ref={stripViewRef(deck ? deck.view("frame") : null)}
      className={`main-scroll route-view ${s.pane ? "pane" : ""} ${s.routeStay ? "route-stay" : ""}`}
      data-strip={s.routeStrip || undefined}
      data-slide={s.routeSlide || undefined}
      data-landed={s.routeLanded || undefined}
      aria-busy={s.routeLoading ? "true" : undefined}
      // Under AI on a phone the page takes no press, key or reader: AI's screen, the bar and the circle are all there is.
      inert={askDocked(s) || undefined}
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
          // A page that draws its own head (a person's) takes the screen over as it reads, as it will once it is in
          // (mobile.css data-takeover): the frame's head and the phone's tab bar left as it came, and the page moved up.
          // The shell says so on the document's root as it draws this (app-shell.tsx, kit/motion/root-flags.ts).
          <div className="route-reading" role="status" data-takeover={s.ownHead ? "" : undefined}>
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

/**
 * AI open on a phone, where the frame's own bar stands: the bar folds into the place on screen and holds AI's field,
 * and the circle beside it holds AI's one press (Today, calm, 19 Nov 2026, D8; bridge/ask/dock.ts). Only once AI's
 * Line says it is drawn there, so the bar never folds round a field still on its way; inside the native app, whose own
 * tab bar stands here, the Line never says so and keeps a field of its own.
 */
const askDocked = (s: ChromeAt) => s.askOpen && s.askDocked;

/**
 * AI is closed. On a phone the three go back to their circle (D9): where they stood in AI is kept as it closes, and the
 * circle's own face comes in from there (phoneAskFace).
 */
const closeAsk = (s: ChromeAt) => {
  markLeftFrom(askDocked(s) ? document.querySelector('[data-testid="ask-hero-stage"] canvas') : null);
  s.setAskOpen(false);
};

/**
 * Inside the native app: the class contracts' boot script puts on the root before paint (IN_APP_CLASS), where the app's
 * own rules hang from too. A test's stand-in document may have no root or no class list: not in the app.
 */
const inApp = (): boolean => !!document.documentElement?.classList?.contains(IN_APP_CLASS);

/** The phone's tab bar, unless the native app's own stands here. */
const phoneTabs = (s: ChromeAt) =>
  !inApp() && (
    <PhoneTabs
      page={s.page}
      param={s.param}
      inboxNeeds={s.inboxNeeds}
      onNavigate={s.navigate}
      onMenu={() => s.setNavOpen(true)}
      onPlace={s.onPlace}
      onAskBack={askDocked(s) ? () => closeAsk(s) : null}
    />
  );

/**
 * Ask's ✦ on a phone: the disc (kit/face/ask-face.tsx AskDisc) and the three over it on the same surface. Gone while Ask is
 * open, never for the drawer: the ✦ is the tab bar's partner in its row (liquid.py tabbar), so under the drawer's veil it
 * dims with the bar, one row. Taken off with the drawer since #102, when it floated over the bar, it blinked out of the
 * row as More opened and back as it shut (Ruben, 11 Nov 2026).
 */
const phoneAsk = (s: ChromeAt) => {
  // Inside the native app AI keeps a screen of its own over the circle, which goes while it is open, as ever.
  if (s.askOpen && inApp()) return false;
  const docked = askDocked(s);
  const Glyph = frameGlyph();
  // The circle is one element, open or closed: closed, the three on it are the press that opens AI; open on a phone,
  // the three have left for AI's home and the circle holds AI's one press, drawn into it by the Line (D8, D9).
  return (
    <div className="phone-ask" data-chrome="foot" data-folded={docked ? "" : undefined}>
      <AskDisc testId="phone-ask-disc" />
      {/* The mic, as AI closes: it stays a moment and fades as the three come home, so the circle is never empty (D9). */}
      <span className="phone-ask-mic" aria-hidden="true">
        <Glyph name="mic" size={15} />
      </span>
      {/* Kept drawn while AI holds the circle (ask.css hides it), so the three are whole the moment they come home. */}
      <button
        type="button"
        className="phone-ask-press"
        onClick={s.openAsk}
        aria-label="Ask Chanlytics"
        title="Ask Chanlytics"
        data-testid="phone-ask"
        aria-hidden={docked ? "true" : undefined}
        tabIndex={docked ? -1 : undefined}
      >
        <PhoneAskFace away={docked} />
      </button>
      {docked ? <span className="phone-ask-held" ref={askDockRef.press} /> : null}
    </div>
  );
};

/**
 * The ground AI's screen stands on, on a phone (Today, calm, D8, D9): the page's own paper and light, come over the page
 * as AI opens and gone as it closes. It is the frame's, under the bar and the circle, so they keep their glass over it;
 * AI's screen itself is over all three, so the three are seen lifting off the circle. Kept drawn, unseen, so it comes
 * and goes by its own transition (ask.css `.ask-ground`); not inside the native app, where AI keeps its own screen.
 */
const phoneGround = (s: ChromeAt) =>
  !inApp() && <div className="ask-ground" aria-hidden="true" {...(askDocked(s) ? { "data-on": "" } : null)} />;

/** Ask's Line over the page. */
const askLine = (s: ChromeAt) => {
  const Bar = askBar();
  return <Bar open={s.askOpen} onClose={() => closeAsk(s)} />;
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
      {/* Not while AI holds a phone's screen: the page it skips to is taken away under AI (askDocked). */}
      <button type="button" className="skip-link" onClick={() => focusPage(true)} inert={askDocked(s) || undefined}>
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
        {/* Asked before the page, and a change not saved on it, are left: a band over the page (kit/record/leave-ask.tsx). */}
        <LeaveHost />
        {routeMain(s, glass)}
        {phoneGround(s)}
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
