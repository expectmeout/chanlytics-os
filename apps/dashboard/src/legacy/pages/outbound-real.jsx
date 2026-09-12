/* global React, Icon, StatStrip, StatCell, PolicyChip */
// Campaigns › Playbooks, real: a standing rule that sends one approved
// template to newly eligible people who said yes, under the workspace's
// autonomy mode. Same chrome as the seeded Outbound page (outbound.jsx);
// every number is a run's. Nothing here scores, estimates or invents.
//
// Four triggers, each a People list that keeps itself current: win-back
// (quiet 30 days), welcome (new this week), save our number (phoned only),
// the month's offer (everyone who said yes, on a cadence). Each runs under
// one of the two Autonomy rows — auto sends, veto sends after a stop window,
// ask leaves the run waiting here and on Today, never does nothing. Every
// verb goes through window.__playbooks and the surface is re-fetched, so the
// cards are the server's.

const usePlaybooks = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:playbooks", bump);
    return () => window.removeEventListener("surface:playbooks", bump);
  }, []);
  return window.__PLAYBOOKS;
};

// Stable empties, so a workspace without templates or triggers does not
// re-run the effects on every render.
const PB_NONE = [];
const PB_HOURS = Array.from({ length: 12 }, (_, i) => 9 + i);
const PB_FILTERS = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "approval", label: "Needs you" },
  { id: "paused", label: "Paused" },
];
// The Autonomy row a class runs under, in the matrix's own words (the playbooks surface carries them).
const pbRowLabel = (cls) => ((window.__PLAYBOOKS && window.__PLAYBOOKS.classWords && window.__PLAYBOOKS.classWords[cls]) || {}).name || cls;
const pbRender = (body, values) => String(body || "").replace(/\{\{(\d+)\}\}/g, (m, n) => (values[Number(n) - 1] || m));
const pbHour = (h) => `${String(h).padStart(2, "0")}:00`;
const pbPeople = (n) => `${n} ${n === 1 ? "person" : "people"}`;
const pbStatus = (p) => (p.totals && p.totals.waiting ? "approval" : p.state);
// Words for people: a starter's title, or the name with its underscores made spaces.
const pbTitle = (name) => (window.__starters ? window.__starters.title(name) : String(name || "").replace(/_/g, " "));
const pbIsStarter = (name) => !!(window.__starters && window.__starters.byName(name));
const pbOrder = (a, b) => (window.__starters ? window.__starters.compare(a, b) : 0);
const pbFooter = (t) => { const s = t && window.__starters ? window.__starters.byName(t.name) : null; return s ? (window.__starters.text(s, t.language).footer || null) : null; };

// The composer: a new playbook, or one being changed. Checked here the way
// the route checks it — a template chosen, every slot filled — so an
// enabled Save is a Save that succeeds unless the server knows something
// newer (a template no longer approved, a booking link gone).
const PlaybookComposer = ({ data, editing, onDone, onCancel }) => {
  const templates = React.useMemo(() => (data.templates || PB_NONE).slice().sort(pbOrder), [data.templates]);
  const triggers = data.triggers || PB_NONE;
  const SRC = window.TC_SOURCES || { text: "Type it", first_name: "Their first name", business_name: "The business name", booking_link: "The booking link", visit_when: "Their visit's time", visit_service: "Their visit's service" };
  const [trigger, setTrigger] = React.useState(editing ? editing.trigger : (triggers[0] ? triggers[0].id : "quiet_30"));
  const [tplId, setTplId] = React.useState(() => {
    if (editing) return editing.template_id;
    const d = window.__starters ? window.__starters.defaultFor(templates, trigger) : templates[0];
    return d ? d.id : "";
  });
  const [name, setName] = React.useState(editing ? editing.name : "");
  const [hour, setHour] = React.useState(editing ? editing.run_hour : 10);
  const [cap, setCap] = React.useState(editing ? editing.cap_per_run : 25);
  const [gap, setGap] = React.useState(editing ? editing.gap_days : 90);
  const [cadence, setCadence] = React.useState(editing ? editing.cadence_days : 30);
  // Per template: where each slot's value comes from, and the typed text.
  const [sources, setSources] = React.useState(() => (editing && Array.isArray(editing.params)
    ? { [editing.template_id]: editing.params.map((p) => (p && p.kind ? p.kind : "text")) } : {}));
  const [typed, setTyped] = React.useState(() => (editing && Array.isArray(editing.params)
    ? { [editing.template_id]: editing.params.map((p) => (p && p.kind === "text" ? p.value : "")) } : {}));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [picked, setPicked] = React.useState(!!editing);
  const [adding, setAdding] = React.useState(false);
  const canEdit = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  React.useEffect(() => {
    if (!templates.some((t) => t.id === tplId) && templates[0]) setTplId(templates[0].id);
  }, [templates, tplId]);
  // The trigger's starter, if the workspace holds it: approved and picked
  // for you, in review at WhatsApp, or not added yet — one click adds it.
  const starter = window.__starters ? window.__starters.forTrigger(trigger) : null;
  const starterRow = starter ? templates.find((t) => t.name === starter.name) || null : null;
  const starterAny = starter ? (window.__TEMPLATES_ALL || PB_NONE).find((t) => t.name === starter.name) || null : null;
  React.useEffect(() => {
    if (picked) return;
    if (starterRow) setTplId(starterRow.id);
  }, [picked, starterRow]);
  const addStarter = async () => {
    if (!window.__templates || !window.__templates.addStarters || !starter || adding) return;
    setAdding(true);
    setError(null);
    const r = await window.__templates.addStarters({ keys: [starter.key], languages: ["en_US"] });
    setAdding(false);
    if (!r.ok) setError(r.message || "It could not be added.");
  };

  const trig = triggers.find((t) => t.id === trigger) || null;
  const tpl = templates.find((t) => t.id === tplId) || null;
  const vars = tpl && Array.isArray(tpl.variables) ? tpl.variables : [];
  // A starter's slots come filled in; a template written elsewhere gets a
  // guess from its labels. A booking link the workspace has not set falls
  // back to typed text.
  const defaults = tpl && window.__starters ? window.__starters.slotKinds(tpl).map((k) => (k === "booking_link" && !data.bookingLink ? "text" : k)) : PB_NONE;
  const srcOf = (i) => ((sources[tplId] || defaults)[i] || "text");
  const textOf = (i) => ((typed[tplId] || [])[i] || "");
  const PB_EXAMPLES = { visit_when: "tomorrow at 2:00 PM", visit_service: "a consultation" };
  const exampleOf = (kind) => (kind === "first_name" ? "Dani" : kind === "business_name" ? (data.businessName || "the business") : kind === "booking_link" ? "your booking link" : (PB_EXAMPLES[kind] || ""));
  const labels = tpl && window.__starters ? window.__starters.slotLabels(tpl) : vars.map((v, i) => v.label || `Value ${v.position || i + 1}`);
  const filled = vars.map((v, i) => (srcOf(i) === "text" ? textOf(i) : exampleOf(srcOf(i))));
  const previewValues = vars.map((v, i) => (srcOf(i) === "text" ? (textOf(i).trim() || `[${labels[i]}]`) : exampleOf(srcOf(i))));
  const specs = vars.map((v, i) => (srcOf(i) === "text" ? textOf(i).trim() : { kind: srcOf(i) }));
  const monthly = trigger === "everyone_monthly";
  const ready = !!trig && !!tpl && filled.every((v) => String(v).trim()) && !busy;
  const preview = tpl ? pbRender(tpl.body_preview, previewValues.map((v) => String(v).trim())) : "";

  const save = async () => {
    if (!window.__playbooks || !ready) return;
    setBusy(true);
    setError(null);
    const body = { name: name.trim() || null, trigger, template_id: tpl.id, params: specs, run_hour: Number(hour), cap_per_run: Number(cap), gap_days: Number(gap), cadence_days: Number(cadence) };
    const r = editing ? await window.__playbooks.update(editing.id, body) : await window.__playbooks.create(body);
    setBusy(false);
    if (!r.ok) { setError(r.message || "It could not be saved."); return; }
    onDone(r.data, !!editing);
  };

  return (
    <section className="bc-composer" data-testid="pb-composer">
      <div className="ct-sec-head">
        <span className="ct-sec-title">{editing ? "Change this playbook" : "New playbook"}</span>
        <span className="ct-sec-meta">one approved template · to the people on a list who said yes · on your clock</span>
      </div>
      <div className="bc-row">
        <span className="bc-row-label">When</span>
        <div className="bc-chips" style={{ flexWrap: "wrap" }}>
          {triggers.map((t) => (
            <button key={t.id} className={"bc-chip" + (t.id === trigger ? " active" : "")} onClick={() => setTrigger(t.id)} title={t.hint} data-testid="pb-trigger">
              {t.label} <span className="bc-chip-count tabular">{t.candidates}</span>
            </button>
          ))}
        </div>
      </div>
      {trig && (
        <div className="cl-prof-aut-hint" data-testid="pb-trigger-hint">
          {trig.hint} · {pbPeople(trig.candidates)} {trig.kind === "visit" ? "with a recorded yes on that day right now" : "on that list said yes right now"}{trig.kind !== "visit" && trig.held > 0 ? ` · ${trig.held} more heard from you this week and wait` : ""} · runs under “{pbRowLabel(trig.cls)}” in Settings › Autonomy{trig.kind === "visit" ? " · one message per visit" : ""}{trig.kind === "visit" && data.calendar !== "ok" ? " · needs the calendar connected in Settings › Workspace" : ""}
        </div>
      )}
      <div className="bc-row">
        <span className="bc-row-label">Send</span>
        <div className="bc-chips" style={{ flexWrap: "wrap" }}>
          {templates.length === 0 && (
            <span className="bc-excl-hint" data-testid="pb-no-template">No approved template yet — write one on Broadcasts, or in WhatsApp Manager and sync it under Campaigns › Messages.</span>
          )}
          {templates.map((t) => (
            <button key={t.id} className={"bc-chip" + (t.id === tplId ? " active" : "")} onClick={() => { setPicked(true); setTplId(t.id); }} title={t.body_preview || ""} data-testid="pb-template">
              {pbTitle(t.name)}<span className="bc-chip-count">{pbIsStarter(t.name) ? "starter" : (t.category || "")}</span>
            </button>
          ))}
        </div>
      </div>
      {starter && (
        <div className="cl-prof-aut-hint" data-testid="pb-starter">
          {starterRow
            ? <>Written for this moment: <b>{starter.title}</b>{tplId === starterRow.id ? " — picked for you; change it above if you like" : " — it's above if you'd rather use it"}</>
            : starterAny
              ? <><b>{starter.title}</b> is {starterAny.meta_status === "pending" ? "in review at WhatsApp — it appears here once approved, usually within minutes" : `${starterAny.meta_status} at WhatsApp — see Campaigns › Messages`}</>
              : <>
                  The <b>{starter.title}</b> starter is written for this moment.{" "}
                  {canEdit && window.__templates && window.__templates.addStarters
                    ? <button className="cl-bucket-link" disabled={adding} onClick={addStarter} data-testid="pb-add-starter">{adding ? "Adding…" : "Add it — WhatsApp reviews it, usually within minutes"}</button>
                    : null}
                </>}
        </div>
      )}
      {tpl && vars.length > 0 && (
        <div className="bc-vars" data-testid="pb-vars">
          {vars.map((v, i) => (
            <label key={v.position || i} className="bc-var">
              <span className="bc-var-label">{labels[i]}</span>
              <span className="bc-var-row">
                <select
                  className="tpl-select"
                  value={srcOf(i)}
                  data-testid="pb-var-source"
                  onChange={(e) => setSources((s) => { const next = [...(s[tplId] || [])]; next[i] = e.target.value; return { ...s, [tplId]: next }; })}
                >
                  {Object.keys(SRC).filter((k) => (k !== "booking_link" || data.bookingLink) && (!k.startsWith("visit_") || (trig && trig.kind === "visit"))).map((k) => <option key={k} value={k}>{SRC[k]}</option>)}
                </select>
                <input
                  value={srcOf(i) === "text" ? textOf(i) : exampleOf(srcOf(i))}
                  disabled={srcOf(i) !== "text"}
                  placeholder={v.example || ""}
                  onChange={(e) => setTyped((p) => { const next = [...(p[tplId] || [])]; next[i] = e.target.value; return { ...p, [tplId]: next }; })}
                />
              </span>
            </label>
          ))}
        </div>
      )}
      {tpl && <div className="bc-preview-wrap" data-testid="pb-preview"><window.WaBubble from={data.businessName} body={preview} footer={pbFooter(tpl)} /></div>}
      <div className="bc-row">
        <span className="bc-row-label">Clock</span>
        <div className="bc-chips" style={{ flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <label className="bc-var-label">
            At <select className="tpl-select" value={hour} onChange={(e) => setHour(Number(e.target.value))} data-testid="pb-hour">
              {PB_HOURS.map((h) => <option key={h} value={h}>{pbHour(h)}</option>)}
            </select> {data.timezone}
          </label>
          <label className="bc-var-label">
            Up to <input className="bc-subject" type="number" min={1} max={500} value={cap} onChange={(e) => setCap(e.target.value)} style={{ width: 64 }} data-testid="pb-cap" /> a run
          </label>
          {monthly ? (
            <label className="bc-var-label">
              Every <input className="bc-subject" type="number" min={1} max={90} value={cadence} onChange={(e) => setCadence(e.target.value)} style={{ width: 64 }} /> days
            </label>
          ) : trig && trig.kind === "visit" ? null : (
            <label className="bc-var-label">
              Once per person, again after <input className="bc-subject" type="number" min={7} max={365} value={gap} onChange={(e) => setGap(e.target.value)} style={{ width: 64 }} /> days
            </label>
          )}
        </div>
      </div>
      <div className="bc-meta">
        <Icon name="shield" size={11} />
        <span>{trig && trig.kind === "visit"
          ? "Only people with a recorded yes and a number · one message per visit · people who asked to stop or are mid-thread with a person are held back at the wire"
          : "Only people with a recorded yes and a number · never twice within the gap · one playbook message per person per week, across playbooks · people who asked to stop or are mid-thread with a person are held back at the wire"}</span>
      </div>
      {data.number && data.number.present && !data.number.health.canSend && <div className="bc-excl-hint">{data.number.health.refusal}</div>}
      {data.number && !data.number.present && <div className="bc-excl-hint">No WhatsApp number connected — connect one in Settings › Connections before a run can send.</div>}
      {error && <div className="bc-excl-hint" data-testid="pb-error">{error}</div>}
      <div className="bc-actions">
        <input className="bc-subject" type="text" placeholder="Name it (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={{ flex: 1 }} data-testid="pb-name" />
        <button className="btn btn-sm" onClick={onCancel} data-testid="pb-cancel">Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!ready} onClick={save} data-testid="pb-save">{editing ? "Save changes" : "Start it"}</button>
      </div>
    </section>
  );
};

// One playbook: what starts it, what it sends, its clock, its mode, what its
// runs earned, and the verbs. A run that waits for a person is approved or
// skipped right here — the same doors as on Today and Broadcasts.
const PlaybookCard = ({ p, canAct, onEdit, flash }) => {
  const [busy, setBusy] = React.useState(false);
  const [sure, setSure] = React.useState(false);
  const V = window.__playbooks;
  const waiting = p.totals.waiting;
  const status = pbStatus(p);
  const trig = (window.__PLAYBOOKS && window.__PLAYBOOKS.triggers || PB_NONE).find((t) => t.id === p.trigger) || null;
  const listRoute = trig && trig.list ? `segments/${trig.list}` : "segments/opted_in";
  const act = async (fn, said) => {
    if (!V || busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? said(r.data) : <>{r.message}</> });
  };
  const toggle = () => act(
    () => (p.state === "paused" ? V.resume(p.id) : V.pause(p.id)),
    () => (p.state === "paused" ? <><b>{p.name}</b> resumed — next run {p.next === "paused" ? "at its hour" : p.next}</> : <><b>{p.name}</b> paused — nothing runs until you resume it</>),
  );
  const runNow = () => act(
    () => V.runNow(p.id),
    (d) => (d.outcome === "sent" ? <><b>{p.name}</b> — {pbPeople(d.eligible)}, sending now</>
      : d.outcome === "held" ? <><b>{p.name}</b> — {pbPeople(d.eligible)} waiting for your approval</>
      : <><b>{p.name}</b> — nobody new to send to right now</>),
  );
  const approve = () => act(() => V.approveRun(waiting.id), (d) => <><b>{p.name}</b> approved — {pbPeople(d.recipient_count || waiting.recipient_count)}, sending now</>);
  const skip = () => act(() => V.skipRun(waiting.id), () => <><b>{p.name}</b> — this run skipped, nothing sent</>);
  const remove = () => {
    if (!sure) { setSure(true); return; }
    act(() => V.remove(p.id), () => <><b>{p.name}</b> deleted — its runs stay in Broadcasts with their numbers</>);
  };

  return (
    <section className={`fl-card ob-card ${status === "approval" ? "is-approval" : ""}`} data-testid="pb-card" data-state={status}>
      <div className="ob-head">
        <div className="ob-titles">
          <span className="ob-name">{p.name}</span>
          <span className="ob-meta">
            <Icon name="bolt" size={11} /> {p.triggerLabel} — {p.triggerHint}
            <span className="fl-head-dot" />
            <span>{p.schedule}</span>
          </span>
        </div>
        <StatePill kind="playbook" value={status === "paused" ? "paused" : status === "approval" ? "approval" : "running"} />
      </div>

      <div className="ob-row">
        <button className="ob-audience" data-tip={trig && trig.kind === "visit" ? "Everyone with a recorded yes — the day's visits are picked from them · click to open them in People" : "The list this playbook watches — before the gap and the week's breath · click to open it in People"} onClick={() => window.CHANLY.nav(listRoute)}>
          <Icon name="sparkle" size={12} />
          {pbPeople(p.candidates)} on the list said yes
          <Icon name="arrow-right" size={10} />
        </button>
        <span className="ob-audience ob-audience-event" data-tip={`WhatsApp template · ${p.template_language}`}>
          <Icon name="chat" size={12} />
          {pbTitle(p.template_name)}
        </span>
        <PolicyChip cls={p.policy_class} />
        <span className="ob-note">next run {p.next}{p.last_run_for ? ` · last ran ${p.last_run_for}` : " · has not run yet"}</span>
      </div>

      {p.totals.runs > 0 && (
        <div className="ob-results" data-testid="pb-results">
          <span className="ob-stat"><strong className="tabular">{p.totals.runs}</strong> {p.totals.runs === 1 ? "run" : "runs"}</span>
          <span className="fl-head-dot" />
          <span className="ob-stat"><strong className="tabular">{p.totals.sent}</strong> sent</span>
          <span className="fl-head-dot" />
          <span className="ob-stat" data-tip="WhatsApp's own receipts"><strong className="tabular">{p.totals.delivered}</strong> delivered</span>
          <span className="fl-head-dot" />
          <span className="ob-stat" data-tip="Threads that heard from the customer after a run"><strong className="tabular">{p.totals.replied}</strong> replied</span>
          {p.totals.held > 0 && <><span className="fl-head-dot" /><span className="ob-stat"><strong className="tabular">{p.totals.held}</strong> held back</span></>}
        </div>
      )}
      {/* The runs themselves, newest first, from the same rows the totals are
          summed over -- every run, not the recent fifty broadcasts of any kind. */}
      {p.totals.history && p.totals.history.length > 0 && (
        <div className="ob-history" data-testid="pb-history">
          {p.totals.history.map((h) => (
            <div key={h.id} className="cl-prof-aut-hint ob-history-row">
              <span className="tabular">{h.run_for || (h.scheduled_for ? h.scheduled_for.slice(0, 10) : "")}</span>
              {" · "}{h.state === "sent" ? <>{h.sent} sent{h.held > 0 ? `, ${h.held} held` : ""}{h.replied > 0 ? `, ${h.replied} replied` : ""}</>
                : h.state === "pending_approval" ? `waiting for you · ${h.recipient_count} people`
                : h.state === "sending" ? `sending · ${h.sent} so far`
                : h.state === "scheduled" ? `scheduled · ${h.recipient_count} people`
                : h.state}
            </div>
          ))}
        </div>
      )}

      <div className="ob-actions">
        {waiting && canAct && (
          <>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={approve} data-testid="pb-approve">
              <Icon name="check" size={12} /> Approve · {pbPeople(waiting.recipient_count)}
            </button>
            <button className="btn btn-sm" disabled={busy} onClick={skip} data-testid="pb-skip">Skip this run</button>
          </>
        )}
        {waiting && !canAct && <span className="ob-note">{pbPeople(waiting.recipient_count)} waiting for an owner or operator</span>}
        {canAct && (
          <button className="btn btn-sm" disabled={busy} onClick={toggle} data-testid="pb-pause">
            <Icon name={p.state === "paused" ? "play" : "pause"} size={12} /> {p.state === "paused" ? "Resume" : "Pause"}
          </button>
        )}
        {canAct && p.state === "running" && !waiting && (
          <button className="btn btn-sm" disabled={busy} onClick={runNow} data-tip="Runs it now, at your request — sends unless its class is set to Never" data-testid="pb-run-now">
            <Icon name="bolt" size={12} /> Run now
          </button>
        )}
        {canAct && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onEdit(p)} data-testid="pb-edit">Edit</button>}
        {canAct && (
          <button className={"btn btn-ghost btn-sm" + (sure ? " danger" : "")} disabled={busy} onClick={remove} onBlur={() => setSure(false)} data-testid="pb-delete">
            {sure ? "Delete for good?" : "Delete"}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav("broadcasts")}>Its runs in Broadcasts <Icon name="arrow-right" size={10} /></button>
      </div>
    </section>
  );
};

const PlaybooksReal = () => {
  const data = usePlaybooks();
  const [toastNode, flash] = window.usePPToast();
  const canAct = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  const [filter, setFilter] = React.useState("all");
  const [composing, setComposing] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  React.useEffect(() => {
    const open = () => { setEditing(null); setComposing(true); };
    window.addEventListener("playbooks:new", open);
    return () => window.removeEventListener("playbooks:new", open);
  }, []);

  const rows = data.rows || PB_NONE;
  const visible = filter === "all" ? rows : rows.filter((p) => pbStatus(p) === filter);
  const running = rows.filter((p) => p.state === "running").length;
  const waiting = rows.filter((p) => p.totals.waiting).length;
  const sent = rows.reduce((a, p) => a + p.totals.sent, 0);
  const replied = rows.reduce((a, p) => a + p.totals.replied, 0);
  const closeComposer = () => { setComposing(false); setEditing(null); };

  return (
    <div className="reports" data-testid="playbooks-real">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Playbooks</div>
          <div className="cl-page-sub">
            Standing rules your receptionist runs — one approved template to newly eligible people who said yes, on your clock, under Settings › Autonomy. Replies land in the Inbox.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="Running" value={running} meta={waiting ? `${waiting} waiting on you` : "on your clock"} />
          <StatCell label="Sent" value={sent} meta="by every run so far" />
          <StatCell label="Replies" tip="Threads that heard from the customer after a run" value={replied} meta="answered in the Inbox" />
        </StatStrip>
      </div>

      <div className="cl-controls">
        <div className="cl-controls-right" style={{ marginLeft: 0 }}>
          <div className="fleet-filter">
            {PB_FILTERS.map((f) => (
              <button key={f.id} className={`fleet-filter-chip ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
                {f.label}
                <span className="fleet-filter-count tabular">{f.id === "all" ? rows.length : rows.filter((p) => pbStatus(p) === f.id).length}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rp-body">
        {(composing || editing) && (
          <PlaybookComposer
            key={editing ? editing.id : "new"}
            data={data}
            editing={editing}
            onCancel={closeComposer}
            onDone={(d, changed) => {
              closeComposer();
              flash({ msg: changed ? <><b>{d.name}</b> changed</> : <><b>{d.name}</b> is running — its next run is on the card, by your clock</> });
            }}
          />
        )}
        {visible.map((p) => (
          <PlaybookCard key={p.id} p={p} canAct={canAct} flash={flash} onEdit={(x) => { setComposing(false); setEditing(x); }} />
        ))}
        {rows.length === 0 && !composing && (
          <div className="cv-empty" data-testid="pb-empty">
            No playbook yet. {canAct ? "Start one from the button above: " : "An owner or operator can start one: "}
            win-back for anyone quiet 30 days, welcome for anyone new this week, save our number for anyone who only ever phoned, or the month's offer for everyone who said yes.
          </div>
        )}
        {rows.length > 0 && visible.length === 0 && (
          <div className="cv-empty">{filter === "approval" ? "No run is waiting on you." : `Nothing ${filter}.`}</div>
        )}
        {!canAct && rows.length > 0 && <div className="bc-excl-hint">Only an owner or operator can start, change or run a playbook.</div>}
      </div>

      {toastNode}
    </div>
  );
};

window.OutboundPage = (props) => {
  const Seed = window.OutboundSeed;
  if (window.__PLAYBOOKS) return <PlaybooksReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};
