/* global React, Icon, StatStrip, StatCell, Confirm, EmptyState, FailedRead */
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
// The library's order: starters first, then templates written here, then the rest.
const bcOrder = (a, b) => (window.__starters ? window.__starters.compare(a, b) : 0);
// What a broadcast opens on: the quick note when the workspace holds it, else the first.
const bcDefault = (list) => ((window.__starters ? window.__starters.defaultFor(list, null) : list[0]) || null);
const bcFooter = (t) => { const s = t && window.__starters ? window.__starters.byName(t.name) : null; return s ? (window.__starters.text(s, t.language).footer || null) : null; };
// Stable empties, so a workspace without lists or templates does not re-run
// the effects on every render.
const BC_NONE = [];

// One broadcast's people: who got it (and whether WhatsApp says delivered
// or read), who was held back and why, who it could not reach. Fetched when
// a row is opened; every line is a recipient row.
const BC_STATUS_WORDS = { sent: "sent", delivered: "delivered", read: "read", failed: "not delivered", queued: "sending", canceled: "canceled" };
// A clock for a recipient's line: "10:32", or "Sep 12 10:32" when it was not today.
const bcClock = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
// What happened to one person, with the times WhatsApp's receipts gave (00111): "sent 10:31 · delivered 10:32 · read 10:40 · replied 10:52".
const bcReceipt = (r) => {
  const parts = [];
  const sent = bcClock(r.sent_at);
  parts.push(sent ? `sent ${sent}` : BC_STATUS_WORDS[r.message_status] || r.message_status || "sent");
  const delivered = bcClock(r.delivered_at);
  const read = bcClock(r.read_at);
  if (delivered) parts.push(`delivered ${delivered}`);
  else if (r.message_status === "delivered" || r.message_status === "read") parts.push("delivered");
  if (read) parts.push(`read ${read}`);
  else if (r.message_status === "read") parts.push("read");
  if (r.message_status === "failed") parts.push("not delivered");
  if (r.replied) parts.push(bcClock(r.replied_at) ? `replied ${bcClock(r.replied_at)}` : "replied");
  return parts.join(" · ");
};
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
          {got.map((r) => <Person key={r.contact_id} r={r} words={bcReceipt(r)} />)}
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
            {/* The row's OWN reason, as the held-back group above already does.
                Hardcoding send_failed here told everyone in this group that
                WhatsApp refused them -- including the people a run was killed
                mid-send for, who were never offered to WhatsApp at all. */}
            {rest.map((r) => <Person key={r.contact_id} r={r} words={r.state === "failed" ? ((heldReasons || {})[r.reason] || (heldReasons || {}).send_failed || "WhatsApp refused") : "queued"} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// One open broadcast: its name, its numbers, its state, and the verbs. The
// stop is armed and named for what it does -- stopping a send, skipping a run
// nobody approved and cancelling one still to come are three acts, and none
// of them is one click (the audit's D13). Drawn on its own by confirm.test.mjs.
const BC_STOP_WORDS = {
  sending: { verb: "Stop", question: (row) => `Stop ${row.name}?`, detail: "Messages already out stay out; the rest do not go.", yes: "Yes, stop it" },
  pending_approval: { verb: "Skip", question: (row) => `Skip ${row.name}?`, detail: "Nothing sends, and the run closes.", yes: "Yes, skip it" },
  scheduled: { verb: "Cancel", question: (row) => `Cancel ${row.name}?`, detail: "Nothing will send.", yes: "Yes, cancel it" },
};
const bcStopWords = (state) => BC_STOP_WORDS[state] || BC_STOP_WORDS.scheduled;
const BroadcastOpenRow = ({ row, canSend, onOpen, armed, onArm, stopping, approve, cancel }) => {
  const stop = bcStopWords(row.state);
  return (
    <div className="bc-sched" data-testid="bc-open">
      <div className="bc-sched-main">
        <span className="bc-sched-name"><button className="cl-bucket-link" onClick={onOpen} data-testid="bc-open-who">{row.name}</button></span>
        <span className="bc-sched-meta">
          {row.when} · {row.audience.label} · {row.recipient_count}
          {row.state === "sending" ? ` · ${row.counts.sent + row.counts.skipped + row.counts.failed} of ${row.recipient_count} done` : ""}
        </span>
      </div>
      <StatePill kind="broadcast" value={row.state} label={row.stateLabel} />
      {canSend && !armed && row.state === "pending_approval" && <button className="btn btn-primary btn-sm" onClick={() => approve(row)} data-testid="bc-approve">Approve</button>}
      {canSend && !armed && <button className="btn btn-sm danger" onClick={() => onArm(true)} data-testid="bc-stop">{stop.verb}</button>}
      {canSend && armed && (
        <Confirm question={stop.question(row)} detail={stop.detail} yes={stop.yes} danger busy={stopping} onYes={() => cancel(row)} onNo={() => onArm(false)} testid="bc-stop" />
      )}
    </div>
  );
};
window.BroadcastOpenRow = BroadcastOpenRow;

// When a send really goes, in one sentence for every receipt that has one. The
// server moves a send outside 9:00-20:59 by the business's clock to the next
// nine o'clock (moved_from set); an approve or a send says so, rather than
// "sending now" over a run that waits until morning.
const bcWhenWords = (d) => {
  const at = d && d.scheduled_for ? Date.parse(d.scheduled_for) : NaN;
  const when = Number.isNaN(at) ? null : new Date(at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  if (d && d.moved_from && when) return `scheduled for ${when} — messages go out between 9:00 and 20:59 by your clock`;
  if (when && at - Date.now() > 60_000) return `scheduled for ${when}`;
  return "sending now";
};
window.bcWhenWords = bcWhenWords;

// The history's numbers -- sent, delivered, replies -- over the rows the route
// returned. Past fifty broadcasts the route says older ones exist (more), and
// the numbers say they are the latest fifty rather than reading as everything.
const BcHistoryStats = ({ rows, more }) => {
  const history = (rows || []).filter((r) => !r.open);
  const messages = history.reduce((a, r) => a + r.counts.sent, 0);
  const delivered = history.reduce((a, r) => a + r.counts.delivered, 0);
  const scope = more ? " · latest 50 broadcasts" : "";
  return (
    <StatStrip>
      <StatCell label="Sent" value={history.filter((r) => r.state === "sent").length} meta={`${messages.toLocaleString()} messages${scope}`} />
      <StatCell label="Delivered" tip="Delivered or read, over sent — WhatsApp's own receipts" value={messages ? `${Math.round((delivered / messages) * 100)}%` : "—"} meta={`from WhatsApp receipts${scope}`} />
      <StatCell label="Replies" tip="Threads that heard from the customer within 3 days of a broadcast" value={history.reduce((a, r) => a + r.counts.replied, 0)} meta={`answered in the Inbox${scope}`} accent />
    </StatStrip>
  );
};
window.BcHistoryStats = BcHistoryStats;

const BroadcastsReal = ({ initialSegment = null }) => {
  const data = useBroadcasts();
  const [toastNode, flash] = window.usePPToast();
  const canSend = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  const audiences = data.audiences || BC_NONE;
  // Null: the templates read failed -- its own state, never "no template yet".
  const templatesRead = data.templates !== null;
  const templates = React.useMemo(() => (data.templates || BC_NONE).slice().sort(bcOrder), [data.templates]);
  const [aud, setAud] = React.useState(() => {
    const first = audiences.find((a) => (a.kind === "saved" || a.kind === "list") && a.id === initialSegment) || audiences[0];
    return first ? bcKey(first) : "everyone:";
  });
  const [tplId, setTplId] = React.useState(() => { const d = bcDefault(templates); return d ? d.id : ""; });
  const [params, setParams] = React.useState({});
  const [sources, setSources] = React.useState({});
  const [composing, setComposing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [when, setWhen] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [openId, setOpenId] = React.useState(null);
  // The row whose stop is armed, and the one whose stop is on its way.
  const [armId, setArmId] = React.useState(null);
  const [stopping, setStopping] = React.useState(null);
  const [addingStarters, setAddingStarters] = React.useState(false);
  // Starters in review at WhatsApp: the honest line while nothing is approved yet.
  const starterPending = (window.__TEMPLATES_ALL || BC_NONE).filter((t) => bcIsStarter(t.name) && t.meta_status === "pending").length;
  React.useEffect(() => {
    const d = bcDefault(templates);
    if (!templates.some((t) => t.id === tplId) && d) setTplId(d.id);
  }, [templates, tplId]);

  const active = audiences.find((a) => bcKey(a) === aud) || audiences[0] || null;
  // The template comes BEFORE the counts now, because the counts depend on it.
  //
  // An audience has two sizes, not one: a `utility` template reaches everybody who
  // said yes to hearing from the business, a marketing one reaches only those who
  // separately said yes to offers. The chip used to show a single number computed
  // before any template was picked, which meant the composer promised an audience
  // the enrolment route would then refuse. `purpose` is stamped on each template by
  // the bridge from Meta's own category, so the page never decides it.
  const tpl = templates.find((t) => t.id === tplId) || null;
  const purpose = (tpl && tpl.purpose) || "marketing";
  const sizeOf = (a) => (a && a.counts ? (a.counts[purpose] || 0) : 0);
  const activeCount = sizeOf(active);
  const number = data.number || null;
  const numberOk = !!(number && number.present && number.health.canSend);
  const overLimit = !!(active && number && number.health.limitPerDay !== null && activeCount > number.health.limitPerDay);
  const vars = tpl && Array.isArray(tpl.variables) ? tpl.variables : [];
  const SRC = window.TC_SOURCES || { text: "Type it", first_name: "Their first name", business_name: "The business name", booking_link: "The booking link" };
  // A starter's slots come filled in; a template written elsewhere gets a
  // guess from its labels. A booking link the workspace has not set falls
  // back to typed text, so nothing is offered that cannot be sent.
  const defaults = tpl && window.__starters ? window.__starters.slotKinds(tpl).map((k) => (k === "booking_link" && !data.bookingLink ? "text" : k)) : BC_NONE;
  const srcOf = (i) => ((sources[tplId] || defaults)[i] || "text");
  const exampleOf = (kind) => (kind === "first_name" ? "Dani" : kind === "business_name" ? (data.businessName || "the business") : kind === "booking_link" ? "your booking link" : "");
  // Each slot's words: a starter's own, else the labels the row carries.
  const labels = tpl && window.__starters ? window.__starters.slotLabels(tpl) : vars.map((v, i) => v.label || `Value ${v.position || i + 1}`);
  const typed = vars.map((v, i) => ((params[tplId] || [])[i] || ""));
  const filled = vars.map((v, i) => (srcOf(i) === "text" ? typed[i] : exampleOf(srcOf(i))));
  // The preview shows an unfilled slot by its name, never as {{n}}.
  const previewValues = vars.map((v, i) => (srcOf(i) === "text" ? (typed[i].trim() || `[${labels[i]}]`) : exampleOf(srcOf(i))));
  const specs = vars.map((v, i) => (srcOf(i) === "text" ? typed[i].trim() : { kind: srcOf(i) }));
  const ready = !!tpl && !!active && activeCount > 0 && filled.every((v) => String(v).trim()) && !busy && numberOk && !overLimit;
  const preview = tpl ? bcRender(tpl.body_preview, previewValues.map((v) => String(v).trim())) : "";

  const rows = data.rows || [];
  const open = rows.filter((r) => r.open);
  const history = rows.filter((r) => !r.open);

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
    if (!r.ok) { flash({ tone: "danger", msg: <>{r.message}</> }); return; }
    setName("");
    setWhen("");
    const n = r.data.recipient_count;
    // Outside nine to twenty by the business's clock the send moved to the next
    // nine o'clock: the receipt says when it really goes (bcWhenWords).
    const words = bcWhenWords(r.data);
    flash({ msg: <><b>{r.data.name || "Broadcast"}</b> · {n} {n === 1 ? "person" : "people"} — {words === "sending now" ? "sending now, 25 at a time" : words}</> });
  };
  const addStarters = async () => {
    if (!window.__templates || !window.__templates.addStarters || addingStarters) return;
    setAddingStarters(true);
    const r = await window.__templates.addStarters({ languages: ["en_US"] });
    setAddingStarters(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>{window.starterWords ? window.starterWords(r.data) : "Added"}</> : <>{r.message}</> });
  };
  const cancel = async (row) => {
    if (!window.__broadcasts || stopping) return;
    setStopping(row.id);
    const r = await window.__broadcasts.cancel(row.id);
    setStopping(null);
    setArmId(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <><b>{row.name}</b> {r.data.was === "sending" ? "stops after this batch" : r.data.was === "pending_approval" ? "skipped — nothing will send" : "canceled — nothing will send"}</> : <>{r.message}</> });
  };
  const approve = async (row) => {
    if (!window.__broadcasts) return;
    const r = await window.__broadcasts.approve(row.id);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <><b>{row.name}</b> approved — {r.data.recipient_count} {r.data.recipient_count === 1 ? "person" : "people"}, {bcWhenWords(r.data)}</> : <>{r.message}</> });
  };

  return (
    <div className="bc-page" data-testid="broadcasts-real">
      <header className="ct-head">
        <div>
          <h2 className="ct-h2">Broadcasts</h2>
          <p className="ct-sub">One approved template to the people who said yes. Replies land in the Inbox, where the receptionist answers them.</p>
        </div>
      </header>

      <BcHistoryStats rows={rows} more={data.more} />

      <section className="bc-composer" data-testid="bc-composer">
        <div className="ct-sec-head">
          <span className="ct-sec-title">New broadcast</span>
        </div>
        <div className="bc-row">
          <span className="bc-row-label">To</span>
          <div className="bc-chips" style={{ flexWrap: "wrap" }}>
            {audiences.map((a) => (
              <button key={bcKey(a)} className={"bc-chip" + (active && bcKey(active) === bcKey(a) ? " active" : "")} onClick={() => setAud(bcKey(a))} title={a.hint} data-testid="bc-audience">
                {a.label} <span className="bc-chip-count tabular">{sizeOf(a)}</span>
              </button>
            ))}
            {data.listsRead === false && <FailedRead kind="line" what="your saved lists" body="The built-in audiences are current; the lists you keep by hand are missing until they read." surface="broadcasts" testid="bc-lists-failed" />}
          </div>
        </div>
        <div className="bc-row">
          <span className="bc-row-label">Send</span>
          <div className="bc-chips" style={{ flexWrap: "wrap" }}>
            {!templatesRead && <FailedRead kind="line" what="your templates" surface="broadcasts" testid="bc-templates-failed" />}
            {templatesRead && templates.length === 0 && (
              <span className="bc-excl-hint" data-testid="bc-no-template">
                {starterPending > 0
                  ? `Your starter templates are in review at WhatsApp (${starterPending}) — they appear here once approved, usually within minutes.`
                  : "No approved template yet — add the starter set, write one here, or write one in WhatsApp Manager and sync it under Campaigns › Messages."}
              </span>
            )}
            {templatesRead && templates.length === 0 && canSend && starterPending === 0 && window.__templates && window.__templates.addStarters && (
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
                <span className="bc-var-label">{labels[i]}</span>
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
            {active
              ? `${activeCount} ${activeCount === 1 ? "person" : "people"} on “${active.label}” said yes${purpose === "marketing" ? " to offers" : " to messages"}`
              : "Pick who this goes to"}
            {" · "}people who asked to stop, have no number, or are mid-thread with a person are held back at the wire · sent 25 at a time
          </span>
        </div>
        {number && (
          <div className={`bc-number bc-number-${number.health.tone}`} data-testid="bc-number">
            <Icon name="chat" size={11} />
            <span>{number.present ? `WhatsApp ${number.display || ""} · ${number.health.label}` : "No WhatsApp number connected — connect one in Settings › Connections."}</span>
          </div>
        )}
        {number && number.present && !number.health.canSend && <div className="bc-excl-hint" data-testid="bc-number-refusal">{number.health.refusal}</div>}
        {/* Said once, here, where an offer is picked: why a customer who only ever
            texted is not in an offer's count. The wire refuses per customer
            (sms_carries_no_promotions); the page states the rule. */}
        {purpose === "marketing" && data.offersNote && <div className="bc-excl-hint" data-testid="bc-offers-note">{data.offersNote}</div>}
        {overLimit && active && number && (
          <div className="bc-excl-hint" data-testid="bc-over-limit">This number can start up to {number.health.limitPerDay.toLocaleString()} new conversations a day; “{active.label}” is {activeCount.toLocaleString()}. Send to a smaller list or split it.</div>
        )}
        <div className="bc-actions">
          <input className="bc-subject" type="text" placeholder="Name this broadcast (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={{ flex: 1 }} />
          <input className="bc-subject" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} data-testid="bc-when" />
          <button className="btn btn-sm" disabled={!ready || !when || !canSend} onClick={() => submit(true)}>Schedule</button>
          <button className="btn btn-primary btn-sm" disabled={!ready || !canSend} onClick={() => submit(false)} data-testid="bc-send">Send now</button>
        </div>
        {!canSend && <div className="bc-excl-hint">Only an owner or operator can send.</div>}
        {canSend && active && activeCount === 0 && (
          <div className="bc-excl-hint" data-testid="bc-nobody">
            {purpose === "marketing"
              ? <>Nobody on “{active.label}” has said yes to offers yet — that is a separate answer from saying yes to messages. Record it under “Offers and news” on their profile, or get their yes with the phrase and QR below.</>
              : <>Nobody on “{active.label}” has said yes to messages yet. Record it on their profile, or get their yes with the phrase and QR below.</>}
          </div>
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
              {data.optIn.pageUrl && (
                <p className="bc-optin-page" data-testid="bc-optin-page">
                  Or share your sign-up page: <a className="cl-bucket-link" href={data.optIn.pageUrl} target="_blank" rel="noreferrer">{data.optIn.pageUrl.replace("https://", "")}</a>. It shows the same QR and the wording the phone carriers ask for before they let a business text. For a customer who would rather sign on paper, print <a className="cl-bucket-link" href={`${data.optIn.pageUrl}/form`} target="_blank" rel="noreferrer" data-testid="bc-optin-form">the sign-up form</a> — two separate boxes, each signed on its own — and record each signed box on their profile as “Sign-up form”.
                </p>
              )}
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
          <EmptyState kind="line" title="Nothing queued." body="Pick a template above and choose a time, or send now." />
        )}
        {open.map((row) => (
          <React.Fragment key={row.id}>
          <BroadcastOpenRow row={row} canSend={canSend} onOpen={() => setOpenId(openId === row.id ? null : row.id)} armed={armId === row.id} onArm={(on) => setArmId(on ? row.id : null)} stopping={stopping === row.id} approve={approve} cancel={cancel} />
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
          {history.length === 0 && <EmptyState kind="line" title="No broadcast sent yet." />}
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
