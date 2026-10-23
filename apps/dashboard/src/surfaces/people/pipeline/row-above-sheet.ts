/**
 * On a phone the deal sheet stands over the rows' lower part: the row it is of is brought above it, so the page still says
 * whose deal is open (lit, as the cursor's row is). Where the sheet stands is read from the sheet as it is laid out
 * (sheetTopOf), never assumed, and again as the person lands and the sheet grows. Where the rows end before the row can
 * rise that far (a view of a few deals), the scroller is given the difference as room at its foot, as a switch holding
 * still is (kit/motion/hold-still.ts), until the sheet closes.
 *
 * As the sheet closes over the rows (Back, its Close, a pull down, with the deal moved on or not), the rows go back down by
 * what they were lifted, to where they stood as it opened. Left lifted, the Pipeline stood a lift's height down once the
 * sheet had gone, its controls and search under the frame's top, and its place kept that for every arrival and refresh
 * after (Ruben, 22 Oct 2026). While the lift stands the place is kept where the reader had left the rows
 * (kit/motion/page-scroll.ts scrollMade), and a place put back under it (a sheet its address opens, a reload) lifts the
 * row again from there (placeReader), and is given back there.
 * A sheet the person's page took the screen from (the scope kept out of sight under them, and held where it stood,
 * kit/motion/held-list.ts) keeps its lift for the close that ends it.
 */
import { useEffect, useRef } from "react";
import { inHeldList, scrollerOf, scrollGivenBack, scrollMade } from "../../kit/motion/page-scroll";

/** The room left over a row brought above the sheet, so it does not sit on the sheet's edge. */
const ROW_CLEAR_PX = 12;

/** The room a phone's sheet gave the rows' scroller at its foot: the scroller, its padding before, and what was added. */
interface SheetRoom {
  box: HTMLElement;
  inline: string;
  own: number;
  extra: number;
}

/**
 * The rows lifted for an open sheet: the box that scrolls them and where it stood before the first lift, the row of the
 * deal open now, the Pipeline's scope they are drawn in (a row moved on by the sheet is drawn again, or folded away, and the
 * scope stays), and the sheet.
 */
interface Lift {
  box: HTMLElement;
  from: number;
  rowId: string;
  scope: Element;
  sheet: HTMLElement;
}

/**
 * Where a phone's sheet's top stands once its height has settled: its foot is the screen's, and its height what it holds
 * up to its cap. Read as laid out (a transform aside), never mid-glide, since the sheet grows as the person lands.
 */
function sheetTopOf(sheet: HTMLElement): number {
  const cap = parseFloat(getComputedStyle(sheet).maxHeight);
  const tall = Math.min(sheet.scrollHeight, Number.isFinite(cap) ? cap : sheet.scrollHeight);
  return sheet.offsetTop + sheet.offsetHeight - tall;
}

/**
 * The row of the deal as it is drawn: People's scope, kept out of sight beside the Pipeline, draws a row of the same id for
 * the person (`person-<id>`), and it came first and had no box, so nothing was lifted.
 */
function rowDrawn(rowId: string): HTMLElement | null {
  const named = document.querySelectorAll<HTMLElement>(`[id="person-${rowId.replace(/["\\]/g, "\\$&")}"]`);
  return Array.from(named).find((row) => row.getClientRects().length > 0) ?? null;
}

/** The phone's deal sheet as it is drawn now, if it is. */
const sheetNow = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-testid="pipeline-peek"]');

/** Whether the sheet a lift was made for is still drawn: the one it lifted for, or the one it steps aside and back as. */
const sheetDrawn = (was: Lift): boolean => was.sheet.isConnected || sheetNow() !== null;

/** The row of the deal open brought above the sheet, the room it needs given at the rows' foot, and the lift kept. */
function keepRowAboveSheet(rowId: string, room: { current: SheetRoom | null }, lift: { current: Lift | null }): void {
  const row = rowDrawn(rowId);
  const scroller = row ? scrollerOf(row) : null;
  const sheet = sheetNow();
  if (!row || !scroller || !sheet) return;
  const above = sheetTopOf(sheet) - ROW_CLEAR_PX;
  const under = row.getBoundingClientRect().bottom - above;
  if (lift.current && lift.current.box === scroller) lift.current.rowId = rowId;
  if (under <= 0) return;
  const short = under - (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
  if (short > 0) {
    const had = room.current && room.current.box === scroller ? room.current : null;
    const r = had ?? {
      box: scroller,
      inline: scroller.style.paddingBottom,
      own: parseFloat(getComputedStyle(scroller).paddingBottom) || 0,
      extra: 0,
    };
    r.extra += Math.ceil(short);
    scroller.style.paddingBottom = `${r.own + r.extra}px`;
    room.current = r;
  }
  // Where the rows stood as the sheet opened: a walk to the next row lifts them on from there, and the close gives it all.
  // The page's place put back under the lift (an address that opened the sheet, a reload) lifts the row again from there.
  if (!lift.current || lift.current.box !== scroller) {
    const scope = row.closest(".pipe-scope") ?? row;
    const was: Lift = { box: scroller, from: scroller.scrollTop, rowId, scope, sheet };
    lift.current = was;
    const again = (): void => {
      if (lift.current !== was) return;
      was.from = scroller.scrollTop;
      keepRowAboveSheet(was.rowId, room, lift);
    };
    scrollMade(scroller, was.from, () => lift.current === was && sheetDrawn(was), again);
  }
  scroller.scrollBy({ top: under, behavior: "smooth" });
}

/**
 * As the sheet closes: the room at the rows' foot is theirs again, and once the sheet has gone from over the rows (its
 * scope on the screen, not held under a page), the rows go back to where they stood before the lift. A sheet still drawn
 * is not closing: its scope taken out of sight, or its effects run again as the scope is shown (twice, in development).
 */
function giveRoomBack(room: { current: SheetRoom | null }, lift: { current: Lift | null }): void {
  if (room.current) {
    room.current.box.style.paddingBottom = room.current.inline;
    room.current = null;
  }
  const was = lift.current;
  if (!was || sheetDrawn(was)) return;
  if (!was.scope.isConnected || was.scope.getClientRects().length === 0 || inHeldList(was.scope)) return;
  lift.current = null;
  scrollGivenBack(was.box);
  was.box.scrollTo({ top: was.from, behavior: "smooth" });
}

/**
 * The row of the deal open on a phone (`id`) kept above its sheet, once the sheet is laid out and again as the person
 * lands (`landed`) and the sheet grows to hold them; the room it took and the lift given back as the sheet closes, or as
 * the scope is shown again with the sheet gone while it was out of sight.
 */
export function useRowAboveSheet(phone: boolean, id: string | null, landed: boolean): void {
  const room = useRef<SheetRoom | null>(null);
  const lift = useRef<Lift | null>(null);
  useEffect(() => {
    if (!phone || !id) return undefined;
    const frame = window.requestAnimationFrame(() => keepRowAboveSheet(id, room, lift));
    return () => window.cancelAnimationFrame(frame);
  }, [phone, id, landed]);
  const sheetUp = phone && !!id;
  useEffect(() => {
    if (!sheetUp) {
      giveRoomBack(room, lift);
      return undefined;
    }
    return () => giveRoomBack(room, lift);
  }, [sheetUp]);
}
