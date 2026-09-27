/* global React, Icon, Confirm */
// Chanlytics — the back office. Every workspace, and what is up with each one.
//
// The only surface in this product that deliberately crosses tenant
// boundaries. The LIST is read-only; the line rows on an opened workspace are
// not -- gate 6 put Retry, Refile and Release here, each one arming before it
// confirms, each one recorded against the person who pressed it before it runs.
// This comment used to say "actions come later", which stopped being true in the
// same commit that added them two screens below.
//
// It decides nothing. The verdict, the sorting, the sentence and the four facts
// all come from contracts/platform.ts through window.__platform, and the detail
// pane runs setupSteps — the customer's OWN view model — so support and the
// person on the phone are looking at the same rows rather than two renderings
// that can disagree.
//
// The rows use the attention grammar People, Today and Setup share, because a
// row that needs somebody looks the same wherever it appears.

const PLATFORM_GLYPH = {
  broken: "alert", billing: "money", rehearsal: "flag", stalled: "clock",
  waiting_owner: "user", quiet: "wave", new: "sparkle", live: "check",
  paused: "pause", test: "bolt",
};

// Every time on this page belongs to the workspace being LOOKED AT, not to the
// one you are signed in to: window.__clock speaks for the latter, and this is
// the one surface that crosses that line. P.clock is the same contracts clock
// it wraps, called with the zone the header names -- so the page still keeps
// no calendar of its own.
const pfClock = () => window.__platform.clock;
const when = (iso, tz) => (iso ? pfClock().dateYear(Date.parse(iso), tz) : "—");
const pfTime = (iso, tz) => pfClock().time(Date.parse(iso), tz);
const pfKey = (iso, tz) => pfClock().dayKey(Date.parse(iso), tz);
const pfDay = (iso, tz) => pfClock().dayLabel(Date.parse(iso), tz, Date.now());
// A Setup row's tone is its state's own (contracts/tone.ts), as the owner's page draws it.
const setupTone = (state) => (window.__chrome && window.__chrome.state ? window.__chrome.state("setup", state).tone : "plain");

/** One workspace, opened: the Setup its owner sees, its lines, and what has happened. */
/**
 * One line, and what may be done to it.
 *
 * Arm-then-confirm rather than a bare button, and the confirmation LEADS with
 * what it spends -- because `refile` is two different actions wearing one name:
 * a rejected campaign is corrected in place for nothing, a rehearsal is replaced
 * by a real filing for about $19.50 that cannot be undone. Which one this line
 * is offering, and what it costs, comes from the contract; the page only reads
 * it out.
 */
const PlatformLine = ({ line, tenantId, onDone, flash }) => {
  const P = window.__platform;
  const [arm, setArm] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const actions = P.actions(line);
  // What KIND of filing this is, read once and behind the mark. Where it
  // stopped is not in here: with the error, it is the diagnosis somebody opened
  // this workspace for, and it stays on the row.
  const aside = [
    line.reg_mock ? "Rehearsal filing" : "",
    line.reg_sole_prop ? "Sole proprietor" : "",
    line.step ? `Step ${line.step}` : "",
  ].filter(Boolean).join(" · ");

  const run = async (a) => {
    setBusy(true);
    const r = await P.act(a.action, tenantId, line.id);
    setBusy(false);
    setArm(null);
    // The tone follows the OUTCOME. The tone pass gave this call site
    // `danger` unconditionally, so support pressing Retry and getting "Done.
    // This page will show it on the next read." was told so in red — the same
    // class of thing that pass existed to fix, one flash serving both answers.
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };

  return (
    <div className="set-row" data-testid={`platform-line-${line.id}`}>
      <div className="set-row-info">
        <span className="set-row-label">{P.number(line.e164)}<span className="pf-line-kind">{line.kind}</span></span>
        <span className="pf-line-states">
          <span className="pf-state"><span className="pf-state-of">voice</span>{line.voice_state || "—"}</span>
          <span className="pf-state"><span className="pf-state-of">texting</span>{line.sms_state || "—"}</span>
          {line.reg_step && <span className="pf-state pf-state-stuck"><span className="pf-state-of">stopped at</span>{line.reg_step}</span>}
          {aside && (
            <button
              type="button"
              className="set-mark"
              data-tip={aside}
              aria-label={`What else is on this line: ${aside}`}
              onClick={(e) => { if (window.__tip) window.__tip.show(e.currentTarget); }}
            ><Icon name="info" size={12} /></button>
          )}
        </span>
        {line.last_error && (
          <span className="pf-line-error"><Icon name="alert" size={11} />{line.last_error}</span>
        )}
        {arm && (
          <Confirm block question={P.warning(arm)} detail={arm.sentence} yes={`Yes, ${arm.label.toLowerCase()}`} no="Not now" danger={!!arm.permanent} busy={busy} onYes={() => run(arm)} onNo={() => setArm(null)} testid={`platform-${arm.action}`} />
        )}
      </div>
      {actions.length > 0 && !arm && (
        <span className="bc-chips">
          {actions.map((a) => (
            <button
              key={a.action}
              className="btn btn-sm"
              onClick={() => setArm(a)}
              disabled={busy}
              data-testid={`platform-act-${a.action}`}
            >
              {a.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
};

const PlatformDetail = ({ detail, onClose, onChanged, flash }) => {
  const P = window.__platform;
  // The customer's own rows, from the customer's own function. No verbs: the
  // buttons on Setup act on the SIGNED-IN workspace, and this is not it. The
  // LINE rows below are different -- those are the ops door, and every one of
  // them is recorded against the person who pressed it.
  const vm = P.steps({ ...detail.setup, later: [] });
  const lines = (detail.setup.lines && detail.setup.lines.rows) || [];
  // Every stamp on this card is this workspace's, and the header names the zone.
  const tz = detail.tenant.timezone;
  return (
    <section className="fl-card set-card" data-testid="platform-detail">
      <div className="fl-card-head">
        <h2 className="fl-card-title">{detail.tenant.name}</h2>
        <span className="fl-card-sub">{detail.tenant.slug} · {tz} · since {when(detail.tenant.created_at, tz)}</span>
        <button className="cl-bucket-link" onClick={onClose} data-testid="platform-close">Close</button>
      </div>

      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-label">What their Setup says</span>
          <span className="set-row-hint">{vm.readiness.sentence} · {vm.done} of {vm.total} done.</span>
          <div className="setup-meter" aria-hidden="true">
            <span className="setup-meter-fill" style={{ width: `${vm.total ? Math.round((vm.done / vm.total) * 100) : 0}%` }} />
          </div>
        </div>
      </div>
      <div className="cl-attn-list setup-rows" data-testid="platform-setup-rows">
        {vm.rows.map((r) => (
          <window.AttnRow
            key={r.id}
            glyph={r.icon}
            name={r.title}
            sentence={r.sentence}
            status={[r.stateWords]}
            note={r.details.join(" · ")}
            tone={setupTone(r.state)}
            testid={`platform-setup-${r.id}`}
          />
        ))}
      </div>

      {lines.length > 0 && (
        <div className="biz-group">
          <div className="biz-group-head">
            <span className="biz-group-title">Their lines</span>
            <span className="biz-group-sub">Where each one stopped, and what can be done.</span>
          </div>
          {lines.map((l) => (
            <PlatformLine key={l.id} line={l} tenantId={detail.tenant.id} onDone={onChanged} flash={flash} />
          ))}
        </div>
      )}

      <div className="biz-group">
        <div className="biz-group-head">
          <span className="biz-group-title">What has happened</span>
          <span className="biz-group-sub">Newest first.</span>
        </div>
        {detail.events.length === 0 ? (
          <div className="set-row"><div className="set-row-info"><span className="set-row-hint">Nothing recorded for this workspace yet.</span></div></div>
        ) : (
          <ul className="pf-events" data-testid="platform-events">
            {detail.events.map((e, i) => {
              const opens = i === 0 || pfKey(e.created_at, tz) !== pfKey(detail.events[i - 1].created_at, tz);
              return (
                <React.Fragment key={`${e.created_at}-${i}`}>
                  {opens && <li className="pf-day">{pfDay(e.created_at, tz)}</li>}
                  <li className="pf-event">
                    <span className="pf-when">{pfTime(e.created_at, tz)}</span>
                    <span className="pf-said">{P.words(e.kind, {})}</span>
                    <span className="pf-kind">{e.kind}</span>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

/**
 * One person waiting. The only action arms first, like every other action on
 * this page -- and unlike them it is not undoable from here, so a mis-click
 * leaves somebody waiting for a mail nobody will write.
 */
const WaitingRow = ({ row, P, onDone, flash }) => {
  const [arm, setArm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    const r = await Promise.resolve().then(() => P.markInvited(row.id)).catch(() => ({ ok: false, message: "That did not go through." }));
    setBusy(false);
    setArm(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };
  return (
    <div className="set-row" data-testid="platform-queue-row">
      <div className="set-row-info">
        <span className="set-row-label">{row.email}</span>
        <span className="set-row-hint">{[row.detail, row.waited].filter(Boolean).join(" · ")}</span>
        {arm && (
          <Confirm
            block
            question="Mark them as invited?"
            detail="Nothing is sent. This only records that somebody wrote to them, and takes them off the list."
            yes="Yes, mark them"
            no="Not now"
            busy={busy}
            onYes={run}
            onNo={() => setArm(false)}
            testid="platform-queue-invited"
          />
        )}
      </div>
      {!arm && (
        <button className="btn btn-sm" onClick={() => setArm(true)} disabled={busy} data-testid="platform-queue-mark">
          Mark as invited
        </button>
      )}
    </div>
  );
};

/**
 * A partner's authenticator, removed after a person checked it is them (0013): once per partner, on their first line.
 * It arms, asks why and how you checked, and says what happens; the partner sets up a new one at their next sign-in.
 */
const PartnerFactorReset = ({ row, P, flash }) => {
  const W = P.secondFactorWords;
  const [arm, setArm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [why, setWhy] = React.useState("");
  if (!row.first || !W) return null;
  const run = async () => {
    setBusy(true);
    const r = await Promise.resolve()
      .then(() => P.resetSecondFactor(row.partnerId, row.code, why.trim()))
      .catch(() => ({ ok: false, message: "That did not go through." }));
    setBusy(false);
    setArm(false);
    setWhy("");
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
  };
  return (
    <div className="set-row" data-testid={`platform-partner-factor-${row.code}`}>
      <div className="set-row-info">
        {arm && (
          <Confirm
            block
            question={W.resetQuestion(row.code)}
            detail={W.resetDetail}
            yes={W.resetYes}
            no="Not now"
            danger
            typed={W.resetTyped}
            value={why}
            onType={setWhy}
            ready={why.trim().length > 0 && why.trim().length <= 500}
            busy={busy}
            onYes={run}
            onNo={() => { setArm(false); setWhy(""); }}
            testid={`platform-partner-factor-reset-${row.code}`}
          />
        )}
      </div>
      {!arm && (
        <button className="btn btn-sm btn-ghost" onClick={() => setArm(true)} disabled={busy} data-testid={`platform-partner-factor-arm-${row.code}`}>
          {W.resetLabel}
        </button>
      )}
    </div>
  );
};

// A partner's line: what they earned in one currency, and on their first line the second factor's reset (0013).
const PartnerLine = ({ row, P, onDone, flash }) => (
  <>
    <PartnerRow row={row} P={P} onDone={onDone} flash={flash} />
    <PartnerFactorReset row={row} P={P} flash={flash} />
  </>
);

/**
 * One partner and one currency of what they earned (0012, P5). The one action records a payout sent by hand: it arms,
 * asks for the payment's reference, and SENDS NOTHING -- the money left from the bank, and this is the record of it.
 */
const PartnerRow = ({ row, P, onDone, flash }) => {
  const [arm, setArm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [ref, setRef] = React.useState("");
  // The partner's own status, on their first line only: pause, close or restore, each with why.
  const [armStatus, setArmStatus] = React.useState(null);
  const [why, setWhy] = React.useState("");
  const runStatus = async () => {
    setBusy(true);
    const r = await Promise.resolve()
      .then(() => P.setStatus(row.partnerId, row.code, armStatus, why.trim()))
      .catch(() => ({ ok: false, message: "That did not go through." }));
    setBusy(false);
    setArmStatus(null);
    setWhy("");
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };
  const statusChoice = armStatus ? row.statusChoices.find((c) => c.status === armStatus) : null;
  const run = async () => {
    setBusy(true);
    const r = await Promise.resolve()
      .then(() => P.markPaid(row.partnerId, row.code, row.currency, ref.trim(), row.payableCents))
      .catch(() => ({ ok: false, message: "That did not go through." }));
    setBusy(false);
    setArm(false);
    setRef("");
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    onDone();
  };
  return (
    <div className="set-row" data-testid={`platform-partner-${row.code}`}>
      <div className="set-row-info">
        <span className="set-row-label">{row.code}</span>
        <span className="set-row-hint">{row.who}</span>
        <span className="set-row-hint" data-testid={`platform-partner-money-${row.code}`}>{row.money}</span>
        {arm && (
          <Confirm
            block
            question={`${row.payLabel}?`}
            detail="Nothing is sent. This records a payout you already made, settles every payable share in it, and cannot be undone here."
            yes="Yes, record it"
            no="Not now"
            typed="the payment's reference"
            value={ref}
            onType={setRef}
            ready={ref.trim().length > 0 && ref.trim().length <= 200}
            busy={busy}
            onYes={run}
            onNo={() => { setArm(false); setRef(""); }}
            testid={`platform-partner-pay-${row.code}`}
          />
        )}
        {statusChoice && (
          <Confirm
            block
            question={`${statusChoice.label} ${row.code}?`}
            detail={
              armStatus === "active"
                ? "They become a partner again on every workspace a pause took them off, where the owner has not removed them since."
                : "They become a viewer on every workspace they brought, and what they hold in its conversations is released. Their earnings are kept, and mature only once they are restored."
            }
            yes={`Yes, ${statusChoice.label.toLowerCase()}`}
            no="Not now"
            danger={armStatus !== "active"}
            typed="why, for the partner"
            value={why}
            onType={setWhy}
            ready={why.trim().length > 0 && why.trim().length <= 500}
            busy={busy}
            onYes={runStatus}
            onNo={() => { setArmStatus(null); setWhy(""); }}
            testid={`platform-partner-status-${armStatus}-${row.code}`}
          />
        )}
      </div>
      {!arm && !armStatus && (
        <span className="cl-row-actions">
          {row.canPay && (
            <button className="btn btn-sm" onClick={() => setArm(true)} disabled={busy} data-testid={`platform-partner-mark-${row.code}`}>
              {row.payLabel}
            </button>
          )}
          {row.first && row.statusChoices.map((c) => (
            <button key={c.status} className="btn btn-sm" onClick={() => setArmStatus(c.status)} disabled={busy} data-testid={`platform-partner-arm-${c.status}-${row.code}`}>
              {c.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
};

/**
 * A workspace a partner brought, and a person's decision on it. The nightly check decided once; this is where what
 * it held for review is looked at. Each decision asks why -- the partner is written to about it -- and is recorded
 * against the person who made it.
 */
const PartnerStandingRow = ({ ws, name, P, onDone, flash }) => {
  const vm = P.partnerStanding(ws);
  const [arm, setArm] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [why, setWhy] = React.useState("");
  const run = async () => {
    setBusy(true);
    const r = await Promise.resolve()
      .then(() => P.setStanding(ws.tenant_id, arm, why.trim()))
      .catch(() => ({ ok: false, message: "That did not go through." }));
    setBusy(false);
    setArm(null);
    setWhy("");
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };
  const choice = arm ? vm.choices.find((c) => c.standing === arm) : null;
  return (
    <div className="set-row" data-testid={`platform-standing-${ws.tenant_id}`}>
      <div className="set-row-info">
        <span className="set-row-label">{name || ws.tenant_id}</span>
        <span className="set-row-hint">{vm.by}</span>
        <span className="set-row-hint" data-tone={vm.tone} data-testid={`platform-standing-words-${ws.tenant_id}`}>{vm.standing}</span>
        {choice && (
          <Confirm
            block
            question={`${choice.label} ${name || "this workspace"}?`}
            detail={
              arm === "disqualified"
                ? "What it still holds is void and it earns nothing more. What was paid stays paid."
                : arm === "qualified"
                  ? "Its shares become payable as each one's thirty days end; any already past it are payable now."
                  : "What it holds waits until somebody decides."
            }
            yes={`Yes, ${choice.label.toLowerCase()}`}
            no="Not now"
            danger={arm === "disqualified"}
            typed="why, for the partner"
            value={why}
            onType={setWhy}
            ready={why.trim().length > 0 && why.trim().length <= 500}
            busy={busy}
            onYes={run}
            onNo={() => { setArm(null); setWhy(""); }}
            testid={`platform-standing-${arm}-${ws.tenant_id}`}
          />
        )}
      </div>
      {!arm && (
        <span className="cl-row-actions">
          {vm.choices.map((c) => (
            <button key={c.standing} className="btn btn-sm" onClick={() => setArm(c.standing)} disabled={busy} data-testid={`platform-standing-arm-${c.standing}-${ws.tenant_id}`}>
              {c.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
};

// The machinery under every workspace. The database has answered this
// for months and nothing in the product showed it: the clocks and the
// job backlog were read by the health sweep and by the keyless /api/health,
// both of which speak to a monitor outside the product. It belongs
// HERE and not on an owner's page — both counts are platform-wide, so a
// salon owner told "forty jobs are late" has been shown something that
// is not about them and that they cannot act on.
const PlatformHealthCard = ({ P, health }) => {
  if (!health) return null;
  return (
    <section className="fl-card set-card" data-testid="platform-health">
      <div className="fl-card-head">
        <h2 className="fl-card-title">The platform</h2>
        <span className="fl-card-sub set-says" data-testid="platform-health-words">{P.healthWords(health)}</span>
      </div>
      {health.unhealthy.length > 0 && (
        <div className="cl-attn-list" data-testid="platform-health-clocks">
          {health.unhealthy.map((u) => (
            <div className="set-row" key={u.sweep}>
              <div className="set-row-info">
                <span className="set-row-label">{u.sweep}</span>
                <span className="set-row-hint">{u.detail || "This clock is not running."}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

// How fast the pages are (00225): the 75th percentile of what people's own
// browsers measured as each page loaded and answered, so the bundle's budget is
// judged against what they see. Platform-wide, like the clocks above it; a read
// that failed says so here and takes nothing else with it; an overview that
// predates the timings has none, and draws no card, and a list that could not
// be read says so once, above. Every word is the view model's (contracts
// pageVitalsWords).
const PlatformVitalsCard = ({ P, rows, problem }) => {
  if (problem || rows === undefined) return null;
  const pace = P.vitalsWords(rows);
  return (
    <section className="fl-card set-card" data-testid="platform-vitals">
      <div className="fl-card-head">
        <h2 className="fl-card-title">How fast the pages are</h2>
        <span className="fl-card-sub set-says" data-testid="platform-vitals-words">{pace.sentence}</span>
      </div>
      {pace.lines.length > 0 && (
        <div className="cl-attn-list" data-testid="platform-vitals-lines">
          {pace.lines.map((l) => (
            <div className="set-row" key={l.metric}>
              <div className="set-row-info">
                <span className="set-row-label">{l.label}</span>
                <span className="set-row-hint" data-tone={l.tone}>{l.hint}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {pace.pages.length > 0 && (
        <div className="cl-attn-list" data-testid="platform-vitals-pages">
          {pace.pages.map((pg) => (
            <div className="set-row" key={pg.page}>
              <div className="set-row-info">
                <span className="set-row-label">{pg.page}</span>
                <span className="set-row-hint">{pg.hint}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const PanePlatform = () => {
  const P = React.useMemo(() => window.__platform, []);
  const [toastNode, flash] = window.usePPToast();
  // The list this tab already holds, painted at once; `load` reads again behind it.
  const held = P && P.peekList ? P.peekList() : null;
  const [tenants, setTenants] = React.useState(held && held.ok ? held.tenants : null);
  const [health, setHealth] = React.useState(held && held.ok ? held.health : null);
  const [queue, setQueue] = React.useState(held && held.ok ? held.queue : null);
  const [partners, setPartners] = React.useState(held && held.ok ? held.partners : null);
  const [vitals, setVitals] = React.useState(held && held.ok ? held.vitals : null);
  const [problem, setProblem] = React.useState(null);
  const [find, setFind] = React.useState("");
  const [openId, setOpenId] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  // Why the open workspace could not be read: its own state, beside the list's. A failed read of one workspace left
  // "Reading that workspace…" on screen for good and put its reason on the list (S10).
  const [detailProblem, setDetailProblem] = React.useState(null);

  const load = React.useCallback(async () => {
    setBusy(true);
    // A read that throws is a failed read like any other, not a page left reading for ever.
    const r = await Promise.resolve().then(() => P.list()).catch(() => ({ ok: false, message: "" }));
    setBusy(false);
    if (!r.ok) { setProblem(r.message || "Could not be read right now."); setTenants([]); setHealth(null); setQueue(null); setPartners(null); setVitals(null); return; }
    setProblem(null);
    setTenants(r.tenants);
    setHealth(r.health);
    setQueue(r.queue);
    setPartners(r.partners);
    setVitals(r.vitals);
  }, [P]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (!openId) { setDetail(null); setDetailProblem(null); return undefined; }
    let on = true;
    // A row whose Open the pointer rested on is already read: it opens with no
    // "Reading that workspace..." frame at all.
    const ready = P.peekOne ? P.peekOne(openId) : null;
    setDetail(ready && ready.ok ? ready.detail : null);
    setDetailProblem(null);
    Promise.resolve().then(() => P.one(openId)).then(
      (r) => { if (!on) return; if (r.ok && r.detail) setDetail(r.detail); else setDetailProblem(r.message || "Could not be read right now."); },
      () => { if (on) setDetailProblem("Could not be read right now."); },
    );
    return () => { on = false; };
  }, [P, openId, reload]);

  if (tenants === null) {
    return <section className="fl-card set-card"><div className="set-row"><div className="set-row-info"><span className="set-row-hint">Reading every workspace…</span></div></div></section>;
  }

  const rows = P.rows(tenants);
  const summary = P.summary(rows);
  const waiting = queue ? P.queue(queue) : null;
  const q = find.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q)) : rows;
  // Who brought each workspace (0012, P5): the column on its row, and the rows a person decides on.
  const broughtBy = new Map((partners ? partners.workspaces : []).map((w) => [w.tenant_id, w]));
  const nameOf = new Map(rows.map((r) => [r.tenantId, r.name]));
  const partnerRows = partners ? P.partnerRows(partners.balances) : [];
  const toDecide = partners ? partners.workspaces.filter((w) => w.standing !== "qualified") : [];

  return (
    <>
      <PlatformHealthCard P={P} health={health} />
      <PlatformVitalsCard P={P} rows={vitals} problem={problem} />
      {/* Who is knocking. These people have no workspace, so this is the only
          surface in the product they appear on at all -- which is how a table
          with a writer and no reader went unnoticed long enough for the writer
          to be broken too (nothing was ever written to it; the upsert named a
          conflict target Postgres does not have, and the error said "unique"
          so it was swallowed as a duplicate).

          The card is one line when nobody is waiting, so it costs nothing to
          have above the workspaces, and the workspaces are still the work. */}
      {waiting && (
        <section className="fl-card set-card" data-testid="platform-queue">
          <div className="fl-card-head">
            <h2 className="fl-card-title">Waiting to get in</h2>
            <span className="fl-card-sub set-says" data-testid="platform-queue-words">{waiting.sentence}</span>
          </div>
          {waiting.rows.length > 0 && (
            <>
              <div className="set-row">
                <div className="set-row-info">
                  <span className="set-row-hint" data-testid="platform-queue-note">{waiting.note}</span>
                </div>
              </div>
              <div className="cl-attn-list" data-testid="platform-queue-rows">
                {waiting.rows.map((w) => (
                  <WaitingRow key={w.id} row={w} P={P} onDone={load} flash={flash} />
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {/* The partners (0012, P5): what each is owed, and the workspaces the nightly check held for a person. The
          card is one line when there are none. Both actions send nothing and ask for a reason or a reference;
          each is recorded against you. */}
      {partners && (
        <section className="fl-card set-card" data-testid="platform-partners">
          <div className="fl-card-head">
            <h2 className="fl-card-title">Partners</h2>
            <span className="fl-card-sub set-says" data-testid="platform-partners-words">{P.partnerSummary(partners.balances)}</span>
          </div>
          {partnerRows.length > 0 && (
            <div className="cl-attn-list" data-testid="platform-partner-rows">
              {partnerRows.map((row) => (
                <PartnerLine key={`${row.partnerId}-${row.currency || "none"}`} row={row} P={P} onDone={load} flash={flash} />
              ))}
            </div>
          )}
          {toDecide.length > 0 && (
            <>
              <div className="set-row">
                <div className="set-row-info">
                  <span className="set-row-hint">Workspaces a partner brought that are not qualified: under review first.</span>
                </div>
              </div>
              <div className="cl-attn-list" data-testid="platform-standing-rows">
                {toDecide.map((w) => (
                  <PartnerStandingRow key={w.tenant_id} ws={w} name={nameOf.get(w.tenant_id)} P={P} onDone={load} flash={flash} />
                ))}
              </div>
            </>
          )}
        </section>
      )}
      <section className="fl-card set-card" data-testid="platform-overview">
        <div className="fl-card-head">
          <h2 className="fl-card-title">Every workspace</h2>
          <span className="fl-card-sub set-says" data-testid="platform-summary">{summary.sentence}</span>
          <button className="cl-bucket-link" onClick={load} disabled={busy} data-testid="platform-refresh">{busy ? "Reading…" : "Read again"}</button>
        </div>
        {problem && (
          <window.FailedRead kind="line" what="every workspace" why={problem} body="The workspaces themselves are unaffected." onRetry={load} busy={busy} testid="platform-failed" />
        )}
        <div className="set-row pf-find-row">
          <div className="set-row-info">
            <span className="set-row-hint">Sorted by who needs a person, not by name: work down the page.</span>
          </div>
          <input
            className="biz-input pf-find"
            value={find}
            placeholder="Find a workspace"
            onChange={(e) => setFind(e.target.value)}
            data-testid="platform-find"
          />
        </div>
        <p className="pf-warn"><Icon name="shield" size={11} />This list changes nothing; open a workspace and its lines can be retried, resent to the carriers, or handed back — each one asks twice, and each is recorded against you.</p>
        <div className="cl-attn-list" data-testid="platform-rows">
          {shown.length === 0 && (q || !problem) && (
            <div className="set-row"><div className="set-row-info"><span className="set-row-hint">{q ? `Nothing matches “${find}”.` : "No workspaces yet."}</span></div></div>
          )}
          {shown.map((r) => {
            const v = P.verdicts[r.verdict];
            return (
              <window.AttnRow
                key={r.tenantId}
                glyph={PLATFORM_GLYPH[r.verdict] || "dot"}
                name={r.name}
                meta={[r.slug, `${r.members} in it`, r.age, broughtBy.has(r.tenantId) ? P.partnerStanding(broughtBy.get(r.tenantId)).by : null].filter(Boolean).join(" · ")}
                sentence={r.sentence}
                status={[v.label]}
                note={[r.facts.paying, r.facts.answering, `texting ${r.facts.texting}`, `heard ${r.facts.heard}`].join(" · ")}
                tone={v.tone}
                cta={{ label: openId === r.tenantId ? "Close" : "Open", kind: "ghost", onClick: () => setOpenId(openId === r.tenantId ? null : r.tenantId) }}
                onOpen={() => setOpenId(openId === r.tenantId ? null : r.tenantId)}
                onHover={() => P.warmOne && P.warmOne(r.tenantId)}
                testid={`platform-row-${r.slug}`}
                ctaTestid={`platform-open-${r.slug}`}
              />
            );
          })}
        </div>
      </section>

      {openId && !detail && !detailProblem && (
        <section className="fl-card set-card"><div className="set-row"><div className="set-row-info"><span className="set-row-hint">Reading that workspace…</span></div></div></section>
      )}
      {openId && !detail && detailProblem && (
        <section className="fl-card set-card">
          <window.FailedRead kind="card" what="that workspace" why={detailProblem} body="The list above is current." onRetry={() => setReload((n) => n + 1)} testid="platform-detail-failed" />
        </section>
      )}
      {openId && detail && (
        <PlatformDetail
          detail={detail}
          onClose={() => setOpenId(null)}
          // An action changes the line it was taken on, so both reads are stale
          // the moment it lands: the list's verdict and the detail's own rows.
          onChanged={() => { setDetail(null); load(); setReload((n) => n + 1); }}
          flash={flash}
        />
      )}
      {toastNode}
    </>
  );
};

window.PanePlatform = PanePlatform;
// Published as well as used, the way AttnRow and SetToggle are: this is the
// write half of a cross-tenant surface, and it holds its own arm-then-confirm
// state, so it is worth being able to drive on its own rather than only through
// the pane that contains it.
window.PlatformLine = PlatformLine;
// The same, for the same reason: it holds the arm-then-confirm state for the
// one action on this page that nobody can undo.
window.PlatformWaitingRow = WaitingRow;
// And these two, for the same reason: the partner card's two actions move money and a partner's standing.
window.PlatformPartnerRow = PartnerRow;
window.PlatformPartnerStandingRow = PartnerStandingRow;
