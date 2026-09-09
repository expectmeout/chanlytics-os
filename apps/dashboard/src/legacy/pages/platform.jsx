/* global React, Icon */
// Chanlytics — the back office. Every workspace, and what is up with each one.
//
// The only surface in this product that deliberately crosses tenant
// boundaries. Read-only: actions come later, and only ones that already exist
// as a workspace's own verb.
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
// The two tones the attention row already styles, plus the one this page adds.
const PLATFORM_TONE = { danger: "danger", warn: "escalated", accent: "queued", ok: "", muted: "" };

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

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

  const run = async (a) => {
    setBusy(true);
    const r = await P.act(a.action, tenantId, line.id);
    setBusy(false);
    setArm(null);
    flash({ msg: <>{r.message}</> });
    if (r.ok) onDone();
  };

  return (
    <div className="set-row" data-testid={`platform-line-${line.id}`}>
      <div className="set-row-info">
        <span className="set-row-label">{P.number(line.e164)} · {line.kind}</span>
        <span className="set-row-hint">
          voice {line.voice_state} · texting {line.sms_state}
          {line.reg_step ? ` · stopped at ${line.reg_step}` : ""}
          {line.reg_mock ? " · rehearsal filing" : ""}
          {line.reg_sole_prop ? " · sole proprietor" : ""}
          {line.step ? ` · step ${line.step}` : ""}
          {line.last_error ? ` — ${line.last_error}` : ""}
        </span>
        {arm && (
          <span className="set-row-hint pf-arm" data-testid={`platform-arm-${arm.action}`}>
            <b>{P.warning(arm)}</b> {arm.sentence}{" "}
            <button className="cl-bucket-link" onClick={() => run(arm)} disabled={busy} data-testid={`platform-do-${arm.action}`}>
              {busy ? "Working…" : `Yes, ${arm.label.toLowerCase()}`}
            </button>{" "}
            <button className="cl-bucket-link" onClick={() => setArm(null)} disabled={busy}>Not now</button>
          </span>
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
  return (
    <section className="fl-card set-card" data-testid="platform-detail">
      <div className="fl-card-head">
        <span className="fl-card-title">{detail.tenant.name}</span>
        <span className="fl-card-sub">{detail.tenant.slug} · {detail.tenant.timezone} · since {when(detail.tenant.created_at)}</span>
        <button className="cl-bucket-link" onClick={onClose} data-testid="platform-close">Close</button>
      </div>

      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-label">What their Setup says</span>
          <span className="set-row-hint">{vm.readiness.sentence} · {vm.done} of {vm.total} done. These are the rows the owner is looking at, from the same function their page runs.</span>
        </div>
      </div>
      <div className="cl-attn-list" data-testid="platform-setup-rows">
        {vm.rows.map((r) => (
          <window.AttnRow
            key={r.id}
            glyph={r.icon}
            name={r.title}
            sentence={r.sentence}
            status={[r.stateWords, ...r.details]}
            tone={r.state === "waiting_you" ? "escalated" : r.state === "waiting_them" ? "queued" : ""}
            testid={`platform-setup-${r.id}`}
          />
        ))}
      </div>

      {lines.length > 0 && (
        <div className="biz-group">
          <div className="biz-group-head">
            <span className="biz-group-title">Their lines</span>
            <span className="biz-group-sub">where each one stopped, what the provider said, and what can be done about it</span>
          </div>
          {lines.map((l) => (
            <PlatformLine key={l.id} line={l} tenantId={detail.tenant.id} onDone={onChanged} flash={flash} />
          ))}
        </div>
      )}

      <div className="biz-group">
        <div className="biz-group-head">
          <span className="biz-group-title">What has happened</span>
          <span className="biz-group-sub">newest first — the trail every provisioning step, filing and connection has always written</span>
        </div>
        {detail.events.length === 0 ? (
          <div className="set-row"><div className="set-row-info"><span className="set-row-hint">Nothing recorded for this workspace yet.</span></div></div>
        ) : (
          <ul className="pf-events" data-testid="platform-events">
            {detail.events.map((e, i) => (
              <li key={`${e.created_at}-${i}`}>
                <span className="pf-when">{when(e.created_at)}</span>
                <span className="pf-kind">{e.kind}</span>
                <span className="pf-cat">{e.category}{e.subject_type ? ` · ${e.subject_type}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

const PanePlatform = () => {
  const P = React.useMemo(() => window.__platform, []);
  const [toastNode, flash] = window.usePPToast();
  const [tenants, setTenants] = React.useState(null);
  const [problem, setProblem] = React.useState(null);
  const [find, setFind] = React.useState("");
  const [openId, setOpenId] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setBusy(true);
    const r = await P.list();
    setBusy(false);
    if (!r.ok) { setProblem(r.message); setTenants([]); return; }
    setProblem(null);
    setTenants(r.tenants);
  }, [P]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (!openId) { setDetail(null); return undefined; }
    let on = true;
    setDetail(null);
    P.one(openId).then((r) => { if (on) { setDetail(r.detail); if (!r.ok) setProblem(r.message); } });
    return () => { on = false; };
  }, [P, openId, reload]);

  if (tenants === null) {
    return <section className="fl-card set-card"><div className="set-row"><div className="set-row-info"><span className="set-row-hint">Reading every workspace…</span></div></div></section>;
  }

  const rows = P.rows(tenants);
  const summary = P.summary(rows);
  const q = find.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q)) : rows;

  return (
    <>
      <section className="fl-card set-card" data-testid="platform-overview">
        <div className="fl-card-head">
          <span className="fl-card-title">Every workspace</span>
          <span className="fl-card-sub" data-testid="platform-summary">{summary.sentence}</span>
          <button className="cl-bucket-link" onClick={load} disabled={busy} data-testid="platform-refresh">{busy ? "Reading…" : "Read again"}</button>
        </div>
        {problem && (
          <div className="set-row"><div className="set-row-info"><span className="set-row-hint">{problem}</span></div></div>
        )}
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">Sorted by who needs a person, not by name: work down the page. Read-only — nothing here changes a workspace.</span>
          </div>
          <input
            className="biz-input pf-find"
            value={find}
            placeholder="Find a workspace"
            onChange={(e) => setFind(e.target.value)}
            data-testid="platform-find"
          />
        </div>
        <div className="cl-attn-list" data-testid="platform-rows">
          {shown.length === 0 && (
            <div className="set-row"><div className="set-row-info"><span className="set-row-hint">{q ? `Nothing matches “${find}”.` : "No workspaces yet."}</span></div></div>
          )}
          {shown.map((r) => {
            const v = P.verdicts[r.verdict];
            return (
              <window.AttnRow
                key={r.tenantId}
                glyph={PLATFORM_GLYPH[r.verdict] || "dot"}
                name={r.name}
                meta={`${r.slug} · ${r.members} in it · ${r.age}`}
                sentence={r.sentence}
                status={[v.label, r.facts.paying, r.facts.answering, `texting ${r.facts.texting}`, `heard ${r.facts.heard}`]}
                tone={PLATFORM_TONE[v.tone] || ""}
                cta={{ label: openId === r.tenantId ? "Close" : "Open", kind: "ghost", onClick: () => setOpenId(openId === r.tenantId ? null : r.tenantId) }}
                onOpen={() => setOpenId(openId === r.tenantId ? null : r.tenantId)}
                testid={`platform-row-${r.slug}`}
                ctaTestid={`platform-open-${r.slug}`}
              />
            );
          })}
        </div>
      </section>

      {openId && !detail && (
        <section className="fl-card set-card"><div className="set-row"><div className="set-row-info"><span className="set-row-hint">Reading that workspace…</span></div></div></section>
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
