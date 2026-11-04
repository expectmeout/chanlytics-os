/**
 * What the keyboard covers (moved from legacy/components/data-bits.jsx, the one-system plan's step 2). A phone's keyboard
 * is laid over the page, on iOS and on Android alike: the layout keeps its height and only what the browser shows gets
 * shorter. A sheet fixed to the bottom kept its fields and its Save under the keys. The shell calls this once; what the
 * keyboard covers is --kb on the document, which every sheet stands on. It follows what the browser shows, never the focus:
 * a blur that dropped a sheet at once moved Save from under the finger between the press and the click. A pinch zoom
 * shrinks what is shown too, and is no keyboard.
 *
 * iOS also moves what it shows down to keep a focused field in view, and says how far (--vv-top) either before it has
 * moved or long after: a screen that followed its word jumped one way or the other (Ruben's recording, 25 Sep). So the
 * document says a keyboard is EXPECTED (html.kb-expected) the moment a field that types is focused, with the height the
 * last keyboard had (--kb-last, kept on the device), and a screen that makes room for it at once gives the browser nothing
 * to move the view for; the word is kept for the keyboard that never comes (a hardware one: KEYBOARD_DUE_MS), and ends as
 * the keyboard is reported (html.kb-up). Ask's screen stands on all of these (ask.css, the Stage's 5.9).
 *
 * The keys go as the field that raised them lets go, and iOS reports it half a second after they have: an open thread's
 * reply box stood that long over an empty screen before it came down (Ruben's recording, 4 Nov 2026). So from the moment
 * the focus leaves for nothing that types, while they are up, the document says they are LEAVING (html.kb-leaving) until
 * the browser says they have gone, or a field takes the focus again. A screen that reads it gives their room back over
 * their own beat, eased, so nothing under a finger has moved by the time its click lands (mobile.css, the open thread).
 */

const KEYBOARD_MIN = 100;
const KEYBOARD_DUE_MS = 600;
/** How long the keys are said to be leaving when the browser never says they went (a field the focus moved to by itself). */
const KEYBOARD_GOING_MS = 1200;
const KEYBOARD_KEY = "chanlytics-os-keyboard";
const ZOOMED = 1.01;
const NOT_TYPING = /^(button|checkbox|radio|range|submit|reset|file|color|image|hidden)$/;

/**
 * What waits for the keys' room: each told once, the moment the document says a keyboard is expected, in the task the
 * focus came in, and then forgotten (keys-rise.ts riseWithKeys). A frame later was too late: an iPhone had already drawn
 * the screen with the room made, and the reply box went up in one frame (Ruben's recording, 4 Nov 2026).
 */
const roomWaiters = new Set<() => void>();

/** Be told the moment the keys' room is made; the function it answers stops waiting. */
export const whenKeysRoomMade = (told: () => void): (() => void) => {
  roomWaiters.add(told);
  return () => {
    roomWaiters.delete(told);
  };
};

/** The keys' room was made: everything waiting for it is told, once. */
export const keysRoomMade = (): void => {
  for (const told of Array.from(roomWaiters)) {
    roomWaiters.delete(told);
    told();
  }
};

/** A field the keyboard rises for: what makes the document expect it (and what a box on the keys rises for, keys-rise.ts). */
export const typesIn = (el: EventTarget | null): boolean => {
  const n = el as HTMLElement | null;
  return (
    !!n &&
    (n.tagName === "TEXTAREA" ||
      n.isContentEditable === true ||
      (n.tagName === "INPUT" && !NOT_TYPING.test((n as HTMLInputElement).type || "")))
  );
};

/** Watch what the keyboard covers, as --kb, --vv-top and --kb-last on the document; returns what stops it. */
export const watchKeyboard = (): (() => void) => {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv || !vv.addEventListener || !root || !root.style) return () => {};
  const cls = root.classList || null;
  let said: string | null = null;
  let up = false;
  let due: ReturnType<typeof setTimeout> | undefined;
  let going: ReturnType<typeof setTimeout> | undefined;
  let last = 0;
  try {
    last = Number(window.localStorage.getItem(KEYBOARD_KEY)) || 0;
  } catch {
    /* a device that keeps nothing: the first keyboard is met the old way */
  }
  root.style.setProperty("--kb-last", `${last}px`);
  const expect = (on: boolean) => {
    clearTimeout(due);
    if (cls) cls.toggle("kb-expected", on);
    if (!on) return;
    due = setTimeout(() => expect(false), KEYBOARD_DUE_MS);
    keysRoomMade();
  };
  const leaving = (on: boolean) => {
    clearTimeout(going);
    if (cls) cls.toggle("kb-leaving", on);
    if (on) going = setTimeout(() => leaving(false), KEYBOARD_GOING_MS);
  };
  const set = () => {
    const zoomed = (vv.scale || 1) > ZOOMED;
    const keys = zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height));
    const top = zoomed ? 0 : Math.max(0, Math.round(vv.offsetTop));
    const kb = Math.max(0, keys - top);
    up = keys >= KEYBOARD_MIN;
    const now = `${kb} ${top} ${up}`;
    if (now === said) return;
    said = now;
    root.style.setProperty("--kb", `${kb}px`);
    root.style.setProperty("--vv-top", `${top}px`);
    if (cls) cls.toggle("kb-up", up);
    if (!up) {
      leaving(false);
      return;
    }
    expect(false);
    if (keys === last) return;
    last = keys;
    root.style.setProperty("--kb-last", `${last}px`);
    try {
      window.localStorage.setItem(KEYBOARD_KEY, String(last));
    } catch {
      /* kept for this page only */
    }
  };
  // Not where the phone app shrinks the page above the keys (contracts APP_KEYS_RESIZE_CLASS): room made would then go.
  const focusIn = (e: Event) => {
    if (!typesIn(e.target)) return;
    leaving(false);
    if (!up && !(cls && cls.contains("app-keys-resize"))) expect(true);
  };
  // The focus gone to nothing that types, with the keys up: they are on their way down (the field moving to another
  // field keeps them, and says so first).
  const focusOut = (e: Event) => {
    expect(false);
    if (up && !typesIn((e as FocusEvent).relatedTarget)) leaving(true);
  };
  set();
  vv.addEventListener("resize", set);
  vv.addEventListener("scroll", set);
  document.addEventListener("focusin", focusIn);
  document.addEventListener("focusout", focusOut);
  return () => {
    vv.removeEventListener("resize", set);
    vv.removeEventListener("scroll", set);
    document.removeEventListener("focusin", focusIn);
    document.removeEventListener("focusout", focusOut);
    clearTimeout(due);
    clearTimeout(going);
    for (const p of ["--kb", "--vv-top", "--kb-last"]) root.style.removeProperty(p);
    if (cls) {
      cls.remove("kb-up");
      cls.remove("kb-expected");
      cls.remove("kb-leaving");
    }
  };
};
