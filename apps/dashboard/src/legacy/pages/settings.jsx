/* global React, Icon, StatStrip, StatCell, Confirm, EmptyState, FailedRead */
// Chanlytics — Settings
// Six panes: Workspace · Autonomy · Integrations · AI memory · Notifications · Billing.
// Controls are wired, not painted: guardrails write back to SEG_GUARDRAILS
// (Fleet chips update via guardrails:changed), defaults persist in ST_STORE,
// Gmail reauth flips the failed nurture in Tasks via INT_STORE, memory Forget
// is undoable, notification prefs persist in localStorage.

const { useState: useSetState, useEffect: useSetEffect } = React;

// Roles: what each can do (audit U3). owner ⊃ operator ⊃ viewer.
// The bridge publishes the table the SERVER enforces (contracts ROLE_PERMS);
// this literal is the standalone-mockup fallback only. Two hand-kept copies is
// one edit away from the client offering a control the server refuses.
const ST_PERMS = window.ROLE_PERMS || {
  owner:    { approve: true,  autonomy: true,  disconnect: true,  billing: true,  team: true,  settings: true,  export: true },
  operator: { approve: true,  autonomy: true,  disconnect: false, billing: false, team: false, settings: false, export: false },
  viewer:   { approve: false, autonomy: false, disconnect: false, billing: false, team: false, settings: false, export: false },
};
const ST_ROLE_META = {
  owner:    { label: "Owner",    can: "Everything — billing, team, and disconnecting channels" },
  operator: { label: "Operator", can: "Approves decisions and tunes autonomy — not billing or team" },
  viewer:   { label: "Viewer",   can: "Sees everything, changes nothing — approvals are read-only" },
};

// Session stores (FL_STORE pattern — survive nav, reset on reload)
window.ST_STORE = window.ST_STORE || {
  defaults: {},   // key -> chosen option
  set(k, v) { this.defaults[k] = v; },
  get(k, fallback) { return this.defaults[k] !== undefined ? this.defaults[k] : fallback; },

  // ---- Team & roles (audit U3) ----
  seatsIncluded: 5,
  meId: "u-sarah",
  viewAsRole: null,   // owner-only preview; null = act as real role
  team: [
    { id: "u-sarah",  name: "Sarah Chen",  email: "sales@chanlytics.com", role: "owner",    status: "active" },
    { id: "u-marcus", name: "Marcus Webb", email: "ops@serenityspa.co",   role: "operator", status: "active" },
    { id: "u-lena",   name: "Lena Park",   email: "lena@serenityspa.co",  role: "viewer",   status: "active" },
    { id: "u-jay",    name: "Jay Rivera",  email: "jay@serenityspa.co",   role: "viewer",   status: "active" },
  ],
  getTeam() { return this.team; },
  me() { return this.team.find(m => m.id === this.meId); },
  myRole() {
    // Real membership role when the bridge has it (E1) — every gate() chip in
    // the app starts telling the truth through this one line. View-as still
    // previews a LOWER role on top of the real one (owner-only, client-side,
    // harmless: the server re-checks with requireRole anyway).
    // Fail CLOSED. __ME is absent during boot and whenever the workspace
    // fetch fails (the seam swallows that), and defaulting to owner rendered
    // every gated control as available to a viewer.
    if (window.__ME) return this.viewAsRole || window.__ME.role || "viewer";
    return this.viewAsRole || (window.__DEMO_MODE && this.me() ? this.me().role : "viewer");
  },
  seatsUsed() { return this.team.filter(m => m.status !== "revoked").length; },
  ownerCount() { return this.team.filter(m => m.role === "owner" && m.status === "active").length; },
  can(action) { return !!(ST_PERMS[this.myRole()] || {})[action]; },
  _emit() { window.dispatchEvent(new CustomEvent("team:changed")); },
  addMember(m) { this.team.push(m); this._emit(); },
  setRole(id, role) { const m = this.team.find(x => x.id === id); if (m) { m.role = role; this._emit(); } },
  removeMember(id) { this.team = this.team.filter(x => x.id !== id); this._emit(); },
  setViewAs(role) { this.viewAsRole = role; this._emit(); },
};
window.INT_STORE = window.INT_STORE || {
  fixed: {},      // serviceId -> true
  fix(id) { this.fixed[id] = true; window.dispatchEvent(new CustomEvent("integrations:changed", { detail: { id } })); },
  unfix(id) { delete this.fixed[id]; window.dispatchEvent(new CustomEvent("integrations:changed", { detail: { id } })); },
  isFixed(id) { return !!this.fixed[id]; },
};

/**
 * Settings, in the order a person needs them: yourself, then the business, then
 * the people, then what the receptionist is allowed to do, then the account.
 *
 * It used to be one "Workspace" tab holding three unrelated audiences -- the
 * business your CUSTOMERS hear about, the workspace record, and YOU -- with
 * your own name buried in the Team card underneath a roster of other people.
 * The sidebar's own menu said "Your name" and navigated there, so the one link
 * that promised you delivered the business instead.
 *
 * `workspace` keeps its route id: the label is what a person reads, and
 * renaming the id would break every bookmark, the Ask answer that links to it
 * and four e2e specs for a word.
 *
 * AI memory is not here on purpose. It renders the "not built" pane for every
 * real workspace, so as a rail item it was a permanent promise of nothing --
 * the route still answers, because an old link should land somewhere honest.
 */
const SET_TABS = [
  { id: "profile",       label: "Profile",       icon: "user",     group: "You" },
  { id: "setup",         label: "Setup",         icon: "flag",     group: "Workspace" },
  { id: "workspace",     label: "Business",      icon: "home",     group: "Workspace" },
  { id: "team",          label: "Team",          icon: "users",    group: "Workspace" },
  { id: "autonomy",      label: "Autonomy",      icon: "shield",   group: "Workspace" },
  // The tab reads Connections; its ROUTE id stays "integrations". Notification
  // rows written before today carry route "admin/integrations" in the database,
  // and a rename would turn every one of those bells into a dead link. The word
  // an owner sees is worth changing -- Connections is what this list is, and
  // what the contract behind it has always called them -- and the identifier is
  // not worth breaking to match.
  { id: "integrations",  label: "Connections",   icon: "external", group: "Workspace" },
  { id: "notifications", label: "Notifications", icon: "bell",     group: "Workspace" },
  { id: "billing",       label: "Billing",       icon: "money",    group: "Workspace" },
  // Both ledgers, readable by the owner: who did what, and what happened.
  { id: "activity",      label: "Activity",      icon: "clock",    group: "Workspace" },
];
/** Routes that still answer but no longer earn a place in the rail. */
const SET_TABS_UNLISTED = [{ id: "memory", label: "AI memory", icon: "sparkle" }];
/**
 * The back office. Not in SET_TABS: it exists for the two or three people who
 * run Chanlytics and for nobody else, and a customer who types the route lands
 * on Profile rather than on a locked door they now know about.
 *
 * `window.__ME.platform_admin` rides on the workspace payload the seam already
 * fetches at boot, so the rail knows synchronously and never flickers a tab in.
 * It is NOT the authorization -- every platform route asks the database again,
 * and both answer 404 to everyone else.
 */
const SET_TABS_PLATFORM = [{ id: "platform", label: "Back office", icon: "monitor", group: "Chanlytics" }];
const isPlatformAdmin = () => !!(window.__ME && window.__ME.platform_admin);
const SET_TAB = (id) =>
  SET_TABS.find((t) => t.id === id)
  || (isPlatformAdmin() ? SET_TABS_PLATFORM.find((t) => t.id === id) : null)
  || SET_TABS_UNLISTED.find((t) => t.id === id)
  || SET_TABS[0];

// ...rest carries the aria-labelledby SetRow hands down; without forwarding it
// the switch is announced with no name at all.
const SetToggle = ({ on, onChange, ...rest }) => (
  <button className={`set-switch ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} {...rest}>
    <span className="set-knob" />
  </button>
);

/**
 * A settings row: what it is on the left, the control on the right.
 *
 * The control is named FROM the row. Every switch on this surface rendered as
 * an unlabelled `role="switch"` — the words that say what it does live in the
 * left column, and nothing tied the two together, so a screen reader announced
 * "switch, on" thirteen times down the Notifications tab. Naming it here rather
 * than at each call site means a control added to a row tomorrow is named too,
 * and a control that brings its own aria-label keeps it.
 */
const SetRow = ({ label, hint, children }) => {
  const labelId = React.useId();
  const named = React.Children.map(children, (kid) => (
    React.isValidElement(kid) && !kid.props["aria-label"] && !kid.props["aria-labelledby"]
      ? React.cloneElement(kid, { "aria-labelledby": labelId })
      : kid
  ));
  return (
    <div className="set-row">
      <div className="set-row-info">
        <span className="set-row-label" id={labelId}>{label}</span>
        {hint && <span className="set-row-hint">{hint}</span>}
      </div>
      <div className="set-row-control">{named}</div>
    </div>
  );
};

const SetSeg = ({ value, options, onChange, ...rest }) => {
  // role=group so the label SetRow supplies has something to name; the buttons
  // inside stay plain buttons, which is what they already were. `gate` is
  // window.gate(...)'s props, on every option -- a dial a role may not turn says
  // why when pressed, where it used to take the press and show the server's
  // refusal -- and it stays off the group, which gets everything else it is given.
  const { gate = null, ...group } = rest;
  return (
    <div className="cl-tabs" role="group" {...group}>
      {options.map(o => (
        <button key={o} className={`cl-tab ${value === o ? "active" : ""}`} onClick={() => onChange(o)} {...(gate || {})}>{o}</button>
      ))}
    </div>
  );
};

// Veto window — the third autonomy mode (ask-first < veto < auto); ST_STORE-backed
const VetoModeRow = () => {
  const [v, setV] = useSetState(window.ST_STORE.get("vetoMode", "Veto 30s"));
  const pick = (x) => { window.ST_STORE.set("vetoMode", x); setV(x); };
  return (
    <SetRow label="Safe text replies" hint={<>Safe drafts auto-send after the window — SMS/chat 30s, email 20m; committing content always asks. Live now: <button className="lm-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.thread("th-veto-kayla"))}>Kayla's draft</button></>}>
      <SetSeg value={v} options={["Ask always", "Veto 30s", "Auto"]} onChange={pick} />
    </SetRow>
  );
};

// The charter as one screen — rows/modes live in window.POLICY (data-bits); Fleet reads the same source.
const PolicyMatrix = () => {
  const POL_ROWS = window.POLICY.ROWS;
  const POL_MODES = window.POLICY.MODES;
  const [, polTick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("policy:changed", polTick);
    return () => window.removeEventListener("policy:changed", polTick);
  }, []);
  const modeOf = (r) => window.POLICY.modeOf(r.id);
  const set = (r, m) => window.POLICY.set(r.id, m);
  return (
    <section className="fl-card set-card">
      <div className="fl-card-head">
        <span className="fl-card-title">Policy matrix</span>
        <span className="fl-card-sub">What agents may do, per action class — the ruleset the backend enforces</span>
      </div>
      <table className="pol-table">
        <thead><tr><th>Action class</th>{POL_MODES.map((m) => <th key={m} className="pol-mode">{m}</th>)}</tr></thead>
        <tbody>
          {POL_ROWS.map((r) => (
            <tr key={r.id} className={r.locked ? "pol-locked" : ""}>
              <td><span className="pol-label">{r.label}</span><span className="pol-note">{r.note}</span>{window.TRUST && window.TRUST.cls(r.id) && <span className="pol-evidence">{window.TRUST.cls(r.id).sent.toLocaleString()} auto-sent · {window.TRUST.rate(window.TRUST.cls(r.id))}% edited · 30d</span>}</td>
              {POL_MODES.map((m) => (
                <td key={m} className="pol-cell">
                  {r.locked && m !== "Never" ? <span className="pol-dash">—</span> : (
                    <button className={`pol-dot ${modeOf(r) === m ? "on" : ""}`} title={r.locked ? "Charter — fixed" : m} disabled={r.locked} onClick={() => set(r, m)} {...window.gate("autonomy")}>{modeOf(r) === m ? <Icon name={r.locked ? "shield" : "check"} size={11} /> : ""}</button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

// ---------- Panes ----------
const ST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const stInitials = (n) => n.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

// The name you go by, saved through the bridge (/api/v1/me). Empty clears it;
// the chip, the roster and the account menu read the same words.
//
// It used to live inside the Team card, under a roster of other people, on a
// page titled Workspace whose first card was the business -- while the account
// menu's own "Your name" item navigated there. It is the first row of Profile
// now, which is where the menu points and where a person looks.
const YourName = ({ flash, ...rest }) => {
  const me = window.__ME || {};
  const [name, setName] = React.useState(me.display_name || "");
  const [busy, setBusy] = React.useState(false);
  const dirty = name.trim() !== (me.display_name || "");
  const save = async () => {
    setBusy(true);
    const r = await window.__me.setName(name);
    setBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? (r.name ? <>You&rsquo;re <b>{r.name}</b> to your team now.</> : <>Name cleared — your email stands in.</>) : <>{r.message}</> });
  };
  return (
    <div className="set-you" data-testid="set-you">
      <input
        className="sd-input set-you-input"
        {...rest}
        value={name}
        maxLength={80}
        placeholder="How your team sees you"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && dirty) save(); }}
        data-testid="set-you-name"
      />
      {dirty && <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} data-testid="set-you-save">{busy ? "Saving…" : "Save"}</button>}
    </div>
  );
};

/**
 * Profile — you, before anything about the business.
 *
 * Everything here already existed and was somewhere else: your name inside the
 * Team card, your email only inside the account menu's popover, your role as a
 * chip beside other people's. A person who wants to check which account they
 * are signed in as should not have to open a menu over a page about a salon.
 *
 * Deliberately short. Theme, keyboard shortcuts and per-device alerts stay in
 * the account menu, because they are properties of this BROWSER rather than of
 * you, and moving them here would make one of the two wrong.
 */
/**
 * The zone the business runs on.
 *
 * tenants.timezone decided what "today" meant in metrics (00009), which
 * closures were still upcoming, and the hours the receptionist quoted -- and it
 * had no write path in the product, so every workspace sat on 00001's
 * America/New_York default without ever being asked. A salon two zones away
 * was told the wrong opening hours by its own receptionist and had no way to
 * find out why.
 *
 * Shown as a city and the time there NOW, because "America/New_York" tells an
 * owner nothing and "New York, 3:42 PM there now" tells them in one glance
 * whether it is theirs.
 */
/**
 * A number as people write it, "+1 (305) 555-0100", the way Setup and Connections show one (contracts
 * formatPhoneDisplay, published by the bridge). Business showed the line it answers and the transfer number in the
 * E.164 they are stored as (the wiring audit's L7). Only E.164 is rewritten: anything else is shown as it was written,
 * which for the number it gives out is what the receptionist says.
 */
const phoneShown = (v) => (v && window.__phoneDisplay && /^\+[1-9][0-9]{6,14}$/.test(v) ? window.__phoneDisplay(v) : v);

/**
 * A fact, with where it came from.
 *
 * The Business card was eight rows of identical text, and three of them were
 * things the PLATFORM knows -- the line it answers, the name Google lists, the
 * address Google verified -- shown as if somebody had simply written them
 * down. That is how the live salon ended up publishing its transfer number as
 * its phone: a typed field with the same name as a real one, checked against
 * nothing. A source beside the value is the smallest honest fix, and the link
 * says who to go to when it is wrong.
 */
const FactRow = ({ label, fact, to, toLabel, empty = "—", show = (v) => v }) => {
  if (!fact) return null;
  const words = (window.__FACT_WORDS || {})[fact.source] || "";
  return (
    <div className="cl-prof-attr" data-testid={`fact-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
      <span className="cl-prof-attr-key">{label}</span>
      <span className="cl-prof-attr-val set-fact">
        <span className={fact.value ? "" : "set-fact-empty"}>{fact.value ? show(fact.value) : empty}</span>
        {fact.value && fact.source !== "typed" && <span className="set-fact-src">{words}</span>}
        {fact.disputed && <span className="set-fact-src disputed" title={`The system has ${show(fact.disputed.value)}`}>doesn&rsquo;t match</span>}
        {to && <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(to)}>{toLabel} <Icon name="arrow-right" size={10} /></button>}
      </span>
    </div>
  );
};

/**
 * A disagreement between what was typed and what the system knows, said out
 * loud, worst first.
 *
 * Not a toast and not a tooltip: the serious one means real customers are being
 * sent to the wrong number, and it has been true for as long as the field has
 * existed because nothing was comparing the two.
 */
const FactConflicts = () => {
  const conflicts = ((window.__FACTS || {}).conflicts) || [];
  if (!conflicts.length) return null;
  return (
    <>
      {conflicts.map((k) => (
        <div key={k.fact} className={`set-conflict ${k.severity}`} data-testid={`conflict-${k.fact}`} role="status">
          <Icon name={k.severity === "serious" ? "flag" : "info"} size={13} />
          <div className="set-conflict-body">
            <div className="set-conflict-title">{k.severity === "serious" ? "Your receptionist is publishing a different number" : "This does not match what Google has"}</div>
            <div className="set-conflict-sub">{k.sentence}</div>
          </div>
        </div>
      ))}
    </>
  );
};

/**
 * One brain field, saved from the row it is shown in.
 *
 * The two numbers below used to be sections nine and thirteen of a fourteen-
 * section form -- "Tell customers to call" near the top of one step, "How
 * callers reach a person" most of a page later in another, both of them read
 * from the Business card five rows apart. Editing one meant opening a form,
 * finding it among twelve fields that had nothing to do with it, and pressing
 * a Save that wrote the entire configuration.
 *
 * It still writes the entire configuration -- PUT /settings is a versioned
 * compare-and-swap, and sending a fragment would delete the rest -- but it
 * starts from what is stored and changes ONE key, which is the same discipline
 * the big form's `save` learned after a rebuild lost a workspace its prompt.
 */
function useFieldSave(flash) {
  const [busy, setBusy] = React.useState(false);
  const settings = window.__SETTINGS || null;
  const save = (change, said, done) => {
    if (busy || !window.__saveSettings || !settings || !settings.config) return;
    const cfg = settings.config;
    const brain = cfg.brain || {};
    setBusy(true);
    const next = { ...cfg, brain: change({ ...brain }, { ...(brain.profile || {}) }) };
    window.__saveSettings(next, settings.version, () => {
      setBusy(false);
      done();
      flash({ msg: said });
    }).then((r) => {
      if (r.ok) return;
      setBusy(false);
      flash({ tone: "danger", msg: <>{r.message}</> });
    });
  };
  return [busy, save];
}

/**
 * What the receptionist tells customers to call.
 *
 * Absent means "the line it answers", which is the answer for nearly every
 * workspace and the one that stays right when the number changes. Publishing
 * anything else is a deliberate act, and the note says what it costs -- because
 * the live salon published its transfer number here and every customer who
 * rang it reached a person's mobile instead of the receptionist standing by.
 */
const PublishedNumberRow = ({ fact, flash }) => {
  const line = ((window.__FACTS || {}).facts || {}).voice_line || null;
  const voiceLine = (line && line.value) || "";
  const lineShown = phoneShown(voiceLine);
  const handoff = (((window.__FACTS || {}).facts || {}).handoff_number || {}).value || null;
  const stored = ((window.__SETTINGS || {}).config || {}).brain || {};
  const [editing, setEditing] = React.useState(false);
  const [own, setOwn] = React.useState(!stored.phone_display);
  const [typed, setTyped] = React.useState(stored.phone_display || "");
  const [busy, save] = useFieldSave(flash);
  const open = () => { setOwn(!stored.phone_display); setTyped(stored.phone_display || ""); setEditing(true); };
  const commit = () => {
    const value = own ? "" : typed.trim();
    const bad = value && window.__whyNotAPhone ? window.__whyNotAPhone(value) : null;
    if (bad) { flash({ tone: "warn", msg: <>{bad}</> }); return; }
    if (!value && !voiceLine) { flash({ tone: "warn", msg: <>There is no line yet, so the receptionist needs a number to give out.</> }); return; }
    save(
      (brain) => { if (value) brain.phone_display = value; else delete brain.phone_display; return brain; },
      value ? <>Customers are told to call <b className="tabular">{value}</b> now.</> : <>Customers are told to call your line.</>,
      () => setEditing(false),
    );
  };
  if (!editing) {
    return (
      <div className="cl-prof-attr" data-testid="fact-tells-customers-to-call">
        <span className="cl-prof-attr-key">Tells customers to call</span>
        <span className="cl-prof-attr-val set-fact">
          <span className={fact && fact.value ? "" : "set-fact-empty"}>{(fact && fact.value) || "No number to give out"}</span>
          {fact && fact.value && fact.source !== "typed" && <span className="set-fact-src">{(window.__FACT_WORDS || {})[fact.source] || ""}</span>}
          {fact && fact.disputed && <span className="set-fact-src disputed" title={`The system has ${fact.disputed.value}`}>doesn&rsquo;t match</span>}
          <button className="cl-bucket-link" onClick={open} {...window.gate("settings")} data-testid="set-pub-change">Change</button>
        </span>
      </div>
    );
  }
  return (
    <div className="cl-prof-attr set-row-editing" data-testid="fact-tells-customers-to-call">
      <span className="cl-prof-attr-key">Tells customers to call</span>
      <span className="cl-prof-attr-val set-pub-inline">
        {voiceLine && (
          <div className="cl-tabs" role="radiogroup" aria-label="The number to tell customers to call">
            <button type="button" role="radio" aria-checked={own} className={`cl-tab ${own ? "active" : ""}`} onClick={() => setOwn(true)} data-testid="set-pub-line">Your line</button>
            <button type="button" role="radio" aria-checked={!own} className={`cl-tab ${!own ? "active" : ""}`} onClick={() => { setOwn(false); setTyped(typed || lineShown); }} data-testid="set-pub-other">A different number</button>
          </div>
        )}
        {!own || !voiceLine ? (
          <input className="set-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={lineShown || "+1 646 932 5775"} inputMode="tel" autoComplete="tel" aria-label="The number to publish" data-testid="set-pub-input" />
        ) : null}
        <div className="set-ident-note">
          {own && voiceLine
            ? <><b className="tabular">{lineShown}</b> — the line your receptionist answers. It follows the line, so changing your number changes nothing to keep in step.</>
            : window.__samePhone && window.__samePhone(typed, voiceLine)
              ? <>That is your line. Choose <b>Your line</b> and it stays right when the number changes.</>
              : handoff && window.__samePhone && window.__samePhone(typed, handoff)
                ? <>This is the number the receptionist <b>transfers</b> to, so customers who ring it reach a person directly and never the receptionist answering on <b className="tabular">{lineShown}</b>.</>
                : voiceLine
                  ? <>Customers who ring this will not reach your receptionist on <b className="tabular">{lineShown}</b>.</>
                  : <>The receptionist has no line of its own yet, so this is the number it gives out.</>}
        </div>
        <div className="set-row-actions">
          <button className="btn btn-primary btn-sm" onClick={commit} disabled={busy} data-testid="set-pub-save">{busy ? "Saving…" : "Save"}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </span>
    </div>
  );
};

/** Where a caller who insists on a person is transferred. Empty is a choice. */
const HandoffRow = ({ fact, flash }) => {
  const voiceLine = ((((window.__FACTS || {}).facts || {}).voice_line) || {}).value || "";
  const stored = (((window.__SETTINGS || {}).config || {}).brain || {}).profile || {};
  const [editing, setEditing] = React.useState(false);
  // Shown, and changed from, the way the row writes it: the check and the stored form both read "+1 (786) 555-0182".
  const [typed, setTyped] = React.useState(phoneShown(stored.handoff_number) || "");
  const [busy, save] = useFieldSave(flash);
  const commit = () => {
    const bad = window.__whyNotAHandoff ? window.__whyNotAHandoff(typed, voiceLine) : null;
    if (bad) { flash({ tone: "warn", msg: <>{bad}</> }); return; }
    const value = window.__handoffE164 ? window.__handoffE164(typed) : (typed.trim() || null);
    save(
      (brain, profile) => {
        if (value) profile.handoff_number = value; else delete profile.handoff_number;
        brain.profile = profile;
        return brain;
      },
      value ? <>Callers who insist on a person reach <b className="tabular">{phoneShown(value)}</b>.</> : <>The receptionist takes a message instead of transferring.</>,
      () => setEditing(false),
    );
  };
  if (!editing) {
    return (
      <div className="cl-prof-attr" data-testid="fact-transfers-a-caller-to">
        <span className="cl-prof-attr-key">Transfers a caller to</span>
        <span className="cl-prof-attr-val set-fact">
          <span className={fact && fact.value ? "" : "set-fact-empty"}>{fact && fact.value ? phoneShown(fact.value) : "Takes a message instead"}</span>
          <button className="cl-bucket-link" onClick={() => { setTyped(phoneShown(stored.handoff_number) || ""); setEditing(true); }} {...window.gate("settings")} data-testid="set-handoff-change">Change</button>
        </span>
      </div>
    );
  }
  return (
    <div className="cl-prof-attr set-row-editing" data-testid="fact-transfers-a-caller-to">
      <span className="cl-prof-attr-key">Transfers a caller to</span>
      <span className="cl-prof-attr-val set-pub-inline">
        <input className="set-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="+1 646 932 5775" inputMode="tel" autoComplete="tel" aria-label="Transfer number" data-testid="set-handoff-input" />
        <div className="set-ident-note">
          A line a person answers, with the country code. Empty and the phone receptionist takes a message instead of transferring — which is better than a number nobody picks up.
        </div>
        <div className="set-row-actions">
          <button className="btn btn-primary btn-sm" onClick={commit} disabled={busy} data-testid="set-handoff-save">{busy ? "Saving…" : "Save"}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </span>
    </div>
  );
};

const TimezoneRow = ({ flash }) => {
  const ws = (window.__WORKSPACES || []).find((t) => t.id === window.__ACTIVE_WORKSPACE) || null;
  const current = (ws && ws.timezone) || window.DEFAULT_TIMEZONE || "America/New_York";
  const [editing, setEditing] = React.useState(false);
  const [pick, setPick] = React.useState(current);
  const [busy, setBusy] = React.useState(false);
  const W = window.__tz || {};
  const words = W.words ? W.words(current) : { line: current };
  const zones = editing && W.known ? W.known() : [];
  const device = W.device ? W.device() : null;
  const save = async () => {
    setBusy(true);
    const r = await window.__workspace.setTimezone(pick);
    setBusy(false);
    if (r.ok) setEditing(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Your day is measured in <b>{W.city ? W.city(r.tz) : r.tz}</b> now.</> : <>{r.message}</> });
  };
  return (
    <div className="cl-prof-attr" data-testid="set-timezone">
      <span className="cl-prof-attr-key">Timezone</span>
      <span className="cl-prof-attr-val set-tz">
        {editing ? (
          <>
            <select className="set-input set-tz-select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Timezone" data-testid="set-tz-select">
              {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || pick === current} data-testid="set-tz-save">{busy ? "Saving…" : "Save"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setPick(current); setEditing(false); }}>Cancel</button>
            {device && device !== pick && (
              <button className="cl-bucket-link" onClick={() => setPick(device)}>Use this device&rsquo;s ({W.city ? W.city(device) : device})</button>
            )}
          </>
        ) : (
          <>
            {words.line}
            <button className="cl-bucket-link" onClick={() => { setPick(current); setEditing(true); }} {...window.gate("settings")} data-testid="set-tz-change">Change</button>
          </>
        )}
      </span>
    </div>
  );
};

const PaneProfile = ({ flash }) => {
  const me = window.__ME || {};
  const words = window.__identity ? window.__identity.words(me) : { name: me.display_name || "Your account", email: me.email || "" };
  const role = ST_ROLE_META[me.role] || null;
  const ws = (window.__WORKSPACES || []).find((t) => t.id === window.__ACTIVE_WORKSPACE) || null;
  const signOut = () => {
    if (window.__DEMO_MODE || !window.__shell) { flash({ msg: <>Nothing to sign out of in the demo.</> }); return; }
    window.__shell.signOut();
  };
  return (
    <>
      <section className="fl-card set-card" data-testid="set-profile">
        <div className="fl-card-head"><span className="fl-card-title">You</span></div>
        <div className="set-me">
          <div className="avatar set-me-avatar">{window.__identity ? window.__identity.initials(me.display_name, me.email) : "?"}</div>
          <div className="set-me-who">
            <div className="set-me-name">{words.name}</div>
            <div className="set-me-mail">{words.email}</div>
          </div>
          {role && <RolePill role={me.role} />}
        </div>
        <SetRow label="Your name" hint="How your team sees you — clear it and your email stands in">
          <YourName flash={flash} />
        </SetRow>
        <SetRow label="Signed in as" hint={<>Your password is set from the sign-in page — <a className="lm-link" href="/reset-password">choose a new one</a> and we&rsquo;ll email you a code</>}>
          <span className="set-me-static">{words.email || "—"}</span>
        </SetRow>
        {role && (
          <SetRow label={`Your role in ${(ws && ws.name) || "this workspace"}`} hint={role.can}>
            <span className="set-me-static">{role.label}</span>
          </SetRow>
        )}
      </section>
      {/* Named for what it does. "This device" sat over a sign-out that ends every session on every device:
          /auth/signout revokes them all (S20). */}
      <section className="fl-card set-card">
        <div className="fl-card-head"><span className="fl-card-title">Signing out</span></div>
        <SetRow label="Sign out everywhere" hint="Ends your session on every device at once, this one included — what someone who has lost a laptop expects">
          <button className="btn btn-sm" onClick={signOut} data-testid="set-profile-signout">
            <Icon name="logout" size={12} /> Sign out everywhere
          </button>
        </SetRow>
      </section>
    </>
  );
};

// A teammate's role as the one pill draws it: the tone and the words are contracts'.
const RolePill = ({ role }) => <StatePill kind="role" value={role} />;

// Team & roles — real session state (ST_STORE); owner can preview lower roles,
// which gates this section's own controls (the app-wide gate is the next step).
const TeamSection = ({ flash }) => {
  const S = window.ST_STORE;
  const [, setTick] = useSetState(0);
  useSetEffect(() => {
    const bump = () => setTick(n => n + 1);
    // team:changed is the mockup's roster. The real one arrives with the settings surface, read again after every
    // invite, role change and removal and by a failed read's Retry -- which this card never heard, so the roster on
    // screen stayed as it was under a toast saying it had changed (D7, S11).
    window.addEventListener("team:changed", bump);
    window.addEventListener("surface:settings", bump);
    return () => { window.removeEventListener("team:changed", bump); window.removeEventListener("surface:settings", bump); };
  }, []);
  const [inviting, setInviting] = useSetState(false);
  const [email, setEmail] = useSetState("");
  const [inviteRole, setInviteRole] = useSetState("operator");

  // REAL members when the bridge has them.
  //
  // This rendered four invented colleagues — and put YOU beside one of them,
  // on a real owner's own settings page. The seed store is the mockup's; the
  // API behind this card has existed since Session B.
  //
  // The API has no display names, only emails: an invented "Marcus Webb" is
  // exactly the kind of plausible detail that reads as fact, so the local part
  // of the address is shown as-is and nothing is dressed up.
  const realTeam = window.__TEAM;
  /**
   * Three states, not two.
   *
   * `undefined` — the bridge is not running at all (the standalone mockup),
   * where the seeded roster is the whole point.
   * `null` — the bridge ran and /api/v1/team FAILED. This one was falling
   * through to the same seeds, so a network blip put Sarah Chen, Marcus Webb,
   * Lena Park and Jay Rivera on a real owner's settings page as their
   * colleagues. That exact fabrication was caught and fixed once already; it
   * survived in the error path.
   * An array — the truth.
   */
  const teamUnavailable = realTeam === null;
  const me = (window.__ME && window.__ME.email) || null;
  // Members AND the invitations nobody has accepted yet. The API has always
  // returned both; only members were rendered, so an invitation that had been
  // sent, accepted or revoked was invisible on the card whose whole job is
  // saying who has access to this workspace.
  const realInvites = Array.isArray(window.__TEAM_INVITES) ? window.__TEAM_INVITES : [];
  const team = Array.isArray(realTeam)
    ? [
        ...realTeam.map((m) => {
          // The name they gave with the email under it, or the email alone —
          // never the email's local part dressed as a name.
          const w = window.__identity.member({ email: m.email, display_name: m.displayName });
          return { id: m.membershipId, name: w.name, sub: w.sub, email: m.email, displayName: m.displayName || "", role: m.role, status: "active", isMe: !!me && m.email === me };
        }),
        ...realInvites.map((i) => ({
          id: i.id,
          name: i.email,
          sub: null,
          email: i.email,
          displayName: "",
          role: i.role,
          status: "invited",
          // When the invitation stops working: the card says so, instead of
          // "pending" for ever over a door that has closed.
          expiresAt: i.expires_at || null,
          isMe: false,
        })),
      ]
    : S.getTeam();
  // The caller's REAL role decides what they may do. View-as still previews a
  // narrower one, but it can only ever narrow.
  const serverRole = (window.__SETTINGS && window.__SETTINGS.role) || null;
  // When only the TEAM read failed, the settings read still gave us the
  // caller's real role — better than the seeded roster's opinion of it.
  const myRole = Array.isArray(realTeam)
    ? (S.viewAsRole || serverRole || S.myRole())
    : teamUnavailable ? (serverRole || S.myRole()) : S.myRole();
  const canManage = S.can("team");
  const isOwner = Array.isArray(realTeam) || teamUnavailable
    ? serverRole === "owner"
    : (S.me() && S.me().role === "owner");
  const previewing = !!S.viewAsRole;
  // Billing has no seats. On real data the count is the members we actually
  // have, and a limit is only the mockup's: a real roster carried
  // `seatsLeft = 1`, a number made up to keep Invite on the card (S20).
  const seatsUsed = Array.isArray(realTeam) ? realTeam.length : S.seatsUsed();
  const seatsFull = !Array.isArray(realTeam) && seatsUsed >= S.seatsIncluded;

  // On a REAL roster every write goes to the server, and the card shows what
  // the server says afterwards.
  //
  // These three handlers used to mutate the seeded demo roster and toast
  // success on a pane fed by live data: an owner read "Invite sent to x as
  // Operator" and nothing was sent, stored or audited; a demotion showed a
  // confirmation while the database still said owner. Real rows carry real
  // membership ids the seed roster does not contain, so the writes were silent
  // no-ops and the toast was the only artifact. The routes have existed, been
  // tested and been role-gated since Session A with no caller.
  //
  // There is no optimistic update and no undo. An invitation email cannot be
  // recalled, and a role change is the power to message customers — so the
  // card waits for the server and then re-reads, rather than showing an
  // outcome it is only predicting.
  const realRoster = Array.isArray(realTeam);
  const [teamBusy, setTeamBusy] = useSetState(false);
  // Removing a teammate, or revoking an invitation, is armed first (the
  // audit's D13: it fired straight from a menu item). The row asks.
  const [armRemove, setArmRemove] = useSetState(null);

  const invite = async () => {
    const mail = email.trim().toLowerCase();
    if (!ST_EMAIL_RE.test(mail)) { flash({ tone: "warn", msg: <>That doesn't look like an email — check the address</> }); return; }
    if (team.some(m => m.email.toLowerCase() === mail)) { flash({ tone: "warn", msg: <><b>{mail}</b> is already on the team</> }); return; }
    if (!realRoster) {
      if (seatsFull) { flash({ tone: "warn", msg: <>No seats left — remove someone or upgrade the plan</> }); return; }
      const id = "u-" + mail.split("@")[0].replace(/[^a-z0-9]/g, "");
      const name = mail.split("@")[0].replace(/[._]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      S.addMember({ id, name, email: mail, role: inviteRole, status: "invited" });
      setEmail(""); setInviting(false);
      flash({ msg: <>Invite sent to <b>{mail}</b> as {ST_ROLE_META[inviteRole].label}</>, undo: () => S.removeMember(id) });
      return;
    }
    setTeamBusy(true);
    const r = await window.__teamInvite(mail, inviteRole);
    setTeamBusy(false);
    if (!r.ok) { flash({ tone: "danger", msg: <>{r.message}</> }); return; }
    setEmail(""); setInviting(false);
    // The server distinguishes these; saying "invite sent" for an account that
    // was simply added would promise an email nobody receives.
    const d = r.data || {};
    flash({
      msg: d.alreadyMember
        ? <><b>{mail}</b> is already on the team</>
        : d.added
          ? <><b>{mail}</b> already had an account and was added as {ST_ROLE_META[inviteRole].label}</>
          : d.alreadyInvited
            ? <><b>{mail}</b> already has an invitation waiting</>
            : <>Invitation emailed to <b>{mail}</b> as {ST_ROLE_META[inviteRole].label}</>,
    });
  };

  const changeRole = async (m, role) => {
    if (m.role === role) return;
    if (!realRoster) {
      if (m.role === "owner" && role !== "owner" && S.ownerCount() <= 1) { flash({ tone: "warn", msg: <>Promote another owner first — a workspace needs one</> }); return; }
      const prev = m.role;
      S.setRole(m.id, role);
      flash({ msg: <><b>{m.name.split(" ")[0]}</b> is now {ST_ROLE_META[role].label}</>, undo: () => S.setRole(m.id, prev) });
      return;
    }
    // The last-owner rule is enforced in the database and its message comes
    // back from there; checking it against the SEEDED roster here, as this did,
    // asked Sarah Chen whether this workspace still has an owner.
    setTeamBusy(true);
    const r = await window.__teamSetRole(m.id, role);
    setTeamBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <><b>{m.name}</b> is now {ST_ROLE_META[role].label}</> : <>{r.message}</> });
  };

  const remove = async (m) => {
    if (!realRoster) {
      if (m.role === "owner" && S.ownerCount() <= 1) { flash({ tone: "warn", msg: <>Can't remove the only owner</> }); return; }
      const snap = { ...m };
      S.removeMember(m.id);
      setArmRemove(null);
      flash({ msg: <><b>{m.name}</b> {m.status === "invited" ? "invite revoked" : "removed from the team"}</>, undo: () => S.addMember(snap) });
      return;
    }
    setTeamBusy(true);
    const r = await window.__teamRemove(m.id);
    setTeamBusy(false);
    setArmRemove(null);
    flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok
        ? <><b>{m.name}</b> {(r.data && r.data.revokedInvite) ? "invitation revoked" : "removed from the team"}</>
        : <>{r.message}</>,
    });
  };

  return (
    <section className="fl-card set-card">
      <div className="fl-card-head">
        <span className="fl-card-title">Team</span>
        <span className="fl-card-sub">
          {teamUnavailable
            ? "Couldn't be loaded"
            : Array.isArray(realTeam)
              ? `${seatsUsed} ${seatsUsed === 1 ? "person" : "people"}`
              : `${seatsUsed} of ${S.seatsIncluded} seats`}
        </span>
        {/* Invite is the card's act, so a role that may not invite sees it gated,
            saying why when pressed, instead of a card with no act at all. */}
        {!teamUnavailable && (!seatsFull
          ? !inviting && <button className="btn btn-sm" onClick={() => setInviting(true)} {...window.gate("team", "invite a teammate")}><Icon name="plus" size={12} /> Invite</button>
          : <button className="btn btn-sm" disabled title="No seats left — remove someone or upgrade">Seats full</button>
        )}
      </div>

      {isOwner && (
        <div className="set-viewas">
          <span className="set-viewas-label">View as</span>
          <div className="cl-tabs">
            {["owner", "operator", "viewer"].map(r => (
              <button key={r} className={`cl-tab ${myRole === r ? "active" : ""}`} onClick={() => S.setViewAs(r === "owner" ? null : r)}>{ST_ROLE_META[r].label}</button>
            ))}
          </div>
          {previewing && <span className="set-viewas-note"><Icon name="agents" size={10} /> Previewing — controls a {ST_ROLE_META[myRole].label} wouldn't have are hidden</span>}
        </div>
      )}

      {inviting && canManage && (
        <div className="set-invite">
          <input className="sd-input" type="email" placeholder="teammate@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && invite()} autoFocus />
          <div className="cl-tabs">
            {["operator", "viewer"].map(r => (
              <button key={r} className={`cl-tab ${inviteRole === r ? "active" : ""}`} onClick={() => setInviteRole(r)}>{ST_ROLE_META[r].label}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={invite} disabled={teamBusy}>{teamBusy ? "Sending…" : "Send invite"}</button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setInviting(false); setEmail(""); }} aria-label="Cancel"><Icon name="x" size={12} /></button>
        </div>
      )}

      {/* A team we could not read is not a team of four strangers. */}
      {teamUnavailable && (
        <FailedRead kind="card" what="your team" body="Everything else on this page is current — only the member list failed to load." surface="settings" testid="team-failed" />
      )}

      {!teamUnavailable && team.map(m => {
        // On real data, YOU is decided by the signed-in email — S.meId is the
        // mockup's fabricated operator, which is how a stranger's name ended up
        // wearing this badge on a real owner's settings page.
        const isMe = m.isMe !== undefined ? m.isMe : m.id === S.meId;
        const pending = m.status === "invited";
        const invite = pending && window.__inviteState ? window.__inviteState(m.expiresAt) : { expired: false, words: "invite pending" };
        return (
          <div key={m.id} className={`set-team-row ${pending ? "pending" : ""} ${invite.expired ? "expired" : ""}`}>
            <span className="avatar" style={pending ? { background: "var(--ink-faint)" } : m.role === "owner" ? undefined : { background: "var(--ink-muted)" }}>{m.displayName !== undefined ? window.__identity.initials(m.displayName, m.email) : stInitials(m.name)}</span>
            <span className="set-team-body">
              <span className="set-team-name">{m.name}{isMe && <span className="set-team-you">You</span>}</span>
              <span className="set-team-mail">{[m.sub !== undefined ? m.sub : m.email, pending ? invite.words : ""].filter(Boolean).join(" · ")}</span>
              {armRemove === m.id && (
                <Confirm
                  question={pending ? `Revoke the invitation to ${m.email}?` : `Remove ${m.name} from the team?`}
                  detail={pending ? "The link in their email stops working." : "They lose access at once; what they decided stays on the record."}
                  yes={pending ? "Yes, revoke" : "Yes, remove"}
                  danger
                  busy={teamBusy}
                  onYes={() => remove(m)}
                  onNo={() => setArmRemove(null)}
                  testid="team-remove"
                />
              )}
            </span>
            <RolePill role={m.role} />
            {canManage && !isMe ? (
              <MoreMenu btnClass="btn btn-icon btn-sm" items={[
                // An open invitation has no membership row to change a role
                // on: the server looks the id up among members and answers
                // "not on this team". The role was chosen when the invite was
                // sent — revoke and re-invite to change it.
                ...(pending && realRoster ? [] : [
                  { header: "Role" },
                  ...["owner", "operator", "viewer"].map(r => ({ label: ST_ROLE_META[r].label + (m.role === r ? "  ✓" : ""), icon: r === "owner" ? "shield" : r === "operator" ? "agents" : "users", onClick: () => changeRole(m, r) })),
                  { divider: true },
                ]),
                ...(pending && !realRoster ? [{ label: "Resend invite", icon: "mail", onClick: () => flash({ msg: <>Invite resent to <b>{m.email}</b></> }) }] : []),
                { label: pending ? "Revoke invite" : "Remove", icon: "x", danger: true, onClick: () => setArmRemove(m.id) },
              ]} />
            ) : <span className="set-team-spacer" />}
          </div>
        );
      })}

      <div className="set-roles-legend">
        {["owner", "operator", "viewer"].map(r => (
          <div key={r} className="set-role-def">
            <RolePill role={r} />
            <span className="set-role-can">{ST_ROLE_META[r].can}</span>
          </div>
        ))}
      </div>

      {!canManage && (
        <div className="set-team-gated" data-testid="team-gated"><Icon name="shield" size={11} /> {window.gateTitle("team", "change the team")}</div>
      )}
    </section>
  );
};

// Real workspace facts when the bridge has them, the mockup's seeds otherwise.
// The card design is unchanged — only where the values come from moves.
//
// It rendered "Serenity Spa · +1 (415) 555-0100 · Lena Park, Jay Rivera": a
// fabricated business with fabricated staff, shown to a real owner as their
// own settings.
const DAY_LABEL_SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/**
 * The owner's own summary of their hours.
 *
 * The run-collapsing is the composer's, called through the bridge — this used
 * to be a hand-copied second implementation under a comment promising it
 * matched the prompt. Two copies of "which days share the same hours" is how
 * the card and the receptionist start disagreeing, on the one screen an owner
 * glances at to check. Only the wording is ours: short day names here, full
 * ones in the prompt.
 */
const hoursSummary = (hours) => {
  if (!hours || !window.__hoursRuns) return null;
  return window.__hoursRuns(hours)
    .map((r) => {
      const label = r.from === r.to
        ? DAY_LABEL_SHORT[r.from]
        : DAY_LABEL_SHORT[r.from] + "–" + DAY_LABEL_SHORT[r.to];
      return label + " " + r.text;
    })
    .join(" · ");
};

/**
 * Editing the business's facts.
 *
 * These are the same fields the receptionist is given on WhatsApp, and the
 * same ones the inbound-call webhook hands the voice agent as the
 * `business_facts` variable. Writing them here is what stops the two channels
 * holding separate copies of the opening hours — but only for a voice agent
 * whose prompt actually reads that variable, which is a one-time change in
 * Retell that this app cannot make on the owner's behalf.
 *
 * Whole-config write with optimistic concurrency: the ENTIRE config we loaded
 * goes back with the profile merged in, because sending only this section
 * would delete the rest. A version mismatch is a 409 the owner is told about,
 * never a silent overwrite of a colleague's edit.
 */
// The write schema refuses more than this, so the editor must not offer it.
// Published by the bridge; the literal is the standalone mockup fallback and
// a test pins it to MAX_INTERVALS_PER_DAY.
const MAX_SHIFTS = ((window.__configLimits || {}).maxIntervalsPerDay) || 4;
// The same cap the write schema enforces (contracts MAX_CLOSURES), so the form
// stops at the number the save would refuse, instead of refusing at Save.
const MAX_CLOSURE_ROWS = ((window.__configLimits || {}).maxClosures) || 60;

const SET_DAYS = [["mon","Monday"],["tue","Tuesday"],["wed","Wednesday"],["thu","Thursday"],["fri","Friday"],["sat","Saturday"],["sun","Sunday"]];

// Offered rather than typed. A comma-separated box asks someone to guess both
// the spelling and the separator, and "Espanol" and "Spanish" would then be two
// different languages to anything reading this later. Anything not listed can
// still be added by hand.
const SET_LANGS = ["English", "Spanish", "Portuguese", "French", "Haitian Creole", "Mandarin", "Cantonese", "Arabic", "Russian", "Polish", "Italian", "Hindi"];

const SetSectionHead = ({ title, hint }) => (
  <div className="set-sec-head">
    <span className="set-sec-title">{title}</span>
    {hint && <span className="set-sec-hint">{hint}</span>}
  </div>
);

// The three messages sent in the business's name when the receptionist cannot answer (S5), in the order an owner meets
// them, each with when it goes out -- the edge's own conditions (whatsapp/inbound.ts), in an owner's words.
const FALLBACK_ROWS = [
  { key: "error", label: "If it can't write a reply", when: "The AI service failed or couldn't finish an answer. The conversation then waits for you." },
  { key: "non_text", label: "If it gets something it can't read", when: "A voice note, a sticker, or a photo it can't look at. It then stays out of that conversation and asks for you." },
  { key: "greeting", label: "If replies can't be written at all", when: "Only while Chanlytics' AI connection is down. Each conversation then waits for you." },
];

const BusinessEditor = ({ settings, onDone, flash }) => {
  const brain = (settings.config && settings.config.brain) || {};
  const p0 = brain.profile || {};
  /**
   * Is there a receptionist here at all?
   *
   * Provisioning inserts an EMPTY tenant_config row (migration 00017), and this
   * form only ever edited the profile ON a brain — it never collected the name,
   * phone line or booking link, so a new workspace could not be set up through
   * the product at all. It also meant nobody could change their own booking
   * link after the fact. Same form, both jobs.
   */
  const creating = !brain.business_name;
  const [bizName, setBizName] = useSetState(brain.business_name || "");
  const [phoneDisplay, setPhoneDisplay] = useSetState(brain.phone_display || "");
  // Resolved on the server from tenant_channels. The editor shows it beside the
  // field rather than trusting whatever was typed to be the same number.
  const RF = ((window.__FACTS || {}).facts) || {};
  const voiceLine = (RF.voice_line && RF.voice_line.value) || null;
  const lineShown = phoneShown(voiceLine);
  const handoffLine = (RF.handoff_number && RF.handoff_number.value) || null;
  const [bookingLink, setBookingLink] = useSetState(brain.booking_link || "");
  const [address, setAddress] = useSetState(p0.address || "");
  const [tone, setTone] = useSetState(p0.tone || "");
  const [langs, setLangs] = useSetState(() => (p0.languages || []).slice());
  const [langAdd, setLangAdd] = useSetState("");
  const [escalate, setEscalate] = useSetState((p0.escalate_when || []).join("\n"));

  const [website, setWebsite] = useSetState(p0.website || "");
  const [notes, setNotes] = useSetState(() => (p0.notes || []).map((x) => ({ ...x })));
  const br0 = p0.booking_rules || {};
  const [leadHours, setLeadHours] = useSetState(br0.lead_hours !== undefined ? String(br0.lead_hours) : "");
  const [bufferMin, setBufferMin] = useSetState(br0.buffer_min !== undefined ? String(br0.buffer_min) : "");
  const [daysAhead, setDaysAhead] = useSetState(br0.max_days_ahead !== undefined ? String(br0.max_days_ahead) : "");
  const [partyMax, setPartyMax] = useSetState(br0.party_max !== undefined ? String(br0.party_max) : "");
  const [slotMin, setSlotMin] = useSetState(br0.slot_min !== undefined ? String(br0.slot_min) : "");
  const [consultFirst, setConsultFirst] = useSetState((br0.consult_first || []).join("\n"));
  const [bookingNotes, setBookingNotes] = useSetState((br0.notes || []).join("\n"));
  const cal0 = (settings.config && settings.config.calendar) || {};
  const [icalUrl, setIcalUrl] = useSetState(cal0.ical_url || "");
  const [calChecking, setCalChecking] = useSetState(false);
  const [calCheck, setCalCheck] = useSetState(null);
  // Opt-in abilities: off unless the owner turned one on.
  const feat0 = (settings.config && settings.config.features) || {};
  const [vision, setVision] = useSetState(feat0.vision === true);
  const setNote = (i, k, v) => setNotes((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  // Pre-filled with the workspace's existing instructions the first time this
  // is opened, so nothing a business already told its receptionist quietly
  // disappears the moment it fills in a form. Visible, and theirs to trim.
  // Chosen in contracts (S4): the owner's own words, or the prompt from before
  // this form, carried and said so below -- never the product's opening lines,
  // which no owner wrote and which opened here as if one had.
  const draft0 = window.__instructionsDraft(brain);
  const [extra, setExtra] = useSetState(draft0.text);
  // The three messages sent in the business's name when the receptionist cannot answer (S5): shown, and the owner's to
  // change. They name the details that are filled as each one goes out (contracts fallbackMessages); a new workspace
  // starts from the product's wording, which names them rather than copying them in.
  const [fallbacks, setFallbacks] = useSetState(() => ({ ...(brain.fallbacks || window.__fallbackDefaults) }));
  const setFallback = (k, v) => { setFallbacks((f) => ({ ...f, [k]: v })); clearProblem(`fallback-${k}`); };
  const [hours, setHours] = useSetState(() => {
    const h = {};
    SET_DAYS.forEach(([d]) => {
      const x = (p0.hours || {})[d] || {};
      // One editable list per day, however the day happens to be stored: a
      // plain open/close pair reads as a single shift, so the two shapes are
      // one thing to edit and only differ again on save.
      const shifts = (x.intervals || []).filter((s) => s && s.open && s.close).map((s) => ({ ...s }));
      if (!shifts.length && x.open && x.close) shifts.push({ open: x.open, close: x.close });
      // `isOpen` means the business is open, not the opening time — a day is
      // closed only when it has no times, which is what the schema stores.
      h[d] = { shifts, isOpen: shifts.length > 0 };
    });
    return h;
  });
  const [services, setServices] = useSetState(() => (p0.services || []).map((x) => ({ ...x })));
  const [closures, setClosures] = useSetState(() => (p0.closures || []).map((x) => ({ ...x })));
  const [guards, setGuards] = useSetState(() => ({
    // Absent means ON. Only an explicit false turns one off, so an unset
    // config must not render as three unticked boxes.
    never_quote_prices: (p0.guardrails || {}).never_quote_prices !== false,
    never_confirm_booking: (p0.guardrails || {}).never_confirm_booking !== false,
    disclose_ai: (p0.guardrails || {}).disclose_ai !== false,
    // Opt-in, unlike the three above: a rule that defaulted on would have
    // changed every composed prompt already live the moment it shipped.
    no_health_advice: (p0.guardrails || {}).no_health_advice === true,
  }));
  const [saving, setSaving] = useSetState(false);
  // What each field needs, under the field it belongs to (S22). Every check in `save` fills it at once, and a field
  // clears its own sentence when it changes; the toast only counts them.
  const [problems, setProblems] = useSetState({});
  const clearProblem = (k) => setProblems((p) => (p[k] ? { ...p, [k]: undefined } : p));
  const problemProps = (k) => (problems[k] ? { "aria-invalid": true, "aria-describedby": `biz-${k}-problem` } : {});
  const problemLine = (k) => (problems[k] ? <window.FieldError id={`biz-${k}-problem`} message={problems[k]} testid={`biz-${k}-problem`} /> : null);
  // Unsaved changes, against what the form opened with. Cancel, another Settings tab and closing the page each ask
  // before they throw them away (S22); all three did it silently.
  const [armCancel, setArmCancel] = useSetState(false);
  const draft = JSON.stringify([bizName, phoneDisplay, bookingLink, address, tone, langs, escalate, website, notes, leadHours, bufferMin, daysAhead, partyMax, slotMin, consultFirst, bookingNotes, icalUrl, vision, extra, fallbacks, hours, services, closures, guards]);
  const opened = React.useRef(draft);
  const dirty = draft !== opened.current;
  const dirtyNow = React.useRef(dirty);
  dirtyNow.current = dirty;
  useSetEffect(() => {
    window.__settingsUnsaved = () => dirtyNow.current;
    return () => { delete window.__settingsUnsaved; };
  }, []);
  useSetEffect(() => {
    if (!dirty) return undefined;
    const hold = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [dirty]);

  const setDay = (d, patch) => setHours((h) => ({ ...h, [d]: { ...h[d], ...patch } }));
  const setShift = (d, n, k, v) =>
    setHours((h) => ({
      ...h,
      [d]: { ...h[d], shifts: h[d].shifts.map((s, j) => (j === n ? { ...s, [k]: v } : s)) },
    }));
  /**
   * Toggling a day closed KEEPS its shifts.
   *
   * The switch sits about ten pixels from the times. Dropping the shifts on
   * the way through would mean an accidental tap costs an owner four times and
   * the decision about lunch, with the day switch offering no undo — and
   * reopening the day would present empty boxes as if nothing had been there.
   * The save is what decides a closed day stores nothing.
   */
  const toggleDay = (d) => setDay(d, { isOpen: !hours[d].isOpen, shifts: hours[d].shifts.length ? hours[d].shifts : [{ open: "", close: "" }] });
  const addShift = (d) =>
    setHours((h) => ({ ...h, [d]: { ...h[d], shifts: [...h[d].shifts, { open: "", close: "" }] } }));
  const removeShift = (d, n) => {
    const gone = hours[d].shifts[n];
    setHours((h) => ({ ...h, [d]: { ...h[d], shifts: h[d].shifts.filter((_, j) => j !== n) } }));
    flash({
      msg: <>Removed the {DAY_LABEL_SHORT[d]} shift{gone.open ? <> at <b>{gone.open}</b></> : null}</>,
      undo: () => setHours((h) => ({
        ...h,
        [d]: { ...h[d], shifts: [...h[d].shifts.slice(0, n), gone, ...h[d].shifts.slice(n)] },
      })),
    });
  };
  const setSvc = (i, k, v) => setServices((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setClosure = (i, k, v) => setClosures((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  /**
   * Removing one closure is undoable, because it is a date somebody typed.
   *
   * Every other destructive control in this file offers an undo; a bulk
   * "clear past dates" button would not have, and does not exist — the
   * composer already stops stating a date once it has gone by, so there is
   * nothing an owner has to tidy and nothing for them to delete by accident.
   */
  const removeClosure = (i) => {
    const gone = closures[i];
    setClosures((l) => l.filter((_, j) => j !== i));
    flash({
      msg: <>Removed {gone.date ? <b>{gone.date}</b> : "the closure"}{gone.note ? ` — ${gone.note}` : ""}</>,
      undo: () => setClosures((l) => [...l.slice(0, i), gone, ...l.slice(i)]),
    });
  };
  // A service and a note are words somebody typed, the same as a closure, and each went with one press and no Undo (S18).
  const removeService = (i) => {
    const gone = services[i];
    setServices((l) => l.filter((_, j) => j !== i));
    flash({
      msg: <>Removed {gone.name ? <b>{gone.name}</b> : "a service"}</>,
      undo: () => setServices((l) => [...l.slice(0, i), gone, ...l.slice(i)]),
    });
  };
  const removeNote = (i) => {
    const gone = notes[i];
    setNotes((l) => l.filter((_, j) => j !== i));
    flash({
      msg: <>Removed {gone.title ? <b>{gone.title}</b> : "a note"}</>,
      undo: () => setNotes((l) => [...l.slice(0, i), gone, ...l.slice(i)]),
    });
  };
  // Today in the BUSINESS's zone, not the browser's. An owner working from
  // another country must not be told a date has passed when it has not.
  const wsTz = ((window.__WORKSPACES || []).find((t) => t.id === window.__ACTIVE_WORKSPACE) || {}).timezone;
  const todayKey = (() => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: wsTz || undefined }).format(new Date());
    } catch { return null; }
  })();
  const upcomingCount = todayKey
    ? closures.filter((c) => c.date && (c.until && c.until >= c.date ? c.until : c.date) >= todayKey).length
    : closures.filter((c) => c.date).length;
  const toggleLang = (l) => setLangs((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));
  const addLang = () => {
    const v = langAdd.trim();
    if (!v || langs.some((x) => x.toLowerCase() === v.toLowerCase())) { setLangAdd(""); return; }
    setLangs((cur) => [...cur, v]);
    setLangAdd("");
  };

  // Most businesses keep one set of weekday hours. Typing the same two times
  // five more times is the kind of chore that makes people leave the field
  // blank, and blank hours are what the receptionist cannot answer with.
  /** The same shifts, in the same order? Used to tell a no-op from a loss. */
  const sameShifts = (a, b) =>
    a.isOpen === b.isOpen &&
    a.shifts.length === b.shifts.length &&
    a.shifts.every((s, i) => s.open === b.shifts[i].open && s.close === b.shifts[i].close);

  /**
   * Copy one day's hours onto others — and SAY what that did.
   *
   * This is where the salon lost its Sundays: a whole-day replace across seven
   * days, from a link sitting inches from two other links, with a toast that
   * counted successes. The button still does what it says, because "make the
   * week look like Monday" is the thing people want. What changed is that the
   * surprising part is named — days that were CLOSED and are now open, and
   * days whose own hours (a lunch break, a late Thursday) were replaced — and
   * that the whole grid can be put back in one click.
   */
  const applyToAll = (from, days) => {
    const src = hours[from];
    if (!src.isOpen) return;
    const opened = days.filter((d) => !hours[d].isOpen);
    const replaced = days.filter((d) => hours[d].isOpen && !sameShifts(hours[d], src));
    const before = {};
    SET_DAYS.forEach(([d]) => { before[d] = { isOpen: hours[d].isOpen, shifts: hours[d].shifts.map((s) => ({ ...s })) }; });
    setHours((h) => {
      const next = { ...h };
      days.forEach((d) => { next[d] = { isOpen: true, shifts: src.shifts.map((s) => ({ ...s })) }; });
      return next;
    });
    const names = (list) => list.map((d) => DAY_LABEL_SHORT[d]).join(", ");
    const notes = [];
    if (opened.length) notes.push(<><b>{names(opened)}</b> {opened.length === 1 ? "was" : "were"} closed and {opened.length === 1 ? "is" : "are"} now open</>);
    if (replaced.length) notes.push(<>replaced different hours on <b>{names(replaced)}</b></>);
    flash({
      msg: notes.length
        ? <>Copied {DAY_LABEL_SHORT[from]}&apos;s hours — {notes.map((n, i) => <React.Fragment key={i}>{i ? ", and " : ""}{n}</React.Fragment>)}</>
        : <>Copied {DAY_LABEL_SHORT[from]}&apos;s hours — nothing else changed</>,
      undo: () => setHours(before),
    });
  };

  const save = () => {
    if (saving || !window.__saveSettings) return;
    // Start from what is STORED, not from nothing.
    //
    // This used to be `const profile = {}` with the known keys added back, and
    // that is not a save — it is a rebuild, and a rebuild silently deletes
    // every key this form does not happen to render. It is the exact mechanism
    // that lost a live workspace its 5,000-character prompt: nobody deleted
    // anything, a rebuild simply dropped what it did not know about.
    //
    // Any field added to the profile later — by a newer editor, by a script,
    // by the API — now survives an owner opening this form and pressing Save.
    const profile = { ...p0 };
    // Every problem at once, each said under its own field (S22).
    const found = {};
    // Only send what was filled in. An empty string is not a fact, and storing
    // it would have the composed prompt state an address of nothing — so an
    // emptied field DELETES its key rather than storing "".
    const put = (k, v) => { if (v === undefined) delete profile[k]; else profile[k] = v; };
    put("address", address.trim() || undefined);
    put("tone", tone.trim() || undefined);
    put("languages", langs.length ? langs : undefined);
    const esc = escalate.split("\n").map((x) => x.trim()).filter(Boolean);
    put("escalate_when", esc.length ? esc : undefined);
    put("extra_instructions", extra.trim() || undefined);
    // As much as the receptionist takes, said under the box before a round trip (S4): the server's refusal named no field.
    if (extra.trim().length > window.__instructionsMax) {
      found.extra = <>At most {window.__instructionsMax.toLocaleString("en-US")} characters — this is {extra.trim().length.toLocaleString("en-US")}.</>;
    }
    // Each message says under itself what stops it (S5): nothing to send, more than a message holds, or a name that
    // nothing fills in and a customer would read as written.
    FALLBACK_ROWS.forEach(({ key }) => {
      const t = fallbacks[key].trim();
      const unknown = window.__unknownDetails(t);
      if (!t) found[`fallback-${key}`] = <>Write this message, or use the default wording.</>;
      else if (t.length > 2000) found[`fallback-${key}`] = <>At most 2,000 characters — this is {t.length.toLocaleString("en-US")}.</>;
      else if (unknown.length) found[`fallback-${key}`] = <>Only {"{business}"}, {"{booking link}"} and {"{phone}"} are filled in — {unknown[0]} would be sent as written.</>;
    });
    // handoff_number is deliberately NOT written here. It is edited in the row
    // that states it, on the Business card, and `profile` starts from what is
    // stored -- so not touching the key preserves it. Its two refusals (the
    // country code, and never the receptionist's own line) moved to
    // contracts/phone.ts, beside the row that now enforces them.
    const site = website.trim();
    if (site && !/^https?:\/\/.+\..+/.test(site)) {
      found.website = <>The website needs to be a full web address, starting with https://</>;
    }
    put("website", site || undefined);
    const noteRows = notes
      .map((n) => ({ title: (n.title || "").trim(), text: (n.text || "").trim() }))
      .filter((n) => n.title || n.text);
    notes.forEach((n, i) => {
      const title = (n.title || "").trim();
      const text = (n.text || "").trim();
      if ((title || text) && (!title || !text)) found[`note-${i}`] = <>Each note needs both a title and the text to say.</>;
    });
    put("notes", noteRows.length ? noteRows : undefined);
    // Booking rules: a blank field is "no rule", never zero.
    const num = (v, lo, hi) => { const n = parseInt(String(v).trim(), 10); return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined; };
    // Start from the stored rules the form does not edit (settingsRulesKept):
    // a rebuild from {} deleted the slot length on every save.
    const rules = settingsRulesKept(p0.booking_rules);
    // A number outside what a rule allows is said under its box; it used to be dropped without a word (S22).
    const outside = (v, lo, hi) => String(v).trim() !== "" && num(v, lo, hi) === undefined;
    if (outside(leadHours, 0, 168)) found.lead = <>Least notice is 0 to 168 hours; leave it empty for no rule.</>;
    if (outside(slotMin, 15, 240)) found.slot = <>A slot is 15 to 240 minutes; leave it empty for the calendar&rsquo;s 30.</>;
    if (outside(bufferMin, 0, 120)) found.buffer = <>The gap is 0 to 120 minutes; leave it empty for none.</>;
    if (outside(daysAhead, 1, 90)) found.ahead = <>Times are offered 1 to 90 days ahead; leave it empty for no rule.</>;
    if (outside(partyMax, 1, 20)) found.party = <>A booking is for 1 to 20 people; leave it empty for no rule.</>;
    const lead = num(leadHours, 0, 168); if (lead !== undefined) rules.lead_hours = lead;
    const buf = num(bufferMin, 0, 120); if (buf !== undefined) rules.buffer_min = buf;
    const ahead = num(daysAhead, 1, 90); if (ahead !== undefined) rules.max_days_ahead = ahead;
    const party = num(partyMax, 1, 20); if (party !== undefined) rules.party_max = party;
    // The slot length has a field of its own now (S2): 15 to 240 minutes, as the schema allows; blank is the calendar's default.
    const slotLen = num(slotMin, 15, 240); if (slotLen !== undefined) rules.slot_min = slotLen;
    const cf = consultFirst.split("\n").map((x) => x.trim()).filter(Boolean); if (cf.length) rules.consult_first = cf;
    const bn = bookingNotes.split("\n").map((x) => x.trim()).filter(Boolean); if (bn.length) rules.notes = bn;
    put("booking_rules", Object.keys(rules).length ? rules : undefined);
    const feed = icalUrl.trim();
    if (feed && !/^(https?|webcal):\/\/\S+$/i.test(feed)) {
      found.feed = <>The calendar feed needs to be a full address, starting with https:// or webcal://</>;
    }
    const hrs = {};
    SET_DAYS.forEach(([d]) => {
      const x = hours[d];
      const shifts = x.isOpen ? x.shifts.filter((s) => s.open && s.close) : [];
      // ONE shift is still written as open/close, not as a one-element
      // intervals array. Writing it the new way would rewrite every existing
      // config into a new shape the first time anybody pressed Save — a
      // migration nobody asked for, on rows that already said this correctly.
      //
      // A day that is closed is stored as `{}` — a real answer. Omitting it
      // would read as "we did not say".
      hrs[d] = shifts.length === 0 ? {}
        : shifts.length === 1 ? { open: shifts[0].open, close: shifts[0].close }
        : { intervals: shifts.map((s) => ({ open: s.open, close: s.close })) };
    });
    // Only send hours once at least one day has real times, or an untouched
    // form would save seven closed days and read as a business never open.
    // Via put, so turning every day off CLEARS the stored grid instead of
    // leaving yesterday's behind now that we start from the stored profile.
    put(
      "hours",
      SET_DAYS.some(([d]) => hours[d].isOpen && hours[d].shifts.some((s) => s.open && s.close))
        ? hrs
        : undefined,
    );
    const svcs = services.filter((x) => (x.name || "").trim()).map((x) => {
      const o = { name: x.name.trim() };
      const d = parseInt(x.duration_min, 10);
      if (Number.isFinite(d) && d > 0) o.duration_min = d;
      if ((x.price_note || "").trim()) o.price_note = x.price_note.trim();
      return o;
    });
    put("services", svcs.length ? svcs : undefined);
    // A row with no date is a row somebody started and did not finish. Sending
    // it would fail validation and name a field they cannot see; dropping it
    // is what they meant.
    const closed = closures
      .filter((c) => (c.date || "").trim())
      .map((c) => {
        const o = { date: c.date.trim() };
        // `until` equal to `date` is a one-day closure said twice.
        if ((c.until || "").trim() && c.until.trim() !== o.date) o.until = c.until.trim();
        if ((c.note || "").trim()) o.note = c.note.trim();
        return o;
      });
    put("closures", closed.length ? closed : undefined);
    profile.guardrails = { ...guards };

    // Checked here so the owner is told WHICH field, and told it before a round
    // trip. The API rejects the same things, but surfaces only the first issue's
    // message with no path — "Config rejected: Invalid url" names nothing.
    const name = bizName.trim();
    const phone = phoneDisplay.trim();
    const link = bookingLink.trim();
    // An empty published number is now the RIGHT answer, not a missing one: it
    // resolves to the line the receptionist answers. Only a workspace with no
    // line at all and nothing typed has nothing to give a customer.
    // Each empty one is said under its own box: the name, the number, the link.
    const needs = (missing) => <>The receptionist needs {missing} before it can answer anyone.</>;
    if (!name) found.name = needs("a business name");
    if (!phone && !voiceLine) found.phone = needs("a phone number");
    if (!link) found.link = needs("a booking link");
    const badPhone = phone && window.__whyNotAPhone ? window.__whyNotAPhone(phone) : null;
    if (badPhone) found.phone = <>{badPhone}</>;
    if (!/^https?:\/\/.+\..+/.test(link)) {
      if (link) found.link = <>That booking link needs to be a full web address, starting with https://</>;
    }
    const count = Object.keys(found).length;
    setProblems(found);
    if (count) {
      flash({ tone: "warn", msg: <>Not saved — {count === 1 ? "1 field needs" : `${count} fields need`} a look.</> });
      return;
    }
    const defaults = window.__receptionistDefaults(name);

    const next = {
      ...settings.config,
      brain: {
        ...brain,
        business_name: name,
        // undefined, not "": absent is the schema's way of saying "use the line".
        phone_display: phone || undefined,
        booking_link: link,
        // The product's own opening lines, on every save (S4). The box above showed
        // the prompt written before this form, and what the owner kept of it is
        // now their instructions; left here as well it was stored twice, and an
        // emptied box carried it straight back. Built in contracts, under the name
        // the business has now.
        system_prompt: defaults.system_prompt,
        // The three messages as the form holds them (S5). An existing workspace's
        // open with its own words, never replaced because somebody opened a form;
        // a new one's with the product's wording, which names the details so they
        // are filled as each goes out.
        fallbacks: { greeting: fallbacks.greeting.trim(), error: fallbacks.error.trim(), non_text: fallbacks.non_text.trim() },
        profile,
      },
      // A top-level section, read by the edge; an emptied field removes it.
      ...(feed ? { calendar: { ical_url: feed } } : { calendar: undefined }),
      // Opt-in abilities, written once the owner has touched them.
      ...(vision || feat0.vision !== undefined ? { features: { ...feat0, vision } } : {}),
    };
    setSaving(true);
    // saveSettings refreshes every surface on success — several seconds of
    // fetching before this promise settles. Reporting only at the end meant
    // pressing Save did nothing observable for long enough to conclude it was
    // broken, which is exactly what happened.
    window.__saveSettings(next, settings.version, () => {
      // The server has accepted it. Say so NOW; the refresh can finish behind.
      setSaving(false);
      flash({ msg: <>Saved — the receptionist picks these up within a minute</> });
      onDone();
    }).then((r) => {
      if (r.ok) return;
      setSaving(false);
      flash({ tone: "danger", msg: <>{r.message}</> });
    });
  };

  const openDays = SET_DAYS.filter(([d]) => hours[d].isOpen).length;

  return (
    <section className="fl-card set-card set-editor">
      <div className="fl-card-head">
        <span className="fl-card-title">{creating ? "Set up your receptionist" : "Your business"}</span>
        <span className="fl-card-sub">
          {creating ? "The three things it cannot answer anyone without" : "Both agents answer from these"}
        </span>
      </div>

      {/* First, because without these there is no receptionist — and because
          until now there was no way to change your own booking link at all. */}
      <div className="set-group">
        <div className="set-group-head"><span className="set-group-name">Your business</span><span className="set-group-hint">The facts a customer asks for by name.</span></div>
      <div className="set-sec">
        <SetSectionHead
          title="Who you are"
          hint={creating ? "Required — the receptionist introduces itself with these" : "What it calls you, and where it sends people"}
        />
        <div className="set-ident">
          <label className="set-ident-row">
            <span className="set-ident-key">Business name</span>
            <input
              className="set-input"
              value={bizName}
              onChange={(e) => { setBizName(e.target.value); clearProblem("name"); }}
              placeholder="The name customers know you by"
              aria-label="Business name"
              {...problemProps("name")}
            />
          </label>
          {problemLine("name")}
        {/* Only while CREATING. Afterwards this number is edited in the
            row that states it, on the Business card -- the same fact in one
            place instead of a form field and a read-only row five rows
            apart. The create form still asks, because a workspace with no
            line has nothing to give a customer until somebody types it. */}
        {creating && (
          <div className="set-ident-row set-pub">
            <span className="set-ident-key">Tell customers to call</span>
            <div className="set-pub-body">
              {voiceLine ? (
                <>
                  <div className="cl-tabs" role="radiogroup" aria-label="The number to tell customers to call">
                    <button type="button" role="radio" aria-checked={!phoneDisplay} className={`cl-tab ${!phoneDisplay ? "active" : ""}`} onClick={() => setPhoneDisplay("")} data-testid="set-pub-line">
                      Your line
                    </button>
                    <button type="button" role="radio" aria-checked={!!phoneDisplay} className={`cl-tab ${phoneDisplay ? "active" : ""}`} onClick={() => setPhoneDisplay(phoneDisplay || lineShown)} data-testid="set-pub-other">
                      A different number
                    </button>
                  </div>
                  {phoneDisplay ? (
                    <>
                      <input
                        className="set-input"
                        value={phoneDisplay}
                        onChange={(e) => { setPhoneDisplay(e.target.value); clearProblem("phone"); }}
                        placeholder={lineShown}
                        inputMode="tel"
                        autoComplete="tel"
                        aria-label="The number to publish instead"
                        data-testid="set-pub-input"
                        {...problemProps("phone")}
                      />
                      {problemLine("phone")}
                      <div className="set-ident-note">
                        {window.__samePhone && window.__samePhone(phoneDisplay, voiceLine)
                          ? <>That is your line. Leave it on <b>Your line</b> and it stays right when the number changes.</>
                          : handoffLine && window.__samePhone && window.__samePhone(phoneDisplay, handoffLine)
                            ? <>This is the number the receptionist <b>transfers</b> to, so customers who ring it reach a person directly and never the receptionist answering on <b className="tabular">{lineShown}</b>.</>
                            : <>Customers who ring this will not reach your receptionist on <b className="tabular">{lineShown}</b>.</>}
                      </div>
                    </>
                  ) : (
                    <div className="set-ident-note" data-testid="set-pub-note">
                      <b className="tabular">{lineShown}</b> — the line your receptionist answers. It follows the line, so changing your number here changes nothing to keep in step.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <input
                    className="set-input"
                    value={phoneDisplay}
                    onChange={(e) => { setPhoneDisplay(e.target.value); clearProblem("phone"); }}
                    placeholder="(555) 010-1234"
                    inputMode="tel"
                    autoComplete="tel"
                    aria-label="The number to tell customers to call"
                    data-testid="set-pub-input"
                    {...problemProps("phone")}
                  />
                  {problemLine("phone")}
                  <div className="set-ident-note">No phone line yet, so this is the only number the receptionist can give. It answers on WhatsApp; the number you type here is somewhere a person picks up.</div>
                </>
              )}
            </div>
          </div>
        )}
          <label className="set-ident-row">
            <span className="set-ident-key">Booking link</span>
            <input
              className="set-input"
              value={bookingLink}
              onChange={(e) => { setBookingLink(e.target.value); clearProblem("link"); }}
              placeholder="https://your-booking-page.com"
              inputMode="url"
              autoComplete="url"
              aria-label="Booking link"
              {...problemProps("link")}
            />
          </label>
          {problemLine("link")}
        </div>
        {/* Said once, plainly, rather than discovered by a customer. */}
        <div className="set-sec-note">
          The receptionist sends this link instead of confirming appointments itself.
        </div>
      </div>
      <div className="set-sec">
        <SetSectionHead title="Where you are" hint="Given when someone asks how to find you" />
        <input
          className="set-input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Example St, Brooklyn, NY 11208"
          autoComplete="street-address"
          name="street-address"
          aria-label="Business address"
        />
      </div>
      <div className="set-sec">
        <SetSectionHead title="Website" hint="Optional — given when someone asks" />
        <input
          className="set-input"
          value={website}
          onChange={(e) => { setWebsite(e.target.value); clearProblem("website"); }}
          placeholder="https://example.com"
          inputMode="url"
          autoComplete="url"
          aria-label="Website"
          {...problemProps("website")}
        />
        {problemLine("website")}
      </div>
      </div>
      <div className="set-group">
        <div className="set-group-head"><span className="set-group-name">When you are open</span><span className="set-group-hint">The weekly grid, the days it does not apply to, and the calendar it reads.</span></div>
      <div className="set-sec">
        <SetSectionHead
          title="When you are open"
          hint={openDays ? `${openDays} ${openDays === 1 ? "day" : "days"} a week` : "Not set — it cannot answer this yet"}
        />
        <div className="set-hours">
          {SET_DAYS.map(([d, label], i) => (
            <div key={d} className={`set-day ${hours[d].isOpen ? "" : "closed"}`}>
              <button
                type="button"
                className={`set-switch ${hours[d].isOpen ? "on" : ""}`}
                role="switch"
                aria-checked={hours[d].isOpen}
                aria-label={label}
                onClick={() => toggleDay(d)}
              ><span className="set-knob" /></button>
              <span className="set-day-name">{label}</span>
              {hours[d].isOpen ? (
                <>
                  <span className="set-day-shifts">
                    {hours[d].shifts.map((sh, n) => (
                      <span key={n} className="set-day-shift">
                        <input
                          className="set-input set-input-time" type="time" value={sh.open}
                          aria-label={n === 0 ? `${label} opens` : `${label} shift ${n + 1} opens`}
                          onChange={(e) => setShift(d, n, "open", e.target.value)}
                        />
                        <span className="set-day-sep">to</span>
                        <input
                          className="set-input set-input-time" type="time" value={sh.close}
                          aria-label={n === 0 ? `${label} closes` : `${label} shift ${n + 1} closes`}
                          onChange={(e) => setShift(d, n, "close", e.target.value)}
                        />
                        {/* The first shift has no remove control: the switch on
                            the left already means "closed", and two ways to say
                            the same thing is how one of them gets misread. */}
                        {n > 0 && (
                          <button
                            type="button" className="btn btn-ghost btn-icon btn-sm"
                            aria-label={`Remove ${label} shift ${n + 1}`}
                            onClick={() => removeShift(d, n)}
                          ><Icon name="x" size={11} /></button>
                        )}
                      </span>
                    ))}
                    {hours[d].shifts.length < MAX_SHIFTS && (
                      <button type="button" className="set-day-break" onClick={() => addShift(d)}>
                        <Icon name="plus" size={10} /> break
                      </button>
                    )}
                  </span>
                  {i === 0 && (
                    <span className="set-day-apply">
                      <button type="button" className="cl-bucket-link" onClick={() => applyToAll("mon", ["tue","wed","thu","fri"])}>Copy to weekdays</button>
                      <button type="button" className="cl-bucket-link" onClick={() => applyToAll("mon", ["tue","wed","thu","fri","sat","sun"])}>to every day</button>
                    </span>
                  )}
                </>
              ) : (
                <span className="set-day-closed">Closed</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="set-sec">
        <SetSectionHead
          title="Days you are closed"
          hint={upcomingCount ? `${upcomingCount} still ahead` : "Holidays and one-off closures"}
        />
        {closures.length > 0 && (
          <div className="set-svc-head set-closure-head">
            <span>From</span><span>Until (optional)</span><span>Why</span><span />
          </div>
        )}
        {closures.map((c, i) => (
          <div key={i} className="set-svc-row set-closure-row">
            {/* type=date, so 31 November cannot be typed at all — the class of
                bug where a stored non-date names the wrong day downstream. */}
            <input
              className="set-input" type="date" value={c.date || ""}
              aria-label="Closed from" onChange={(e) => setClosure(i, "date", e.target.value)}
            />
            <input
              className="set-input" type="date" value={c.until || ""} min={c.date || undefined}
              aria-label="Closed until" onChange={(e) => setClosure(i, "until", e.target.value)}
            />
            <input
              className="set-input" value={c.note || ""} placeholder="Christmas"
              aria-label="Reason" onChange={(e) => setClosure(i, "note", e.target.value)}
            />
            <button
              type="button" className="btn btn-ghost btn-icon btn-sm"
              aria-label={`Remove closure ${c.date || ""}`}
              onClick={() => removeClosure(i)}
            ><Icon name="x" size={12} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" disabled={closures.length >= MAX_CLOSURE_ROWS} title={closures.length >= MAX_CLOSURE_ROWS ? `At most ${MAX_CLOSURE_ROWS} closures` : undefined} onClick={() => setClosures((l) => (l.length >= MAX_CLOSURE_ROWS ? l : [...l, { date: "", note: "" }]))}>
          <Icon name="plus" size={12} /> Add a closed day
        </button>
        {closures.length >= MAX_CLOSURE_ROWS && <div className="set-sec-note">That is the most closures the receptionist keeps ({MAX_CLOSURE_ROWS}). Dates that have passed can go.</div>}
        {/* The one case this cannot express, said plainly rather than left for
            an owner to discover by picking the only option and turning away an
            afternoon of bookings. */}
        <div className="set-sec-note">
          Closing early rather than all day? Leave it out of this list and set that
          day&apos;s hours above instead. Dates that have passed stop being mentioned
          on their own — there is nothing to tidy up.
        </div>
      </div>
      <div className="set-sec">
        <SetSectionHead title="Calendar it may look at" hint="Read-only — so it can say which times are open before sending the link" />
        <input
          className="set-input"
          value={icalUrl}
          onChange={(e) => { setIcalUrl(e.target.value); clearProblem("feed"); }}
          placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
          inputMode="url"
          autoComplete="off"
          aria-label="Calendar feed address"
          {...problemProps("feed")}
        />
        {problemLine("feed")}
        <div className="set-sec-note">
          The private iCal address of the calendar your appointments land in (Google, Apple or Outlook — Booksy, Calendly and the rest sync into one).
          It is only ever read. Nothing is booked from here; the booking link does that, whichever tool is behind it.
        </div>
        <div className="set-cal-check">
          <button className="btn btn-sm" disabled={!icalUrl.trim() || calChecking || !window.__calendar} onClick={async () => {
            if (!window.__calendar) return;
            setCalChecking(true);
            setCalCheck(null);
            const r = await window.__calendar.previewFeed(icalUrl.trim());
            setCalChecking(false);
            setCalCheck(r.ok ? { ok: true, ...r.data } : { ok: false, message: r.message });
          }} data-testid="cal-check">{calChecking ? "Reading…" : "Check the link"}</button>
          {calCheck && (
            <span className={`set-row-hint ${calCheck.ok ? "" : "warn"}`} data-testid="cal-check-result">
              {calCheck.ok
                ? <>Read it: <b>{calCheck.events}</b> event{calCheck.events === 1 ? "" : "s"}{calCheck.recurring_expanded ? `, ${calCheck.recurring_expanded} repeating` : ""}{calCheck.skipped_recurring ? `, ${calCheck.skipped_recurring} repeating rule${calCheck.skipped_recurring === 1 ? "" : "s"} read once` : ""}.{calCheck.next.length ? <> Next: {calCheck.next.map((n) => `${n.title} · ${n.start}`).join(" · ")}.</> : " Nothing taken in the next 30 days."} Save to let the receptionist read it.</>
                : calCheck.message}
            </span>
          )}
          {cal0.ical_url && <button className="cl-bucket-link" onClick={() => window.CHANLY.nav("calendar")}>Open the calendar</button>}
        </div>
      </div>
      </div>
      <div className="set-group">
        <div className="set-group-head"><span className="set-group-name">What you offer</span><span className="set-group-hint">What can be booked, and the rules for offering it.</span></div>
      <div className="set-sec">
        <SetSectionHead title="What you offer" hint="Names and rough timings — a price only if you can state it flatly" />
        {services.length > 0 && (
          <div className="set-svc-head">
            <span>Service</span><span>Takes</span><span>Price</span><span />
          </div>
        )}
        {services.map((sv, i) => (
          <div key={i} className="set-svc-row">
            <input className="set-input" value={sv.name || ""} placeholder="What customers call it" aria-label="Service name" onChange={(e) => setSvc(i, "name", e.target.value)} />
            <span className="set-svc-mins">
              <input className="set-input" inputMode="numeric" value={sv.duration_min || ""} placeholder="45" aria-label="Minutes" onChange={(e) => setSvc(i, "duration_min", e.target.value.replace(/[^0-9]/g, ""))} />
              <span className="set-svc-unit">min</span>
            </span>
            <input className="set-input" value={sv.price_note || ""} placeholder="quoted at consult" aria-label="Price note" onChange={(e) => setSvc(i, "price_note", e.target.value)} />
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove ${sv.name || "service"}`} onClick={() => removeService(i)}><Icon name="x" size={12} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => setServices((l) => [...l, { name: "" }])}><Icon name="plus" size={12} /> Add a service</button>
      </div>
      <div className="set-sec">
        <SetSectionHead title="Booking rules" hint="How open times are offered — the receptionist never books; it sends the link" />
        <div className="set-br-grid">
          <label className="set-br-field"><span className="set-br-label">Least notice (hours)</span><input className="set-input" inputMode="numeric" value={leadHours} placeholder="2" aria-label="Least notice in hours" onChange={(e) => { setLeadHours(e.target.value.replace(/[^0-9]/g, "")); clearProblem("lead"); }} {...problemProps("lead")} />{problemLine("lead")}</label>
          <label className="set-br-field"><span className="set-br-label">Slot length (minutes)</span><input className="set-input" inputMode="numeric" value={slotMin} placeholder="30" aria-label="Slot length in minutes" onChange={(e) => { setSlotMin(e.target.value.replace(/[^0-9]/g, "")); clearProblem("slot"); }} {...problemProps("slot")} />{problemLine("slot")}</label>
          <label className="set-br-field"><span className="set-br-label">Gap between appointments (minutes)</span><input className="set-input" inputMode="numeric" value={bufferMin} placeholder="0" aria-label="Gap between appointments in minutes" onChange={(e) => { setBufferMin(e.target.value.replace(/[^0-9]/g, "")); clearProblem("buffer"); }} {...problemProps("buffer")} />{problemLine("buffer")}</label>
          <label className="set-br-field"><span className="set-br-label">Offer times up to (days ahead)</span><input className="set-input" inputMode="numeric" value={daysAhead} placeholder="14" aria-label="Days ahead" onChange={(e) => { setDaysAhead(e.target.value.replace(/[^0-9]/g, "")); clearProblem("ahead"); }} {...problemProps("ahead")} />{problemLine("ahead")}</label>
          <label className="set-br-field"><span className="set-br-label">Most people per booking</span><input className="set-input" inputMode="numeric" value={partyMax} placeholder="4" aria-label="Most people per booking" onChange={(e) => { setPartyMax(e.target.value.replace(/[^0-9]/g, "")); clearProblem("party"); }} {...problemProps("party")} />{problemLine("party")}</label>
        </div>
        <textarea className="set-input set-textarea" rows={2} value={consultFirst} onChange={(e) => setConsultFirst(e.target.value)} placeholder={"Color correction\nExtensions"} aria-label="Services that need a consultation first" />
        <div className="set-sec-note">Services that need a consultation before they can be booked, one per line.</div>
        <textarea className="set-input set-textarea" rows={2} value={bookingNotes} onChange={(e) => setBookingNotes(e.target.value)} placeholder={"No chemical services after 4 PM\nBridal parties are booked by phone"} aria-label="Booking notes" />
      </div>
      </div>
      <div className="set-group">
        <div className="set-group-head"><span className="set-group-name">How it answers</span><span className="set-group-hint">The voice, the limits, and everything that fits no field.</span></div>
      <div className="set-sec">
        <SetSectionHead title="Languages" hint="It answers in whichever of these the customer uses" />
        {/* ONE control. This was a grid of every language we could think of --
            most of them off, all of them shouting for attention -- and then a
            SECOND control underneath to add one that was not in the grid. Two
            widgets for one job, and the chosen two sat among fourteen unchosen.
            A token field shows what is chosen, and offers the common ones only
            while there is room to consider them. */}
        <div className="set-tokens" data-testid="set-langs">
          {langs.map((l) => (
            <span key={l} className="set-token">
              {l}
              <button type="button" className="set-token-x" aria-label={`Remove ${l}`} onClick={() => toggleLang(l)}>
                <Icon name="x" size={10} />
              </button>
            </span>
          ))}
          <input
            className="set-token-input"
            value={langAdd}
            placeholder={langs.length ? "Add another" : "English, Spanish…"}
            aria-label="Add a language"
            onChange={(ev) => setLangAdd(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === ",") { ev.preventDefault(); addLang(); }
              // Backspace on an empty field takes the last one back, which is
              // what every token field does and what a hand expects.
              else if (ev.key === "Backspace" && !langAdd && langs.length) toggleLang(langs[langs.length - 1]);
            }}
            onBlur={() => addLang()}
          />
        </div>
        {SET_LANGS.some((l) => !langs.includes(l)) && (
          <div className="set-token-offer">
            {SET_LANGS.filter((l) => !langs.includes(l)).slice(0, 6).map((l) => (
              <button key={l} type="button" className="set-token-add" onClick={() => toggleLang(l)}>
                <Icon name="plus" size={9} /> {l}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="set-sec">
        <SetSectionHead title="Rules it always follows" hint="These stay in force whatever else you write below" />
        {[
          ["never_quote_prices", "Never quote or confirm a price", "It offers a consult or the booking link instead"],
          ["never_confirm_booking", "Never confirm an appointment itself", "Booking happens on your link or with your staff"],
          ["disclose_ai", "Say it is an assistant if asked", "And offer to bring in a person"],
          ["no_health_advice", "Never give health advice", "Skin reactions, allergies, pregnancy, medication — a professional advises at the appointment"],
        ].map(([k, label, hint]) => (
          <div key={k} className="set-rule">
            <button
              type="button"
              className={`set-switch ${guards[k] ? "on" : ""}`}
              role="switch"
              aria-checked={guards[k]}
              aria-label={label}
              onClick={() => setGuards((g) => ({ ...g, [k]: !g[k] }))}
            ><span className="set-knob" /></button>
            <span className="set-rule-body">
              <span className="set-rule-label">{label}</span>
              <span className="set-rule-hint">{hint}</span>
            </span>
          </div>
        ))}
        {/* Opt-in, unlike the rules above: this gives the receptionist an
            ability rather than a limit, so it starts off. */}
        <div className="set-rule" data-testid="rule-vision">
          <button
            type="button"
            className={`set-switch ${vision ? "on" : ""}`}
            role="switch"
            aria-checked={vision}
            aria-label="Look at photos customers send"
            onClick={() => setVision((v) => !v)}
          ><span className="set-knob" /></button>
          <span className="set-rule-body">
            <span className="set-rule-label">Look at photos customers send</span>
            <span className="set-rule-hint">It says what it sees and suggests the next step, under the rules above. Off, a photo is acknowledged and passed to a person.</span>
          </span>
        </div>
      </div>
      <div className="set-sec">
        <SetSectionHead title="Hand over to a person when" hint="One per line" />
        <textarea className="set-input set-textarea" rows={3} value={escalate} onChange={(e) => setEscalate(e.target.value)} placeholder={"They ask for the owner by name\nThey are unhappy about a previous visit"} aria-label="Escalation triggers" />
      </div>
      <div className="set-sec">
        <SetSectionHead title="Other things it should know" hint="One topic each — parking, gift cards, a second location. Both receptionists say these." />
        {notes.map((n, i) => (
          <div key={i} className="set-note-row">
            <input className="set-input" value={n.title || ""} placeholder="Gift cards" aria-label="Note title" onChange={(e) => { setNote(i, "title", e.target.value); clearProblem(`note-${i}`); }} {...problemProps(`note-${i}`)} />
            <textarea className="set-input set-textarea" rows={2} value={n.text || ""} placeholder="Gift cards are sold at the front desk, any amount — ask for the owner." aria-label="Note text" onChange={(e) => { setNote(i, "text", e.target.value); clearProblem(`note-${i}`); }} {...problemProps(`note-${i}`)} />
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove ${n.title || "note"}`} onClick={() => removeNote(i)}><Icon name="x" size={12} /></button>
            {problemLine(`note-${i}`)}
          </div>
        ))}
        {notes.length < 10 && (
          <button type="button" className="btn btn-sm" onClick={() => setNotes((l) => [...l, { title: "", text: "" }])}><Icon name="plus" size={12} /> Add a note</button>
        )}
      </div>
      <div className="set-sec">
        <SetSectionHead title="Anything else it should know" hint={draft0.carried ? "Optional" : "Optional — written in your own words"} />
        {/* Text nobody here wrote sat under "written in your own words" (S4): say where it came from, and which wins. */}
        {draft0.carried && (
          <span className="set-sec-hint" data-testid="biz-extra-carried">Carried over from the instructions your receptionist followed before this form. Trim what the fields above now cover — where the two disagree about the address, hours or services, the fields win.</span>
        )}
        <textarea
          className="set-input set-textarea"
          rows={Math.min(14, Math.max(4, Math.ceil(extra.length / 90)))}
          value={extra}
          onChange={(e) => { setExtra(e.target.value); clearProblem("extra"); }}
          placeholder="Parking is behind the building. We do not take walk-ins after 5pm."
          aria-label="Extra instructions"
          {...problemProps("extra")}
        />
        {extra.trim().length > window.__instructionsMax * 0.8 && !problems.extra && (
          <span className="set-sec-hint tabular" data-testid="biz-extra-count">{extra.trim().length.toLocaleString("en-US")} of {window.__instructionsMax.toLocaleString("en-US")} characters</span>
        )}
        {problemLine("extra")}
      </div>
      <div className="set-sec" data-testid="biz-fallbacks">
        <SetSectionHead title="When it can't answer" hint="Sent in your name. {business}, {booking link} and {phone} are filled in as each goes out" />
        <div className="set-fallbacks">
          {FALLBACK_ROWS.map(({ key, label, when }) => {
            const text = fallbacks[key];
            const k = `fallback-${key}`;
            // What a customer would read with the form as it is typed -- the name, the link and the number not saved yet
            // -- shown only when the message names a detail, since one that names none reads as written.
            const reads = /\{/.test(text)
              ? window.__fallbackMessages({ business_name: bizName.trim() || "your business", booking_link: bookingLink.trim(), phone_display: phoneDisplay.trim() || undefined, fallbacks: { ...fallbacks } }, { channels: voiceLine ? [{ kind: "voice", number_e164: voiceLine, status: "active" }] : [] })[key]
              : null;
            // A link or a number written out stays as written when the details change; a name follows them.
            const link = bookingLink.trim();
            const written = link && text.includes(link) ? "link" : /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(text) ? "number" : null;
            return (
              <div className="set-fallback" key={key}>
                <span className="set-fallback-label">{label}</span>
                <span className="set-sec-hint">{when}</span>
                <textarea className="set-input set-textarea" rows={3} value={text} onChange={(e) => setFallback(key, e.target.value)} aria-label={label} {...problemProps(k)} />
                {problemLine(k)}
                {reads && !problems[k] && <span className="set-fallback-reads" data-testid={`biz-fallback-${key}-preview`}>A customer reads: {reads}</span>}
                {written && (
                  <span className="set-sec-hint" data-testid={`biz-fallback-${key}-written`}>
                    {written === "link" ? <>Your booking link is written out here — {"{booking link}"} keeps it current.</> : <>A number is written out here — {"{phone}"} gives the one you publish.</>}
                  </span>
                )}
                {text !== window.__fallbackDefaults[key] && (
                  <button type="button" className="btn btn-ghost btn-sm set-fallback-default" onClick={() => setFallback(key, window.__fallbackDefaults[key])} data-testid={`biz-fallback-${key}-default`}>Use the default wording</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </div>
      {armCancel && (
        <Confirm question="Discard your changes?" detail="Nothing you changed here has been saved." yes="Yes, discard" no="Keep editing" danger onYes={onDone} onNo={() => setArmCancel(false)} testid="biz-cancel" />
      )}
      <div className="set-editor-foot">
        <span className="set-editor-note">Saved changes reach the receptionist within a minute. A call already in progress finishes on the old details.</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => (dirty ? setArmCancel(true) : onDone())} disabled={saving}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving} {...window.gate("settings")}>
          {saving ? "Saving" : "Save"}
        </button>
      </div>
    </section>
  );
};
/**
 * The owner's own copy of everything, and the one thing this page cannot do.
 *
 * The privacy page has said "an owner can export a workspace's data" since it
 * was written, and no page offered it: three partial exports (everyone as a
 * CSV on People, one thread, one call) were the whole of it. This is the door
 * the sentence promised -- one file: people, conversations with their
 * messages, calls with their transcripts, and every consent change with who
 * recorded it. Owners only, like the CSV. Deletion is deliberately not a
 * button: it is a request answered by a person, as the same page says.
 */
const WorkspaceData = () => {
  // Offered to every role and gated for the ones that may not take it (the one gate). The link was absent for them,
  // under a sentence of the card's own.
  const href = window.__href ? window.__href("GET export") : null;
  return (
    <section className="fl-card set-card" data-testid="set-data">
      <SetSectionHead title="Your data" hint="Everything this workspace holds, in one file you keep" />
      <div className="cl-prof-attr-list">
        <div className="cl-prof-attr">
          <span className="cl-prof-attr-key">Download everything</span>
          <span className="cl-prof-attr-val" style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {href && (
              <a className="btn btn-ghost btn-sm" href={href} download data-testid="set-export-all" title="People, conversations, calls and consent history as one JSON file" {...window.gate("export", "download the workspace's data")}><Icon name="external" size={12} /> Download (JSON)</a>
            )}
            <span className="set-team-mail">People, conversations with their messages, calls with their transcripts, and every consent change with who recorded it. Call audio is not included: it is removed on the schedule the privacy policy states, and the transcript is here.</span>
          </span>
        </div>
        <div className="cl-prof-attr">
          <span className="cl-prof-attr-key">Delete this workspace</span>
          <span className="cl-prof-attr-val set-team-mail">Write to <a href="mailto:hi@chanlytics.com">hi@chanlytics.com</a> from the owner's address. Its data is removed within 30 days, as the <a href="/privacy" target="_blank" rel="noreferrer">privacy policy</a> says.</span>
        </div>
      </div>
    </section>
  );
};

const PaneWorkspace = ({ flash }) => {
  const [editing, setEditing] = useSetState(false);
  // Drawn again whenever the settings surface is read again: after a save, a conflict's re-read, a Retry. Only
  // Autonomy and Notifications listened, so this card kept the values from before a save until something else
  // happened to repaint it (D7).
  const [, setTick] = useSetState(0);
  useSetEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("surface:settings", bump);
    // And when Setup is read again: a broken configuration's card says when a repair was asked for (S8), and the ask is Setup's.
    window.addEventListener("surface:setup", bump);
    return () => { window.removeEventListener("surface:settings", bump); window.removeEventListener("surface:setup", bump); };
  }, []);
  const settings = window.__SETTINGS || null;
  const S = (settings && settings.config && settings.config.brain) || null;
  const ws = (window.__WORKSPACES || []).find((t) => t.id === window.__ACTIVE_WORKSPACE) || null;
  const profile = (S && S.profile) || null;
  const real = !!S;
  /**
   * "No configuration" is NOT "show the demo".
   *
   * `real` was doing two jobs: is this a live workspace, and do we have its
   * details. A workspace with no brain fell to the mockup branch and rendered
   * Serenity Spa's invented name, phone, therapists and 9–6 seven-day hours to
   * a real owner, on a surface classified real, under a live pill.
   *
   * That is not hypothetical: migration 00017 provisions every new tenant with
   * an EMPTY tenant_config row, so it was the first thing each new owner saw —
   * and a config the parser refuses collapses to {} on read and lands here too.
   * The same bug on the team card one row below shipped once already.
   */
  const connected = !!settings;
  const unconfigured = connected && !real;
  // And "broken" is a third thing. The server now says so instead of handing
  // back {} — which landed here as `unconfigured` and offered a form whose
  // save would have replaced the broken row with its few fields.
  const broken = !!(settings && settings.broken);
  const hrs = profile && hoursSummary(profile.hours);
  // Resolved on the server, where the channel rows and the Google listing are.
  // Absent (an older payload, a broken config) falls back to nothing rather
  // than to a guess: a fact with no source is not a fact.
  const F = ((window.__FACTS || {}).facts) || {};
  // `connected`, not `real`: a workspace with no receptionist is exactly the
  // one that most needs this form. It used to be the one case that could not
  // open it.
  if (broken) {
    // Only Chanlytics can repair it (S8): the card asks for the repair, and once asked says when -- it said Chanlytics
    // repairs it, with no way to ask. The ask is Setup's, so when it was made is Setup's to say too.
    const W = window.__brokenConfigWords;
    const repairAsked = (window.__SETUP && window.__SETUP.dto && window.__SETUP.dto.requests && window.__SETUP.dto.requests.repair) || null;
    const askRepair = async () => {
      if (!(window.canDo && window.canDo("approve")) || !window.__setup) return;
      const r = await window.__setup.request("repair");
      flash(r.ok
        ? { msg: r.already ? <>Already asked — a person at Chanlytics has it.</> : <>We got it — a person at Chanlytics will repair your settings and reach you by email.</> }
        : window.refusalToast(r, "Request not sent"));
    };
    return (
      <>
        <section className="fl-card set-card">
          <div className="fl-card-head"><span className="fl-card-title">Business</span></div>
          <FailedRead kind="card" title={W.title} body={W.body} testid="settings-broken">
            <ul className="set-broken-issues">{settings.broken.issues.map((i) => <li key={i}>{i}</li>)}</ul>
            {repairAsked
              ? <span className="set-row-hint" data-testid="settings-broken-requested">{W.requested(repairAsked, Date.now())}</span>
              : <button type="button" className="btn btn-sm" onClick={askRepair} data-testid="settings-broken-ask" {...window.gate("approve", "ask for a repair")}>{W.ask}</button>}
          </FailedRead>
        </section>
      </>
    );
  }
  if (connected && editing) {
    return (
      <>
        <BusinessEditor settings={settings} flash={flash} onDone={() => setEditing(false)} />
      </>
    );
  }
  return (
  <>
    <FactConflicts />
    <section className="fl-card set-card">
      <div className="fl-card-head"><span className="fl-card-title">Business</span>
        {/* Who last changed it and when, from the row itself (00085): the one
            audit question a workspace with three people eventually asks. */}
        {real && window.__lastChanged && window.__lastChanged() ? <span className="fl-card-sub">{window.__lastChanged()}</span> : null}
        {/* On real data this opens the form. The mockup's compose flow asked
            an assistant to update details it had no way to write. */}
        {real
          ? <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} {...window.gate("settings")}><Icon name="edit" size={11} /> Edit</button>
          : unconfigured
            /* No Edit here. This form cannot create a receptionist — it edits
               the profile ON one, and the required identity fields
               (business_name, phone_display, booking_link, fallbacks) are not
               among the ones it collects. Offering the button would spend a
               click to reach a rejected save. */
            ? null
            : <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout({ mode: "compose", prompt: "Update our business details: " })}><Icon name="edit" size={11} /> Edit</button>}
      </div>
      {unconfigured ? (
        <>
          <EmptyState kind="card" glyph="agents" title="This workspace has no receptionist yet" body="Nothing has been set up for it — no business name, no phone line, no booking link — so nothing is answering your customers yet." action={{ label: "Set up the receptionist", onClick: () => setEditing(true), gate: window.gate("settings") }} />
          {/* The timezone is the workspace's, not the receptionist's: it decides what "today" means on every page from
              the first day, and it could not be reached until a receptionist existed (S13). */}
          <div className="cl-prof-attr-list"><TimezoneRow flash={flash} /></div>
        </>
      ) : (
      <div className="cl-prof-attr-list">
        {real
          ? <FactRow label="Name" fact={F.business_name} />
          : <div className="cl-prof-attr"><span className="cl-prof-attr-key">Name</span><span className="cl-prof-attr-val">Serenity Spa</span></div>}
        <div className="cl-prof-attr"><span className="cl-prof-attr-key">Workspace</span><span className="cl-prof-attr-val">{real ? ((ws && ws.name) || "—") : "Chanlytics Sales · Professional"}</span></div>
        <div className="cl-prof-attr"><span className="cl-prof-attr-key">Hours</span>
          <span className="cl-prof-attr-val" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {real
              ? (hrs || <span className="set-team-mail">Not set — the receptionist cannot state your hours</span>)
              : "Mon–Sun · 9:00 AM – 6:00 PM"}
            {!real && (
              <button className="cl-bucket-link" title="Availability rules live on the Calendar" onClick={() => window.CHANLY.nav("calendar")}>
                Edit on Calendar <Icon name="arrow-right" size={10} />
              </button>
            )}
          </span>
        </div>
        {real && <TimezoneRow flash={flash} />}
        {/* THREE numbers, named for what each one does. They were one row
            called "Phone line" showing a typed string, which is how a salon
            came to publish the number it transfers to as the number to call.
            The line it answers is provisioned and belongs to Connections; the
            other two are the receptionist's behaviour, so they are edited HERE,
            in the row that states them -- they used to be sections nine and
            thirteen of a fourteen-section form, a page apart from each other
            and from the card that reads them. */}
        {real ? (
          <>
            <FactRow label="Answers on" fact={F.voice_line} to="admin/integrations" toLabel="Connections" empty="No phone line yet" show={phoneShown} />
            <PublishedNumberRow fact={F.phone_display} flash={flash} />
            <HandoffRow fact={F.handoff_number} flash={flash} />
          </>
        ) : (
          <div className="cl-prof-attr"><span className="cl-prof-attr-key">Phone line</span><span className="cl-prof-attr-val">+1 (415) 555-0100</span></div>
        )}
        {real ? (
          <div className="cl-prof-attr"><span className="cl-prof-attr-key">Booking link</span><span className="cl-prof-attr-val">{S.booking_link || "—"}</span></div>
        ) : (
          <div className="cl-prof-attr"><span className="cl-prof-attr-key">Staff</span><span className="cl-prof-attr-val">Lena Park · Jay Rivera</span></div>
        )}
        {real && F.address.value && <FactRow label="Address" fact={F.address} />}
        {real && profile && profile.services && profile.services.length > 0 && (
          <div className="cl-prof-attr"><span className="cl-prof-attr-key">Services</span>
            <span className="cl-prof-attr-val">{profile.services.length} on record · {profile.services.slice(0, 3).map((x) => x.name).join(", ")}{profile.services.length > 3 ? "…" : ""}</span>
          </div>
        )}
      </div>
      )}
      {/* Every workspace starts here, so this is not a footnote. A faint
          Edit link in a card header is findable by someone who already knows
          the form exists; the first thing an owner needs is to be told there
          is something to fill in, and given the button. */}
      {real && !profile && (
        <EmptyState kind="card" glyph="edit" title="Tell the receptionist about your business" body="Your hours, services and address are still written inside the assistant's instructions, as prose. Fill them in as fields and the WhatsApp receptionist answers from them within a minute — and the phone agent reads the same ones, once it has been pointed at them." action={{ label: "Add your business details", onClick: () => setEditing(true), gate: window.gate("settings") }} />
      )}
    </section>
    {real && <PromptPreview />}
    {real && <WorkspaceData />}
  </>
  );
};

/**
 * What the receptionist is actually told.
 *
 * Every other card here shows what an owner TYPED. This one shows what their
 * customers' receptionist receives, which had been true of nothing in the
 * product: the fields are composed, the workspace's older instructions are
 * carried in beneath them, guardrails are appended, and the result was visible
 * only by reading the source.
 *
 * That gap cost a live salon. Filling in the hours silently swapped a
 * 5,000-character prompt for a 700-character one; the composed hours then
 * disagreed with the prose right below them about Sunday. Both would have been
 * obvious at a glance. Neither was glanceable.
 *
 * Not a mock-up of the prompt — window.__composedPrompt reads what the settings
 * read composed with the SAME function the edge runs, from the same saved
 * config and the same inputs (the autonomy rows, the platform's facts, the
 * closures, the calendar's openings).
 */
const PromptPreview = () => {
  const [open, setOpen] = useSetState(false);
  const [channel, setChannel] = useSetState("whatsapp");
  const composed = window.__composedPrompt ? window.__composedPrompt(channel) : null;
  if (!composed) return null;
  const CHANNELS = [["whatsapp", "WhatsApp"], ["voice", "Phone"]];
  return (
    <section className="fl-card set-card">
      <div className="fl-card-head">
        <span className="fl-card-title">What your receptionist is told</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
          <Icon name={open ? "chevron-up" : "chevron-down"} size={11} /> {open ? "Hide" : "Show"}
        </button>
      </div>
      <div className="set-prompt-meta">
        {/* The number is the point: a prompt that halves is a prompt that lost
            something, and it is the only signal that reads at a glance. */}
        <span className="set-prompt-count">{composed.text.length.toLocaleString()} characters</span>
        <span className="set-prompt-sep">·</span>
        <span>{channel === "voice"
          ? "every phone call, composed when the call starts"
          : "every WhatsApp message, word for word"}</span>
      </div>
      {open && (
        <>
          <div className="set-prompt-tabs" role="tablist">
            {CHANNELS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={channel === id}
                className={`set-prompt-tab ${channel === id ? "on" : ""}`}
                onClick={() => setChannel(id)}
              >{label}</button>
            ))}
          </div>
          <pre className="set-prompt-body">{composed.text}</pre>
          <div className="set-prompt-now">
            <div className="set-prompt-now-label">
              Sent alongside it, rebuilt for every message
              {composed.tz ? <> · {composed.tz}</> : null}
            </div>
            {/* Shown separately because it IS sent separately — folding a value
                that changes every minute into the block above would throw away
                the prompt cache on every message. */}
            <pre className="set-prompt-body set-prompt-body-sm">{composed.now}</pre>
          </div>
        </>
      )}
    </section>
  );
};

const PaneAutonomy = ({ flash }) => {
  const S = window.ST_STORE;
  const [spend, setSpendState] = useSetState(() => S.get("spend", "Ask always"));
  const [quiet, setQuietState] = useSetState(() => S.get("quiet", "9pm–8am"));
  const [outreach, setOutreachState] = useSetState(() => S.get("outreach", "Draft only"));
  const [esc, setEscState] = useSetState(() => S.get("esc", "Push + SMS"));
  const [, setTick] = useSetState(0);

  // One wiring for all defaults: store + toast + undo
  const mkDefault = (key, label, setState) => (v, opts = {}) => {
    const prev = S.get(key, null) ?? { spend: "Ask always", quiet: "9pm–8am", outreach: "Draft only", esc: "Push + SMS" }[key];
    if (prev === v) return;
    setState(v);
    S.set(key, v);
    if (!opts.silent) flash({
      msg: <><b>{label}</b> → {v} — applies to every agent unless Fleet overrides</>,
      undo: () => { setState(prev); S.set(key, prev); },
    });
  };
  const setSpend = mkDefault("spend", "Spending without asking", setSpendState);
  const setQuiet = mkDefault("quiet", "Quiet hours", setQuietState);
  const setOutreach = mkDefault("outreach", "New-client outreach", setOutreachState);
  const setEsc = mkDefault("esc", "Escalation channel", setEscState);

  // Guardrails write back to the shared seed — Fleet chips cite these values
  const setGuard = (g, v) => {
    const prev = g.value;
    if (prev === v) return;
    g.value = v;
    setTick(n => n + 1);
    window.dispatchEvent(new CustomEvent("guardrails:changed", { detail: { segId: g.segId, value: v } }));
    const s = (window.CLIENT_SEGMENTS || []).find(x => x.id === g.segId);
    flash({
      msg: <><b>{g.label}</b> → {v} for “{s ? s.label : g.segId}” — playbooks touching this list follow it</>,
      undo: () => {
        g.value = prev;
        setTick(n => n + 1);
        window.dispatchEvent(new CustomEvent("guardrails:changed", { detail: { segId: g.segId, value: prev } }));
      },
      links: [{ label: "See it in Fleet", to: "fleet" }],
    });
  };

  return (
    <>
      <PolicyMatrix />

      <section className="fl-card set-card">
        <div className="fl-card-head">
          <span className="fl-card-title">Defaults for every agent</span>
          <span className="fl-card-sub">Per-agent rules in Fleet override these</span>
        </div>
        <SetRow label="Quiet hours" hint="Outreach and bells pause — safe FAQ replies still send, so the <1 min SLA holds">
          <SetSeg value={quiet} options={["Off", "9pm–8am", "10pm–7am"]} onChange={setQuiet} />
        </SetRow>
        <SetRow label="New-client outreach" hint="First contact with someone new">
          <SetSeg value={outreach} options={["Draft only", "Auto"]} onChange={setOutreach} />
        </SetRow>
        <VetoModeRow />
        <SetRow label="Booking hours" hint="The free/busy windows every agent books within">
          <button className="btn btn-sm" onClick={() => window.CHANLY.nav("calendar")}>
            <Icon name="calendar" size={12} /> Edit on Calendar
          </button>
        </SetRow>
        <SetRow label="Escalation channel" hint="How agents reach you when paused">
          <SetSeg value={esc} options={["Push", "SMS", "Push + SMS"]} onChange={setEsc} />
        </SetRow>
      </section>
      <section className="fl-card set-card">
        <div className="fl-card-head">
          <span className="fl-card-title">Per-segment guardrails</span>
          <span className="fl-card-sub">Rules that follow the list, not the agent</span>
        </div>
        {(window.SEG_GUARDRAILS || []).map(g => {
          const s = (window.CLIENT_SEGMENTS || []).find(x => x.id === g.segId);
          if (!s) return null;
          return (
            <SetRow key={g.segId} label={g.label} hint={g.hint}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <button className="seg-chip" title={`Open “${s.label}” in Segments`} onClick={() => window.CHANLY.nav(window.CHANLY.R.segment(g.segId))}>
                  <Icon name="sparkle" size={10} /> {s.label} · {s.count}
                </button>
                <SetSeg value={g.value} options={g.options} onChange={(v) => setGuard(g, v)} />
              </span>
            </SetRow>
          );
        })}
      </section>
      <section className="fl-card set-card">
        <div className="fl-card-head"><span className="fl-card-title">Hard limits</span><span className="fl-card-sub">Never crossed, regardless of autonomy</span></div>
        <ul className="st-bullets">
          <li><Icon name="check" size={11} /><span>Complaints, medical topics, and HR-sensitive threads always escalate</span></li>
          <li><Icon name="check" size={11} /><span>No agent contacts a client who asked to stop</span></li>
          <li><Icon name="check" size={11} /><span>Discounts above 15% require your approval</span></li>
        </ul>
      </section>
    </>
  );
};

// ====== Real branch — Settings · Autonomy on the workspace's policies table ======
// Same cards and classes as the seeded pane. Every row is a class with an
// enforcer -- the receptionist (replies, questions, bookings), the playbooks
// (re-engage, offers), the review sweep, and for money a database trigger --
// so every switch shown is one something honours, offering only the modes it
// honours. The three dials write the reply row's limits through one route.
// The limits card shows the runtime's actual numbers: two the charter's,
// two this workspace's own.

const AUT_DELAYS = [["15s", 15000], ["30s", 30000], ["1m", 60000], ["2m", 120000], ["5m", 300000]];
// The confidence dial. Under Auto, a reply the receptionist is less sure
// about than this waits in the hold window for a person. Off sends everything.
const AUT_CONF = [["Off", 0], ["60%", 0.6], ["75%", 0.75], ["90%", 0.9]];
// The day's model budget: tokens in and out over a rolling 24 hours, from
// the usage events every reply writes. Over it the receptionist stops for
// the day and each new message lands in Needs you, as at the reply cap.
// The route and the edge already honoured it; this is its handle.
const AUT_BUDGET = [["Off", 0], ["100k", 100000], ["250k", 250000], ["500k", 500000], ["1M", 1000000]];
// The two hard limits that are the owner's to set (S6): automatic replies to one person in 24 hours before the
// receptionist stops and asks, and the hours it stays out of a conversation once a person steps in. Steps inside what
// the route accepts (1 to 200, 1 to 168); a value stored off these steps shows as a step of its own, never as a wrong one.
const AUT_CAP = [["10", 10], ["20", 20], ["40", 40], ["100", 100]];
const AUT_PAUSE = [["1h", 1], ["4h", 4], ["12h", 12], ["24h", 24], ["3d", 72]];
const withStep = (steps, value, label) => (steps.some((s) => s[1] === value) ? steps : [...steps, [label, value]].sort((a, b) => a[1] - b[1]));
const AUT_MODE_HINT = {
  Auto: "sends right away",
  Veto: "writes the reply, waits, then sends unless you stop it",
  Ask: "waits for you before anything is sent",
  Never: "stays silent",
};

const PaneAutonomyReal = ({ flash }) => {
  const [, tick] = useSetState(0);
  React.useEffect(() => {
    const bump = () => tick((n) => n + 1);
    window.addEventListener("policy:changed", bump);
    window.addEventListener("surface:settings", bump);
    return () => { window.removeEventListener("policy:changed", bump); window.removeEventListener("surface:settings", bump); };
  }, []);
  const [busy, setBusy] = useSetState(null);

  if (window.__POLICIES === null) {
    return (
      <FailedRead kind="card" title="Your autonomy settings couldn't be loaded" body="The receptionist keeps running on the settings it already has; this page just can't show them right now." surface="settings" testid="policies-failed" />
    );
  }

  const rows = window.POLICY.ROWS;
  const MODES = window.POLICY.MODES;
  const reply = rows.find((r) => r.id === "reply");
  const limits = (reply && reply.limits) || {};
  const delayMs = Number(limits.reply_delay_ms) || 30000;
  const delayLabel = (AUT_DELAYS.find((d) => d[1] === delayMs) || [`${Math.round(delayMs / 1000)}s`])[0];
  // The hard limits in contracts' words, which say each default (hardLimitsWords, through the bridge), and the value
  // each of the owner's two dials shows: the stored one, or the default.
  const hard = window.__hardLimits(limits);
  const capSteps = withStep(AUT_CAP, hard.cap, String(hard.cap));
  const pauseSteps = withStep(AUT_PAUSE, hard.hours, `${hard.hours}h`);
  const capLabel = capSteps.find((s) => s[1] === hard.cap)[0];
  const pauseLabel = pauseSteps.find((s) => s[1] === hard.hours)[0];
  const minConf = Number(limits.min_confidence) || 0;
  const confLabel = (AUT_CONF.find((c) => c[1] === minConf) || [`${Math.round(minConf * 100)}%`])[0];
  const budget = Number(limits.max_llm_tokens_day) || 0;
  const budgetLabel = (AUT_BUDGET.find((b) => b[1] === budget) || [`${Math.round(budget / 1000)}k`])[0];

  // One dial at a time, and never the mode with it (the bridge's PolicyDials).
  const put = async (r, mode, dials = {}) => {
    if (!window.__setPolicy) return;
    setBusy(r.cls);
    const res = await window.__setPolicy(r.cls, mode, dials);
    setBusy(null);
    if (!res.ok) { flash({ tone: "danger", msg: <><b>Not changed</b> — {res.message}</> }); return; }
    const { replyDelayMs, minConfidence, maxTokensDay, maxRepliesDay, pauseHours } = dials;
    flash({
      msg: replyDelayMs !== undefined
        ? <><b>Hold window</b> → {(AUT_DELAYS.find((d) => d[1] === replyDelayMs) || [`${replyDelayMs / 1000}s`])[0]} — from the next reply</>
        : minConfidence !== undefined
          ? <><b>Confidence dial</b> → {(AUT_CONF.find((c) => c[1] === minConfidence) || [`${Math.round(minConfidence * 100)}%`])[0]} — from the next reply</>
          : maxTokensDay !== undefined
            ? <><b>Day's model budget</b> → {(AUT_BUDGET.find((b) => b[1] === maxTokensDay) || [`${Math.round(maxTokensDay / 1000)}k`])[0]} — from the next reply</>
            : maxRepliesDay !== undefined
              ? <><b>Reply cap</b> → {maxRepliesDay} automatic replies to one person in 24 hours — from the next reply</>
              : pauseHours !== undefined
                ? <><b>Stays out after a person steps in</b> → {(AUT_PAUSE.find((p) => p[1] === pauseHours) || [`${pauseHours}h`])[0]} — from the next time someone steps in</>
                : <><b>{r.label}</b> → {mode.charAt(0).toUpperCase() + mode.slice(1)} — from the next message</>,
    });
  };

  return (
    <>
      <section className="fl-card set-card">
        <div className="fl-card-head">
          <span className="fl-card-title">Policy matrix</span>
          <span className="fl-card-sub">What the receptionist may do without you — every row here is one the receptionist consults</span>
        </div>
        <table className="pol-table">
          <thead><tr><th>Action class</th>{MODES.map((m) => <th key={m} className="pol-mode" title={AUT_MODE_HINT[m]}>{m}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              return (
                <tr key={r.id} className={r.locked ? "pol-locked" : ""}>
                  <td>
                    <span className="pol-label">{r.label}</span>
                    <span className="pol-note">{r.note}</span>
                    {r.locked && <span className="pol-evidence">Locked by charter — enforced in the database</span>}
                  </td>
                  {MODES.map((m) => (
                    <td key={m} className="pol-cell">
                      {(r.locked && m !== "Never") || (r.modes && !r.modes.includes(m)) ? <span className="pol-dash" title={r.locked ? "Charter — fixed" : m === "Veto" ? "Nothing to hold for review here" : "Answered by the receptionist or by you — there is no never"}>—</span> : (
                        <button
                          className={`pol-dot ${r.mode === m ? "on" : ""}`}
                          title={r.locked ? "Charter — fixed" : (r.hints && r.hints[m]) || AUT_MODE_HINT[m]}
                          disabled={r.locked || busy === r.cls}
                          onClick={() => put(r, m.toLowerCase())}
                          {...window.gate("autonomy")}
                        >
                          {r.mode === m ? <Icon name={r.locked ? "shield" : "check"} size={11} /> : ""}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="fl-card set-card">
        <div className="fl-card-head">
          <span className="fl-card-title">Reply timing and budget</span>
          <span className="fl-card-sub">The hold window applies under Veto, and under Auto for a reply below the confidence dial; the budget stops the receptionist for the day</span>
        </div>
        <SetRow label="Hold window" hint="The receptionist writes its reply and waits this long before sending, so you can stop or change it from the Inbox. A booking link a caller asks for on the phone is texted right away — there is nothing to hold.">
          <SetSeg
            gate={window.gate("autonomy")}
            value={delayLabel}
            options={AUT_DELAYS.map((d) => d[0])}
            onChange={(v) => { const d = AUT_DELAYS.find((x) => x[0] === v); if (d && reply) put(reply, undefined, { replyDelayMs: d[1] }); }}
          />
        </SetRow>
        <SetRow label="Send on its own only when it's sure" hint="Under Auto, a reply the receptionist is less sure about than this waits in the hold window for you instead of going straight out. Off sends everything, and so does a reply with no confidence on record.">
          <SetSeg
            gate={window.gate("autonomy")}
            value={confLabel}
            options={AUT_CONF.map((c) => c[0])}
            onChange={(v) => { const c = AUT_CONF.find((x) => x[0] === v); if (c && reply) put(reply, undefined, { minConfidence: c[1] }); }}
          />
        </SetRow>
        <SetRow label="Day's model budget" hint="Model tokens the receptionist may use in a rolling 24 hours, in and out. Over it, it stops answering for the day and each new message lands in Needs you. Off is no budget.">
          <SetSeg
            gate={window.gate("autonomy")}
            value={budgetLabel}
            options={AUT_BUDGET.map((b) => b[0])}
            onChange={(v) => { const b = AUT_BUDGET.find((x) => x[0] === v); if (b && reply) put(reply, undefined, { maxTokensDay: b[1] }); }}
          />
        </SetRow>
      </section>

      <section className="fl-card set-card">
        <div className="fl-card-head"><span className="fl-card-title">Hard limits</span><span className="fl-card-sub">{hard.sub}</span></div>
        <ul className="st-bullets">
          <li><Icon name="check" size={11} /><span>Never messages a customer who asked to stop</span></li>
          <li><Icon name="check" size={11} /><span>Refunds, rates and negotiation always go to you — locked in the database</span></li>
        </ul>
        {/* The last two were Chanlytics' and could not be changed here (S6): the owner's dials now, through the same door as the three above. */}
        <SetRow label="Replies to one person in 24 hours" hint={hard.replies}>
          <SetSeg
            gate={window.gate("autonomy")}
            value={capLabel}
            options={capSteps.map((s) => s[0])}
            onChange={(v) => { const s = capSteps.find((x) => x[0] === v); if (s && reply) put(reply, undefined, { maxRepliesDay: s[1] }); }}
            data-testid="aut-reply-cap"
          />
        </SetRow>
        <SetRow label="Stays out after a person steps in" hint={hard.pause}>
          <SetSeg
            gate={window.gate("autonomy")}
            value={pauseLabel}
            options={pauseSteps.map((s) => s[0])}
            onChange={(v) => { const s = pauseSteps.find((x) => x[0] === v); if (s && reply) put(reply, undefined, { pauseHours: s[1] }); }}
            data-testid="aut-pause"
          />
        </SetRow>
      </section>
    </>
  );
};

const PaneIntegrations = ({ flash }) => {
  const [, setTick] = useSetState(0);
  const gmailFixed = window.INT_STORE.isFixed("gmail");
  const items = [
    { id: "retell",    name: "Retell Voice", desc: "Live calls, transcription, take-over", icon: "phone", status: "connected" },
    { id: "instagram", name: "Instagram", desc: "DMs for Chat Agent", icon: "instagram", status: "connected" },
    { id: "gcal",      name: "Google Calendar", desc: "Bookings & availability · two-way", icon: "calendar", status: "connected" },
    { id: "ical",      name: "Apple Calendar", desc: "iCal two-way sync", icon: "calendar", status: "connected" },
    { id: "stripe",    name: "Stripe", desc: "Payments, deposits, refunds", icon: "money", status: "connected" },
    { id: "twilio",    name: "Twilio SMS", desc: "Reminders & offers", icon: "chat", status: "connected" },
    { id: "gmail",     name: "Gmail", desc: "Email Agent sending", icon: "mail", status: gmailFixed ? "connected" : "attention" },
  ];
  const healthy = items.filter(i => i.status === "connected").length;

  const reauthorize = () => {
    window.INT_STORE.fix("gmail");
    setTick(n => n + 1);
    flash({
      msg: <><b>Gmail reconnected</b> — Email Agent is releasing Noah's day-14 nurture</>,
      links: [{ label: "See it in Tasks", to: "tasks" }],
    });
  };

  return (
    <section className="fl-card set-card">
      <div className="fl-card-head">
        <span className="fl-card-title">Connected services</span>
        <span className="fl-card-sub">
          {healthy === items.length ? `${items.length} of ${items.length} healthy` : `${healthy} of ${items.length} healthy · 1 needs attention`}
        </span>
      </div>
      {items.map(it => (
        <div key={it.id} className="set-int-row">
          <span className="st-tile installed set-int-tile"><Icon name={it.icon} size={14} /></span>
          <span className="set-team-body">
            <span className="set-team-name">{it.name}</span>
            <span className="set-team-mail">{it.desc}</span>
          </span>
          {it.status === "connected"
            ? <span className="pill pill-ok"><span className="dot" />Connected</span>
            : <>
                <span className="pill pill-warn">Reauthorize by May 1</span>
                <button className="btn btn-sm" onClick={reauthorize}>Reauthorize</button>
              </>}
        </div>
      ))}
    </section>
  );
};

// ====== Real branch — Settings · Integrations on tenant_channels ======
// The seeded pane listed seven "connected" services that do not exist. The
// real one lists the numbers this workspace is reachable on, from the table
// the webhooks route by, and names the rest as not available yet.

const SET_MEMORY_SEED = [
  { k: "Refund policy", v: "One waiver per quarter — used by Phone Rep on Aisha's request", src: "Learned Feb 14", srcTo: "inbox/th-aisha-refund", uses: 14, impact: "+$820 attributed", tone: "ok" },
  { k: "Holiday pricing", v: "Couples 90 carries a $60 weekend surcharge", src: "Set Apr 26 · from Jordan's booking", srcTo: "calendar/a-jordan", uses: 2, impact: "+$120 attributed", tone: "ok" },
  { k: "Client preference", v: "Maya Rodriguez prefers Lena, Tuesday mornings", src: "Learned from 18 visits", srcTo: "clients/c-maya", uses: 18, impact: "Books 2× faster", tone: "ok" },
  { k: "Discount ceiling", v: "Nothing above 15% without asking Sarah", src: "Set Mar 3", uses: 3, impact: "Blocked 2 bad discounts", tone: "ok" },
  { k: "Referral rule", v: "Member-referred leads may get the referrer's rate", src: "Learned Apr 26 · Jordan ↔ Maya", srcTo: "inbox/th-jordan-discount", uses: 1, impact: "Low impact so far — new", tone: "low" },
];

const PaneMemory = ({ flash }) => {
  const [entries, setEntries] = useSetState(() => [...SET_MEMORY_SEED]);
  const forget = (e, i) => {
    setEntries(list => list.filter(x => x.k !== e.k));
    flash({
      msg: <><b>“{e.k}”</b> forgotten — agents fall back to playbook defaults for this</>,
      undo: () => setEntries(list => {
        const next = [...list];
        next.splice(Math.min(i, next.length), 0, e);
        return next;
      }),
    });
  };
  return (
    <section className="fl-card set-card">
      <div className="fl-card-head">
        <span className="fl-card-title">What your agents remember</span>
        <button className="btn btn-sm" onClick={() => window.askAbout({
          prompt: "Teach the agents something new",
          answer: "Tell me the rule or fact — a price, a client preference, a policy — and I'll store it in AI memory with provenance, so every agent applies it and you can see its impact.",
          links: [{ label: "AI memory", to: "admin/memory" }],
        })}><Icon name="plus" size={12} /> Teach something</button>
      </div>
      {entries.map((e, i) => (
        <div key={e.k} className="set-mem-row">
          <span className="set-mem-k">{e.k}</span>
          <span className="set-team-body">
            <span className="set-mem-v">{e.v}</span>
            <span className="set-team-mail">
              {e.srcTo
                ? <button className="lm-link" title="Open the source" onClick={() => window.CHANLY.nav(e.srcTo)}>{e.src}</button>
                : e.src}
              {e.uses ? ` · used ${e.uses}×` : ""}
            </span>
            {e.impact && (
              <span className={`set-mem-impact ${e.tone || ""}`}>
                <Icon name={e.tone === "low" ? "alert" : "trending-up"} size={10} />
                {e.impact}
              </span>
            )}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => forget(e, i)}>Forget</button>
        </div>
      ))}
      {entries.length === 0 && <div className="cv-empty">Memory cleared — agents fall back to playbook defaults.</div>}
    </section>
  );
};

const SET_NOTIF_KEY = "chanlytics-notif-prefs";
const setLoadNotif = () => {
  try {
    const raw = localStorage.getItem(SET_NOTIF_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { approvals: true, brief: true, sms: true, segments: true, weekly: false, milestones: false };
};

const PaneNotifications = () => {
  const [n, setN] = useSetState(setLoadNotif);
  const set = (k) => (v) => setN(s => {
    const next = { ...s, [k]: v };
    try { localStorage.setItem(SET_NOTIF_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  });
  const followed = (() => {
    try {
      const raw = localStorage.getItem("chanlytics-seg-notify");
      if (raw) return Object.values(JSON.parse(raw)).filter(Boolean).length;
    } catch (e) {}
    return 0;
  })();
  return (
    <section className="fl-card set-card">
      <div className="fl-card-head"><span className="fl-card-title">When to interrupt you</span></div>
      <SetRow label="Approval requests" hint="Push the moment an agent pauses something">
        <SetToggle on={n.approvals} onChange={set("approvals")} />
      </SetRow>
      <SetRow label="Morning brief" hint="Daily at 8:00 AM">
        <SetToggle on={n.brief} onChange={set("brief")} />
      </SetRow>
      <SetRow label="Escalations via SMS" hint="Complaints and HR-sensitive, even in quiet hours">
        <SetToggle on={n.sms} onChange={set("sms")} />
      </SetRow>
      <SetRow label="Segment entry & exit" hint={<>You follow {followed} list{followed === 1 ? "" : "s"} — <button className="lm-link" onClick={() => window.CHANLY.nav("segments")}>manage in Segments</button></>}>
        <SetToggle on={n.segments} onChange={set("segments")} />
      </SetRow>
      <SetRow label="Weekly report email" hint="Sundays, the Reports page in your inbox">
        <SetToggle on={n.weekly} onChange={set("weekly")} />
      </SetRow>
      <SetRow label="Agent milestones" hint="e.g. an agent earning auto-approval">
        <SetToggle on={n.milestones} onChange={set("milestones")} />
      </SetRow>
    </section>
  );
};

// ====== Real branch — Settings · Notifications on the workspace's own config ======
// The seeded pane is six toggles in localStorage with nothing behind them. The
// real one is what the system actually does: it emails the addresses in
// notifications.escalation_emails, for the kinds of alert the edge really
// sends, and nothing else. No toggle is offered that no code reads.

const NOTIF_KINDS = [
  { title: "A customer needs a person", what: "The receptionist stopped on a WhatsApp thread and someone is waiting. The alert carries their message." },
  { title: "Still waiting", what: "Nobody has answered a customer for a while after a handoff." },
  { title: "After every phone call", what: "A summary of the call: who, how long, how it went." },
  { title: "A reply failed to send", what: "The receptionist wrote an answer and the channel refused it." },
  // The last two are platform alerts: a switched-off number has no workspace
  // to address, and a stalled sweep belongs to nobody's workspace. They go to
  // Chanlytics. Listing them beside "goes to each of these addresses" without
  // saying so promised an owner an email they will never receive.
  { title: "Messages arriving for a switched-off number", what: "Someone is texting a channel this workspace has disabled. Goes to Chanlytics, not to the addresses above — a switched-off number has no workspace to alert.", platform: true },
  { title: "Background checks", what: "When the watchdog that re-checks unanswered threads stops running, and when it recovers. Goes to Chanlytics, not to the addresses above.", platform: true },
];

const PaneNotificationsReal = ({ flash }) => {
  const [, tick] = useSetState(0);
  React.useEffect(() => {
    const bump = () => tick((n) => n + 1);
    window.addEventListener("surface:settings", bump);
    return () => window.removeEventListener("surface:settings", bump);
  }, []);
  const [email, setEmail] = useSetState("");
  const [busy, setBusy] = useSetState(false);

  const settings = window.__SETTINGS;
  const cfg = (settings && settings.config) || {};
  const notif = cfg.notifications || {};
  const emails = Array.isArray(notif.escalation_emails) ? notif.escalation_emails : [];
  // Who may change who is alerted: the one gate, in contracts' words. It asked
  // `__ME.role`, blind to an owner's View-as preview, and put the reason in a
  // title on disabled controls that no keyboard or finger reaches.
  const may = window.canDo("settings");
  const gated = window.gate("settings", "change who is alerted");
  // A save here writes the WHOLE config it read. When the config could not be
  // read, what it read is {} — and saving would replace the broken row with
  // one holding nothing but these addresses.
  const broken = !!(settings && settings.broken);
  const lockTitle = broken
    ? "This workspace's settings can't be read — Chanlytics has to repair them before anything here can change"
    : undefined;

  const save = (nextEmails, msg, undo = null) => {
    if (!window.__saveSettings || !settings) return;
    const next = { ...cfg, notifications: { ...notif, escalation_emails: nextEmails } };
    setBusy(true);
    window.__saveSettings(next, settings.version, () => { setBusy(false); flash({ msg, undo }); })
      .then((r) => { if (r.ok) return; setBusy(false); flash({ tone: "danger", msg: <>{r.message}</> }); });
  };
  const add = () => {
    const v = email.trim().toLowerCase();
    if (!ST_EMAIL_RE.test(v)) { flash({ tone: "warn", msg: <>That doesn't look like an email address.</> }); return; }
    if (emails.includes(v)) { setEmail(""); return; }
    if (emails.length >= 10) { flash({ tone: "warn", msg: <>Up to ten addresses can be alerted.</> }); return; }
    setEmail("");
    save([...emails, v], <><b>{v}</b> will be alerted from the next escalation</>);
  };
  // Reversible, so it is not armed: the toast offers the address back.
  const remove = (v) => save(emails.filter((e) => e !== v), <><b>{v}</b> removed — no more alerts to that address</>, () => save(emails, <><b>{v}</b> is alerted again</>));

  return (
    <>
      <section className="fl-card set-card" data-testid="notif-recipients">
        <div className="fl-card-head">
          <span className="fl-card-title">Who gets alerted</span>
          <span className="fl-card-sub">Each alert below goes to each of these addresses, except the two marked for Chanlytics</span>
        </div>
        {emails.length === 0 && (
          <div className="set-row">
            <div className="set-row-info">
              <span className="set-row-label">Nobody yet</span>
              <span className="set-row-hint">Until an address is added, the platform operator receives a notice that this workspace needs attention — without the customer's message, which is withheld rather than sent to a stranger.</span>
            </div>
          </div>
        )}
        {emails.map((e) => (
          <div className="set-row" key={e}>
            <div className="set-row-info"><span className="set-row-label">{e}</span></div>
            {/* Removing an address is an item's own act: out of sight for a role
                that may not, and the card says why once, below. */}
            {may && (
              <button
                className="btn btn-ghost btn-sm"
                disabled={broken || busy || emails.length <= 1}
                title={emails.length <= 1 ? "At least one address must stay — the receptionist has to be able to reach someone" : lockTitle}
                onClick={() => remove(e)}
              >
                <Icon name="x" size={11} /> Remove
              </button>
            )}
          </div>
        ))}
        <div className="set-row">
          <div className="set-row-info" style={{ flex: 1 }}>
            <input
              className="sd-input"
              type="email"
              placeholder="owner@yourbusiness.com"
              value={email}
              disabled={broken || busy}
              title={lockTitle}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              aria-label="Add an address to alert"
              {...gated}
            />
          </div>
          <button className="btn btn-primary btn-sm" disabled={broken || busy || !email.trim()} title={lockTitle} onClick={add} {...gated}>
            {busy ? "Saving…" : "Add"}
          </button>
        </div>
        {!may && (
          <div className="set-row"><div className="set-row-info"><span className="set-row-hint" data-testid="notif-gated"><Icon name="shield" size={11} /> {window.gateTitle("settings", "change who is alerted")}</span></div></div>
        )}
      </section>

      <section className="fl-card set-card" data-testid="notif-kinds">
        <div className="fl-card-head">
          <span className="fl-card-title">What you'll get</span>
          <span className="fl-card-sub">The alerts the receptionist actually sends — by email, as they happen</span>
        </div>
        {NOTIF_KINDS.map((k) => (
          <div className="set-row" key={k.title}>
            <div className="set-row-info">
              <span className="set-row-label">{k.title}{k.platform && <span className="pill set-notif-platform">to Chanlytics</span>}</span>
              <span className="set-row-hint">{k.what}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="fl-card set-card">
        <div className="fl-card-head"><span className="fl-card-title">How</span></div>
        <ul className="st-bullets">
          {/* The bell's device alerts are real (notifications.ts: a browser notification while the app is open in the
              background), so "push notifications are not built" denied a switch one click away (S20). */}
          <li><Icon name="check" size={11} /><span>By email, the moment it happens. While Chanlytics is open in your browser, that browser can alert you too when something needs you — switch alerts on from the bell. There are no text-message alerts.</span></li>
          <li><Icon name="check" size={11} /><span>Sent from {notif.from ? <b>{notif.from}</b> : "the Chanlytics alert address"}{notif.from ? "" : " until your own sending domain is verified"}.</span></li>
          <li><Icon name="check" size={11} /><span>No daily brief or weekly report goes out yet; Today is the brief.</span></li>
        </ul>
      </section>
    </>
  );
};

const PaneBilling = ({ flash }) => {
  // Single source — stat cells, bar, Ask answers, and the breakdown all derive from this
  const BILLING = window.__BILLING = window.__BILLING || {
    plan: "Professional",
    agentsIncluded: 8,
    creditsTotal: 8000,
    creditsUsed: 2650,
    topup: 0,                 // session top-ups
    cycleElapsed: 0.31,       // Apr 26 of a Feb 1 → Aug 1 cycle
    renews: "Aug 1",
  };
  const [, setTick] = useSetState(0);
  const total = BILLING.creditsTotal + BILLING.topup;
  const left = total - BILLING.creditsUsed;
  const usedPct = Math.round((BILLING.creditsUsed / total) * 100);
  const expectedPct = Math.round(BILLING.cycleElapsed * 100);
  const ahead = usedPct > expectedPct + 3;

  // Per-agent spend — same rows Reports uses (RP_AGENTS), one source of truth
  const agents = ((window.REPORTS_DATA || {}).RP_AGENTS || [])
    .filter(a => a.credits > 0)
    .map(a => ({ ...a, share: a.credits / Math.max(1, ((window.REPORTS_DATA || {}).RP_AGENTS || []).reduce((s, x) => s + x.credits, 0)), roi: a.revenue > 0 ? a.revenue / a.credits : 0 }))
    .sort((a, b) => b.credits - a.credits);

  const topup = (n) => {
    if (!window.canDo("billing")) return;
    BILLING.topup += n;
    setTick(t => t + 1);
    window.dispatchEvent(new CustomEvent("billing:changed", { detail: { topup: BILLING.topup } }));
    flash({
      msg: <><b>+{n.toLocaleString()} credits</b> added — {(total + n - BILLING.creditsUsed).toLocaleString()} now available this cycle</>,
      undo: () => { BILLING.topup -= n; setTick(t => t + 1); window.dispatchEvent(new CustomEvent("billing:changed", { detail: { topup: BILLING.topup } })); },
    });
  };

  const INVOICES = [
    { id: "inv-apr", date: "Apr 1, 2026", label: "Professional · monthly", amount: "$99.00", status: "Paid" },
    { id: "inv-mar", date: "Mar 1, 2026", label: "Professional · monthly", amount: "$99.00", status: "Paid" },
    { id: "inv-feb", date: "Feb 1, 2026", label: "Professional · monthly + 2,000 credit top-up", amount: "$148.00", status: "Paid" },
  ];

  return (
  <>
    <section className="fl-card set-card">
      <div className="fl-card-head"><span className="fl-card-title">Plan & credits</span>
        <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout({
          prompt: "What plan am I on?",
          answer: `${BILLING.plan} — ${BILLING.agentsIncluded} agents included, ${BILLING.creditsTotal.toLocaleString()} credits per cycle${BILLING.topup ? ` (+${BILLING.topup.toLocaleString()} topped up)` : ""}, renewing ${BILLING.renews}. You've used ${BILLING.creditsUsed.toLocaleString()} (${usedPct}%, ${ahead ? "ahead of" : "on"} pace). Plan changes take effect immediately.`,
          links: [{ label: "Billing", to: "admin/billing" }],
        })}>Manage plan</button>
      </div>
      <StatStrip>
        <StatCell label="Plan" value={BILLING.plan} valueSize={14} meta={`${BILLING.agentsIncluded} agents included`} />
        <StatCell label="Credits left" value={left.toLocaleString()} meta={`of ${total.toLocaleString()} · renews ${BILLING.renews}`} />
        <StatCell label="Used this cycle" value={BILLING.creditsUsed.toLocaleString()} meta={`${usedPct}% · ${ahead ? "ahead of pace" : "on pace"}`} metaTone={ahead ? "neg" : "pos"} />
      </StatStrip>
      <div className="set-usage">
        <div className="set-usage-track">
          <div className="set-usage-fill" style={{ width: `${usedPct}%` }} />
          <span className="set-usage-tick" style={{ left: `${expectedPct}%` }} title={`Expected by today · ${expectedPct}%`} />
        </div>
        <span className="set-usage-note">Tick = expected by today ({expectedPct}%). {agents[0] ? `${agents[0].name} is ${Math.round(agents[0].share * 100)}% of usage.` : ""}</span>
      </div>
      <div className="set-billing-actions">
        <MoreMenu
          btnClass="btn btn-primary btn-sm"
          label="Buy credits"
          title="Top up this cycle"
          gated={window.canDo("billing") ? null : window.gateTitle("billing")}
          items={[
            { header: "One-time top-up" },
            { label: "+1,000 credits · $25", icon: "bolt", onClick: () => topup(1000) },
            { label: "+2,500 credits · $55", icon: "bolt", onClick: () => topup(2500) },
            { divider: true },
            { label: "Talk through options", icon: "sparkle", onClick: () => window.askAbout({
              prompt: "Top up credits",
              answer: `You have ${left.toLocaleString()} of ${total.toLocaleString()} left — ${ahead ? "ahead of" : "on"} pace for the cycle. A one-time top-up covers spikes; if this pace holds every month, the plan bump is the cheaper path.`,
              links: [{ label: "Billing", to: "admin/billing" }],
            }) },
          ]}
        />
        <button className="btn btn-sm" onClick={() => window.CHANLY.nav("reports")}>See return per credit <Icon name="arrow-right" size={11} /></button>
      </div>
    </section>

    <section className="fl-card set-card">
      <div className="fl-card-head">
        <span className="fl-card-title">Spend by agent</span>
        <span className="fl-card-sub">this cycle · same numbers as Reports</span>
      </div>
      {agents.map(a => (
        <button key={a.id} className="set-int-row set-spend-row" onClick={() => window.CHANLY.nav(window.CHANLY.R.agent(a.id))}>
          <span className="agent-avatar" style={{ width: 22, height: 22, fontSize: 10 }}>{a.glyph}</span>
          <span className="set-team-body">
            <span className="set-team-name">{a.name}</span>
            <span className="set-team-mail">{a.credits.toLocaleString()} credits · {Math.round(a.share * 100)}% of usage</span>
          </span>
          <span className={`tabular set-spend-roi ${a.roi >= 2 ? "ok" : ""}`}>{a.roi > 0 ? `${a.roi.toFixed(1)}× return` : "—"}</span>
          <Icon name="arrow-right" size={11} style={{ color: "var(--ink-faint)" }} />
        </button>
      ))}
    </section>

    <section className="fl-card set-card">
      <div className="fl-card-head">
        <span className="fl-card-title">Invoices</span>
        <span className="fl-card-sub">receipts land at sales@chanlytics.com</span>
      </div>
      {INVOICES.map(inv => (
        <div key={inv.id} className="set-int-row">
          <span className="st-tile installed set-int-tile"><Icon name="money" size={14} /></span>
          <span className="set-team-body">
            <span className="set-team-name">{inv.date}</span>
            <span className="set-team-mail">{inv.label}</span>
          </span>
          <span className="tabular" style={{ fontSize: 12.5, fontWeight: 500 }}>{inv.amount}</span>
          <span className="pill pill-ok"><Icon name="check" size={9} /> {inv.status}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout({
            prompt: `Show the ${inv.date} invoice`,
            answer: `${inv.date} — ${inv.label}, ${inv.amount}, paid via card on file. I can resend the PDF to sales@chanlytics.com or export the full year.`,
          })}>View</button>
        </div>
      ))}
    </section>
  </>
  );
};

// ---------- Page ----------
// ---------- Not built yet: AI memory, said in the pane (Billing is real: billing-real.jsx) ----------
// Outside a demo these two tabs used to fall through the shell's gate, which
// replaced the WHOLE settings page with a bare card titled "billing" and a
// "Back to Today" button — the owner lost the settings nav for clicking a tab.
// They are panes like the others now: they say what is true, keep the nav, and
// point at the pane that holds what exists instead.
const SET_SOON = {
  memory: {
    title: "AI memory",
    chip: "Not built yet",
    body: "The receptionist does not learn rules on its own yet. Everything it knows comes from Business: the business details, hours, services, notes and the extra instructions saved there.",
    action: { label: "Open Business", tab: "workspace", icon: "home" },
  },
};

const PaneSoon = ({ which, onTab }) => {
  const m = SET_SOON[which];
  return (
    <section className="fl-card set-card" data-testid={`soon-${which}`}>
      <div className="fl-card-head"><span className="fl-card-title">{m.title}</span><span className="fl-card-sub">{m.chip}</span></div>
      <div className="set-row">
        <div className="set-row-info"><span className="set-row-hint">{m.body}</span></div>
        {m.action && (
          <button className="btn btn-sm" onClick={() => onTab(m.action.tab)}><Icon name={m.action.icon} size={12} /> {m.action.label}</button>
        )}
      </div>
    </section>
  );
};

const SettingsPage = ({ tab = "workspace", onTab = () => {} }) => {
  const active = SET_TAB(tab);
  const [toastNode, flash] = window.usePPToast();
  // The tab asked for while a pane holds unsaved changes (the business editor registers __settingsUnsaved): the rail
  // asks before the pane, and the changes with it, are replaced (S22).
  const [leaving, setLeaving] = React.useState(null);
  const go = (id) => {
    if (id !== active.id && window.__settingsUnsaved && window.__settingsUnsaved()) { setLeaving(id); return; }
    onTab(id);
  };
  // Grouped, and derived rather than written twice: the rail can only ever
  // offer what SET_TABS holds, in the order it holds it.
  const groups = [...SET_TABS, ...(isPlatformAdmin() ? SET_TABS_PLATFORM : [])].reduce((acc, t) => {
    const g = acc[acc.length - 1];
    if (g && g.name === t.group) g.tabs.push(t); else acc.push({ name: t.group, tabs: [t] });
    return acc;
  }, []);
  return (
    <div className="settings">
      <aside className="set-nav">
        <div className="fl-roster-head"><span className="fl-roster-label">Settings</span></div>
        {groups.map(g => (
          <React.Fragment key={g.name}>
            <div className="set-nav-group">{g.name}</div>
            {g.tabs.map(t => (
              <button key={t.id} className={`fl-agent set-nav-row ${active.id === t.id ? "active" : ""}`} aria-current={active.id === t.id ? "page" : undefined} onClick={() => go(t.id)}>
                <Icon name={t.icon} size={14} />
                <span className="set-nav-label">{t.label}</span>
              </button>
            ))}
          </React.Fragment>
        ))}
      </aside>
      <div className="set-pane" key={active.id}>
        {leaving && (
          <Confirm question="Leave without saving?" detail="The changes in the business editor have not been saved." yes="Yes, leave" no="Stay" danger onYes={() => { const to = leaving; setLeaving(null); onTab(to); }} onNo={() => setLeaving(null)} testid="set-leave" />
        )}
        {active.id === "profile" && <PaneProfile flash={flash} />}
        {active.id === "team" && <TeamSection flash={flash} />}
        {active.id === "setup" && window.PaneSetup && <window.PaneSetup />}
        {active.id === "workspace" && <PaneWorkspace flash={flash} />}
        {active.id === "autonomy" && (window.__POLICIES === undefined ? <PaneAutonomy flash={flash} /> : <PaneAutonomyReal flash={flash} />)}
        {active.id === "integrations" && (window.__CHANNELS === undefined ? <PaneIntegrations flash={flash} /> : <window.PaneIntegrationsReal />)}
        {active.id === "memory" && (window.__SETTINGS === undefined ? <PaneMemory flash={flash} /> : <PaneSoon which="memory" onTab={onTab} />)}
        {active.id === "notifications" && (window.__SETTINGS === undefined ? <PaneNotifications /> : <PaneNotificationsReal flash={flash} />)}
        {active.id === "billing" && (window.__SETTINGS === undefined ? <PaneBilling flash={flash} /> : <window.PaneBillingReal flash={flash} />)}
        {active.id === "platform" && window.PanePlatform && <window.PanePlatform />}
        {active.id === "activity" && window.PaneActivity && <window.PaneActivity />}
      </div>

      {toastNode}
    </div>
  );
};

window.SettingsPage = SettingsPage;
window.SET_TABS = SET_TABS;
window.SET_TABS_PLATFORM = SET_TABS_PLATFORM; // the rail above decides who sees it
window.SET_TAB = SET_TAB; // the shell's crumb, and so the tab's name, names the pane by this same rule
window.SetToggle = SetToggle; // consumed by calendar.jsx + reports.jsx (module-scope port fix)
window.WorkspaceData = WorkspaceData; // rendered on its own by exports.test (the door the privacy page promises)
window.TeamSection = TeamSection; // rendered on its own by confirm.test (the remove that used to fire from a menu item)

// The booking-rule keys the Business editor edits, the slot length among them
// since it has a field of its own (S2). Everything else stored under
// booking_rules -- a rule added later -- is kept by a save rather than rebuilt
// away: the editor used to start the rules from {} and deleted slot_min every
// time an owner pressed Save.
const SET_EDITED_RULES = ["lead_hours", "buffer_min", "max_days_ahead", "party_max", "slot_min", "consult_first", "notes"];
function settingsRulesKept(saved) {
  return Object.fromEntries(Object.entries(saved || {}).filter(([k]) => !SET_EDITED_RULES.includes(k)));
}
window.settingsRulesKept = settingsRulesKept; // run on its own by settings-save-keeps-rules.test
