/* global React, Icon, PolicyChip, Confirm, EmptyState, FailedRead */
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
// The hours a run may start at: the sending hours the clock publishes (contracts SENDING_HOURS_WORDS).
const pbHours = () => { const h = window.__clock && window.__clock.hours; return h ? Array.from({ length: h.max - h.min + 1 }, (_, i) => h.min + i) : []; };
// A number said as a word inside a sentence -- "the six moments", "two set up" -- the way a person says it.
const PB_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const pbSpell = (n, capital = false) => { const w = PB_WORDS[n] || String(n); return capital ? w[0].toUpperCase() + w.slice(1) : w; };
// The Autonomy row a class runs under, in the matrix's own words (the playbooks surface carries them).
const pbRowLabel = (cls) => ((window.__PLAYBOOKS && window.__PLAYBOOKS.classWords && window.__PLAYBOOKS.classWords[cls]) || {}).name || cls;
const pbHour = (h) => `${String(h).padStart(2, "0")}:00`;
const pbPeople = (n) => `${n} ${n === 1 ? "person" : "people"}`;
const pbStatus = (p) => (p.totals && p.totals.waiting ? "approval" : p.state);
// What the next run will actually do (contracts playbookReach): a running
// playbook whose list is empty is not "running" in any sense the owner means.
const pbReach = (p) => (window.__playbookReach ? window.__playbookReach(p) : "sends");
const pbReachWords = (r) => (window.__playbookReachWords ? window.__playbookReachWords[r] : null);
const pbReachDoor = (r) => (window.__playbookReachDoor ? window.__playbookReachDoor[r] || null : null);
// Words for people: a starter's title, or the name with its underscores made spaces.
const pbTitle = (name) => (window.__starters ? window.__starters.title(name) : String(name || "").replace(/_/g, " "));
const pbIsStarter = (name) => !!(window.__starters && window.__starters.byName(name));
// A language code as a person reads it; the code itself when the library is not read.
const pbLangWords = (code) => (window.__starters && window.__starters.langWords ? window.__starters.langWords(code) : String(code || ""));
// A run's day as words ("Aug 25"): a calendar day, not an instant, so no zone.
const pbDay = (day) => (day && window.__clock && window.__clock.dayWords ? window.__clock.dayWords(day) : String(day || ""));
const pbOrder = (a, b) => (window.__starters ? window.__starters.compare(a, b) : 0);
// The line under the words: the one Meta holds for this row, else the starter's
// own (contracts templateFooter). It resolved ONLY through the starter library
// before, so a template a workspace wrote here showed its footer while it was
// being drafted and never again -- on this page, on Playbooks, and on Messages.
const pbFooter = (t) => (t && window.__starters && window.__starters.footer ? window.__starters.footer(t) : null);
// What a slot shows in a preview: what a real person would see (contracts exampleParams), in the composer and on a card alike.
const PB_EXAMPLES = { visit_when: "tomorrow at 2:00 PM", visit_service: "a consultation" };
const pbExample = (kind, businessName) => (kind === "first_name" ? "Dani" : kind === "business_name" ? (businessName || "the business") : kind === "booking_link" ? "your booking link" : (PB_EXAMPLES[kind] || ""));
// A card's message: its template among the approved, with the playbook's own
// values in the slots; null when it is not among them. The body and the values
// stay apart -- the preview marks what fills per person, and `words` is the same
// thing joined up, for the one line a closed card shows.
const pbMessage = (p, templates, businessName) => {
  const t = templates.find((x) => x.id === p.template_id) || null;
  if (!t) return null;
  const values = (p.params || PB_NONE).map((s) => (s && s.kind === "text" ? s.value : s && s.kind ? pbExample(s.kind, businessName) : String(s ?? "")));
  // No fallback: message-preview.jsx is loaded before every page, in both lists,
  // and a quiet `String(body)` here would put raw {{1}} on a card rather than
  // the words -- which is what a test that had not loaded it drew.
  return { template: t, body: t.body_preview, values, words: window.mpFill(t.body_preview, values) };
};
// When a run a person asked for really goes (broadcasts-real.jsx bcWhenWords). An edge older than the dashboard gives no time back, and nothing claims one.
// What a reply is, in the one window's words (contracts REPLY_WINDOW_WORDS, on the surface).
const pbReplyTip = () => { const w = window.__PLAYBOOKS && window.__PLAYBOOKS.replyWindow; return w ? `Threads that heard from the customer ${w} of a run` : "Threads that heard from the customer after a run"; };
const pbSentWhen = (d) => (d && d.scheduled_for && window.bcWhenWords ? window.bcWhenWords(d) : window.__clock && window.__clock.hours ? `on its way — sends go out ${window.__clock.hours.between} by your clock` : "on its way");

// The composer: a new playbook, or one being changed. Checked here the way
// the route checks it — a template chosen, every slot filled — so an
// enabled Save is a Save that succeeds unless the server knows something
// newer (a template no longer approved, a booking link gone).
// Each of the six moments has its glyph: the arrow that comes back, a wave
// hello, the phone that only ever rang, the gift, the calendar, the clock of
// the day after. A playbook on a trigger this list does not know gets a bolt.
const PB_ICONS = { quiet_30: "undo", new_week: "wave", phoned_only: "phone", everyone_monthly: "gift", visit_tomorrow: "calendar", visited: "clock" };
const pbIcon = (trigger) => PB_ICONS[trigger] || "bolt";
// What a moment is for, said once on its empty card: who it reaches and why it
// is worth a message. The count of who it would reach today follows it.
const PB_BLURBS = {
  quiet_30: "Everyone you have not heard from in a month — the easiest customer to win back is one who already came.",
  new_week: "Everyone who wrote or phoned for the first time this week — the welcome that saves your number in their phone.",
  phoned_only: "Everyone who only ever phoned — one message, and they can text you instead of calling.",
  everyone_monthly: "Everyone who said yes to offers, once a month — this month's offer, on a clock.",
  visit_tomorrow: "Everyone with a visit tomorrow — the reminder that keeps the chair from sitting empty.",
  visited: "Everyone who came in yesterday and has nothing on the calendar — the shortest path from a visit to the next booking.",
};
// The languages a playbook's message exists in, each with its state at WhatsApp:
// a starter's are the starter set's, a message written elsewhere its own. Read off
// every template when Templates has been read, else the approved ones this page
// holds -- where a language that is not approved reads as not there, which for a
// run is true: an unapproved language sends nothing.
const pbLangs = (p) => {
  const S = window.__starters;
  const own = window.__PLAYBOOKS && Array.isArray(window.__PLAYBOOKS.templates) ? window.__PLAYBOOKS.templates : PB_NONE;
  const pool = Array.isArray(window.__TEMPLATES_ALL) ? window.__TEMPLATES_ALL : own;
  const mine = pool.filter((t) => t.name === p.template_name);
  const langs = S && S.byName && S.byName(p.template_name) ? S.languages : [...new Set(mine.map((t) => t.language))].map((id) => ({ id, label: id }));
  return langs.map((l) => {
    const r = mine.find((t) => t.language === l.id);
    return { id: l.id, label: l.label, status: r ? r.meta_status || "approved" : null };
  });
};
const pbShort = (id) => String(id || "").slice(0, 2).toUpperCase();

/**
 * A playbook, as the canvas draws it: what starts it and its state; the message
 * it sends and the languages it has; who it will actually reach, with the people
 * it holds back named; and when it runs next beside the shape of its last runs.
 * Pressed, it opens in place across the grid into its detail -- the message as a
 * customer sees it, its runs, and every verb (PlaybookCard, bare).
 */
const PlaybookTile = ({ p, canAct, onEdit, flash, open = false, onOpen, focus = false }) => {
  const status = pbStatus(p);
  const waiting = p.totals.waiting;
  const paused = p.state === "paused";
  const warn = status === "approval" || paused;
  const langs = pbLangs(p);
  // Who a run reaches: the people on the list who said yes and have not heard
  // from a playbook this week. Paused, nobody -- and the bar says so. Waiting on
  // the owner, the run it holds.
  const will = paused ? 0 : waiting ? (waiting.recipient_count ?? p.candidates) : p.candidates;
  // Out of everyone on the moment's list who said yes. A paused playbook counts
  // nobody of its own, so its moment's count says how many it is not reaching.
  const trig = (window.__PLAYBOOKS && window.__PLAYBOOKS.triggers || PB_NONE).find((t) => t.id === p.trigger) || null;
  // Out of everyone on the moment's list, when the surface says it: the grey is who never said yes (reachOfPlaybook).
  const never = p.never || 0;
  const pool = Math.max(will, p.candidates + p.held + never, p.pool || 0, trig ? (trig.candidates || 0) + (trig.held || 0) : 0);
  const reasons = [
    paused && { t: "paused — nothing goes out", tone: "warn" },
    ...(!paused && never > 0 ? (p.neverWhy || PB_NONE).map((t) => ({ t, tone: "plain" })) : PB_NONE),
    !paused && p.held > 0 && { t: `${p.held} heard from a playbook this week`, tone: "warn" },
    !paused && !waiting && p.candidates > p.cap_per_run && { t: `up to ${p.cap_per_run} a run — the rest go next time`, tone: "plain" },
    ...langs.filter((l) => !l.status).map((l) => ({ t: `${l.label} was never added`, tone: "plain" })),
  ].filter(Boolean);
  const hour = `${String(p.run_hour).padStart(2, "0")}:00`;
  const spark = (p.totals.history || PB_NONE).slice(0, 6).reverse().map((h) => h.sent || 0);
  return (
    <section id={`pb-${p.id}`} className={`pb-tile${warn ? " is-warn" : ""}${open ? " is-open" : ""}${focus ? " is-focus" : ""}`} data-testid="pb-card" data-state={status}>
      <button type="button" className="pb-tile-head" onClick={onOpen} aria-expanded={open} data-testid="pb-open">
        <span className="pb-tile-mark" data-tone={warn ? "warn" : "ok"} aria-hidden="true"><Icon name={pbIcon(p.trigger)} size={15} /></span>
        <span className="pb-tile-titles">
          <span className="pb-tile-name">{p.name}</span>
          <span className="pb-tile-hint">{p.triggerHint}</span>
        </span>
        <StatePill kind="playbook" value={status === "paused" ? "paused" : status === "approval" ? "approval" : "running"} />
      </button>
      {!open && (
        <>
          {/* The message it sends, by the name WhatsApp knows it by, and the
              languages it has -- what a customer in each language gets. */}
          <div className="pb-tile-tpl">
            <span className="pb-tile-tpl-name mono">{p.template_name}</span>
            {langs.map((l) => (
              <span key={l.id} className="pb-tile-lang" title={`${l.label}${l.status ? "" : " — not on WhatsApp"}`}>
                <window.CmLangGlyph status={l.status} size={11} />
                <span>{pbShort(l.id)}</span>
              </span>
            ))}
          </div>
          <window.CmReach will={will} pool={pool} of={p.pool ? null : "who said yes"} held={paused ? pool : p.held} reasons={reasons.length ? reasons : [{ t: "nobody held back", tone: "plain" }]} testid="pb-tile-reach" />
          <div className="pb-tile-foot">
            {/* A run waiting on the owner: the line says what the press does, and
                the press opens the card where Approve and Skip are. */}
            {waiting
              ? <button type="button" className="pb-tile-next is-warn" onClick={onOpen} data-testid="pb-tile-approve">Approve it and it goes at {hour}</button>
              : <span className={`pb-tile-next${paused ? " is-warn" : ""}`}>{paused ? "Paused" : `Next run ${p.next}`}</span>}
            <span className="pb-tile-spacer" />
            <window.CmSpark values={spark} label={spark.length ? `The last ${spark.length} runs sent ${spark.join(", ")}` : null} />
            {/* What its runs earned, behind the count: the card keeps to the
                board's one line, and the numbers are a hover, a focus or a tap
                away -- with what "wrote back" counts (the reply window). */}
            <span className="pb-tile-runs" tabIndex={0} data-tip={`${p.totals.sent} sent, ${p.totals.delivered} delivered, ${p.totals.replied} wrote back. ${pbReplyTip()}.`} data-testid="pb-tile-runs"><span className="tabular">{p.totals.runs}</span> {p.totals.runs === 1 ? "run" : "runs"}</span>
          </div>
        </>
      )}
      {open && <PlaybookCard p={p} canAct={canAct} onEdit={onEdit} flash={flash} bare />}
    </section>
  );
};

/**
 * A moment nobody is using, as the canvas draws it: dashed and sunken, what it
 * is for, who it would reach today, and one press to set it up.
 *
 * PLAYBOOK_TRIGGERS is a CLOSED set of six, and the page drew only the ones
 * somebody had made, so the two nobody had set up were simply absent -- the
 * surest way to get more out of Campaigns was the one thing it never mentioned.
 * The count is the surface's own for that trigger: who it would reach TODAY.
 */
const PlaybookSlot = ({ t, onStart }) => (
  <section className="pb-tile is-empty" data-testid="pb-slot" data-trigger={t.id}>
    <div className="pb-tile-head">
      <span className="pb-tile-mark" data-tone="plain" aria-hidden="true"><Icon name={pbIcon(t.id)} size={15} /></span>
      <span className="pb-tile-titles">
        <span className="pb-tile-name">{t.label}</span>
        <span className="pb-tile-hint">{t.hint}</span>
      </span>
      <span className="pill">Not set up</span>
    </div>
    <div className="pb-tile-empty">
      <p className="pb-tile-blurb" data-testid="pb-slot-who">
        {PB_BLURBS[t.id] || t.hint}
        {t.candidates > 0 ? ` ${pbPeople(t.candidates)} today.` : " Nobody today."}
      </p>
      <button
        className="btn pb-tile-setup"
        onClick={() => onStart(t.id)}
        data-testid="pb-slot-start"
        {...window.gate("approve", "start a playbook")}
      >
        <Icon name="plus" size={12} /> Set it up
      </button>
    </div>
  </section>
);

const PlaybookComposer = ({ data, editing, initialTrigger = null, onDone, onCancel }) => {
  // Null: the templates read failed -- its own state, never "no template yet".
  const templatesRead = data.templates !== null;
  // As on Broadcasts: a template this product cannot put on the wire is not
  // offered, rather than offered and refused by Meta for every recipient.
  const offered = React.useMemo(() => (window.__starters && window.__starters.sendable
    ? window.__starters.sendable((data.templates || PB_NONE).slice().sort(pbOrder))
    : { sendable: (data.templates || PB_NONE).slice().sort(pbOrder), blocked: PB_NONE, why: null }), [data.templates]);
  const templates = offered.sendable;
  const triggers = data.triggers || PB_NONE;
  // What fills a slot, in the composers' words (contracts PARAM_SOURCE_LABELS); a visit's are offered for a visit trigger only (below).
  const SRC = (window.__starters && window.__starters.sources) || { text: "Type it" };
  const [trigger, setTrigger] = React.useState(editing ? editing.trigger : initialTrigger || (triggers[0] ? triggers[0].id : "quiet_30"));
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
  const canEdit = !!(window.canDo && window.canDo("approve"));
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
  const exampleOf = (kind) => pbExample(kind, data.businessName);
  const labels = tpl && window.__starters ? window.__starters.slotLabels(tpl) : vars.map((v, i) => v.label || `Value ${v.position || i + 1}`);
  const filled = vars.map((v, i) => (srcOf(i) === "text" ? textOf(i) : exampleOf(srcOf(i))));
  const previewValues = vars.map((v, i) => (srcOf(i) === "text" ? (textOf(i).trim() || `[${labels[i]}]`) : exampleOf(srcOf(i))));
  const specs = vars.map((v, i) => (srcOf(i) === "text" ? textOf(i).trim() : { kind: srcOf(i) }));
  const monthly = trigger === "everyone_monthly";
  const ready = !!trig && !!tpl && filled.every((v) => String(v).trim()) && !busy;
  const shown = previewValues.map((v) => String(v).trim());

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
          {trig.hint} · {pbPeople(trig.candidates)} {trig.kind === "visit" ? "with a recorded yes on that day right now" : "on that list said yes right now"}{trig.kind !== "visit" && trig.held > 0 ? ` · ${trig.held} more heard from you this week and wait` : ""} · runs under “{pbRowLabel(trig.cls)}” in Settings › Autonomy{trig.kind === "visit" ? " · one message per visit" : ""}{trig.kind === "visit" && data.calendar !== "ok" ? " · needs the calendar connected in Settings › Business" : ""}
        </div>
      )}
      <div className="bc-row">
        <span className="bc-row-label">Send</span>
        <div className="bc-chips" style={{ flexWrap: "wrap" }}>
          {!templatesRead && <FailedRead kind="line" what="your templates" surface="playbooks" testid="pb-templates-failed" />}
          {templatesRead && templates.length === 0 && (
            <span className="bc-excl-hint" data-testid="pb-no-template">No approved template yet — write one, or sync yours from WhatsApp Manager, in <button className="cl-bucket-link" onClick={() => window.CHANLY.nav("messages")} data-testid="pb-no-template-open">Templates</button>.</span>
          )}
          <window.TemplateChips templates={templates} value={tplId} onPick={(id) => { setPicked(true); setTplId(id); }} testid="pb-template" />
        </div>
      </div>
      {offered.why && <div className="bc-excl-hint warn" data-testid="pb-blocked">{offered.why}</div>}
      {starter && (
        <div className="cl-prof-aut-hint" data-testid="pb-starter">
          {starterRow
            ? <>Written for this moment: <b>{starter.title}</b>{tplId === starterRow.id ? " — picked for you; change it above if you like" : " — it's above if you'd rather use it"}</>
            : starterAny
              ? <><b>{starter.title}</b> is {starterAny.meta_status === "pending" ? "in review at WhatsApp — it appears here once approved, usually within minutes" : `${starterAny.meta_status} at WhatsApp — see Campaigns › Templates`}</>
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
      {/* No stamp: a playbook knows the hour it runs at, not the instant its
          next run lands, and the Clock row below says the hour in words. */}
      {tpl && <div className="bc-preview-wrap" data-testid="pb-preview"><window.MessagePreview from={data.businessName} body={tpl.body_preview} values={shown} header={tpl.header} footer={pbFooter(tpl)} buttons={tpl.buttons} /></div>}
      <div className="bc-row">
        <span className="bc-row-label">Clock</span>
        <div className="bc-chips" style={{ flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <label className="bc-var-label">
            At <select className="tpl-select" value={hour} onChange={(e) => setHour(Number(e.target.value))} data-testid="pb-hour">
              {pbHours().map((h) => <option key={h} value={h}>{pbHour(h)}</option>)}
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
const PlaybookCard = ({ p, canAct, onEdit, flash, focus = false, bare = false }) => {
  const [busy, setBusy] = React.useState(false);
  const [sure, setSure] = React.useState(false);
  // Skip asks first, as it does on Broadcasts, with a question of its own apart from the delete's.
  const [skipSure, setSkipSure] = React.useState(false);
  const V = window.__playbooks;
  const waiting = p.totals.waiting;
  const status = pbStatus(p);
  const trig = (window.__PLAYBOOKS && window.__PLAYBOOKS.triggers || PB_NONE).find((t) => t.id === p.trigger) || null;
  // The trigger's list, on People (a smart list's own view); `segments/<id>` would land there too, one hop later.
  const listRoute = trig && trig.list ? `clients/seg:${trig.list}` : "clients/seg:opted_in";
  // What its runs send. Templates that could not be read are said once, over the cards; one not among the approved, here.
  const surface = window.__PLAYBOOKS || {};
  const message = Array.isArray(surface.templates) ? pbMessage(p, surface.templates, surface.businessName) : null;
  const templateGone = Array.isArray(surface.templates) && !message;
  const reach = pbReach({ state: p.state, candidates: p.candidates, held: p.held, waiting });
  const reachWords = pbReachWords(reach);
  const reachDoor = pbReachDoor(reach);
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
    (d) => (d.outcome === "sent" ? <><b>{p.name}</b> — {pbPeople(d.eligible)}, {pbSentWhen(d)}</>
      : d.outcome === "held" ? <><b>{p.name}</b> — {pbPeople(d.eligible)} waiting for your approval</>
      : <><b>{p.name}</b> — nobody new to send to right now</>),
  );
  // The server may move the run to nine o'clock: the receipt says when it really goes (broadcasts-real.jsx bcWhenWords).
  const approve = () => act(() => V.approveRun(waiting.id), (d) => <><b>{p.name}</b> approved — {pbPeople(d.recipient_count || waiting.recipient_count)}, {window.bcWhenWords ? window.bcWhenWords(d) : "sending now"}</>);
  const skip = () => {
    setSkipSure(false);
    return act(() => V.skipRun(waiting.id), () => <><b>{p.name}</b> — this run skipped, nothing sent</>);
  };
  const remove = () => {
    setSure(false);
    act(() => V.remove(p.id), () => <><b>{p.name}</b> deleted — its runs stay in Broadcasts with their numbers</>);
  };

  // Inside a tile (PlaybookTile), the tile draws the name and the state; the
  // card is its detail -- what it sends, its runs and its verbs -- under them.
  const inner = (
    <>

      {/* The message first, beside what the rule does with it.
          The card led with the trigger, the schedule, the audience, the template's
          NAME and the next run -- five chips and a meta line -- and the thing that
          actually reaches a customer was two clamped lines at 12px in --ink-muted,
          under a "Show the whole message" toggle. A playbook IS a message, a list
          and a clock; the message goes first and the rest is one sentence. */}
      <div className="ob-body">
        {message && (
          <div className="ob-words" data-testid="pb-words">
            <window.MessagePreview from={surface.businessName} body={message.body} values={message.values} header={message.template.header} footer={pbFooter(message.template)} buttons={message.template.buttons} compact />
            {/* Which message this is, captioning the message itself, and in which
                language -- that was a data-tip on a chip, and no finger reaches one.
                It opens Templates, where the same one is renamed or replaced. */}
            <button type="button" className="ob-words-name" onClick={() => window.CHANLY.nav("messages")} data-testid="pb-template-name">
              {pbTitle(p.template_name)} <span className="dim">&middot; {pbLangWords(p.template_language)}</span>
            </button>
          </div>
        )}
        <div className="ob-facts">
          <p className="ob-sentence">
            {/* The trigger's hint is a CONDITION, not an audience -- "Nothing heard
                in 30 days", "Only ever phoned, never texted" -- so "Goes to" in
                front of it was broken English on five of the six triggers. It
                leads, and the count follows it. */}
            {p.triggerHint} &mdash;{" "}
            <button className="ob-link" data-tip={trig && trig.kind === "visit" ? "Everyone with a recorded yes — the day's visits are picked from them · click to open them in People" : "The list this playbook watches — before the gap and the week's breath · click to open it in People"} onClick={() => window.CHANLY.nav(listRoute)} data-testid="pb-audience">
              {pbPeople(p.candidates)} on the list said yes
            </button>
            {/* Why a list with people on it can still offer nobody: one message per
                person per week, across playbooks. A bare "0 people" read as broken. */}
            {p.held > 0 ? <>, and {pbPeople(p.held)} more heard from you this week and wait</> : null}. {p.schedule}.{" "}
            {/* "Next run paused" was the words when it is. */}
            {p.state === "paused"
              ? <>Paused &mdash; nothing runs until you resume it.</>
              // The hour was in bold on its own, which promised a send. It keeps
              // the hour and says what the hour will do.
              : reachWords
                ? <>Next run {p.next} &mdash; <b>{reachWords}</b>.{reachDoor && <>{" "}<button type="button" className="ob-link" onClick={() => window.CHANLY.nav(reachDoor.to)} data-testid="pb-reach-door">{reachDoor.label}</button>.</>}</>
                : <>Next run <b>{p.next}</b>.</>}
            {p.last_run_for ? <> Last ran {pbDay(p.last_run_for)}.</> : <> It has not run yet.</>}
          </p>
          {templateGone && (
            <p className="bc-excl-hint warn" data-testid="pb-template-gone">Its message is no longer approved by WhatsApp, so its runs are skipped until it is approved again or the playbook sends another.</p>
          )}
          {/* What its runs earned, as ONE sentence rather than five numbers with
              dots between them. Numbers read as a sentence here the way they do on
              Today, Reports and People; each run below still says its own. */}
          {/* One run says itself once: the row below carries the same numbers
              with its date and its door, and the two disagreed about which
              numbers to show. The sum is worth a sentence once there is a sum. */}
          {p.totals.runs > 1 && (
            <p className="ob-sentence ob-sentence-dim" data-testid="pb-results">
              <span className="tabular">{p.totals.runs}</span> {p.totals.runs === 1 ? "run" : "runs"} so far:{" "}
              <span className="tabular">{p.totals.sent}</span> sent,{" "}
              <span className="tabular" data-tip="WhatsApp's own receipts">{p.totals.delivered}</span> delivered,{" "}
              <span className="tabular" data-tip={pbReplyTip()}>{p.totals.replied}</span> wrote back{p.totals.held > 0 ? <>, <span className="tabular">{p.totals.held}</span> held back</> : null}.
            </p>
          )}
        </div>
      </div>

      {/* The runs themselves, newest first, from the same rows the totals are
          summed over -- every run, not the recent fifty broadcasts of any kind. */}
      {p.totals.history && p.totals.history.length > 0 && (
        <div className="ob-history" data-testid="pb-history">
          {/* Each run opens as itself on Broadcasts (broadcasts/run:<id>), read by its id however old it is. */}
          {p.totals.history.map((h) => (
            <button key={h.id} type="button" className="cl-prof-aut-hint ob-history-row" onClick={() => window.CHANLY.nav(`broadcasts/run:${h.id}`)} data-testid="pb-run-open">
              <span className="tabular">{pbDay(h.run_for || (h.scheduled_for ? h.scheduled_for.slice(0, 10) : ""))}</span>
              {" · "}{h.state === "sent" ? <>{h.sent} sent{h.delivered > 0 ? `, ${h.delivered} delivered` : ""}{h.held > 0 ? `, ${h.held} held` : ""}{h.replied > 0 ? `, ${h.replied} replied` : ""}</>
                : h.state === "pending_approval" ? `waiting for you · ${h.recipient_count} people`
                : h.state === "sending" ? `sending · ${h.sent} so far`
                : h.state === "scheduled" ? `scheduled · ${h.recipient_count} people`
                : h.state}
              <Icon name="arrow-right" size={10} />
            </button>
          ))}
          {p.totals.runs > p.totals.history.length && <span className="ob-history-more" data-testid="pb-history-more">The newest {p.totals.history.length} of {p.totals.runs} runs</span>}
        </div>
      )}

      <div className="ob-actions">
        {/* The run's Approve is where it always is for every role, and says who may; Skip stays with those who may. */}
        {waiting && !skipSure && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={approve} data-testid="pb-approve" {...(canAct || !window.gate ? {} : window.gate("approve", "approve a run"))}>
            <Icon name="check" size={12} /> Approve · {pbPeople(waiting.recipient_count)}
          </button>
        )}
        {waiting && canAct && !skipSure && <button className="btn btn-sm" disabled={busy} onClick={() => setSkipSure(true)} data-testid="pb-skip">Skip this run</button>}
        {waiting && canAct && skipSure && (
          <Confirm question={`Skip this run of ${p.name}?`} detail="Nothing sends, and the run closes." yes="Yes, skip it" danger busy={busy} onYes={skip} onNo={() => setSkipSure(false)} testid="pb-skip" />
        )}
        {canAct && (
          <button className="btn btn-sm" disabled={busy} onClick={toggle} data-testid="pb-pause">
            <Icon name={p.state === "paused" ? "play" : "pause"} size={12} /> {p.state === "paused" ? "Resume" : "Pause"}
          </button>
        )}
        {canAct && p.state === "running" && !waiting && (
          <button className="btn btn-sm" disabled={busy} onClick={runNow} data-tip={window.__clock && window.__clock.hours ? `Runs it now, at your request — sends unless its class is set to Never; outside ${window.__clock.hours.range} it goes at ${window.__clock.hours.first}` : "Runs it now, at your request — sends unless its class is set to Never"} data-testid="pb-run-now">
            <Icon name="bolt" size={12} /> Run now
          </button>
        )}
        {canAct && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onEdit(p)} data-testid="pb-edit">Edit</button>}
        {canAct && !sure && (
          <button className="btn btn-ghost btn-sm danger" disabled={busy} onClick={() => setSure(true)} data-testid="pb-delete">Delete</button>
        )}
        {canAct && sure && (
          <Confirm question={`Delete ${p.name}?`} detail="Its runs stay in Broadcasts with their numbers." yes="Yes, delete" danger busy={busy} onYes={remove} onNo={() => setSure(false)} testid="pb-delete" />
        )}
      </div>
    </>
  );
  if (bare) {
    return (
      <div className="ob-card-detail">
        <div className="ob-head ob-head-bare">
          {reachWords && <span className="ob-reach" data-testid="pb-reach">{reachWords}</span>}
          <PolicyChip cls={p.policy_class} />
        </div>
        {inner}
      </div>
    );
  }
  return (
    <section id={`pb-${p.id}`} className={`fl-card ob-card ${status === "approval" ? "is-approval" : ""}${focus ? " is-focus" : ""}`} data-testid="pb-card" data-state={status}>
      <div className="ob-head">
        <div className="ob-titles">
          <span className="ob-name">{p.name}</span>
        </div>
        <StatePill kind="playbook" value={status === "paused" ? "paused" : status === "approval" ? "approval" : "running"} />
        {/* Beside the state, because it IS part of the state: three cards of
            "Running" that reach nobody scan as three working playbooks. */}
        {reachWords && <span className="ob-reach" data-testid="pb-reach">{reachWords}</span>}
        <PolicyChip cls={p.policy_class} />
      </div>
      {inner}
    </section>
  );
};

const PlaybooksReal = ({ initialPlaybook = null }) => {
  const data = usePlaybooks();
  const [toastNode, flash] = window.usePPToast();
  // Who may start, change or run a playbook: the role store's answer, View-as included.
  const canAct = !!(window.canDo && window.canDo("approve"));
  const [composing, setComposing] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  // The moment an empty slot was pressed for, so the composer opens on it rather
  // than on whichever trigger happens to be first.
  const [slot, setSlot] = React.useState(null);
  // The one playbook open in place across the grid: the link's, when a link named
  // one (Templates' "Win-back playbook", Today's run), else none.
  const [openId, setOpenId] = React.useState(initialPlaybook);
  const followed = React.useRef(initialPlaybook);
  React.useEffect(() => {
    if (followed.current === initialPlaybook) return;
    followed.current = initialPlaybook;
    setOpenId(initialPlaybook);
  }, [initialPlaybook]);
  React.useEffect(() => {
    const open = () => { setEditing(null); setSlot(null); setComposing(true); };
    window.addEventListener("playbooks:new", open);
    return () => window.removeEventListener("playbooks:new", open);
  }, []);
  // A link to one playbook lands on its card: marked, and brought into view when it is out of it.
  React.useEffect(() => {
    const el = initialPlaybook && typeof document !== "undefined" && document.getElementById ? document.getElementById(`pb-${initialPlaybook}`) : null;
    if (!el || !el.getBoundingClientRect || !el.scrollIntoView) return;
    const at = el.getBoundingClientRect();
    if (at.top < 0 || at.top > window.innerHeight - 80) el.scrollIntoView({ block: "start" });
  }, [initialPlaybook]);

  const rows = data.rows || PB_NONE;
  // The six moments, in their own order, each with the playbook doing it or the
  // empty card that says nothing is -- so a first day is six cards that each name
  // what they would do, and a busy one still shows which moment is idle.
  const triggers = data.triggers || PB_NONE;
  const known = new Set(triggers.map((t) => t.id));
  const usedTriggers = new Set(rows.map((p) => p.trigger));
  const unused = triggers.filter((t) => !usedTriggers.has(t.id));
  const tiles = [];
  for (const t of triggers) {
    const on = rows.filter((p) => p.trigger === t.id);
    if (on.length) on.forEach((p) => tiles.push({ key: p.id, p }));
    else tiles.push({ key: `slot:${t.id}`, t });
  }
  rows.filter((p) => !known.has(p.trigger)).forEach((p) => tiles.push({ key: p.id, p }));
  const runningN = rows.filter((p) => p.state === "running" && !p.totals.waiting).length;
  const waitingN = rows.filter((p) => p.totals.waiting).length;
  const pausedN = rows.filter((p) => p.state === "paused").length;
  const reachesNobody = rows.filter((p) => pbReach({ state: p.state, candidates: p.candidates, held: p.held, waiting: p.totals.waiting }) === "nobody").length;
  const closeComposer = () => { setComposing(false); setEditing(null); setSlot(null); };
  const startAt = (id) => { setEditing(null); setSlot(id); setComposing(true); };
  // What the three rules that shape every run are, said once under the cards: the
  // sending hours, the weekly breath across playbooks, and the gap before the same
  // playbook reaches the same person again -- the one number a playbook sets itself.
  const hours = window.__clock && window.__clock.hours;
  const gaps = [...new Set(rows.map((p) => p.gap_days))];

  return (
    <div className="reports pb-page" data-testid="playbooks-real">
      <div className="rp-body cm-page pb-body">
        {/* A headline and one line under it, and at the right how the moments
            stand -- running, waiting on you, paused, not set up -- in the numbers
            the cards below add up to. A running playbook with nobody to send to
            is the one thing the cards alone would not say at a glance, and on a
            workspace whose list has emptied it is true of every one of them: it
            rides the line, in the tone of something to look at. */}
        <window.CmHead
          title="Playbooks"
          testid="pb-standing"
          sub={(
            <span data-tip="Standing rules your receptionist runs — one approved template to newly eligible people who said yes, on your clock, under Settings › Autonomy. Replies land in the Inbox.">
              {triggers.length > 0
                ? <>The {pbSpell(triggers.length)} moments Chanlytics acts on for you, each on its own clock — {rows.length === 0 ? "none set up yet" : <>{pbSpell(Math.min(rows.length, triggers.length))} set up{unused.length ? <>, {pbSpell(unused.length)} not yet</> : null}</>}.</>
                : rows.length === 0 ? "No playbook yet." : `${rows.length} ${rows.length === 1 ? "playbook" : "playbooks"}.`}
              {reachesNobody > 0 && <> <span className="pb-standing-warn" data-testid="pb-reaches-nobody">{reachesNobody === runningN + waitingN ? "None of them has anyone to send to." : `${pbSpell(reachesNobody, true)} running with nobody to send to.`}</span></>}
            </span>
          )}
          right={(
            <div className="pb-tally">
              {[
                { n: runningN, k: "running", tone: "ok" },
                waitingN > 0 && { n: waitingN, k: "waiting on you", tone: "warn" },
                pausedN > 0 && { n: pausedN, k: "paused", tone: "warn" },
                unused.length > 0 && { n: unused.length, k: "not set up", tone: "plain" },
              ].filter(Boolean).map((t) => (
                <div className="pb-tally-cell" key={t.k}>
                  <span className="pb-tally-n tabular" data-tone={t.tone}>{t.n}</span>
                  <span className="pb-tally-k">{t.k}</span>
                </div>
              ))}
            </div>
          )}
        />
        {initialPlaybook && !rows.some((p) => p.id === initialPlaybook) && (
          <EmptyState kind="line" title="That playbook isn't here any more." body="Its runs stay in Broadcasts, with their numbers." testid="pb-gone" />
        )}
        {rows.length > 0 && data.templates === null && !(composing || editing) && (
          <FailedRead kind="line" what="your templates" body="The cards show what they send once they read. Everything else here is current." surface="playbooks" testid="pb-cards-templates-failed" />
        )}
        {(composing || editing) && (
          <PlaybookComposer
            key={editing ? editing.id : slot || "new"}
            data={data}
            editing={editing}
            initialTrigger={slot}
            onCancel={closeComposer}
            onDone={(d, changed) => {
              closeComposer();
              flash({ msg: changed ? <><b>{d.name}</b> changed</> : <><b>{d.name}</b> is running — its next run is on the card, by your clock</> });
            }}
          />
        )}
        {tiles.length > 0 && (
          <div className="pb-grid">
            {tiles.map((x) => (x.p
              ? <PlaybookTile key={x.key} p={x.p} canAct={canAct} flash={flash} open={openId === x.p.id} onOpen={() => setOpenId((o) => (o === x.p.id ? null : x.p.id))} focus={x.p.id === initialPlaybook} onEdit={(e) => { setComposing(false); setEditing(e); }} />
              // The slots stand down while the composer is open: it is already
              // setting one of them up.
              : !composing && !editing && <PlaybookSlot key={x.key} t={x.t} onStart={startAt} />))}
          </div>
        )}
        {rows.length === 0 && unused.length === 0 && !composing && (
          <EmptyState
            kind="card"
            glyph="bolt"
            title="No playbook yet"
            body="Win-back for anyone quiet 30 days, welcome for anyone new this week, save our number for anyone who only ever phoned, or the month's offer for everyone who said yes."
            action={{ label: "New playbook", onClick: () => window.dispatchEvent(new CustomEvent("playbooks:new")), gate: window.gate ? window.gate("approve", "start a playbook") : null }}
            testid="pb-empty"
          />
        )}
        {/* The three rules that quietly shape every run, under the cards they shape. */}
        {tiles.length > 0 && (
          <div className="pb-rules" data-testid="pb-always">
            <span className="pb-rules-k">Always on</span>
            <div className="pb-rule">
              <Icon name="clock" size={14} />
              <div><b>Sending hours</b><span>{hours ? hours.range : "9:00–20:59"} · a run that would land outside waits for the morning</span></div>
            </div>
            <div className="pb-rule">
              <Icon name="wave" size={14} />
              <div><b>One a week, per person</b><span>across every playbook, not per playbook</span></div>
            </div>
            <div className="pb-rule">
              <Icon name="refresh" size={14} />
              <div><b>{gaps.length === 1 ? `${gaps[0]} days between repeats` : "Days between repeats"}</b><span>{gaps.length === 1 ? "the same playbook will not reach the same person sooner" : "each playbook keeps its own gap before reaching the same person again"}</span></div>
            </div>
          </div>
        )}
        {!canAct && rows.length > 0 && <div className="bc-excl-hint" data-testid="pb-role">{window.gateTitle("approve", "pause, run, change or delete a playbook")}</div>}
      </div>

      {toastNode}
    </div>
  );
};

window.PlaybookCard = PlaybookCard; // drawn on its own by confirm.test.mjs (the delete that was two clicks on one button)
window.OutboundPage = (props) => {
  const Seed = window.OutboundSeed;
  if (window.__PLAYBOOKS) return <PlaybooksReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};
