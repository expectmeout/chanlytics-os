/**
 * The frame's hooks (moved from legacy/pages/app-shell.jsx, the one-system plan's step 7e). Each holds one concern of
 * ChanlyticsApp and the state its effects set, called in the order the frame always called them, so the effects run in
 * the order they always ran.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { watchKeyboard } from "../kit/motion/keyboard";
import { frameChrome, frameShell, frameSurfaceState, fromWindow, isDemoFrame } from "./frame-window";
import { parseRoute, routeFailed, routeReady, shellAddress, type RouteAt, type ShellRoute } from "./shell-routes";
import { stripPlace, stripSlide } from "./surface-tabs";

type SetRoute = Dispatch<SetStateAction<ShellRoute>>;
type SetTick = Dispatch<SetStateAction<number>>;

/** How long the reading pane may stand before it times out INTO the unavailable pane, never into the mockup's seeds. */
const ROUTE_UNAVAILABLE_MS = 8000;
/** A band beside the page is waited for this long once the page's own surface is in, where the registry says nothing. */
const ROUTE_WAIT_FALLBACK_MS = 3000;
/** Where the sidebar stands beside the page. */
const DESK_MIN_PX = 900;
/** A small desk: over the phone's drawer, and at or under tokens.css --bp-desk. */
const SMALL_DESK_QUERY = "(width > 900px) and (width <= 1280px)";

/**
 * Where the sidebar stands, as the frame draws it: the member's kept choice on a wide desk, and on a small one its rail
 * until they open it for this visit, so the page keeps its room. At 1024px the open sidebar left the Inbox's thread 348px
 * beside its 360px list, and People's table showed half its columns. A press there is the visit's and is not kept, so
 * their choice for a wide desk stands.
 */
export function useDeskSidebar(sidebar: string, onSidebar: (v: string) => void) {
  const smallDesk = () => typeof window.matchMedia === "function" && window.matchMedia(SMALL_DESK_QUERY).matches;
  const [small, setSmall] = useState(smallDesk);
  const [here, setHere] = useState("rail");
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const list = window.matchMedia(SMALL_DESK_QUERY);
    const hear = () => setSmall(list.matches);
    list.addEventListener("change", hear);
    return () => list.removeEventListener("change", hear);
  }, []);
  const choose = useCallback((v: string) => (small ? setHere(v) : onSidebar(v)), [small, onSidebar]);
  return { sidebar: small ? here : sidebar, onSidebar: choose };
}

/**
 * What needs you, for the sidebar's and the phone bar's count and the tab's title: the one number every surface says
 * (surfaces/needs-you.ts, `window.useNeedsYou`, drawn again when it changes). Nothing before the Inbox has been read, and
 * nothing in the standalone mockup's stub, which has no threads to count.
 */
export const useInboxNeeds = () => (window.useNeedsYou ? window.useNeedsYou() : 0) || 0;

/**
 * The route gate and the honesty gate, for the route on screen. Only the escape hatches are state: readiness itself is
 * DERIVED during render (storing it committed a new page with the previous route's value for one frame). Each hatch is
 * keyed on the route it was armed for: the unavailable timeout, and the wait for a band beside the page. `arm()` is what
 * the frame runs as the route changes, and returns what undoes it.
 *
 * The honesty gate: one interception, every route. The registry classifies each surface real or demo (`__surfaceState`);
 * a demo surface renders only in a session that declared itself one, and elsewhere the route table's landing stands
 * (route-table.tsx routeGated). The standalone mockup has no registry, and everything renders there.
 */
export function useRouteGate({ page, param, routeKey }: RouteAt) {
  const [timedOutKey, setTimedOutKey] = useState<string | null>(null);
  const [waitedOutKey, setWaitedOutKey] = useState<string | null>(null);
  const [readyTick, setReadyTick] = useState(0);
  const arm = () => {
    if (routeReady(page, param)) return undefined;
    // The wait for a band beside the page counts from the page's own surface landing, not from arriving.
    let w: ReturnType<typeof setTimeout> | null = null;
    const armWait = () => {
      if (w === null && routeReady(page, param, true))
        w = setTimeout(() => setWaitedOutKey(routeKey), window.__routeWaitMs || ROUTE_WAIT_FALLBACK_MS);
    };
    // Drawn again when this route's readiness changes, and only then; the render below reads the truth.
    const readiness = () => `${routeReady(page, param)}|${routeReady(page, param, true)}|${routeFailed(page, param)}`;
    let was = readiness();
    const off = window.__onSurfaceReady
      ? window.__onSurfaceReady(() => {
          const now = readiness();
          if (now !== was) {
            was = now;
            setReadyTick((n) => n + 1);
          }
          armWait();
        })
      : null;
    armWait();
    const t = setTimeout(() => setTimedOutKey(routeKey), ROUTE_UNAVAILABLE_MS);
    return () => {
      if (off) off();
      clearTimeout(t);
      if (w !== null) clearTimeout(w);
    };
  };
  // Derived every render, so a navigation can never commit the previous route's answer. readyTick is read so the
  // subscription re-evaluates it.
  void readyTick;
  const routeWaitedOut = waitedOutKey === routeKey;
  // A band the page waits for beside its own surface (Today's setup, above its queue) holds the first draw so it never lands
  // above content already drawn; once the page's own surface is in, only for so long.
  const surfaceReady = routeReady(page, param) || (routeWaitedOut && routeReady(page, param, true));
  const surfaceUnavailable = !surfaceReady && (routeFailed(page, param) || timedOutKey === routeKey);
  const routeLoading = !surfaceReady && !surfaceUnavailable;
  const surfaceState = frameSurfaceState();
  const demoGated = !isDemoFrame() && !!surfaceState && surfaceState(page, param) === "demo";
  return { demoGated, routeLoading, surfaceUnavailable, arm, setReadyTick };
}

// One page, whatever its tab: `clients/<id>` and `clients/<id>/history` are one person (0052, a person's tabs are addresses).
const shellSamePage = (a: string, b: string) =>
  String(a).split("/").slice(0, 2).join("/") === String(b).split("/").slice(0, 2).join("/");

type Move = (to: string, opts?: { replace?: boolean }) => void;

/**
 * The frame's two ways of moving. A navigation is a new entry. `{ replace: true }` is a page saying the same place more
 * exactly (the lead a peek walked on to), so it makes none, and no one else is told; the route is read here, at once.
 * The last entry this frame pushed and the route it was pushed from are kept here, never in history.state (Next's router
 * reloads the app on a Back to an entry whose state it did not write), so a page's own Back returns where the member was.
 */
export function useShellNavigate(setRoute: SetRoute) {
  const lastPush = useRef<{ to: string; from: string } | null>(null);
  const navigate: Move = useCallback(
    (to, opts) => {
      const address = shellAddress();
      if (opts && opts.replace) {
        // A replaced entry is the same entry: a person's page stepping to the next person (0052) keeps Back to the list.
        const p = lastPush.current;
        if (p && shellSamePage(p.to, address.route())) p.to = to;
        address.go(to, { replace: true, quiet: true });
        setRoute(parseRoute());
        return;
      }
      lastPush.current = { to, from: address.route() };
      address.go(to);
    },
    [setRoute],
  );
  // A page's Back to where it was opened from (`from`, any place by default), by the browser's own Back, so that place comes
  // with it; reached any other way (a link, a reload, Back from somewhere else) it goes `home`.
  const backFrom = useCallback(
    (home: string, from: RegExp = /^/, opts?: { replace?: boolean }) => {
      const p = lastPush.current;
      if (
        p &&
        shellSamePage(p.to, shellAddress().route()) &&
        from.test(p.from) &&
        window.history &&
        window.history.back
      )
        window.history.back();
      else navigate(home, opts);
    },
    [navigate],
  );
  const backToPeople = useCallback(() => backFrom("clients", /^clients(?:$|[/:])/), [backFrom]);
  return { navigate, backToPeople, backFrom };
}

/**
 * The address, followed: its route, the phone's keyboard, and a person's crumb once People lands. `follows`: the frame
 * hears the address itself only where nobody hands it the route (the standalone mockup, a test); in the app the route is
 * the router's (ChanlyticsApp's `routeNow`).
 */
export function useShellRouting({
  route,
  setRoute,
  setReadyTick,
  follows,
}: {
  route: ShellRoute;
  setRoute: SetRoute;
  setReadyTick: SetTick;
  follows: boolean;
}) {
  useEffect(() => (follows ? shellAddress().hear(() => setRoute(parseRoute())) : undefined), [follows, setRoute]);
  // What a phone's keyboard covers, as --kb, for Ask's screen and every sheet (kit/motion/keyboard.ts watchKeyboard).
  useEffect(() => {
    const watch = fromWindow<typeof watchKeyboard | null>("watchKeyboard", null);
    return watch ? watch() : undefined;
  }, []);
  // A person's page opens before People's rows land (it reads its own person), and its crumb and the tab's name come from
  // their row: drawn again when the rows do, once. Asked with what this draw saw, so rows that landed between the draw and
  // this effect draw it again too.
  const peopleAtDraw = !!window.__PEOPLE;
  useEffect(() => {
    if (route.page !== "clients" || !route.param || peopleAtDraw) return undefined;
    const again = () => setReadyTick((n) => n + 1);
    if (window.__PEOPLE) {
      again();
      return undefined;
    }
    window.addEventListener("surface:clients", again, { once: true });
    return () => window.removeEventListener("surface:clients", again);
  }, [route.page, route.param, peopleAtDraw, setReadyTick]);
}

/** ⌘B folds the sidebar to a rail on a desk; ⌘1–9 switch workspaces where there is more than one. Never while typing. */
const railAndWorkspaceKey =
  (sidebar: string, onSidebar: (v: string) => void) =>
  (e: KeyboardEvent): void => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const chrome = frameChrome();
    if (chrome && chrome.typing(e.target)) return;
    if (e.key === "b") {
      if (window.innerWidth > DESK_MIN_PX) {
        e.preventDefault();
        onSidebar(sidebar === "rail" ? "open" : "rail");
      }
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= 9) {
      const all = window.__WORKSPACES || [];
      const shell = frameShell();
      const ws = all.at(n - 1);
      if (all.length > 1 && ws && shell) {
        e.preventDefault();
        shell.switchWorkspace(ws.id);
      }
    }
  };

/** The frame's keys: ⌘K opens Ask; ⌘B folds the sidebar; ⌘1–9 switch workspaces. */
export function useShellKeys({
  setAskOpen,
  sidebar,
  onSidebar,
}: {
  setAskOpen: Dispatch<SetStateAction<boolean>>;
  sidebar: string;
  onSidebar: (v: string) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setAskOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setAskOpen]);
  useEffect(() => {
    const handler = railAndWorkspaceKey(sidebar, onSidebar);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sidebar, onSidebar]);
}

/**
 * The page on screen back to its top: whatever scrolls in it, the route view itself (Today), the list a page of panes
 * scrolls in, or on a phone the window. The tab bar's place pressed again, and the phone app's tab (shell:top).
 */
export const pageToTop = () => {
  const main = document.getElementById("main");
  if (!main) return;
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = still ? "auto" : "smooth";
  for (const el of [main, ...Array.from(main.querySelectorAll("*"))]) {
    if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior });
  }
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior });
};

// Where the phone's drawer goes that its tab bar does not, as its items go there: Settings is `admin`, whose page opens on
// its first pane itself.
const DRAWER_ONLY = ["campaigns", "reports", "admin"];

/** The drawer, open: the pages only it leads to warmed, Escape closes, the body's scroll locked, a desk's width closes. */
const drawerOpenEffect = (setNavOpen: (open: boolean) => void) => {
  const address = shellAddress();
  if (address && address.warm) DRAWER_ONLY.forEach((route) => address.warm(route));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setNavOpen(false);
  };
  const onResize = () => {
    if (window.innerWidth > DESK_MIN_PX) setNavOpen(false);
  };
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  return () => {
    document.body.style.overflow = prevOverflow;
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
  };
};

/** The phone's drawer: whether it is open, and its flows. Inside the native shell the More tab asks for it. */
export function useNavDrawer() {
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    const onMenu = () => setNavOpen(true);
    const onTop = pageToTop;
    window.addEventListener("shell:menu", onMenu);
    window.addEventListener("shell:top", onTop);
    return () => {
      window.removeEventListener("shell:menu", onMenu);
      window.removeEventListener("shell:top", onTop);
    };
  }, []);
  useEffect(() => (navOpen ? drawerOpenEffect(setNavOpen) : undefined), [navOpen]);
  return { navOpen, setNavOpen };
}

/**
 * Retired surfaces and moved panes (retiredTo, resolved with the route): a real workspace lands where the page is now.
 * And a soon/ link to a page that has shipped: the address becomes the page's own, in place, so Back does not land on the
 * old link again. Replaced, so Back never lands on an address that only moves again.
 */
export function useRouteMoves({ retiredTo, soonState, raw }: RouteAt) {
  useEffect(() => {
    if (retiredTo) shellAddress().go(retiredTo, { replace: true });
  }, [retiredTo]);
  useEffect(() => {
    if (soonState === "real" && raw.param) shellAddress().go(raw.param, { replace: true });
  }, [soonState, raw.param]);
}

/**
 * The tab says where this is, most particular first, and counts what needs you (contracts chrome.ts pageTitle): named from
 * the crumbs the top bar draws, after the honesty gate. Kept, not only written: the layout's own title can land after this.
 */
export function useTabTitle(crumbs: readonly unknown[], inboxNeeds: number) {
  const chrome = frameChrome();
  const tabTitle =
    chrome && chrome.title ? chrome.title(crumbs as Parameters<typeof chrome.title>[0], inboxNeeds) : null;
  useEffect(() => {
    if (!tabTitle) return undefined;
    const shell = frameShell();
    if (shell && shell.keepTitle) return shell.keepTitle(tabTitle);
    document.title = tabTitle;
    return undefined;
  }, [tabTitle]);
}

/**
 * Where a person is taken to the page: its first heading, else the page region itself (the `main` landmark, focusable so
 * it can hold focus). `always` for the skip link, which is asked for; otherwise never from where the person is already
 * working inside the page.
 */
export const focusPage = (always: boolean) => {
  const main = document.getElementById ? document.getElementById("main") : null;
  if (!main) return;
  const at = document.activeElement;
  if (!always && at && at !== document.body && main.contains(at)) return;
  const heading = main.querySelector<HTMLElement>('h1, h2, [role="heading"]');
  const target = heading || main;
  if (target.getAttribute("tabindex") === null) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
};

/**
 * A move to another page moves focus to it, as a page load does, once the page has drawn and not for the first page the
 * tab opened on. A move within a page (a thread opened in the Inbox, a peek, a pane) changes the address, not the page.
 */
export function usePageFocus(page: string, routeLoading: boolean) {
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (routeLoading || handled.current === page) return;
    const first = handled.current === null;
    handled.current = page;
    if (!first) focusPage(false);
  }, [page, routeLoading, handled]);
}

// How long after the tab bar asks for a place the view that arrives is still its move, and cut in: the tab's own wait.
const PLACE_CUT_MS = 3000;

type Place = ReturnType<typeof stripPlace>;
interface ViewState {
  key: string | null;
  page: string | null;
  reading: boolean;
  stay: boolean;
  landed: boolean;
  place: Place;
  slide: "next" | "prev" | null;
}

/**
 * How the route view comes in. A move between two views of one strip arrives from the side its tab stands on, by the deck
 * every change of view moves by (kit/motion/view-deck.ts): the view says which side (`data-slide`). A view that follows
 * another of the same page and is no strip's move draws at once; a page landing where the reading pane stood, or
 * arriving from somewhere else, fades in (components.css route-in). A place the phone's tab bar moved to is cut in.
 * Every address of People is one view (its chrome's one mount): a person's page is drawn over the list by People's page,
 * which brings it in (people-route.tsx).
 * Decided as the view changes, in the draw that mounts it, and kept for that view's life. `mountKey` is the route table's.
 */
export function useViewFade(
  route: ShellRoute,
  mountKey: string,
  routeLoading: boolean,
  placed: RefObject<number | null>,
) {
  const { page, param } = route;
  const place = fromWindow("stripPlace", stripPlace)(page, param);
  const viewRef = useRef<ViewState>({
    key: null,
    page: null,
    reading: false,
    stay: false,
    landed: false,
    place: null,
    slide: null,
  });
  const onStrip = !!place && !!viewRef.current.place && viewRef.current.place.strip === place.strip;
  // People keeps its three scopes mounted (people-route.tsx): a scope still reading is the page's to say, never the frame's,
  // from the first draw that lands on one. The frame's reading view stood one draw on a cold load, and the page drawn in
  // its place said nothing until its read was in: "Reading…", then nothing for 100 to 160 ms, then the list (the People
  // load review, 28 Oct 2026). A person's page is no scope: it waits for who is looking under the frame's (registry
  // routeSurfaceFor).
  const inPlace = page === "clients" && !!place;
  const viewKey = routeLoading && !onStrip && !inPlace ? `${mountKey}/reading` : mountKey;
  if (viewRef.current.key !== viewKey) {
    const prev = viewRef.current;
    const slide = prev.key !== null && !prev.reading ? fromWindow("stripSlide", stripSlide)(prev.place, place) : null;
    // The tab bar's move, taken by the first view to arrive after it, if it arrived while the move is still the last ask.
    const cut = placed.current !== null && performance.now() - placed.current < PLACE_CUT_MS;
    placed.current = null;
    viewRef.current = {
      key: viewKey,
      page,
      reading: routeLoading && !onStrip && !inPlace,
      place,
      stay: !routeLoading && prev.key !== null && ((prev.page === page && !prev.reading) || cut) && !slide,
      // Landing where its own reading view stood: the page's words fade in, and a head drawn in the view stays as it
      // stood (components.css `data-landed`): Today's greeting faded out and in again as Today was read (31 Oct 2026).
      landed: !routeLoading && prev.reading && prev.page === page,
      slide,
    };
  }
  return {
    viewKey,
    routeStay: viewRef.current.stay,
    routeLanded: viewRef.current.landed,
    routeSlide: viewRef.current.slide,
    routeStrip: place ? place.strip : null,
    readsInPlace: routeLoading && inPlace,
  };
}
