/**
 * The kit's tab bar (kit.css, `.tab-bar`; docs/superpowers/specs/2026-10-12-the-tab-bar-answers-at-the-touch-design.md):
 * the few places a thumb goes on a phone, side by side on one capsule at the foot of the screen, the place on screen
 * lit. Today, the Inbox, the Calendar and People, and More after them, which is no place. It is the phone's, as the
 * strip of views (../view-tabs/view-tabs.tsx) is a page's: a place is not a view of the page on screen, so the page a
 * place shows is cut in, never slid, and the lozenge alone moves.
 *
 * A place has an address, so a tab is a link (the shell's "a door is a link"), with no long press of a link's own: the
 * press has already moved. A press answers at the touch. As a finger lands the tab lights and the lozenge starts toward
 * it, and a painted frame on the address moves, while the finger is still down; the click that follows the lift is
 * the same press, and does nothing more. A mouse, a key and a screen reader press on the click, as on every link, and a
 * press with a key held, or not the main button, is the browser's own. The lozenge glides as the strip's highlight
 * does (../view-tabs/glide.ts), on a timeline of its own (motion/view-deck.ts `alone`), since no page slides under it.
 * At rest the lit tab draws its own fill, with nothing measured.
 *
 * The place on screen pressed again is said too (`onPick`), and its frame takes it to the place's top.
 */
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { viewDeck } from "../motion/view-deck";
import { cx } from "../variants";
import { afterPaint } from "../view-tabs/after-paint";
import { glideTo } from "../view-tabs/glide";

/** How long a tab pressed stays lit while the address has not followed, before the bar says where it is again. */
const PENDING_MS = 3000;
/** How soon after a finger's press its click comes, at most, for the click to be that press again. */
const TOUCH_CLICK_MS = 1000;

/** A place: its address, its words and its glyph, and the number it may say over the glyph. */
export type TabBarPlace = {
  id: string;
  label: string;
  /** Its address. */
  href: string;
  /** Its glyph, over its words: the page's own, as every glyph in the kit is. */
  glyph: ReactNode;
  /** A figure over the glyph, where it has one to say; none is said for a zero. */
  count?: number | null;
  /** The figure counts people who need you. */
  tone?: "warn";
  testid?: string;
  /** Start its read: called as a pointer, a finger or the keyboard reaches the tab. */
  warm?: () => void;
};

/** What the bar holds that is no place: the drawer behind More, a button after the places. */
export type TabBarMore = {
  /** Its name to a screen reader ("Menu"). */
  label: string;
  /** Its words under the glyph ("More"). */
  word: string;
  glyph: ReactNode;
  onPress: () => void;
};

/** A bar of places: its name, the place on screen, the places, what pressing one does, and More. */
export type TabBarProps = {
  /** What the bar is, to a screen reader ("Main"). */
  label: string;
  /** The place on screen, or null where no place holds the page (Reports, Settings). */
  picked: string | null;
  places: readonly TabBarPlace[];
  /** Move to a place. Called for the place on screen too, which its frame takes to the place's top. */
  onPick: (id: string) => void;
  more?: TabBarMore;
  testid?: string;
  className?: string;
};

/** A plain press of the main button: one with a key held, or another button, is the browser's own. */
const ownPress = (e: MouseEvent) =>
  !(e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

/** A finger's or a pen's first press: a mouse presses on the click, as on any link. */
const touchPress = (e: PointerEvent) => e.pointerType !== "mouse" && e.isPrimary && e.button === 0;

/** The places a thumb goes, the one on screen lit. */
export function TabBar({ label, picked, places, onPick, more, testid, className }: TabBarProps) {
  // The place pressed, lit until the address says it is the page's own.
  const [pending, setPending] = useState<string | null>(null);
  const bar = useRef<HTMLElement>(null);
  // The place a finger pressed, and when: the click its lift makes is that press again.
  const touched = useRef<{ id: string; at: number } | null>(null);
  useEffect(() => {
    setPending(null);
  }, [picked]);
  useEffect(() => {
    if (pending === null) return undefined;
    const t = setTimeout(() => setPending(null), PENDING_MS);
    return () => clearTimeout(t);
  }, [pending]);
  const lit = pending ?? picked;

  const press = (tab: HTMLElement, place: TabBarPlace) => {
    if (place.id !== lit) {
      const was = bar.current ? bar.current.querySelector<HTMLElement>(".tab-bar-tab.active") : null;
      if (bar.current && was) glideTo(bar.current, was, tab, viewDeck.alone());
      setPending(place.id);
    }
    afterPaint(() => onPick(place.id));
  };
  const down = (e: PointerEvent<HTMLAnchorElement>, place: TabBarPlace) => {
    if (!touchPress(e)) return;
    touched.current = { id: place.id, at: e.timeStamp };
    press(e.currentTarget, place);
  };
  const click = (e: MouseEvent<HTMLAnchorElement>, place: TabBarPlace) => {
    if (!ownPress(e)) return;
    e.preventDefault();
    const was = touched.current;
    touched.current = null;
    if (was && was.id === place.id && e.timeStamp - was.at <= TOUCH_CLICK_MS) return;
    press(e.currentTarget, place);
  };

  // The frame's chrome (`data-chrome`): a row's page carried back by a thumb shows it under it (kit/motion/held-list.ts).
  return (
    <nav ref={bar} className={cx("tab-bar", className)} aria-label={label} data-testid={testid} data-chrome="">
      <span className="tab-bar-pill" aria-hidden="true" />
      {places.map((place) => (
        <a
          key={place.id}
          href={place.href}
          className={cx("tab-bar-tab", lit === place.id && "active")}
          aria-current={picked === place.id ? "page" : undefined}
          data-testid={place.testid}
          draggable={false}
          onPointerEnter={place.warm}
          onFocus={place.warm}
          onPointerDown={(e) => down(e, place)}
          onPointerCancel={() => (touched.current = null)}
          onClick={(e) => click(e, place)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="tab-bar-glyph">
            {place.glyph}
            {place.count ? (
              <span className={cx("tab-bar-count tally tally-icon", place.tone === "warn" && "tally-warn")}>
                {place.count}
              </span>
            ) : null}
          </span>
          {place.label}
        </a>
      ))}
      {more ? (
        <button type="button" className="tab-bar-tab" aria-label={more.label} onClick={more.onPress}>
          <span className="tab-bar-glyph">{more.glyph}</span>
          {more.word}
        </button>
      ) : null}
    </nav>
  );
}
