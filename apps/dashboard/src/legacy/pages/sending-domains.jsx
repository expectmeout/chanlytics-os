/* global React, Icon, Confirm, StatePill */
// Chanlytics — Connections › Email › Domains you send from (Reach out). Split out of integrations-real.jsx, whose
// Email row draws it: one file per concern, as billing-real.jsx and business-record.jsx are.

/**
 * The domains a workspace sends cold email from, under the Email row (Reach out; the canvas's Connections board).
 * Each row is contracts' words (window.__sendingDomains.words), so what the row says is what the door and the clock
 * decided; the records to publish are the provider's, as the edge stored them, with the DMARC one we recommend while
 * the domain has none. The owner adds, checks and removes; anyone may read.
 */
const SendingDomainRecords = ({ d, flash }) => {
  const API = window.__sendingDomains;
  // Copy, or, where the browser gives no clipboard, the words selected so a person can copy them by hand.
  const copy = (value, id) => {
    const byHand = () => {
      const node = document.getElementById(id);
      if (node && window.getSelection && document.createRange) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      flash({ tone: "danger", msg: <>Couldn't copy. It's selected: copy it by hand</> });
    };
    if (navigator.clipboard) navigator.clipboard.writeText(value).then(() => flash({ msg: <>Copied</> }), byHand);
    else byHand();
  };
  const rows = API.recordRows(d);
  const idOf = (r, part) => `rec-${d.id}-${part}-${r.key}`;
  return (
    <div className="set-records" data-testid={`domain-records-${d.host}`}>
      <p className="set-records-intro">
        {API.recordsIntro(d.host)} <span className="dim">{API.registrarHint(d.host)}</span>
      </p>
      <div className="set-records-table" role="table" aria-label={`The records for ${d.host}`}>
        <div className="set-records-row set-records-head" role="row">
          <span role="columnheader">Record</span>
          <span role="columnheader">Name</span>
          <span role="columnheader">Value</span>
        </div>
        {rows.map((r) => (
          <div className="set-records-row" role="row" key={r.key}>
            <span role="cell" className="k">
              <span className="rec-dot" role="img" data-found={r.found ? "yes" : "no"} title={r.found ? "Found" : "Not found yet"} aria-label={r.found ? "Found" : "Not found yet"} {...(r.found ? { "data-testid": `domain-found-${r.key}` } : {})} />
              {r.kind}
              <span className="ty-inline"> · {r.type}{r.priority != null ? ` · ${r.priority}` : ""}</span>
            </span>
            <span role="cell" className="n">
              <code id={idOf(r, "name")}>{r.name}</code>
              <button type="button" className="cl-bucket-link rec-copy" onClick={() => copy(r.name, idOf(r, "name"))} aria-label={`Copy the ${r.kind} name`} data-testid={`domain-copy-name-${r.key}`}>Copy</button>
            </span>
            <span role="cell" className="v">
              <code id={idOf(r, "value")}>{r.value}</code>
              <button type="button" className="cl-bucket-link rec-copy" onClick={() => copy(r.value, idOf(r, "value"))} aria-label={`Copy the ${r.kind} value`} data-testid={`domain-copy-value-${r.key}`}>Copy</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SendingDomainAdd = ({ mailDomain, fromName, flash, onClose }) => {
  const API = window.__sendingDomains;
  const [host, setHost] = React.useState("");
  const [local, setLocal] = React.useState("");
  const [name, setName] = React.useState(fromName || "");
  const [problems, setProblems] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    const found = {};
    const h = API.whyNotAHost(host, mailDomain);
    const l = API.whyNotAFromLocal(local);
    const n = API.whyNotAFromName(name);
    if (h) found.host = h;
    if (l) found.local = l;
    if (n) found.name = n;
    setProblems(found);
    if (h || l || n) return;
    setBusy(true);
    const r = await API.add({ host, fromLocal: local, fromName: name });
    setBusy(false);
    // A host taken, or a sixth domain: refusals the owner causes by what they typed belong under the box.
    if (!r.ok) {
      if (r.code === "conflict" || r.code === "validation") setProblems({ host: r.message });
      else flash(window.refusalToast(r, "Not added"));
      return;
    }
    flash({ msg: <>{r.data.domain.host} is added — publish its records at your registrar, then press Check</> });
    onClose();
  };
  const shownHost = host.trim().toLowerCase() || "yourdomain.com";
  return (
    <div className="set-row set-row-stack biz set-domain-add" data-testid="domain-add">
      <div className="biz-fields">
        <label className="biz-field" data-testid="domain-host">
          <span className="biz-label">The domain you'll send from</span>
          <input className={`biz-input${problems.host ? " biz-bad" : ""}`} value={host} placeholder="getyourbusiness.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={busy} aria-invalid={problems.host ? true : undefined} aria-describedby={problems.host ? "domain-host-problem" : "domain-host-hint"} onChange={(e) => setHost(e.target.value)} />
          {problems.host ? <window.FieldError id="domain-host-problem" message={problems.host} testid="domain-host-problem" /> : <span className="biz-hint" id="domain-host-hint">A domain of its own is safest, like get{"<business>"}.com: your everyday email stays out of it.</span>}
        </label>
        <label className="biz-field" data-testid="domain-local">
          <span className="biz-label">Who it comes from</span>
          <span className="biz-affix">
            <input className={`biz-input${problems.local ? " biz-bad" : ""}`} value={local} placeholder="sam" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={busy} aria-invalid={problems.local ? true : undefined} aria-describedby={problems.local ? "domain-local-problem" : undefined} onChange={(e) => setLocal(e.target.value)} />
            <span className="biz-affix-text">@{shownHost}</span>
          </span>
          {problems.local ? <window.FieldError id="domain-local-problem" message={problems.local} testid="domain-local-problem" /> : null}
        </label>
        <label className="biz-field" data-testid="domain-name">
          <span className="biz-label">The name people see beside it</span>
          <input className={`biz-input${problems.name ? " biz-bad" : ""}`} value={name} disabled={busy} aria-invalid={problems.name ? true : undefined} aria-describedby={problems.name ? "domain-name-problem" : undefined} onChange={(e) => setName(e.target.value)} />
          {problems.name ? <window.FieldError id="domain-name-problem" message={problems.name} testid="domain-name-problem" /> : null}
        </label>
      </div>
      <div className="bc-chips">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} data-testid="domain-save" {...window.gate("team", "add a domain to send from")}>{busy ? "Adding…" : "Add the domain"}</button>
        <button className="btn btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
};

const SendingDomains = ({ email, flash }) => {
  const API = window.__sendingDomains;
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [arm, setArm] = React.useState(null);
  const owner = window.canDo ? window.canDo("team") : false;
  if (!API || !email || !email.mailbox || !email.sending) return null;
  const { ready, domains } = email.sending;
  if (!ready && domains.length === 0) return null;
  const now = Date.now();
  const check = async (d) => {
    setBusy(d.id);
    const r = await API.check(d.id);
    setBusy(null);
    if (!r.ok) { flash(window.refusalToast(r, "Not checked")); return; }
    // What the Check found, in its own tone: records not there yet are not a success.
    const said = API.checkWords(r.data.domain, Date.now(), d);
    flash({ tone: said.tone === "ok" ? undefined : said.tone === "warn" ? "warn" : "info", msg: <>{said.msg}</> });
  };
  const remove = async (d) => {
    setBusy(d.id);
    const r = await API.remove(d.id);
    setBusy(null);
    setArm(null);
    flash(r.ok ? { msg: <>{d.host} is removed. Nothing more is sent from it.</> } : window.refusalToast(r, "Not removed"));
  };
  // A hold for bounces or a complaint is the owner's to lift: the ramp starts again, at its first step.
  const firstStep = API.cap(new Date(now).toISOString(), now);
  const resume = async (d) => {
    setBusy(d.id);
    const r = await API.resume(d.id);
    setBusy(null);
    setArm(null);
    flash(r.ok ? { msg: <>{d.host} is sending again, up to {firstStep} a day.</> } : window.refusalToast(r, "Not resumed"));
  };
  const armed = (d, what) => arm && arm.id === d.id && arm.what === what;
  return (
    <div className="set-domains" data-testid="sending-domains">
      <div className="set-domains-head">
        <span>Domains you send from</span>
        <span className="k">cold email leaves only from a domain you own · replies come back to {email.mailbox.address}</span>
      </div>
      {!owner && window.gateTitle && (
        <div className="set-dom set-dom-note"><span /><span className="t"><span>{window.gateTitle("team", "add, check, resume or remove a domain")}</span></span></div>
      )}
      {domains.map((d) => {
        const w = API.words(d, now);
        const acts = API.acts(d);
        const checkable = acts.check;
        const resumable = acts.resume;
        const showRecords = acts.records;
        return (
          <React.Fragment key={d.id}>
            <div className="set-dom" data-testid={`domain-${d.host}`} data-state={d.state}>
              <Icon name="globe" size={14} />
              <span className="t">
                <b>{d.host}</b>
                <span>{w.line}</span>
                {w.stats ? <span className="dim">{w.stats}</span> : null}
                {w.fix ? <span>{w.fix}</span> : null}
                {w.next ? <span>{w.next}</span> : null}
                {armed(d, "remove") && (
                  <Confirm question={`Remove ${d.host}?`} detail="Nothing more is sent from it; what was sent stays in its threads." yes="Yes, remove" danger busy={busy === d.id} onYes={() => remove(d)} onNo={() => setArm(null)} testid={`domain-remove-${d.host}`} />
                )}
                {armed(d, "resume") && (
                  <Confirm question={`Resume ${d.host}?`} detail={`It starts again at ${firstStep} a day. It was held because ${API.holdWords(d.held_why)}. ${w.fix ?? ""}`.trim()} yes="Yes, resume" busy={busy === d.id} onYes={() => resume(d)} onNo={() => setArm(null)} testid={`domain-resume-${d.host}`} />
                )}
              </span>
              <span className="cap"><span>{w.cap}</span></span>
              <StatePill kind="tone" value={w.tone} label={w.pill} />
              <span className="set-int-actions">
                {checkable && !(arm && arm.id === d.id) && (
                  <button type="button" className="btn btn-sm" onClick={() => check(d)} disabled={busy !== null} data-testid={`domain-check-${d.host}`} {...(owner || !window.gate ? {} : window.gate("team", "check a domain"))}>{busy === d.id ? "Checking…" : "Check"}</button>
                )}
                {resumable && !(arm && arm.id === d.id) && (
                  <button type="button" className="btn btn-sm" onClick={() => setArm({ id: d.id, what: "resume" })} disabled={busy !== null} data-testid={`domain-resume-${d.host}`} {...(owner || !window.gate ? {} : window.gate("team", "resume a domain"))}>Resume</button>
                )}
                {owner && !(arm && arm.id === d.id) && (
                  <button type="button" className="cl-bucket-link" onClick={() => setArm({ id: d.id, what: "remove" })} disabled={busy !== null} data-testid={`domain-remove-${d.host}`}>Remove</button>
                )}
              </span>
            </div>
            {showRecords && <SendingDomainRecords d={d} flash={flash} />}
          </React.Fragment>
        );
      })}
      {adding ? (
        <SendingDomainAdd mailDomain={email.domain} fromName={email.mailbox.from_name} flash={flash} onClose={() => setAdding(false)} />
      ) : (
        <div className="set-dom set-dom-foot">
          <span />
          <span className="t">
            <span>{API.footWords(domains.length, API.max)}</span>
          </span>
          <span />
          <span />
          <span className="set-int-actions">
            {ready && domains.length < API.max && (
              <button type="button" className="btn btn-sm" onClick={() => setAdding(true)} data-testid="domain-add-open" {...(owner || !window.gate ? {} : window.gate("team", "add a domain to send from"))}>
                <Icon name="plus" size={12} />Add a domain
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { SendingDomains });
