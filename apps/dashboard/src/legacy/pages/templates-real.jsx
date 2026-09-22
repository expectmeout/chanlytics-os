/* global React, Icon */
// A template written here: drafted with the assistant in the business's
// voice, checked against WhatsApp's rules before it leaves, submitted to
// Meta for review, and tracked to approval by the webhook. Rendered on the
// Broadcasts page and on Campaigns › Templates; one component,
// published as window.TemplateComposer. Nothing here sends a message.
//
// With `translate`, it writes a message the workspace already has in one more
// language: the same name and slots, drafted by the assistant from the words
// WhatsApp holds, for the owner to read, change and submit. Campaigns ›
// Templates opens it in a message's row when a language nobody has written is
// picked there.

// Every language WhatsApp takes (contracts WHATSAPP_LANGUAGES). The composer
// offered six, so a French-speaking salon was told to pick from a list that
// had no French in it. Without the library read, the six it had.
const TC_LANGS_FALLBACK = [
  { id: "en_US", label: "English (US)" }, { id: "en", label: "English" }, { id: "es", label: "Spanish" },
  { id: "es_MX", label: "Spanish (Mexico)" }, { id: "es_ES", label: "Spanish (Spain)" }, { id: "pt_BR", label: "Portuguese (Brazil)" },
].map((l) => ({ ...l, name: l.label, native: "" }));
const tcLangs = () => (window.__starters && window.__starters.allLanguages ? window.__starters.allLanguages : TC_LANGS_FALLBACK);
const tcLangLabel = (id) => (window.__starters && window.__starters.langLabel ? window.__starters.langLabel(id) : id);
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

const TemplateComposer = ({ onDone, onCancel, businessName = "", translate = null }) => {
  // Words written here and not submitted come back when the composer opens again (the tab's draft, useUnsavedWork):
  // a new message under "new", a translation under the message and its language -- so a translation the assistant
  // wrote once is not paid for twice.
  const draftKey = translate ? `${translate.name}|${translate.language}` : "new";
  const [kept] = React.useState(() => (window.tabDraft ? window.tabDraft("template", draftKey) : null));
  const K = (k, fallback) => (kept && kept[k] !== undefined ? kept[k] : fallback);
  const [brief, setBrief] = React.useState(K("brief", ""));
  const [category, setCategory] = React.useState(K("category", translate && translate.category ? translate.category : "marketing"));
  const [language, setLanguage] = React.useState(K("language", translate ? translate.language : "en_US"));
  const [name, setName] = React.useState(K("name", translate ? translate.name || "" : ""));
  const [body, setBody] = React.useState(K("body", ""));
  const [footer, setFooter] = React.useState(K("footer", ""));
  const [examples, setExamples] = React.useState(K("examples", []));
  const [labels, setLabels] = React.useState(K("labels", []));
  // The words on a button under the message. Empty means no button.
  const [buttonText, setButtonText] = React.useState(K("buttonText", ""));
  // Where a translated message's button goes: the address its own button opens,
  // never the booking link guessed at. Null outside a translation.
  const [buttonUrl, setButtonUrl] = React.useState(K("buttonUrl", null));
  const [warnings, setWarnings] = React.useState(K("warnings", []));
  const [drafting, setDrafting] = React.useState(!!translate && !kept);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  // A translation that could not be written: the words are not there to change,
  // so the only thing to offer is another try.
  const [failed, setFailed] = React.useState(false);
  const asked = React.useRef(!!kept);
  // Any words in it are kept, and Cancel asks before they go; the message's name alone (a translation keeps its) is not words.
  const wrote = !!(brief.trim() || body.trim() || footer.trim() || buttonText.trim() || (!translate && name.trim()) || examples.some((x) => String(x || "").trim()));
  const work = window.useUnsavedWork("template", draftKey, {
    value: { brief, category, language, name, body, footer, examples, labels, buttonText, buttonUrl, warnings },
    dirty: wrote,
    onLeave: () => { if (onCancel) onCancel(); },
  });
  // Who may draft or submit: the role store's answer, View-as included.
  const canEdit = !!(window.canDo && window.canDo("approve"));
  const slots = tcSlots(body);
  // Where a button goes: the workspace's own booking link, the same fact the
  // starters' booking_link slot is filled from. A button's address is FIXED --
  // one that took a value would need a parameter `sendTemplate` never sends, and
  // WhatsApp would refuse every recipient (contracts templateBlocked).
  const bookingLink = tcBookingLink();
  const link = translate ? buttonUrl : bookingLink;
  const button = link && buttonText.trim() ? { text: buttonText.trim(), url: link } : null;
  const exampleFor = (i) => examples[i] || "";
  const previewValues = slots.map((n, i) => exampleFor(i));
  const ready = !!name.trim() && !!body.trim() && slots.every((n, i) => !!exampleFor(i).trim()) && !submitting && !drafting;
  const toLabel = tcLangLabel(language);
  const fromLabel = translate ? tcLangLabel(translate.from) : "";

  const draft = async () => {
    if (!window.__templates || drafting || brief.trim().length < 4 || !canEdit) return;
    setDrafting(true); setError(null);
    const r = await window.__templates.draft({ brief: brief.trim(), category, language });
    setDrafting(false);
    if (!r.ok) { setError(r.message || "The draft could not be written."); return; }
    const d = r.data.draft;
    setName(d.name || "");
    setBody(d.body || "");
    setFooter(d.footer || "");
    setExamples(d.examples || []);
    setLabels((d.variables || []).map((v) => v.label || ""));
    setWarnings(d.warnings || []);
  };
  // The message in one more language, written once when the composer opens and
  // again only when asked: the assistant is paid for per draft.
  const translateNow = async () => {
    if (!translate || !window.__templates) return;
    setDrafting(true); setError(null); setFailed(false);
    const r = await window.__templates.draft({ language: translate.language, translate: translate.ref });
    setDrafting(false);
    if (!r.ok) { setError(r.message || `It could not be written in ${toLabel} just now.`); setFailed(true); return; }
    const d = r.data.draft;
    setName(d.name || translate.name || "");
    if (d.category) setCategory(d.category);
    setBody(d.body || "");
    setFooter(d.footer || "");
    setExamples(d.examples || []);
    setLabels((d.variables || []).map((v) => v.label || ""));
    setButtonText(d.button ? d.button.text : "");
    setButtonUrl(d.button ? d.button.url : null);
    setWarnings(d.warnings || []);
  };
  React.useEffect(() => {
    if (!translate || asked.current) return;
    asked.current = true;
    translateNow();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival: a composer is keyed by its language
  const submit = async () => {
    if (!window.__templates || !ready || !canEdit) return;
    setSubmitting(true); setError(null);
    const r = await window.__templates.create({ name: name.trim(), language, category, body, footer: footer.trim() || null, examples: slots.map((n, i) => exampleFor(i).trim()), labels: slots.map((n, i) => (labels[i] || "").trim()), button });
    setSubmitting(false);
    if (!r.ok) { setError(r.message || "WhatsApp did not accept it."); return; }
    work.done();
    if (onDone) onDone(r.data);
  };
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

  // The fields the words are changed in: a translation's are the same as a new
  // message's, less the name (it IS the message, so it keeps its name) and a
  // button it never had.
  const fields = (
    <div className="tpl-fields">
      {!translate && <label className="bc-var"><span className="bc-var-label">Name (lowercase, underscores)</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="spring_offer" data-testid="tpl-name" /></label>}
      <label className="bc-var tpl-body"><span className="bc-var-label">Message — values as {"{{1}}"}, {"{{2}}"} in order</span><textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} data-testid="tpl-body" /></label>
      <label className="bc-var"><span className="bc-var-label">Footer (optional)</span><input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder={category === "marketing" ? "Reply STOP to opt out" : ""} data-testid="tpl-footer" /></label>
      {(!translate || buttonUrl) && (
        <label className="bc-var" data-testid="tpl-button">
          <span className="bc-var-label">Button (optional){link ? <> &middot; opens {link.replace(/^https?:\/\//, "")}</> : null}</span>
          {link
            ? <input value={buttonText} maxLength={25} onChange={(e) => setButtonText(e.target.value)} placeholder="Book now" data-testid="tpl-button-text" />
            : <span className="bc-excl-hint" data-testid="tpl-button-none">A button needs somewhere to go. Put your booking link in <button type="button" className="cl-bucket-link" onClick={() => window.CHANLY.nav("admin/workspace")}>Settings</button> first.</span>}
        </label>
      )}
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
  );
  const preview = body ? <div className="bc-preview-wrap" data-testid="tpl-preview"><window.MessagePreview from={businessName} body={body} values={previewValues} footer={footer || null} buttons={button ? [{ text: button.text, kind: "url" }] : null} /></div> : null;

  if (translate) {
    return (
      <section className="ct-section tpl-composer is-translate" data-testid="tpl-composer" data-mode="translate">
        <div className="ct-sec-head">
          <span className="ct-sec-title"><Icon name="globe" size={13} /> {translate.title} in {toLabel}</span>
          <span className="ct-sec-meta" data-testid="tpl-translate-meta">
            {drafting ? `Writing it from the ${fromLabel} words…` : failed ? `From the ${fromLabel} words` : `Written from the ${fromLabel} words — read it through, change what you like, then send it for review`}
          </span>
        </div>
        {drafting ? (
          <div className="tpl-drafting" role="status" aria-busy="true" aria-label={`Writing it in ${toLabel}`} data-testid="tpl-translating">
            <span className="tpl-drafting-line" />
            <span className="tpl-drafting-line" />
            <span className="tpl-drafting-line is-short" />
          </div>
        ) : failed ? (
          <div className="tpl-retry" data-testid="tpl-translate-failed">
            <window.FieldError message={error} testid="tpl-error" />
            <button className="btn btn-sm" onClick={translateNow} data-testid="tpl-translate-again" {...(window.gate ? window.gate("approve", "write a template in another language") : {})}><Icon name="refresh" size={11} /> Try again</button>
          </div>
        ) : (
          <div className="tpl-split">
            {fields}
            {preview}
          </div>
        )}
        {!drafting && !failed && warnings.length > 0 && <div className="bc-excl-hint" data-testid="tpl-warnings">{warnings.join(" ")}</div>}
        {!drafting && !failed && <window.FieldError message={error} testid="tpl-error" />}
        <div className="bc-actions">
          {work.asking ? <window.UnsavedAsk onYes={work.discard} onNo={work.stay} what="submitted" testid="tpl-leave" /> : (
            <>
              <span className="bc-excl-hint">The same message, <span className="mono">{translate.name}</span>, in one more language — WhatsApp reviews it on its own.</span>
              <span className="bc-actions-spacer" />
              {onCancel && <button className="cl-bucket-link" onClick={work.leave} data-testid="tpl-cancel">Cancel</button>}
              <button className="btn btn-primary btn-sm" disabled={!ready} onClick={submit} data-testid="tpl-submit" {...(window.gate ? window.gate("approve", "submit a template") : {})}>{submitting ? "Submitting…" : "Submit to WhatsApp"}</button>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="ct-section tpl-composer" data-testid="tpl-composer">
      <div className="ct-sec-head">
        <span className="ct-sec-title">New template</span>
        <span className="ct-sec-meta">WhatsApp reviews it before it can be sent — usually minutes, sometimes a day</span>
        {onCancel && <button className="cl-bucket-link" onClick={work.leave} data-testid="tpl-close">Close</button>}
      </div>
      {window.__starters && (
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
      <div className="tpl-row">
        <span className="bc-row-label">Say</span>
        <textarea className="tpl-brief" rows={2} value={brief} placeholder="What do you want to tell customers? e.g. 20% off any service this week, book by Friday" onChange={(e) => setBrief(e.target.value)} data-testid="tpl-brief" />
      </div>
      <div className="tpl-row">
        <span className="bc-row-label">Kind</span>
        <div className="bc-chips">
          <button className={"bc-chip" + (category === "marketing" ? " active" : "")} onClick={() => setCategory("marketing")} title="An offer, news or an invitation — needs the customer's yes">Marketing</button>
          <button className={"bc-chip" + (category === "utility" ? " active" : "")} onClick={() => setCategory("utility")} title="A notice about their own booking or account — no promotional words">Utility</button>
          {/* Any language WhatsApp takes, found by typing it: the list is 111 long,
              and a select of 111 is a scroll nobody finishes. */}
          <window.LanguagePicker display="label" value={language} choices={tcLangs()} onPick={(id) => setLanguage(id)} label="The language it is written in" search testid="tpl-language" />
          <button className="btn btn-sm" disabled={drafting || brief.trim().length < 4} onClick={draft} data-testid="tpl-draft" {...(window.gate ? window.gate("approve", "draft a template") : {})}>
            <Icon name="sparkle" size={11} /> {drafting ? "Drafting…" : "Draft with Chanlytics"}
          </button>
        </div>
      </div>
      {fields}
      {preview}
      {warnings.length > 0 && <div className="bc-excl-hint" data-testid="tpl-warnings">{warnings.join(" ")}</div>}
      <window.FieldError message={error} testid="tpl-error" />
      <div className="bc-actions">
        {/* Close, with words in it: the one question first (UnsavedAsk), where the submit was. */}
        {work.asking ? <window.UnsavedAsk onYes={work.discard} onNo={work.stay} what="submitted" testid="tpl-leave" /> : (
          <>
            <span className="bc-excl-hint">The words are yours; WhatsApp approves them. {businessName ? `Sent as ${businessName}.` : ""}</span>
            <span className="bc-actions-spacer" />
            <button className="btn btn-primary btn-sm" disabled={!ready} onClick={submit} data-testid="tpl-submit" {...(window.gate ? window.gate("approve", "submit a template") : {})}>{submitting ? "Submitting…" : "Submit to WhatsApp"}</button>
          </>
        )}
      </div>
    </section>
  );
};

window.TemplateComposer = TemplateComposer;
window.starterWords = starterWords;
