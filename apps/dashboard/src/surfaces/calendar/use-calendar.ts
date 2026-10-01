/**
 * What the board keeps and what it does while it is open (moved from legacy/pages/calendar.jsx CalendarReal, decision 0015),
 * as hooks the page calls in the order the JSX called them: the state, then the effects. A hook is a function the page
 * calls, never a component, so the cells stay the page's.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { CalendarVM, CalendarView } from "@chanlytics/contracts";
import { askOnScreenKey, setAskOnScreen, useLegacyToast } from "../legacy-verbs";
import { crPhone, crTyping } from "./board-dom";
import { calendar } from "./verbs";
import { CR_OVERLAY, CR_REFRESH_MS } from "./words";

type Span = { from: string; days: number };

/** The view and the day it looks at, and everything else the page keeps: the open appointment, a read on its way, the service picked. */
export function useCalendarState(initialDay: string | null) {
  // A link can name a day (calendar/<YYYY-MM-DD>), which opens in Day view; a phone opens on the agenda.
  const [view, setView] = useState<CalendarView>(() => (initialDay ? "day" : crPhone() ? "agenda" : "week"));
  const [anchorKey, setAnchorKey] = useState<string | null>(initialDay);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The span a read failed for: while it is the one on screen, its days say so, with a Retry.
  const [failedSpan, setFailedSpan] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  // The owner's Refresh on its way (C2): its button says so, and a second press waits for it.
  const [refreshing, setRefreshing] = useState(false);
  // The hours, the booking rules and the calendar's source wait under the board until asked for.
  const [aboutOpen, setAboutOpen] = useState(false);
  // Hours and rules open under the board, where a phone has scrolled them out of sight: opening brings them into view,
  // smoothly, and closing folds them away while the page glides back up with them (calendar.css), never a blank left
  // at the foot. It held still before (data-bits holdStill), so the panel opened below the screen and, closed, left the
  // room it had taken under everything (Ruben, 24 Sep).
  const aboutRef = useRef<HTMLDivElement>(null);
  const [toastNode, flash] = useLegacyToast();
  // A second door to a day while the page is open moves it there.
  useEffect(() => {
    if (initialDay) {
      setAnchorKey(initialDay);
      setView("day");
    }
  }, [initialDay]);
  return {
    view,
    setView,
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
    aboutOpen,
    setAboutOpen,
    aboutRef,
    toastNode,
    flash,
  };
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

/** What the latest draw left for the one key listener: whether an appointment is open, and how to move and to close it. */
interface BoardKeys {
  open: boolean;
  move: (n: number) => void;
  today: () => void;
  close: () => void;
}

/**
 * ← → move, T is today, unless the person is typing, or an appointment is open: the board holds still behind the dialog,
 * and Escape closes it. One listener for the page's life, reading what the latest render left in `keys`; it was added and
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
        if (e.key === "Escape") {
          e.preventDefault();
          k.close();
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
