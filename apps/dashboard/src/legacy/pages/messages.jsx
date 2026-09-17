/* global React, Icon, Confirm, EmptyState, FailedRead, StatePill */
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
// What this business says about itself, for the slots that name it. A preview puts its own name and
// booking link there, and a blank for what it has not given -- never the sample filed with Meta (the
// starters' "Luna Studio"). The rule and the slots are the contracts' (templatePreview, starterPreview).
const tplOwn = () => {
  const brain = (window.__SETTINGS && window.__SETTINGS.config && window.__SETTINGS.config.brain) || {};
  return { business_name: brain.business_name || null, booking_link: brain.booking_link || null };
};

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
const MessageCard = ({ g, langs, bizName, canAct, busy, doing = null, S, onAdd, onRename, onHide, onDelete }) => {
  const present = g.rows.filter((r) => r.row);
  const [langId, setLangId] = React.useState(present[0] ? present[0].lang.id : (langs[0] ? langs[0].id : "en_US"));
  const [menu, setMenu] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [arm, setArm] = React.useState(false);
  const cur = g.rows.find((r) => r.lang.id === langId) || g.rows[0];
  const row = cur ? cur.row : null;
  const starterText = g.starter && S ? S.text(g.starter, langId) : null;
  const own = tplOwn();
  // The body with its slots still in it, and the words that fill them: the
  // preview marks what varies per person, which a filled string cannot.
  const body = row ? row.body_preview || "" : starterText ? starterText.body : "";
  const values = !S ? null : row ? S.rowValues(row, own) : g.starter ? S.starterValues(g.starter, langId, own.business_name, own.booking_link) : null;
  // The line under the words. `public.templates` does have one on file -- Meta's
  // components, kept since 00045 -- and nothing read it, so this said a starter's
  // footer and nothing else. A row the workspace wrote now shows its own; a
  // starter not yet added shows the library's, which is what WhatsApp would see.
  const footer = row && S ? S.footer(row) : starterText ? starterText.footer : null;
  const closeMenu = () => { setMenu(false); setRenaming(false); setArm(false); };
  // The playbooks that send the template in view, found the way a run finds it: by name and language. Null: not read.
  const pbRows = window.__PLAYBOOKS ? window.__PLAYBOOKS.rows || [] : null;
  const users = row && pbRows ? pbRows.filter((p) => p.template_name === row.name && p.template_language === row.language) : [];
  const sending = users.filter((p) => p.state === "running").map((p) => p.name);
  const paused = users.filter((p) => p.state !== "running").map((p) => p.name);
  const quoted = (names) => names.map((n) => `“${n}”`).join(", ");
  const pausedWords = !pbRows ? " Chanlytics couldn't check which playbooks send it."
    : paused.length === 1 ? ` ${quoted(paused)} is paused and sends it: if it resumes, its runs skip until it has another message.`
    : paused.length > 1 ? ` ${quoted(paused)} are paused and send it: if they resume, their runs skip until they have another message.` : "";
  return (
    <article className={"msg-card" + (row && row.hidden_at ? " is-hidden" : "")} data-testid={g.starter ? "starter-row" : "custom-row"}>
      <div className="msg-card-head">
        <span className="msg-card-title">{g.title}</span>
        {row && <StatePill kind="template" value={row.meta_status} testid="template-status" />}
        <span className="msg-card-purpose">{g.purpose}</span>
      </div>
      {/* A refusal was a `title=` on the language button and a tail on the meta
          line: 10px, and on a touch screen nowhere at all. It is the row's own
          line now, in the tone of a refusal. */}
      {/* A message WhatsApp approved that this product still cannot put on the
          wire: the composers do not offer it, so its card says why rather than
          leaving it looking available. */}
      {row && row.blocked && (
        <p className="bc-excl-hint warn" data-testid="template-blocked">Can&rsquo;t be sent from here: it has {row.blocked}. It still works in WhatsApp Manager.</p>
      )}
      {row && row.meta_status === "rejected" && row.rejected_reason && (
        <p className="bc-excl-hint danger" data-testid="template-rejected">WhatsApp refused this one: {String(row.rejected_reason).toLowerCase().replace(/_/g, " ")}. Change the words and send it back.</p>
      )}
      {/* One control, one job. A language button switched the language AND carried
          that language's status as a dot plus words, so the thing you press to
          read the Spanish version was also the only place its approval was
          written. The languages are a toggle; the status of the one in view is a
          pill beside the title, where a state is said everywhere else. */}
      <div className="msg-card-langs">
        <span className="msg-langs" role="group" aria-label={`Language for ${g.title}`}>
          {g.rows.filter(({ row: r }) => r).map(({ lang }) => (
            <button key={lang.id} type="button" className={`msg-lang ${lang.id === langId ? "active" : ""}`} aria-pressed={lang.id === langId} onClick={() => { setLangId(lang.id); closeMenu(); }} data-testid="template-lang">
              {lang.label}
            </button>
          ))}
        </span>
        {g.rows.filter(({ row: r, lang }) => !r && g.starter && lang).map(({ lang }) => (
          <button key={lang.id} className="btn btn-sm" disabled={busy} onClick={() => onAdd(g, lang)} data-testid="starter-add" {...window.gate("approve", "add a starter message")}>{doing === `add:${g.starter.key}:${lang.id}` ? "Adding…" : `Add ${lang.label}`}</button>
        ))}
      </div>
      <window.MessagePreview from={bizName || "Your business"} body={body} values={values} header={row ? row.header : null} footer={footer} buttons={row ? row.buttons : null} compact />
      <div className="msg-card-foot">
        {row
          ? <span className="msg-card-meta">{row.name}{row.category ? ` · ${row.category}` : ""}{row.source === "chanlytics" ? " · made here" : " · from WhatsApp Manager"}</span>
          : <span className="msg-card-meta">Not on WhatsApp in {cur ? cur.lang.label : "this language"} yet — the words WhatsApp would review</span>}
        {/* The rating WhatsApp gives the template in view, as of the last sync; nothing when none was synced. */}
        {row && row.quality && <StatePill kind="template_quality" value={String(row.quality).toUpperCase()} testid="template-quality" />}
        {/* What sends it. The card worked this out already -- it is how a delete
            knows to refuse -- and then showed it only inside that refusal, so
            the page that exists to hold the messages could not say which of
            them anything uses. Null pbRows: the playbooks were not read, and
            "nothing sends it" would be a claim rather than a reading. */}
        {row && pbRows && (users.length > 0
          ? <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(users.length === 1 ? `outbound/${users[0].id}` : "outbound")} data-testid="template-users">Sent by {users.length === 1 ? quoted([users[0].name]) : `${users.length} playbooks`}{sending.length === 0 ? " · paused" : ""}</button>
          : <span className="msg-card-meta" data-testid="template-users">No playbook sends it</span>)}
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
          ) : arm && sending.length > 0 ? (
            // A running playbook still sends it: the route refuses the delete, so the question is not asked.
            <div className="msg-delete-held" role="status" data-testid="template-delete-held">
              <span>{S && S.stillSends ? S.stillSends(sending) : `${quoted(sending)} still sends this message.`}</span>
              <button className="cl-bucket-link" onClick={() => { closeMenu(); window.CHANLY.nav("outbound"); }}>Open Playbooks</button>
              <button className="cl-bucket-link" onClick={() => setArm(false)}>Keep it</button>
            </div>
          ) : arm ? (
            <Confirm question={`Delete “${tplTitle(row)}” in ${cur.lang.label}?`} detail={`It leaves WhatsApp; sends that use it fail from now on.${pausedWords}`} yes="Yes, delete" danger busy={busy} onYes={() => { closeMenu(); onDelete(row); }} onNo={() => setArm(false)} testid="template-delete" />
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
  // Which act is under way, if any: every control waits for it, and only the one pressed says it is working. The ref
  // holds the guard before the page has drawn the state.
  const [doing, setDoing] = React.useState(null);
  const doingRef = React.useRef(null);
  const busy = doing !== null;
  const [composing, setComposing] = React.useState(false);
  const [showHidden, setShowHidden] = React.useState(false);
  const [toastNode, flash] = window.usePPToast();
  // Who may add, change or remove a message: the role store's answer, View-as included.
  const canAct = !!(window.canDo && window.canDo("approve"));
  const hasWhatsApp = (window.__CHANNELS || []).some((c) => c.kind === "whatsapp");
  const bizName = (window.__SETTINGS && window.__SETTINGS.config && window.__SETTINGS.config.brain && window.__SETTINGS.config.brain.business_name) || null;

  if (templates === undefined) {
    return (
      <div className="reports" data-testid="messages-real">
        <div className="cm-standing">{window.__DEMO_MODE ? "Messages reads a real workspace — what WhatsApp has approved for it." : "Reading your messages…"}</div>
      </div>
    );
  }
  if (templates === null) {
    return (
      <div className="reports" data-testid="messages-real">
        <div className="cm-standing">Your messages couldn&rsquo;t be loaded right now</div>
        <div className="rp-body">
          <FailedRead kind="card" what="your messages" body="The receptionist keeps sending; this page just can't show them at the moment." surface="settings" testid="messages-failed" />
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

  const run = async (what, fn, said) => {
    if (!window.__templates || doingRef.current) return;
    doingRef.current = what;
    setDoing(what);
    const r = await fn();
    doingRef.current = null;
    setDoing(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? said(r) : <>{r.message}</> });
  };
  const rename = (t, draft) => {
    const title = draft.replace(/\s+/g, " ").trim() || null;
    run(`rename:${t.id}`, () => window.__templates.rename(t.id, title), () => (title ? <>Now called <b>{title}</b> — WhatsApp still knows it as {t.name}</> : <><b>{t.name}</b> goes by its name again</>));
  };
  const toggleHidden = (t) => run(`hide:${t.id}`, () => (t.hidden_at ? window.__templates.show(t.id) : window.__templates.hide(t.id)), () => <><b>{tplTitle(t)}</b> {t.hidden_at ? "is back in the composers" : "is out of the composers — still on file"}</>);
  const remove = (t) => run(`delete:${t.id}`, () => window.__templates.remove(t.id), () => <><b>{tplTitle(t)}</b> deleted — sends that named it fail from now on</>);
  const addStarters = (keys, languages) => run(`add:${keys ? keys.join(",") : "all"}:${languages.join(",")}`, () => window.__templates.addStarters({ ...(keys ? { keys } : {}), languages }), (r) => <>{window.starterWords ? window.starterWords(r.data) : "Added"}</>);
  const sync = () => run("sync", () => window.__syncTemplates(), (r) => <>{r.data.seen} template{r.data.seen === 1 ? "" : "s"} from WhatsApp — {r.data.approved} approved, {r.data.marketing} marketing</>);
  const card = (g) => <MessageCard key={g.key} g={g} langs={langs} bizName={bizName} canAct={canAct && hasWhatsApp} busy={busy} doing={doing} S={S} onAdd={(gg, lang) => addStarters([gg.starter.key], [lang.id])} onRename={rename} onHide={toggleHidden} onDelete={remove} />;

  return (
    <div className="reports" data-testid="messages-real">
      {/* One line above the messages, the way Today, Reports and People say their
          numbers (#556, #557, #558). The page whose whole job is to show the
          messages opened with a title the top bar already showed, a sub-headline
          that ran to six lines at 390px and a three-cell stat strip: about 590px
          of a phone, and not one message card on the first screen. */}
      <div className="cm-standing" data-testid="messages-standing">
        <span className="cm-standing-lead" data-tip="What the receptionist and your campaigns send on WhatsApp, as the customer sees it. Written here or in WhatsApp Manager, WhatsApp approves either way. A marketing template can only go to people who said yes to offers.">
          {shown.length === 0 ? "No message on file yet" : `${shown.length} ${shown.length === 1 ? "message" : "messages"}`}
        </span>
        {shown.length > 0 && (
          <span className="cm-standing-part">
            <span className="cm-standing-dot" aria-hidden="true">·</span>
            <span className="tabular">{approved} approved{pending ? `, ${pending} in review with WhatsApp` : ""}</span>
          </span>
        )}
        {missingTotal > 0 && (
          <span className="cm-standing-part">
            <span className="cm-standing-dot" aria-hidden="true">·</span>
            <span className="tabular">{missingTotal} of the starter set not added</span>
          </span>
        )}
        <span className="cm-standing-part">
          <span className="cm-standing-dot" aria-hidden="true">·</span>
          <span>{lastSync ? `synced ${tplAgo(lastSync)}` : "never synced from WhatsApp"}</span>
        </span>
      </div>

      <div className="cl-controls">
        <div className="cl-controls-right">
          {/* The page's own acts stay where they are for every role and say who may
              (window.gate); a message's rename, hide and delete stay with those who may. */}
          {!canAct && hasWhatsApp && <span className="bc-excl-hint" data-testid="messages-role">{window.gateTitle("approve", "rename, hide or delete a message")}</span>}
          {hasWhatsApp && missing.filter((m) => m.n > 0).map((m) => (
            <button key={m.lang.id} className="btn btn-sm" disabled={busy} onClick={() => addStarters(null, [m.lang.id])} data-testid="starter-add-all" {...window.gate("approve", "add a starter message")}>{doing === `add:all:${m.lang.id}` ? "Adding…" : `Add ${m.n === (S ? S.list.length : 0) ? "all " : "the "}${m.n} in ${m.lang.label}`}</button>
          ))}
          {hasWhatsApp && <button className="btn btn-sm" onClick={sync} disabled={busy} data-testid="sync-templates" {...window.gate("approve", "sync from WhatsApp")}>{doing === "sync" ? "Syncing…" : "Sync from WhatsApp"}</button>}
          {hasWhatsApp && <button className="btn btn-primary btn-sm" onClick={() => setComposing((c) => !c)} data-testid="template-new" {...window.gate("approve", "write a message")}><Icon name="plus" size={12} /> New message</button>}
        </div>
      </div>

      <div className="rp-body">
        {/* A failed read of the numbers is not "no number": say what could not be read. */}
        {window.__CHANNELS === null ? (
          <FailedRead kind="card" what="your WhatsApp number" body="What is on file is below; adding and syncing wait until the number can be read." surface="settings" testid="messages-channels-failed" />
        ) : !hasWhatsApp && (
          <EmptyState kind="card" glyph="phone" title="Connect a WhatsApp number first" body="Messages belong to a number's account." action={{ label: "Open Connections", to: "admin/integrations" }} testid="messages-no-number" />
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
          {!hasWhatsApp && customGroups.length === 0 && <EmptyState kind="line" title="Nothing on file yet." />}
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

// The page is real on every workspace. The standalone mockup routes here too —
// Campaigns · Messages is a tab there — and has no templates to read, so the
// waiting line above says which of the two is looking.
const MessagesPage = () => <MessagesReal />;

window.MessagesPage = MessagesPage;
