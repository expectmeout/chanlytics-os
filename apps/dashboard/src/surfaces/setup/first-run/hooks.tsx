/**
 * What the first run's page holds besides its steps (moved from legacy/pages/first-run.jsx `FirstRun`, decision 0015):
 * the heading's focus as the step changes, a redraw as the Business tab's saver and doors move, the phone step's choice
 * kept in the tab with Stripe's answer read once on arrival, the second's clock while Try it is on screen, the quiet
 * look a step that waits takes at its own pace, and the once-a-session landing.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { FIRST_RUN_HELPERS, FIRST_RUN_LANDED_KEY } from "@chanlytics/contracts";
import type { LegacyFlash } from "../../legacy-verbs";
import { scrollerOf } from "../../kit/motion/page-scroll";
import { liveOverride } from "../../live/surface";
import { billingVerbs } from "../../settings/billing/surface";
import { businessTabSave } from "../shell";
import { setupVerbs } from "../surface";
import { keepPhoneChoice, phoneChoiceKept, type KeptPhoneChoice } from "./memory";

/**
 * The step's heading takes focus when the step on screen changes, so a screen reader says where the owner is now and the
 * keys start from the top of it. `face` names what is drawn (the step, and Find within the business step), never the
 * address: Find to Check, and every move on to where the workspace stands, keep the bare address, and the button pressed
 * is gone by then. Not on the page's first draw, nor as its read lands (`face` null until then), which are its own arrival.
 * The step opens at its top too: the shell is the page's scroll (first-run.css), and a step reached by the browser's
 * Back is no press of the page's own to scroll it.
 */
export function useHeadingFocus(face: string | null): void {
  const drawnFace = useRef(face);
  useEffect(() => {
    const before = drawnFace.current;
    drawnFace.current = face;
    if (before === null || face === null || before === face) return;
    // The shell on a desk; on a phone the window scrolls the step (first-run.css), and the shell is no scroller.
    const shell = "querySelector" in document ? document.querySelector<HTMLElement>(".fr-shell") : null;
    const box = shell ? scrollerOf(shell, { self: true }) : null;
    if (box && box.scrollTo) box.scrollTo(0, 0);
    const h = document.getElementById ? document.getElementById("fr-heading") : null;
    if (h && h.focus) h.focus({ preventScroll: true });
  }, [face]);
}

/** What a step drawn is waiting on, from outside the page: Setup's own read (a plan, a number), or a call as well. */
export type Waits = "setup" | "call" | null;

/** How often a step that waits looks again, in case the live feed did not say what landed. */
const WAIT_LOOK_MS = 6000;

/**
 * A step that waits on something outside the page (the plan Stripe confirms, the number on its way, the test call) says
 * "this page updates by itself", and the live feed is what updates it. A feed that dropped (a phone back from sleep, a
 * flaky network) left the owner on a screen that never moved, with nothing to press: so while such a step is drawn, and
 * the tab is looked at, the page looks again at its own pace. A quiet look (surface.ts `peek`): one that fails changes
 * nothing on screen. Try it looks at the calls too, as the Live page reads them.
 */
export function useWaitingLook(waits: Waits): void {
  useEffect(() => {
    if (!waits) return undefined;
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void setupVerbs.peek();
      if (waits === "call") void liveOverride.apply().catch(() => undefined);
    }, WAIT_LOOK_MS);
    return () => clearInterval(t);
  }, [waits]);
}

/**
 * Check's rows save through the Business tab's saver and doors, which outlive the page: a save moving through any of them
 * draws the page again, as it draws the tab. Answers the redraw, for Try it's clock too.
 */
export function useBusinessTabRedraw(): () => void {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const S = businessTabSave;
    const doors = [S.saver, S.zone];
    const stops = doors.map((d) => (d && d.subscribe ? d.subscribe(redraw) : null));
    return () =>
      stops.forEach((stop) => {
        if (stop) stop();
      });
  }, []);
  return redraw;
}

/**
 * The phone step's choice, as the tab keeps it, and whether this tab came back from checkout with a card given: Stripe's
 * answer is read once, on arrival.
 */
export function usePhoneChoice(
  param: string | null,
  replace: (to: string) => void,
  flash: (f: LegacyFlash) => void,
): [KeptPhoneChoice | null, (c: KeptPhoneChoice | null) => void] {
  const [phoneChoice, setPhoneChoiceState] = useState<KeptPhoneChoice | null>(phoneChoiceKept);
  const setPhoneChoice = (c: KeptPhoneChoice | null) => {
    keepPhoneChoice(c);
    setPhoneChoiceState(c);
  };
  useEffect(() => {
    const out = billingVerbs.outcome();
    const kept = phoneChoiceKept();
    // Back with a card: Stripe returns to the first run's bare address, and the step it left is the phone's, which stays
    // on screen once its line answers (a number kept still has its forwarding to set).
    if (out === "success" && kept && kept.pending) {
      setPhoneChoice({ ...kept, returnedAt: Date.now() });
      if (param !== "phone") replace("start/phone");
    }
    if (out === "cancel") {
      if (kept) setPhoneChoice({ ...kept, pending: false, sent: false, returnedAt: null });
      flash({ msg: <>{FIRST_RUN_HELPERS.phoneWords.cancelled}</> });
    }
  }, []);
  return [phoneChoice, setPhoneChoice];
}

/** How often Try it's clock is drawn again. */
const TRY_CLOCK_MS = 1000;

/** While Try it is on screen (`onTry`), the page is drawn each second, so its clock and its quiet turn move. */
export function useTryClock(onTry: { current: boolean }, redraw: () => void): void {
  useEffect(() => {
    const t = setInterval(() => {
      if (onTry.current) redraw();
    }, TRY_CLOCK_MS);
    return () => clearInterval(t);
  }, [onTry, redraw]);
}

/** Being here is the landing: Today does not send this tab back again this session. */
export function useLanded(): void {
  useEffect(() => {
    try {
      window.sessionStorage.setItem(FIRST_RUN_LANDED_KEY, "1");
    } catch {
      /* still here */
    }
  }, []);
}
