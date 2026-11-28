/**
 * The frame's strip of views (moved from legacy/components/surface-tabs.jsx, the one-system plan's step 7c): merged
 * surfaces (People, the Inbox's three) are views under one nav item, not places, drawn by the frame
 * above the routed page; every route stays as it was, so deep links keep working. The strip itself is the kit's
 * (kit/view-tabs ViewTabs: its links, its highlight, the press that starts the page leaving), as is what moves a view
 * (kit/motion/view-deck.ts) and the page a swipe walks (kit/view-tabs/pager.ts). This is the frame's part of it: which
 * views a route's group has, what each counts, their addresses warmed, and where a route stands on its strip. The
 * frame imports it.
 */
import { useEffect, useLayoutEffect, useReducer, useSyncExternalStore } from "react";
import { stripShown, useHeadUnder, type StripAt } from "../kit/head/standing";
import { holdMoves, touchSwipe } from "../kit/motion/swipe";
import { ViewTabs as KitViewTabs } from "../kit/view-tabs/view-tabs";
import type { SurfaceViews } from "../routes";
import { surfaceValue } from "../surface-values";
import { frameChrome } from "./frame-window";
import { CHANLY } from "./constants";
import { useNeedsYou } from "../needs-you";
import { provided } from "@/bridge/provided";
import { isSurfaceFailed, onSurfaceMoved } from "@/bridge/surface-status";
import { getActiveWorkspace, warmsOnItsOwn } from "@/bridge/workspace";
import { viewPager } from "../kit/view-tabs/pager";

/**
 * What the strip knows as it asks whether a tab's count is on its way: `needs`, null while the day is unread; whether the
 * day's read failed, after which no count of it is ever coming; and whether this frame reads with nobody reaching
 * (bridge/workspace.ts warmsOnItsOwn), which a view read ahead of its press depends on.
 */
interface CountAt {
  needs: number | null;
  dayFailed: boolean;
  readsAhead: boolean;
}

interface StTab {
  id: string;
  label: string;
  to: string;
  tip?: string;
  tone?: string;
  testid?: string;
  badge?: (needs: number | null) => number | null;
  /** Whether its count is not read yet and its read is on its way, by what the strip knows as it is drawn. */
  coming?: (frame: CountAt) => boolean;
  pulse?: () => boolean;
}

/** A call still up between refreshes, by the heartbeat rule the Live page applies (contracts liveStillUp). */
const liveNow = (): boolean => {
  const live = surfaceValue("live");
  const chrome = frameChrome();
  if (!live) return false;
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
    ],
  },
  // One door over one table: the Inbox and Conversations both read GET conversations (surface-data.ts); the Inbox is the
  // subset that waits on a decision, Conversations all of them plus the calls.
  inbox: {
    match: ["inbox", "conversations", "live"],
    tabs: [
      // The same count the sidebar badge, the phone tab, the tab's title and the phone app show: the one number
      // (surfaces/needs-you.ts, read through its hook), handed in by the strip, never a second reading of it.
      // It counts what needs you, so it is amber, as the Needs you pill is (tone.ts warn). None of the three says a tip.
      // Named for the page: the list under it opens on its own Needs you, and the two stood one over the other.
      // Not read before Today has been (needs-you.ts), which every page reads: until then its figure is on its way, and the
      // tab keeps the room of the one it last said, so Conversations and Live hold still as it lands (Ruben, 28 Nov 2026).
      {
        id: "inbox",
        label: "Inbox",
        to: "inbox",
        tone: "warn",
        badge: (needs) => needs || null,
        coming: ({ needs, dayFailed }) => needs === null && !dayFailed,
      },
      { id: "conversations", label: "Conversations", to: "conversations" },
      // With the bridge running the pulse is the real thing: a call in progress under the heartbeat rule, so the tab does
      // not pulse for a phantom the page has already dropped.
      { id: "live", label: "Live", to: "live", pulse: liveNow },
    ],
  },
  // Campaigns is one page, its home, and Sent and the Library are its rooms: the three-tab strip went on 3 Oct 2026. The
  // demo's own strips (Content's, and the Agents pages' Fleet, Store, Studio and Tasks) went with demo mode (16 Nov 2026).
};

/** The frame's address as the strip asks it: a route's link, and its reads warmed ahead of a move. */
type StAddress = {
  href?: (route: string) => string;
  warm?: (route: string) => void;
  warmSoon?: (routes: string[]) => void;
};
// What the address says of itself, for the routes a press will move to: warmed once the page is idle and when a pointer or
// a finger reaches a tab, so the move that follows asks the server for nothing (workspace.ts warmRoute).
const stAddress = (): StAddress => CHANLY.address;
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

/** The strip: the kit's ViewTabs. */
const stViewTabs = () => KitViewTabs;

/** A route's group and its tabs: the page's own views where it says more than one, else its group's here. */
const stTabsOf = (page: string, own: SurfaceViews | null): [string | null, readonly StTab[]] => {
  if (own) return [own.name, own.tabs];
  const found = Object.entries(ST_GROUPS).find(([, g]) => g.match.includes(page));
  return found ? [found[0], found[1].tabs] : [null, []];
};

/**
 * Whose strip of views a page stands under, as the frame's head slot says it (shell-chrome.tsx `data-strip`): the page's own
 * views, or its group's (the Inbox's Needs you, Conversations and Live); null where it draws one view or none. Said from the
 * first draw, so the room under the strip is the page's while the page is still read.
 */
export function stripNameOf(page: string, views: SurfaceViews | null | undefined): string | null {
  const [name, tabs] = stTabsOf(page, views && views.tabs.length > 1 ? views : null);
  return tabs.length > 1 ? name : null;
}

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

/** Hear the day's read move, its status with it: a read that failed leaves the count unread, which says nothing new. */
const hearDay = (fn: () => void): (() => void) => onSurfaceMoved(["today"], fn);
/** Whether the day's read failed with none ever in (bridge/surface-status.ts). */
const dayFailedNow = (): boolean => isSurfaceFailed("today");

/** A page's own counts on its tabs (SurfaceViews heard): the strip drawn again as what they count moves. */
function useViewsHeard(views: SurfaceViews | null) {
  const heard = views?.heard;
  const [, stBump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => (heard ? heard(stBump) : undefined), [heard]);
}

interface SurfaceTabsProps {
  page: string;
  param?: string | null;
  views?: SurfaceViews | null;
  onNavigate: (to: string) => void;
}

// Detail views keep their focus: none on a person's profile. A list (seg:, list:) and a state (state:) are views of People
// (the wiring audit's N24). A page that says its own views says none for one.
const stOnAPerson = (page: string, param: string | null | undefined, own: SurfaceViews | null): boolean =>
  !own && page === "clients" && !!param && !/^(seg|list|state):/.test(param);

// `views` is a page that says its own views (surfaces/routes.ts SurfaceViews: People's scopes, Reports' lenses, from its
// chrome): the same strip, drawn here once for every page, whether the views are a group's or the page's own. A page's
// views are its tabs, the one picked is its own to name, and a view is a move to a route like any tab here. While a thumb
// carries a row's page back to the list held under it, the strip is the one drawn over that list (kit/head/standing.ts
// headUnder), so the screen under the page is the one it goes back to: a person's page draws none of its own.
export function SurfaceTabs({ page, param, views, onNavigate }: SurfaceTabsProps) {
  useLiveRedraws();
  const under = useHeadUnder();
  const at: StripAt | null = under ? under.strip : { page, param, views };
  const own = at && at.views && at.views.tabs.length > 1 ? at.views : null;
  useViewsHeard(own);
  // What needs you, drawn again when the number changes and by nothing else (surfaces/needs-you.ts). Not read before the
  // Inbox has been.
  const needs = useNeedsYou();
  // Whether the day's read failed: no count is on its way then, and the Inbox's tab keeps no room for one.
  const dayFailed = useSyncExternalStore(hearDay, dayFailedNow, dayFailedNow);
  const [groupKey, tabs] = at ? stTabsOf(at.page, own) : [null, []];
  // None stood over the list a carried page goes back to, or this is a person's profile.
  const none = !at || stOnAPerson(at.page, at.param, own);
  // A strip drawn only under a carried page warms nothing: its addresses were warmed as it stood.
  const warmRoutes = under ? "" : tabs.map((t) => t.to).join(" ");
  useEffect(() => {
    const a = stAddress();
    if (warmRoutes && a && a.warmSoon) a.warmSoon(warmRoutes.split(" "));
  }, [groupKey, page, warmRoutes]);
  // What it drew, for the head kept as it stands as a row opens over the page (kit motion/held-list.ts).
  useLayoutEffect(() => {
    if (!under) stripShown(tabs.length >= 2 && !none ? { page, param, views } : null);
  });
  if (tabs.length < 2) return null;
  if (none || !at) return null;
  const routeOf = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    return tab ? tab.to : id;
  };
  const Strip = stViewTabs();
  return (
    <Strip
      name={groupKey || ""}
      className="pg-views"
      label={own ? own.label : "Section views"}
      testid={own ? own.testid : undefined}
      picked={own ? own.picked : at.page}
      // The figures a strip's tabs last said, remembered for the workspace the address names (the kit's kept-room.ts).
      kept={`${getActiveWorkspace() ?? ""}/${groupKey || ""}`}
      tabs={tabs.map((t: StTab) => ({
        id: t.id,
        label: t.label,
        href: stHref(t.to),
        count: t.badge ? t.badge(needs) : null,
        coming: !!t.coming && t.coming({ needs, dayFailed, readsAhead: warmsOnItsOwn() }),
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

/** Which of People's scopes an address of `clients` is: Leads, the Pipeline, or the list itself (a list, a state). */
const peopleScopeRoute = (param: string | null | undefined) => {
  if (param && /^leads(:|$)/.test(param)) return "clients/leads";
  if (param && /^pipeline(:|$)/.test(param)) return "clients/pipeline";
  return !param || /^(seg|list|state):/.test(param) ? "clients" : null;
};

const peoplePlace = (param: string | null | undefined): StripPlace | null => {
  const people = provided("peopleScopes");
  const scopes = people?.list;
  const routeOfScope = people?.routeOf;
  if (!scopes || !routeOfScope) return null;
  const route = peopleScopeRoute(param);
  const at = route
    ? scopes()
        .map((s) => routeOfScope(s.id))
        .indexOf(route)
    : -1;
  return at < 0 ? null : { strip: "people", at };
};

/** Where an address of Campaigns stands along its strip: Ads last, Content before it, every other view first. */
const campaignsPlace = (param: string | null | undefined): number => {
  if (param && /^ads(:|$)/.test(param)) return 2;
  return param && /^content(:|$)/.test(param) ? 1 : 0;
};

export const stripPlace = (page: string, param?: string | null): StripPlace | null => {
  if (page === "clients") return peoplePlace(param);
  // Campaigns' own views (its chrome's, surfaces/campaigns/routes.ts): Messages, the home and its addresses, then Content
  // (every workspace's, decision 0125), then Ads where it is drawn.
  if (page === "campaigns") return { strip: "campaigns", at: campaignsPlace(param) };
  const found = Object.entries(ST_GROUPS).find(([key, g]) => key !== "people" && g.match.includes(page));
  if (!found) return null;
  const at = found[1].tabs.findIndex((t) => t.id === page);
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
export const stripSwipe = () => touchSwipe({ pages: viewPager, when: stripPhone });

// A strip's page holds its moves from its mount (kit/motion/swipe.ts holdMoves): an iPhone heeds only a listener already
// there as the finger lands, so one added by the touch let the window scroll under a page carried across. The page says
// its strip as it is drawn (data-strip), before its ref is told; a page under no strip makes the browser wait on nothing.
type ViewRef = (el: HTMLElement | null) => void;
const holdStrip: ViewRef = (el) => {
  if (el && el.dataset && el.dataset.strip) holdMoves(el);
};
const stripRefs = new WeakMap<ViewRef, ViewRef>();
/** The ref the frame's page is drawn with: the deck's, the same each draw, or React would let the deck go and take it back. */
export const stripViewRef = (deckRef: ViewRef | null): ViewRef => {
  if (!deckRef) return holdStrip;
  let ref = stripRefs.get(deckRef);
  if (!ref) {
    ref = (el) => {
      deckRef(el);
      holdStrip(el);
    };
    stripRefs.set(deckRef, ref);
  }
  return ref;
};
