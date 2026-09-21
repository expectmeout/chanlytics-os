/* global React, Icon */
// A template written here: drafted with the assistant in the business's
// voice, checked against WhatsApp's rules before it leaves, submitted to
// Meta for review, and tracked to approval by the webhook. Rendered on the
// Broadcasts page and on Campaigns › Templates; one component,
// published as window.TemplateComposer. Nothing here sends a message.
//
// It writes in any language WhatsApp takes (contracts TEMPLATE_LANGUAGES), and
// it writes a message the workspace already has in a language it does not: a
// `preset` holds the message's name -- WhatsApp keeps one message per name per
// language, so the name is the message -- and the words in view, which it
// translates on a press.

// The languages WhatsApp takes, as the language popover lists them.
const tcLanguages = () => ((window.__starters && window.__starters.catalog) || [{ id: "en_US", label: "English (US)", native: "English (US)" }]).map((l) => ({ id: l.id, label: l.label, native: l.native, status: null }));
const tcLangName = (id) => (window.__starters && window.__starters.langName ? window.__starters.langName(id) : id);
// The one address a button may open: what the workspace put in Settings.
const tcBookingLink = () => {
  const brain = (window.__SETTINGS && window.__SETTINGS.config && window.__SETTINGS.config.brain) || {};
  const link = typeof brain.booking_link === "string" ? brain.booking_link.trim() : "";
  return link || null;
};
const tcSlots = (body) => { const s = new Set(); for (const m of String(body || "").matchAll(/\{\{(\d+)\}\}/g)) s.add(Number(m[1])); return [...s].sort((a, b) => a - b); };

// What happened to the starter set, in one line.
const starterWords = (d) => {
  const parts = [];
  if (d.submitted) parts.push(`${d.submitted} submitted to WhatsApp for review — usually approved within minutes`);
  if (d.synced) parts.push(`${d.synced} already on your number's account, now here`);
  if (d.existing) parts.push(`${d.existing} already on file`);
  if (d.failed) parts.push(`${d.failed} could not be added${d.results ? ": " + d.results.filter((r) => r.status === "failed").map((r) => `${r.title} (${r.detail || "no reason given"})`).join("; ") : ""}`);
  return parts.length ? parts.join(" · ") : "Nothing to add";
};

const TemplateComposer = ({ onDone, onCancel, businessName = "", preset = null }) => {
  const from = preset ? preset.from : null;
  const [brief, setBrief] = React.useState("");
  const [category, setCategory] = React.useState(preset && preset.category ? preset.category : "marketing");
  const [language, setLanguage] = React.useState(preset ? preset.language : "en_US");
  const [name, setName] = React.useState(preset ? preset.name : "");
  const [body, setBody] = React.useState("");
  const [footer, setFooter] = React.useState("");
  // A translation keeps the message's values: the same slots, filled from the same places, with the same examples.
  const [examples, setExamples] = React.useState(() => (from && from.row && Array.isArray(from.row.variables) ? from.row.variables.map((v) => v.example || "") : []));
  const [labels, setLabels] = React.useState(() => (from && Array.isArray(from.labels) ? from.labels : []));
  // The words on a button under the message. Empty means no button.
  const [buttonText, setButtonText] = React.useState("");
  const [warnings, setWarnings] = React.useState([]);
  const [drafting, setDrafting] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  // Who may draft or submit: the role store's answer, View-as included.
  const canEdit = !!(window.canDo && window.canDo("approve"));
  const slots = tcSlots(body);
  // Where a button goes: the workspace's own booking link, the same fact the
  // starters' booking_link slot is filled from. A button's address is FIXED --
  // one that took a value would need a parameter `sendTemplate` never sends, and
  // WhatsApp would refuse every recipient (contracts templateBlocked).
  const bookingLink = tcBookingLink();
  const button = bookingLink && buttonText.trim() ? { text: buttonText.trim(), url: bookingLink } : null;
  const exampleFor = (i) => examples[i] || "";
  const previewValues = slots.map((n, i) => exampleFor(i));
  const ready = !!name.trim() && !!body.trim() && slots.every((n, i) => !!exampleFor(i).trim()) && !submitting;

  const draft = async (asked = null) => {
    const said = asked || brief.trim();
    if (!window.__templates || drafting || said.length < 4 || !canEdit) return;
    setDrafting(true); setError(null);
    const r = await window.__templates.draft({ brief: said, category, language });
    setDrafting(false);
    if (!r.ok) { setError(r.message || "The draft could not be written."); return; }
    const d = r.data.draft;
    // A translation is the same message: it keeps its name, whatever the draft calls it.
    if (!preset) setName(d.name || "");
    setBody(d.body || "");
    setFooter(d.footer || "");
    setExamples(d.examples || []);
    setLabels((d.variables || []).map((v) => v.label || ""));
    setWarnings(d.warnings || []);
  };
  const submit = async () => {
    if (!window.__templates || !ready || !canEdit) return;
    setSubmitting(true); setError(null);
    const r = await window.__templates.create({ name: name.trim(), language, category, body, footer: footer.trim() || null, examples: slots.map((n, i) => exampleFor(i).trim()), labels: slots.map((n, i) => (labels[i] || "").trim()), button });
    setSubmitting(false);
    if (!r.ok) { setError(r.message || "WhatsApp did not accept it."); return; }
    if (onDone) onDone(r.data);
  };
  // The words in view, in the language chosen: the draft writes them there, slots and all, in the business's voice.
  const translate = () => from && from.body && draft(`Translate this WhatsApp message into ${tcLangName(language)}. Keep every {{n}} slot, in the same order and meaning, and keep it as warm and brief: ${from.body}`.slice(0, 600));
  // A starter's words in the chosen language, to change or submit as they are.
  const startFrom = (s) => {
    const t = s.texts[language] || s.texts.en_US;
    setCategory(s.category);
    setName(s.name);
    setBody(t.body);
    setFooter(t.footer || "");
    setExamples(t.slots.map((x) => x.example));
    setLabels(t.slots.map((x) => x.label));
    setButtonText("");
    setWarnings([]);
    setError(null);
  };

  return (
    <section className="ct-section tpl-composer" data-testid="tpl-composer">
      <div className="ct-sec-head">
        <span className="ct-sec-title">{preset ? `${preset.title} in ${tcLangName(language)}` : "New template"}</span>
        <span className="ct-sec-meta">{preset ? "The same message in another language — WhatsApp reviews each language before it can be sent" : "WhatsApp reviews it before it can be sent — usually minutes, sometimes a day"}</span>
        {onCancel && <button className="cl-bucket-link" onClick={onCancel}>Close</button>}
      </div>
      {from && (
        <div className="tpl-row" data-testid="tpl-source">
          <span className="bc-row-label">From</span>
          <div className="tpl-source">
            <span className="tpl-source-k">{from.label}</span>
            {/* Its slots by what fills them -- "first name", "booking link" -- as the page names them, never {{1}}. */}
            <p className="tpl-source-words">
              {(window.mpParts ? window.mpParts(from.body, (from.labels || []).map((l) => String(l || "").toLowerCase())) : [{ kind: "text", text: from.body }]).map((x, i) => (x.kind === "slot"
                ? <span key={i} className="tpl-source-slot">{x.text}</span>
                : <React.Fragment key={i}>{x.text}</React.Fragment>))}
            </p>
            <button type="button" className="btn btn-sm" disabled={drafting || !canEdit} onClick={translate} data-testid="tpl-translate" {...(window.gate ? window.gate("approve", "draft a template") : {})}>
              <Icon name="sparkle" size={11} /> {drafting ? "Translating…" : `Translate into ${tcLangName(language)}`}
            </button>
          </div>
        </div>
      )}
      {!preset && window.__starters && (
        <div className="tpl-row">
          <span className="bc-row-label">From</span>
          <div className="bc-chips" style={{ alignItems: "center" }}>
            {window.__starters.list.map((s) => (
              <button key={s.key} className="bc-chip" title={`${s.title} — ${s.purpose}`} onClick={() => startFrom(s)} data-testid="tpl-start-from">{s.title}</button>
            ))}
            <span className="bc-excl-hint">a starter to change — or say what you want to tell customers below</span>
          </div>
        </div>
      )}
      {!preset && (
        <div className="tpl-row">
          <span className="bc-row-label">Say</span>
          <textarea className="tpl-brief" rows={2} value={brief} placeholder="What do you want to tell customers? e.g. 20% off any service this week, book by Friday" onChange={(e) => setBrief(e.target.value)} data-testid="tpl-brief" />
        </div>
      )}
      <div className="tpl-row">
        <span className="bc-row-label">Kind</span>
        <div className="bc-chips">
          <button className={"bc-chip" + (category === "marketing" ? " active" : "")} onClick={() => setCategory("marketing")} title="An offer, news or an invitation — needs the customer's yes">Marketing</button>
          <button className={"bc-chip" + (category === "utility" ? " active" : "")} onClick={() => setCategory("utility")} title="A notice about their own booking or account — no promotional words">Utility</button>
          {window.LangPicker && <window.LangPicker field value={language} options={tcLanguages()} onChoose={setLanguage} glyph={false} testid="tpl-language" label="The language it is written in" />}
          {!preset && (
            <button className="btn btn-sm" disabled={drafting || brief.trim().length < 4} onClick={() => draft()} data-testid="tpl-draft" {...(window.gate ? window.gate("approve", "draft a template") : {})}>
              <Icon name="sparkle" size={11} /> {drafting ? "Drafting…" : "Draft with Chanlytics"}
            </button>
          )}
        </div>
      </div>
      <div className="tpl-fields">
        <label className="bc-var"><span className="bc-var-label">{preset ? "Name — the message's own, in every language" : "Name (lowercase, underscores)"}</span><input value={name} readOnly={!!preset} onChange={(e) => setName(e.target.value)} placeholder="spring_offer" data-testid="tpl-name" /></label>
        <label className="bc-var tpl-body"><span className="bc-var-label">Message — values as {"{{1}}"}, {"{{2}}"} in order</span><textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} data-testid="tpl-body" /></label>
        <label className="bc-var"><span className="bc-var-label">Footer (optional)</span><input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder={category === "marketing" ? "Reply STOP to opt out" : ""} data-testid="tpl-footer" /></label>
        <label className="bc-var" data-testid="tpl-button">
          <span className="bc-var-label">Button (optional){bookingLink ? <> &middot; opens {bookingLink.replace(/^https?:\/\//, "")}</> : null}</span>
          {bookingLink
            ? <input value={buttonText} maxLength={25} onChange={(e) => setButtonText(e.target.value)} placeholder="Book now" data-testid="tpl-button-text" />
            : <span className="bc-excl-hint" data-testid="tpl-button-none">A button needs somewhere to go. Put your booking link in <button type="button" className="cl-bucket-link" onClick={() => window.CHANLY.nav("admin/workspace")}>Settings</button> first.</span>}
        </label>
        {slots.length > 0 && (
          <div className="bc-vars" data-testid="tpl-examples">
            {slots.map((n, i) => (
              <label key={n} className="bc-var">
                <span className="bc-var-label">Example for {"{{" + n + "}}"}{labels[i] ? ` · ${labels[i]}` : ""}</span>
                <input value={exampleFor(i)} onChange={(e) => setExamples((ex) => { const next = [...ex]; next[i] = e.target.value; return next; })} placeholder="what a real value looks like" />
              </label>
            ))}
          </div>
        )}
      </div>
      {body && <div className="bc-preview-wrap" data-testid="tpl-preview"><window.MessagePreview from={businessName} body={body} values={previewValues} footer={footer || null} buttons={button ? [{ text: button.text, kind: "url" }] : null} /></div>}
      {warnings.length > 0 && <div className="bc-excl-hint" data-testid="tpl-warnings">{warnings.join(" ")}</div>}
      <window.FieldError message={error} testid="tpl-error" />
      <div className="bc-actions">
        <span className="bc-excl-hint">The words are yours; WhatsApp approves them. {businessName ? `Sent as ${businessName}.` : ""}</span>
        <span className="bc-actions-spacer" />
        <button className="btn btn-primary btn-sm" disabled={!ready} onClick={submit} data-testid="tpl-submit" {...(window.gate ? window.gate("approve", "submit a template") : {})}>{submitting ? "Submitting…" : "Submit to WhatsApp"}</button>
      </div>
    </section>
  );
};

window.TemplateComposer = TemplateComposer;
window.starterWords = starterWords;
