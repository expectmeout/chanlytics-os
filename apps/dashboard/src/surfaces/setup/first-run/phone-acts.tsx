/**
 * What the phone step's presses do (moved from legacy/pages/first-run.jsx `FrPhone`, decision 0015): the buy that goes on
 * by itself once the workspace may spend, the area code's search, the forwarding saved from the two answers, "Do it with
 * me", and the step's one coral button. Each asks its door's own role first, as the doors do. Plain functions over what
 * the step holds (`PhoneActs`), so the step's component draws and these act.
 */
import type { RefObject } from "react";
import {
  areaCodeOf,
  forwardingCarrierOf,
  type FIRST_RUN_PHONE_WORDS,
  type FirstRunPhoneVM,
} from "@chanlytics/contracts";
import { canDo, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { billingVerbs } from "../../settings/billing/surface";
import { setupVerbs, type LineChoice } from "../surface";
import type { KeptPhoneChoice } from "./memory";

export type PhoneWords = typeof FIRST_RUN_PHONE_WORDS;

/** What the step's presses work with: the step, the owner's choice and its keeper, the toast, and the step's own state. */
export interface PhoneActs {
  ph: FirstRunPhoneVM;
  c: KeptPhoneChoice;
  setChoice: (c: KeptPhoneChoice | null) => void;
  W: PhoneWords;
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  /** The buy this mount sent: a second draw before the line reaches Setup never sends another. A refusal lets go of it. */
  sent: RefObject<boolean>;
  area: string;
  setAreaProblem: (p: string | null) => void;
  setNumbers: (n: LineChoice[]) => void;
  setHelp: (open: boolean) => void;
}

/** An answer to one of the two questions: kept with the choice, whatever the stage (the buy waits on nothing here). */
export const answer = (k: PhoneActs, patch: Partial<KeptPhoneChoice>) => k.setChoice({ ...k.c, ...patch });

/** A buy that did not go: said, and the owner chooses again. */
function failed(k: PhoneActs, r: { ok: boolean; message: string } | null, words?: string) {
  k.sent.current = false;
  k.setChoice({ ...k.c, pending: false, sent: false });
  k.flash(r ? refusalToast(r, k.W.notBought) : { tone: "warn", msg: <>{words}</> });
}

/**
 * The number bought, once the plan lets it: a number kept or moved buys the receptionist one in its area code (the first
 * offered: customers never see it), a new number buys the one picked, and a move asks a person to file it.
 */
export async function buy(k: PhoneActs): Promise<void> {
  const { ph, c, W } = k;
  // A role that may not buy (View-as, or a teammate's tab) sends nothing, and the step goes back to its choice.
  if (!canDo("disconnect")) {
    k.sent.current = false;
    k.setChoice({ ...c, pending: false, sent: false });
    return;
  }
  let e164 = c.pick ? c.pick.e164 : null;
  let code = c.pick ? areaCodeOf(c.pick.e164) : null;
  if (c.way !== "new") {
    code = ph.area;
    if (!code) return failed(k, null, W.held.number);
    const found = await setupVerbs.lines.search(code);
    if (!found.ok) return failed(k, found);
    const first = found.numbers[0];
    if (!first) return failed(k, null, W.noneFree(code));
    e164 = first.e164;
  }
  if (!e164) return failed(k, null, W.held.pick);
  const r = await setupVerbs.lines.buy(e164, code || "");
  // Refused (a card, a line already there): said, and the owner chooses again. Bought and stopped part-way: the line row
  // has it, with its Retry.
  if (!r.ok && r.message) return failed(k, r);
  if (c.way === "move" && canDo("approve")) {
    const q = await setupVerbs.request("port");
    k.flash({ tone: q.ok ? "ok" : "warn", msg: <>{q.ok ? W.moveAsked : W.moveNotAsked}</> });
  }
}

/** The numbers free in the area code typed, three of them. */
export async function findNumbers(k: PhoneActs): Promise<void> {
  const { W, area } = k;
  if (k.busy || !canDo("disconnect")) return;
  if (!/^\d{3}$/.test(area)) {
    k.setAreaProblem(W.threeDigits);
    return;
  }
  k.setBusy(true);
  const r = await setupVerbs.lines.search(area);
  k.setBusy(false);
  if (!r.ok) {
    k.flash(refusalToast(r, W.notBought));
    return;
  }
  k.setNumbers(r.numbers.slice(0, 3));
  if (!r.numbers.length) k.flash({ tone: "info", msg: <>{W.noneFree(area)}</> });
}

/** The forwarding saved from the two answers: the carrier they choose, for the number kept or moved. */
async function forward(k: PhoneActs): Promise<void> {
  const { ph, c, W } = k;
  const carrier = forwardingCarrierOf(c.rings, c.company);
  if (!carrier || !ph.forwardFrom || !canDo("disconnect")) return;
  // Asked again and answered the same: the code saved stands, and saving it again would drop what a call proved.
  if (ph.saved && ph.saved.carrier === carrier) {
    answer(k, { redo: false });
    return;
  }
  k.setBusy(true);
  const r = await setupVerbs.forwarding.set({ number: ph.forwardFrom, carrier, mode: "unanswered", test_from: "" });
  if (!r.ok) {
    k.setBusy(false);
    k.flash(refusalToast(r, W.notForwarded));
    return;
  }
  // Saved: Setup is read again (the refresh map), the code is drawn from what was saved, and the button stays busy until
  // then (the stage moving lets it go).
  k.setChoice({ ...c, redo: false });
  k.setHelp(false);
}

/**
 * An office phone system's "Do it with me": a person at Chanlytics asked to set the forwarding up on a call (the
 * request's own door, an operator's, as asking for a line is).
 */
export async function withMe(k: PhoneActs): Promise<void> {
  const { W } = k;
  if (k.busy || !canDo("approve")) return;
  k.setBusy(true);
  const r = await setupVerbs.request("forwarding");
  k.setBusy(false);
  k.flash(r.ok ? { tone: "ok", msg: <>{W.withMeSent}</> } : refusalToast(r, W.withMeFailed));
}

/**
 * The step's one coral button. The number starts the plan (maySpend): by checkout, which takes no trial here, or, on a
 * free trial, by starting its plan now. Either way the choice waits in the tab, and the buy goes on once the plan lets it.
 */
export async function press(k: PhoneActs): Promise<void> {
  const { ph, c } = k;
  const cta = ph.cta;
  if (!cta || cta.held || k.busy) return;
  if (cta.act === "forward") return forward(k);
  // Done: on to where the workspace is now, Try it.
  if (cta.act === "onward") return k.go("start");
  const next: KeptPhoneChoice = { ...c, way: ph.way, pending: true, sent: false, returnedAt: null };
  if (cta.act === "plan" || cta.act === "startNow") {
    const B = billingVerbs;
    if (!canDo("billing")) return;
    k.setChoice(next);
    // The step's own address, so it stays on screen once its line answers.
    k.go("start/phone");
    k.setBusy(true);
    const r = cta.act === "plan" ? await B.checkout("start") : await B.startNow();
    k.setBusy(false);
    if (!r.ok) {
      k.setChoice({ ...next, pending: false });
      k.flash({ tone: "danger", msg: <>{r.message}</> });
    }
    return;
  }
  if (!canDo("disconnect")) return;
  k.setChoice(next);
  k.go("start/phone");
}

/** Each act's gate on the step's button: the role it asks, and what pressing does. */
export const PHONE_GATES: Partial<Record<string, readonly [string, string]>> = {
  plan: ["billing", "start the plan"],
  startNow: ["billing", "start the plan"],
  buy: ["disconnect", "get a number"],
  forward: ["disconnect", "set up forwarding"],
};
