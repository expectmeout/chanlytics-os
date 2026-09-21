/* global React */
// Which message a campaign sends, picked once.
//
// Templates are stored one row per (name, language), and both composers drew
// one chip per ROW titled with `templateTitle(name)`, which takes no language.
// So a workspace that installed the starter set in English and Spanish -- which
// Messages advertises as the default -- saw seven PAIRS of identical chips,
// adjacent, with nothing on either to tell them apart. `defaultTemplate` opened
// on whichever of the pair the query returned first.
//
// The Inbox composer had already answered this: `inboxTemplates` labels every
// row "<title> · <language>". Here there is room to do better than a label --
// one chip per message, and inside it ONE control for its language: the one it
// goes out in, and a popover (window.LangPicker) that picks another, says which
// of its languages WhatsApp is still reading, adds a starter's language the
// library has written, and writes the message in any language WhatsApp takes.
// A toggle per language drew Meta's storage -- a row per language -- as if it
// were the message.

const TC_GROUPS = (list) => (window.__starters && window.__starters.group
  ? window.__starters.group(list)
  // No library read: one group per row, so the picker still works and still
  // says the language it would send in.
  : (list || []).map((t) => ({ name: t.name, title: t.name, rows: [t], labels: { [t.language]: t.language } })));

const tcKind = (t) => (window.__starters && window.__starters.byName(t.name) ? "starter" : (t.category || ""));

// A language as a person reads it in the popover: the group's own label, else its name.
const tcLangLabel = (g, id) => (g.labels && g.labels[id]) || (window.__starters && window.__starters.langName ? window.__starters.langName(id) : id);

// A language the message cannot go in yet, chosen in its popover. A starter's
// language the library has written is added from here -- WhatsApp reviews it --
// and said under the chips; any other is written on Templates, on the message's
// own name (messages/write:<name>:<language>), where the words are.
const tcAddLanguage = async (g, language, how, said) => {
  if (how === "write") { window.CHANLY.nav(`messages/write:${g.name}:${language}`); return; }
  const starter = window.__starters && window.__starters.byName ? window.__starters.byName(g.name) : null;
  if (!starter || !window.__templates || !window.__templates.addStarters) return;
  const name = window.__starters.langName ? window.__starters.langName(language) : language;
  said({ busy: true, words: `Adding ${g.title} in ${name}…` });
  const r = await window.__templates.addStarters({ keys: [starter.key], languages: [language] });
  said(r.ok
    ? { words: `${g.title} in ${name} is with WhatsApp — usually approved within minutes, and it goes once it is.` }
    : { tone: "danger", words: r.message || `${g.title} in ${name} could not be added.` });
};

/**
 * templates  the approved rows, in any order
 * value      the id of the row picked, or ""
 * onPick     called with a row's id
 * testid     the page's own name for a chip ("bc-template", "pb-template")
 *
 * A language the message cannot go in yet is the chips' own business: a
 * starter's is added from here, any other is written on Templates.
 */
const TemplateChips = ({ templates, value, onPick, testid }) => {
  // What adding a language from a popover did, said once under the chips.
  const [note, setNote] = React.useState(null);
  const groups = TC_GROUPS(templates);
  // Who may add or write a language: the role store's answer, View-as included.
  const canAdd = !!(window.canDo && window.canDo("approve"));
  const onLanguage = canAdd ? (g, id, how) => { if (!(note && note.busy)) tcAddLanguage(g, id, how, setNote); } : null;
  // Every row on file, to say which of a message's languages WhatsApp is still reading -- the chips hold only what can go.
  const onFile = window.__TEMPLATES_ALL || [];
  return (
    <>
      {groups.map((g) => {
        // The row in view for this message: the one picked, else the first --
        // which is a language order now, not the order a query happened to give.
        const picked = g.rows.find((r) => r.id === value) || null;
        const row = picked || g.rows[0];
        const pending = onFile.filter((t) => t.name === g.name && !t.hidden_at && !g.rows.some((r) => r.language === t.language));
        const starter = window.__starters && window.__starters.byName ? window.__starters.byName(g.name) : null;
        const have = new Set([...g.rows, ...pending].map((t) => t.language));
        const ready = starter && onLanguage && window.__starters.languages ? window.__starters.languages.filter((l) => !have.has(l.id) && starter.texts && starter.texts[l.id]) : [];
        const options = [
          ...g.rows.map((r) => ({ id: r.language, label: tcLangLabel(g, r.language), status: r.meta_status || "approved", row: r.id })),
          ...pending.map((t) => ({ id: t.language, label: tcLangLabel(g, t.language), status: t.meta_status, disabled: true, note: t.meta_status === "pending" ? "In review — goes once approved" : undefined })),
          ...ready.map((l) => ({ id: l.id, label: l.label, status: null, note: "Add from the starter set" })),
        ];
        const choose = (id) => {
          const o = options.find((x) => x.id === id);
          if (o && o.row) onPick(o.row);
          else if (o && onLanguage) onLanguage(g, id, "starter");
        };
        return (
          <span key={g.name} className={"bc-chip tpl-chip" + (picked ? " active" : "")}>
            <button
              type="button"
              className="tpl-chip-name"
              aria-pressed={!!picked}
              onClick={() => onPick(row.id)}
              title={row.body_preview || ""}
              data-testid={testid}
            >
              {g.title}
            </button>
            {window.LangPicker
              ? <window.LangPicker value={row.language} options={options} onChoose={choose} onWrite={onLanguage ? (id) => onLanguage(g, id, "write") : null} glyph={options.length > 1 && options.some((o) => o.status !== "approved")} testid={`${testid}-lang`} label={`Language for ${g.title}`} />
              : tcKind(row) ? <span className="bc-chip-count">{tcKind(row)}</span> : null}
          </span>
        );
      })}
      {note && <span className={`tpl-chips-note${note.tone === "danger" ? " is-danger" : ""}`} role="status" data-testid={`${testid}-lang-note`}>{note.words}</span>}
    </>
  );
};

window.TemplateChips = TemplateChips;
