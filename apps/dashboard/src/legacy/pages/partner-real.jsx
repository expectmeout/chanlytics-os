/* global React, Icon, FailedRead */
// Chanlytics — Settings › Partner (decision 0012).
//
// For a person who is not a partner: the offer, the code to choose, the terms, one press. For a partner: the link
// to hand out, the share their row holds, how many workspaces came through the link, and what the ledger holds for
// them: held, payable and paid. Nothing here states a number the database does not hold: the share is the row's, the
// count is the memberships', and every sum is partner_balance's (00203); a zero is said as a zero. Under it, the
// workspaces they brought (P4): the back office's own row and verdict for each they still sit on the team of, its
// standing and what it earned them, and Open, which goes into it the way the switcher does.

// The workspaces a partner brought, read when the pane opens (GET partner/workspaces), in the back office's rows.
const PartnerWorkspaces = ({ W, api }) => {
  const [state, setState] = React.useState({ vm: null, problem: null });
  const [again, setAgain] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    setState({ vm: null, problem: null });
    api.workspaces().then((r) => {
      if (live) setState(r.ok ? { vm: r.vm, problem: null } : { vm: null, problem: r.message });
    });
    return () => { live = false; };
  }, [again, api]);
  if (state.problem) {
    return <window.FailedRead kind="card" what={W.failedWorkspaces} why={state.problem} onRetry={() => setAgain((n) => n + 1)} testid="partner-workspaces-failed" />;
  }
  if (!state.vm) {
    return (
      <section className="fl-card set-card" data-testid="partner-workspaces-reading">
        <div className="set-row"><div className="set-row-info"><span className="set-row-hint">{W.readingWorkspaces}</span></div></div>
      </section>
    );
  }
  const vm = state.vm;
  return (
    <section className="rec-card set-card" data-testid="partner-workspaces" aria-labelledby="partner-workspaces-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="partner-workspaces-title">{W.workspaces}</h2>
        <span className="set-row-hint" data-testid="partner-workspaces-summary">{vm.summary}</span>
      </div>
      {/* What waits on the owner: the spend doors refuse until the workspace pays (0012, Risks). */}
      <p className="set-row-hint" data-testid="partner-spend">{W.spend}</p>
      {vm.rows.length > 0 && (
        <div className="cl-attn-list" data-testid="partner-workspace-rows">
          {vm.rows.map((r) => (
            <window.AttnRow
              key={r.tenantId}
              glyph="home"
              name={r.name}
              meta={r.money}
              sentence={r.standing ? `${r.sentence} ${r.standing}` : r.sentence}
              status={[r.label]}
              note={r.facts || ""}
              tone={r.tone}
              cta={r.onTeam && r.verdict ? { label: W.open, kind: "ghost", onClick: () => api.open(r.tenantId) } : null}
              onOpen={() => { if (r.onTeam && r.verdict) api.open(r.tenantId); }}
              testid={`partner-workspace-${r.tenantId}`}
              ctaTestid={`partner-open-${r.tenantId}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

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
  const [lettersBusy, setLettersBusy] = React.useState(false);
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
  // The daily letter (0014): shown only when the server says where it stands, so an older database shows no switch.
  const letters = P.dto.letters;
  const toggleLetters = async (on) => {
    if (lettersBusy) return;
    setLettersBusy(true);
    const r = await api.setLetters(on);
    setLettersBusy(false);
    if (!r.ok) flash({ tone: "warn", msg: <>Couldn't change {W.lettersFailed}: {r.message}</> });
  };
  return (
    <>
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
      {typeof letters === "boolean" ? (
        <div className="set-row" data-testid="partner-letters-row">
          <label className="set-check">
            <input
              type="checkbox"
              checked={letters}
              disabled={lettersBusy}
              aria-busy={lettersBusy || undefined}
              onChange={(e) => toggleLetters(e.target.checked)}
              data-testid="partner-letters"
            />
            <span>{W.letters}</span>
          </label>
        </div>
      ) : null}
    </section>
    <PartnerWorkspaces W={W} api={api} />
    </>
  );
};

window.PanePartner = PanePartner;
