/* global React, Icon */
// The palette at rest and while typing: the sections (Right now, Ask, Act,
// Jump to, Recent), the rows, and the quick answer that needs no model.
// Pure of state: buildAskSections turns what the bridge holds into rows,
// AskRows draws them. Published as window.AskHome.

const ahAgo = (ms) => {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
};

const ahJumpIcon = (kind) => (kind === "person" ? "users" : kind === "thread" ? "inbox" : kind === "call" ? "phone" : "arrow-right");

// Rows for the query as typed, or the home sections when nothing is typed.
// Every row carries what activating it does: a route, words to send, words
// to finish in the input, or a thread to open.
const buildAskSections = ({ A, t, lang, query, surface, scope, threads }) => {
  const q = query.trim();
  const sections = [];
  if (q) {
    const fp = A.fast(q);
    sections.push({ key: "fb", items: [{ type: "ask", icon: "sparkle", label: t.askRow(q), sub: fp ? t.instant : t.askSub, q }] });
    const jumps = A.jump(q);
    if (jumps.length) sections.push({ key: "jump", label: t.jump, items: jumps.map((j) => ({ type: "jump", icon: ahJumpIcon(j.kind), label: j.label, sub: j.sub, meta: j.kind, to: j.to })) });
    const hits = A.suggestions(surface, scope, lang).filter((s) => (s.label || s.q).toLowerCase().includes(q.toLowerCase()));
    if (hits.length) sections.push({ key: "sug", label: t.ask, items: hits.map((s) => ({ type: s.kind === "act" ? "act" : "ask", icon: s.icon, label: s.label || s.q, q: s.q, compose: s.compose, meta: s.kind === "act" ? t.tagCard : undefined })) });
    return sections;
  }
  const now = A.rightNow().slice(0, 4);
  if (now.length) sections.push({ key: "now", label: t.now, items: now.map((n) => ({ type: "now", icon: n.icon || "inbox", label: n.title, sub: n.message, to: n.to })) });
  const all = A.suggestions(surface, scope, lang);
  sections.push({ key: "ask", label: t.ask, items: all.filter((s) => s.kind !== "act").map((s) => ({ type: "ask", icon: s.icon, label: s.q, q: s.q, fast: s.fast })) });
  const acts = all.filter((s) => s.kind === "act");
  if (acts.length) sections.push({ key: "act", label: t.act, items: acts.map((s) => ({ type: "act", icon: s.icon, label: s.label || s.q, q: s.q, compose: s.compose, meta: t.tagCard })) });
  if (threads.length) sections.push({ key: "recent", label: t.recent, items: threads.slice(0, 6).map((th) => ({ type: "thread", icon: "sparkle", label: th.title, sub: ahAgo(th.lastAtMs), th })) });
  return sections;
};

// A quick answer: no model, no thread. Openings come from the calendar route.
const AskFast = ({ fast, t, onNav, speech, lang }) => {
  if (!fast) return null;
  return (
    <div className="ask-fast" data-testid="ask-fast">
      <div className="ask-fast-q">{fast.q}</div>
      <div className="ask-fast-a">{fast.text}</div>
      {fast.days && fast.days.length ? (
        <div className="ask-fast-days">
          {fast.days.map((d) => <div key={d.key}><b>{d.label}</b> {d.windows.join(" · ")}</div>)}
        </div>
      ) : null}
      {(fast.links || []).length ? (
        <div className="ask-msg-links">
          {fast.links.map((l, i) => <button key={i} className="ask-link-chip" onClick={() => onNav(l.to)}>{l.label} <Icon name="arrow-right" size={10} /></button>)}
        </div>
      ) : null}
      {speech.canSpeak && !fast.pending && (
        <div className="ask-tools always">
          <button type="button" className={`ask-tool ${speech.speakingId === "fast" ? "on" : ""}`} onClick={() => speech.toggle("fast", fast.text, lang)} title={speech.speakingId === "fast" ? t.stop : t.read} aria-label={t.read}>
            <Icon name={speech.speakingId === "fast" ? "pause" : "headphones"} size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

const AskRows = ({ sections, sel, setSel, onActivate, onDelete, t }) => {
  const flat = [];
  sections.forEach((sec) => sec.items.forEach((it) => { it._i = flat.length; flat.push(it); }));
  if (!flat.length) return <div className="cmd-empty">{t.empty}</div>;
  return sections.map((sec) => (
    <React.Fragment key={sec.key}>
      {sec.label && <div className="cmd-sec-label">{sec.label}</div>}
      {sec.items.map((it) => (
        <button key={it._i} className={`cmd-row ${it.type} ${it._i === sel ? "sel" : ""}`} onMouseMove={() => setSel(it._i)} onClick={() => onActivate(it)} data-testid={`ask-row-${it.type}`}>
          <span className="cmd-row-ic"><Icon name={it.icon} size={12} /></span>
          <span className="cmd-row-main">
            <span className="cmd-row-label">{it.label}</span>
            {it.sub && <span className="cmd-row-sub">{it.sub}</span>}
          </span>
          {it.fast && <span className="cmd-row-kind">{t.instant}</span>}
          {it.meta && <span className="cmd-row-kind">{it.meta}</span>}
          {it.type === "thread" && <span className="cmd-row-del" role="button" tabIndex={-1} aria-label={t.deleteThread} onClick={(e) => { e.stopPropagation(); onDelete(it.th); }}><Icon name="x" size={10} /></span>}
          <Icon name="arrow-right" size={12} className="cmd-row-arrow" />
        </button>
      ))}
    </React.Fragment>
  ));
};

// The flat list the keyboard walks, in the order the rows are drawn.
const flatRows = (sections) => sections.flatMap((sec) => sec.items);

window.AskHome = { buildAskSections, AskFast, AskRows, flatRows, ahAgo };
