/**
 * The frame's helpers under the names the shell's pages, and the surfaces' adapters that stand for them, read off `window`
 * (the one-system plan's step 2). They were legacy/components/data-bits.jsx, a classic script every workspace evaluated
 * and 81 node tests imported for what it put on the window; they are TypeScript now, each where its kind lives: a thumb's
 * gestures, an overlay's way out, the keyboard and a switch that holds still in the kit's motion; focus in the kit's focus;
 * the frame's flash, its tip and the role gate here; a door that is a link with the frame's doors; presence with the
 * Inbox's store and the seeded charter with the policy store. With them, the shell's contracts (`CHANLY`, constants.ts) and
 * the shortcuts sheet's opener, which the sidebar's account menu calls. The frame's own parts are TypeScript and imported
 * (wave 2, steps 7a to 7e), so no name of theirs is published.
 *
 * What is shared moves once (decision 0015): the app publishes them from seed-globals.ts before any page loads, the
 * standalone mockup from a bundle its server builds (tooling/scripts/serve-legacy.mjs, `data/frame-globals.js`), and a
 * node test that draws a page reading them installs them where it imported the JSX. Each name goes with its last reader:
 * the frame's and Ask's JSX (wave 2), then the adapters, which read the window so a test can stand in (step 9).
 *
 * `installFrameGlobals` publishes as the JSX did: every function over whatever was there, the two stores, the contracts and
 * the tip only where none is (a test's stand-in, the mockup's), and the focus listener once.
 */
import { seedPolicyStore } from "@/legacy-bridge/policy-store";
import { dialogRef, hearFocusOutside, tabStops, trapFocus, trapTab } from "../kit/focus/trap";
import { keyPress, useHotkey } from "../kit/focus/keys";
import { holdStill } from "../kit/motion/hold-still";
import { watchKeyboard } from "../kit/motion/keyboard";
import { leaveOverlay, leaving } from "../kit/motion/leaving";
import { touchSwipe } from "../kit/motion/swipe";
import { routeDoor } from "../frame-doors";
import { makePresenceStore, type PresenceStore } from "../inbox/store";
import { refusalToast, usePPToast } from "./flash";
import { CHANLY } from "./constants";
import { openShortcuts } from "./shortcuts";
import { canDo, gate, gatedProps, gateTitle, mayAtLeast } from "./gate";
import { installTip } from "./tip";

declare global {
  interface Window {
    /** Presence (surfaces/inbox/store.ts), which the top bar and the Inbox's shell read. */
    PR_STORE?: PresenceStore;
  }
}

let frameInstalled = false;

/**
 * Publish the frame's helpers on the window (see the header): once, where the page loads; a second call does nothing. The
 * names are said where they are published, so the names the shell may read can be listed (shell-names-are-published.test.mjs).
 */
export function installFrameGlobals(): void {
  if (frameInstalled) return;
  frameInstalled = true;
  Object.assign(window, {
    usePPToast,
    useHotkey,
    trapTab,
    tabStops,
    touchSwipe,
    leaving,
    leaveOverlay,
    watchKeyboard,
    holdStill,
    routeDoor,
    canDo,
    mayAtLeast,
    gateTitle,
    gate,
    gatedProps,
    refusalToast,
    trapFocus,
    dialogRef,
    keyPress,
    openShortcuts,
  });
  hearFocusOutside();
  window.PR_STORE = window.PR_STORE || makePresenceStore();
  window.POLICY = window.POLICY || seedPolicyStore();
  window.CHANLY = window.CHANLY || CHANLY;
  installTip();
}
