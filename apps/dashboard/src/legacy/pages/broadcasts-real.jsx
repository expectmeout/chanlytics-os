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
// Words for people: a starter's title, or the name with its underscores made spaces.
const bcTitle = (name) => (window.__starters ? window.__starters.title(name) : String(name || "").replace(/_/g, " "));
const bcIsStarter = (name) => !!(window.__starters && window.__starters.byName(name));
// Starters first, then marketing, then utility: what a broadcast most often needs is nearest.
const bcOrder = (a, b) => (Number(bcIsStarter(b.name)) - Number(bcIsStarter(a.name))) || String(a.category || "").localeCompare(String(b.category || "")) || String(a.name).localeCompare(String(b.name));
const bcFooter = (t) => { const s = t && window.__starters ? window.__starters.byName(t.name) : null; return s ? (window.__starters.text(s, t.language).footer || null) : null; };
// Stable empties, so a workspace without lists or templates does not re-run
// the effects on every render.
const BC_NONE = [];

// One broadcast's people: who got it (and whether WhatsApp says delivered
// or read), who was held back and why, who it could not reach. Fetched when
// a row is opened; every line is a recipient row.
const BC_STATUS_WORDS = { sent: "sent", delivered: "delivered", read: "read", failed: "not delivered", queued: "sending", canceled: "canceled" };
const BroadcastDetail = ({ id, heldReasons, onClose }) => {
  const [d, setD] = React.useState(undefined);
  React.useEffect(() => {
    let on = true;
    setD(undefined);
    if (!window.__broadcasts) return undefined;
    window.__broadcasts.detail(id).then((r) => { if (on) setD(r.ok ? r.data : null); });
    return () => { on = false; };
  }, [id]);
  if (d === undefined) return <div className="bc-detail" data-testid="bc-detail"><span className="cl-prof-aut-hint">Reading who got it…</span></div>;
  if (!d) return <div className="bc-detail" data-testid="bc-detail"><span className="cl-prof-aut-hint">Couldn't be read right now.</span></div>;
  const got = d.recipients.filter((r) => r.state === "sent");
  const heldBack = d.recipients.filter((r) => r.state === "skipped");
  const rest = d.recipients.filter((r) => r.state === "failed" || r.state === "queued");
  const Person = ({ r, words }) => (
    <div className="bc-person" data-testid="bc-person">
      <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(`clients/${r.contact_id}`)}>{r.name}</button>
      <span className="dim">{words}</span>
      {r.conversation_id && <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(`inbox/th-${r.conversation_id}`)}>Open thread</button>}
    </div>
  );
  return (
    <div className="bc-detail" data-testid="bc-detail">
      <div className="ct-sec-head">
        <span className="ct-sec-title">{d.broadcast.name}</span>
        <span className="ct-sec-meta">{d.broadcast.audience.label} · {d.recipients.length} enrolled · {bcTitle(d.broadcast.template_name)}</span>
        <button className="cl-bucket-link" onClick={onClose}>Close</button>
      </div>
      {d.broadcast.params.length > 0 && <div className="cl-prof-aut-hint">Values: {d.broadcast.params.map((p) => (p && p.kind && p.kind !== "text" ? ((window.TC_SOURCES || {})[p.kind] || p.kind).toLowerCase() : (p && p.value) || String(p))).join(" · ")}</div>}
      <div className="bc-detail-groups">
        <div className="bc-detail-group">
          <div className="cl-prof-rail-label">Got it · {got.length}</div>
          {got.map((r) => <Person key={r.contact_id} r={r} words={`${BC_STATUS_WORDS[r.message_status] || r.message_status || "sent"}${r.replied ? " · replied" : ""}`} />)}
          {got.length === 0 && <span className="cl-prof-aut-hint">Nobody yet.</span>}
        </div>
        <div className="bc-detail-group">
          <div className="cl-prof-rail-label">Held back · {heldBack.length}</div>
          {heldBack.map((r) => <Person key={r.contact_id} r={r} words={(heldReasons || {})[r.reason] || r.reason || "held"} />)}
          {heldBack.length === 0 && <span className="cl-prof-aut-hint">Nobody.</span>}
        </div>
        {rest.length > 0 && (
          <div className="bc-detail-group">
            <div className="cl-prof-rail-label">Not there yet · {rest.length}</div>
            {rest.map((r) => <Person key={r.contact_id} r={r} words={r.state === "failed" ? ((heldReasons || {}).send_failed || "WhatsApp refused") : "queued"} />)}
          </div>
        )}
      </div>
    </div>
  );
};

const BroadcastsReal = ({ initialSegment = null }) => {
  const data = useBroadcasts();
  const [toastNode, flash] = window.usePPToast();
  const canSend = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  const audiences = data.audiences || BC_NONE;
  const templates = React.useMemo(() => (data.templates || BC_NONE).slice().sort(bcOrder), [data.templates]);
  const [aud, setAud] = React.useState(() => {
    const first = audiences.find((a) => (a.kind === "saved" || a.kind === "list") && a.id === initialSegment) || audiences[0];
    return first ? bcKey(first) : "everyone:";
  });
  const [tplId, setTplId] = React.useState(() => (templates[0] ? templates[0].id : ""));
  const [params, setParams] = React.useState({});
  const [sources, setSources] = React.useState({});
  const [composing, setComposing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [when, setWhen] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [openId, setOpenId] = React.useState(null);
  const [addingStarters, setAddingStarters] = React.useState(false);
  // Starters in review at WhatsApp: the honest line while nothing is approved yet.
  const starterPending = (window.__TEMPLATES_ALL || BC_NONE).filter((t) => bcIsStarter(t.name) && t.meta_status === "pending").length;
  React.useEffect(() => {
    if (!templates.some((t) => t.id === tplId) && templates[0]) setTplId(templates[0].id);
  }, [templates, tplId]);

  const active = audiences.find((a) => bcKey(a) === aud) || audiences[0] || null;
  // After `active`: the limit check reads the chosen audience's count.
  const number = data.number || null;
  const numberOk = !!(number && number.present && number.health.canSend);
  const overLimit = !!(active && number && number.health.limitPerDay !== null && active.count > number.health.limitPerDay);
  const tpl = templates.find((t) => t.id === tplId) || null;
  const vars = tpl && Array.isArray(tpl.variables) ? tpl.variables : [];
  const SRC = window.TC_SOURCES || { text: "Type it", first_name: "Their first name", business_name: "The business name", booking_link: "The booking link" };
  // A starter's slots come filled in; a template written elsewhere gets a
  // guess from its labels. A booking link the workspace has not set falls
  // back to typed text, so nothing is offered that cannot be sent.
  const defaults = tpl && window.__starters ? window.__starters.slotKinds(tpl).map((k) => (k === "booking_link" && !data.bookingLink ? "text" : k)) : BC_NONE;
  const srcOf = (i) => ((sources[tplId] || defaults)[i] || "text");
  const exampleOf = (kind) => (kind === "first_name" ? "Dani" : kind === "business_name" ? (data.businessName || "the business") : kind === "booking_link" ? "your booking link" : "");
  const typed = vars.map((v, i) => ((params[tplId] || [])[i] || ""));
  const filled = vars.map((v, i) => (srcOf(i) === "text" ? typed[i] : exampleOf(srcOf(i))));
  const specs = vars.map((v, i) => (srcOf(i) === "text" ? typed[i].trim() : { kind: srcOf(i) }));
  const ready = !!tpl && !!active && active.count > 0 && filled.every((v) => String(v).trim()) && !busy && numberOk && !overLimit;
  const preview = tpl ? bcRender(tpl.body_preview, filled.map((v) => String(v).trim())) : "";

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
      params: specs,
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
  const addStarters = async () => {
    if (!window.__templates || !window.__templates.addStarters || addingStarters) return;
    setAddingStarters(true);
    const r = await window.__templates.addStarters({ languages: ["en_US"] });
    setAddingStarters(false);
    flash({ msg: r.ok ? <>{window.starterWords ? window.starterWords(r.data) : "Added"}</> : <>{r.message}</> });
  };
  const cancel = async (row) => {
    if (!window.__broadcasts) return;
    const r = await window.__broadcasts.cancel(row.id);
    flash({ msg: r.ok ? <><b>{row.name}</b> {r.data.was === "sending" ? "stops after this batch" : r.data.was === "pending_approval" ? "skipped — nothing will send" : "canceled — nothing will send"}</> : <>{r.message}</> });
  };
  const approve = async (row) => {
    if (!window.__broadcasts) return;
    const r = await window.__broadcasts.approve(row.id);
    flash({ msg: r.ok ? <><b>{row.name}</b> approved — {r.data.recipient_count} {r.data.recipient_count === 1 ? "person" : "people"}, sending now</> : <>{r.message}</> });
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
          <span className="bc-row-label">Send</span>
          <div className="bc-chips" style={{ flexWrap: "wrap" }}>
            {templates.length === 0 && (
              <span className="bc-excl-hint" data-testid="bc-no-template">
                {starterPending > 0
                  ? `Your starter templates are in review at WhatsApp (${starterPending}) — they appear here once approved, usually within minutes.`
                  : "No approved template yet — add the starter set, write one here, or sync one from WhatsApp Manager in Settings › Integrations."}
              </span>
            )}
            {templates.length === 0 && canSend && starterPending === 0 && window.__templates && window.__templates.addStarters && (
              <button className="bc-chip" disabled={addingStarters} onClick={addStarters} data-testid="bc-add-starters"><Icon name="sparkle" size={10} /> {addingStarters ? "Adding…" : "Add the starter set"}</button>
            )}
            {templates.map((t) => (
              <button key={t.id} className={"bc-chip" + (t.id === tplId ? " active" : "")} onClick={() => setTplId(t.id)} title={t.body_preview || ""} data-testid="bc-template">
                {bcTitle(t.name)}<span className="bc-chip-count">{bcIsStarter(t.name) ? "starter" : (t.category || "")}</span>
              </button>
            ))}
            {canSend && window.TemplateComposer && (
              <button className="bc-chip" onClick={() => setComposing((c) => !c)} data-testid="bc-new-template"><Icon name="plus" size={10} /> New template</button>
            )}
          </div>
        </div>
        {composing && window.TemplateComposer && (
          <window.TemplateComposer
            businessName={data.businessName}
            onCancel={() => setComposing(false)}
            onDone={(made) => { setComposing(false); flash({ msg: <><b>{made.name}</b> submitted — WhatsApp reviews it; it appears here once approved</> }); }}
          />
        )}
        {tpl && vars.length > 0 && (
          <div className="bc-vars" data-testid="bc-vars">
            {vars.map((v, i) => (
              <label key={v.position || i} className="bc-var">
                <span className="bc-var-label">{v.label || `Value ${v.position || i + 1}`}</span>
                <span className="bc-var-row">
                  <select
                    className="tpl-select"
                    value={srcOf(i)}
                    data-testid="bc-var-source"
                    onChange={(e) => setSources((s) => { const next = [...(s[tplId] || [])]; next[i] = e.target.value; return { ...s, [tplId]: next }; })}
                  >
                    {Object.keys(SRC).filter((k) => k !== "booking_link" || data.bookingLink).map((k) => <option key={k} value={k}>{SRC[k]}</option>)}
                  </select>
                  <input
                    value={srcOf(i) === "text" ? typed[i] : exampleOf(srcOf(i))}
                    disabled={srcOf(i) !== "text"}
                    placeholder={v.example || ""}
                    onChange={(e) => setParams((p) => { const next = [...(p[tplId] || [])]; next[i] = e.target.value; return { ...p, [tplId]: next }; })}
                  />
                </span>
              </label>
            ))}
          </div>
        )}
        {tpl && <div className="bc-preview-wrap" data-testid="bc-preview"><window.WaBubble from={data.businessName} body={preview} footer={bcFooter(tpl)} /></div>}
        <div className="bc-meta">
          <Icon name="shield" size={11} />
          <span>
            {active ? `${active.count} ${active.count === 1 ? "person" : "people"} on “${active.label}” said yes` : "Pick who this goes to"}
            {" · "}people who asked to stop, have no number, or are mid-thread with a person are held back at the wire · sent 25 at a time
          </span>
        </div>
        {number && (
          <div className={`bc-number bc-number-${number.health.tone}`} data-testid="bc-number">
            <Icon name="chat" size={11} />
            <span>{number.present ? `WhatsApp ${number.display || ""} · ${number.health.label}` : "No WhatsApp number connected — connect one in Settings › Integrations."}</span>
          </div>
        )}
        {number && number.present && !number.health.canSend && <div className="bc-excl-hint" data-testid="bc-number-refusal">{number.health.refusal}</div>}
        {overLimit && active && number && (
          <div className="bc-excl-hint" data-testid="bc-over-limit">This number can start up to {number.health.limitPerDay.toLocaleString()} new conversations a day; “{active.label}” is {active.count.toLocaleString()}. Send to a smaller list or split it.</div>
        )}
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

      {data.optIn && data.optIn.link && (
        <section className="ct-section bc-optin" data-testid="bc-optin">
          <div className="ct-sec-head">
            <span className="ct-sec-title">Get their yes</span>
            <span className="ct-sec-meta">the only way onto a broadcast</span>
          </div>
          <div className="bc-optin-body">
            <img className="bc-optin-qr" src={data.optIn.qrPath} alt={`QR code that opens WhatsApp with “${data.optIn.phrase}” ready to send`} width={120} height={120} />
            <div className="bc-optin-text">
              <p>
                Put this where customers look — a QR at the desk, the link in your bio. It opens WhatsApp with <b>{data.optIn.phrase}</b> ready to send;
                sending it records their yes by their own message, and the receptionist thanks them. In Spanish, <b>{data.optIn.phraseEs}</b> works too. Reply STOP undoes it.
              </p>
              <div className="bc-chips">
                <button className="btn btn-sm" data-testid="bc-optin-copy" onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(data.optIn.link).then(() => flash({ msg: <>Link copied</> })); }}>Copy link</button>
                <a className="btn btn-sm" href={data.optIn.qrPath} download="say-yes-to-offers.svg">Download QR</a>
                <a className="cl-bucket-link" href={data.optIn.link} target="_blank" rel="noreferrer">Open the link</a>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="ct-section">
        <div className="ct-sec-head">
          <span className="ct-sec-title">Scheduled</span>
          <span className="ct-sec-meta">{open.length} queued</span>
        </div>
        {open.length === 0 && (
          <div className="cv-empty">Nothing queued — pick a template above and choose a time, or send now.</div>
        )}
        {open.map((row) => (
          <React.Fragment key={row.id}>
          <div className="bc-sched" data-testid="bc-open">
            <div className="bc-sched-main">
              <span className="bc-sched-name"><button className="cl-bucket-link" onClick={() => setOpenId(openId === row.id ? null : row.id)} data-testid="bc-open-who">{row.name}</button></span>
              <span className="bc-sched-meta">
                {row.when} · {row.audience.label} · {row.recipient_count}
                {row.state === "sending" ? ` · ${row.counts.sent + row.counts.skipped + row.counts.failed} of ${row.recipient_count} done` : ""}
              </span>
            </div>
            <span className={"pill " + (row.state === "sending" ? "pill-info" : row.state === "pending_approval" ? "pill-warn" : "")}>{row.stateLabel}</span>
            {canSend && row.state === "pending_approval" && <button className="btn btn-primary btn-sm" onClick={() => approve(row)} data-testid="bc-approve">Approve</button>}
            {canSend && <button className="btn btn-sm" onClick={() => cancel(row)}>{row.state === "sending" ? "Stop" : row.state === "pending_approval" ? "Skip" : "Cancel"}</button>}
          </div>
          {openId === row.id && <BroadcastDetail id={row.id} heldReasons={data.heldReasons} onClose={() => setOpenId(null)} />}
          </React.Fragment>
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
            <React.Fragment key={h.id}>
            <div className={"bc-hist-row clickable" + (openId === h.id ? " is-open" : "")} data-testid="bc-history" role="button" tabIndex={0}
              onClick={() => setOpenId(openId === h.id ? null : h.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(openId === h.id ? null : h.id); } }}>
              <span className="bc-hist-name">
                {h.name}<span className="bc-hist-date">{h.when}{h.state !== "sent" ? ` · ${h.stateLabel.toLowerCase()}` : ""}</span>
              </span>
              <span className="bc-hist-seg">{h.audience.label}</span>
              <span className="num tabular">{h.counts.sent}{h.counts.skipped + h.counts.failed ? <span className="dim"> · {h.counts.skipped + h.counts.failed} held</span> : null}</span>
              <span className="num tabular">{h.deliveredPct === null ? "—" : `${h.deliveredPct}%`}</span>
              <span className="num tabular">{h.readPct === null ? "—" : `${h.readPct}%`}</span>
              <span className="num tabular">{h.counts.replied}</span>
            </div>
            {openId === h.id && <BroadcastDetail id={h.id} heldReasons={data.heldReasons} onClose={() => setOpenId(null)} />}
            </React.Fragment>
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
