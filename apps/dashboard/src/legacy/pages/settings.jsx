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
  partner:  { approve: true,  autonomy: true,  disconnect: true,  billing: false, team: false, settings: true,  export: false },
  viewer:   { approve: false, autonomy: false, disconnect: false, billing: false, team: false, settings: false, export: false },
};
// A person's own hue, from the address they are known by: the same two letters
// on the same disc, but one of them is theirs.
const stHue = (seed) => { const s = String(seed || ""); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
const ST_ROLE_META = {
  owner:    { label: "Owner",    can: "Everything — billing, team, and disconnecting channels" },
  operator: { label: "Operator", can: "Approves decisions and tunes autonomy — not billing or team" },
  partner:  { label: "Partner",  can: "Sets up and runs the receptionist for you — not billing or team" },
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
  // A partner's account and link (0012): the offer for everyone else. On the account, like Profile.
  { id: "partner",       label: "Partner",       icon: "users",    group: "You" },
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
  // A pane whose read is worth starting when the pointer or the keyboard
  // reaches its tab: by the time the click lands, its rows are in hand. The
  // reads share one request with the pane's own (client/api.ts) and no-op once
  // the answer is cached, so this costs nothing a visit was not going to spend.
  { id: "activity",      label: "Activity",      icon: "clock",    group: "Workspace", warm: () => window.__activity && window.__activity.warm && window.__activity.warm({}) },
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
const SET_TABS_PLATFORM = [{ id: "platform", label: "Back office", icon: "monitor", group: "Chanlytics", warm: () => window.__platform && window.__platform.warmList && window.__platform.warmList() }];
const isPlatformAdmin = () => !!(window.__ME && window.__ME.platform_admin);
const SET_TAB = (id) =>
  SET_TABS.find((t) => t.id === id)
  || (isPlatformAdmin() ? SET_TABS_PLATFORM.find((t) => t.id === id) : null)
  || SET_TABS_UNLISTED.find((t) => t.id === id)
  || SET_TABS[0];

// The rest (window.propsWithout, never an object rest: legacy CLAUDE.md) carries the aria-labelledby SetRow hands down.
const SetToggle = (props) => (
  <button className={`set-switch ${props.on ? "on" : ""}`} role="switch" aria-checked={props.on} onClick={() => props.onChange(!props.on)} {...window.propsWithout(props, ["on", "onChange"])}>
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
const SetRow = ({ label, hint, note, children }) => {
  const labelId = React.useId();
  const named = React.Children.map(children, (kid) => (
    React.isValidElement(kid) && !kid.props["aria-label"] && !kid.props["aria-labelledby"]
      ? React.cloneElement(kid, { "aria-labelledby": labelId })
      : kid
  ));
  return (
    <div className="set-row">
      <div className="set-row-info">
        <span className="set-row-label" id={labelId}>
          {label}
          {note && (
            <button
              type="button"
              className="set-mark"
              data-tip={note}
              aria-label={`About ${label}: ${note}`}
              onClick={(e) => { if (window.__tip) window.__tip.show(e.currentTarget); }}
            ><Icon name="info" size={12} /></button>
          )}
        </span>
        {hint && <span className="set-row-hint">{hint}</span>}
      </div>
      <div className="set-row-control">{named}</div>
    </div>
  );
};

const SetSeg = (props) => {
  // role=group so the label SetRow supplies has something to name; the buttons
  // inside stay plain buttons, which is what they already were. `gate` is
  // window.gate(...)'s props, on every option -- a dial a role may not turn says
  // why when pressed, where it used to take the press and show the server's
  // refusal -- and it stays off the group, which gets everything else it is given.
  const { value, options, onChange, gate = null } = props, group = window.propsWithout(props, ["value", "options", "onChange", "gate"]);
  return (
    <div className="cl-tabs" role="group" {...group}>
      {options.map(o => (
        <button key={o} className={`cl-tab ${value === o ? "active" : ""}`} onClick={() => onChange(o)} {...(gate || {})}>{o}</button>
      ))}
    </div>
  );
};

/**
 * A dial of a few steps (the hold window, the confidence, the budget, the reply cap, the pause): the segmented control
 * on a desktop, and on a phone its value as a word that opens a menu of the steps, as the policy's rows do there
 * (PolPhoneRows). Five of them put a 50px strip of 44px buttons under every label, 110px a row (25 Sep). Hookless:
 * the pane says which it is, from the one `useSetPhone` it reads.
 */
const SetDial = (props) => {
  const { phone = false, value, options, onChange, gate = null, label = "" } = props, rest = window.propsWithout(props, ["phone", "value", "options", "onChange", "gate", "label"]);
  if (!phone) return <SetSeg value={value} options={options} onChange={onChange} gate={gate} {...rest} />;
  const gated = gate && gate["aria-disabled"] ? gate["data-tip"] : null;
  return (
    <MoreMenu
      items={options.map((o) => ({ label: o, checked: value === o, onClick: () => onChange(o) }))}
      label={value}
      title={label ? `${label}: ${value}` : value}
      btnClass="bt-link set-dial"
      align="right"
      escape
      gated={gated}
      testid={rest["data-testid"] || null}
    />
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

// A mode's words, said where they are needed rather than hidden in a hover.
// `Auto | Veto | Ask | Never` are filing words — the plain sentence for each one
// existed only as a tip on the heading, which a phone cannot trigger at all. The
// heading is the sentence now: a verb and the one clause that tells it apart.
// One source (window.POLICY.WORDS → contracts POLICY_MODE_WORDS).
const polMode = (m) => ((window.POLICY.WORDS || {})[m] || { head: m, sub: "", does: m });
const PolModeHead = ({ m }) => {
  const w = polMode(m);
  return (
    <span className="pol-mode-words">
      <span className="pol-mode-head">{w.head}</span>
      {w.sub && <span className="pol-mode-sub">{w.sub}</span>}
    </span>
  );
};

// A locked row is not a row with one box ticked: it is a rule, and it says so.
// Money was three dashes and a grey tick under "Never" — and once the headings
// say what a mode DOES, "Stays quiet · nothing happens" is the one thing that is
// not true of it. The charter's own words go across the columns instead, so
// there is nothing to press and nothing to misread.
const PolLockedCells = ({ span, note }) => (
  <td className="pol-fixed" colSpan={span}>
    <span className="pol-fixed-words">
      <Icon name="shield" size={12} />
      <span><b>{note}</b> — locked by charter, enforced in the database.</span>
    </span>
  </td>
);

// Whether the pane is a phone's, at Settings' own breakpoint (mobile.css, 640px), kept current as the window changes
// size, as the record kit reads its own (record-fold.jsx useRecPhone). Read whatever the pane draws, so a pane holds
// the same hooks at either width.
const SET_PHONE_QUERY = "(max-width: 640px)";
const useSetPhone = () => {
  const q = () => (typeof window.matchMedia === "function" ? window.matchMedia(SET_PHONE_QUERY) : null);
  const [phone, setPhone] = React.useState(() => { const m = q(); return !!(m && m.matches); });
  React.useEffect(() => {
    const m = q();
    if (!m || !m.addEventListener) return undefined;
    const on = (e) => setPhone(!!e.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
};

/**
 * The matrix on a phone (24 Sep): one line per action class, its mode as a word that opens a menu of the modes the
 * class takes, each saying what it does. The table of four columns collapsed into four captioned dots under every
 * label there -- 107px a row, the four captions repeated seven times down the screen. A locked class says so and
 * opens nothing. A desktop keeps the matrix, where four columns read at a glance. Hookless but for the menus.
 */
const PolPhoneRows = ({ rows, MODES, put, busy }) => (
  <div className="pol-phone" data-testid="pol-phone">
    {rows.map((r) => {
      const g = window.gate("autonomy");
      const gated = busy === r.cls ? "Saving — wait for this one to land." : g["aria-disabled"] ? g["data-tip"] : null;
      return (
        <div key={r.id} className="set-row pol-phone-row" data-testid={`pol-phone-${r.id}`}>
          <div className="set-row-info">
            <span className="set-row-label">
              {r.label}
              {r.note && !r.locked && (
                <button
                  type="button"
                  className="set-mark"
                  data-tip={r.note}
                  aria-label={`What each mode does for ${r.label}: ${r.note}`}
                  onClick={(e) => { if (window.__tip) window.__tip.show(e.currentTarget); }}
                ><Icon name="info" size={12} /></button>
              )}
            </span>
            {r.locked ? <span className="set-row-hint pol-phone-locked"><Icon name="shield" size={11} /> {r.note} — locked by charter</span> : null}
          </div>
          {r.locked ? null : (
            <div className="set-row-control">
              <MoreMenu
                items={MODES.filter((m) => !r.modes || r.modes.includes(m)).map((m) => ({
                  label: polMode(m).head,
                  hint: (r.hints && r.hints[m]) || polMode(m).does,
                  checked: r.mode === m,
                  onClick: () => put(r, m.toLowerCase()),
                }))}
                label={polMode(r.mode).head}
                title={`${r.label}: ${polMode(r.mode).head}`}
                btnClass="bt-link pol-phone-mode"
                align="right"
                escape
                gated={gated}
                testid={`pol-phone-mode-${r.id}`}
              />
            </div>
          )}
        </div>
      );
    })}
  </div>
);

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
        <h2 className="fl-card-title">Policy matrix</h2>
        <span className="fl-card-sub">What agents may do, per action class — the ruleset the backend enforces</span>
      </div>
      <table className="pol-table">
        <thead><tr><th>Action class</th>{POL_MODES.map((m) => <th key={m} className="pol-mode"><PolModeHead m={m} /></th>)}</tr></thead>
        <tbody>
          {POL_ROWS.map((r) => (
            <tr key={r.id} className={r.locked ? "pol-locked" : ""}>
              <td><span className="pol-label">{r.label}</span><span className="pol-note">{r.note}</span>{window.TRUST && window.TRUST.cls(r.id) && <span className="pol-evidence">{window.TRUST.cls(r.id).sent.toLocaleString()} auto-sent · {window.TRUST.rate(window.TRUST.cls(r.id))}% edited · 30d</span>}</td>
              {r.locked ? <PolLockedCells span={POL_MODES.length} note={r.note} /> : POL_MODES.map((m) => (
                <td key={m} className="pol-cell" data-mode={polMode(m).head}>
                  <button className={`pol-dot ${modeOf(r) === m ? "on" : ""}`} title={polMode(m).does} onClick={() => set(r, m)} {...window.gate("autonomy")}>{modeOf(r) === m ? <Icon name="check" size={11} /> : ""}</button>
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
const YourName = ({ flash }) => {
  const me = window.__ME || {};
  const stored = me.display_name || "";
  // The record kit's row and inline editor (components/record-row.jsx, record-fold.jsx), as the Business tab edits a
  // value where it is stated: the row says the name, Change opens the box on the row's own line, Enter saves, Esc
  // cancels, and the registry keeps one editor open. It was a box always drawn, with a Save that appeared beside it.
  const [draft, setDraft] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const live = React.useRef({ draft: null, stored, busy: false });
  live.current.stored = stored;
  live.current.busy = busy;
  const fold = window.useRecordFold("profile-name", {
    dirty: () => live.current.draft != null && live.current.draft.trim() !== live.current.stored,
    saving: () => live.current.busy,
  });
  const now = draft == null ? stored : draft;
  const set = (v) => { live.current.draft = v; setDraft(v); };
  const close = () => { live.current.draft = null; setDraft(null); fold.close(); };
  const save = async () => {
    if (busy) return;
    if (now.trim() === stored) { close(); return; }
    setBusy(true);
    const r = await window.__me.setName(now);
    setBusy(false);
    if (!r.ok) { flash({ tone: "danger", msg: <>{r.message}</> }); return; }
    close();
    flash({ msg: r.name ? <>You&rsquo;re <b>{r.name}</b> to your team now.</> : <>Name cleared — your email stands in.</> });
  };
  return (
    <>
      {fold.open ? null : (
        <window.RecordRow
          id="profile-name"
          label="Name"
          value={stored || null}
          empty="Your email stands in"
          act={{ label: stored ? "Change" : "Add one", name: stored ? "Change your name" : "Add one: your name", onClick: () => fold.request(), testid: "set-you-change" }}
        />
      )}
      <window.RecordInline id="profile-name" label="Name" open={fold.open} onSave={save} onCancel={close} saving={busy}>
        <window.RecordField
          id="set-you-name"
          label={null}
          aria-labelledby="rec-inline-profile-name-key"
          value={now}
          onChange={set}
          maxLength={80}
          placeholder="How your team sees you"
          readOnly={busy || undefined}
          data-testid="set-you-name"
          testid="set-you"
        />
      </window.RecordInline>
    </>
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
// The old Business card's rows went with the card (Task 3.7): a fact with where it came from, the two numbers the
// receptionist decides and the workspace's timezone are rows of the Business page now, each edited where it is
// stated (pages/business-tab-who.jsx, pages/business-tab-open.jsx), over the page's own saver
// (pages/business-tab-save.jsx). window.phoneShown lives there too.

const PaneProfile = ({ flash }) => {
  const me = window.__ME || {};
  const words = window.__identity ? window.__identity.words(me) : { name: me.display_name || "Your account", email: me.email || "" };
  const role = ST_ROLE_META[me.role] || null;
  const signOut = () => {
    if (window.__DEMO_MODE || !window.__shell) { flash({ msg: <>Nothing to sign out of in the demo.</> }); return; }
    window.__shell.signOut();
  };
  // One card of the record kit's rows (24 Sep): the name, edited on its row; the address you signed in with, whose
  // act goes to the sign-in page's password reset; your role, with what it may do as the row's hint (a desktop's;
  // a phone reads the word); and the sign-out, a press inside its row rather than the row's act, since a whole row
  // that signs you out everywhere is one stray tap too many. It was two cards, each row a label, a sentence and a
  // control, 736px for four facts. The avatar, the name, the address and the role pill were a block above rows that
  // say the same four things -- and the sidebar's own footer says three of them a third time.
  return (
    <section className="rec-card set-profile" data-testid="set-profile" aria-labelledby="set-profile-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="set-profile-title">You</h2>
        <span className="rec-card-sub">How your team sees you, and how you signed in.</span>
      </div>
      <YourName flash={flash} />
      <window.RecordRow
        id="profile-email"
        label="Signed in as"
        value={words.email || null}
        empty="No address"
        act={{ label: "Change password", name: "Change your password, from the sign-in page", icon: "arrow-right", onClick: () => { window.location.assign("/reset-password"); }, testid: "set-profile-password" }}
      />
      {role && (
        <window.RecordRow id="profile-role" label="Role" value={role.label} hint={role.can} />
      )}
      {/* Named for what it does. "This device" sat over a sign-out that ends every session on every device:
          /auth/signout revokes them all (S20). */}
      <window.RecordRow
        id="profile-signout"
        label="Sign out"
        value={<button type="button" className="bt-link" onClick={signOut} data-testid="set-profile-signout">Sign out everywhere</button>}
        hint="Ends your session on every device, this one included."
      />
      <DeleteAccountRow flash={flash} />
    </section>
  );
};

// Delete your own account (00190; App Store 5.1.1(v)): two steps on the row itself, the sentence saying what goes and
// what stays, then the one button; the door's refusal (the only owner of a workspace with other members) said where
// it happened. Drawn on the web and in the app alike: a rule that only the app needs is still the account's.
const DeleteAccountRow = ({ flash }) => {
  const [armed, setArmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [refused, setRefused] = React.useState("");
  const go = async () => {
    if (window.__DEMO_MODE || !window.__me || !window.__me.deleteAccount) { flash({ msg: <>Nothing to delete in the demo.</> }); return; }
    setBusy(true);
    const r = await window.__me.deleteAccount();
    setBusy(false);
    if (!r.ok) setRefused(r.message || "Your account could not be deleted.");
  };
  return (
    <window.RecordRow
      id="profile-delete"
      label="Delete account"
      value={
        armed ? (
          <span className="set-delete-confirm" data-testid="set-profile-delete-confirm">
            <button type="button" className="bt-link bt-danger" onClick={go} disabled={busy} data-testid="set-profile-delete-go">
              {busy ? "Deleting…" : "Yes, delete my account"}
            </button>
            {" · "}
            <button type="button" className="bt-link" onClick={() => setArmed(false)} disabled={busy}>Keep it</button>
          </span>
        ) : (
          <button type="button" className="bt-link" onClick={() => setArmed(true)} data-testid="set-profile-delete">Delete my account…</button>
        )
      }
      hint={
        refused
          ? refused
          : armed
            ? "Removes you from every workspace and deletes your sign-in. A workspace you alone were in keeps its records for the business."
            : "Yours to do here, any time. A workspace with other members needs another owner first."
      }
    />
  );
};

// A teammate's role is a name, not a state (tone.ts `role` is plain): the one chip, in the words contracts keeps for it.
const RolePill = ({ role }) => <span className="chip" data-role={role}>{window.__chrome && window.__chrome.state ? window.__chrome.state("role", role).label : role}</span>;

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
        <h2 className="fl-card-title">Team</h2>
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
          <span className="set-viewas-label" id="set-viewas-label">View as</span>
          <div className="cl-tabs" role="group" aria-labelledby="set-viewas-label">
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
            <span className="avatar set-team-face" aria-hidden="true" style={{ "--who-h": stHue(m.email || m.name) }}>{m.displayName !== undefined ? window.__identity.initials(m.displayName, m.email) : stInitials(m.name)}</span>
            <span className="set-team-body">
              <span className="set-team-name">{m.name}{isMe && <> <span className="chip set-team-you">You</span></>}</span>
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
        {["owner", "operator", ...(team.some((m) => m.role === "partner") ? ["partner"] : []), "viewer"].map(r => (
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

// The head of a section of a card: the panes below draw one (Your data's own).
const SetSectionHead = ({ title, hint }) => (
  <div className="set-sec-head">
    <h3 className="set-sec-title">{title}</h3>
    {hint && <span className="set-sec-hint">{hint}</span>}
  </div>
);

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
  // The record kit's card and rows (components/record-row.jsx), as every card of the Business tab above it: it stood
  // apart in the person page's attribute list, the one card on the tab in another shape (23 Sep).
  const Row = window.RecordRow;
  return (
    <section className="rec-card set-data" data-testid="set-data" aria-labelledby="set-data-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="set-data-title">Your data</h2>
        <span className="rec-card-sub">Everything this workspace holds, in one file you keep.</span>
      </div>
      <Row
        id="data-export"
        label="Download everything"
        value={(
          <span className="set-data-val">
            {href && (
              <a className="bt-link" href={href} download data-testid="set-export-all" title="People, conversations, calls and consent history as one JSON file" {...window.gate("export", "download the workspace's data")}>Download (JSON)</a>
            )}
            <button
              type="button"
              className="set-mark"
              data-tip="People, conversations with their messages, calls with their transcripts, and every consent change with who recorded it. Call audio is not included: it is removed on the schedule the privacy policy states, and the transcript is here."
              aria-label="What the file holds: people, conversations with their messages, calls with their transcripts, and every consent change with who recorded it. Call audio is not included: it is removed on the schedule the privacy policy states, and the transcript is here."
              onClick={(e) => { if (window.__tip) window.__tip.show(e.currentTarget); }}
            ><Icon name="info" size={12} /></button>
          </span>
        )}
      />
      <Row
        id="data-delete"
        label="Delete this workspace"
        value={<span className="set-team-mail">Write to <a href="mailto:hi@chanlytics.com">hi@chanlytics.com</a> from the owner's address. Its data is removed within 30 days, as the <a href="/privacy" target="_blank" rel="noreferrer">privacy policy</a> says.</span>}
      />
    </section>
  );
};

const PaneWorkspace = ({ flash }) => {
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
          <div className="fl-card-head"><h2 className="fl-card-title">Business</h2></div>
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
  /**
   * The record: every fact is a row, and a row is edited where it is stated (pages/business-tab.jsx, the spec
   * docs/superpowers/specs/2026-09-20-business-tab-design.md). What stood here was two surfaces that disagreed about
   * what exists -- a card showing nine facts, and a form editing about twenty-five behind one Save -- and one of them
   * had to be opened before the other could be corrected. The page draws the head, who last changed it, the standing
   * line, every row and its editor, and says why once to a role that may not change it. What the receptionist is told
   * is the page's own since Phase 5 (pages/business-tab-prompt.jsx: a told section at rest and the sheet it opens,
   * where PromptPreview's <pre> stood), and the owner's copy of everything is below it.
   */
  if (real) {
    return (
      <>
        {window.BusinessTab ? <window.BusinessTab flash={flash} /> : null}
        <WorkspaceData />
      </>
    );
  }
  /* Nothing set up yet: the empty state, and the fold that sets a receptionist up from it
     (pages/business-tab-create.jsx). Provisioning inserts an EMPTY tenant_config row (migration 00017), so this is
     the first thing every new owner sees. */
  if (unconfigured) return window.BtCreateCard ? <window.BtCreateCard flash={flash} /> : null;
  /* No settings read behind the page at all: the standalone mockup, which draws the demo's business. `real` was
     doing two jobs, and a workspace with no brain fell to this branch and showed a real owner Serenity Spa's
     invented name, phone, therapists and 9-6 seven-day hours, on a surface classified real. */
  return (
    <section className="fl-card set-card">
      <div className="fl-card-head"><h2 className="fl-card-title">Business</h2>
        {/* The mockup's compose flow asks an assistant to update details it has no way to write. */}
        <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout({ mode: "compose", prompt: "Update our business details: " })}><Icon name="edit" size={11} /> Edit</button>
      </div>
      <div className="cl-prof-attr-list">
        <div className="cl-prof-attr"><span className="cl-prof-attr-key">Name</span><span className="cl-prof-attr-val">Serenity Spa</span></div>
        <div className="cl-prof-attr"><span className="cl-prof-attr-key">Workspace</span><span className="cl-prof-attr-val">Chanlytics Sales · Professional</span></div>
        <div className="cl-prof-attr"><span className="cl-prof-attr-key">Hours</span>
          <span className="cl-prof-attr-val" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Mon–Sun · 9:00 AM – 6:00 PM
            <button className="cl-bucket-link" title="Availability rules live on the Calendar" onClick={() => window.CHANLY.nav("calendar")}>
              Edit on Calendar <Icon name="arrow-right" size={10} />
            </button>
          </span>
        </div>
        <div className="cl-prof-attr"><span className="cl-prof-attr-key">Phone line</span><span className="cl-prof-attr-val">+1 (415) 555-0100</span></div>
        <div className="cl-prof-attr"><span className="cl-prof-attr-key">Staff</span><span className="cl-prof-attr-val">Lena Park · Jay Rivera</span></div>
      </div>
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
          <h2 className="fl-card-title">Defaults for every agent</h2>
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
          <h2 className="fl-card-title">Per-segment guardrails</h2>
          <span className="fl-card-sub">Rules that follow the list, not the agent</span>
        </div>
        {(window.SEG_GUARDRAILS || []).map(g => {
          const s = (window.CLIENT_SEGMENTS || []).find(x => x.id === g.segId);
          if (!s) return null;
          return (
            <SetRow key={g.segId} label={g.label} hint={g.hint}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <button className="chip" title={`Open “${s.label}” in Segments`} onClick={() => window.CHANLY.nav(window.CHANLY.R.segment(g.segId))}>
                  <Icon name="sparkle" size={10} /> {s.label} · {s.count}
                </button>
                <SetSeg value={g.value} options={g.options} onChange={(v) => setGuard(g, v)} />
              </span>
            </SetRow>
          );
        })}
      </section>
      <section className="fl-card set-card">
        <div className="fl-card-head"><h2 className="fl-card-title">Hard limits</h2><span className="fl-card-sub">Never crossed, regardless of autonomy</span></div>
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
// The words for a mode are polMode() above — contracts' POLICY_MODE_WORDS
// through window.POLICY.WORDS. There is no second map here: the four sentences
// this file used to keep were the ones hidden in the column's hover.

const PaneAutonomyReal = ({ flash }) => {
  const [, tick] = useSetState(0);
  React.useEffect(() => {
    const bump = () => tick((n) => n + 1);
    window.addEventListener("policy:changed", bump);
    window.addEventListener("surface:settings", bump);
    return () => { window.removeEventListener("policy:changed", bump); window.removeEventListener("surface:settings", bump); };
  }, []);
  const [busy, setBusy] = useSetState(null);
  const phone = useSetPhone();

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
                // The confirmation says what will happen, in the words the heading just used.
                : <><b>{r.label}</b> → {polMode(mode.charAt(0).toUpperCase() + mode.slice(1)).head.toLowerCase()} — from the next message</>,
    });
  };

  return (
    <>
      <section className="fl-card set-card">
        <div className="fl-card-head">
          <h2 className="fl-card-title">Policy matrix</h2>
          <span className="fl-card-sub">What it may do without you. Every row is one it consults before acting.</span>
        </div>
        {phone ? <PolPhoneRows rows={rows} MODES={MODES} put={put} busy={busy} /> : (
        <table className="pol-table">
          <thead><tr><th>Action class</th>{MODES.map((m) => <th key={m} className="pol-mode"><PolModeHead m={m} /></th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              return (
                <tr key={r.id} className={r.locked ? "pol-locked" : ""}>
                  <td>
                    <span className="pol-label">
                      {r.label}
                      {/* A locked row carries its note across the columns instead — said once. */}
                      {r.note && !r.locked && (
                        <button
                          type="button"
                          className="set-mark"
                          data-tip={r.note}
                          aria-label={`What each mode does for ${r.label}: ${r.note}`}
                          onClick={(e) => { if (window.__tip) window.__tip.show(e.currentTarget); }}
                        ><Icon name="info" size={12} /></button>
                      )}
                    </span>
                  </td>
                  {r.locked ? <PolLockedCells span={MODES.length} note={r.note} /> : MODES.map((m) => (
                    <td key={m} className="pol-cell" data-mode={polMode(m).head}>
                      {r.modes && !r.modes.includes(m) ? <span className="pol-dash" title={m === "Veto" ? "Nothing to hold for review here" : "Answered by the receptionist or by you — there is no never"}>—</span> : (
                        <button
                          className={`pol-dot ${r.mode === m ? "on" : ""}`}
                          aria-label={`${r.label}: ${polMode(m).head}`}
                          aria-pressed={r.mode === m}
                          title={(r.hints && r.hints[m]) || polMode(m).does}
                          disabled={busy === r.cls}
                          onClick={() => put(r, m.toLowerCase())}
                          {...window.gate("autonomy")}
                        >
                          {r.mode === m ? <Icon name="check" size={11} /> : ""}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </section>

      <section className="fl-card set-card">
        <div className="fl-card-head">
          <h2 className="fl-card-title">Reply timing and budget</h2>
          <span className="fl-card-sub">The hold window applies under Veto, and under Auto below the confidence dial.</span>
        </div>
        <SetRow label="Hold window" note="How long a reply waits before it sends, so you can stop or change it from the Inbox. A booking link asked for on the phone goes out at once.">
          <SetDial
            phone={phone}
            label="Hold window"
            gate={window.gate("autonomy")}
            value={delayLabel}
            options={AUT_DELAYS.map((d) => d[0])}
            onChange={(v) => { const d = AUT_DELAYS.find((x) => x[0] === v); if (d && reply) put(reply, undefined, { replyDelayMs: d[1] }); }}
          />
        </SetRow>
        <SetRow label="Send on its own only when it's sure" note="Under Auto, a reply less certain than this waits in the hold window instead of going out. Off sends everything, and so does a reply with no confidence on record.">
          <SetDial
            phone={phone}
            label="Send on its own only when it's sure"
            gate={window.gate("autonomy")}
            value={confLabel}
            options={AUT_CONF.map((c) => c[0])}
            onChange={(v) => { const c = AUT_CONF.find((x) => x[0] === v); if (c && reply) put(reply, undefined, { minConfidence: c[1] }); }}
          />
        </SetRow>
        <SetRow label="Day's model budget" note="Model tokens it may spend in a rolling 24 hours, in and out. Over the budget it stops answering for the day, and every new message lands in Needs you.">
          <SetDial
            phone={phone}
            label="Day's model budget"
            gate={window.gate("autonomy")}
            value={budgetLabel}
            options={AUT_BUDGET.map((b) => b[0])}
            onChange={(v) => { const b = AUT_BUDGET.find((x) => x[0] === v); if (b && reply) put(reply, undefined, { maxTokensDay: b[1] }); }}
          />
        </SetRow>
      </section>

      <section className="fl-card set-card">
        <div className="fl-card-head"><h2 className="fl-card-title">Hard limits</h2><span className="fl-card-sub">{hard.sub}</span></div>
        <ul className="st-bullets">
          <li><Icon name="check" size={11} /><span>Never messages a customer who asked to stop</span></li>
          <li><Icon name="check" size={11} /><span>Refunds, rates and negotiation always go to you — locked in the database</span></li>
        </ul>
        {/* The last two were Chanlytics' and could not be changed here (S6): the owner's dials now, through the same door as the three above. */}
        <SetRow label="Replies to one person in 24 hours" hint={hard.replies}>
          <SetDial
            phone={phone}
            label="Replies to one person in 24 hours"
            gate={window.gate("autonomy")}
            value={capLabel}
            options={capSteps.map((s) => s[0])}
            onChange={(v) => { const s = capSteps.find((x) => x[0] === v); if (s && reply) put(reply, undefined, { maxRepliesDay: s[1] }); }}
            data-testid="aut-reply-cap"
          />
        </SetRow>
        <SetRow label="Stays out after a person steps in" hint={hard.pause}>
          <SetDial
            phone={phone}
            label="Stays out after a person steps in"
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
        <h2 className="fl-card-title">Connected services</h2>
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
        <h2 className="fl-card-title">What your agents remember</h2>
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
      <div className="fl-card-head"><h2 className="fl-card-title">When to interrupt you</h2></div>
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
// sends, and nothing else. No toggle is offered that no code reads. The kinds, grouped (Customers, Reach-outs, To
// Chanlytics), and when each is sent, are contracts' (notification-kinds.ts), through window.__today.

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
          <h2 className="fl-card-title">Who gets alerted</h2>
          <span className="fl-card-sub">Every alert below goes to each of these, except the two marked for Chanlytics.</span>
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
          <h2 className="fl-card-title">What you'll get</h2>
          <span className="fl-card-sub">By email, the moment it happens; the day's reach-out numbers are a line in the bell.</span>
        </div>
        {((window.__today && window.__today.notificationKinds) || []).map((g) => (
          <div className="set-notif-group" key={g.title} data-testid="notif-group">
            <SetSectionHead title={g.title} />
            {g.rows.map((k) => (
              <div className="set-row" key={k.title}>
                <div className="set-row-info">
                  <span className="set-row-label">
                    {k.title}
                    {k.platform && <span className="chip set-notif-platform">to Chanlytics</span>}
                    <button
                      type="button"
                      className="set-mark"
                      data-tip={k.what}
                      aria-label={`When this is sent: ${k.what}`}
                      onClick={(e) => { if (window.__tip) window.__tip.show(e.currentTarget); }}
                    ><Icon name="info" size={12} /></button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="fl-card set-card">
        <div className="fl-card-head"><h2 className="fl-card-title">How</h2></div>
        <ul className="st-bullets">
          {/* The bell's device alerts are real (notifications.ts: a browser notification while the app is open in the
              background), so "push notifications are not built" denied a switch one click away (S20). */}
          <li><Icon name="check" size={11} /><span>Your browser can alert you too while Chanlytics is open in it — switch alerts on from the bell.</span></li>
          <li><Icon name="check" size={11} /><span>Sent from {notif.from ? <b>{notif.from}</b> : "the Chanlytics alert address"}{notif.from ? "" : " until your own sending domain is verified"}.</span></li>
          <li><Icon name="check" size={11} /><span>No text-message alerts, and no daily or weekly email. Today is the brief.</span></li>
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
      <div className="fl-card-head"><h2 className="fl-card-title">Plan & credits</h2>
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
        <h2 className="fl-card-title">Spend by agent</h2>
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
        <h2 className="fl-card-title">Invoices</h2>
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
    body: "The receptionist does not learn rules on its own yet. Everything it knows comes from Business: who you are, when you're open, what you offer, the things it should know and what you tell it in your own words.",
    action: { label: "Open Business", tab: "workspace", icon: "home" },
  },
};

const PaneSoon = ({ which, onTab }) => {
  const m = SET_SOON[which];
  return (
    <section className="fl-card set-card" data-testid={`soon-${which}`}>
      <div className="fl-card-head"><h2 className="fl-card-title">{m.title}</h2><span className="fl-card-sub">{m.chip}</span></div>
      <div className="set-row">
        <div className="set-row-info"><span className="set-row-hint">{m.body}</span></div>
        {m.action && (
          <button className="btn btn-sm" onClick={() => onTab(m.action.tab)}><Icon name={m.action.icon} size={12} /> {m.action.label}</button>
        )}
      </div>
    </section>
  );
};

// The open tab, brought into view. On a phone the rail is one strip that scrolls sideways, and a pane opened by its
// address (a bell's link, Setup's "Open Billing") left its own tab off the screen for every pane past Business. A
// callback ref, not an effect: it runs when a tab becomes the open one and at no other time.
const setTabIntoView = (el) => { if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "center" }); };

const SettingsPage = ({ tab = "workspace", onTab = () => {} }) => {
  const active = SET_TAB(tab);
  const [toastNode, flash] = window.usePPToast();
  // The tab asked for while a pane holds unsaved changes (__settingsUnsaved, which the fold registry alone answers now: the
  // record kit's open fold, whatever pane drew it): the rail asks before the pane, and the changes with it, are replaced (S22).
  // And while a fold's save is out (__settingsSaving, record-fold.jsx) it asks in other words, kept from the moment it
  // asked: "Leave without saving?" is untrue of a change on its way to the server, and a yes never stopped the save.
  const [leaving, setLeaving] = React.useState(null);
  const go = (id) => {
    if (id !== active.id && window.__settingsUnsaved && window.__settingsUnsaved()) {
      setLeaving({ id, saving: !!(window.__settingsSaving && window.__settingsSaving()) });
      return;
    }
    onTab(id);
  };
  // Grouped, and derived rather than written twice: the rail can only ever
  // offer what SET_TABS holds, in the order it holds it.
  const listed = [...SET_TABS, ...(isPlatformAdmin() ? SET_TABS_PLATFORM : [])];
  const groups = listed.reduce((acc, t) => {
    const g = acc[acc.length - 1];
    if (g && g.name === t.group) g.tabs.push(t); else acc.push({ name: t.group, tabs: [t] });
    return acc;
  }, []);
  // A section opened comes in from its side on a phone (settings.css set-slide-*), tapped or swiped: decided as it opens
  // and kept for its life, since the page draws again while it stands (a toast, a save) and a class taken away mid-way
  // stops the slide. The shell's own slide (route-slide-*) never plays here: every section is one mount of this page.
  const opened = React.useRef({ id: null, slide: null });
  if (opened.current.id !== active.id) {
    const was = listed.findIndex((t) => t.id === opened.current.id);
    const at = listed.findIndex((t) => t.id === active.id);
    opened.current = { id: active.id, slide: was < 0 || at < 0 ? null : at > was ? "next" : "prev" };
  }
  const slide = opened.current.slide;
  return (
    <div className="settings">
      {/* On a phone the sections are every page's strip (components.css .stabs): the words alone, the one open underlined
          in the accent, and a swipe across the pane walks them (surface-tabs.jsx stripSwipe). The desk keeps its rail. */}
      <nav className="stabs stabs-settings" aria-label="Settings sections">
        {listed.map((t) => (
          <button
            key={t.id}
            type="button"
            ref={active.id === t.id ? setTabIntoView : undefined}
            className={`stabs-tab${active.id === t.id ? " active" : ""}`}
            aria-current={active.id === t.id ? "page" : undefined}
            onPointerEnter={t.warm}
            onFocus={t.warm}
            onClick={() => go(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <aside className="set-nav">
        <div className="fl-roster-head"><span className="fl-roster-label">Settings</span></div>
        {groups.map(g => (
          <React.Fragment key={g.name}>
            <div className="set-nav-group">{g.name}</div>
            {g.tabs.map(t => (
              <button
                key={t.id}
                ref={active.id === t.id ? setTabIntoView : undefined}
                className={`fl-agent set-nav-row ${active.id === t.id ? "active" : ""}`}
                aria-current={active.id === t.id ? "page" : undefined}
                onPointerEnter={t.warm}
                onFocus={t.warm}
                onClick={() => go(t.id)}
              >
                <Icon name={t.icon} size={14} />
                <span className="set-nav-label">{t.label}</span>
              </button>
            ))}
          </React.Fragment>
        ))}
      </aside>
      <div className={`set-pane${slide ? ` set-slide-${slide}` : ""}`} key={active.id}>
        {leaving && (
          <Confirm
            question={leaving.saving ? "Leave while this saves?" : "Leave without saving?"}
            detail={leaving.saving
              ? "Your change is on its way and carries on without this page. If it does not go through you are told, and what you typed is not kept."
              : "Nothing you changed on this tab has been saved."}
            yes="Yes, leave"
            no="Stay"
            danger={!leaving.saving}
            onYes={() => { const to = leaving.id; setLeaving(null); onTab(to); }}
            onNo={() => setLeaving(null)}
            testid="set-leave"
          />
        )}
        {active.id === "profile" && <PaneProfile flash={flash} />}
        {active.id === "partner" && window.PanePartner && <window.PanePartner flash={flash} />}
        {active.id === "team" && <TeamWithPartner flash={flash} />}
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
const TeamWithPartner = ({ flash }) => (window.PanePartner ? <window.PanePartner.Team flash={flash} /> : <TeamSection flash={flash} />); // Team, with its partner card (0020)
window.SettingsPage = SettingsPage;
window.SET_TABS = SET_TABS;
window.SET_TABS_PLATFORM = SET_TABS_PLATFORM; // the rail above decides who sees it
window.SET_TAB = SET_TAB; // the shell's crumb, and so the tab's name, names the pane by this same rule
window.SetToggle = SetToggle; // consumed by demo/pages/calendar.jsx, the Calendar's seeded twin
window.WorkspaceData = WorkspaceData; // rendered on its own by exports.test (the door the privacy page promises)
window.TeamSection = TeamSection; // rendered on its own by confirm.test (the remove that used to fire from a menu item)
window.PaneProfile = PaneProfile; // rendered on its own by settings-doors.test (the account's own deletion, 00190)

// The booking rules a save does not render are kept rather than rebuilt away -- the form started them from {} and
// deleted the slot length on every Save (S2). That rule is the Business page's now, and it is not a helper at all:
// each fold patches only its own keys onto the stored config, so a rule no fold draws cannot be dropped.
// business-tab-folds.test.mjs saves EVERY fold over a record carrying booking_rules.a_rule_added_later and
// profile.a_key_no_form_renders and reads both back.
