/* global React, Icon, FailedRead */
// Chanlytics — Settings › Partner (decision 0012).
//
// For a person who is not a partner: the offer, the code to choose, the terms, one press. For a partner: the link
// to hand out, the share their row holds, how many workspaces came through the link, and what the ledger holds for
// them: held, payable and paid. Nothing here states a number the database does not hold: the share is the row's, the
// count is the memberships', and every sum is partner_balance's (00203); a zero is said as a zero. Under it, the
// workspaces they brought (P4): the back office's own row and verdict for each they still sit on the team of, its
// standing and what it earned them, and Open, which goes into it the way the switcher does. And (0016) a workspace set
// up for a business: the form, and each one handed over, what its handover says, with Send again until it is accepted.

// Set a workspace up for a business and hand it to its owner (0016): the name, the owner's address, one press. On
// success the bridge goes into the new workspace at its first run; if the invitation did not go, it stays to say so.
const PartnerSetUp = ({ api, flash, full, onMade }) => {
  const H = api.handoverWords;
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const make = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await api.setUp({ name: name.trim(), email: email.trim() });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    if (!r.sent) { setOpen(false); flash({ tone: "warn", msg: <>{H.notSent}</> }); onMade(); }
  };
  return (
    <section className="rec-card set-card" data-testid="partner-setup" aria-labelledby="partner-setup-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="partner-setup-title">{H.start}</h2>
      </div>
      <p className="set-row-hint" data-testid="partner-setup-intro">{H.intro}</p>
      {full ? <p className="set-row-hint" role="status" data-testid="partner-setup-full">{full}</p> : null}
      {!full && !open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)} data-testid="partner-setup-open">{H.start}</button>
      ) : null}
      {!full && open ? (
        <form onSubmit={make} className="set-form" data-testid="partner-setup-form">
          <label className="set-field">
            <span className="set-field-label">{H.nameLabel}</span>
            <input className="input" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} autoComplete="organization" data-testid="partner-setup-name" />
          </label>
          <label className="set-field">
            <span className="set-field-label">{H.emailLabel}</span>
            <input className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} autoComplete="off" spellCheck={false} data-testid="partner-setup-email" />
            <span className="set-row-hint">{H.emailHint}</span>
          </label>
          {error ? <p className="set-error" role="alert" data-testid="partner-setup-error">{error}</p> : null}
          <div className="set-form-actions">
            <button type="submit" className="btn" disabled={busy || name.trim().length < 2 || !email.trim()} aria-busy={busy || undefined} data-testid="partner-setup-make">
              {busy ? H.making : H.make}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy} data-testid="partner-setup-cancel">{H.cancel}</button>
          </div>
        </form>
      ) : null}
    </section>
  );
};

// Send a handover again, to the address it went to or another, until its owner accepts it.
const HandoverResend = ({ api, h, flash, onSent }) => {
  const H = api.handoverWords;
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState(h.email);
  const [busy, setBusy] = React.useState(false);
  if (!h.canResend) return null;
  if (!open) {
    return <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(true)} data-testid={`partner-resend-open-${h.tenantId}`}>{H.resend}</button>;
  }
  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await api.resend(h.tenantId, email.trim());
    setBusy(false);
    if (!r.ok) { flash({ tone: "warn", msg: <>Couldn't send {H.failedResend}: {r.message}</> }); return; }
    setOpen(false);
    flash(r.sent ? { tone: "ok", msg: <>{H.sentAgain}</> } : { tone: "warn", msg: <>{H.notSent}</> });
    onSent();
  };
  return (
    <form onSubmit={send} className="set-form" data-testid={`partner-resend-${h.tenantId}`}>
      <label className="set-field">
        <span className="set-field-label">{H.resendTo}</span>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} spellCheck={false} data-testid={`partner-resend-email-${h.tenantId}`} />
      </label>
      <button type="submit" className="btn btn-sm" disabled={busy || !email.trim()} aria-busy={busy || undefined} data-testid={`partner-resend-send-${h.tenantId}`}>
        {busy ? H.resending : H.resend}
      </button>
    </form>
  );
};

// The workspaces the partner set up that wait for an owner, or were declined: what each handover says, and Send again.
const PartnerHandovers = ({ api, handovers, flash, onSent }) => {
  const open = Object.values(handovers).filter((h) => h.state !== "accepted");
  if (!open.length) return null;
  return (
    <section className="rec-card set-card" data-testid="partner-handovers" aria-labelledby="partner-handovers-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="partner-handovers-title">{api.handoverWords.waiting}</h2>
      </div>
      {open.map((h) => (
        <div className="set-row" key={h.tenantId} data-testid={`partner-handover-${h.tenantId}`}>
          <div className="set-row-info">
            <span className="set-row-label">{h.name}</span>
            <span className="set-row-hint" data-testid={`partner-handover-sentence-${h.tenantId}`}>{h.sentence}</span>
          </div>
          <HandoverResend api={api} h={h} flash={flash} onSent={onSent} />
        </div>
      ))}
    </section>
  );
};

// The workspaces a partner brought, read when the pane opens (GET partner/workspaces), in the back office's rows.
const PartnerWorkspaces = ({ W, api, flash, active }) => {
  const [state, setState] = React.useState({ vm: null, handovers: {}, full: null, problem: null });
  const [again, setAgain] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    setState({ vm: null, handovers: {}, full: null, problem: null });
    api.workspaces().then((r) => {
      if (!live) return;
      setState(r.ok ? { vm: r.vm, handovers: r.handovers || {}, full: r.full || null, problem: null } : { vm: null, handovers: {}, full: null, problem: r.message });
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
  const reread = () => setAgain((n) => n + 1);
  return (
    <>
    {active ? <PartnerSetUp api={api} flash={flash} full={state.full} onMade={reread} /> : null}
    <PartnerHandovers api={api} handovers={state.handovers} flash={flash} onSent={reread} />
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
    </>
  );
};

// The daily letter (0014): shown only when the server says where it stands, so an older database shows no switch.
const PartnerLettersRow = ({ W, api, letters, flash }) => {
  const [busy, setBusy] = React.useState(false);
  if (typeof letters !== "boolean") return null;
  const toggle = async (on) => {
    if (busy) return;
    setBusy(true);
    const r = await api.setLetters(on);
    setBusy(false);
    if (!r.ok) flash({ tone: "warn", msg: <>Couldn't change {W.lettersFailed}: {r.message}</> });
  };
  return (
    <div className="set-row" data-testid="partner-letters-row">
      <label className="set-check">
        <input
          type="checkbox"
          checked={letters}
          disabled={busy}
          aria-busy={busy || undefined}
          onChange={(e) => toggle(e.target.checked)}
          data-testid="partner-letters"
        />
        <span>{W.letters}</span>
      </label>
    </div>
  );
};

// Two-step sign-in (0013): a partner's account changes the receptionist of every business they brought, so it asks
// for an authenticator's code at sign-in. Read from Supabase Auth, which holds the factor; set up in two presses:
// scan (or type the key), then the first code, which turns it on. A project with TOTP switched off says so.
const PartnerSecondFactor = ({ api, flash, onOn }) => {
  const F = api.secondFactor;
  const W = F.words;
  const [state, setState] = React.useState({ phase: "reading" });
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    F.state().then((r) => {
      if (live) setState(r.ok ? { phase: r.on ? "on" : "off" } : { phase: "failed", message: r.message });
    });
    return () => { live = false; };
  }, [F]);
  // Before becoming a partner, the offer waits on this (M3): partner_become asks for a session that showed a code.
  React.useEffect(() => {
    if (state.phase === "on" && onOn) onOn();
  }, [state.phase, onOn]);
  const start = async () => {
    setBusy(true);
    setError(null);
    const r = await F.start();
    setBusy(false);
    if (r.ok) setState({ phase: "setup", enrolment: r.enrolment });
    else if (r.unavailable) setState({ phase: "unavailable" });
    else setError(r.message);
  };
  const confirm = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const refused = await F.confirm(state.enrolment.factorId, code);
    setBusy(false);
    if (refused) { setError(refused); return; }
    setCode("");
    setState({ phase: "on" });
    flash({ tone: "ok", msg: <>{W.done}</> });
  };
  const hint = (id, text) => <span className="set-row-hint" data-testid={id}>{text}</span>;
  return (
    <div className="set-row" data-testid="partner-second-factor">
      <div className="set-row-info">
        <span className="set-row-label">{W.title}</span>
        {state.phase === "reading" && hint("partner-second-factor-reading", W.reading)}
        {state.phase === "failed" && hint("partner-second-factor-failed", `Couldn't read ${W.failed}: ${state.message}`)}
        {state.phase === "unavailable" && hint("partner-second-factor-unavailable", W.unavailable)}
        {state.phase === "on" && hint("partner-second-factor-on", W.on)}
        {state.phase === "off" && hint("partner-second-factor-intro", W.intro)}
        {state.phase === "setup" && (
          <form onSubmit={confirm} className="set-form" data-testid="partner-second-factor-setup">
            <span className="set-row-hint">{W.scan}</span>
            <img src={state.enrolment.qr} alt="" width="176" height="176" data-testid="partner-second-factor-qr" />
            <span className="set-row-hint">{W.keyLabel}: <code data-testid="partner-second-factor-key">{state.enrolment.secret}</code></span>
            <label className="set-field">
              <span className="set-field-label">{W.codeLabel}</span>
              <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => { setCode(e.target.value); setError(null); }} data-testid="partner-second-factor-code" />
            </label>
            <div className="set-form-actions">
              <button type="submit" className="btn" disabled={busy || !code.trim()} aria-busy={busy || undefined} data-testid="partner-second-factor-confirm">
                {busy ? W.confirming : W.confirm}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setState({ phase: "off" }); setCode(""); setError(null); }} disabled={busy} data-testid="partner-second-factor-cancel">{W.cancel}</button>
            </div>
          </form>
        )}
        {(state.phase === "on" || state.phase === "setup") && hint("partner-second-factor-lost", W.lost)}
        {error ? <p className="set-error" role="alert" data-testid="partner-second-factor-error">{error}</p> : null}
      </div>
      {state.phase === "off" && (
        <button type="button" className="btn btn-sm" onClick={start} disabled={busy} aria-busy={busy || undefined} data-testid="partner-second-factor-start">
          {busy ? W.starting : W.start}
        </button>
      )}
    </div>
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
  const [factorOn, setFactorOn] = React.useState(false);
  const factorIsOn = React.useCallback(() => setFactorOn(true), []);
  const [joined, setJoined] = React.useState(0);
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
    // Two-step sign-in comes first (0013, M3): the offer's own row, and the button waits for it to be on.
    const needsFactor = !!api.secondFactor && !factorOn;
    const become = async (e) => {
      e.preventDefault();
      if (busy || !agreed || needsFactor) return;
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
        {api.secondFactor ? (
          <>
            {needsFactor ? <p className="set-row-hint" data-testid="partner-factor-first">{api.secondFactor.words.becomeFirst}</p> : null}
            <PartnerSecondFactor api={api} flash={flash} onOn={factorIsOn} />
          </>
        ) : null}
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
          <button type="submit" className="btn" disabled={busy || !agreed || !code.trim() || needsFactor} aria-busy={busy || undefined} data-testid="partner-become">
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
      <PartnerLettersRow W={W} api={api} letters={P.dto.letters} flash={flash} />
      {api.secondFactor ? <PartnerSecondFactor api={api} flash={flash} /> : null}
    </section>
    <PartnerInvitations api={api} flash={flash} onJoined={() => setJoined((n) => n + 1)} />
    <PartnerWorkspaces key={joined} W={W} api={api} flash={flash} active={P.dto.status === "active"} />
    </>
  );
};

// The workspaces asking this partner to join them (0020): each says who asked and until when. Joining says whether it
// earns a share, here on the pane, and the partner's workspaces are read again so it is there to open.
const PartnerInvitations = ({ api, flash, onJoined }) => {
  const W = api.inviteWords;
  const [state, setState] = React.useState({ rows: [], problem: null });
  const [busy, setBusy] = React.useState(null);
  const [again, setAgain] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    api.invitations().then((r) => { if (live) setState(r.ok ? { rows: r.rows, problem: null } : { rows: [], problem: r.message }); });
    return () => { live = false; };
  }, [api, again]);
  if (state.problem) {
    return <window.FailedRead kind="card" what={W.failedInvitations} why={state.problem} onRetry={() => setAgain((n) => n + 1)} testid="partner-invitations-failed" />;
  }
  if (!state.rows.length) return null;
  const answer = async (workspaceId, join) => {
    if (busy) return;
    setBusy({ id: workspaceId, join });
    const r = await api.answer(workspaceId, join);
    if (r.ok) setState((s) => ({ ...s, rows: s.rows.filter((x) => x.workspaceId !== workspaceId) }));
    setBusy(null);
    if (!r.ok) { flash({ tone: "warn", msg: <>Couldn't answer {W.failedAnswer}: {r.message}</> }); return; }
    if (join) { flash({ tone: "ok", msg: <>{r.message}</> }); onJoined(); }
    setAgain((n) => n + 1);
  };
  const pressing = (id, join) => !!busy && busy.id === id && busy.join === join;
  return (
    <section className="rec-card set-card" data-testid="partner-invitations" aria-labelledby="partner-invitations-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="partner-invitations-title">{W.invitationsTitle}</h2>
      </div>
      {state.rows.map((i) => (
        <div className="set-row" key={i.workspaceId} data-testid={`partner-invitation-${i.workspaceId}`}>
          <div className="set-row-info"><span className="set-row-hint">{i.sentence}</span></div>
          <div className="set-form-actions">
            <button type="button" className="btn btn-sm" onClick={() => answer(i.workspaceId, true)} disabled={!!busy} aria-busy={pressing(i.workspaceId, true) || undefined} data-testid={`partner-invitation-join-${i.workspaceId}`}>
              {pressing(i.workspaceId, true) ? W.accepting : W.accept}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => answer(i.workspaceId, false)} disabled={!!busy} aria-busy={pressing(i.workspaceId, false) || undefined} data-testid={`partner-invitation-decline-${i.workspaceId}`}>
              {pressing(i.workspaceId, false) ? W.declining : W.decline}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
};

// Settings › Team, below the team (0020): the workspace's partner, or asking one by their code. The owner's alone: for
// anyone else the read is refused and nothing is drawn, and an owner's View as another role sees what that role does.
const TeamPartnerCard = ({ flash }) => {
  const api = window.__partner;
  const W = api && api.inviteWords;
  const [state, setState] = React.useState({ vm: null, problem: null, hidden: false });
  const [again, setAgain] = React.useState(0);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [, setViewing] = React.useState(0);
  React.useEffect(() => {
    if (!api) return undefined;
    let live = true;
    api.team.read().then((r) => {
      if (!live) return;
      if (r.ok) setState({ vm: r.vm, problem: null, hidden: false });
      else setState({ vm: null, problem: r.message, hidden: r.code === "forbidden" });
    });
    return () => { live = false; };
  }, [api, again]);
  // View as is announced as team:changed (ST_STORE.setViewAs).
  React.useEffect(() => {
    const bump = () => setViewing((n) => n + 1);
    window.addEventListener("team:changed", bump);
    return () => window.removeEventListener("team:changed", bump);
  }, []);
  const previewing = !!(window.ST_STORE && window.ST_STORE.viewAsRole && window.ST_STORE.viewAsRole !== "owner");
  if (!api || state.hidden || previewing) return null;
  if (state.problem) {
    return <window.FailedRead kind="card" what={W.failed} why={state.problem} onRetry={() => setAgain((n) => n + 1)} testid="team-partner-failed" />;
  }
  if (!state.vm) return null;
  const vm = state.vm;
  const ask = async (e) => {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    const r = await api.team.invite(code);
    setBusy(false);
    // Read again either way: a refusal that came after the ask was kept (a timeout) must not invite a second press.
    setAgain((n) => n + 1);
    if (!r.ok) { setError(r.message); return; }
    setCode("");
    if (!r.sent) flash({ tone: "warn", msg: <>{W.notSent}</> });
  };
  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    const r = await api.team.withdraw();
    setBusy(false);
    if (!r.ok) { flash({ tone: "warn", msg: <>Couldn't take back {W.failedAnswer}: {r.message}</> }); return; }
    setAgain((n) => n + 1);
  };
  return (
    <section className="rec-card set-card" data-testid="team-partner" aria-labelledby="team-partner-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="team-partner-title">{W.title}</h2>
      </div>
      {vm.sentence ? <p className="set-row-hint" data-testid={`team-partner-${vm.state}`}>{vm.sentence}</p> : null}
      {vm.canWithdraw ? (
        <div className="set-form-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={withdraw} disabled={busy} aria-busy={busy || undefined} data-testid="team-partner-withdraw" {...window.gate("team", "take back the invitation")}>
            {busy ? W.withdrawing : W.withdraw}
          </button>
        </div>
      ) : null}
      {vm.canInvite ? (
        <form onSubmit={ask} className="set-form" data-testid="team-partner-form">
          {vm.state === "none" ? <p className="set-row-hint">{W.intro}</p> : null}
          <label className="set-field">
            <span className="set-field-label">{W.codeLabel}</span>
            <input className="input" value={code} onChange={(e) => { setCode(e.target.value); setError(null); }} placeholder={W.codePlaceholder} autoComplete="off" spellCheck={false} data-testid="team-partner-code" />
          </label>
          {error ? <p className="set-error" role="alert" data-testid="team-partner-error">{error}</p> : null}
          <button type="submit" className="btn" disabled={busy || !code.trim()} aria-busy={busy || undefined} data-testid="team-partner-ask" {...window.gate("team", "ask a partner to join")}>
            {busy ? W.inviting : W.invite}
          </button>
        </form>
      ) : null}
    </section>
  );
};

// Settings › Team: the team, then its partner card. Carried on the partner pane's own global, as its Team.
const PaneTeam = ({ flash }) => (
  <>
    <window.TeamSection flash={flash} />
    <TeamPartnerCard flash={flash} />
  </>
);

PanePartner.Team = PaneTeam;
window.PanePartner = PanePartner;
