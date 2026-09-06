/* global React, Icon */
// A template written here: drafted with the assistant in the business's
// voice, checked against WhatsApp's rules before it leaves, submitted to
// Meta for review, and tracked to approval by the webhook. Rendered on the
// Broadcasts page and in Settings › Message templates; one component,
// published as window.TemplateComposer. Nothing here sends a message.

const TC_LANGS = [
  { id: "en_US", label: "English (US)" }, { id: "en", label: "English" }, { id: "es", label: "Spanish" },
  { id: "es_MX", label: "Spanish (Mexico)" }, { id: "es_ES", label: "Spanish (Spain)" }, { id: "pt_BR", label: "Portuguese (Brazil)" },
];
const TC_SOURCES = { text: "Type it", first_name: "Their first name", business_name: "The business name", booking_link: "The booking link" };
const tcSlots = (body) => { const s = new Set(); for (const m of String(body || "").matchAll(/\{\{(\d+)\}\}/g)) s.add(Number(m[1])); return [...s].sort((a, b) => a - b); };
const tcRender = (body, values) => String(body || "").replace(/\{\{(\d+)\}\}/g, (m, n) => (values[Number(n) - 1] || m));

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
  const canEdit = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  const slots = tcSlots(body);
  const exampleFor = (i) => examples[i] || "";
  const preview = tcRender(body, slots.map((n, i) => exampleFor(i)));
  const ready = !!name.trim() && !!body.trim() && slots.every((n, i) => !!exampleFor(i).trim()) && !submitting;

  const draft = async () => {
    if (!window.__templates || drafting || brief.trim().length < 4) return;
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
    if (!window.__templates || !ready) return;
    setSubmitting(true); setError(null);
    const r = await window.__templates.create({ name: name.trim(), language, category, body, footer: footer.trim() || null, examples: slots.map((n, i) => exampleFor(i).trim()) });
    setSubmitting(false);
    if (!r.ok) { setError(r.message || "WhatsApp did not accept it."); return; }
    if (onDone) onDone(r.data);
  };

  return (
    <section className="ct-section tpl-composer" data-testid="tpl-composer">
      <div className="ct-sec-head">
        <span className="ct-sec-title">New template</span>
        <span className="ct-sec-meta">WhatsApp reviews it before it can be sent — usually minutes, sometimes a day</span>
        {onCancel && <button className="cl-bucket-link" onClick={onCancel}>Close</button>}
      </div>
      <div className="tpl-row">
        <span className="bc-row-label">Say</span>
        <textarea className="tpl-brief" rows={2} value={brief} placeholder="What do you want to tell customers? e.g. 20% off balayage this week for regulars, book by Friday" onChange={(e) => setBrief(e.target.value)} data-testid="tpl-brief" />
      </div>
      <div className="tpl-row">
        <span className="bc-row-label">Kind</span>
        <div className="bc-chips">
          <button className={"bc-chip" + (category === "marketing" ? " active" : "")} onClick={() => setCategory("marketing")} title="An offer, news or an invitation — needs the customer's yes">Marketing</button>
          <button className={"bc-chip" + (category === "utility" ? " active" : "")} onClick={() => setCategory("utility")} title="A notice about their own booking or account — no promotional words">Utility</button>
          <select className="tpl-select" value={language} onChange={(e) => setLanguage(e.target.value)} data-testid="tpl-language">
            {TC_LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <button className="btn btn-sm" disabled={drafting || brief.trim().length < 4 || !canEdit} onClick={draft} data-testid="tpl-draft">
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
      {body && <div className="bc-preview" data-testid="tpl-preview">{preview}{footer ? <span className="dim">{"\n" + footer}</span> : null}</div>}
      {warnings.length > 0 && <div className="bc-excl-hint" data-testid="tpl-warnings">{warnings.join(" ")}</div>}
      {error && <div className="bc-excl-hint" style={{ color: "var(--danger)" }} data-testid="tpl-error">{error}</div>}
      <div className="bc-actions">
        <span className="bc-excl-hint">The words are yours; WhatsApp approves them. {businessName ? `Sent as ${businessName}.` : ""}</span>
        <span className="bc-actions-spacer" />
        <button className="btn btn-primary btn-sm" disabled={!ready || !canEdit} onClick={submit} data-testid="tpl-submit">{submitting ? "Submitting…" : "Submit to WhatsApp"}</button>
      </div>
      {!canEdit && <div className="bc-excl-hint">Only an owner or operator can submit a template.</div>}
    </section>
  );
};

window.TemplateComposer = TemplateComposer;
window.TC_SOURCES = TC_SOURCES;
