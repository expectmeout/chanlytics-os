/**
 * What the first run's page holds besides its steps (moved from legacy/pages/first-run.jsx `FirstRun`, decision 0015):
 * the heading's focus as the step changes, a redraw as the Business tab's saver and doors move, the phone step's choice
 * kept in the tab with Stripe's answer read once on arrival, the second's clock while Try it is on screen, and the
 * once-a-session landing.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { FIRST_RUN_HELPERS, FIRST_RUN_LANDED_KEY } from "@chanlytics/contracts";
import type { LegacyFlash } from "../../legacy-verbs";
import { billingVerbs } from "../../settings/billing/surface";
import { businessTabSave } from "../shell";
import { keepPhoneChoice, phoneChoiceKept, type KeptPhoneChoice } from "./memory";

/**
 * The step's heading takes focus when the step changes, so a screen reader says where the owner is now and the keys start
 * from the top of it; not on the page's first draw, which is its own arrival.
 */
export function useHeadingFocus(param: string | null): void {
  const drawnParam = useRef(param);
  useEffect(() => {
    if (drawnParam.current === param) return;
    drawnParam.current = param;
    const h = document.getElementById ? document.getElementById("fr-heading") : null;
    if (h && h.focus) h.focus({ preventScroll: true });
  }, [param]);
}

/**
 * Check's rows save through the Business tab's saver and doors, which outlive the page: a save moving through any of them
 * draws the page again, as it draws the tab. Answers the redraw, for Try it's clock too.
 */
export function useBusinessTabRedraw(): () => void {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const S = businessTabSave();
    const doors = S ? [S.saver, S.zone, S.sellsBy] : [];
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
