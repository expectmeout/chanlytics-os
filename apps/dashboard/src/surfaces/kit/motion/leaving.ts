/**
 * Leaving: an overlay goes the way it came (moved from legacy/components/data-bits.jsx, the one-system plan's step 2). A
 * dialog, a sheet or a palette is React's to take away, and it went at once: a hard cut, where it had come in. As React
 * lets go of it, a still copy -- no id, no test id, no role, inert, hidden from a screen reader -- is put where it was,
 * with the wash that was behind it, and `[data-leaving]` in components.css plays it out (the way it came, faster) before
 * it is removed. `leaving(key)` is the callback ref that does it, one per key and the same one on every draw, so a draw is
 * never a leaving; put it on the sheet (or the palette), and its wash is found as the sibling before it as it opens. React
 * takes the wash away before the sheet, so the wash's copy is made from the one it held. Nothing leaves under reduced
 * motion, nor from a frame React mounted and let go of at once (StrictMode's check in development, a draw that never
 * showed). The fold's sheet has its own (the record kit's `recSheetLeaves`).
 */
import { motionReduced, washBehind } from "./swipe";

const STILL_ATTRIBUTES = ["role", "aria-modal", "aria-label", "aria-labelledby", "aria-describedby", "aria-busy"];
/** How long a still copy may play before it is removed whatever its animation said. */
const LEAVE_FALLBACK_MS = 420;
/** A frame shown for less than this was never seen, and does not leave. */
const SEEN_MS = 60;

/**
 * A picture of a node as it stands, drawn in its place by whoever asks: no id, no test id, no role, inert, hidden from a
 * screen reader. A list held under what it opened is shown by one while a thumb carries that away (held-list.ts).
 */
export const stillCopyOf = (node: Element): Element => {
  const copy = node.cloneNode(true) as Element;
  // A canvas clones blank: what it drew (Ask's three, a chart) is painted into its copy, or it would vanish the moment
  // the leaving began while all round it played out. One it cannot read stays blank.
  const blank = "querySelectorAll" in copy ? copy.querySelectorAll("canvas") : [];
  ("querySelectorAll" in node ? Array.from(node.querySelectorAll("canvas")) : []).forEach((c, k) => {
    try {
      const into = blank[k];
      if (into && c.width && c.height) into.getContext("2d")?.drawImage(c, 0, 0);
    } catch {
      /* not readable */
    }
  });
  const all = [copy].concat("querySelectorAll" in copy ? Array.from(copy.querySelectorAll("*")) : []);
  for (const n of all) {
    n.removeAttribute("id");
    n.removeAttribute("data-testid");
  }
  for (const k of STILL_ATTRIBUTES) copy.removeAttribute(k);
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  return copy;
};
/** The still copy an overlay leaves by: it plays out its leaving (components.css, `[data-leaving]`). */
const stillCopy = (node: Element): Element => {
  const copy = stillCopyOf(node);
  copy.setAttribute("data-leaving", "true");
  return copy;
};
const playOut = (copy: Element) => {
  let gone = false;
  const go = () => {
    if (!gone) {
      gone = true;
      copy.remove();
    }
  };
  copy.addEventListener("animationend", (e) => {
    if (e.target === copy) go();
  });
  setTimeout(go, LEAVE_FALLBACK_MS);
};

/** Play a node and its wash out from where the node still stands: called as React lets go of the node. */
export const leaveOverlay = (node: Element | null | undefined, wash: Element | null = null): void => {
  const parent = node && node.parentNode;
  if (!node || !parent || typeof node.cloneNode !== "function" || motionReduced()) return;
  if (wash && typeof wash.cloneNode === "function") {
    const w = stillCopy(wash);
    parent.insertBefore(w, node);
    playOut(w);
  }
  const copy = stillCopy(node);
  parent.insertBefore(copy, node.nextSibling);
  playOut(copy);
};

/**
 * A node's leaving copied as React lets go of it, and played where it stood only when asked: for a caller that knows
 * once the commit is over whether the leaving is its own. A peek whose page goes with it is carried out in the page's
 * own copy (view-deck.ts keptCopy), which took the peek's copy along when it was put in at once (27 Oct 2026).
 */
export const leaveLater = (node: Element | null | undefined): (() => void) | null => {
  const parent = node && node.parentNode;
  if (!node || !parent || typeof node.cloneNode !== "function" || motionReduced()) return null;
  const next = node.nextSibling;
  const copy = stillCopy(node);
  return () => {
    parent.insertBefore(copy, next && next.parentNode === parent ? next : null);
    playOut(copy);
  };
};

const leavingRefs = new Map<string, (el: HTMLElement | null) => void>();

/** The callback ref that plays its element out as React lets go of it: one per key, the same on every draw. */
export const leaving = (key: string): ((el: HTMLElement | null) => void) => {
  const had = leavingRefs.get(key);
  if (had) return had;
  let held: HTMLElement | null = null;
  let wash: HTMLElement | null = null;
  let since = 0;
  const ref = (el: HTMLElement | null) => {
    if (el) {
      held = el;
      wash = washBehind(el);
      since = Date.now();
      return;
    }
    const was = held;
    const w = wash;
    held = null;
    wash = null;
    if (was && Date.now() - since > SEEN_MS) leaveOverlay(was, w);
  };
  leavingRefs.set(key, ref);
  return ref;
};
