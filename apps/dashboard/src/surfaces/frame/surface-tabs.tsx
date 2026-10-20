/**
 * The frame's strip of views (moved from legacy/components/surface-tabs.jsx, the one-system plan's step 7c): merged
 * surfaces (People, the Inbox's three, the demo's Agents) are views under one nav item, not places, drawn by the frame
 * above the routed page; every route stays as it was, so deep links keep working. The strip itself is the kit's
 * (kit/view-tabs ViewTabs: its links, its highlight, the press that starts the page leaving), as is what moves a view
 * (kit/motion/view-deck.ts) and the page a swipe walks (kit/view-tabs/pager.ts). This is the frame's part of it: which
 * views a route's group has, what each counts, their addresses warmed, and where a route stands on its strip. The
 * frame's JSX reads it by its old names (frame-globals.ts) until the frame itself is TypeScript (step 7e).
 */
import { useEffect, useReducer } from "react";
import type { ComponentType } from "react";
import { ViewTabs as KitViewTabs, type ViewTabsProps } from "../kit/view-tabs/view-tabs";
import type { SurfaceViews } from "../routes";
import { frameChrome, isDemoFrame } from "./frame-window";

interface StTab {
  id: string;
  label: string;
  to: string;
  demoOnly?: boolean;
  tip?: string;
  tone?: string;
  testid?: string;
  badge?: (needs: number | null) => number | null;
  pulse?: () => boolean;
}

/** A call still up between refreshes, by the heartbeat rule the Live page applies (contracts liveStillUp). */
const liveNow = (): boolean => {
  const live = window.__LIVE;
  const chrome = frameChrome();
  if (!live) return isDemoFrame();
  return !!chrome && live.now.some((c) => chrome.liveStillUp(c, live.heartbeatMs, Date.now()));
};

const ST_GROUPS: Readonly<Record<string, { match: readonly string[]; tabs: readonly StTab[] }>> = {
  people: {
    match: ["clients", "leads", "pipeline", "segments"],
    tabs: [
      { id: "clients", label: "People", to: "clients" },
      // No Leads tab here: Leads is a SCOPE of People (clients/leads), and People | Leads (| Pipeline) is the page's own
      // views, said by its chrome (surfaces/people/chrome.ts `views`) and drawn by this strip, not by this group. No Lists
      // tab either: the lists are the People rail, so a real workspace has one People tab, and the bar draws nothing there.
      {
        id: "pipeline",
        label: "Deal board",
        to: "pipeline",
        demoOnly: true,
        tip: "Deals are leads with money attached — same people, board view",
      },
    ],
  },
  // One door over one table: the Inbox and Conversations both read GET conversations (surface-data.ts); the Inbox is the
  // subset that waits on a decision, Conversations all of them plus the calls.
  inbox: {
    match: ["inbox", "conversations", "live"],
    tabs: [
      // The same count the sidebar badge, the phone tab, the tab's title and the phone app show: the one number
      // (surfaces/needs-you.ts, read through `window.useNeedsYou`), handed in by the strip, never a second reading of it.
      // It counts what needs you, so it is amber, as the Needs you pill is (tone.ts warn). None of the three says a tip.
      { id: "inbox", label: "Needs you", to: "inbox", tone: "warn", badge: (needs) => needs || null },
      { id: "conversations", label: "Conversations", to: "conversations" },
      // With the bridge running the pulse is the real thing: a call in progress under the heartbeat rule, so the tab does
      // not pulse for a phantom the page has already dropped. The seeded pulse stays demo-only.
      { id: "live", label: "Live", to: "live", pulse: liveNow },
    ],
  },
  // Campaigns is one page, its home, and Sent and the Library are its rooms: the three-tab strip went on 3 Oct 2026.
  // Content is seed-only, a real workspace has no such surface, and a strip of one draws nothing.
  campaigns: {
    match: ["content"],
    tabs: [{ id: "content", label: "Content", to: "content", demoOnly: true }],
  },
  agents: {
    match: ["fleet", "store", "studio", "tasks"],
    tabs: [
      // Every tab in this group is a "demo" surface, so in production all four led to the same Coming Soon pane. One
      // honest pane beats four ways to find it; they come back the day their slice ships.
      { id: "fleet", label: "Fleet", to: "fleet", demoOnly: true },
      { id: "store", label: "Store", to: "store", demoOnly: true },
      { id: "studio", label: "Studio", to: "studio", demoOnly: true },
      {
        id: "tasks",
        label: "Tasks",
        to: "tasks",
        demoOnly: true,
        tip: "The work ledger — receipts for everything agents did",
      },
    ],
  },
};

/** The frame's address as the strip asks it: a route's link, and its reads warmed ahead of a move. */
type StAddress = {
  href?: (route: string) => string;
  warm?: (route: string) => void;
  warmSoon?: (routes: string[]) => void;
};
// What the address says of itself, for the routes a press will move to: warmed once the page is idle and when a pointer or
// a finger reaches a tab, so the move that follows asks the server for nothing (workspace.ts warmRoute).
const stAddress = (): StAddress | null => {
  const chanly = Reflect.get(window, "CHANLY") as { address?: StAddress } | undefined;
  return (chanly && chanly.address) || null;
};
const stWarm = (route: string) => {
  const a = stAddress();
  if (a && a.warm) a.warm(route);
};
// A tab is a link, as every door is (frame-doors.ts routeDoor): its address the route's, so a middle click, a long press or
// a new tab opens that view; a plain press is the app's own move (the kit's ViewTabs decides which a press is).
const stHref = (route: string) => {
  const a = stAddress();
  return a && a.href ? a.href(route) : `#/${route}`;
};

/** The strip by the global name the frame's JSX drew it by (a test's stand-in), else the kit's. */
const stViewTabs = () =>
  (globalThis as typeof globalThis & { ViewTabs?: ComponentType<ViewTabsProps> }).ViewTabs ?? KitViewTabs;

/** A route's group and its tabs: the page's own views where it says more than one, else its group's here. */
const stTabsOf = (page: string, own: SurfaceViews | null): [string | null, readonly StTab[]] => {
  if (own) return [own.name, own.tabs];
  const found = Object.entries(ST_GROUPS).find(([, g]) => g.match.includes(page));
  return found ? [found[0], found[1].tabs.filter((t) => !t.demoOnly || isDemoFrame())] : [null, []];
};

// surface:live moves the Live tab's pulse. A call's ending is a row on the live feed, and the verdict thread's news is the
// bell's: neither has an event of its own. The Needs-you badge is the count's hook, which no event feeds.
function useLiveRedraws() {
  const [, stBump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const evs = ["surface:live"];
    evs.forEach((e) => window.addEventListener(e, stBump));
    return () => evs.forEach((e) => window.removeEventListener(e, stBump));
  }, []);
}

interface SurfaceTabsProps {
  page: string;
  param?: string | null;
  views?: SurfaceViews | null;
  onNavigate: (to: string) => void;
}

// `views` is a page that says its own views (surfaces/routes.ts SurfaceViews: People's scopes, Reports' lenses, from its
// chrome): the same strip, drawn here once for every page, whether the views are a group's or the page's own. A page's
// views are its tabs, the one picked is its own to name, and a view is a move to a route like any tab here.
export function SurfaceTabs({ page, param, views, onNavigate }: SurfaceTabsProps) {
  useLiveRedraws();
  const own = views && views.tabs.length > 1 ? views : null;
  // What needs you, drawn again when the number changes and by nothing else (surfaces/needs-you.ts). Not read before the
  // Inbox has been, and nowhere in the standalone mockup.
  const needs = window.useNeedsYou ? window.useNeedsYou() : 0;
  const [groupKey, tabs] = stTabsOf(page, own);
  const warmRoutes = tabs.map((t) => t.to).join(" ");
  useEffect(() => {
    const a = stAddress();
    if (warmRoutes && a && a.warmSoon) a.warmSoon(warmRoutes.split(" "));
  }, [groupKey, page, warmRoutes]);
  if (tabs.length < 2) return null;
  // Detail views keep their focus: hide on a person's profile. A list (seg:, list:) and a state (state:) are views of
  // People (the wiring audit's N24). A page that says its own views says none for one.
  if (!own && page === "clients" && param && !/^(seg|list|state):/.test(param)) return null;
  const routeOf = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    return tab ? tab.to : id;
  };
  const Strip = stViewTabs();
  return (
    <Strip
      name={groupKey || ""}
      label={own ? own.label : "Section views"}
      testid={own ? own.testid : undefined}
      picked={own ? own.picked : page}
      tabs={tabs.map((t: StTab) => ({
        id: t.id,
        label: t.label,
        href: stHref(t.to),
        count: t.badge ? t.badge(needs) : null,
        tone: t.tone === "warn" ? "warn" : undefined,
        live: t.pulse ? !!t.pulse() : false,
        tip: t.tip,
        testid: t.testid,
        warm: () => stWarm(t.to),
      }))}
      onPick={(id: string) => onNavigate(routeOf(id))}
    />
  );
}

// ---- Where a route stands on a strip, and which way a view comes in -------------------------------------------------
// People's scopes are People's own views (its chrome's, drawn by SurfaceTabs above), in plScopes' order; every other strip
// is a group's here. A person's page, and a route no strip carries, stand nowhere, and a view arriving there comes in as
// any other does.
interface StripPlace {
  strip: string;
  at: number;
}

/** Whether the workspace's Ads preview is on (`features.ads_preview` in the settings it holds, `__SETTINGS`). */
const stAdsPreviewOn = () => {
  const config =
    window.__SETTINGS && (window.__SETTINGS as { config?: { features?: { ads_preview?: unknown } } }).config;
  return !!(config && config.features && config.features.ads_preview === true);
};

/** Which of People's scopes an address of `clients` is: Leads, the Pipeline, or the list itself (a list, a state). */
const peopleScopeRoute = (param: string | null | undefined) => {
  if (param && /^leads(:|$)/.test(param)) return "clients/leads";
  if (param && /^pipeline(:|$)/.test(param)) return "clients/pipeline";
  return !param || /^(seg|list|state):/.test(param) ? "clients" : null;
};

const peoplePlace = (param: string | null | undefined): StripPlace | null => {
  const scopes = window.plScopes;
  const routeOfScope = window.plScopeRoute;
  if (!scopes || !routeOfScope) return null;
  const route = peopleScopeRoute(param);
  const at = route
    ? scopes()
        .map((s) => routeOfScope(s.id))
        .indexOf(route)
    : -1;
  return at < 0 ? null : { strip: "people", at };
};

export const stripPlace = (page: string, param?: string | null): StripPlace | null => {
  if (page === "clients") return peoplePlace(param);
  // Campaigns' own views (its chrome's, surfaces/campaigns/routes.ts): Messages, the home and its addresses, then Ads. A
  // demo session's, or a workspace's whose Ads preview is on (surfaces/campaigns/ads/shown.ts): any other has no strip.
  if (page === "campaigns" && (isDemoFrame() || stAdsPreviewOn()))
    return { strip: "campaigns", at: param && /^ads(:|$)/.test(param) ? 1 : 0 };
  const found = Object.entries(ST_GROUPS).find(([key, g]) => key !== "people" && g.match.includes(page));
  if (!found) return null;
  const at = found[1].tabs.filter((t) => !t.demoOnly || isDemoFrame()).findIndex((t) => t.id === page);
  return at < 0 ? null : { strip: found[0], at };
};

export const stripSlide = (from: StripPlace | null, to: StripPlace | null): "next" | "prev" | null =>
  from && to && from.strip === to.strip && from.at !== to.at ? (to.at > from.at ? "next" : "prev") : null;

// ---- The strip under a thumb (docs/superpowers/specs/2026-09-25-swipe-between-tabs-design.md) -----------------------
// A swipe across the page walks the strip drawn over it: kit/motion's touchSwipe reads the touch and the kit's viewPager
// says what a page is (the tab beside the lit one, pressed at the lift, so a swipe is exactly a tap). A strip is walked
// where the shell is narrow enough for a page of one column (900px), and there only where the page says it travels its own
// width (`--view-travel`: the pager asks the deck), which is every page on a phone and People's to 900px.
const stripPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches);
export const stripSwipe = () =>
  window.touchSwipe && window.viewPager ? window.touchSwipe({ pages: window.viewPager, when: stripPhone }) : {};
