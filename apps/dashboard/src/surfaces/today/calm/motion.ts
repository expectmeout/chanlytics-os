/**
 * Today's movements (Today, calm, D6, D13 and D14; the canvas's "Motion, refined", 19 Nov 2026). Three, none of which
 * loops, each the answer to a press: the card hands off (its room glides from the height the last card stood at, and
 * the next thing's words arrive a part at a time); a line whose item rose into the card folds shut where it stood
 * (calm.css, the line's own transition); and the head's count rolls into place as it falls. Nothing moves as Today
 * opens: each is played on a change, never on a first draw.
 *
 * They are the web animations API on the element itself, one run a change, as the kit's own movements are
 * (kit/motion/use-swap-motion.ts): no class to add and take away, no remount, and nothing under reduced motion. The times
 * are the tokens' (tokens.css --duration-slow, --ease-out, --ease-in-out), written here since a script cannot read them
 * before the element is drawn.
 *
 * The page's card is drawn by whichever part holds it (Need you's row, a run waiting, what AI found), each its own
 * element, so what the card last held and how tall it stood is kept here, across them.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** A movement's length (--duration-slow), and how far apart the parts of one movement start. */
const SLOW_MS = 360;
const APART_MS = 40;
/**
 * How far the card's words rise as they arrive. The kit's own swaps stopped rising (23 Oct 2026: a table read as shifting
 * under the press); the canvas drew these rising, and this is the one number to set to 0 if a phone says they shift.
 */
const RISE_PX = 8;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";

const still = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** What the page's card last held, and how tall it stood. */
let lastCard: { key: string; height: number } | null = null;
/** The count the head last drew. */
let lastCount: number | null = null;
/** When the card was last pressed, and for how long after it a thing that leaves the card is one the press finished. */
let pressedAt = 0;
const PRESS_HOLDS_MS = 10_000;

/** The card was pressed (its own capture of a pointer or a key going down), or a line that rises into it was. */
export function cardPressed(): void {
  pressedAt = Date.now();
}

/** Whether the card was pressed a moment ago: what has left it since was finished by that press, not by a read. */
export const cardPressedLately = (): boolean => Date.now() - pressedAt < PRESS_HOLDS_MS;

/** Today is left: the next visit's first draw moves nothing. */
export function forgetTodayMotion(): void {
  lastCard = null;
  lastCount = null;
  pressedAt = 0;
}

/** The card's words arrive, a part at a time, and its room glides from the height the last card stood at. */
function handOff(words: HTMLElement, from: number): void {
  if (still() || typeof words.animate !== "function") return;
  Array.from(words.children).forEach((part, at) => {
    part.animate(
      [
        { opacity: 0, transform: `translateY(${RISE_PX}px)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: SLOW_MS, delay: at * APART_MS, easing: EASE_OUT, fill: "backwards" },
    );
  });
  const box = words.parentElement;
  const to = box?.offsetHeight ?? 0;
  if (!box || Math.abs(to - from) < 2) return;
  box.animate(
    [
      { height: `${from}px`, overflow: "hidden" },
      { height: `${to}px`, overflow: "hidden" },
    ],
    { duration: SLOW_MS, easing: EASE_OUT },
  );
}

/**
 * The keyboard's place, kept: where what was focused left with the press (the card's own button once its thing is
 * done, the line that rose into the card and folded shut), the card's first press takes the focus, so a key or a
 * reader goes on from the card and not from the top of the page. Only after a press, never as a read moves the card.
 */
function keepPlace(words: HTMLElement): void {
  if (!cardPressedLately()) return;
  const at = document.activeElement;
  const lost = !at || at === document.body || !at.isConnected || !!at.closest("[inert]");
  if (!lost) return;
  // The card's main press: its own where the card draws it, the last of a work's presses (the work puts its main one
  // at its end), else the first thing that can be pressed.
  const own = words.querySelector<HTMLElement>('[data-testid="today-card-act"]:not([disabled])');
  const ofWork = Array.from(words.querySelectorAll<HTMLElement>(".ny-acts button:not([disabled])")).at(-1);
  const first = words.querySelector<HTMLElement>("button:not([disabled]), a[href]");
  (own ?? ofWork ?? first)?.focus({ preventScroll: true });
}

/**
 * The ref of the card's words, by what the card holds (`key`): where a card was drawn before and held something else,
 * the hand-off plays; on the page's first card, nothing does. How tall the card stands is kept as it is drawn, so the
 * next one glides from it.
 */
export function useCardHandOff(key: string): RefObject<HTMLDivElement | null> {
  const words = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = words.current;
    if (!el) return;
    const was = lastCard;
    // Its own height first, before anything plays: read during a glide it is the height the glide starts from.
    lastCard = { key, height: el.parentElement?.offsetHeight ?? 0 };
    if (was && was.key !== key) {
      handOff(el, was.height);
      keepPlace(el);
    }
  }, [key]);
  // Its height as it stands now, whatever changed in it since (a row finished says so in fewer lines): never mid-glide.
  useLayoutEffect(() => {
    const box = words.current?.parentElement;
    if (box && lastCard?.key === key && !box.getAnimations().length) lastCard = { key, height: box.offsetHeight };
  });
  return words;
}

/**
 * Where the card stood, once nothing holds it: its room folds shut, so the lines rise under it instead of jumping. The
 * ref of an empty box, and whether it is done (the box is then not drawn at all). Nothing where no card was drawn.
 */
export function useCardGone(): { room: RefObject<HTMLDivElement | null>; gone: boolean } {
  const room = useRef<HTMLDivElement | null>(null);
  const [gone, setGone] = useState(() => lastCard === null || still());
  useLayoutEffect(() => {
    const el = room.current;
    const was = lastCard;
    lastCard = null;
    if (!el || !was || typeof el.animate !== "function") {
      setGone(true);
      return;
    }
    const fold = el.animate([{ height: `${was.height}px` }, { height: "0px" }], {
      duration: SLOW_MS,
      easing: EASE_IN_OUT,
    });
    fold.onfinish = () => setGone(true);
    fold.oncancel = () => setGone(true);
    return () => fold.cancel();
  }, []);
  return { room, gone };
}

/**
 * The head's count rolls into place as it falls (D13: "4 need you", then 3), the only number on the page that moves.
 * The ref of what says the count, by the count it says: it remembers the last one drawn, and plays nothing on the first,
 * nor when the count rises (someone arriving is the bell's to say).
 */
export const countRolls =
  (count: number) =>
  (el: HTMLElement | null): void => {
    if (!el) return;
    const was = lastCount;
    lastCount = count;
    if (was === null || count >= was || still() || typeof el.animate !== "function") return;
    el.animate(
      [
        { opacity: 0.15, transform: "translateY(0.4em)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: SLOW_MS, easing: EASE_OUT },
    );
  };
