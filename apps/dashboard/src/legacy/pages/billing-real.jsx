/* global React, Icon */
// Chanlytics — Settings › Billing on a real workspace.
//
// The row as Stripe last wrote it, the plan as Stripe states it (never a
// figure typed here), and the two doors to Stripe's own pages: Checkout for
// the card and the trial, the portal for the card, the invoices and cancel.
// A workspace on a direct arrangement sees that, and no button that charges.

const BILLING_PILL = { ok: "pill-ok", warn: "pill-warn", danger: "pill-danger", "": "pill-accent" };

const PaneBillingReal = ({ flash }) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:billing", bump);
    return () => window.removeEventListener("surface:billing", bump);
  }, []);
  const [busy, setBusy] = React.useState(null);
  const [invoices, setInvoices] = React.useState(null);
  // What the browser came back from Stripe with, said once, in the pane itself.
  const [note, setNote] = React.useState(() => {
    const o = window.__billing ? window.__billing.outcome() : null;
    return o ? window.__billing.outcomeWords[o] || null : null;
  });
  const api = window.__billing;
  const B = window.__BILLING_ACCOUNT;
  if (!api) return null;
  if (B === undefined) {
    return (
      <section className="fl-card set-card" data-testid="billing-loading">
        <div className="fl-card-head"><span className="fl-card-title">Billing</span></div>
        <div className="set-row"><div className="set-row-info"><span className="set-row-hint">Reading your billing…</span></div></div>
      </section>
    );
  }
  if (B === null) {
    return (
      <section className="fl-card set-card" data-testid="billing-failed">
        <div className="fl-card-head"><span className="fl-card-title">Billing</span><span className="fl-card-sub">Couldn&rsquo;t be read right now</span></div>
        <div className="set-row"><div className="set-row-info"><span className="set-row-hint">Nothing changes while this page cannot read it. Try again in a moment.</span></div>
          <button className="btn btn-sm" onClick={() => api.refresh()} data-testid="billing-retry">Retry</button></div>
      </section>
    );
  }
  const vm = api.vm(B.dto);
  const owner = window.canDo ? window.canDo("team") : false;
  const operator = window.canDo ? window.canDo("approve") : false;
  const leave = async (which) => {
    setBusy(which);
    const r = which === "checkout" ? await api.checkout() : await api.portal();
    // On success the browser is already on its way to Stripe.
    if (!r.ok) { setBusy(null); flash({ msg: <>{r.message}</> }); }
  };
  const resume = async () => {
    setBusy("resume");
    const r = await api.resume();
    setBusy(null);
    flash({ msg: r.ok ? <>Resumed — the receptionist is back.</> : <>{r.message}</> });
  };
  const sync = async () => {
    setBusy("sync");
    const r = await api.sync();
    setBusy(null);
    flash({ msg: r.ok ? <>Read from Stripe just now.</> : <>{r.message}</> });
  };
  const showInvoices = async () => {
    setBusy("invoices");
    const r = await api.invoices();
    setBusy(null);
    setInvoices(r.ok ? r.invoices : []);
    if (!r.ok) flash({ msg: <>{r.message}</> });
  };
  const subscribed = vm.mode === "stripe" && vm.status !== "none";

  return (
    <>
      <section className="fl-card set-card" data-testid="billing-real">
        <div className="fl-card-head">
          <span className="fl-card-title">Billing</span>
          <span className="fl-card-sub">{vm.plan || (vm.mode === "direct" ? "An arrangement made with Chanlytics" : "How this workspace pays")}</span>
        </div>
        {note && (
          <div className="set-row">
            <div className="set-row-info"><span className="set-row-hint" data-testid="billing-note">{note}</span></div>
            <button className="cl-bucket-link" onClick={() => setNote(null)}>Dismiss</button>
          </div>
        )}
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-label" data-testid="billing-headline">
              {vm.headline}
              {vm.mode === "stripe" && vm.status !== "none" && <span className={`pill ${BILLING_PILL[vm.tone] || "pill-accent"}`} style={{ marginLeft: 8 }}>{vm.status.replace(/_/g, " ")}</span>}
            </span>
            <span className="set-row-hint">{vm.detail}</span>
            {vm.card && <span className="set-row-hint">Card on file: {vm.card}</span>}
          </div>
          <div className="bc-chips">
            {vm.actions.checkout && <button className="btn btn-primary btn-sm" disabled={!owner || !!busy} onClick={() => leave("checkout")} data-testid="billing-checkout">{busy === "checkout" ? "Opening Stripe…" : "Start the trial"}</button>}
            {vm.actions.resume && <button className="btn btn-primary btn-sm" disabled={!owner || !!busy} onClick={resume} data-testid="billing-resume">{busy === "resume" ? "Resuming…" : "Resume"}</button>}
            {vm.actions.portal && <button className="btn btn-sm" disabled={!owner || !!busy} onClick={() => leave("portal")} data-testid="billing-portal">{busy === "portal" ? "Opening Stripe…" : "Manage billing"}</button>}
            {subscribed && <button className="cl-bucket-link" disabled={!operator || !!busy} onClick={sync} data-testid="billing-sync">{busy === "sync" ? "Refreshing…" : "Refresh"}</button>}
          </div>
        </div>
        {vm.mode === "stripe" && !owner && (
          <div className="set-row"><div className="set-row-info"><span className="set-row-hint">Only an owner can start or manage the subscription.</span></div></div>
        )}
      </section>

      {subscribed && (
        <section className="fl-card set-card" data-testid="billing-invoices">
          <div className="fl-card-head"><span className="fl-card-title">Invoices</span><span className="fl-card-sub">As Stripe lists them; each opens on Stripe&rsquo;s page</span></div>
          {invoices === null ? (
            <div className="set-row">
              <div className="set-row-info"><span className="set-row-hint">The last twelve, when you ask.</span></div>
              <button className="btn btn-sm" disabled={!owner || !!busy} onClick={showInvoices}>{busy === "invoices" ? "Reading…" : "Show invoices"}</button>
            </div>
          ) : invoices.length === 0 ? (
            <div className="set-row"><div className="set-row-info"><span className="set-row-hint">No invoices yet.</span></div></div>
          ) : invoices.map((inv) => (
            <div key={inv.id} className="set-row">
              <div className="set-row-info">
                <span className="set-row-label">{inv.number || inv.id} · {api.words.money(inv.amount_due, inv.currency)}</span>
                <span className="set-row-hint">{api.words.day(inv.created_at)} · {inv.status || "—"}</span>
              </div>
              {inv.hosted_url && <a className="cl-bucket-link" href={inv.hosted_url} target="_blank" rel="noreferrer">Open</a>}
            </div>
          ))}
        </section>
      )}
    </>
  );
};

window.PaneBillingReal = PaneBillingReal;
