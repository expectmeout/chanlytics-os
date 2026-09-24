/* global React, Icon, Confirm, EmptyState, FailedRead, StatePill */
// Campaigns › Templates: the wording the receptionist and the campaigns send on
// WhatsApp, shown as the customer sees it. One row per message — the
// starter set in the library's order, then what the workspace wrote or
// synced — opening on the bubble for the language in view, its languages
// (approved, in review, or one tap to add), and the verbs an operator
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
// A number said as a word inside a sentence -- "the starter set is eight messages"
// -- the way a person says it; past twelve, the figure.
const TPL_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const tplSpell = (n) => TPL_WORDS[n] || String(n);
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
// "EN", "PT" -- the chip's letters, with the place only beside another code of the
// same language ("EN-US" and "EN-GB"). A label ("English (US)") is the list's.
const tplTag = (id, among) => (window.__starters && window.__starters.langTag ? window.__starters.langTag(id, among) : String(id || "").slice(0, 2).toUpperCase());
const tplLangLabel = (id) => (window.__starters && window.__starters.langLabel ? window.__starters.langLabel(id) : id);
// One line, whatever the message does with newlines and tabs: a row is one line
// tall, and a template written in WhatsApp Manager can be six paragraphs.
const tplOneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
// A slot by name inside a one-line quote -- "{first name}", "{business}", "{link}" --
// by what fills it where the library knows, else by the label it was given.
const TPL_SLOT_WORDS = { first_name: "first name", business_name: "business", booking_link: "link", visit_when: "time", visit_service: "service", proposal_link: "proposal link" };
const tplSlotWord = (kind, label, n) => TPL_SLOT_WORDS[kind] || String(label || `value ${n}`).toLowerCase().replace(/^(the|la|el|los|las) /, "");

const useMessages = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:settings", bump);
    return () => window.removeEventListener("surface:settings", bump);
  }, []);
  return window.__TEMPLATES_ALL;
};

// The languages a message's one chip opens (contracts messageLanguageChoices):
// the ones WhatsApp holds with their state, the ones the starter library has
// written, and every other language WhatsApp takes when one may be added. With
// no library read, the ones on file, as they are.
const tplChoices = (S, input) => (S && S.languageChoices
  ? S.languageChoices(input)
  : input.onFile.map((r) => ({ id: r.language, label: r.language, name: r.language, native: "", group: "on", status: r.meta_status || "approved" })));

// One message, as a row: what it is, what sends it and how much of it went out —
// the things you scan sixteen of at once. The message itself, its languages and
// the verbs that change it are in the row it opens.
//
// It was a card carrying the whole bubble, and sixteen of those is about three
// thousand pixels of chat nobody can compare. The words are still the point, so
// a line of them rides the row and the WHOLE message — heading, what varies per
// person, footer, buttons — is one press away, for one message at a time.
const MessageRow = ({ g, langs, bizName, canAct, canAdd = false, addWhy = null, busy, doing = null, S, open = false, onOpen, onAdd, onRename, onHide, onDelete, onWritten }) => {
  const present = g.rows.filter((r) => r.row);
  const [langId, setLangId] = React.useState(present[0] ? present[0].lang.id : (langs[0] ? langs[0].id : "en_US"));
  // The language that was in view before one nobody has written was picked: the
  // words a translation is written from, and where Cancel goes back to.
  const [back, setBack] = React.useState(null);
  // A language picked from "Translate into": the one being written now. Only a
  // language picked there is ever written -- one that simply stopped being on
  // file (deleted, or gone with a sync) is not a request to write it again.
  const [adding, setAdding] = React.useState(null);
  // A language just sent to WhatsApp, until its row arrives with the next read:
  // the fold says it went, rather than offering the same words to send twice.
  const [sentLang, setSentLang] = React.useState(null);
  const [menu, setMenu] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [arm, setArm] = React.useState(false);
  // The language in view: the one picked while it is on file, written by the
  // library, being written or just sent; otherwise the message's first.
  const known = (id) => present.some((r) => r.lang.id === id) || !!(g.starter && g.starter.texts && g.starter.texts[id]);
  const view = known(langId) || langId === adding || langId === sentLang ? langId : present[0] ? present[0].lang.id : langs[0] ? langs[0].id : "en_US";
  // Any language WhatsApp takes, not only one of the message's own: a new one has
  // no row and no library words until it is written.
  const cur = g.rows.find((r) => r.lang.id === view) || { lang: { id: view, label: tplLangLabel(view) }, row: null };
  const row = cur.row;
  // The library's words ONLY where it wrote them: `starterText` answers English for
  // a language it has not, and English under a Portuguese heading is not Portuguese.
  const written = !!(g.starter && g.starter.texts && g.starter.texts[view]);
  const starterText = g.starter && S && written ? S.text(g.starter, view) : null;
  const own = tplOwn();
  // What a new language is written from: the language that was in view when it
  // was picked, else the first WhatsApp approved, else the first on file; a
  // starter nobody added, the library's English.
  const fromRow = (back && present.find((r) => r.lang.id === back)) || present.find((r) => r.row.meta_status === "approved") || present[0] || null;
  const source = fromRow ? { ref: { id: fromRow.row.id }, from: fromRow.lang.id, name: fromRow.row.name }
    : g.starter ? { ref: { starter: g.starter.key, from: "en_US" }, from: "en_US", name: g.starter.name } : null;
  // Why Chanlytics cannot write it in another language: a heading, or a button
  // other than one link, would not come with it (contracts templateUntranslatable).
  const untranslatable = fromRow && S && S.untranslatable ? S.untranslatable(fromRow.row) : null;
  const mayAdd = !!(canAdd && source && !untranslatable);
  // The body with its slots still in it, and the words that fill them: the
  // preview marks what varies per person, which a filled string cannot.
  const body = row ? row.body_preview || "" : starterText ? starterText.body : "";
  const values = !S ? null : row ? S.rowValues(row, own) : g.starter ? S.starterValues(g.starter, view, own.business_name, own.booking_link) : null;
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
  // How many of it went out and when the latest did, in the words the bridge
  // composed: the people a run SENT to and what the Inbox sent on it, never the
  // audience a run was scheduled for. Keyed by name like the usage; null is not read.
  // A starter with no row has no entry -- the map is one per message ON FILE -- and
  // says it was never added, when the sends were read at all.
  const sent = gName && window.__TEMPLATE_SENT ? window.__TEMPLATE_SENT[gName] || (g.starter && !present.length ? { count: null, when: "Not added" } : null) : null;
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
  // Said in words beside the title, once per MESSAGE, when a language of it is
  // not simply approved: "Spanish in review", "Spanish rejected". It was the state
  // of whichever language was in view, so a message half in review read as fine
  // until its other language was pressed. It is the ONE place a language rides the
  // closed row: the languages themselves are the open row's, where a message is
  // read and written, and where it came from (WhatsApp Manager) is its foot's.
  const flagged = g.rows.map(({ lang, row: r }) => { const said = r && r.meta_status !== "approved" ? tplSaid(r.meta_status) : null; return said ? { lang, said } : null; }).find(Boolean);
  // The languages a running playbook sends this message in (a run sends its one
  // `template_language` to everyone on it, run-playbook.ts), and the first of them
  // WhatsApp does not hold approved: every run of that playbook is skipped until it
  // is. Null when the playbooks were not read.
  const sentIn = pbRows && gName ? [...new Set(pbRows.filter((p) => p.template_name === gName && p.state === "running").map((p) => p.template_language))] : null;
  const skipped = sentIn ? sentIn.find((id) => { const r = g.rows.find((x) => x.lang.id === id); return !r || !r.row || r.row.meta_status !== "approved"; }) || null : null;
  const skippedAt = skipped ? g.rows.find((x) => x.lang.id === skipped) || null : null;
  const skippedMissing = !!skipped && !(skippedAt && skippedAt.row);
  const tag = flagged ? { words: `${flagged.lang.label} ${flagged.said.label.toLowerCase()}`, tone: flagged.said.tone }
    : skippedMissing ? { words: `${skippedAt ? skippedAt.lang.label : tplLangLabel(skipped)} missing`, tone: "warn" } : null;
  // The row asks for attention when a language something sends is not one WhatsApp
  // holds approved: those sends are refused or skipped. A language nobody sends is
  // not that -- written or not, it holds nobody back -- and neither is a language in
  // review beside the approved one a playbook sends. Without the playbooks read, a
  // language on file that is not approved, on a message something sends. A message
  // nothing sends is the other way round -- quiet, its title dimmed -- because
  // nothing is happening with it at all.
  const refused = g.rows.some(({ row: r }) => r && r.meta_status !== "approved");
  const attn = sentIn ? !!skipped : !!(use && !use.unused && refused);
  const dim = !!(use && use.unused);
  // A line of the words with its slots NAMED -- "Hi {first name} -- it's been a
  // while" -- in quotes, so a row reads as the message it is and shows at a glance
  // what varies per person. The whole of it, filled with this business's own
  // name and link, is in the fold.
  // A language nobody has written yet quotes the words it is being written from,
  // so the row still reads as the message while its new language is drafted.
  const lineRow = row || (!starterText && fromRow ? fromRow.row : null);
  const lineText = lineRow ? lineRow.body_preview || "" : starterText ? starterText.body : g.starter && S ? S.text(g.starter, "en_US").body : "";
  const tplLike = lineRow || (g.starter ? { name: g.starter.name, language: starterText ? view : "en_US", variables: [] } : null);
  const kinds = S && tplLike ? S.slotKinds(tplLike) : [];
  const labels = S && tplLike ? S.slotLabels(tplLike) : [];
  const words = tplOneLine(String(lineText || "").replace(/\{\{(\d+)\}\}/g, (_, n) => `{${tplSlotWord(kinds[n - 1], labels[n - 1], n)}}`));
  // The one language control: the language in view, its state drawn, how many
  // more the message has, and every language there is behind it.
  const codes = present.map((r) => r.lang.id);
  const choices = tplChoices(S, {
    onFile: present.map((r) => ({ language: r.lang.id, meta_status: r.row.meta_status })),
    ready: g.starter ? langs.map((l) => l.id).filter((id) => g.starter.texts && g.starter.texts[id]) : [],
    canAdd: mayAdd,
  });
  const note = addWhy || (untranslatable ? `Chanlytics can’t write this one in another language: ${untranslatable}. Add its other languages in WhatsApp Manager.` : null);
  const pick = (id, choice) => {
    if (id !== view) {
      // Back to a language that exists, never to one that was only being drafted.
      if (row || written) setBack(view);
      setLangId(id);
    }
    // Picked from "Translate into": the one language this row may now write.
    setAdding(choice && choice.group === "add" ? id : null);
    closeMenu();
  };
  const cancelNew = () => {
    setLangId(back || (present[0] ? present[0].lang.id : langs[0] ? langs[0].id : "en_US"));
    setBack(null);
    setAdding(null);
  };
  // The one control for a message's languages, where the message is read and written: the language in view with its
  // state drawn (filled approved, dotted in review, struck refused, a dashed ring for none), "+1" for the rest, and
  // every language there is behind it -- one WhatsApp holds, one the library wrote, or a new one to write. It was a
  // column of every closed row ("● EN ⌄" sixteen times), for a choice that changes nothing about who a run reaches:
  // a run sends one language to everyone on it.
  const langBar = (
    <div className="msg-lang">
      <span className="msg-lang-k" aria-hidden="true">Language</span>
      <window.LanguagePicker
        value={view}
        choices={choices}
        groups={S && S.languageGroups ? S.languageGroups : {}}
        status={row ? row.meta_status : null}
        tag={tplTag(view, codes)}
        more={codes.filter((c) => c !== view).length}
        label={`Language for ${g.title}`}
        note={note}
        onPick={pick}
        testid="template-lang"
      />
    </div>
  );
  return (
    <div className={`msg-row${open ? " is-open" : ""}${attn ? " is-attn" : ""}${dim ? " is-dim" : ""}${row && row.hidden_at ? " is-hidden" : ""}`} data-template={gName || undefined} data-testid={g.starter ? "starter-row" : "custom-row"}>
      {/* A press anywhere on the line that is not one of its controls opens it (cmRowPress), as a person's row does. */}
      <div className="msg-row-line" onClick={window.cmRowPress}>
        {/* The press that opens it covers the mark and the words -- the part of a
            row that is not already something you can press. What sends it is its
            own act, in its own cell; the languages are the open row's. */}
        <button type="button" className="msg-row-what" onClick={onOpen} aria-expanded={open} data-row-open data-testid="template-open">
          <span className="mark msg-row-mark" data-kind={offer ? "offer" : "note"} data-tip={offer ? "An offer — WhatsApp calls this marketing, so it only reaches people who said yes to offers." : "A note — WhatsApp calls this utility, so it reaches anyone it is sent to."}>
            <Icon name={offer ? "gift" : "bell"} size={13} />
          </span>
          <span className="msg-row-said">
            <span className="msg-row-titles">
              {/* The name WhatsApp knows it by is the open row's (its foot), not every row's: an owner reads the
                  title and the words, and "winback_offer" in type is nothing they act on. */}
              <span className="msg-row-title">{g.title}</span>
              {tag && <span className={`pill${tag.tone && tag.tone !== "plain" ? ` pill-${tag.tone}` : ""} msg-tag`} data-tone={tag.tone} data-testid="template-status">{tag.words}</span>}
            </span>
            <span className="msg-row-words">{words ? `“${words}”` : g.purpose}</span>
          </span>
        </button>
        {/* What sends it -- every source, not only the playbooks -- and under it,
            what that thing is doing: "runs daily at 10:00", "a run is waiting on
            you", the latest two broadcasts a person sent with it. The server joins
            the three (a playbook names its template, a broadcast names its
            template, the Inbox books by rule) and hands down both lines, so
            "Nothing sends it" is a reading rather than a guess about what it
            could not see. A name missing from the map is usage unread: say nothing. */}
        <span className="msg-row-use">
          {use && (use.unused
            ? <>
                <span className="msg-use-none" data-testid="template-users"><span className="msg-use-ring" aria-hidden="true" />Nothing sends it</span>
                {!present.length && g.starter && <span className="msg-use-note">not on WhatsApp yet</span>}
              </>
            : <>
                <button type="button" className="msg-use-link" onClick={() => window.CHANLY.nav(use.playbook ? `outbound/${use.playbook}` : "outbound")} data-testid="template-users">{use.words}</button>
                {use.note && <span className="msg-use-note">{use.note}</span>}
              </>)}
        </span>
        {/* What LEFT, and when the latest did: counted off the people a run sent
            to, which is what Reports calls "Messages sent" -- not a run's
            `recipient_count`, the audience it was scheduled for. "sent" rides the
            count, because a stacked row has no heading and a screen reader never
            hears the heading at all. A message that never went out says so under
            a dash, where a number would be; one never added says that instead. */}
        <span className="msg-row-sent" data-testid="template-sent">
          {sent && (sent.count
            ? <>
                <span className="msg-row-sent-n">{sent.count}<span className="msg-row-sent-unit"> sent</span></span>
                {sent.when && <><span className="msg-row-sent-dot" aria-hidden="true">·</span><span className="msg-row-sent-when">{sent.when}</span></>}
              </>
            : <>
                <span className="msg-row-sent-n is-none" aria-hidden="true">—</span>
                <span className="msg-row-sent-never">{sent.when}</span>
              </>)}
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
      {/* The open row: its one language control first, where it stays whichever
          language is picked -- one panel, so the control keeps its place and its
          focus when a pick moves between a language on file and one being written
          (two panels remounted it, and a keyboard's focus fell to the page). */}
      {open && (
        <div className="msg-row-open" data-testid="template-open-body">
          {langBar}
          {/* A language nobody has written: the message is written in it here, from
              the words of the language that was in view -- by the assistant, as a
              draft to read and change -- and goes to WhatsApp as the same message in
              one more language, the same name, slots and button. Picked, it starts;
              Cancel goes back to the language that was in view. */}
          {!row && !starterText ? (
            sentLang === view ? (
              <p className="msg-new-sent" role="status" data-testid="template-new-sent"><Icon name="check" size={13} /> {cur.lang.label} went to WhatsApp for review — it shows here in a moment.</p>
            ) : mayAdd && adding === view && window.TemplateComposer ? (
              <window.TemplateComposer
                key={view}
                businessName={bizName || ""}
                translate={{ ref: source.ref, from: source.from, name: source.name, language: view, title: g.title }}
                onCancel={cancelNew}
                onDone={(made) => { setSentLang(view); setAdding(null); setBack(null); if (onWritten) onWritten(g, cur.lang, made); }}
              />
            ) : (
              <p className="bc-excl-hint" data-testid="template-new-refused">Not on WhatsApp in {cur.lang.label}.{note ? ` ${note}` : ""}</p>
            )
          ) : (
          <>
          <window.MessagePreview from={bizName || "Your business"} body={body} values={values} header={row ? row.header : null} footer={footer} buttons={row ? row.buttons : null} compact />
          <div className="msg-card-foot">
            {row
              ? <span className="msg-card-meta">{row.name}{row.category ? ` · ${row.category}` : ""}{row.source === "chanlytics" ? " · made here" : " · from WhatsApp Manager"}</span>
              : <span className="msg-card-meta">Not on WhatsApp in {cur.lang.label} yet — the words WhatsApp would review</span>}
            {/* The rating WhatsApp gives the template in view, as of the last sync; nothing when none was synced. */}
            {row && row.quality && <StatePill kind="template_quality" value={String(row.quality).toUpperCase()} testid="template-quality" />}
            {/* The language the library has written and the workspace never added,
                offered where its words already are: the picker puts that language
                in view, and this adds it as it is -- no assistant, no draft. */}
            {!row && g.starter && starterText && (
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
                <Confirm question={`Delete “${tplTitle(row)}” in ${cur.lang.label}?`} detail={`It leaves WhatsApp; sends that use it fail from now on.${pausedWords}`} yes="Yes, delete" danger busy={busy} onYes={() => { closeMenu(); setSentLang(null); setAdding(null); onDelete(row); }} onNo={() => setArm(false)} testid="template-delete" />
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
          </>
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
  // A message half-written when the page was left opens again as the page does: the tab kept its words (the
  // composer's own useUnsavedWork, under "new").
  const [composing, setComposing] = React.useState(() => !!(window.tabDraft && window.tabDraft("template", "new")));
  const [showHidden, setShowHidden] = React.useState(false);
  // Which message is open, by its key. One at a time: the words of two
  // messages side by side is the wall this page stopped being.
  const [openKey, setOpenKey] = React.useState(null);
  // What the search box holds: the rows whose words have it stay, the rest stand down.
  const [q, setQ] = React.useState("");
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
  // A language by the words the list gives it ("Portuguese (Brazil)"); the starter
  // set's own two keep the set's words ("English", "Spanish").
  const langOf = (id) => langs.find((l) => l.id === id) || { id, label: tplLangLabel(id) };
  const groupsOf = (rows, purposeOf) => [...new Set(rows.map((t) => t.name))].map((name) => {
    const mine = rows.filter((x) => x.name === name);
    const t = mine[0];
    return { key: `c:${name}`, title: tplTitle(t), purpose: purposeOf(t), starter: null, rows: mine.map((x) => ({ lang: langOf(x.language), row: x })) };
  });
  // The starters in the library's order, each with the set's languages -- on file
  // or not -- and then any other language the workspace has written it in; then
  // what the workspace wrote or synced, by name; then a fold for what it hid.
  const starters = S ? S.list.map((s) => ({
    key: s.key, title: s.title, purpose: s.purpose, starter: s,
    rows: [
      ...langs.map((l) => ({ lang: l, row: rowFor(s.name, l.id) })),
      ...list.filter((t) => t.name === s.name && !langs.some((l) => l.id === t.language)).map((t) => ({ lang: langOf(t.language), row: t })),
    ],
  })) : [];
  const starterNames = new Set(starters.map((g) => g.starter.name));
  const rest = list.filter((t) => !starterNames.has(t.name));
  const hiddenRows = rest.filter((t) => !!t.hidden_at);
  const customGroups = groupsOf(rest.filter((t) => !t.hidden_at), (t) => (t.source === "chanlytics" ? "written here" : "from WhatsApp Manager"));
  const hiddenGroups = groupsOf(hiddenRows, () => "hidden from the composers");
  const missing = langs.map((l) => ({ lang: l, n: starters.filter((g) => !g.rows.find((r) => r.lang.id === l.id).row).length }));
  const missingTotal = missing.reduce((a, m) => a + m.n, 0);
  // A workspace with none of the set is starting, not broken: it is offered the
  // set. One part-way through has what is left to add at the list's foot.
  const allMissing = missingTotal > 0 && missingTotal === starters.length * langs.length;
  const partialSet = !!(hasWhatsApp && S && missingTotal > 0 && !allMissing);
  // What is left of the set, by language -- "3 in English and 7 in Spanish" -- the foot's act's detail.
  const leftToAdd = tplAnd(missing.filter((m) => m.n > 0).map((m) => `${m.n} in ${m.lang.label}`));
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
  // A new language is written and sent from the row that opened it, by whoever may
  // add a template and only with a number to add it to; anyone else is told why in
  // the picker, where the languages it cannot add would have been.
  const addWhy = !hasWhatsApp ? "Connect a WhatsApp number to add a language." : !canAct ? (window.gateTitle ? window.gateTitle("approve", "add a language") : "Only an owner or operator can add a language.") : null;
  const written = (g, lang) => flash({ msg: <><b>{g.title}</b> in {lang.label} went to WhatsApp — it reads as in review until they approve it, usually within minutes</> });
  const card = (g) => <MessageRow key={g.key} g={g} langs={langs} bizName={bizName} canAct={canAct && hasWhatsApp} canAdd={canAct && hasWhatsApp} addWhy={addWhy} busy={busy} doing={doing} S={S} open={openKey === g.key} onOpen={() => setOpenKey((k) => (k === g.key ? null : g.key))} onAdd={(gg, lang) => addStarters([gg.starter.key], [lang.id])} onRename={rename} onHide={toggleHidden} onDelete={remove} onWritten={written} />;

  // The search box: a message's title, the name WhatsApp knows it by, and its words
  // in every language on file or in the library. Rows that do not match stand down;
  // the starter set's notice and the fold stay, because they are about the set, not the search.
  const needle = q.trim().toLowerCase();
  const matches = (g) => !needle
    || [g.title, g.starter ? g.starter.name : "", ...g.rows.map(({ row: r }) => (r ? `${r.name} ${r.body_preview || ""}` : ""))].join(" ").toLowerCase().includes(needle)
    || !!(g.starter && S && langs.some((l) => String((S.text(g.starter, l.id) || {}).body || "").toLowerCase().includes(needle)));
  const listStarters = hasWhatsApp ? starters.filter(matches) : [];
  const listCustom = customGroups.filter(matches);
  return (
    <div className="reports tpl-page" data-testid="messages-real">
      <div className="rp-body cm-page">
        {/* One line, the way every Campaigns tab opens: the tab says "Templates", so the
            name is a screen reader's alone (CmHead quiet). The line is the page's
            numbers -- how many, how many approved, how many
            WhatsApp is still reading -- and when it last synced with WhatsApp, which is a
            STATE the page is in, not a chore the owner remembers: it says when it
            last looked and presses to look again, and while it looks it is the only
            control that says it is working (C20). Templates, never "messages": that
            word is a thread in the Inbox and a send in a broadcast's numbers. */}
        <window.CmHead
          title="Templates"
          quiet
          testid="messages-standing"
          sub={(
            <>
              <span className="tabular" data-tip="What the receptionist and your campaigns send on WhatsApp, as the customer sees it. Written here or in WhatsApp Manager, WhatsApp approves either way, usually within minutes. A marketing template can only go to people who said yes to offers.">
                {shown.length === 0 ? "No template on file yet" : <><b className="cm-head-n">{shown.length}</b> {shown.length === 1 ? "template" : "templates"}</>}
              </span>
              {shown.length > 0 && (
                <>
                  <window.CmDot />
                  {/* "7 templates · 7 approved" said the number twice: all of them is "all approved". */}
                  <span className="tabular"><span className="cm-head-ok">{approved === shown.length ? "all approved" : `${approved} approved`}</span>{pending ? <>, <span className="cm-head-info">{pending} in review</span></> : null}</span>
                </>
              )}
              {hasWhatsApp && (
                <>
                  <window.CmDot />
                  <button
                    className={`tpl-fresh${doing === "sync" ? " is-busy" : ""}`}
                    onClick={sync}
                    disabled={busy}
                    data-testid="sync-templates"
                    aria-description="Check WhatsApp for changes"
                    {...window.gate("approve", "sync from WhatsApp")}
                  >
                    <span className={`tpl-fresh-dot${lastSync ? "" : " never"}`} aria-hidden="true" />
                    {/* "Synced 16d ago", the words every tool says it in; "In step with WhatsApp" took the line's room. */}
                    {doing === "sync" ? "Checking WhatsApp…" : lastSync ? <>Synced <span className="tpl-fresh-age">{tplAgo(lastSync)}</span></> : "Never synced"}
                    <span className="tpl-fresh-again" aria-hidden="true"><Icon name="refresh" size={12} /></span>
                  </button>
                </>
              )}
            </>
          )}
          right={(
            <>
              <label className="cm-search">
                <Icon name="search" size={13} />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the words" aria-label="Search the templates' words" data-testid="templates-search" />
              </label>
              {hasWhatsApp && <button className="btn btn-primary" onClick={() => setComposing((c) => !c)} data-testid="template-new" {...window.gate("approve", "write a template")}><Icon name="plus" size={12} /> <span>New<span className="cm-act-noun"> template</span></span></button>}
            </>
          )}
        />
        {/* The page's own acts stay where they are for every role and say who may
            (window.gate); a message's rename, hide and delete stay with those who may. */}
        {!canAct && hasWhatsApp && <span className="bc-excl-hint" data-testid="messages-role">{window.gateTitle("approve", "rename, hide or delete a template")}</span>}
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
        {/* A workspace with none of the starter set is starting, not broken: it is
            offered the set, in one notice with its one act. A workspace part-way
            through (the set in English, Spanish never added) hears no notice: a run
            sends one language to everyone on it, so a language never added holds
            nobody back -- the notice that said "your Spanish-speaking customers get
            nothing from Win-back" said what the product does not do. What is left to
            add is a quiet line at the list's foot, and each message's own languages
            are in its open row. */}
        {hasWhatsApp && S && allMissing && (
          <div className="msg-starters" data-testid="starters">
            <window.CmBanner
              tone="plain"
              lead={`The starter set is ${tplSpell(S.list.length)} messages for the moments Chanlytics acts on.`}
              act={(
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => addStarters(null, langs.map((l) => l.id))}
                  data-testid="starter-add-all"
                  {...window.gate("approve", "add a starter template")}
                >
                  {addingAll ? "Adding…" : "Add the starter set"}
                </button>
              )}
            >
              In {tplAnd(langs.map((l) => l.label))} — WhatsApp reviews each, usually within minutes.
            </window.CmBanner>
          </div>
        )}
        <section className="msg-section" data-testid="templates">
          <div className="msg-list">
            {/* What each column of a row is, once, above them -- the way the People
                and Leads tables name theirs. Inside the list, not above it: the list
                is the container the row's columns are measured against. The first
                cell is the mark's, and has no heading. */}
            {(listStarters.length > 0 || listCustom.length > 0) && (
              <div className="msg-list-head" aria-hidden="true">
                <span />
                <span>The message</span>
                <span>What sends it</span>
                <span className="msg-list-head-sent">Sent</span>
              </div>
            )}
            {listStarters.map(card)}
            {listCustom.map(card)}
          </div>
          {needle && listStarters.length === 0 && listCustom.length === 0 && (
            <EmptyState kind="line" title={`No template’s words have “${q.trim()}” in them.`} testid="templates-no-match" />
          )}
          {!hasWhatsApp && customGroups.length === 0 && <EmptyState kind="line" title="Nothing on file yet." />}
        </section>
        {/* The foot of the list: the starter set's languages not yet added, as one
            quiet act, and what the workspace kept out of the composers, folded and
            still on file. How long WhatsApp takes to read a new one is the head's
            hover and the composer's line; said here too, it was the page's third time. */}
        {(partialSet || hiddenGroups.length > 0) && (
          <footer className="msg-foot">
            {partialSet && (
              <button
                className="msg-fold-toggle"
                disabled={busy}
                onClick={() => addStarters(null, langs.map((l) => l.id))}
                data-tip={leftToAdd}
                aria-description={leftToAdd}
                data-testid="starter-add-all"
                {...window.gate("approve", "add a starter template")}
              >
                <Icon name="plus" size={12} />
                {addingAll ? "Adding…" : "Add the rest of the starter set"}
              </button>
            )}
            {hiddenGroups.length > 0 && <span className="msg-foot-fold" data-testid="templates-fold">
              <button className="msg-fold-toggle" onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden} data-testid="templates-hidden">
                <Icon name={showHidden ? "chevron-up" : "chevron-down"} size={12} />
                Not in the composers · <span className="tabular">{hiddenRows.length}</span> · still on file
              </button>
            </span>}
          </footer>
        )}
        {showHidden && hiddenGroups.length > 0 && <div className="msg-list msg-list-hidden">{hiddenGroups.map(card)}</div>}
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
