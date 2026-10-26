/**
 * Go live, pay (decision 0073, R16, canvas 5A, 5A·a–5A·d): what starts and what it asks of the owner after, the plan's
 * price and the trial as it is (FIRST_RUN_TRIAL_DAYS, never a promise the checkout does not keep), and the card in the
 * page: Stripe's embedded Checkout, mounted on the press (legacy-bridge/billing/embedded.ts). Where the edge holds no
 * publishable key, the press goes to Stripe's own page as it did. A workspace on a trial starts its plan now (the number
 * is never on a trial); one that already pays presses Go live and the number is bought.
 *
 * The press marks the choice pressed (the tab's), so the buy goes on by itself once the plan lands (Switch it on).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FIRST_RUN_HELPERS, type FirstRunGoLiveVM, type FirstRunPhoneVM } from "@chanlytics/contracts";
import { mountCheckout, type EmbeddedCheckout } from "@/legacy-bridge/billing/embedded";
import { canDo, gate, type LegacyFlash } from "../../../legacy-verbs";
import { billingVerbs } from "../../../settings/billing/surface";
import { setupVerbs } from "../../surface";
import type { KeptPhoneChoice } from "../memory";
import { W } from "../words";

const GW = FIRST_RUN_HELPERS.goLiveWords;

/** What starts at Go live, a row each, and what it asks of the owner after. */
function startsList(pay: NonNullable<FirstRunGoLiveVM["pay"]>): ReactNode {
  return (
    <ul className="fr-starts" data-testid="fr-pay-starts">
      {pay.starts.map((s) => (
        <li key={s.key} className="fr-start" data-testid={`fr-pay-start-${s.key}`}>
          <span className="fr-sentence">{s.label}</span>
          <span className="fr-detail">{s.after}</span>
        </li>
      ))}
    </ul>
  );
}

/** The plan: its price, the trial as it is, and what the press starts. */
function planPane(pay: NonNullable<FirstRunGoLiveVM["pay"]>): ReactNode {
  return (
    <div className="panel fr-plan" data-testid="fr-pay-plan">
      <span className="fr-plan-offer">
        {pay.price ?? ""} <span className="fr-detail">{pay.trial}</span>
      </span>
      <span className="fr-detail">{pay.note}</span>
      <span className="fr-label">{GW.afterTitle}</span>
      <ol className="fr-steps">
        {pay.after.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ol>
    </div>
  );
}

export function FrPay(o: {
  gl: FirstRunGoLiveVM;
  ph: FirstRunPhoneVM;
  choice: KeptPhoneChoice | null;
  setChoice: (c: KeptPhoneChoice | null) => void;
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
  back: string | null;
}) {
  const { gl, ph, choice, setChoice, flash, go, back } = o;
  const [state, setState] = useState<"none" | "opening" | "mounted">("none");
  const el = useRef<HTMLDivElement | null>(null);
  const checkout = useRef<EmbeddedCheckout | null>(null);
  useEffect(() => () => checkout.current?.destroy(), []);
  const pay = gl.pay;
  const cta = ph.cta;
  if (!pay) return null;
  const c: KeptPhoneChoice = choice || { way: ph.way, number: null, pick: null, pending: false };
  const next: KeptPhoneChoice = { ...c, way: ph.way, pending: true, sent: false, returnedAt: null };
  const press = async () => {
    if (!cta || cta.held || state !== "none") return;
    if (cta.act === "buy") {
      if (canDo("disconnect")) setChoice(next);
      return;
    }
    if (!canDo("billing")) return;
    setChoice(next);
    if (cta.act === "startNow") {
      setState("opening");
      const r = await billingVerbs.startNow();
      setState("none");
      if (!r.ok) {
        setChoice({ ...next, pending: false });
        flash({ tone: "danger", msg: <>{r.message}</> });
      }
      return;
    }
    setState("opening");
    const r = await billingVerbs.checkoutInPage("start");
    if (!r.ok) {
      setState("none");
      setChoice({ ...next, pending: false });
      return flash({ tone: "danger", msg: <>{r.message}</> });
    }
    // Gone to Stripe's own page (no publishable key here): it comes back to Go live with the outcome.
    if ("left" in r || !el.current) return;
    setState("mounted");
    checkout.current = await mountCheckout(el.current, {
      key: r.key,
      secret: r.secret,
      // Paid without leaving the page: confirming until Stripe's webhook starts the plan, which Setup's read shows.
      onComplete: () => {
        setChoice({ ...next, returnedAt: Date.now() });
        void setupVerbs.peek();
      },
      failed: () => {
        setState("none");
        setChoice({ ...next, pending: false });
        flash({ tone: "danger", msg: <>{GW.checkoutFailed}</> });
      },
    });
  };
  return (
    <div className="fr-golive fr-pay" data-testid="fr-pay">
      <div className="fr-pay-main">
        {startsList(pay)}
        {planPane(pay)}
      </div>
      <section className="panel fr-pane fr-pay-box" aria-label={GW.card} data-testid="fr-pay-card">
        <h2 className="fr-sub">{GW.card}</h2>
        <div ref={el} className="fr-checkout" data-testid="fr-checkout" hidden={state !== "mounted"} />
        {state === "mounted" ? null : (
          <button
            type="button"
            className="btn btn-lg btn-primary fr-go"
            onClick={() => void press()}
            aria-disabled={cta?.held ? true : undefined}
            aria-busy={state === "opening" || undefined}
            data-testid="fr-pay-go"
            {...gate(cta?.act === "buy" ? "disconnect" : "billing", "start the plan")}
          >
            {cta?.label ?? W.continue}
          </button>
        )}
        {cta?.held ? (
          <p className="fr-held" data-testid="fr-pay-held">
            {cta.held}
          </p>
        ) : null}
        <p className="fr-detail">{pay.secured}</p>
      </section>
      <div className="fr-foot">
        {back ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => go(back)} data-testid="fr-back">
            {W.back}
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

/** Confirming with the bank (canvas 5A·c): the page moves on by itself. */
export function FrConfirming() {
  return (
    <div className="panel fr-pane fr-status" role="status" data-testid="fr-pay-confirming">
      <span className="fr-pulse" aria-hidden="true" />
      <span className="fr-sentence">{GW.confirming}</span>
      <span className="fr-detail">{GW.confirmingLead}</span>
      <span className="fr-detail">{GW.confirmingFoot}</span>
    </div>
  );
}

/** No line provider here (canvas 5A·d): a person sets the line up; what is connected goes live now, said where it is. */
export function FrNoProvider({
  now,
  flash,
  leave,
}: {
  now: string | null;
  flash: (f: LegacyFlash) => void;
  leave: (to: string) => void;
}) {
  const N = GW.noProvider;
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (busy || !canDo("approve")) return;
    setBusy(true);
    const r = await setupVerbs.request("line");
    setBusy(false);
    flash(r.ok ? { tone: "ok", msg: <>{N.lead}</> } : { tone: "danger", msg: <>{r.message}</> });
  };
  return (
    <div className="panel fr-pane" data-testid="fr-no-provider">
      <h2 className="fr-sub">{N.heading}</h2>
      <p className="fr-quiet">{N.lead}</p>
      <ul className="fr-steps">
        {now ? <li>{now}</li> : null}
        <li>{N.calls}</li>
      </ul>
      <div className="fr-links">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void ask()}
          disabled={busy}
          data-testid="fr-no-provider-ask"
          {...gate("approve", "ask for a line")}
        >
          {N.ask}
        </button>
        <button type="button" className="link-btn" onClick={() => leave("today")} data-testid="fr-no-provider-without">
          {N.without}
        </button>
      </div>
    </div>
  );
}
