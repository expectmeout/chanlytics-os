/**
 * What the board keeps and what it does while it is open (moved from legacy/pages/calendar.jsx CalendarReal, decision 0015),
 * as hooks the page calls in the order the JSX called them: the state, then the effects. A hook is a function the page
 * calls, never a component, so the cells stay the page's.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { MIN_MS } from "@chanlytics/contracts";
import {
  visitRoute,
  type CalendarBlockVM,
  type CalendarDayVM,
  type CalendarVM,
  type CalendarView,
} from "@chanlytics/contracts";
import { askOnScreenKey, demoSession, navigate, replaceRoute, setAskOnScreen, useLegacyToast } from "../legacy-verbs";
import { calendarPlaceRoute, keepCalendarView } from "./address";
import { crTyping } from "./board-dom";
import { calendar } from "./verbs";
import { CR_OVERLAY, CR_REFRESH_MS, CR_WARM_MS } from "./words";

type Span = { from: string; days: number };

/** What Show draws over the visits, which are always drawn: the open times, the campaigns, and cold email. */
export interface CalendarShow {
  open: boolean;
  campaigns: boolean;
  cold: boolean;
}

/** Show as it opens for a member who never picked (D2): open times and campaigns on, cold email off. */
const SHOW_DEFAULT: CalendarShow = { open: true, campaigns: true, cold: false };

/** Show as this tab last kept it (tab-memory.ts, its own place, never the view's), else the default. */
function keptShow(): CalendarShow {
  const mem = typeof window === "undefined" ? undefined : window.__tabMemory;
  const was = mem?.place("calendar", "show");
  const on = (k: keyof CalendarShow) => (typeof was?.[k] === "boolean" ? was[k] : SHOW_DEFAULT[k]);
  return { open: on("open"), campaigns: on("campaigns"), cold: on("cold") };
}

/**
 * The day the board looks at (the anchor), and everything else the page keeps: the open appointment, a read on its way, the
 * service picked, what Show draws, the day the phone's month has picked, and the sheets of the rules and of a day's
 * campaigns. The view is not kept here: it is the address's (address.ts calendarViewOf), as every strip's view is.
 */
export function useCalendarState(initialDay: string | null) {
  // A link can name a day (calendar/<YYYY-MM-DD>), which the board opens on; a second door to a day while the page is open
  // (a day pressed in the month) moves it there, in the same draw as the address that names it, so Day view never draws
  // the day it was on first.
  const [anchorKey, setAnchorKey] = useState<string | null>(initialDay);
  const [dayWas, setDayWas] = useState<string | null>(initialDay);
  if (initialDay !== dayWas) {
    setDayWas(initialDay);
    if (initialDay) setAnchorKey(initialDay);
  }
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The span a read failed for: while it is the one on screen, its days say so, with a Retry.
  const [failedSpan, setFailedSpan] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  // The owner's Refresh on its way (C2): its button says so, and a second press waits for it.
  const [refreshing, setRefreshing] = useState(false);
  // The hours, the booking rules and the calendar's source: a sheet Settings opens, its one door (D6). They were a fold
  // under the board, and on a phone its foot took the 40px an eleven-hour day needed to fit.
  const [rulesOpen, setRulesOpen] = useState(false);
  // What Show draws, kept for this tab under its own place (never the view's entry).
  const [show, setShowState] = useState<CalendarShow>(keptShow);
  const setShow = (next: CalendarShow) => {
    setShowState(next);
    if (typeof window !== "undefined") window.__tabMemory?.keepPlace("calendar", "show", { ...next });
  };
  // The phone's month (D7): the day picked, whose rows stand under it; null for the anchor's.
  const [monthPick, setMonthPick] = useState<string | null>(null);
  // The day whose campaigns' sheet is open, or null.
  const [runsDay, setRunsDay] = useState<string | null>(null);
  const [toastNode, flash] = useLegacyToast();
  return {
    anchorKey,
    setAnchorKey,
    openId,
    setOpenId,
    pending,
    setPending,
    failedSpan,
    setFailedSpan,
    serviceName,
    setServiceName,
    refreshing,
    setRefreshing,
    rulesOpen,
    setRulesOpen,
    show,
    setShow,
    monthPick,
    setMonthPick,
    runsDay,
    setRunsDay,
    toastNode,
    flash,
  };
}

/**
 * The board's own minute: the moment it draws, again at each minute's turn and whenever the tab comes back, so a block's
 * phase, its word ("Not marked yet" once it ends) and the now line follow the clock between the five-minute reads. One
 * clock for the board, where three read it apart (the view model's `now`, Date.now() in a block, the read's own).
 */
export function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, MIN_MS - (Date.now() % MIN_MS) + 50);
    };
    timer = setTimeout(tick, MIN_MS - (Date.now() % MIN_MS) + 50);
    const back = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, []);
  return now;
}

/** A view the address names by its word is a pick (a tab of the strip, or Back to one): kept for a refresh or a trip away. */
export function useKeptView(named: CalendarView | null): void {
  useEffect(() => {
    if (named) keepCalendarView(named);
  }, [named]);
}

/** What the visit's address is held to: what the address names, where the board stands, and the open block. */
interface VisitAddressAsk {
  /** The visit the address names (the id of its row in the record), or null. */
  visitId: string | null;
  /** The view drawn, and the day it looks at (the anchor): what a visit opened on the board names beside it. */
  view: CalendarView;
  anchor: string;
  /** The day the address named, which a panel opened from a link closes back to. */
  day: string | null;
  days: readonly CalendarDayVM[];
  /** The days the view needs are loaded and no read of them is on its way. */
  covered: boolean;
  /** When the read the board draws landed (CalendarSurface.fetchedAt). */
  fetchedAt: number;
  setOpenId: (blockId: string | null) => void;
}

/**
 * The visit open and the address agree (decision 0047: a record has one address, and a refresh or a copied link reopens
 * it). A link that names a visit (`calendar/<day>:a-<id>`, contracts visitRoute) opens its panel as well as its day: once
 * for each visit it names, as soon as the board has drawn the block. The block is found by the id of the visit's row in the
 * record (`block.visit.id`); a block's own id is the feed's key or `appt:<id>`, which no link carries. A visit the days
 * drawn do not hold, once a read that landed after the address named it has the days it needs (`fetchedAt`: a window the
 * tab held paints at once and is older than the ask, and the read behind it may well hold a visit it lacks), is no visit
 * this board has (a row deleted, a day outside what the address named), and the page stays as the day alone is.
 *
 * A press on a block with a row pushes its address, naming the view and the day the board looks at, so the week stays the
 * week behind the panel and Back closes it; a walk to the next visit replaces it; closing goes back past the push, or,
 * for a panel a link opened, replaces the address with the place the board stands. An address that stops naming the
 * visit (Back, a tab of the strip) closes its panel. A block with no row in the record (an event the sync keeps no row
 * for) has no address to say: its panel is the page's own, and nothing is pushed; opened over a visit's panel (a walk, a
 * press), it takes the visit out of the address, so a refresh never reopens the visit it left.
 */
export function useVisitAddress(p: VisitAddressAsk) {
  const { visitId, days, setOpenId } = p;
  const asked = useRef<{ id: string | null; at: number; done: boolean }>({ id: null, at: Date.now(), done: false });
  const pushed = useRef(false);
  // Closed already, by one of the ways a sheet closes: the kit's Escape and the board's can both ask in one press.
  const shut = useRef(false);
  // The address let go of a visit for a block with no row opened over it: that block's panel stays open, on the entry the
  // board pushed, which a walk on replaces and a close goes back past.
  const keep = useRef(false);
  useEffect(() => {
    const was = asked.current;
    if (was.id !== visitId) {
      asked.current = { id: visitId, at: Date.now(), done: false };
      if (!visitId) {
        if (!keep.current) {
          pushed.current = false;
          if (was.id) setOpenId(null);
        }
        keep.current = false;
        return;
      }
    }
    const now = asked.current;
    if (!visitId || now.done) return;
    const block = days.flatMap((d) => [...d.allDay, ...d.blocks]).find((b) => b.visit?.id === visitId);
    if (block) {
      now.done = true;
      shut.current = false;
      setOpenId(block.id);
    } else if (p.covered && p.fetchedAt >= now.at) now.done = true;
  }, [visitId, days, p.covered, p.fetchedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Open a block's panel: its address pushed, or replaced when a visit's panel is already the address's. */
  const open = (b: CalendarBlockVM) => {
    shut.current = false;
    setOpenId(b.id);
    const id = b.visit?.id;
    if (!id) {
      // A block with no row has no address; one opened over a visit's (a walk, a press) drops that visit's, so a refresh
      // or a copied link never opens the visit it left.
      if (visitId) {
        keep.current = true;
        replaceRoute(calendarPlaceRoute(p.view, p.day ?? p.anchor));
      }
      return;
    }
    // A day is Day's own address, the block's; any other view names the day it looks at, so a refresh draws the same days.
    const dayKey = days.find((d) => d.blocks.some((x) => x.id === b.id) || d.allDay.some((x) => x.id === b.id))?.key;
    const to = visitRoute(id, p.view === "day" ? (dayKey ?? p.anchor) : p.anchor, p.view);
    if (visitId || pushed.current) replaceRoute(to);
    else {
      pushed.current = true;
      navigate(to);
    }
  };
  /** Close the panel: back past the push that opened it, else the place the board stands, the visit dropped. */
  const close = () => {
    if (shut.current) return;
    shut.current = true;
    setOpenId(null);
    if (pushed.current && typeof window !== "undefined" && window.history) {
      pushed.current = false;
      window.history.back();
    } else if (visitId) replaceRoute(calendarPlaceRoute(p.view, p.day));
  };
  return { open, close };
}

/** What Ask is told is on screen (legacy-bridge/ask/context.ts): the span drawn and the people its appointments name, in the board's order, forty at most. */
function useAskOnScreen(span: Span, vm: CalendarVM) {
  useEffect(() => {
    const at = vm.days.findIndex((d) => d.key === span.from);
    const days = at >= 0 ? vm.days.slice(at, at + span.days) : [];
    const named = new Map<string, string>();
    for (const d of days)
      for (const b of [...(d.allDay || []), ...(d.blocks || [])])
        if (b.person && !named.has(b.person.id)) named.set(b.person.id, b.person.name || "");
    const ids = [...named.keys()].slice(0, 40);
    setAskOnScreen({
      key: "calendar",
      ids,
      labels: ids.map((id) => named.get(id)),
      view: `${span.from}/${span.days}`,
    });
    // Taken back when the board goes: its people are no longer on screen.
    return () => {
      if (askOnScreenKey() === "calendar") setAskOnScreen(null);
    };
  });
}

/** What the window read is asked for: the view, its anchor, whether the loaded days cover it, and how a landed read is said. */
interface ReadAsk {
  view: CalendarView;
  anchor: string;
  covered: boolean;
  spanKey: string;
  setPending: (on: boolean) => void;
  setFailedSpan: (span: string | null) => void;
}

/**
 * Read only when the window does not cover the view. The frames already have their shape, so nothing jumps when the read
 * lands. A read that fails names its span, and those days say so with a Retry; a toast said it once and faded, over days
 * still dimmed as if loading.
 */
function useWindowRead(p: ReadAsk) {
  const { view, anchor, covered, spanKey, setPending, setFailedSpan } = p;
  const readSeq = useRef(0);
  const read = () => {
    const mine = ++readSeq.current;
    const land = (ok: boolean) => {
      if (mine !== readSeq.current) return;
      setPending(false);
      setFailedSpan(ok ? null : spanKey);
    };
    setPending(true);
    calendar.ensure(view, anchor).then(
      (ok) => {
        land(ok);
      },
      () => land(false),
    );
  };
  useEffect(() => {
    if (covered) {
      setPending(false);
      return undefined;
    }
    read();
    return () => {
      readSeq.current += 1;
    };
  }, [view, anchor, covered]); // eslint-disable-line react-hooks/exhaustive-deps
  return read;
}

/**
 * Once the board has stood still on a view for a second with the days it needs, the windows a few moves on that the loaded
 * weeks do not cover are read and held (warm.ts), so stepping to them paints at once. A demo has no calendar to read.
 */
function useWarmAhead(p: ReadAsk & { vm: CalendarVM }) {
  const { view, anchor, covered, vm } = p;
  useEffect(() => {
    if (!covered || demoSession()) return undefined;
    const id = setTimeout(() => calendar.warmAround(view, anchor), CR_WARM_MS);
    return () => clearTimeout(id);
  }, [view, anchor, covered, vm.days]);
}

/** What the latest draw left for the one key listener: whether an appointment is open, and how to move, walk and close. */
interface BoardKeys {
  open: boolean;
  move: (n: number) => void;
  today: () => void;
  close: () => void;
  /** The desk's peek walks the day's visits (J and K); none on a phone, whose sheet is modal. */
  walk: ((n: number) => void) | null;
}

/**
 * ← → move, T is today, unless the person is typing, or an appointment is open: the board holds still behind it, and on a
 * desk Escape closes the peek and J and K walk the day's visits. One listener for the page's life, reading what the latest render left in `keys`; it was added and
 * removed again on every render.
 */
function useBoardKeys(): RefObject<BoardKeys | null> {
  const keys = useRef<BoardKeys | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      // A key something took before the window heard it (a group of choices in the deal sheet) is not the board's.
      if (!k || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || crTyping()) return;
      if (k.open) {
        // The phone's sheet is the kit's, which closes on its own Escape; the desk's peek is the board's, and walks,
        // unless something is open over it (its More), which has the keys.
        if (!k.walk || ("querySelector" in document && document.querySelector(CR_OVERLAY))) return;
        if (e.key === "Escape") {
          e.preventDefault();
          k.close();
        } else if (e.key === "j" || e.key === "J" || e.key === "k" || e.key === "K") {
          e.preventDefault();
          k.walk(e.key.toLowerCase() === "j" ? 1 : -1);
        }
        return;
      }
      // Anything else open over the page has the keys, the deal sheet among them: ←, → and T moved the board behind it.
      if ("querySelector" in document && document.querySelector(CR_OVERLAY)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        k.move(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        k.move(1);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        k.today();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return keys;
}

/**
 * What the board does while it is open, and when it goes. The Ask note, the read the window lacks, the five-minute clock, the
 * keys, and the way home: leaving the page takes the loaded weeks back to today's (Today's day and its next open time read
 * the same surface, and a board left on another month took them with it, C1).
 */
export function useBoardEffects(p: ReadAsk & { span: Span; vm: CalendarVM }) {
  useAskOnScreen(p.span, p.vm);
  const read = useWindowRead(p);
  useWarmAhead(p);
  // The board keeps itself current while it is open: every five minutes, in a visible tab, the loaded window is read
  // again, so the now line, the next open time and the open times follow the clock.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void calendar.refresh();
    }, CR_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const keys = useBoardKeys();
  useEffect(
    () => () => {
      void calendar.home();
    },
    [],
  );
  return { read, keys };
}
