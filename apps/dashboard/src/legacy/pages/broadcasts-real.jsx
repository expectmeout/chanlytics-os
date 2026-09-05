/* global React, Icon, StatStrip, StatCell */
// Campaigns › Broadcasts, real: one approved template to the people who said
// yes. Same chrome as the seeded page (broadcasts.jsx); every number is a
// row's. Nothing here scores, estimates or invents: no credits, no revenue,
// no "booked from broadcasts" — the schema has no column for it.
//
// The audience chips carry the count of people who may receive an offer (a
// recorded yes and a number), computed by the same contracts predicate the
// route enrols with. The template is one WhatsApp approved; its values are
// typed here and the words a person will read are shown before anything is
// sent. Sends and cancels go through window.__broadcasts and the surface is
// re-fetched, so the Scheduled and History rows are the server's.

const useBroadcasts = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:broadcasts", bump);
    return () => window.removeEventListener("surface:broadcasts", bump);
  }, []);
  return window.__BROADCASTS;
};

const bcRender = (body, params) => String(body || "").replace(/\{\{(\d+)\}\}/g, (m, n) => (params[Number(n) - 1] || m));
const bcKey = (a) => `${a.kind}:${a.id || ""}`;
// Stable empties, so a workspace without lists or templates does not re-run
// the effects on every render.
const BC_NONE = [];

const BroadcastsReal = ({ initialSegment = null }) => {
  const data = useBroadcasts();
  const [toastNode, flash] = window.usePPToast();
  const canSend = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  const audiences = data.audiences || BC_NONE;
  const templates = data.templates || BC_NONE;
  const [aud, setAud] = React.useState(() => {
    const first = audiences.find((a) => a.kind === "saved" && a.id === initialSegment) || audiences[0];
    return first ? bcKey(first) : "everyone:";
  });
  const [tplId, setTplId] = React.useState(() => (templates[0] ? templates[0].id : ""));
  const [params, setParams] = React.useState({});
  const [name, setName] = React.useState("");
  const [when, setWhen] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!templates.some((t) => t.id === tplId) && templates[0]) setTplId(templates[0].id);
  }, [templates, tplId]);

  const active = audiences.find((a) => bcKey(a) === aud) || audiences[0] || null;
  const tpl = templates.find((t) => t.id === tplId) || null;
  const vars = tpl && Array.isArray(tpl.variables) ? tpl.variables : [];
  const filled = vars.map((v, i) => ((params[tplId] || [])[i] || ""));
  const ready = !!tpl && !!active && active.count > 0 && filled.every((v) => v.trim()) && !busy;
  const preview = tpl ? bcRender(tpl.body_preview, filled.map((v) => v.trim())) : "";

  const rows = data.rows || [];
  const open = rows.filter((r) => r.open);
  const history = rows.filter((r) => !r.open);
  const sentMessages = history.reduce((a, r) => a + r.counts.sent, 0);
  const delivered = history.reduce((a, r) => a + r.counts.delivered, 0);
  const stats = {
    sent: history.filter((r) => r.state === "sent").length,
    messages: sentMessages,
    delivered: sentMessages ? `${Math.round((delivered / sentMessages) * 100)}%` : "—",
    replies: history.reduce((a, r) => a + r.counts.replied, 0),
  };

  const submit = async (scheduled) => {
    if (!window.__broadcasts || !ready) return;
    setBusy(true);
    const r = await window.__broadcasts.send({
      template_id: tpl.id,
      params: filled.map((v) => v.trim()),
      audience: { kind: active.kind, id: active.id },
      scheduled_for: scheduled && when ? new Date(when).toISOString() : null,
      name: name.trim() || null,
    });
    setBusy(false);
    if (!r.ok) { flash({ msg: <>{r.message}</> }); return; }
    setName("");
    setWhen("");
    const n = r.data.recipient_count;
    flash({ msg: <><b>{r.data.name || "Broadcast"}</b> · {n} {n === 1 ? "person" : "people"} — {scheduled && when ? "scheduled" : "sending now, 25 at a time"}</> });
  };
  const cancel = async (row) => {
    if (!window.__broadcasts) return;
    const r = await window.__broadcasts.cancel(row.id);
    flash({ msg: r.ok ? <><b>{row.name}</b> {r.data.was === "sending" ? "stops after this batch" : "canceled — nothing will send"}</> : <>{r.message}</> });
  };

  return (
    <div className="bc-page" data-testid="broadcasts-real">
      <header className="ct-head">
        <div>
          <h2 className="ct-h2">Broadcasts</h2>
          <p className="ct-sub">One approved template to the people who said yes. Replies land in the Inbox, where the receptionist answers them.</p>
        </div>
      </header>

      <StatStrip>
        <StatCell label="Sent" value={stats.sent} meta={`${stats.messages.toLocaleString()} messages`} />
        <StatCell label="Delivered" tip="Delivered or read, over sent — WhatsApp's own receipts" value={stats.delivered} meta="from WhatsApp receipts" />
        <StatCell label="Replies" tip="Threads that heard from the customer after a broadcast" value={stats.replies} meta="answered in the Inbox" accent />
      </StatStrip>

      <section className="bc-composer" data-testid="bc-composer">
        <div className="ct-sec-head">
          <span className="ct-sec-title">New broadcast</span>
        </div>
        <div className="bc-row">
          <span className="bc-row-label">To</span>
          <div className="bc-chips" style={{ flexWrap: "wrap" }}>
            {audiences.map((a) => (
              <button key={bcKey(a)} className={"bc-chip" + (active && bcKey(active) === bcKey(a) ? " active" : "")} onClick={() => setAud(bcKey(a))} title={a.hint} data-testid="bc-audience">
                {a.label} <span className="bc-chip-count tabular">{a.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="bc-row">
          <span className="bc-row-label">Via</span>
          <div className="bc-chips">
            <button className="bc-chip active"><Icon name="chat" size={11} /> WhatsApp</button>
            <button className="bc-chip" disabled title="Not available yet"><Icon name="mail" size={11} /> Email</button>
            <button className="bc-chip" disabled title="Not available yet">SMS</button>
          </div>
        </div>
        <div className="bc-row">
          <span className="bc-row-label">Template</span>
          {templates.length === 0 ? (
            <span className="bc-excl-hint" data-testid="bc-no-template">
              No approved template yet — write one in WhatsApp Manager, then sync it in{" "}
              <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("integrations"))}>Settings › Integrations</button>.
            </span>
          ) : (
            <div className="bc-chips" style={{ flexWrap: "wrap" }}>
              {templates.map((t) => (
                <button key={t.id} className={"bc-chip" + (t.id === tplId ? " active" : "")} onClick={() => setTplId(t.id)} title={t.body_preview || ""} data-testid="bc-template">
                  {t.name}{t.category ? <span className="bc-chip-count">{t.category}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
        {tpl && vars.length > 0 && (
          <div className="bc-vars" data-testid="bc-vars">
            {vars.map((v, i) => (
              <label key={v.position || i} className="bc-var">
                <span className="bc-var-label">{v.label || `Value ${v.position || i + 1}`}</span>
                <input
                  value={filled[i]}
                  placeholder={v.example || ""}
                  onChange={(e) => setParams((p) => { const next = [...(p[tplId] || [])]; next[i] = e.target.value; return { ...p, [tplId]: next }; })}
                />
              </label>
            ))}
          </div>
        )}
        {tpl && <div className="bc-preview" data-testid="bc-preview">{preview}</div>}
        <div className="bc-meta">
          <Icon name="shield" size={11} />
          <span>
            {active ? `${active.count} ${active.count === 1 ? "person" : "people"} on “${active.label}” said yes` : "Pick who this goes to"}
            {" · "}people who asked to stop, have no number, or are mid-thread with a person are held back at the wire · sent 25 at a time
          </span>
        </div>
        <div className="bc-actions">
          <input className="bc-subject" type="text" placeholder="Name this broadcast (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={{ flex: 1 }} />
          <input className="bc-subject" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} data-testid="bc-when" />
          <button className="btn btn-sm" disabled={!ready || !when || !canSend} onClick={() => submit(true)}>Schedule</button>
          <button className="btn btn-primary btn-sm" disabled={!ready || !canSend} onClick={() => submit(false)} data-testid="bc-send">Send now</button>
        </div>
        {!canSend && <div className="bc-excl-hint">Only an owner or operator can send.</div>}
        {canSend && active && active.count === 0 && (
          <div className="bc-excl-hint" data-testid="bc-nobody">Nobody on “{active.label}” has said yes to offers yet. Record their answer on their profile first.</div>
        )}
      </section>

      <section className="ct-section">
        <div className="ct-sec-head">
          <span className="ct-sec-title">Scheduled</span>
          <span className="ct-sec-meta">{open.length} queued</span>
        </div>
        {open.length === 0 && (
          <div className="cv-empty">Nothing queued — pick a template above and choose a time, or send now.</div>
        )}
        {open.map((row) => (
          <div key={row.id} className="bc-sched" data-testid="bc-open">
            <div className="bc-sched-main">
              <span className="bc-sched-name">{row.name}</span>
              <span className="bc-sched-meta">
                {row.when} · {row.audience.label} · {row.recipient_count}
                {row.state === "sending" ? ` · ${row.counts.sent + row.counts.skipped + row.counts.failed} of ${row.recipient_count} done` : ""}
              </span>
            </div>
            <span className={"pill " + (row.state === "sending" ? "pill-info" : "")}>{row.stateLabel}</span>
            {canSend && <button className="btn btn-sm" onClick={() => cancel(row)}>{row.state === "sending" ? "Stop" : "Cancel"}</button>}
          </div>
        ))}
      </section>

      <section className="ct-section">
        <div className="ct-sec-head">
          <span className="ct-sec-title">History</span>
          <span className="ct-sec-meta">{history.length} broadcasts</span>
        </div>
        <div className="bc-hist">
          <div className="bc-hist-row head">
            <span>Broadcast</span><span>Audience</span><span className="num">Sent</span><span className="num">Delivered</span><span className="num">Read</span><span className="num">Replies</span>
          </div>
          {history.length === 0 && <div className="cv-empty">No broadcast sent yet.</div>}
          {history.map((h) => (
            <div key={h.id} className="bc-hist-row" data-testid="bc-history">
              <span className="bc-hist-name">
                {h.name}<span className="bc-hist-date">{h.when}{h.state !== "sent" ? ` · ${h.stateLabel.toLowerCase()}` : ""}</span>
              </span>
              <span className="bc-hist-seg">{h.audience.label}</span>
              <span className="num tabular">{h.counts.sent}{h.counts.skipped + h.counts.failed ? <span className="dim"> · {h.counts.skipped + h.counts.failed} held</span> : null}</span>
              <span className="num tabular">{h.deliveredPct === null ? "—" : `${h.deliveredPct}%`}</span>
              <span className="num tabular">{h.readPct === null ? "—" : `${h.readPct}%`}</span>
              <span className="num tabular">{h.counts.replied}</span>
            </div>
          ))}
        </div>
        <div className="ct-week-foot"><Icon name="chat" size={11} /> Replies never sit — the receptionist answers, books, or escalates to your Inbox.</div>
      </section>

      {toastNode}
    </div>
  );
};

window.BroadcastsPage = (props) => {
  const Seed = window.BroadcastsSeed;
  if (window.__BROADCASTS) return <BroadcastsReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};
