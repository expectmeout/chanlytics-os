/* global React, Icon, StatStrip, StatCell */
// Campaigns › Messages: what the receptionist and the campaigns send on
// WhatsApp, shown as the customer sees it. One card per message — the
// starter set in the library's order, then what the workspace wrote or
// synced — with the bubble for the language in view, the languages beside
// it (approved, in review, or one tap to add), and the verbs an operator
// has under a menu. Meta's own sample is never shown; a template the
// workspace hid sits under a fold, still on file. Written here or in
// WhatsApp Manager, WhatsApp approves either way; a marketing template can
// only go to people who said yes to offers. Every verb goes through
// window.__templates and the surface is re-fetched, so the cards are the
// server's.

const TPL_STATUS = {
  approved: { label: "Approved", tone: "ok" },
  pending: { label: "In review", tone: "review" },
  rejected: { label: "Rejected", tone: "warn" },
  paused: { label: "Paused", tone: "warn" },
  disabled: { label: "Disabled", tone: "warn" },
};
const tplStatus = (t) => TPL_STATUS[t.meta_status] || { label: t.meta_status, tone: "review" };
const tplAgo = (iso) => {
  if (!iso) return null;
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
};
// Words for people: a starter's title, the workspace's own, or the name with its underscores made spaces.
const tplTitle = (t) => (window.__starters ? window.__starters.title(t) : (t && t.name) || "");
// Meta's own sample lives in every account and is nobody's message: never shown, whatever the sync keeps.
const TPL_SAMPLES = new Set(["hello_world"]);
// The words WhatsApp reviewed for each slot, so a synced template reads as a message and not as {{1}}.
const tplExamples = (t) => (Array.isArray(t.variables) ? t.variables : []).map((x) => (x && typeof x === "object" && typeof x.example === "string" ? x.example : null));
const tplRender = (body, examples) => String(body || "").replace(/\{\{(\d+)\}\}/g, (m, n) => examples[Number(n) - 1] || m);

const useMessages = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:settings", bump);
    return () => window.removeEventListener("surface:settings", bump);
  }, []);
  return window.__TEMPLATES_ALL;
};

// One message: its title and purpose, the languages it exists in (or may be
// added in), the bubble for the language in view, and — behind a menu — the
// verbs for the template in view: rename, hide or show, delete.
const MessageCard = ({ g, langs, bizName, canAct, busy, S, onAdd, onRename, onHide, onDelete }) => {
  const present = g.rows.filter((r) => r.row);
  const [langId, setLangId] = React.useState(present[0] ? present[0].lang.id : (langs[0] ? langs[0].id : "en_US"));
  const [menu, setMenu] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [arm, setArm] = React.useState(false);
  const cur = g.rows.find((r) => r.lang.id === langId) || g.rows[0];
  const row = cur ? cur.row : null;
  const starterText = g.starter && S ? S.text(g.starter, langId) : null;
  const body = row ? tplRender(row.body_preview, tplExamples(row)) : g.starter && S ? S.preview(g.starter, langId, bizName) : "";
  const footer = starterText ? starterText.footer : null;
  const closeMenu = () => { setMenu(false); setRenaming(false); setArm(false); };
  return (
    <article className={"msg-card" + (row && row.hidden_at ? " is-hidden" : "")} data-testid={g.starter ? "starter-row" : "custom-row"}>
      <div className="msg-card-head">
        <span className="msg-card-title">{g.title}</span>
        <span className="msg-card-purpose">{g.purpose}</span>
      </div>
      <div className="msg-card-langs">
        {g.rows.map(({ lang, row: r }) => {
          if (r) {
            const st = tplStatus(r);
            return (
              <button key={lang.id} className={`msg-lang ${lang.id === langId ? "active" : ""}`} onClick={() => { setLangId(lang.id); closeMenu(); }} title={r.meta_status === "rejected" && r.rejected_reason ? `Rejected: ${String(r.rejected_reason).toLowerCase().replace(/_/g, " ")}` : `${lang.label} · ${st.label}`} data-testid="template-lang">
                <span className={`dot ${st.tone}`} />{lang.label} · {st.label}
              </button>
            );
          }
          if (!g.starter) return null;
          return canAct
            ? <button key={lang.id} className="btn btn-sm" disabled={busy} onClick={() => onAdd(g, lang)} data-testid="starter-add">Add {lang.label}</button>
            : <span key={lang.id} className="msg-lang-missing">{lang.label} · not added</span>;
        })}
      </div>
      <window.WaBubble from={bizName || "Your business"} body={body} footer={footer} />
      <div className="msg-card-foot">
        {row
          ? <span className="msg-card-meta">{row.name}{row.category ? ` · ${row.category}` : ""}{row.source === "chanlytics" ? " · made here" : " · from WhatsApp Manager"}{row.meta_status === "rejected" && row.rejected_reason ? ` · rejected: ${String(row.rejected_reason).toLowerCase().replace(/_/g, " ")}` : ""}</span>
          : <span className="msg-card-meta">Not on WhatsApp in {cur ? cur.lang.label : "this language"} yet — the words WhatsApp would review</span>}
        <span className="msg-card-spacer" />
        {row && canAct && !menu && <button className="cl-bucket-link" onClick={() => setMenu(true)} aria-label={`More for ${g.title}`} data-testid="template-menu">···</button>}
      </div>
      {menu && row && (
        <div className="msg-card-acts" data-testid="template-row">
          {renaming ? (
            <span className="tpl-rename" data-testid="template-rename-form">
              <input className="bc-subject" value={draft} maxLength={60} autoFocus placeholder={tplTitle({ name: row.name })} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onRename(row, draft); closeMenu(); } if (e.key === "Escape") setRenaming(false); }} data-testid="template-title" />
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => { onRename(row, draft); closeMenu(); }} data-testid="template-title-save">Save</button>
              <button className="cl-bucket-link" onClick={() => setRenaming(false)}>Cancel</button>
            </span>
          ) : arm ? (
            <span className="set-row-hint">Delete “{tplTitle(row)}” in {cur.lang.label} from WhatsApp? Sends that use it fail from now on. <button className="cl-bucket-link danger" disabled={busy} onClick={() => { closeMenu(); onDelete(row); }} data-testid="template-delete-yes">Yes, delete</button> <button className="cl-bucket-link" onClick={() => setArm(false)}>No</button></span>
          ) : (
            <>
              <button className="cl-bucket-link" disabled={busy} onClick={() => { setDraft(row.title || ""); setRenaming(true); }} title="Call it something in your own words — WhatsApp keeps its name" data-testid="template-rename">Rename</button>
              <button className="cl-bucket-link" disabled={busy} onClick={() => { closeMenu(); onHide(row); }} title={row.hidden_at ? "Offer it in the composers again" : "Keep it on file, out of the composers"} data-testid="template-hide">{row.hidden_at ? "Show" : "Hide"}</button>
              <button className="cl-bucket-link danger" disabled={busy} onClick={() => setArm(true)} data-testid="template-delete">Delete</button>
              <button className="cl-bucket-link" onClick={closeMenu}>Close</button>
            </>
          )}
        </div>
      )}
    </article>
  );
};

const MessagesReal = () => {
  const templates = useMessages();
  const S = window.__starters;
  const [busy, setBusy] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [showHidden, setShowHidden] = React.useState(false);
  const [toastNode, flash] = window.usePPToast();
  React.useEffect(() => {
    const open = () => setComposing(true);
    window.addEventListener("messages:new", open);
    return () => window.removeEventListener("messages:new", open);
  }, []);
  const canAct = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  const hasWhatsApp = (window.__CHANNELS || []).some((c) => c.kind === "whatsapp");
  const bizName = (window.__SETTINGS && window.__SETTINGS.config && window.__SETTINGS.config.brain && window.__SETTINGS.config.brain.business_name) || null;

  if (templates === undefined) {
    return (
      <div className="reports" data-testid="messages-real">
        <div className="cl-head"><div className="cl-head-titles"><div className="cl-page-title">Messages</div><div className="cl-page-sub">Reading your messages…</div></div></div>
      </div>
    );
  }
  if (templates === null) {
    return (
      <div className="reports" data-testid="messages-real">
        <div className="cl-head"><div className="cl-head-titles"><div className="cl-page-title">Messages</div><div className="cl-page-sub">Couldn&rsquo;t be loaded right now</div></div></div>
        <div className="rp-body">
          <section className="fl-card rp2-card">
            <div className="rp2-empty">The receptionist keeps sending; this page just can&rsquo;t show the messages at the moment. <button className="cl-bucket-link" onClick={() => window.__refreshSettings && window.__refreshSettings()}>Retry</button></div>
          </section>
        </div>
      </div>
    );
  }

  const langs = S ? S.languages : [];
  const list = templates.filter((t) => !TPL_SAMPLES.has(t.name));
  const rowFor = (name, lang) => list.find((t) => t.name === name && t.language === lang) || null;
  const langOf = (id) => langs.find((l) => l.id === id) || { id, label: id };
  const groupsOf = (rows, purposeOf) => [...new Set(rows.map((t) => t.name))].map((name) => {
    const mine = rows.filter((x) => x.name === name);
    const t = mine[0];
    return { key: `c:${name}`, title: tplTitle(t), purpose: purposeOf(t), starter: null, rows: mine.map((x) => ({ lang: langOf(x.language), row: x })) };
  });
  // The starters in the library's order, each with a slot per language; then
  // what the workspace wrote or synced, by name; then a fold for what it hid.
  const starters = S ? S.list.map((s) => ({ key: s.key, title: s.title, purpose: s.purpose, starter: s, rows: langs.map((l) => ({ lang: l, row: rowFor(s.name, l.id) })) })) : [];
  const starterNames = new Set(starters.map((g) => g.starter.name));
  const rest = list.filter((t) => !starterNames.has(t.name));
  const hiddenRows = rest.filter((t) => !!t.hidden_at);
  const customGroups = groupsOf(rest.filter((t) => !t.hidden_at), (t) => (t.source === "chanlytics" ? "written here" : "from WhatsApp Manager"));
  const hiddenGroups = groupsOf(hiddenRows, () => "hidden from the composers");
  const missing = langs.map((l) => ({ lang: l, n: starters.filter((g) => !g.rows.find((r) => r.lang.id === l.id).row).length }));
  const missingTotal = missing.reduce((a, m) => a + m.n, 0);
  const shown = list.filter((t) => !t.hidden_at);
  const approved = shown.filter((t) => t.meta_status === "approved").length;
  const pending = shown.filter((t) => t.meta_status === "pending").length;
  const lastSync = list.reduce((m, t) => (t.synced_at && (!m || t.synced_at > m) ? t.synced_at : m), null);

  const run = async (fn, said) => {
    if (!window.__templates || busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? said(r) : <>{r.message}</> });
  };
  const rename = (t, draft) => {
    const title = draft.replace(/\s+/g, " ").trim() || null;
    run(() => window.__templates.rename(t.id, title), () => (title ? <>Now called <b>{title}</b> — WhatsApp still knows it as {t.name}</> : <><b>{t.name}</b> goes by its name again</>));
  };
  const toggleHidden = (t) => run(() => (t.hidden_at ? window.__templates.show(t.id) : window.__templates.hide(t.id)), () => <><b>{tplTitle(t)}</b> {t.hidden_at ? "is back in the composers" : "is out of the composers — still on file"}</>);
  const remove = (t) => run(() => window.__templates.remove(t.id), () => <><b>{tplTitle(t)}</b> deleted — sends that named it fail from now on</>);
  const addStarters = (keys, languages) => run(() => window.__templates.addStarters({ ...(keys ? { keys } : {}), languages }), (r) => <>{window.starterWords ? window.starterWords(r.data) : "Added"}</>);
  const sync = () => run(() => window.__syncTemplates(), (r) => <>{r.data.seen} template{r.data.seen === 1 ? "" : "s"} from WhatsApp — {r.data.approved} approved, {r.data.marketing} marketing</>);
  const card = (g) => <MessageCard key={g.key} g={g} langs={langs} bizName={bizName} canAct={canAct && hasWhatsApp} busy={busy} S={S} onAdd={(gg, lang) => addStarters([gg.starter.key], [lang.id])} onRename={rename} onHide={toggleHidden} onDelete={remove} />;

  return (
    <div className="reports" data-testid="messages-real">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Messages</div>
          <div className="cl-page-sub">
            What the receptionist and your campaigns send on WhatsApp, as the customer sees it. Written here or in WhatsApp Manager, WhatsApp approves either way. A marketing template can only go to people who said yes to offers.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="Approved" value={approved} meta={lastSync ? `synced ${tplAgo(lastSync)}` : "never synced"} />
          <StatCell label="In review" value={pending} meta="with WhatsApp" />
          <StatCell label="Not yet added" value={missingTotal} meta={missingTotal ? "one tap each" : "every starter, both languages"} />
        </StatStrip>
      </div>

      <div className="cl-controls">
        <div className="cl-controls-right">
          {canAct && hasWhatsApp && missing.filter((m) => m.n > 0).map((m) => (
            <button key={m.lang.id} className="btn btn-sm" disabled={busy} onClick={() => addStarters(null, [m.lang.id])} data-testid="starter-add-all">{busy ? "Adding…" : `Add ${m.n === (S ? S.list.length : 0) ? "all " : "the "}${m.n} in ${m.lang.label}`}</button>
          ))}
          {canAct && hasWhatsApp && <button className="btn btn-sm" onClick={sync} disabled={busy} data-testid="sync-templates">{busy ? "Syncing…" : "Sync from WhatsApp"}</button>}
          {canAct && hasWhatsApp && <button className="btn btn-primary btn-sm" onClick={() => setComposing((c) => !c)} data-testid="template-new"><Icon name="plus" size={12} /> New message</button>}
        </div>
      </div>

      <div className="rp-body">
        {!hasWhatsApp && (
          <section className="fl-card rp2-card" data-testid="messages-no-number">
            <div className="rp2-empty">Connect a WhatsApp number first — messages belong to a number&rsquo;s account. <button className="cl-bucket-link" onClick={() => window.CHANLY.nav("admin/integrations")}>Open Connections</button></div>
          </section>
        )}
        {composing && window.TemplateComposer && (
          <section className="fl-card rp2-card" data-testid="messages-composer">
            <window.TemplateComposer
              businessName={bizName || ""}
              onCancel={() => setComposing(false)}
              onDone={(made) => { setComposing(false); flash({ msg: <><b>{made.name}</b> submitted — WhatsApp reviews it; its status shows here</> }); }}
            />
          </section>
        )}
        <section data-testid="templates">
          {hasWhatsApp && S && (
            <div className="msg-intro" data-testid="starters">
              <span className="rp2-foot">The starter set: {S.list.length} messages for the moments Chanlytics acts on, in English and Spanish — WhatsApp reviews each, usually within minutes.</span>
            </div>
          )}
          <div className="msg-grid">
            {hasWhatsApp && starters.map(card)}
            {customGroups.map(card)}
          </div>
          {!hasWhatsApp && customGroups.length === 0 && <div className="rp2-empty">Nothing on file yet.</div>}
        </section>
        {hiddenGroups.length > 0 && (
          <section className="msg-fold" data-testid="templates-fold">
            <button className="msg-fold-toggle" onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden} data-testid="templates-hidden">
              Hidden from the composers · {hiddenRows.length} · still on file <Icon name={showHidden ? "chevron-up" : "chevron-down"} size={10} />
            </button>
            {showHidden && <div className="msg-grid">{hiddenGroups.map(card)}</div>}
          </section>
        )}
      </div>
      {toastNode}
    </div>
  );
};

// The page is real on every workspace; the standalone mockup never routes here.
const MessagesPage = () => <MessagesReal />;

window.MessagesPage = MessagesPage;
