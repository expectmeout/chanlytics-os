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
 */

const KEYBOARD_MIN = 100;
const KEYBOARD_DUE_MS = 600;
const KEYBOARD_KEY = "chanlytics-os-keyboard";
const ZOOMED = 1.01;
const NOT_TYPING = /^(button|checkbox|radio|range|submit|reset|file|color|image|hidden)$/;

const typesIn = (el: EventTarget | null): boolean => {
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
    if (on) due = setTimeout(() => expect(false), KEYBOARD_DUE_MS);
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
    if (!up) return;
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
    if (!up && typesIn(e.target) && !(cls && cls.contains("app-keys-resize"))) expect(true);
  };
  const focusOut = () => expect(false);
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
    for (const p of ["--kb", "--vv-top", "--kb-last"]) root.style.removeProperty(p);
    if (cls) {
      cls.remove("kb-up");
      cls.remove("kb-expected");
    }
  };
};
