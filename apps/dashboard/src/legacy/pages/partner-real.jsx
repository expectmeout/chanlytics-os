/* global React, Icon, FailedRead */
// Chanlytics — Settings › Partner (decision 0012).
//
// For a person who is not a partner: the offer, the code to choose, the terms, one press. For a partner: the link
// to hand out, the share their row holds, how many workspaces came through the link, and what the ledger holds for
// them: held, payable and paid. Nothing here states a number the database does not hold: the share is the row's, the
// count is the memberships', and every sum is partner_balance's (00200); a zero is said as a zero.

const PanePartner = ({ flash }) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:partner", bump);
    return () => window.removeEventListener("surface:partner", bump);
  }, []);
  const [code, setCode] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const api = window.__partner;
  const P = window.__PARTNER;
  if (!api) return null;
  const W = api.words;
  if (P === undefined) {
    return (
      <section className="fl-card set-card" data-testid="partner-loading">
        <div className="fl-card-head"><h2 className="fl-card-title">{W.tab}</h2></div>
        <div className="set-row"><div className="set-row-info"><span className="set-row-hint">{W.reading}</span></div></div>
      </section>
    );
  }
  if (P === null) {
    return (
      <FailedRead kind="card" what={W.failed} body="Nothing changes while this page cannot read it." onRetry={() => api.refresh()} testid="partner-failed" retryTestid="partner-retry" />
    );
  }

  if (!P.dto) {
    const become = async (e) => {
      e.preventDefault();
      if (busy || !agreed) return;
      setBusy(true);
      setError(null);
      const r = await api.become(code);
      setBusy(false);
      if (!r.ok) { setError(r.message); return; }
      flash({ tone: "ok", msg: <>You are a partner. Your link is below.</> });
    };
    return (
      <section className="rec-card set-card" data-testid="set-partner-offer" aria-labelledby="set-partner-title">
        <div className="rec-card-head">
          <h2 className="rec-card-title" id="set-partner-title">{W.title}</h2>
        </div>
        <p className="set-row-hint" data-testid="partner-offer">{W.offer} The share is {api.offerShare}.</p>
        <form onSubmit={become} className="set-form" data-testid="partner-become-form">
          <label className="set-field">
            <span className="set-field-label">{W.codeLabel}</span>
            <input
              className="input"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(null); }}
              placeholder="your-name"
              autoComplete="off"
              spellCheck={false}
              data-testid="partner-code"
            />
            <span className="set-row-hint">{W.codeHint}</span>
          </label>
          <p className="set-row-hint" data-testid="partner-terms">{W.terms}</p>
          <label className="set-check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="partner-agree" />
            <span>{W.termsAgree}</span>
          </label>
          {error ? <p className="set-error" role="alert" data-testid="partner-error">{error}</p> : null}
          <button type="submit" className="btn" disabled={busy || !agreed || !code.trim()} aria-busy={busy || undefined} data-testid="partner-become">
            {busy ? W.becoming : W.become}
          </button>
        </form>
      </section>
    );
  }

  const vm = api.vm(P.dto, P.balance);
  const E = vm.earnings;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(vm.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      flash({ tone: "warn", msg: <>Couldn't copy — select the link and copy it yourself.</> });
    }
  };
  return (
    <section className="rec-card set-card" data-testid="set-partner" aria-labelledby="set-partner-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="set-partner-title">{W.tab}</h2>
      </div>
      {vm.standing ? <p className="set-row-hint" role="status" data-testid="partner-standing">{vm.standing}</p> : null}
      <div className="set-row" data-testid="partner-link-row">
        <div className="set-row-info">
          <span className="set-row-label">{W.linkLabel}</span>
          <code className="set-row-value" data-testid="partner-link">{vm.link}</code>
        </div>
        <button type="button" className="btn btn-sm" onClick={copy} data-testid="partner-copy">
          <Icon name="copy" size={13} /> {copied ? W.copied : W.copy}
        </button>
      </div>
      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-label">Your share</span>
          <span className="set-row-hint" data-testid="partner-share">{vm.share}, for as long as it pays.</span>
        </div>
      </div>
      <div className="set-row" data-testid="partner-earnings">
        <div className="set-row-info">
          <span className="set-row-label">{W.earnings}</span>
          {E.none ? (
            <span className="set-row-hint" data-testid="partner-earnings-none">{W.noneYet}</span>
          ) : (
            <>
              <span className="set-row-hint" data-testid="partner-held">{E.held}</span>
              <span className="set-row-hint" data-testid="partner-payable">{E.payable}</span>
              <span className="set-row-hint" data-testid="partner-paid">{E.paid}</span>
            </>
          )}
        </div>
      </div>
      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-hint" data-testid="partner-brought">{vm.brought}</span>
          <span className="set-row-hint" data-testid="partner-since">{vm.since}</span>
        </div>
      </div>
    </section>
  );
};

window.PanePartner = PanePartner;
