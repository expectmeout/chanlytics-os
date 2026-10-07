/**
 * Settings › Billing on a real workspace (moved from legacy/pages/billing-real.jsx, decision 0015 step 11).
 *
 * The row as Stripe last wrote it, the plan as Stripe states it (never a figure typed here), and the two doors to
 * Stripe's own pages: Checkout for the card and the trial, the portal for the card, the invoices and cancel. A workspace
 * on a direct arrangement sees that, and no button that charges. Settings' page (settings.jsx) still draws it by its old
 * name, which seed-globals publishes (settings/globals.ts), until Settings' frame moves.
 *
 * One row at the foot of the plan card says where the WhatsApp bill is: Meta bills the messages a business starts, to the card on its
 * own WhatsApp account, and not here (contracts WHATSAPP_COST_WORDS), linked to what WhatsApp costs on Settings > Connections.
 */
import { useState, type ReactNode } from "react";
import {
  IN_APP_CLASS,
  WHATSAPP_COST_WORDS,
  type BillingDto,
  type BillingInvoiceDto,
  type BillingVM,
} from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { LinkButton } from "../../kit/link-button/link-button";
import { canDo, gate, gateTitle, routeDoor, type LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { billingVerbs as api } from "./surface";

const BILLING_PILL: Record<string, string> = {
  ok: "pill-ok",
  warn: "pill-warn",
  danger: "pill-danger",
  "": "pill-accent",
};
// An invoice's status as the pill every other status on this surface is. The words are contracts' (invoiceStatusWords);
// the tone is the page's: paid is fine, not paid yet wants a look, could not be collected is a problem, the rest are plain.
const INVOICE_PILL: Record<string, string> = { paid: "pill-ok", open: "pill-warn", uncollectible: "pill-danger" };

/** Inside the phone app (contracts IN_APP_CLASS, stamped on the document before paint). */
const inApp = (): boolean =>
  typeof document !== "undefined" && !!document.documentElement?.classList?.contains(IN_APP_CLASS);

type Busy = string | null;

/** The pane's own doors: Stripe's checkout, its portal, resume, start now, a read of Stripe, and the invoices. */
interface Doors {
  busy: Busy;
  leave: (which: "checkout" | "portal") => void;
  resume: () => void;
  ask: () => void;
  sync: () => void;
  showInvoices: () => void;
}

/** What the subscription can do from here, or, inside the phone app, that it is managed on the web. */
function acts(vm: BillingVM, subscribed: boolean, d: Doors): ReactNode {
  const { busy } = d;
  return (
    <div className="bc-chips">
      {inApp() ? (
        /* A free companion to a paid web tool offers no purchase and no call to buy elsewhere (App Store 3.1.3(f)): the status stays, the doors do not. */
        <span className="set-row-hint" data-testid="billing-in-app">
          Billing is managed from Chanlytics on the web.
        </span>
      ) : (
        <>
          {vm.actions.checkout && (
            <button
              className="btn btn-primary btn-sm"
              disabled={!!busy}
              onClick={() => d.leave("checkout")}
              data-testid="billing-checkout"
              {...gate("billing", "start the subscription")}
            >
              {busy === "checkout" ? "Opening Stripe…" : "Start the trial"}
            </button>
          )}
          {vm.actions.resume && (
            <button
              className="btn btn-primary btn-sm"
              disabled={!!busy}
              onClick={d.resume}
              data-testid="billing-resume"
              {...gate("billing", "resume the subscription")}
            >
              {busy === "resume" ? "Resuming…" : "Resume"}
            </button>
          )}
          {vm.actions.startNow && api.startWords && (
            <button
              className="btn btn-primary btn-sm"
              disabled={!!busy}
              onClick={d.ask}
              aria-busy={busy === "startNow" || undefined}
              data-testid="billing-start-now"
              {...gate("billing", "start the plan")}
            >
              {busy === "startNow" ? api.startWords.busy : api.startWords.button}
            </button>
          )}
          {vm.actions.portal && (
            <button
              className="btn btn-sm"
              disabled={!!busy}
              onClick={() => d.leave("portal")}
              data-testid="billing-portal"
              {...gate("billing", "manage the subscription")}
            >
              {busy === "portal" ? "Opening Stripe…" : "Manage billing"}
            </button>
          )}
        </>
      )}
      {subscribed && (
        <button
          className="cl-bucket-link"
          disabled={!!busy}
          onClick={d.sync}
          data-testid="billing-sync"
          {...gate("approve", "read Stripe again")}
        >
          {busy === "sync" ? "Refreshing…" : "Refresh"}
        </button>
      )}
    </div>
  );
}

/** The plan's card: its name and price, a note from Stripe's return, where it stands, its doors, and the card on file. */
function planCard(o: {
  dto: BillingDto;
  vm: BillingVM;
  owner: boolean;
  subscribed: boolean;
  note: string | null;
  dismiss: () => void;
  d: Doors;
}): ReactNode {
  const { dto, vm, owner, subscribed, note, dismiss, d } = o;
  const pill = api.pill(vm);
  // From the price Stripe states, not from splitting the sentence contracts builds out of it.
  const price = api.words.price(dto.price);
  const product = dto.price?.product_name || null;
  const acct = dto.account;
  const brand = acct?.card_brand ? acct.card_brand.charAt(0).toUpperCase() + acct.card_brand.slice(1) : null;
  return (
    <section className="fl-card set-card" data-testid="billing-real">
      <div className="fl-card-head">
        <h2 className="fl-card-title">
          Billing
          {vm.testMode && (
            <span className="pill pill-warn" style={{ marginLeft: 8 }} data-testid="billing-test-mode">
              Test mode
            </span>
          )}
        </h2>
        <span className="fl-card-sub">
          {product || (vm.mode === "direct" ? "An arrangement made with Chanlytics" : "How this workspace pays")}
        </span>
        {price && (
          <span className="set-price" data-testid="billing-price">
            {price.split(" ")[0]}
            <span className="set-price-per">{price.slice(price.indexOf(" "))}</span>
          </span>
        )}
      </div>
      {note && (
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint" data-testid="billing-note">
              {note}
            </span>
          </div>
          <button className="cl-bucket-link" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      )}
      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-label" data-testid="billing-headline">
            {vm.headline}
            {vm.mode === "stripe" && vm.status !== "none" && (
              <span className={`pill ${BILLING_PILL[pill.tone]}`} style={{ marginLeft: 8 }} data-testid="billing-pill">
                {pill.words}
              </span>
            )}
          </span>
          <span className="set-row-hint">{vm.detail}</span>
          {vm.card && !String(vm.detail || "").includes(vm.card) && (
            <span className="set-row-hint">Card on file: {vm.card}</span>
          )}
          {vm.testMode && (
            <span className="set-row-hint" data-testid="billing-test-mode-note">
              {vm.testMode}
            </span>
          )}
        </div>
        {acts(vm, subscribed, d)}
      </div>
      {brand && acct?.card_last4 && (
        <div className="set-row" data-testid="billing-method">
          <div className="set-row-info set-method">
            <span className="set-card-chip" aria-hidden="true">
              {brand}
            </span>
            <span className="set-method-body">
              <span className="set-row-label">&bull;&bull;&bull;&bull; {acct.card_last4}</span>
              <span className="set-row-hint">
                Stripe holds it. Chanlytics sees the brand and the last four digits, nothing else.
              </span>
            </span>
          </div>
          {/* No Change here: Manage billing above opens the same Stripe portal, and one door is one door. */}
        </div>
      )}
      {vm.mode === "stripe" && !owner && (
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">{gateTitle("billing", "start or manage the subscription")}</span>
          </div>
        </div>
      )}
      {/* Meta bills the WhatsApp messages the business starts, to the card on its own WhatsApp account: said where a bill is read. */}
      <div className="set-row" data-testid="billing-whatsapp">
        <div className="set-row-info">
          <span className="set-row-hint">
            <span data-testid="billing-whatsapp-line">{WHATSAPP_COST_WORDS.billingLine}</span>{" "}
            <LinkButton {...routeDoor("admin/integrations")} data-testid="billing-whatsapp-link">
              {WHATSAPP_COST_WORDS.title}
            </LinkButton>
          </span>
        </div>
      </div>
    </section>
  );
}

/** The invoices: the last twelve when asked, none yet, or each one with its date, amount, status and Stripe's page. */
function invoicesCard(invoices: BillingInvoiceDto[] | null, busy: Busy, showInvoices: () => void): ReactNode {
  return (
    <section className="fl-card set-card" data-testid="billing-invoices">
      <div className="fl-card-head">
        <h2 className="fl-card-title">Invoices</h2>
        <span className="fl-card-sub">Each one opens on Stripe&rsquo;s page.</span>
      </div>
      {invoices === null ? (
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">The last twelve, when you ask.</span>
          </div>
          <button
            className="btn btn-sm"
            disabled={!!busy}
            onClick={showInvoices}
            {...gate("billing", "read the invoices")}
          >
            {busy === "invoices" ? "Reading…" : "Show invoices"}
          </button>
        </div>
      ) : invoices.length === 0 ? (
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">No invoices yet.</span>
          </div>
        </div>
      ) : (
        <div className="set-table" role="table" aria-label="Invoices" data-testid="billing-invoice-rows">
          <div className="set-table-head" role="row">
            <span role="columnheader">Invoice</span>
            <span role="columnheader">Date</span>
            <span role="columnheader" className="set-table-num">
              Amount
            </span>
            <span role="columnheader">Status</span>
            <span role="columnheader" aria-label="On Stripe" />
          </div>
          {invoices.map((inv) => (
            <div key={inv.id} className="set-table-row" role="row" data-testid="billing-invoice">
              <span role="cell" className="set-table-key">
                {inv.number || inv.id}
              </span>
              <span role="cell" className="dim">
                {api.words.day(inv.created_at)}
              </span>
              <span role="cell" className="set-table-num">
                {api.words.money(inv.amount_due, inv.currency)}
              </span>
              <span role="cell">
                <span className={`pill ${(inv.status && INVOICE_PILL[inv.status]) || ""}`}>
                  {api.words.invoice(inv.status)}
                </span>
              </span>
              <span role="cell">
                {inv.hosted_url && (
                  <a className="cl-bucket-link" href={inv.hosted_url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export const PaneBillingReal = ({ flash }: { flash: (f: LegacyFlash) => void }) => {
  const B = useSurface("billing");
  const [busy, setBusy] = useState<Busy>(null);
  const [invoices, setInvoices] = useState<BillingInvoiceDto[] | null>(null);
  // A free trial's plan started now, asked first: it charges the card today (contracts START_PLAN_WORDS).
  const [asking, setAsking] = useState(false);
  // What the browser came back from Stripe with, said once, in the pane itself.
  const [note, setNote] = useState<string | null>(() => {
    const o = api.outcome();
    return o ? api.outcomeWords[o] || null : null;
  });
  if (B === undefined) {
    return (
      <section className="fl-card set-card" data-testid="billing-loading">
        <div className="fl-card-head">
          <h2 className="fl-card-title">Billing</h2>
        </div>
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">Reading your billing…</span>
          </div>
        </div>
      </section>
    );
  }
  if (B === null) {
    return (
      <FailedRead
        kind="card"
        what="your billing"
        body="Nothing changes while this page cannot read it."
        onRetry={() => void api.refresh()}
        testid="billing-failed"
        retryTestid="billing-retry"
      />
    );
  }
  const vm = api.vm(B.dto);
  // The doors to Stripe are billing's, the gate Setup's rows use for the same doors; reading Stripe again is an
  // operator's. Each handler asks again, so nothing reaches Stripe past a gated button.
  const owner = canDo("billing");
  const operator = canDo("approve");
  const leave = async (which: "checkout" | "portal") => {
    if (!owner) return;
    setBusy(which);
    const r = which === "checkout" ? await api.checkout() : await api.portal();
    // On success the browser is already on its way to Stripe.
    if (!r.ok) {
      setBusy(null);
      flash({ tone: "danger", msg: <>{r.message}</> });
    }
  };
  const startNow = async () => {
    if (!owner) return;
    setAsking(false);
    setBusy("startNow");
    const r = await api.startNow();
    setBusy(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>{api.startWords.started}</> : <>{r.message}</> });
  };
  const resume = async () => {
    if (!owner) return;
    setBusy("resume");
    const r = await api.resume();
    setBusy(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Resumed — the receptionist is back.</> : <>{r.message}</> });
  };
  const sync = async () => {
    if (!operator) return;
    setBusy("sync");
    const r = await api.sync();
    setBusy(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Read from Stripe just now.</> : <>{r.message}</> });
  };
  const showInvoices = async () => {
    if (!owner) return;
    setBusy("invoices");
    const r = await api.invoices();
    setBusy(null);
    setInvoices(r.ok ? r.invoices : []);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
  };
  const subscribed = vm.mode === "stripe" && vm.status !== "none";
  const d: Doors = {
    busy,
    leave: (which) => void leave(which),
    resume: () => void resume(),
    ask: () => {
      if (owner) setAsking(true);
    },
    sync: () => void sync(),
    showInvoices: () => void showInvoices(),
  };
  return (
    <>
      {planCard({ dto: B.dto, vm, owner, subscribed, note, dismiss: () => setNote(null), d })}
      {subscribed && invoicesCard(invoices, busy, d.showInvoices)}
      {asking && api.startWords ? (
        <Confirm
          question={api.startWords.question}
          detail={api.startWords.detail(vm.plan, vm.card)}
          yes={api.startWords.yes}
          no={api.startWords.no}
          onYes={() => void startNow()}
          onNo={() => setAsking(false)}
          testid="billing-start-now"
        />
      ) : null}
    </>
  );
};
