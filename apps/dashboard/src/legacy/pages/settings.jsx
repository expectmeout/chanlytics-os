/* global React, Icon, StatStrip, StatCell, Confirm, EmptyState, FailedRead */
// Chanlytics — Settings
// The page (its rail, the phone's strip, the leave guard) and the panes that have not left the shell: Business and AI
// memory. Profile, Team, Autonomy, Connections, Notifications and Billing are TSX (surfaces/settings, decision 0015 step
// 11), drawn below by the names the app publishes for them. Memory Forget is undoable.

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

// ---------- Panes ----------
// The old Business card's rows went with the card (Task 3.7): a fact with where it came from, the two numbers the
// receptionist decides and the workspace's timezone are rows of the Business page now, each edited where it is
// stated (pages/business-tab-who.jsx, pages/business-tab-open.jsx), over the page's own saver
// (pages/business-tab-save.jsx). window.phoneShown lives there too.

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

// ---------- Page ----------
// ---------- Not built yet: AI memory, said in the pane ----------
// Billing, Notifications and Autonomy are real: TSX (surfaces/settings/billing, notifications and autonomy, decision 0015
// step 11), which the app publishes under their old names (PaneBillingReal, PaneNotificationsReal, PaneAutonomyReal) for
// the page below; the standalone mockup has none of them, and their tabs draw nothing there.
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
        {active.id === "profile" && <ProfilePane flash={flash} />}
        {active.id === "partner" && window.PanePartner && <window.PanePartner flash={flash} />}
        {active.id === "team" && <TeamWithPartner flash={flash} />}
        {active.id === "workspace" && <PaneWorkspace flash={flash} />}
        {active.id === "autonomy" && window.PaneAutonomyReal && <window.PaneAutonomyReal flash={flash} />}
        {active.id === "integrations" && window.PaneIntegrationsReal && <window.PaneIntegrationsReal />}
        {active.id === "memory" && (window.__SETTINGS === undefined ? <PaneMemory flash={flash} /> : <PaneSoon which="memory" onTab={onTab} />)}
        {active.id === "notifications" && window.PaneNotificationsReal && <window.PaneNotificationsReal flash={flash} />}
        {active.id === "billing" && window.PaneBillingReal && <window.PaneBillingReal flash={flash} />}
        {active.id === "platform" && window.PanePlatform && <window.PanePlatform />}
        {active.id === "activity" && window.PaneActivity && <window.PaneActivity />}
      </div>

      {toastNode}
    </div>
  );
};
const ProfilePane = ({ flash }) => (window.PaneProfile ? <window.PaneProfile flash={flash} /> : null); // TSX (surfaces/settings/profile)
const TeamWithPartner = ({ flash }) => (window.PanePartner ? <window.PanePartner.Team flash={flash} /> : window.TeamSection ? <window.TeamSection flash={flash} /> : null); // Team, with its partner card (0020)
window.SettingsPage = SettingsPage;
window.SET_TABS = SET_TABS;
window.SET_TABS_PLATFORM = SET_TABS_PLATFORM; // the rail above decides who sees it
window.SET_TAB = SET_TAB; // the shell's crumb, and so the tab's name, names the pane by this same rule
window.WorkspaceData = WorkspaceData; // rendered on its own by exports.test (the door the privacy page promises)

// The booking rules a save does not render are kept rather than rebuilt away -- the form started them from {} and
// deleted the slot length on every Save (S2). That rule is the Business page's now, and it is not a helper at all:
// each fold patches only its own keys onto the stored config, so a rule no fold draws cannot be dropped.
// business-tab-folds.test.mjs saves EVERY fold over a record carrying booking_rules.a_rule_added_later and
// profile.a_key_no_form_renders and reads both back.
