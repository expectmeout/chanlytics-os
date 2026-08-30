/* global React, Icon, StatStrip, StatCell */
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
  owner:    { approve: true,  autonomy: true,  disconnect: true,  billing: true,  team: true },
  operator: { approve: true,  autonomy: true,  disconnect: false, billing: false, team: false },
  viewer:   { approve: false, autonomy: false, disconnect: false, billing: false, team: false },
};
const ST_ROLE_META = {
  owner:    { label: "Owner",    tone: "accent", can: "Everything — billing, team, and disconnecting agents" },
  operator: { label: "Operator", tone: "ok",     can: "Approves decisions and tunes autonomy — not billing or team" },
  viewer:   { label: "Viewer",   tone: "",       can: "Sees everything, changes nothing — approvals are read-only" },
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

const SET_TABS = [
  { id: "workspace",     label: "Workspace",     icon: "home" },
  { id: "autonomy",      label: "Autonomy",      icon: "shield" },
  { id: "integrations",  label: "Integrations",  icon: "external" },
  { id: "memory",        label: "AI memory",     icon: "sparkle" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "billing",       label: "Billing",       icon: "money" },
];

const SetToggle = ({ on, onChange }) => (
  <button className={`set-switch ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
    <span className="set-knob" />
  </button>
);

const SetRow = ({ label, hint, children }) => (
  <div className="set-row">
    <div className="set-row-info">
      <span className="set-row-label">{label}</span>
      {hint && <span className="set-row-hint">{hint}</span>}
    </div>
    <div className="set-row-control">{children}</div>
  </div>
);

const SetSeg = ({ value, options, onChange }) => (
  <div className="cl-tabs">
    {options.map(o => (
      <button key={o} className={`cl-tab ${value === o ? "active" : ""}`} onClick={() => onChange(o)}>{o}</button>
    ))}
  </div>
);

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

const RolePill = ({ role }) => {
  const m = ST_ROLE_META[role] || {};
  return <span className={`pill ${m.tone ? "pill-" + m.tone : ""}`}>{m.label || role}</span>;
};

// Team & roles — real session state (ST_STORE); owner can preview lower roles,
// which gates this section's own controls (the app-wide gate is the next step).
const TeamSection = ({ flash }) => {
  const S = window.ST_STORE;
  const [, setTick] = useSetState(0);
  useSetEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("team:changed", bump);
    return () => window.removeEventListener("team:changed", bump);
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
  const me = (window.__ME && window.__ME.email) || null;
  const team = Array.isArray(realTeam)
    ? realTeam.map((m) => ({
        id: m.membershipId,
        name: (m.email || "").split("@")[0],
        email: m.email,
        role: m.role,
        status: "active",
        isMe: !!me && m.email === me,
      }))
    : S.getTeam();
  // The caller's REAL role decides what they may do. View-as still previews a
  // narrower one, but it can only ever narrow.
  const serverRole = (window.__SETTINGS && window.__SETTINGS.role) || null;
  const myRole = Array.isArray(realTeam) ? (S.viewAsRole || serverRole || S.myRole()) : S.myRole();
  const canManage = S.can("team");
  const isOwner = Array.isArray(realTeam) ? serverRole === "owner" : (S.me() && S.me().role === "owner");
  const previewing = !!S.viewAsRole;
  // Seats are a billing concept and billing is not wired. On real data the
  // count is the members we actually have; the plan limit is not invented.
  const seatsUsed = Array.isArray(realTeam) ? team.length : S.seatsUsed();
  const seatsLeft = Array.isArray(realTeam) ? 1 : S.seatsIncluded - seatsUsed;

  const invite = () => {
    const mail = email.trim().toLowerCase();
    if (!ST_EMAIL_RE.test(mail)) { flash({ msg: <>That doesn't look like an email — check the address</> }); return; }
    if (team.some(m => m.email.toLowerCase() === mail)) { flash({ msg: <><b>{mail}</b> is already on the team</> }); return; }
    if (seatsLeft <= 0) { flash({ msg: <>No seats left — remove someone or upgrade the plan</> }); return; }
    const id = "u-" + mail.split("@")[0].replace(/[^a-z0-9]/g, "");
    const name = mail.split("@")[0].replace(/[._]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    S.addMember({ id, name, email: mail, role: inviteRole, status: "invited" });
    setEmail(""); setInviting(false);
    flash({ msg: <>Invite sent to <b>{mail}</b> as {ST_ROLE_META[inviteRole].label}</>, undo: () => S.removeMember(id) });
  };

  const changeRole = (m, role) => {
    if (m.role === role) return;
    if (m.role === "owner" && role !== "owner" && S.ownerCount() <= 1) { flash({ msg: <>Promote another owner first — a workspace needs one</> }); return; }
    const prev = m.role;
    S.setRole(m.id, role);
    flash({ msg: <><b>{m.name.split(" ")[0]}</b> is now {ST_ROLE_META[role].label}</>, undo: () => S.setRole(m.id, prev) });
  };
  const remove = (m) => {
    if (m.role === "owner" && S.ownerCount() <= 1) { flash({ msg: <>Can't remove the only owner</> }); return; }
    const snap = { ...m };
    S.removeMember(m.id);
    flash({ msg: <><b>{m.name}</b> {m.status === "invited" ? "invite revoked" : "removed from the team"}</>, undo: () => S.addMember(snap) });
  };

  return (
    <section className="fl-card set-card">
      <div className="fl-card-head">
        <span className="fl-card-title">Team</span>
        <span className="fl-card-sub">{Array.isArray(realTeam) ? `${seatsUsed} ${seatsUsed === 1 ? "person" : "people"}` : `${seatsUsed} of ${S.seatsIncluded} seats`}</span>
        {canManage && (seatsLeft > 0
          ? !inviting && <button className="btn btn-sm" onClick={() => setInviting(true)}><Icon name="plus" size={12} /> Invite</button>
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
          <button className="btn btn-primary btn-sm" onClick={invite}>Send invite</button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setInviting(false); setEmail(""); }} aria-label="Cancel"><Icon name="x" size={12} /></button>
        </div>
      )}

      {team.map(m => {
        // On real data, YOU is decided by the signed-in email — S.meId is the
        // mockup's fabricated operator, which is how a stranger's name ended up
        // wearing this badge on a real owner's settings page.
        const isMe = m.isMe !== undefined ? m.isMe : m.id === S.meId;
        const pending = m.status === "invited";
        return (
          <div key={m.id} className={`set-team-row ${pending ? "pending" : ""}`}>
            <span className="avatar" style={pending ? { background: "var(--ink-faint)" } : m.role === "owner" ? undefined : { background: "var(--ink-muted)" }}>{stInitials(m.name)}</span>
            <span className="set-team-body">
              <span className="set-team-name">{m.name}{isMe && <span className="set-team-you">You</span>}</span>
              <span className="set-team-mail">{m.email}{pending ? " · invite pending" : ""}</span>
            </span>
            <RolePill role={m.role} />
            {canManage && !isMe ? (
              <MoreMenu btnClass="btn btn-icon btn-sm" items={[
                { header: "Role" },
                ...["owner", "operator", "viewer"].map(r => ({ label: ST_ROLE_META[r].label + (m.role === r ? "  ✓" : ""), icon: r === "owner" ? "shield" : r === "operator" ? "agents" : "users", onClick: () => changeRole(m, r) })),
                { divider: true },
                ...(pending ? [{ label: "Resend invite", icon: "mail", onClick: () => flash({ msg: <>Invite resent to <b>{m.email}</b></> }) }] : []),
                { label: pending ? "Revoke invite" : "Remove", icon: "x", danger: true, onClick: () => remove(m) },
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
        <div className="set-team-gated"><Icon name="shield" size={11} /> {ST_ROLE_META[myRole].label}s can view the team but can't change it — ask an owner.</div>
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

const hoursSummary = (hours) => {
  if (!hours) return null;
  const days = ["mon","tue","wed","thu","fri","sat","sun"];
  const spans = days.map((d) => {
    const h = hours[d] || {};
    return { d, text: h.open && h.close ? h.open + "–" + h.close : "Closed" };
  });
  // Same run-collapsing the composed prompt uses, so the owner reads the
  // hours here exactly as the receptionist will state them.
  const out = [];
  let i = 0;
  while (i < spans.length) {
    let j = i;
    while (j + 1 < spans.length && spans[j + 1].text === spans[i].text) j++;
    const label = i === j ? DAY_LABEL_SHORT[spans[i].d] : DAY_LABEL_SHORT[spans[i].d] + "–" + DAY_LABEL_SHORT[spans[j].d];
    out.push(label + " " + spans[i].text);
    i = j + 1;
  }
  return out.join(" · ");
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

const BusinessEditor = ({ settings, onDone, flash }) => {
  const brain = (settings.config && settings.config.brain) || {};
  const p0 = brain.profile || {};
  const [address, setAddress] = useSetState(p0.address || "");
  const [tone, setTone] = useSetState(p0.tone || "");
  const [langs, setLangs] = useSetState(() => (p0.languages || []).slice());
  const [langAdd, setLangAdd] = useSetState("");
  const [escalate, setEscalate] = useSetState((p0.escalate_when || []).join("\n"));
  // Pre-filled with the workspace's existing instructions the first time this
  // is opened, so nothing a business already told its receptionist quietly
  // disappears the moment it fills in a form. Visible, and theirs to trim.
  const [extra, setExtra] = useSetState(p0.extra_instructions || brain.system_prompt || "");
  const [hours, setHours] = useSetState(() => {
    const h = {};
    SET_DAYS.forEach(([d]) => {
      const x = (p0.hours || {})[d] || {};
      // `open` here means the business is open, not the opening time — a day
      // is closed only when it has no times, which is what the schema stores.
      h[d] = { open: x.open || "", close: x.close || "", isOpen: !!(x.open && x.close) };
    });
    return h;
  });
  const [services, setServices] = useSetState(() => (p0.services || []).map((x) => ({ ...x })));
  const [guards, setGuards] = useSetState(() => ({
    // Absent means ON. Only an explicit false turns one off, so an unset
    // config must not render as three unticked boxes.
    never_quote_prices: (p0.guardrails || {}).never_quote_prices !== false,
    never_confirm_booking: (p0.guardrails || {}).never_confirm_booking !== false,
    disclose_ai: (p0.guardrails || {}).disclose_ai !== false,
  }));
  const [saving, setSaving] = useSetState(false);

  const setDay = (d, patch) => setHours((h) => ({ ...h, [d]: { ...h[d], ...patch } }));
  const setSvc = (i, k, v) => setServices((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
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
  const applyToAll = (from, days) => {
    const src = hours[from];
    if (!src.isOpen) return;
    setHours((h) => {
      const next = { ...h };
      days.forEach((d) => { next[d] = { ...src }; });
      return next;
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
    const hrs = {};
    SET_DAYS.forEach(([d]) => {
      const x = hours[d];
      // A day that is closed is stored as `{}` — a real answer. Omitting it
      // would read as "we did not say".
      hrs[d] = x.isOpen && x.open && x.close ? { open: x.open, close: x.close } : {};
    });
    // Only send hours once at least one day has real times, or an untouched
    // form would save seven closed days and read as a business never open.
    // Via put, so turning every day off CLEARS the stored grid instead of
    // leaving yesterday's behind now that we start from the stored profile.
    put("hours", SET_DAYS.some(([d]) => hours[d].isOpen && hours[d].open && hours[d].close) ? hrs : undefined);
    const svcs = services.filter((x) => (x.name || "").trim()).map((x) => {
      const o = { name: x.name.trim() };
      const d = parseInt(x.duration_min, 10);
      if (Number.isFinite(d) && d > 0) o.duration_min = d;
      if ((x.price_note || "").trim()) o.price_note = x.price_note.trim();
      return o;
    });
    put("services", svcs.length ? svcs : undefined);
    profile.guardrails = { ...guards };

    const next = { ...settings.config, brain: { ...brain, profile } };
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
      flash({ msg: <>{r.message}</> });
    });
  };

  const openDays = SET_DAYS.filter(([d]) => hours[d].isOpen).length;

  return (
    <section className="fl-card set-card set-editor">
      <div className="fl-card-head">
        <span className="fl-card-title">Your business</span>
        <span className="fl-card-sub">Both agents answer from these</span>
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
                onClick={() => setDay(d, { isOpen: !hours[d].isOpen })}
              ><span className="set-knob" /></button>
              <span className="set-day-name">{label}</span>
              {hours[d].isOpen ? (
                <>
                  <input className="set-input set-input-time" type="time" value={hours[d].open} aria-label={`${label} opens`} onChange={(e) => setDay(d, { open: e.target.value })} />
                  <span className="set-day-sep">to</span>
                  <input className="set-input set-input-time" type="time" value={hours[d].close} aria-label={`${label} closes`} onChange={(e) => setDay(d, { close: e.target.value })} />
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
        <SetSectionHead title="What you offer" hint="Names and rough timings — a price only if you can state it flatly" />
        {services.length > 0 && (
          <div className="set-svc-head">
            <span>Service</span><span>Takes</span><span>Price</span><span />
          </div>
        )}
        {services.map((sv, i) => (
          <div key={i} className="set-svc-row">
            <input className="set-input" value={sv.name || ""} placeholder="Haircut" aria-label="Service name" onChange={(e) => setSvc(i, "name", e.target.value)} />
            <span className="set-svc-mins">
              <input className="set-input" inputMode="numeric" value={sv.duration_min || ""} placeholder="45" aria-label="Minutes" onChange={(e) => setSvc(i, "duration_min", e.target.value.replace(/[^0-9]/g, ""))} />
              <span className="set-svc-unit">min</span>
            </span>
            <input className="set-input" value={sv.price_note || ""} placeholder="quoted at consult" aria-label="Price note" onChange={(e) => setSvc(i, "price_note", e.target.value)} />
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove ${sv.name || "service"}`} onClick={() => setServices((l) => l.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => setServices((l) => [...l, { name: "" }])}><Icon name="plus" size={12} /> Add a service</button>
      </div>

      <div className="set-sec">
        <SetSectionHead title="Languages it can answer in" hint="Tap to choose" />
        <div className="set-chips">
          {SET_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              className={`set-chip ${langs.includes(l) ? "on" : ""}`}
              aria-pressed={langs.includes(l)}
              onClick={() => toggleLang(l)}
            >{l}</button>
          ))}
          {langs.filter((l) => !SET_LANGS.includes(l)).map((l) => (
            <button key={l} type="button" className="set-chip on" aria-pressed="true" onClick={() => toggleLang(l)}>{l}</button>
          ))}
        </div>
        <div className="set-chip-add">
          <input
            className="set-input"
            value={langAdd}
            placeholder="Another language"
            aria-label="Add another language"
            onChange={(e) => setLangAdd(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLang(); } }}
          />
          <button type="button" className="btn btn-sm" onClick={addLang} disabled={!langAdd.trim()}>Add</button>
        </div>
      </div>

      <div className="set-sec">
        <SetSectionHead title="Hand over to a person when" hint="One per line" />
        <textarea className="set-input set-textarea" rows={3} value={escalate} onChange={(e) => setEscalate(e.target.value)} placeholder={"They ask for the owner by name\nThey are unhappy about a previous visit"} aria-label="Escalation triggers" />
      </div>

      <div className="set-sec">
        <SetSectionHead title="Rules it always follows" hint="These stay in force whatever else you write below" />
        {[
          ["never_quote_prices", "Never quote or confirm a price", "It offers a consult or the booking link instead"],
          ["never_confirm_booking", "Never confirm an appointment itself", "Booking happens on your link or with your staff"],
          ["disclose_ai", "Say it is an assistant if asked", "And offer to bring in a person"],
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
      </div>

      <div className="set-sec">
        <SetSectionHead title="Anything else it should know" hint="Optional — written in your own words" />
        <textarea className="set-input set-textarea" rows={4} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Parking is behind the building. We do not take walk-ins after 5pm." aria-label="Extra instructions" />
      </div>

      <div className="set-editor-foot">
        <span className="set-editor-note">Saved changes reach the receptionist within a minute. A call already in progress finishes on the old details.</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} disabled={saving}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving} {...window.gate("autonomy")}>
          {saving ? "Saving" : "Save"}
        </button>
      </div>
    </section>
  );
};
const PaneWorkspace = ({ flash }) => {
  const [editing, setEditing] = useSetState(false);
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
  const hrs = profile && hoursSummary(profile.hours);
  if (real && editing) {
    return (
      <>
        <BusinessEditor settings={settings} flash={flash} onDone={() => setEditing(false)} />
        <TeamSection flash={flash} />
      </>
    );
  }
  return (
  <>
    <section className="fl-card set-card">
      <div className="fl-card-head"><span className="fl-card-title">Business</span>
        {/* On real data this opens the form. The mockup's compose flow asked
            an assistant to update details it had no way to write. */}
        {real
          ? <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} {...window.gate("autonomy")}><Icon name="edit" size={11} /> Edit</button>
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
        <div className="set-empty">
          <div className="set-empty-title">This workspace has no receptionist yet</div>
          <div className="set-empty-body">
            Nothing has been set up for it — no business name, no phone line, no
            booking link. Until it has those, there is nothing here to show you
            and nothing answering your customers.
          </div>
        </div>
      ) : (
      <div className="cl-prof-attr-list">
        <div className="cl-prof-attr"><span className="cl-prof-attr-key">Name</span><span className="cl-prof-attr-val">{real ? (S.business_name || "—") : "Serenity Spa"}</span></div>
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
        <div className="cl-prof-attr"><span className="cl-prof-attr-key">Phone line</span><span className="cl-prof-attr-val">{real ? (S.phone_display || "—") : "+1 (415) 555-0100"}</span></div>
        {real ? (
          <div className="cl-prof-attr"><span className="cl-prof-attr-key">Booking link</span><span className="cl-prof-attr-val">{S.booking_link || "—"}</span></div>
        ) : (
          <div className="cl-prof-attr"><span className="cl-prof-attr-key">Therapists</span><span className="cl-prof-attr-val">Lena Park · Jay Rivera</span></div>
        )}
        {real && profile && profile.address && (
          <div className="cl-prof-attr"><span className="cl-prof-attr-key">Address</span><span className="cl-prof-attr-val">{profile.address}</span></div>
        )}
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
        <div className="set-empty">
          <div className="set-empty-title">Tell the receptionist about your business</div>
          <div className="set-empty-body">
            Your hours, services and address are still written inside the assistant's
            instructions, as prose. Fill them in as fields and the WhatsApp receptionist
            answers from them within a minute — and the phone agent reads the same ones,
            once it has been pointed at them.
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)} {...window.gate("autonomy")}>
            <Icon name="plus" size={12} /> Add your business details
          </button>
        </div>
      )}
    </section>
    {real && <PromptPreview />}
    <TeamSection flash={flash} />
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
 * Not a mock-up of the prompt — window.__composedPrompt runs the SAME function
 * the edge runs, on the same saved config.
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
        <span>every message, word for word</span>
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
const SettingsPage = ({ tab = "workspace", onTab = () => {} }) => {
  const active = SET_TABS.find(t => t.id === tab) || SET_TABS[0];
  const [toastNode, flash] = window.usePPToast();
  return (
    <div className="settings">
      <aside className="set-nav">
        <div className="fl-roster-head"><span className="fl-roster-label">Settings</span></div>
        {SET_TABS.map(t => (
          <button key={t.id} className={`fl-agent set-nav-row ${active.id === t.id ? "active" : ""}`} onClick={() => onTab(t.id)}>
            <Icon name={t.icon} size={14} />
            <span className="set-nav-label">{t.label}</span>
          </button>
        ))}
      </aside>
      <div className="set-pane" key={active.id}>
        {active.id === "workspace" && <PaneWorkspace flash={flash} />}
        {active.id === "autonomy" && <PaneAutonomy flash={flash} />}
        {active.id === "integrations" && <PaneIntegrations flash={flash} />}
        {active.id === "memory" && <PaneMemory flash={flash} />}
        {active.id === "notifications" && <PaneNotifications />}
        {active.id === "billing" && <PaneBilling flash={flash} />}
      </div>

      {toastNode}
    </div>
  );
};

window.SettingsPage = SettingsPage;
window.SET_TABS = SET_TABS;
window.SetToggle = SetToggle; // consumed by calendar.jsx + reports.jsx (module-scope port fix)
