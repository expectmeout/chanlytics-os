/**
 * What pressing a Setup row's verb does (moved from legacy/pages/setup.jsx `SetupRows`, decision 0015): asking a person,
 * the line chooser, forwarding, activation, billing, a dial or a route, each behind its door's role (`setupGate`), checked
 * again here so a stale row or the first run's Next cannot press past the gate. Plain functions over what the rows hold:
 * the toast, the one verb on its way (`once`), and the two panels.
 */
import { CALENDAR_SETTING_ROUTE } from "@chanlytics/contracts";
import type { SetupVerb } from "@chanlytics/contracts";
import { canDo, navigate, openBookingTool, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { billingVerbs } from "../../settings/billing/surface";
import { setupVerbs } from "../surface";
import { retryLineInPlace } from "../retry-line";
import { setupGated } from "./gates";

/** What a verb's press works with: the toast, the one verb on its way, and the two panels under the rows. */
export interface RowActs {
  flash: (f: LegacyFlash) => void;
  once: (to: string, run: () => Promise<void>) => Promise<void>;
  toggleChooser: () => void;
  toggleForwarding: () => void;
  openForwarding: () => void;
}

const ALREADY = <>Already asked — a person at Chanlytics has it.</>;

/** A person at Chanlytics asked for a line, or for a repair only Chanlytics can make (S8): gated as the line's is. */
async function askPerson(what: "line" | "repair", to: string, k: RowActs): Promise<void> {
  if (!canDo("approve")) return;
  await k.once(to, async () => {
    const r = await setupVerbs.request(what);
    k.flash(
      r.ok
        ? {
            msg: r.already ? (
              ALREADY
            ) : what === "line" ? (
              <>We got it — a person at Chanlytics will set up your line with you.</>
            ) : (
              <>We got it — a person at Chanlytics will repair your settings and reach you by email.</>
            ),
          }
        : refusalToast(r, "Request not sent"),
    );
  });
}

/** Stripe's checkout or its portal: the billing role's. */
async function billing(to: string, k: RowActs): Promise<void> {
  if (!canDo("billing")) return;
  const b = billingVerbs;
  await k.once(to, async () => {
    const r = to === "verb:billing-checkout" ? await b.checkout() : await b.portal();
    if (!r.ok) k.flash({ tone: "danger", msg: <>{r.message}</> });
  });
}

/** The forwarding test window opened from the row, and the card opened under it. */
async function forwardingTest(to: string, k: RowActs): Promise<void> {
  if (!canDo("team")) return;
  await k.once(to, async () => {
    const r = await setupVerbs.forwarding.test(to.slice("verb:forwarding-test:".length));
    k.flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok ? (
        <>The window is open for 30 minutes — call the number you keep from another phone.</>
      ) : (
        <>{r.message}</>
      ),
    });
    k.openForwarding();
  });
}

/** A line that stopped part-way, set up again (retry-line.tsx, which Connections' phone row presses too). */
async function retryLine(to: string, k: RowActs): Promise<void> {
  if (!canDo("team")) return;
  await k.once(to, () => retryLineInPlace(to.slice("verb:retry-line:".length), k.flash));
}

/**
 * A capability switched on, or its activation withdrawn. An activation is the owner's record that a capability is
 * theirs; it gates nothing at runtime. Withdrawing it stops nothing, and says so.
 */
async function activation(on: boolean, to: string, k: RowActs): Promise<void> {
  if (!canDo("team")) return;
  await k.once(to, async () => {
    const r = on
      ? await setupVerbs.activate(to.slice("verb:activate:".length))
      : await setupVerbs.deactivate(to.slice("verb:deactivate:".length));
    k.flash({
      tone: r.ok ? "ok" : "danger",
      msg: !r.ok ? (
        <>{r.message}</>
      ) : on ? (
        <>Activated — it is yours to use, and Setup says so.</>
      ) : (
        <>
          Activation withdrawn — nothing stops answering; Setup no longer marks it as yours. Activate it again whenever
          you like.
        </>
      ),
    });
  });
}

/** Press a row's verb: its own act, a dial, or its route, each behind its door's role. */
export async function pressVerb(verb: SetupVerb | null | undefined, k: RowActs): Promise<void> {
  if (!verb) return;
  const to = verb.to;
  if (to === "verb:request-line") return askPerson("line", to, k);
  if (to === "verb:request-repair") return askPerson("repair", to, k);
  if (to === "verb:choose-line") return k.toggleChooser();
  if (to === "verb:forwarding") return k.toggleForwarding();
  if (to === "verb:billing-checkout" || to === "verb:billing-portal") return billing(to, k);
  if (to.startsWith("verb:forwarding-test:")) return forwardingTest(to, k);
  if (to.startsWith("verb:retry-line:")) return retryLine(to, k);
  if (to.startsWith("verb:activate:")) return activation(true, to, k);
  if (to.startsWith("verb:deactivate:")) return activation(false, to, k);
  if (to.startsWith("tel:")) {
    window.location.href = to;
    return;
  }
  // A route behind a gate (Google's row, Find) goes nowhere for a role that may not press it, however it is reached.
  if (setupGated(verb)) return;
  // The Booking tool's row is a sheet on this page, not a page away (legacy-verbs.ts openBookingTool).
  if (to === CALENDAR_SETTING_ROUTE) return openBookingTool(to);
  navigate(to);
}
