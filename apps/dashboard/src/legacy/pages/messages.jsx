/* global React, Icon, Confirm, EmptyState, FailedRead, StatePill */
// Campaigns › Templates: the wording the receptionist and the campaigns send on
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
// "English", "English and Spanish", "English, Spanish and Portuguese" -- the
// languages a workspace answers in, said the way a person says a list. The line
// under the messages named English and Spanish in the markup, so a workspace
// that answers in neither read a sentence about two languages it does not have.
const tplAnd = (words) => (words.length < 2 ? words[0] || "" : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);
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

// A message's state in ONE language, in the app's one vocabulary (tone.ts, through
// the chrome bridge): a tone this file never picks for itself. A language Meta has
// never seen has no state -- it is an absence, and absence is drawn, not coloured.
const tplSaid = (status) => (status && window.__chrome && window.__chrome.state ? window.__chrome.state("template", status) : null);
// "EN", "ES", "PT" -- the slot's two letters. A row has one slot per language the
// workspace answers in, and a label ("English (US)") does not fit a slot.
const tplShort = (id) => String(id || "").slice(0, 2).toUpperCase();
// One line, whatever the message does with newlines and tabs: a row is one line
// tall, and a template written in WhatsApp Manager can be six paragraphs.
const tplOneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

const useMessages = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:settings", bump);
    return () => window.removeEventListener("surface:settings", bump);
  }, []);
  return window.__TEMPLATES_ALL;
};

// One language of one message, as a slot: filled when WhatsApp approved it,
// dotted while WhatsApp is reading it, struck through when WhatsApp refused it,
// and an open dashed ring for a language this message does not exist in. The
// glyph carries the state and the two letters carry the language, so pressing
// it does one thing -- put that language in view -- and the row is readable
// across sixteen messages without reading sixteen words.
const MsgSlot = ({ lang, status, on, onPick }) => {
  const said = tplSaid(status);
  const tone = said ? said.tone : "none";
  return (
    <button
      type="button"
      className={`msg-slot${on ? " on" : ""}`}
      data-tone={tone}
      aria-pressed={on}
      onClick={onPick}
      title={`${lang.label} — ${said ? said.label : "not on WhatsApp"}`}
      data-testid="template-lang"
    >
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="5.1" fill={tone === "ok" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeDasharray={!said ? "2 2.1" : tone === "info" ? "1.3 2.3" : undefined} />
        {tone === "danger" && <path d="M3.8 10.2 L10.2 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
      </svg>
      <span className="msg-slot-k">{tplShort(lang.id)}</span>
    </button>
  );
};

// One message, as a row: what it is, what each of its languages is doing, and
// what sends it — the four things you scan sixteen of at once. The message
// itself, and the verbs that change it, are in the row it opens.
//
// It was a card carrying the whole bubble, and sixteen of those is about three
// thousand pixels of chat nobody can compare. The words are still the point, so
// a line of them rides the row and the WHOLE message — heading, what varies per
// person, footer, buttons — is one press away, for one message at a time.
const MessageRow = ({ g, langs, bizName, canAct, busy, doing = null, S, open = false, onOpen, onAdd, onRename, onHide, onDelete }) => {
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
  // What sends this MESSAGE, in the words the bridge composed: the playbooks,
  // the broadcasts a person sent and the Inbox's booking template, joined on the
  // server. Keyed by name, because a message is one thing in several languages.
  // Null: the usage was not read, and the row says nothing rather than guessing.
  const named = g.rows.find((r) => r.row);
  const gName = g.starter ? g.starter.name : named ? named.row.name : null;
  const use = gName && window.__TEMPLATE_USE ? window.__TEMPLATE_USE[gName] || null : null;
  // The playbooks that send the template in view, found the way a run finds it: by name and language. Null: not read.
  // Per ROW, not per message: this is what a delete of ONE language must refuse on.
  const pbRows = window.__PLAYBOOKS ? window.__PLAYBOOKS.rows || [] : null;
  const users = row && pbRows ? pbRows.filter((p) => p.template_name === row.name && p.template_language === row.language) : [];
  const sending = users.filter((p) => p.state === "running").map((p) => p.name);
  const paused = users.filter((p) => p.state !== "running").map((p) => p.name);
  const quoted = (names) => names.map((n) => `“${n}”`).join(", ");
  const pausedWords = !pbRows ? " Chanlytics couldn't check which playbooks send it."
    : paused.length === 1 ? ` ${quoted(paused)} is paused and sends it: if it resumes, its runs skip until it has another template.`
    : paused.length > 1 ? ` ${quoted(paused)} are paused and send it: if they resume, their runs skip until they have another template.` : "";
  // Marketing or not is a RULE, not a label: a marketing message may only go to
  // people who said yes to offers, so it rides the row as its own mark rather
  // than being discovered at send time. A starter declares its purpose; a row
  // carries Meta's own category.
  const offer = /market/i.test(String((row && row.category) || g.purpose || ""));
  return (
    <div className={`msg-row${open ? " is-open" : ""}${row && row.hidden_at ? " is-hidden" : ""}`} data-testid={g.starter ? "starter-row" : "custom-row"}>
      <div className="msg-row-line">
        {/* The press that opens it covers the mark and the words -- the part of a
            row that is not already something you can press. The languages and
            what sends it are their own acts, in their own cells. */}
        <button type="button" className="msg-row-what" onClick={onOpen} aria-expanded={open} data-testid="template-open">
          <span className="msg-row-mark" data-kind={offer ? "offer" : "note"} data-tip={offer ? "An offer — WhatsApp calls this marketing, so it only reaches people who said yes to offers." : "A note — WhatsApp calls this utility, so it reaches anyone it is sent to."}>
            <Icon name={offer ? "tag" : "bell"} size={12} />
          </span>
          <span className="msg-row-said">
            <span className="msg-row-titles">
              <span className="msg-row-title">{g.title}</span>
              {gName && <span className="msg-row-name mono">{gName}</span>}
              {/* The state of the language in view, in words -- when there is
                  something to say. Approved is what every message on a working
                  workspace is, and eight green "Approved" pills down a list is
                  the state said twice: the slot beside it already draws it. */}
              {row && row.meta_status !== "approved" && <StatePill kind="template" value={row.meta_status} testid="template-status" />}
            </span>
            {/* A line of the words, so a row IS the message rather than a name for
                one -- filled the one way this product fills a message (mpFill), so
                the row reads as the customer would read it rather than as {{2}}.
                The whole of it, with what varies per person marked, is in the fold. */}
            <span className="msg-row-words">{tplOneLine(window.mpFill ? window.mpFill(body, values) : body) || g.purpose}</span>
          </span>
        </button>
        {/* One control, one job. A language button switched the language AND carried
            that language's status as a dot plus words, so the thing you press to
            read the Spanish version was also the only place its approval was
            written. A slot is the language; its glyph is that language's state,
            drawn rather than written, so every language of every message is legible
            without reading -- and the words for the one in view are the pill above. */}
        <span className="msg-row-langs" role="group" aria-label={`Language for ${g.title}`}>
          {g.rows.map(({ lang, row: r }) => (
            <MsgSlot key={lang.id} lang={lang} status={r ? r.meta_status : null} on={lang.id === langId} onPick={() => { setLangId(lang.id); closeMenu(); if (!open) onOpen(); }} />
          ))}
        </span>
        {/* What sends it -- every source, not only the playbooks.
            This line read the playbooks alone, off another surface's global, so
            the most it could honestly say was "No playbook sends it": a message
            two broadcasts had gone out with, or the one the Inbox books with,
            read the same as one nothing has ever touched. The server joins the
            three (a playbook names its template, a broadcast names its template,
            the Inbox books by rule) and hands down the sentence, so "Nothing
            sends it" is now a reading rather than a guess about what it could
            not see. A name missing from the map is usage unread: say nothing. */}
        <span className="msg-row-use">
          {use && (use.unused
            ? <span className="msg-card-meta is-unused" data-testid="template-users">Nothing sends it</span>
            : <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(use.playbook ? `outbound/${use.playbook}` : "outbound")} data-testid="template-users">Sent by {use.words}</button>)}
        </span>
      </div>
      {/* A refusal was a `title=` on the language button and a tail on the meta
          line: 10px, and on a touch screen nowhere at all. It is the row's own
          line now, in the tone of a refusal -- and on the ROW rather than in the
          fold, because a message that cannot be sent should not have to be
          opened to say so. */}
      {/* A message WhatsApp approved that this product still cannot put on the
          wire: the composers do not offer it, so its row says why rather than
          leaving it looking available. */}
      {row && row.blocked && (
        <p className="bc-excl-hint warn" data-testid="template-blocked">Can&rsquo;t be sent from here: it has {row.blocked}. It still works in WhatsApp Manager.</p>
      )}
      {row && row.meta_status === "rejected" && row.rejected_reason && (
        <p className="bc-excl-hint danger" data-testid="template-rejected">WhatsApp refused this one: {String(row.rejected_reason).toLowerCase().replace(/_/g, " ")}. Change the words and send it back.</p>
      )}
      {open && (
        <div className="msg-row-open" data-testid="template-open-body">
          <window.MessagePreview from={bizName || "Your business"} body={body} values={values} header={row ? row.header : null} footer={footer} buttons={row ? row.buttons : null} compact />
          <div className="msg-card-foot">
            {row
              ? <span className="msg-card-meta">{row.name}{row.category ? ` · ${row.category}` : ""}{row.source === "chanlytics" ? " · made here" : " · from WhatsApp Manager"}</span>
              : <span className="msg-card-meta">Not on WhatsApp in {cur ? cur.lang.label : "this language"} yet — the words WhatsApp would review</span>}
            {/* The rating WhatsApp gives the template in view, as of the last sync; nothing when none was synced. */}
            {row && row.quality && <StatePill kind="template_quality" value={String(row.quality).toUpperCase()} testid="template-quality" />}
            {/* The one language this message is missing, offered where its words
                already are: the empty slot puts that language in view, and this
                adds it. It was a button per missing language on every card. */}
            {!row && g.starter && cur && (
              <button className="btn btn-sm" disabled={busy} onClick={() => onAdd(g, cur.lang)} data-testid="starter-add" {...window.gate("approve", "add a starter template")}>{doing === `add:${g.starter.key}:${cur.lang.id}` ? "Adding…" : `Add ${cur.lang.label}`}</button>
            )}
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
                  <span>{S && S.stillSends ? S.stillSends(sending) : `${quoted(sending)} still uses this template.`}</span>
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
        </div>
      )}
    </div>
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
  // Which message is open, by its key. One at a time: the words of two
  // messages side by side is the wall this page stopped being.
  const [openKey, setOpenKey] = React.useState(null);
  const [toastNode, flash] = window.usePPToast();
  // Who may add, change or remove a message: the role store's answer, View-as included.
  const canAct = !!(window.canDo && window.canDo("approve"));
  const hasWhatsApp = (window.__CHANNELS || []).some((c) => c.kind === "whatsapp");
  const bizName = (window.__SETTINGS && window.__SETTINGS.config && window.__SETTINGS.config.brain && window.__SETTINGS.config.brain.business_name) || null;

  if (templates === undefined) {
    return (
      <div className="reports" data-testid="messages-real">
        <div className="cm-standing">{window.__DEMO_MODE ? "Templates reads a real workspace — what WhatsApp has approved for it." : "Reading your templates…"}</div>
      </div>
    );
  }
  if (templates === null) {
    return (
      <div className="reports" data-testid="messages-real">
        <div className="cm-standing">Your templates couldn&rsquo;t be loaded right now</div>
        <div className="rp-body">
          <FailedRead kind="card" what="your templates" body="The receptionist keeps sending; this page just can't show them at the moment." surface="settings" testid="messages-failed" />
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
  // A workspace with none of the set is starting, not broken: it is offered the
  // set, while one part-way through is told what the hole costs.
  const allMissing = missingTotal > 0 && missingTotal === starters.length * langs.length;
  const addingAll = doing === `add:all:${langs.map((l) => l.id).join(",")}`;
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
  const card = (g) => <MessageRow key={g.key} g={g} langs={langs} bizName={bizName} canAct={canAct && hasWhatsApp} busy={busy} doing={doing} S={S} open={openKey === g.key} onOpen={() => setOpenKey((k) => (k === g.key ? null : g.key))} onAdd={(gg, lang) => addStarters([gg.starter.key], [lang.id])} onRename={rename} onHide={toggleHidden} onDelete={remove} />;

  return (
    <div className="reports" data-testid="messages-real">
      {/* One line above the messages, the way Today, Reports and People say their
          numbers (#556, #557, #558). The page whose whole job is to show the
          messages opened with a title the top bar already showed, a sub-headline
          that ran to six lines at 390px and a three-cell stat strip: about 590px
          of a phone, and not one message card on the first screen. */}
      <div className="cm-standing" data-testid="messages-standing">
        <span className="cm-standing-lead" data-tip="What the receptionist and your campaigns send on WhatsApp, as the customer sees it. Written here or in WhatsApp Manager, WhatsApp approves either way. A marketing template can only go to people who said yes to offers.">
          {shown.length === 0 ? "No template on file yet" : `${shown.length} ${shown.length === 1 ? "template" : "templates"}`}
        </span>
        {shown.length > 0 && (
          <span className="cm-standing-part">
            <span className="cm-standing-dot" aria-hidden="true">·</span>
            <span className="tabular">{approved} approved{pending ? `, ${pending} in review with WhatsApp` : ""}</span>
          </span>
        )}
      </div>

      <div className="cl-controls">
        <div className="cl-controls-right">
          {/* The page's own acts stay where they are for every role and say who may
              (window.gate); a message's rename, hide and delete stay with those who may. */}
          {!canAct && hasWhatsApp && <span className="bc-excl-hint" data-testid="messages-role">{window.gateTitle("approve", "rename, hide or delete a template")}</span>}
          {/* Being in step with WhatsApp is a STATE the page is in, not a chore the
              owner remembers. It was a button beside two others, permanently loud,
              whose answer was a toast of counts. The state says when it last looked
              and presses to look again; while it looks, it is the only control that
              says it is working (C20 holds that for every control here). */}
          {hasWhatsApp && (
            <button
              className={`tpl-fresh${doing === "sync" ? " is-busy" : ""}`}
              onClick={sync}
              disabled={busy}
              data-testid="sync-templates"
              aria-label="Check WhatsApp for changes"
              {...window.gate("approve", "sync from WhatsApp")}
            >
              <span className={`tpl-fresh-dot${lastSync ? "" : " never"}`} aria-hidden="true" />
              {doing === "sync" ? "Checking WhatsApp…" : lastSync ? `In step with WhatsApp · ${tplAgo(lastSync)}` : "Never checked with WhatsApp"}
              <Icon name="refresh" size={11} />
            </button>
          )}
          {hasWhatsApp && <button className="btn btn-primary btn-sm" onClick={() => setComposing((c) => !c)} data-testid="template-new" {...window.gate("approve", "write a template")}><Icon name="plus" size={12} /> New template</button>}
        </div>
      </div>

      <div className="rp-body">
        {/* A failed read of the numbers is not "no number": say what could not be read. */}
        {window.__CHANNELS === null ? (
          <FailedRead kind="card" what="your WhatsApp number" body="What is on file is below; adding and syncing wait until the number can be read." surface="settings" testid="messages-channels-failed" />
        ) : !hasWhatsApp && (
          <EmptyState kind="card" glyph="phone" title="Connect a WhatsApp number first" body="Templates belong to a number's account." action={{ label: "Open Connections", to: "admin/integrations" }} testid="messages-no-number" />
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
          {/* The gap, where the gap is, in one sentence.
              It was two buttons in the toolbar doing arithmetic -- "Add the 3 in
              English", "Add the 7 in Spanish" -- whose labels were a remainder that
              changed each time they were pressed, and whose asymmetry read as
              breakage when it only meant English was added first. Meta's model is
              one template per name PER LANGUAGE; that is the product's problem, not
              the owner's. The set is the set: one line, one press, and the
              consequence rather than the count. */}
          {hasWhatsApp && S && (
            <div className="msg-intro" data-testid="starters">
              {missingTotal === 0
                ? <span className="rp2-foot">The starter set is here in {tplAnd(langs.map((l) => l.label))} — {S.list.length} messages for the moments Chanlytics acts on.</span>
                : (
                  <>
                    <span className="rp2-foot">
                      {allMissing
                        ? <>The starter set is {S.list.length} messages for the moments Chanlytics acts on, in {tplAnd(langs.map((l) => l.label))}. WhatsApp reviews each, usually within minutes.</>
                        : <>{missingTotal} of the starter set {missingTotal === 1 ? "is" : "are"} missing: {tplAnd(missing.filter((m) => m.n > 0).map((m) => `${m.n} in ${m.lang.label}`))}. A message that exists in one language reaches only the customers who read it.</>}
                    </span>
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => addStarters(null, langs.map((l) => l.id))}
                      data-testid="starter-add-all"
                      {...window.gate("approve", "add a starter template")}
                    >
                      {addingAll ? "Adding…" : allMissing ? "Add the starter set" : `Add the missing ${missingTotal}`}
                    </button>
                  </>
                )}
            </div>
          )}
          {/* What each column of a row is, once, above them -- the way the People
              and Leads tables name theirs. A list of sixteen rows whose third
              cell is two small glyphs needs a word for that cell; sixteen cards
              did not, which is part of why they were cards. */}
          <div className="msg-list">
            {/* Inside the list, not above it: the list is the container the row's
                columns are measured against, and a heading outside it kept its
                three columns while the rows under it had stacked to one. */}
            {(starters.length > 0 || customGroups.length > 0) && (
              <div className="msg-list-head" aria-hidden="true">
                <span>The message</span>
                <span>Languages</span>
                <span>What sends it</span>
              </div>
            )}
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
            {showHidden && <div className="msg-list">{hiddenGroups.map(card)}</div>}
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
