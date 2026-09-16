/* global React, Icon */
// A template written here: drafted with the assistant in the business's
// voice, checked against WhatsApp's rules before it leaves, submitted to
// Meta for review, and tracked to approval by the webhook. Rendered on the
// Broadcasts page and on Campaigns › Messages; one component,
// published as window.TemplateComposer. Nothing here sends a message.

const TC_LANGS = [
  { id: "en_US", label: "English (US)" }, { id: "en", label: "English" }, { id: "es", label: "Spanish" },
  { id: "es_MX", label: "Spanish (Mexico)" }, { id: "es_ES", label: "Spanish (Spain)" }, { id: "pt_BR", label: "Portuguese (Brazil)" },
];
const tcSlots = (body) => { const s = new Set(); for (const m of String(body || "").matchAll(/\{\{(\d+)\}\}/g)) s.add(Number(m[1])); return [...s].sort((a, b) => a - b); };
const tcRender = (body, values) => String(body || "").replace(/\{\{(\d+)\}\}/g, (m, n) => (values[Number(n) - 1] || m));

// The message as the customer will see it: the business's name above, the
// words, the footer under — the way WhatsApp draws a template. One
// component for the Broadcasts composer, the playbook composer and here.
const WaBubble = ({ from, body, footer }) => (
  <div className="wa-bubble" data-testid="wa-bubble">
    {from ? <div className="wa-bubble-from">{from}</div> : null}
    <div className="wa-bubble-body">{body}</div>
    {footer ? <div className="wa-bubble-foot">{footer}</div> : null}
    <div className="wa-bubble-time">now</div>
  </div>
);

// What happened to the starter set, in one line.
const starterWords = (d) => {
  const parts = [];
  if (d.submitted) parts.push(`${d.submitted} submitted to WhatsApp for review — usually approved within minutes`);
  if (d.synced) parts.push(`${d.synced} already on your number's account, now here`);
  if (d.existing) parts.push(`${d.existing} already on file`);
  if (d.failed) parts.push(`${d.failed} could not be added${d.results ? ": " + d.results.filter((r) => r.status === "failed").map((r) => `${r.title} (${r.detail || "no reason given"})`).join("; ") : ""}`);
  return parts.length ? parts.join(" · ") : "Nothing to add";
};

const TemplateComposer = ({ onDone, onCancel, businessName = "" }) => {
  const [brief, setBrief] = React.useState("");
  const [category, setCategory] = React.useState("marketing");
  const [language, setLanguage] = React.useState("en_US");
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [footer, setFooter] = React.useState("");
  const [examples, setExamples] = React.useState([]);
  const [labels, setLabels] = React.useState([]);
  const [warnings, setWarnings] = React.useState([]);
  const [drafting, setDrafting] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  // Who may draft or submit: the role store's answer, View-as included.
  const canEdit = !!(window.canDo && window.canDo("approve"));
  const slots = tcSlots(body);
  const exampleFor = (i) => examples[i] || "";
  const preview = tcRender(body, slots.map((n, i) => exampleFor(i)));
  const ready = !!name.trim() && !!body.trim() && slots.every((n, i) => !!exampleFor(i).trim()) && !submitting;

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
  const submit = async () => {
    if (!window.__templates || !ready || !canEdit) return;
    setSubmitting(true); setError(null);
    const r = await window.__templates.create({ name: name.trim(), language, category, body, footer: footer.trim() || null, examples: slots.map((n, i) => exampleFor(i).trim()), labels: slots.map((n, i) => (labels[i] || "").trim()) });
    setSubmitting(false);
    if (!r.ok) { setError(r.message || "WhatsApp did not accept it."); return; }
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
    setWarnings([]);
    setError(null);
  };

  return (
    <section className="ct-section tpl-composer" data-testid="tpl-composer">
      <div className="ct-sec-head">
        <span className="ct-sec-title">New template</span>
        <span className="ct-sec-meta">WhatsApp reviews it before it can be sent — usually minutes, sometimes a day</span>
        {onCancel && <button className="cl-bucket-link" onClick={onCancel}>Close</button>}
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
          <select className="tpl-select" value={language} onChange={(e) => setLanguage(e.target.value)} data-testid="tpl-language">
            {TC_LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <button className="btn btn-sm" disabled={drafting || brief.trim().length < 4} onClick={draft} data-testid="tpl-draft" {...(window.gate ? window.gate("approve", "draft a template") : {})}>
            <Icon name="sparkle" size={11} /> {drafting ? "Drafting…" : "Draft with Chanlytics"}
          </button>
        </div>
      </div>
      <div className="tpl-fields">
        <label className="bc-var"><span className="bc-var-label">Name (lowercase, underscores)</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="spring_offer" data-testid="tpl-name" /></label>
        <label className="bc-var tpl-body"><span className="bc-var-label">Message — values as {"{{1}}"}, {"{{2}}"} in order</span><textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} data-testid="tpl-body" /></label>
        <label className="bc-var"><span className="bc-var-label">Footer (optional)</span><input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder={category === "marketing" ? "Reply STOP to opt out" : ""} data-testid="tpl-footer" /></label>
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
      {body && <div className="bc-preview-wrap" data-testid="tpl-preview"><WaBubble from={businessName} body={preview} footer={footer} /></div>}
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
window.WaBubble = WaBubble;
window.starterWords = starterWords;
